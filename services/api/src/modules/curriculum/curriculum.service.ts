import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  Subject,
  SchoolStage,
  Grade,
  Textbook,
  Chapter,
  KnowledgePoint,
  KnowledgeField,
  KnowledgeArea,
  KnowledgeMapStats,
  LearningPathStep,
  LearningPathResult,
} from './curriculum.types';

/**
 * curriculum 切片：K12 课程体系只读门面（本体驱动的领域对齐）。
 *
 * 数据真源：packages/ontology/ontologies/k12-curriculum.ontology.yaml → 六表（迁移 012）。
 * edu.knowledge_points 为 37 片工具链共用的数据真源（本门面只读，status=published 过滤）。
 * 目录端点走白名单游客可见；写（审核动作）由 review 端点承载（auth + 管理员）。
 */
@Injectable()
export class CurriculumService {
  constructor(private readonly db: DatabaseService) {}

  /** 学科清单（目录公开信息；状态机词表 active→published 已归一，见 013）。 */
  async listSubjects(): Promise<Subject[]> {
    const res = await this.db.query(
      `SELECT id, code, name, domain, sort_order, status
         FROM ontology.subject
        WHERE status = 'active' OR status = 'published'
        ORDER BY sort_order NULLS LAST, code`,
    );
    return res.rows as Subject[];
  }

  /** 年级按学段分组（?stage= 过滤）。 */
  async listGrades(stage?: string): Promise<(Grade & { stage: SchoolStage })[]> {
    const res = await this.db.query(
      `SELECT g.id, g.code, g.name, g.sort_order, g.stage_id,
              st.code AS stage_code, st.name AS stage_name, st.sort_order AS stage_sort
         FROM ontology.grade g
         JOIN ontology.school_stage st ON st.id = g.stage_id
        WHERE ($1::varchar IS NULL OR st.code = $1::varchar)
        ORDER BY st.sort_order NULLS LAST, g.sort_order NULLS LAST`,
      [stage ?? null],
    );
    return res.rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      sort_order: r.sort_order,
      stage_id: r.stage_id,
      stage_code: r.stage_code,
      stage_name: r.stage_name,
      stage: { id: r.stage_id, code: r.stage_code, name: r.stage_name, sort_order: r.stage_sort },
    }));
  }

  /** 教材清单（?subject=&grade= 过滤，目录公开信息）。 */
  async listTextbooks(subject?: string, grade?: string): Promise<Textbook[]> {
    const res = await this.db.query(
      `SELECT t.id, t.code, t.name, t.version, t.publisher, t.status, t.subject_id, t.grade_id,
              s.code AS subject_code, g.code AS grade_code
         FROM ontology.textbook t
         LEFT JOIN ontology.subject s ON s.id = t.subject_id
         LEFT JOIN ontology.grade g ON g.id = t.grade_id
        WHERE (t.status = 'published' OR t.status = 'active')
          AND ($1::varchar IS NULL OR LOWER(s.code) = LOWER($1::varchar))
          AND ($2::varchar IS NULL OR g.code = $2::varchar)
        ORDER BY t.code`,
      [subject ?? null, grade ?? null],
    );
    return res.rows as Textbook[];
  }

  /** 章节树（?textbookId= 或 ?textbook= code）。 */
  async listChapters(textbookId?: string, textbookCode?: string): Promise<Chapter[]> {
    const id =
      textbookId ??
      (
        await this.db.query(`SELECT id FROM ontology.textbook WHERE code = $1`, [
          textbookCode ?? '',
        ])
      ).rows[0]?.id;
    if (!id) return [];
    const res = await this.db.query(
      `SELECT id, code, name, sort_order, textbook_id, parent_id
         FROM ontology.textbook_chapter
        WHERE textbook_id = $1
        ORDER BY sort_order NULLS LAST, code`,
      [id],
    );
    // 平铺行 → 树（parent 自引用）
    const byId = new Map<string, Chapter>();
    for (const r of res.rows as Chapter[]) byId.set(r.id, { ...r, children: [] });
    const roots: Chapter[] = [];
    for (const ch of byId.values()) {
      if (ch.parent_id && byId.has(ch.parent_id)) byId.get(ch.parent_id)!.children!.push(ch);
      else roots.push(ch);
    }
    return roots;
  }

  /** 知识点列表（subject/gradeLevel/chapterId 过滤；status=published 过滤；含前置依赖）。 */
  async listKnowledgePoints(
    subject?: string,
    gradeLevel?: number,
    chapterId?: string,
    includeAllStatus = false,
  ): Promise<KnowledgePoint[]> {
    const res = await this.db.query(
      `SELECT kp.id, kp.code, kp.name, kp.description, kp.subject, kp.grade_level,
              kp.chapter_id, c.name AS chapter_name, kp.status,
              COALESCE(
                (SELECT json_agg(pre.code ORDER BY pre.code)
                   FROM ontology.kp_prerequisite pr
                   JOIN edu.knowledge_points pre ON pre.id = pr.to_kp
                  WHERE pr.from_kp = kp.id AND pre.code IS NOT NULL),
                '[]'::json
              ) AS prerequisites
         FROM edu.knowledge_points kp
         LEFT JOIN ontology.textbook_chapter c ON c.id = kp.chapter_id
        WHERE ($1::varchar IS NULL OR LOWER(kp.subject) = LOWER($1::varchar))
          AND ($2::int IS NULL OR kp.grade_level = $2::int)
          AND ($3::uuid IS NULL OR kp.chapter_id = $3::uuid)
          AND ($4 OR kp.status = 'published' OR kp.status IS NULL)
        ORDER BY c.sort_order NULLS LAST, kp.code NULLS LAST, kp.name`,
      [subject ?? null, gradeLevel ?? null, chapterId ?? null, includeAllStatus],
    );
    return res.rows as KnowledgePoint[];
  }

  /**
   * 知识图谱（章节树 + KP + 个人掌握度叠加；auth 请求时带 userId）。
   * 返回 { nodes, edges }：nodes = 章节 + 知识点（type 区分），edges = 父子/归属/前置。
   */
  async knowledgeGraph(subject?: string, gradeLevel?: number, userId?: string) {
    const chapters = await this.db.query(
      `SELECT c.id, c.code, c.name, c.sort_order, c.parent_id, c.textbook_id
         FROM ontology.textbook_chapter c
         JOIN ontology.textbook t ON t.id = c.textbook_id
         LEFT JOIN ontology.grade g ON g.id = t.grade_id
         LEFT JOIN ontology.subject s ON s.id = t.subject_id
        WHERE ($1::varchar IS NULL OR s.code = $1::varchar)
          AND ($2::int IS NULL OR g.code = $2::varchar OR g.sort_order = $2::int)
        ORDER BY c.sort_order NULLS LAST, c.code`,
      [subject ?? null, gradeLevel ?? null],
    );
    // 该范围章节下的知识点（published）+ 个人掌握度叠加
    const kps = await this.db.query(
      `SELECT kp.id, kp.code, kp.name, kp.description, kp.subject, kp.grade_level,
              kp.chapter_id, kp.status,
              ${userId ? `ms.mastery_score AS mastery` : 'NULL::numeric AS mastery'}
         FROM edu.knowledge_points kp
         LEFT JOIN ontology.textbook_chapter c ON c.id = kp.chapter_id
         ${userId ? `LEFT JOIN edu.mastery_snapshots ms ON ms.knowledge_point_id = kp.id AND ms.user_id = $3` : ''}
        WHERE ($1::varchar IS NULL OR LOWER(kp.subject) = LOWER($1::varchar))
          AND ($2::int IS NULL OR kp.grade_level = $2::int)
          AND c.id IS NOT NULL
          AND (kp.status = 'published' OR kp.status IS NULL)
        ORDER BY kp.code NULLS LAST`,
      userId ? [subject ?? null, gradeLevel ?? null, userId] : [subject ?? null, gradeLevel ?? null],
    );
    // 前置依赖边
    const pres = await this.db.query(
      `SELECT pr.from_kp, pr.to_kp
         FROM ontology.kp_prerequisite pr`,
    );

    const nodes = [
      ...chapters.rows.map((c) => ({
        id: c.id,
        type: 'chapter' as const,
        code: c.code,
        label: c.name,
        name: c.name,
        parentId: c.parent_id,
        textbookId: c.textbook_id,
      })),
      ...kps.rows.map((k) => ({
        id: k.id,
        type: 'knowledge-point' as const,
        code: k.code,
        label: k.name,
        name: k.name,
        description: k.description,
        subject: k.subject,
        gradeLevel: k.grade_level,
        chapterId: k.chapter_id,
        status: k.status,
        mastery: k.mastery != null ? Number(k.mastery) : undefined,
      })),
    ];
    const edges = [
      // 章节父子 + KP 归属章节
      ...chapters.rows
        .filter((c) => c.parent_id)
        .map((c) => ({ source: c.parent_id, target: c.id, relation: 'parent-of' as const })),
      ...kps.rows
        .filter((k) => k.chapter_id)
        .map((k) => ({ source: k.chapter_id, target: k.id, relation: 'has-kp' as const })),
      // 前置依赖（同范围 KP 之间的边才有意义）
      ...pres.rows
        .filter((p) => kps.rows.some((k) => k.id === p.from_kp) && kps.rows.some((k) => k.id === p.to_kp))
        .map((p) => ({ source: p.to_kp, target: p.from_kp, relation: 'prerequisite-of' as const })),
    ];
    return { nodes, edges };
  }

  /**
   * 学科知识版图（0.4.0 版图层）：领域 → 知识域两级树 + 前置 DAG + 覆盖比重。
   * 匿名出结构；登录（userId）叠加各知识域掌握度均值（mastery_snapshots 按 subject+grade 聚合，
   * 无数据显示空）——镜像 knowledge-graph 的 OptionalAuth 先例。
   * 比重口径（诚实方法论）：coverageRatio = k12 节点数 / (k12 + frontier)，节点粒度近似值。
   */
  async knowledgeMap(subject: string, userId?: string) {
    const subjectRow = (
      await this.db.query(
        `SELECT id, code, name FROM ontology.subject WHERE LOWER(code) = LOWER($1)`,
        [subject],
      )
    ).rows[0];
    if (!subjectRow) throw new NotFoundException(`学科不存在：${subject}`);

    // 版图节点（status=published；archived 不出——真源对齐语义）
    const areas = await this.db.query(
      `SELECT ka.id, ka.code, ka.name, ka.description, ka.scope, ka.grade_level, ka.parent_id
         FROM ontology.knowledge_area ka
        WHERE ka.subject_id = $1 AND ka.status = 'published'
        ORDER BY ka.scope, ka.grade_level NULLS LAST, ka.sort_order NULLS LAST, ka.code`,
      [subjectRow.id],
    );
    // 前置边（同图内）
    const pres = await this.db.query(
      `SELECT af.code AS from_code, at_.code AS to_code
         FROM ontology.area_prerequisite apr
         JOIN ontology.knowledge_area af ON af.id = apr.from_area
         JOIN ontology.knowledge_area at_ ON at_.id = apr.to_area
        WHERE af.subject_id = $1`,
      [subjectRow.id],
    );
    // 知识点数（各知识域锚定的 KP 数——题库层衔接可见锚点）
    const kpCounts = await this.db.query(
      `SELECT kp.grade_level, COUNT(*)::int AS n
         FROM edu.knowledge_points kp
        WHERE LOWER(kp.subject) = LOWER($1) AND kp.status = 'published'
        GROUP BY kp.grade_level`,
      [subjectRow.code],
    );
    // 个人掌握度叠加（按年级聚合均值；知识域落位年级即掌握度落点）
    const masteryByGrade = new Map<number, number>();
    if (userId) {
      const ms = await this.db.query(
        `SELECT kp.grade_level, AVG(ms.mastery_score) AS avg_mastery
           FROM edu.mastery_snapshots ms
           JOIN edu.knowledge_points kp ON kp.id = ms.knowledge_point_id
          WHERE ms.user_id = $1 AND LOWER(kp.subject) = LOWER($2)
          GROUP BY kp.grade_level`,
        [userId, subjectRow.code],
      );
      for (const r of ms.rows) {
        if (r.grade_level != null) masteryByGrade.set(Number(r.grade_level), Number(r.avg_mastery));
      }
    }
    const kpCountByGrade = new Map<number, number>();
    for (const r of kpCounts.rows) {
      if (r.grade_level != null) kpCountByGrade.set(Number(r.grade_level), Number(r.n));
    }

    // 领域（f.*，parent 为空）→ 知识域（a.*，parent 指向领域）两级树
    const byId = new Map<string, { row: any; fieldCode?: string }>();
    const fields: KnowledgeField[] = [];
    const areaList: KnowledgeArea[] = [];
    for (const r of areas.rows) {
      if (r.code.includes('.map.f.')) {
        fields.push({
          id: r.id,
          code: r.code,
          name: r.name,
          description: r.description,
        });
      }
    }
    const fieldIdToCode = new Map<string, string>();
    for (const f of fields) fieldIdToCode.set(f.id, f.code);
    const preByTo = new Map<string, string[]>();
    for (const p of pres.rows) {
      if (!preByTo.has(p.to_code)) preByTo.set(p.to_code, []);
      preByTo.get(p.to_code)!.push(p.from_code);
    }
    for (const r of areas.rows) {
      if (!r.code.includes('.map.a.')) continue;
      const fieldCode = r.parent_id ? fieldIdToCode.get(r.parent_id) : undefined;
      const gl = r.grade_level != null ? Number(r.grade_level) : null;
      areaList.push({
        id: r.id,
        code: r.code,
        fieldCode: fieldCode ?? '',
        name: r.name,
        description: r.description,
        scope: r.scope,
        gradeLevel: gl,
        mastery: userId && gl != null ? masteryByGrade.get(gl) : undefined,
        kpCount: gl != null ? kpCountByGrade.get(gl) ?? 0 : 0,
        prerequisites: preByTo.get(r.code) ?? [],
      });
    }

    // 统计（诚实口径：节点粒度近似值；byGrade G1–G12 全键列出，无节点为 0）
    const k12Areas = areaList.filter((a) => a.scope === 'k12');
    const frontierAreas = areaList.filter((a) => a.scope === 'frontier');
    const total = areaList.length;
    const byGrade: Record<string, number> = {};
    for (let g = 1; g <= 12; g++) byGrade[String(g)] = 0;
    for (const a of k12Areas) {
      if (a.gradeLevel != null) byGrade[String(a.gradeLevel)] += 1;
    }
    const stats: KnowledgeMapStats = {
      total,
      k12: k12Areas.length,
      frontier: frontierAreas.length,
      coverageRatio: total > 0 ? Number((k12Areas.length / total).toFixed(4)) : 0,
      byGrade,
    };
    return {
      subject: { code: subjectRow.code, name: subjectRow.name },
      fields,
      areas: areaList,
      stats,
    };
  }

  /**
   * 学习路径（对齐知序图谱的「目标驱动先修路径」）：目标知识点的**全先修闭包**，
   * 递归 CTE 求祖先（先修 DAG，含环安全）→ TS 端 Kahn 拓扑排序去重（先修在前、目标在后）。
   * 匿名出结构；登录（userId）叠加各步骤 mastery_snapshots 掌握度（0–100）。
   * 独立于 knowledge-graph 的年级作用域：路径常跨年级，故单独端点。
   */
  async learningPath(goalId: string, userId?: string): Promise<LearningPathResult> {
    const goalRes = await this.db.query(
      `SELECT kp.id, kp.name, kp.subject, kp.grade_level
         FROM edu.knowledge_points kp
        WHERE kp.id = $1`,
      [goalId],
    );
    if (goalRes.rows.length === 0) throw new NotFoundException('知识点不存在');
    const goalRow = goalRes.rows[0];

    // 先修闭包：from_kp 依赖 to_kp（from_kp=学习者，to_kp=先修）；path 数组防环。
    const closureRes = await this.db.query(
      `WITH RECURSIVE anc(id, depth, path) AS (
         SELECT kp.id, 0, ARRAY[kp.id]::uuid[]
           FROM edu.knowledge_points kp
          WHERE kp.id = $1
         UNION ALL
         SELECT pr.to_kp, a.depth + 1, a.path || pr.to_kp
           FROM ontology.kp_prerequisite pr
           JOIN anc a ON pr.from_kp = a.id
          WHERE a.depth < 50 AND NOT pr.to_kp = ANY(a.path)
       )
       SELECT kp.id, kp.code, kp.name, kp.description, kp.subject, kp.grade_level,
              c.name AS chapter_name, MIN(a.depth) AS depth
         FROM anc a
         JOIN edu.knowledge_points kp ON kp.id = a.id
         LEFT JOIN ontology.textbook_chapter c ON c.id = kp.chapter_id
        GROUP BY kp.id, kp.code, kp.name, kp.description, kp.subject, kp.grade_level, c.name`,
      [goalId],
    );
    const rows = closureRes.rows as Array<Record<string, any>>;
    const ids = rows.map((r) => r.id);

    // 闭包内先修边（用于拓扑排序；方向：from_kp 依赖 to_kp）
    const edgeRes = await this.db.query(
      `SELECT pr.from_kp, pr.to_kp
         FROM ontology.kp_prerequisite pr
        WHERE pr.from_kp = ANY($1::uuid[]) AND pr.to_kp = ANY($1::uuid[])`,
      [ids],
    );

    // 个人掌握度叠加（仅登录）
    const mastery = new Map<string, number>();
    if (userId) {
      const msRes = await this.db.query(
        `SELECT knowledge_point_id, mastery_score
           FROM edu.mastery_snapshots
          WHERE user_id = $1 AND knowledge_point_id = ANY($2::uuid[])`,
        [userId, ids],
      );
      for (const r of msRes.rows as Array<Record<string, any>>) {
        mastery.set(r.knowledge_point_id, Number(r.mastery_score));
      }
    }

    const order = this.topoSortPrereqs(rows, edgeRes.rows as Array<Record<string, any>>);
    const byId = new Map(rows.map((r) => [r.id as string, r]));
    const steps: LearningPathStep[] = order.map((id, i) => {
      const r = byId.get(id)!;
      const step: LearningPathStep = {
        id: r.id,
        code: r.code ?? null,
        name: r.name,
        description: r.description ?? null,
        subject: r.subject ?? null,
        gradeLevel: r.grade_level != null ? Number(r.grade_level) : null,
        chapterName: r.chapter_name ?? null,
        order: i,
        depth: r.depth != null ? Number(r.depth) : 0,
        isGoal: r.id === goalId,
      };
      if (mastery.has(r.id)) step.mastery = mastery.get(r.id);
      return step;
    });

    return {
      goal: {
        id: goalRow.id,
        name: goalRow.name,
        subject: goalRow.subject ?? null,
        gradeLevel: goalRow.grade_level != null ? Number(goalRow.grade_level) : null,
      },
      steps,
    };
  }

  /**
   * Kahn 拓扑排序：先修在前、依赖方在后。indeg = 节点在闭包内的先修数；
   * ready 队列按 (grade_level, code, id) 确定性排序（稳定输出）；纯环残留按同序追加，绝不丢节点。
   */
  private topoSortPrereqs(
    rows: Array<Record<string, any>>,
    edges: Array<Record<string, any>>,
  ): string[] {
    const byId = new Map(rows.map((r) => [r.id as string, r]));
    const indeg = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const r of rows) {
      indeg.set(r.id, 0);
      dependents.set(r.id, []);
    }
    for (const e of edges) {
      if (!byId.has(e.from_kp) || !byId.has(e.to_kp)) continue;
      // to_kp 是 from_kp 的先修
      indeg.set(e.from_kp, (indeg.get(e.from_kp) ?? 0) + 1);
      dependents.get(e.to_kp)!.push(e.from_kp);
    }
    const compare = (a: string, b: string) => {
      const ra = byId.get(a)!;
      const rb = byId.get(b)!;
      const ga = ra.grade_level ?? 999;
      const gb = rb.grade_level ?? 999;
      if (ga !== gb) return ga - gb;
      const ca = (ra.code ?? '') as string;
      const cb = (rb.code ?? '') as string;
      if (ca !== cb) return ca < cb ? -1 : 1;
      return a < b ? -1 : 1;
    };
    const ready = rows
      .filter((r) => (indeg.get(r.id) ?? 0) === 0)
      .map((r) => r.id as string)
      .sort(compare);
    const order: string[] = [];
    const seen = new Set<string>();
    while (ready.length) {
      const id = ready.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
      for (const dep of dependents.get(id) ?? []) {
        const d = (indeg.get(dep) ?? 1) - 1;
        indeg.set(dep, d);
        if (d === 0) ready.push(dep);
      }
      ready.sort(compare);
    }
    // 纯环残留：确定性追加，绝不丢节点
    for (const id of rows.map((r) => r.id as string).sort(compare)) {
      if (!seen.has(id)) {
        seen.add(id);
        order.push(id);
      }
    }
    return order;
  }

  /** 单知识点（含前置依赖与状态）。 */
  async getKnowledgePoint(id: string): Promise<KnowledgePoint> {
    const res = await this.db.query(
      `SELECT kp.id, kp.code, kp.name, kp.description, kp.subject, kp.grade_level,
              kp.chapter_id, c.name AS chapter_name, kp.status,
              COALESCE(
                (SELECT json_agg(pre.code ORDER BY pre.code)
                   FROM ontology.kp_prerequisite pr
                   JOIN edu.knowledge_points pre ON pre.id = pr.to_kp
                  WHERE pr.from_kp = kp.id AND pre.code IS NOT NULL),
                '[]'::json
              ) AS prerequisites
         FROM edu.knowledge_points kp
         LEFT JOIN ontology.textbook_chapter c ON c.id = kp.chapter_id
        WHERE kp.id = $1`,
      [id],
    );
    if (res.rows.length === 0) throw new NotFoundException('知识点不存在');
    return res.rows[0] as KnowledgePoint;
  }

  /**
   * 知识点随堂练习（选择题，含选项/答案/解析）。
   * 公开读：题库为学习材料，同 /tuition/questions 公开语义；仅出选择题（options>=2）。
   */
  async knowledgePointQuestions(id: string, limit = 5) {
    const n = Math.min(Math.max(Number(limit) || 5, 1), 20);
    const res = await this.db.query(
      `SELECT id, content, options, answer, COALESCE(analysis, explanation) AS analysis,
              difficulty, type
         FROM edu.questions
        WHERE knowledge_point_id = $1
          AND options IS NOT NULL AND jsonb_array_length(options) >= 2
        ORDER BY difficulty NULLS FIRST, id
        LIMIT $2`,
      [id, n],
    );
    return res.rows as Array<{
      id: string;
      content: string;
      options: unknown;
      answer: string;
      analysis: string | null;
      difficulty: number | null;
      type: string | null;
    }>;
  }

  /**
   * 审核动作（状态机翻 draft→reviewed→published；reject 回 draft；archive 归档）。
   * 合法迁移校验（状态模式，fail-fast）；非法迁移 400。词表与 YAML stateMachine 对齐（013 CHECK 同源）。
   */
  async reviewKnowledgePoint(id: string, action: 'approve' | 'reject' | 'publish' | 'archive') {
    const TRANSITIONS: Record<string, Record<string, string>> = {
      approve: { draft: 'reviewed', reviewed: 'reviewed', published: 'published', archived: 'archived' },
      publish: { draft: 'published', reviewed: 'published', published: 'published', archived: 'archived' },
      reject: { draft: 'draft', reviewed: 'draft', published: 'draft', archived: 'archived' },
      archive: { draft: 'archived', reviewed: 'archived', published: 'archived', archived: 'archived' },
    };
    const current = (
      await this.db.query(`SELECT status FROM edu.knowledge_points WHERE id = $1`, [id])
    ).rows[0]?.status;
    if (!current) throw new NotFoundException('知识点不存在');
    const next = TRANSITIONS[action]?.[current];
    if (!next) {
      throw new NotFoundException(`非法状态迁移：${current} + ${action}`);
    }
    await this.db.query(`UPDATE edu.knowledge_points SET status = $1 WHERE id = $2`, [next, id]);
    return { id, from: current, to: next };
  }
}
