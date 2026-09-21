import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export interface TuitionQuestion {
  id: string;
  knowledge_point_id?: string;
  content: string;
  answer: string;
  type: string;
  difficulty?: string;
  options?: string[];
  explanation?: string;
}

/**
 * 题目服务（移植旧 QuestionService.js 的 SQL 语义，落到新单一库 edu.questions）。
 *
 * 知识点 ID 兼容：前端/会话以 legacy 串（如 `math_pythagorean`）或 UUID 传参。
 * 统一先经 `_etl_entity_map`（entity='knowledge_points'）把 legacy 串解析成 UUID；
 * 已是 UUID 则直接用，解析不到才按原样传（后端 WHERE 会自动不命中）。
 */
@Injectable()
export class TuitionQuestionService {
  constructor(private readonly db: DatabaseService) {}

  /** 把 legacy 串或 UUID 解析成知识点 UUID（edu.knowledge_points.id）。解析不到返回 null。 */
  async resolveKnowledgePointId(kpId: string): Promise<string | null> {
    if (!kpId) return null;
    // 已是 UUID 形态直接用
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(kpId)) {
      return kpId;
    }
    const res = await this.db.query(
      `SELECT new_id FROM public._etl_entity_map WHERE entity = 'knowledge_points' AND legacy_id = $1`,
      [kpId],
    );
    return res.rows[0]?.new_id ?? null;
  }

  /**
   * 按知识点取诊断/测验/教学题。
   * 新库里用整表（variant_of 无 type 列区分），故按难度+类型取：
   *   - diagnosis：easy 起手 3 题
   *   - quiz：混合难度 5 题
   *   - teaching：easy/medium 2 题
   * resolveId=true（默认）时先把 kpId 从 legacy 解析成 UUID 再查。
   */
  async getQuestionsByType(
    knowledgePointId: string,
    type: 'diagnosis' | 'quiz' | 'teaching' = 'diagnosis',
    count = 3,
    resolveId = true,
  ): Promise<TuitionQuestion[]> {
    const kpUuid = resolveId ? await this.resolveKnowledgePointId(knowledgePointId) : knowledgePointId;
    if (!kpUuid) return [];

    let sql = `SELECT id, knowledge_point_id AS kp_id, content, answer, type, difficulty, options, explanation
               FROM edu.questions WHERE knowledge_point_id = $1`;
    const params: unknown[] = [kpUuid];

    if (type === 'diagnosis') {
      sql += ` AND difficulty IN ('easy','medium')`;
    } else if (type === 'quiz') {
      sql += ` AND difficulty IN ('easy','medium','hard')`;
    } else {
      sql += ` AND difficulty IN ('easy','medium')`;
    }

    sql += ` ORDER BY difficulty ASC LIMIT $${params.length + 1}`;
    params.push(count);

    const res = await this.db.query(sql, params);
    return res.rows.map((r: any) => ({
      id: r.id,
      knowledge_point_id: r.kp_id,
      content: r.content,
      answer: r.answer,
      type: r.type || 'fill',
      difficulty: r.difficulty,
      options: r.options ? (Array.isArray(r.options) ? r.options : JSON.parse(r.options || '[]')) : null,
      explanation: r.explanation,
    }));
  }

  async getDiagnosisQuestions(knowledgePointId: string): Promise<TuitionQuestion[]> {
    return this.getQuestionsByType(knowledgePointId, 'diagnosis', 3);
  }

  async getQuizQuestions(knowledgePointId: string, count = 5): Promise<TuitionQuestion[]> {
    return this.getQuestionsByType(knowledgePointId, 'quiz', count);
  }

  async getTeachingQuestions(knowledgePointId: string): Promise<TuitionQuestion[]> {
    return this.getQuestionsByType(knowledgePointId, 'teaching', 2);
  }
}