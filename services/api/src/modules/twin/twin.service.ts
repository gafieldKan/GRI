import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { IdentityService } from '../identity/identity.service';
import { TuitionService } from '../tuition/tuition.service';
import { CurriculumService } from '../curriculum/curriculum.service';
import { AgentService } from '../agent/agent.service';
import {
  TwinEvent,
  TwinEventInput,
  TwinMemory,
  TwinOverview,
  TwinProfile,
  TwinSkill,
  TwinState,
  TwinWorld,
} from './twin.types';

/** 年级展示名（≡ ontology.grade.code G1–G12）。 */
const GRADE_NAMES: Record<number, string> = {
  1: '一年级', 2: '二年级', 3: '三年级', 4: '四年级', 5: '五年级', 6: '六年级',
  7: '七年级', 8: '八年级', 9: '九年级', 10: '高一', 11: '高二', 12: '高三',
};

const DEFAULT_WORLD: TwinWorld = {
  subject: null,
  subjectName: null,
  fields: [],
  areas: [],
  stats: { total: 0, k12: 0, frontier: 0, coverageRatio: 0, byGrade: {} },
};

/**
 * TwinService —— 学生数字孪生的装配与事件溯源。
 *
 * 人本论：孪生是「人本体」的运行时。身份/状态/世界/记忆一律**复用既成真源**，
 * 本服务只做「装配」+ 往 twin.event 追加「经历」两件事，绝不重复存储状态。
 *   - 身份 profile   ← IdentityService.getProfileByExternalId（public.users + edu.students）
 *   - 进度 progress  ← TuitionService.computeStats（edu.answer_records/practice_sessions/wrong_questions）
 *   - 世界 world     ← CurriculumService.knowledgeMap（ontology.knowledge_area + area_prerequisite）
 *   - 能力 skills    ← 上述 world.areas 的 mastery 按领域（field）聚合
 *   - 记忆 memories  ← AgentService.listMemory（agent.memory，每生 AI 教师跨会话记忆）
 *   - 经历 events    ← twin.event（append-only，本服务写入）
 */
@Injectable()
export class TwinService {
  private readonly logger = new Logger(TwinService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly identity: IdentityService,
    private readonly tuition: TuitionService,
    private readonly curriculum: CurriculumService,
    private readonly agent: AgentService,
  ) {}

  private gradeName(g: number | null | undefined): string | null {
    return g != null && GRADE_NAMES[g] ? GRADE_NAMES[g] : g != null ? `G${g}` : null;
  }

  /** 行为时间线（倒序，最近在前）。 */
  async listEvents(entityId: string, limit = 50): Promise<TwinEvent[]> {
    const res = await this.db.query(
      `SELECT id, entity_id, kind, title, text, source, scene_id, diffs, before, after, at
         FROM twin.event
        WHERE entity_id = $1
        ORDER BY at DESC
        LIMIT $2`,
      [entityId, Math.max(1, Math.min(limit, 500))],
    );
    return res.rows.map((r: any) => this.mapEvent(r));
  }

  /** 追加一条经历（行动挂钩 / 会话 / 画像 / 记忆 等变更方调用）。 */
  async recordEvent(entityId: string, input: TwinEventInput): Promise<TwinEvent> {
    const res = await this.db.query(
      `INSERT INTO twin.event (entity_id, kind, title, text, source, scene_id, diffs, before, after)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, entity_id, kind, title, text, source, scene_id, diffs, before, after, at`,
      [
        entityId,
        input.kind,
        input.title,
        input.text ?? null,
        input.source ?? null,
        input.sceneId ?? null,
        JSON.stringify(input.diffs ?? []),
        input.before == null ? null : JSON.stringify(input.before),
        input.after == null ? null : JSON.stringify(input.after),
      ],
    );
    return this.mapEvent(res.rows[0]);
  }

  /**
   * 孪生总览：装配 profile + state + world + 近期经历 + 记忆。
   * 任一部件的真源缺失/异常都不致命——降级为空件，孪生壳仍可渲染。
   */
  async assembleOverview(entityId: string, subject = 'math'): Promise<TwinOverview> {
    const rawProfile = await this.identity.getProfileByExternalId(entityId);
    const profile = this.projectProfile(rawProfile);

    const progress = await this.tuition.computeStats(entityId);

    let world: TwinWorld = DEFAULT_WORLD;
    try {
      const m: any = await this.curriculum.knowledgeMap(subject, entityId);
      // subject code 归一为小写：与版图节点 code 前缀 / 前端 store 约定一致（真源库内为大写）。
      const code = m?.subject?.code ? String(m.subject.code).toLowerCase() : subject;
      world = {
        subject: code,
        subjectName: m?.subject?.name ?? null,
        fields: m?.fields ?? [],
        areas: m?.areas ?? [],
        stats: m?.stats ?? DEFAULT_WORLD.stats,
      };
    } catch (e) {
      this.logger.warn(`twin world unavailable for subject=${subject}: ${(e as Error).message}`);
    }

    const events = await this.listEvents(entityId, 20);

    let memories: TwinMemory[] = [];
    try {
      memories = this.mapMemories(await this.agent.listMemory(entityId));
    } catch (e) {
      this.logger.warn(`twin memory unavailable: ${(e as Error).message}`);
    }

    const teacherInteractions = await this.teacherInteractions(entityId);
    const lastScene = events.find((e) => e.sceneId)?.sceneId ?? null;
    const state = this.composeState(progress, world, profile.gradeLevel, teacherInteractions, lastScene);

    return {
      profile,
      state,
      world,
      events,
      memories,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * 回填历史经历（幂等）：仅在时间线为空时执行，从 edu.answer_records 按日聚合，
   * 生成一条累计曲线，供老账号的「行为与记忆」不空白。已有经历则跳过。
   */
  async backfill(entityId: string): Promise<{ created: number; skipped: boolean }> {
    const count = await this.db.query(
      'SELECT COUNT(*)::int AS n FROM twin.event WHERE entity_id = $1',
      [entityId],
    );
    if ((count.rows[0]?.n ?? 0) > 0) return { created: 0, skipped: true };

    await this.recordEvent(entityId, {
      kind: 'system',
      title: '数字孪生建立',
      text: '为这名学习者建立数字孪生身份：身份、状态、经历与记忆由此开始累积。',
      source: '系统初始化',
      diffs: [],
    });

    const daily = await this.db.query(
      `SELECT date_trunc('day', created_at) AS d,
              COUNT(*)::int AS n,
              COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END), 0)::int AS correct
         FROM edu.answer_records
        WHERE user_id = $1
        GROUP BY d
        ORDER BY d ASC`,
      [entityId],
    );

    let cum = 0;
    let created = 0;
    for (const row of daily.rows as any[]) {
      const n = Number(row.n ?? 0);
      const beforeCum = cum;
      cum += n;
      const at = row.d;
      await this.db.query(
        `INSERT INTO twin.event (entity_id, kind, title, text, source, scene_id, diffs, before, after, at)
         VALUES ($1, 'action', $2, $3, '回填', NULL, $4, NULL, NULL, $5)`,
        [
          entityId,
          `完成练习 ${n} 题`,
          `历史答题记录回填：当日 ${n} 题，答对 ${Number(row.correct ?? 0)} 题。`,
          JSON.stringify([
            { label: '累计答题', before: String(beforeCum), after: String(cum) },
          ]),
          at,
        ],
      );
      created += 1;
    }
    return { created, skipped: false };
  }

  // ─────────────────────────── 内部装配 ───────────────────────────

  private mapEvent(r: any): TwinEvent {
    return {
      id: r.id,
      entityId: r.entity_id,
      kind: r.kind,
      title: r.title,
      text: r.text ?? null,
      source: r.source ?? null,
      sceneId: r.scene_id ?? null,
      diffs: Array.isArray(r.diffs) ? r.diffs : [],
      before: r.before ?? null,
      after: r.after ?? null,
      at: r.at instanceof Date ? r.at.toISOString() : r.at,
    };
  }

  private projectProfile(raw: any): TwinProfile {
    const u = raw?.user ?? {};
    const s = raw?.student ?? null;
    const gradeLevel = s?.grade != null ? Number(s.grade) : null;
    return {
      id: u.id,
      username: u.username ?? null,
      name: s?.name || u.name || u.username || '学习者',
      email: u.email ?? null,
      role: u.role ?? 'student',
      avatarUrl: s?.avatar_url || u.avatar_url || null,
      gradeLevel,
      gradeName: this.gradeName(gradeLevel),
      textbookVersion: s?.textbook_version ?? null,
      school: s?.school ?? null,
    };
  }

  /** agent.memory 列表形态容错映射（key/fact_key、value、strength、updatedAt）。 */
  private mapMemories(raw: any): TwinMemory[] {
    const list = Array.isArray(raw) ? raw : raw?.memories ?? raw?.items ?? [];
    if (!Array.isArray(list)) return [];
    return list.map((m: any) => ({
      key: m.key ?? m.factKey ?? m.fact_key ?? '',
      value: m.value ?? null,
      strength: Number(m.strength ?? 1),
      updatedAt:
        m.updatedAt instanceof Date
          ? m.updatedAt.toISOString()
          : m.updatedAt ?? m.updated_at ?? null,
    }));
  }

  private async teacherInteractions(entityId: string): Promise<number> {
    try {
      const res = await this.db.query(
        'SELECT COUNT(*)::int AS n FROM agent.sessions WHERE entity_id = $1',
        [entityId],
      );
      return res.rows[0]?.n ?? 0;
    } catch {
      return 0;
    }
  }

  private composeState(
    progress: any,
    world: TwinWorld,
    gradeLevel: number | null,
    teacherInteractions: number,
    lastSceneCode: string | null,
  ): TwinState {
    const areas = (world.areas ?? []) as any[];
    const fields = (world.fields ?? []) as any[];

    // 能力雷达：按版图领域聚合 k12 知识域的掌握度均值
    const byField = new Map<string, number[]>();
    for (const a of areas) {
      if (a.scope !== 'k12' || a.mastery == null || !a.fieldCode) continue;
      if (!byField.has(a.fieldCode)) byField.set(a.fieldCode, []);
      byField.get(a.fieldCode)!.push(Number(a.mastery));
    }
    const fieldName = new Map<string, string>(fields.map((f: any) => [f.code, f.name]));
    const skills: TwinSkill[] = [...byField.entries()].map(([code, vals]) => ({
      fieldCode: code,
      name: fieldName.get(code) ?? code,
      mastery: Math.round(vals.reduce((x, y) => x + y, 0) / vals.length),
    }));

    const all = areas
      .filter((a) => a.scope === 'k12' && a.mastery != null)
      .map((a) => Number(a.mastery));
    const avg = all.length ? Math.round(all.reduce((x, y) => x + y, 0) / all.length) : 0;
    const mastery = {
      avg,
      mastered: all.filter((v) => v >= 80).length,
      learning: all.filter((v) => v >= 50 && v < 80).length,
      weak: all.filter((v) => v < 50).length,
      total: all.length,
    };

    let scene: TwinState['scene'] = null;
    if (lastSceneCode) {
      const a = areas.find((x) => x.code === lastSceneCode);
      scene = { code: lastSceneCode, name: a?.name ?? lastSceneCode };
    }

    return {
      subject: world.subject ?? 'math',
      gradeLevel,
      gradeName: this.gradeName(gradeLevel),
      scene,
      progress: {
        totalAnswered: Number(progress?.totalAnswered ?? 0),
        correctCount: Number(progress?.correctCount ?? 0),
        accuracy: Number(progress?.accuracy ?? 0),
        practiceSessions: Number(progress?.practiceSessions ?? 0),
        unresolvedWrong: Number(progress?.unresolvedWrong ?? 0),
      },
      mastery,
      skills,
      // 关系值 = 教学互动轮次的派生（诚实口径：非真实情感度量）
      relations: {
        teacher: {
          interactions: teacherInteractions,
          bond: teacherInteractions > 0 ? Math.min(100, 10 + teacherInteractions * 2) : 0,
        },
      },
    };
  }
}
