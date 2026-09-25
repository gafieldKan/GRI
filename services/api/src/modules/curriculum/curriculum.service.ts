import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  Subject,
  SchoolStage,
  Grade,
  Textbook,
  Chapter,
  KnowledgePoint,
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
