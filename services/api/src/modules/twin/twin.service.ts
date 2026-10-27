import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { eduQuery, dailyAnswerAggregate, upsertStudentFields } from '../edu-core/repository';
import { IdentityService } from '../identity/identity.service';
import { TuitionService } from '../tuition/tuition.service';
import { CurriculumService } from '../curriculum/curriculum.service';
import { AgentService } from '../agent/agent.service';
import { WorldService } from '../world/world.service';
import {
  TwinActionInput,
  TwinArchive,
  TwinEvent,
  TwinEventInput,
  TwinImportResult,
  TwinMemory,
  TwinOverview,
  TwinProfile,
  TwinProfilePatch,
  TwinReplay,
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
  scenes: [],
};

/** 人物画像可自助更新字段的展示名（用于经历差异的可读 label）。 */
const PROFILE_FIELD_LABELS: Record<string, string> = {
  name: '姓名',
  avatarUrl: '头像',
  gradeLevel: '年级',
  textbookVersion: '教材版本',
  school: '学校',
};

/** 学习动词闭集（世界的行动；默认标题）。 */
const ACTION_VERBS: Record<string, string> = {
  lesson: '上课',
  practice: '练习',
  review: '复习错题',
  chat: '请教 AI 教师',
  exam: '测验',
  rest: '休息',
};

/**
 * 敏感记忆键守卫（镜像 @gri/agent-core MemoryStore.AVOID_KEYS）。
 * 导出/装配孪生档案时二次过滤——绝不让密码/令牌等键外泄。
 */
const AVOID_KEYS = /(password|secret|token|api_?key|credential)/i;

/** 档案格式契约（fail-fast 校验）。 */
const ARCHIVE_FORMAT = 'gri-student-digital-twin';
const ARCHIVE_VERSION = 1;

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
    private readonly worldService: WorldService,
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
        scenes: [],
      };
    } catch (e) {
      this.logger.warn(`twin world unavailable for subject=${subject}: ${(e as Error).message}`);
    }

    let humanWorld: { scenes: unknown[] } = { scenes: [] };
    try {
      const human = await this.worldService.getWorld();
      humanWorld = { scenes: human?.scenes ?? [] };
    } catch (e) {
      this.logger.warn(`twin human world unavailable: ${(e as Error).message}`);
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
      world: { ...world, scenes: humanWorld.scenes },
      humanWorld,
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

    const dailyRows = await dailyAnswerAggregate(eduQuery(this.db), entityId);

    let cum = 0;
    let created = 0;
    for (const row of dailyRows as any[]) {
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

  /**
   * 更新人物画像（身份·稳定属性）——白名单字段落 edu.students（upsert），
   * 并记一条 kind='profile' 经历（含 before/after 快照与差异），「改画像」即一次经历。
   */
  async updateProfile(entityId: string, patch: TwinProfilePatch): Promise<TwinProfile> {
    const before = this.projectProfile(await this.identity.getProfileByExternalId(entityId));

    const cols: Record<string, unknown> = {};
    if (patch.name !== undefined) cols.name = patch.name;
    if (patch.avatarUrl !== undefined) cols.avatar_url = patch.avatarUrl;
    if (patch.gradeLevel !== undefined) cols.grade = patch.gradeLevel;
    if (patch.textbookVersion !== undefined) cols.textbook_version = patch.textbookVersion;
    if (patch.school !== undefined) cols.school = patch.school;

    const keys = Object.keys(cols);
    if (keys.length > 0) {
      // 列名全部来自白名单集合，无注入风险；$1 恒为 entityId（≡ users.id）——经 edu-core 单一所有者（W2.1c）
      await upsertStudentFields(eduQuery(this.db), entityId, cols);
    }

    const after = this.projectProfile(await this.identity.getProfileByExternalId(entityId));
    const diffs = Object.keys(PROFILE_FIELD_LABELS)
      .filter((k) => String((before as any)[k] ?? '') !== String((after as any)[k] ?? ''))
      .map((k) => ({
        label: PROFILE_FIELD_LABELS[k],
        before: String((before as any)[k] ?? '—'),
        after: String((after as any)[k] ?? '—'),
      }));

    await this.recordEvent(entityId, {
      kind: 'profile',
      title: '更新人物画像',
      source: '人物画像',
      diffs,
      before,
      after,
    });
    return after;
  }

  /**
   * 记录一次学习行动（世界里的动词）——「行动 → 经历」的挂钩面。
   * 快照当前真实进度（tuition.computeStats）为 after，取上一条行动经历的 after 为 before，
   * 派生可读差异（累计答题 / 正确率）；不伪造状态，只如实记录行动后的既成真源。
   */
  async recordAction(entityId: string, input: TwinActionInput): Promise<TwinEvent> {
    const verb = ACTION_VERBS[input.verb] ? input.verb : 'practice';

    let snapshot: any = null;
    try {
      const s = await this.tuition.computeStats(entityId);
      snapshot = {
        totalAnswered: Number(s?.totalAnswered ?? 0),
        correctCount: Number(s?.correctCount ?? 0),
        accuracy: Number(s?.accuracy ?? 0),
      };
    } catch {
      snapshot = null;
    }

    const prev = await this.db.query(
      `SELECT after FROM twin.event
        WHERE entity_id = $1 AND kind = 'action' AND after IS NOT NULL
        ORDER BY at DESC LIMIT 1`,
      [entityId],
    );
    const before = prev.rows[0]?.after ?? null;

    const diffs =
      before && snapshot
        ? [
            { label: '累计答题', before: String(before.totalAnswered ?? 0), after: String(snapshot.totalAnswered) },
            { label: '正确率', before: `${before.accuracy ?? 0}%`, after: `${snapshot.accuracy}%` },
          ].filter((d) => d.before !== d.after)
        : [];

    return this.recordEvent(entityId, {
      kind: 'action',
      title: input.title || ACTION_VERBS[verb],
      text: input.text ?? null,
      source: '学习行动',
      sceneId: input.sceneId ?? null,
      diffs,
      before,
      after: snapshot,
    });
  }

  /**
   * 状态回放：把经历按**正序**（最早在前）返回，供滑杆 scrubbing。
   * 不改当前态——回看的是历史快照（before/after），而非重放副作用。
   */
  async getReplay(entityId: string, limit = 200): Promise<TwinReplay> {
    const res = await this.db.query(
      `SELECT id, entity_id, kind, title, text, source, scene_id, diffs, before, after, at
         FROM twin.event
        WHERE entity_id = $1
        ORDER BY at ASC
        LIMIT $2`,
      [entityId, Math.max(1, Math.min(limit, 500))],
    );
    const frames = res.rows.map((r: any, i: number) => {
      const e = this.mapEvent(r);
      return {
        index: i,
        id: e.id,
        at: e.at,
        kind: e.kind,
        title: e.title,
        text: e.text,
        sceneId: e.sceneId,
        diffs: e.diffs,
        before: e.before,
        after: e.after,
      };
    });
    return { entityId, frames, generatedAt: new Date().toISOString() };
  }

  /**
   * 导出孪生档案（format=gri-student-digital-twin v1）。
   * 只搬「个人」部件：身份 + 状态 + 经历 + 记忆；世界来自共享本体，不随档案搬运。
   * 记忆经 AVOID_KEYS 二次过滤——档案绝不含敏感键。
   */
  async exportArchive(entityId: string): Promise<TwinArchive> {
    const overview = await this.assembleOverview(entityId);
    const memories = overview.memories.filter((m) => !AVOID_KEYS.test(m.key || ''));
    const events = await this.listEvents(entityId, 500);
    return {
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      exportedAt: new Date().toISOString(),
      profile: overview.profile,
      state: overview.state,
      events,
      memories,
    };
  }

  /**
   * 导入孪生档案（合并语义）——fail-fast 校验格式/版本后：
   *   1) 白名单更新身份（name/avatarUrl/gradeLevel/textbookVersion/school）；
   *   2) 追加经历（按 at+kind+title 去重，避免重复导入翻倍）；
   *   3) 记一条 settings 经历「导入孪生档案」。
   * 状态由真源装配，不搬运（诚实口径：导入的是经历与身份，不是伪造的当前态）。
   */
  async importArchive(entityId: string, archive: any): Promise<TwinImportResult> {
    if (!archive || typeof archive !== 'object') {
      throw new BadRequestException('导入失败：档案为空或格式非法');
    }
    if (archive.format !== ARCHIVE_FORMAT) {
      throw new BadRequestException(`导入失败：格式不匹配（期望 ${ARCHIVE_FORMAT}）`);
    }
    if (Number(archive.version) !== ARCHIVE_VERSION) {
      throw new BadRequestException(`导入失败：版本不支持（期望 v${ARCHIVE_VERSION}）`);
    }
    const events = Array.isArray(archive.events) ? archive.events : [];

    // 1) 身份：只取白名单字段
    let profileUpdated = false;
    const src = archive.profile ?? {};
    const patch: TwinProfilePatch = {};
    if (typeof src.name === 'string' && src.name.trim()) patch.name = src.name.trim();
    if (typeof src.avatarUrl === 'string') patch.avatarUrl = src.avatarUrl;
    if (src.gradeLevel != null && !Number.isNaN(Number(src.gradeLevel))) {
      patch.gradeLevel = Number(src.gradeLevel);
    }
    if (typeof src.textbookVersion === 'string') patch.textbookVersion = src.textbookVersion;
    if (typeof src.school === 'string') patch.school = src.school;
    if (Object.keys(patch).length > 0) {
      await this.updateProfile(entityId, patch);
      profileUpdated = true;
    }

    // 2) 经历：追加（对 at+kind+title 去重）
    const iso = (v: any): string => {
      if (!v) return '';
      const d = v instanceof Date ? v : new Date(v);
      return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
    };
    const existing = await this.db.query(
      'SELECT at, kind, title FROM twin.event WHERE entity_id = $1',
      [entityId],
    );
    const seen = new Set<string>(
      (existing.rows as any[]).map((r) => `${iso(r.at)}|${r.kind}|${r.title}`),
    );
    let created = 0;
    for (const ev of events) {
      const at = ev?.at ? iso(ev.at) : null;
      const kind = ev?.kind ?? 'action';
      const title = String(ev?.title ?? '导入经历');
      const key = `${at}|${kind}|${title}`;
      if (at && seen.has(key)) continue;
      await this.db.query(
        `INSERT INTO twin.event (entity_id, kind, title, text, source, scene_id, diffs, before, after, at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, NOW()))`,
        [
          entityId,
          kind,
          title,
          ev?.text ?? null,
          ev?.source ? `${ev.source}（导入）` : '导入',
          ev?.sceneId ?? null,
          JSON.stringify(Array.isArray(ev?.diffs) ? ev.diffs : []),
          ev?.before == null ? null : JSON.stringify(ev.before),
          ev?.after == null ? null : JSON.stringify(ev.after),
          at,
        ],
      );
      if (at) seen.add(key);
      created += 1;
    }

    // 3) 元经历
    await this.recordEvent(entityId, {
      kind: 'settings',
      title: '导入孪生档案',
      text: `导入经历 ${created} 条${profileUpdated ? '，并更新人物画像' : ''}。`,
      source: '数据与设置',
      diffs: [],
    });
    return { events: created, profileUpdated };
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
