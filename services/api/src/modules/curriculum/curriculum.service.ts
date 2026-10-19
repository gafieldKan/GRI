import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
  KnowledgeBranchNode,
  SummitBranchesResult,
  SummitBranchRef,
  SummitGradeChapter,
  SummitGradeTextbook,
  SummitGrade,
  SummitStage,
  SummitGradesResult,
  LearningChainResult,
  KpCaveResult,
} from './curriculum.types';
import {
  buildBranchChain,
  buildSoftEdges,
  resolveJsonbPrerequisites,
  type ExplicitLearningEdge,
  type LearningChainSourceRow,
} from './learning-chain';

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

  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  private nodeCodeParent(rows: Array<Record<string, any>>, nodeId: string): string | null {
    return rows.find((row) => row.id === nodeId)?.parent_id ?? null;
  }

  private aggregateMastery(rows: Array<Record<string, any>>): {
    mastery?: number;
  } {
    const stats = rows.reduce(
      (acc, row) => {
        acc.sum += Number(row.mastery_sum ?? 0);
        acc.count += Number(row.mastery_count ?? 0);
        return acc;
      },
      { sum: 0, count: 0 },
    );
    if (stats.count === 0) return {};
    return { mastery: Number((stats.sum / stats.count).toFixed(2)) };
  }

  private collectBranches(rows: Array<Record<string, any>>): SummitBranchRef[] {
    const byId = new Map<string, SummitBranchRef>();
    for (const row of rows) {
      if (row.branch_id == null) continue;
      byId.set(row.branch_id, {
        id: row.branch_id,
        code: row.branch_code,
        name: row.branch_name,
      });
    }
    return [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

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

  /** 维度 A：学科知识体系分支树（匿名出结构，登录叠加分支子树掌握度）。 */
  async summitBranches(subject: string, userId?: string): Promise<SummitBranchesResult> {
    const subjectRow = (
      await this.db.query(
        `SELECT id, code, name FROM ontology.subject WHERE LOWER(code) = LOWER($1)`,
        [subject],
      )
    ).rows[0];
    if (!subjectRow) throw new NotFoundException(`学科不存在：${subject}`);

    // 每个分支聚合完整子树：分支自身 + 全部子分支 → 章 → 已发布知识点。
    // mastery_snapshots 是唯一掌握度真源；匿名传 NULL，不返回 mastery 字段。
    const res = await this.db.query(
      `WITH RECURSIVE branch_tree AS (
         SELECT b.id AS root_id, b.id AS branch_id
           FROM ontology.knowledge_branch b
          WHERE b.subject_id = $1
         UNION ALL
         SELECT bt.root_id, child.id
           FROM branch_tree bt
           JOIN ontology.knowledge_branch child ON child.parent_id = bt.branch_id
       ),
       branch_agg AS (
         SELECT bt.root_id AS branch_id,
                COUNT(DISTINCT kp.id)::int AS kp_count,
                SUM(ms.mastery_score) AS mastery_sum,
                COUNT(ms.mastery_score)::int AS mastery_count
           FROM branch_tree bt
           LEFT JOIN ontology.textbook_chapter c ON c.branch_id = bt.branch_id
           LEFT JOIN edu.knowledge_points kp
             ON kp.chapter_id = c.id
            AND (kp.status = 'published' OR kp.status IS NULL)
           LEFT JOIN edu.mastery_snapshots ms
             ON ms.knowledge_point_id = kp.id
            AND ms.user_id = $2
          GROUP BY bt.root_id
       )
       SELECT b.id, b.code, b.name, b.description, b.clc, b.curriculum,
              b.sort_order, b.parent_id, b.k12_grade_min, b.k12_grade_max,
              COALESCE(a.kp_count, 0)::int AS kp_count,
              a.mastery_sum, COALESCE(a.mastery_count, 0)::int AS mastery_count
         FROM ontology.knowledge_branch b
         LEFT JOIN branch_agg a ON a.branch_id = b.id
        WHERE b.subject_id = $1
        ORDER BY b.sort_order NULLS LAST, b.code`,
      [subjectRow.id, userId ?? null],
    );

    const byId = new Map<string, KnowledgeBranchNode>();
    for (const r of res.rows as Array<Record<string, any>>) {
      const masteryCount = Number(r.mastery_count ?? 0);
      const mastery =
        userId && masteryCount > 0 && r.mastery_sum != null
          ? Number((Number(r.mastery_sum) / masteryCount).toFixed(2))
          : undefined;
      const node: KnowledgeBranchNode = {
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description ?? null,
        clc: r.clc,
        curriculum: r.curriculum ?? null,
        sortOrder: r.sort_order != null ? Number(r.sort_order) : null,
        parentId: r.parent_id ?? null,
        k12GradeMin: r.k12_grade_min != null ? Number(r.k12_grade_min) : null,
        k12GradeMax: r.k12_grade_max != null ? Number(r.k12_grade_max) : null,
        kpCount: Number(r.kp_count ?? 0),
        reached: mastery != null && mastery >= 80,
        isSummit: r.parent_id == null,
        children: [],
      };
      if (mastery != null) node.mastery = mastery;
      byId.set(node.id, node);
    }

    const peaks: KnowledgeBranchNode[] = [];
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
      else if (!node.parentId) peaks.push(node);
    }

    return {
      subject: { id: subjectRow.id, code: subjectRow.code, name: subjectRow.name },
      threshold: 80,
      peaks,
    };
  }

  /** 维度 B：K12 学段→年级→人教版册/章（匿名出结构，登录叠加掌握度）。 */
  async summitGrades(subject: string, userId?: string): Promise<SummitGradesResult> {
    const subjectRow = (
      await this.db.query(
        `SELECT id, code, name FROM ontology.subject WHERE LOWER(code) = LOWER($1)`,
        [subject],
      )
    ).rows[0];
    if (!subjectRow) throw new NotFoundException(`学科不存在：${subject}`);

    const stageRows = await this.db.query(
      `SELECT st.id AS stage_id, st.code AS stage_code, st.name AS stage_name,
              st.sort_order AS stage_sort,
              g.id AS grade_id, g.code AS grade_code, g.name AS grade_name,
              g.sort_order AS grade_sort
         FROM ontology.school_stage st
         JOIN ontology.grade g ON g.stage_id = st.id
         JOIN ontology.textbook t ON t.grade_id = g.id
         JOIN ontology.subject s ON s.id = t.subject_id
        WHERE LOWER(s.code) = LOWER($1)
          AND (t.status = 'published' OR t.status = 'active')
         GROUP BY st.id, st.code, st.name, st.sort_order, g.id, g.code, g.name, g.sort_order
        ORDER BY st.sort_order NULLS LAST, g.sort_order NULLS LAST`,
      [subjectRow.code],
    );
    const textbookRows = await this.db.query(
      `SELECT t.id, t.code, t.name, g.code AS grade_code, s.code AS subject_code
         FROM ontology.textbook t
         JOIN ontology.grade g ON g.id = t.grade_id
         JOIN ontology.subject s ON s.id = t.subject_id
        WHERE LOWER(s.code) = LOWER($1)
          AND (t.status = 'published' OR t.status = 'active')
        ORDER BY g.sort_order NULLS LAST, t.code`,
      [subjectRow.code],
    );
    const chapterRows = await this.db.query(
      `SELECT c.id, c.code, c.name, c.sort_order, c.textbook_id, c.parent_id,
              b.id AS branch_id, b.code AS branch_code, b.name AS branch_name,
              (
                SELECT COUNT(*)::int
                  FROM edu.knowledge_points kp
                 WHERE kp.chapter_id = c.id
                   AND (kp.status = 'published' OR kp.status IS NULL)
              ) AS kp_count,
              (
                SELECT SUM(ms.mastery_score)
                  FROM edu.mastery_snapshots ms
                  JOIN edu.knowledge_points kp ON kp.id = ms.knowledge_point_id
                 WHERE kp.chapter_id = c.id
                   AND (kp.status = 'published' OR kp.status IS NULL)
                   AND ms.user_id = $2
              ) AS mastery_sum,
              (
                SELECT COUNT(*)
                  FROM edu.mastery_snapshots ms
                  JOIN edu.knowledge_points kp ON kp.id = ms.knowledge_point_id
                 WHERE kp.chapter_id = c.id
                   AND (kp.status = 'published' OR kp.status IS NULL)
                   AND ms.user_id = $2
              )::int AS mastery_count
         FROM ontology.textbook_chapter c
         JOIN ontology.textbook t ON t.id = c.textbook_id
         JOIN ontology.subject s ON s.id = t.subject_id
         LEFT JOIN ontology.knowledge_branch b ON b.id = c.branch_id
        WHERE LOWER(s.code) = LOWER($1)
        ORDER BY t.code, c.sort_order NULLS LAST, c.code`,
      [subjectRow.code, userId ?? null],
    );

    const chaptersByTextbook = new Map<string, SummitGradeChapter[]>();
    const chapterRowByTextbook = new Map<string, Array<Record<string, any>>>();
    for (const r of chapterRows.rows as Array<Record<string, any>>) {
      if (!chapterRowByTextbook.has(r.textbook_id)) chapterRowByTextbook.set(r.textbook_id, []);
      chapterRowByTextbook.get(r.textbook_id)!.push(r);
    }
    for (const [textbookId, rows] of chapterRowByTextbook) {
      const byId = new Map<string, SummitGradeChapter>();
      for (const r of rows) {
        const masteryCount = Number(r.mastery_count ?? 0);
        const mastery =
          userId && masteryCount > 0 && r.mastery_sum != null
            ? Number((Number(r.mastery_sum) / masteryCount).toFixed(2))
            : undefined;
        const node: SummitGradeChapter = {
          id: r.id,
          code: r.code,
          name: r.name,
          sortOrder: r.sort_order != null ? Number(r.sort_order) : null,
          branch:
            r.branch_id != null
              ? { id: r.branch_id, code: r.branch_code, name: r.branch_name }
              : null,
          kpCount: Number(r.kp_count ?? 0),
          reached: mastery != null && mastery >= 80,
          children: [],
        };
        if (mastery != null) node.mastery = mastery;
        byId.set(node.id, node);
      }
      const roots: SummitGradeChapter[] = [];
      for (const node of byId.values()) {
        const parentId = this.nodeCodeParent(rows, node.id);
        if (parentId && byId.has(parentId)) {
          byId.get(parentId)!.children.push(node);
        } else {
          roots.push(node);
        }
      }
      chaptersByTextbook.set(textbookId, roots);
    }

    const textbooksByGrade = new Map<string, SummitGradeTextbook[]>();
    for (const r of textbookRows.rows as Array<Record<string, any>>) {
      const chapters = chaptersByTextbook.get(r.id) ?? [];
      const flatChapters = chapterRowByTextbook.get(r.id) ?? [];
      const aggregate = userId ? this.aggregateMastery(flatChapters) : {};
      const textbook: SummitGradeTextbook = {
        id: r.id,
        code: r.code,
        name: r.name,
        branches: this.collectBranches(flatChapters),
        kpCount: flatChapters.reduce((n, c) => n + Number(c.kp_count ?? 0), 0),
        reached: aggregate.mastery != null && aggregate.mastery >= 80,
        chapters,
      };
      if (aggregate.mastery != null) textbook.mastery = aggregate.mastery;
      if (!textbooksByGrade.has(r.grade_code)) textbooksByGrade.set(r.grade_code, []);
      textbooksByGrade.get(r.grade_code)!.push(textbook);
    }

    const gradesByStage = new Map<string, SummitGrade[]>();
    const stageMeta = new Map<
      string,
      { id: string; code: string; name: string; sortOrder: number | null }
    >();
    for (const r of stageRows.rows as Array<Record<string, any>>) {
      if (!stageMeta.has(r.stage_id)) {
        stageMeta.set(r.stage_id, {
          id: r.stage_id,
          code: r.stage_code,
          name: r.stage_name,
          sortOrder: r.stage_sort != null ? Number(r.stage_sort) : null,
        });
      }
      if (!gradesByStage.has(r.stage_id)) gradesByStage.set(r.stage_id, []);
      const gradeRows = gradesByStage.get(r.stage_id)!;
      if (gradeRows.some((g) => g.id === r.grade_id)) continue;
      const textbooks = textbooksByGrade.get(r.grade_code) ?? [];
      const flatChapters = textbooks.flatMap((t) => chapterRowByTextbook.get(t.id) ?? []);
      const aggregate = userId ? this.aggregateMastery(flatChapters) : {};
      const grade: SummitGrade = {
        id: r.grade_id,
        code: r.grade_code,
        name: r.grade_name,
        sortOrder: r.grade_sort != null ? Number(r.grade_sort) : null,
        branches: this.collectBranches(flatChapters),
        kpCount: flatChapters.reduce((n, c) => n + Number(c.kp_count ?? 0), 0),
        reached: aggregate.mastery != null && aggregate.mastery >= 80,
        textbooks,
      };
      if (aggregate.mastery != null) grade.mastery = aggregate.mastery;
      gradeRows.push(grade);
    }

    const stages: SummitStage[] = [];
    for (const [stageId, grades] of gradesByStage) {
      const meta = stageMeta.get(stageId)!;
      const chapterRowsForStage = grades.flatMap((g) =>
        g.textbooks.flatMap((t) => chapterRowByTextbook.get(t.id) ?? []),
      );
      const aggregate = userId ? this.aggregateMastery(chapterRowsForStage) : {};
      const stage: SummitStage = {
        ...meta,
        branches: this.collectBranches(chapterRowsForStage),
        kpCount: chapterRowsForStage.reduce((n, c) => n + Number(c.kp_count ?? 0), 0),
        reached: aggregate.mastery != null && aggregate.mastery >= 80,
        grades,
      };
      if (aggregate.mastery != null) stage.mastery = aggregate.mastery;
      stages.push(stage);
    }

    return {
      subject: { id: subjectRow.id, code: subjectRow.code, name: subjectRow.name },
      threshold: 80,
      stages,
    };
  }

  /**
   * W5-a：加载一个受 subject + branch/grade 限定的课程切片。
   * 该查询是学习链与洞窟“下一节”计算的共同底座；始终返回课程结构，
   * 仅登录时 LEFT JOIN mastery_snapshots 叠加个人掌握度。
   */
  private async loadLearningChainSource(
    subjectCode: string,
    branchCode: string | null,
    gradeLevel: number | null,
    userId?: string,
  ): Promise<LearningChainSourceRow[]> {
    const params: unknown[] = [subjectCode, branchCode, gradeLevel];
    const masteryJoin = userId
      ? `LEFT JOIN edu.mastery_snapshots ms
           ON ms.knowledge_point_id = kp.id AND ms.user_id = $4::uuid`
      : '';
    if (userId) params.push(userId);
    const res = await this.db.query(
      `SELECT kp.id AS "kpId", kp.code AS "kpCode", kp.name AS "kpName",
              kp.legacy_id AS "legacyId", kp.prerequisites,
              c.id AS "chapterId", c.code AS "chapterCode", c.name AS "chapterName",
              c.parent_id AS "chapterParentId", c.sort_order AS "chapterSortOrder",
              p.code AS "parentChapterCode", p.name AS "parentChapterName",
              p.sort_order AS "parentChapterSortOrder",
              t.id AS "textbookId", t.code AS "textbookCode",
              NULL::int AS "textbookSortOrder",
              g.id AS "gradeId", g.code AS "gradeCode", g.sort_order AS "gradeSortOrder",
              COALESCE(kp.grade_level, g.sort_order) AS "gradeLevel",
              b.id AS "branchId", b.code AS "branchCode", b.name AS "branchName",
              ${userId ? 'ms.mastery_score' : 'NULL::numeric'} AS "masteryScore"
         FROM edu.knowledge_points kp
         JOIN ontology.subject s ON LOWER(s.code) = LOWER(kp.subject)
         JOIN ontology.textbook_chapter c ON c.id = kp.chapter_id
         LEFT JOIN ontology.textbook_chapter p ON p.id = c.parent_id
         JOIN ontology.textbook t ON t.id = c.textbook_id
         JOIN ontology.grade g ON g.id = t.grade_id
         LEFT JOIN ontology.knowledge_branch b ON b.id = c.branch_id
         ${masteryJoin}
        WHERE LOWER(kp.subject) = LOWER($1)
          AND (kp.status = 'published' OR kp.status IS NULL)
          AND ($2::varchar IS NULL OR b.code = $2::varchar)
          AND ($3::int IS NULL OR COALESCE(kp.grade_level, g.sort_order) = $3::int)
        ORDER BY COALESCE(kp.grade_level, g.sort_order) NULLS LAST, g.sort_order NULLS LAST, t.code,
                 p.sort_order NULLS LAST, c.sort_order NULLS LAST, c.code, kp.code`,
      params,
    );
    return res.rows as LearningChainSourceRow[];
  }

  private dedupeExplicitEdges(edges: ExplicitLearningEdge[]): ExplicitLearningEdge[] {
    const byEndpoints = new Map<string, ExplicitLearningEdge>();
    for (const edge of edges) {
      const key = `${edge.from}\u0000${edge.to}`;
      if (!edge.from || !edge.to || edge.from === edge.to || byEndpoints.has(key)) continue;
      byEndpoints.set(key, edge);
    }
    return [...byEndpoints.values()];
  }

  /**
   * W5-a 学习链：纯服务内派生，不物化 ontology.learning_edge。
   * explicit 来自 canonical kp_prerequisite 与 JSONB 精确引用；seq 由课程序列推导；
   * soft 仅连接同分支跨年级骨架邻点，并在输出中明确标注“引导性、非精确前置”。
   */
  async learningChain(
    subject?: string,
    branch?: string,
    grade?: string,
    userId?: string,
  ): Promise<LearningChainResult> {
    const subjectCode = subject?.trim();
    const branchCode = branch?.trim() || null;
    if (!subjectCode) throw new BadRequestException('subject 必填');
    if (!branchCode && !grade?.trim()) {
      throw new BadRequestException('branch 或 grade 至少提供一个限定条件');
    }

    let gradeLevel: number | null = null;
    if (grade?.trim()) {
      const normalized = grade.trim().replace(/^G/i, '');
      const parsed = Number(normalized);
      if (
        !/^\d+$/.test(normalized) ||
        !Number.isFinite(parsed) ||
        parsed < 1 ||
        parsed > 12
      ) {
        throw new BadRequestException('grade 必须是 G1–G12 或 1–12');
      }
      gradeLevel = parsed;
    }

    const subjectRow = (
      await this.db.query(
        `SELECT id, code, name FROM ontology.subject WHERE LOWER(code) = LOWER($1)`,
        [subjectCode],
      )
    ).rows[0];
    if (!subjectRow) throw new NotFoundException(`学科不存在：${subjectCode}`);

    const source = await this.loadLearningChainSource(
      subjectRow.code,
      branchCode,
      gradeLevel,
      userId,
    );
    const ids = source.map((row) => row.kpId);
    const canonical = ids.length
      ? (
          await this.db.query(
            `SELECT prerequisite.code AS "from", learner.code AS "to",
                    prerequisite.name AS "fromName"
               FROM ontology.kp_prerequisite edge
               JOIN edu.knowledge_points prerequisite ON prerequisite.id = edge.to_kp
               JOIN edu.knowledge_points learner ON learner.id = edge.from_kp
              WHERE edge.from_kp = ANY($1::uuid[])
                AND edge.to_kp = ANY($1::uuid[])`,
            [ids],
          )
        ).rows.map((row: any) => ({
          from: row.from,
          to: row.to,
          reason: `显式前置 ${row.fromName ?? row.from}`,
        }))
      : [];
    const explicit = this.dedupeExplicitEdges([
      ...canonical,
      ...resolveJsonbPrerequisites(source),
    ]);

    const chain = buildBranchChain(source, explicit, { includeMastery: Boolean(userId) });
    const soft = buildSoftEdges(chain.nodes, chain.edges);
    return {
      subject: subjectRow.code,
      branch: branchCode ? (source[0]?.branchCode ?? branchCode) : null,
      nodes: chain.nodes,
      edges: [...chain.edges, ...soft],
      summary: chain.summary,
    };
  }

  /**
   * W5-a 洞窟聚合：一次读取知识点、公开题入口/前置/下一节；
   * 登录时再叠加个人掌握度、未解决错题、到期复习与成就。所有查询只读且有界。
   */
  async kpCave(kpId?: string, userId?: string): Promise<KpCaveResult> {
    const id = kpId?.trim();
    if (!id || !CurriculumService.UUID_RE.test(id)) {
      throw new NotFoundException('知识点不存在');
    }

    const row = (
      await this.db.query(
        `SELECT kp.id, kp.code, kp.name, kp.subject,
                kp.grade_level AS "gradeLevel",
                c.id AS "chapterId", c.code AS "chapterCode", c.name AS "chapterName",
                b.code AS "branchCode", b.name AS "branchName",
                ${userId ? 'ms.mastery_score' : 'NULL::numeric'} AS "masteryScore"
           FROM edu.knowledge_points kp
           LEFT JOIN ontology.textbook_chapter c ON c.id = kp.chapter_id
           LEFT JOIN ontology.knowledge_branch b ON b.id = c.branch_id
           LEFT JOIN edu.mastery_snapshots ms
             ON ms.knowledge_point_id = kp.id AND ms.user_id = $2::uuid
          WHERE kp.id = $1::uuid
            AND (kp.status = 'published' OR kp.status IS NULL)`,
        [id, userId ?? null],
      )
    ).rows[0];
    if (!row) throw new NotFoundException('知识点不存在');

    const prerequisiteRows = await this.db.query(
      `WITH refs AS (
         SELECT DISTINCT ref.value #>> '{}' AS value
           FROM edu.knowledge_points target
           CROSS JOIN LATERAL jsonb_array_elements(
             COALESCE(target.prerequisites, '[]'::jsonb)
           ) AS ref(value)
          WHERE target.id = $1::uuid
            AND jsonb_typeof(ref.value) = 'string'
       ),
       matched AS (
         SELECT matching.id, matching.code, matching.name
           FROM refs
           JOIN LATERAL (
             SELECT kp.id, kp.code, kp.name, COUNT(*) OVER() AS match_count
               FROM edu.knowledge_points kp
              WHERE kp.legacy_id = refs.value OR kp.code = refs.value
           ) matching ON matching.match_count = 1
       ),
       canonical AS (
         SELECT prerequisite.id, prerequisite.code, prerequisite.name
           FROM ontology.kp_prerequisite edge
           JOIN edu.knowledge_points prerequisite ON prerequisite.id = edge.to_kp
          WHERE edge.from_kp = $1::uuid
       )
       SELECT id, code, name FROM canonical
       UNION
       SELECT id, code, name FROM matched`,
      [id],
    );

    const questionRows = await this.db.query(
      `SELECT id, content, options, answer, COALESCE(explanation, analysis) AS analysis,
              difficulty, type, COUNT(*) OVER()::int AS total
         FROM edu.questions
        WHERE knowledge_point_id = $1::uuid
          AND jsonb_typeof(options) = 'array' AND jsonb_array_length(options) >= 2
        ORDER BY difficulty NULLS FIRST, id
        LIMIT $2`,
      [id, 3],
    );
    const questionItems = questionRows.rows.map((question: any) => ({
      id: question.id,
      content: question.content,
      options: question.options,
      answer: question.answer,
      analysis: question.analysis ?? null,
      difficulty: question.difficulty != null ? Number(question.difficulty) : null,
      type: question.type ?? null,
    }));

    const gradeLevel = row.gradeLevel != null ? Number(row.gradeLevel) : null;
    const chainSource = await this.loadLearningChainSource(
      String(row.subject ?? '').toUpperCase(),
      row.branchCode ?? null,
      row.branchCode ? null : gradeLevel,
    );
    const chain = buildBranchChain(chainSource);
    const currentNodeIndex = chain.nodes.findIndex((node) =>
      node.kps.some((kp) => kp.code === row.code),
    );
    const nextNode =
      currentNodeIndex >= 0 && currentNodeIndex + 1 < chain.nodes.length
        ? chain.nodes[currentNodeIndex + 1]
        : null;

    const mastery =
      userId && row.masteryScore != null && Number.isFinite(Number(row.masteryScore))
        ? Number(row.masteryScore)
        : undefined;
    const result: KpCaveResult = {
      kp: {
        id: row.id,
        code: row.code ?? null,
        name: row.name,
        subject: row.subject ?? null,
        gradeLevel,
        chapter:
          row.chapterId != null
            ? { id: row.chapterId, code: row.chapterCode, name: row.chapterName }
            : null,
        branch:
          row.branchCode != null ? { code: row.branchCode, name: row.branchName } : null,
      },
      state: mastery == null ? 'dim' : mastery >= 80 ? 'lit' : 'half',
      prerequisites: prerequisiteRows.rows.map((prerequisite: any) => ({
        id: prerequisite.id,
        code: prerequisite.code,
        name: prerequisite.name,
        kind: 'explicit',
        reason: `显式前置 ${prerequisite.name}`,
      })),
      questions: {
        entry: `/api/curriculum/knowledge-points/${row.id}/questions`,
        total: questionRows.rows.length
          ? Number((questionRows.rows[0] as any).total ?? questionRows.rows.length)
          : 0,
        items: questionItems,
      },
      next: nextNode
        ? {
            code: nextNode.code,
            name: nextNode.name,
            unit: nextNode.unit,
            firstKp: nextNode.kps[0]
              ? { code: nextNode.kps[0].code, name: nextNode.kps[0].name }
              : null,
          }
        : null,
    };
    if (mastery != null) result.mastery = mastery;

    if (userId) {
      const wrongRows = await this.db.query(
        `SELECT wq.id, wq.question_id AS "questionId",
                COALESCE(q.content, wq.question_text) AS content,
                wq.wrong_count AS "wrongCount", wq.last_attempt_at AS "lastAttemptAt",
                COUNT(*) OVER()::int AS total
           FROM edu.wrong_questions wq
           LEFT JOIN edu.questions q ON q.id = wq.question_id
          WHERE wq.user_id = $1::uuid
            AND q.knowledge_point_id = $2::uuid
            AND wq.is_resolved = false
          ORDER BY wq.last_attempt_at DESC NULLS LAST, wq.id
          LIMIT $3`,
        [userId, id, 20],
      );
      result.wrongQuestions = {
        due: wrongRows.rows.length
          ? Number((wrongRows.rows[0] as any).total ?? wrongRows.rows.length)
          : 0,
        items: wrongRows.rows.map((wrong: any) => ({
          id: wrong.id,
          questionId: wrong.questionId ?? null,
          content: wrong.content ?? null,
          wrongCount: Number(wrong.wrongCount ?? 0),
          lastAttemptAt: wrong.lastAttemptAt ? new Date(wrong.lastAttemptAt) : null,
        })),
      };

      const reviewRows = await this.db.query(
        `SELECT sq.question_id AS "questionId", q.content,
                sq.next_review AS "nextReview", COUNT(*) OVER()::int AS total
           FROM edu.sr_queue sq
           JOIN edu.questions q ON q.id = sq.question_id
          WHERE sq.user_id = $1::uuid
            AND q.knowledge_point_id = $2::uuid
            AND sq.next_review IS NOT NULL
            AND sq.next_review <= NOW()
          ORDER BY sq.next_review ASC, sq.question_id
          LIMIT $3`,
        [userId, id, 20],
      );
      result.reviews = {
        due: reviewRows.rows.length
          ? Number((reviewRows.rows[0] as any).total ?? reviewRows.rows.length)
          : 0,
        items: reviewRows.rows.map((review: any) => ({
          questionId: review.questionId,
          content: review.content ?? null,
          nextReview: review.nextReview ? new Date(review.nextReview) : null,
        })),
      };

      const achievementRows = await this.db.query(
        `SELECT code, name, description, unlocked_at AS "unlockedAt"
           FROM edu.achievements
          WHERE user_id = $1::uuid
          ORDER BY unlocked_at DESC NULLS LAST, code`,
        [userId],
      );
      result.achievements = {
        count: achievementRows.rows.length,
        items: achievementRows.rows.map((achievement: any) => ({
          code: achievement.code,
          name: achievement.name ?? null,
          description: achievement.description ?? null,
          unlockedAt: achievement.unlockedAt ? new Date(achievement.unlockedAt) : null,
        })),
      };
    }

    return result;
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
