import { Injectable, NotFoundException, OnModuleInit, OnModuleDestroy, Optional, Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseService } from '../../database/database.service';
import { AgentCredentialsService } from './agent-credentials.service';
import {
  AgentCore, LlmClient, ModelRouter, MemoryStore, ToolRegistry, SkillRegistry,
  makeTool, storeFrom, McpPool, createDelegateTool,
} from '@gri/agent-core';
import type { CliBackendRegistry } from '@gri/agent-core';

/**
 * DI 令牌：外部 agent CLI 后端注册表（B-3b「换脑子」）。
 * 由 AgentModule 注入进程级共享 `cliBackends`（B-3a）；未提供 → 注入 null → AgentCore/LlmClient 行为同今日（零回归）。
 * 是否真正启用只看 `agent.llm_routes` 是否有 enabled 的 provider='cli' 行（C2，无全局开关）。
 */
export const AGENT_CLI_BACKENDS = 'AGENT_CLI_BACKENDS';

/**
 * 外部 agent run 的 `error_code` 取值集（B-4 §目标4）。
 * `status='failed'` 的 run 必带其一（绝不静默）；写进契约 docs/AGENT_PUBLIC_CONTRACT.md §三。
 */
export const EXTERNAL_RUN_ERROR_CODES = Object.freeze([
  'TIMEOUT',              // 超时杀进程组
  'NONZERO_EXIT',         // 后端非零退出
  'EMPTY_TEXT',           // 正常退出但无可用文本
  'BACKEND_NOT_FOUND',    // 未知后端 id / CLI 未安装
  'GOAL_MISSING',         // 缺少 goal
  'CWD_DENIED',           // cwd 越出白名单
  'REGISTRY_NOT_INJECTED',// 未注入 CliBackendRegistry
  'INTERRUPTED',          // 重启对账：宿主重启时残留 running 的孤儿 run
] as const);

/** SM-2 质量分：AI 教师内判读打分——答对=5(掌握)，答错=1(遗忘)。喂给间隔重复队列学决策曲线。 */
const SM2_QUALITY_CORRECT = 5;
const SM2_QUALITY_WRONG = 1;

/**
 * SM-2 间隔重复纯函数（与 tuition SpacedRepetitionService.calculateSM2 同式，EF 最小 1.3、interval 最大 365）。
 * 内联在 agent 模块以维持"不依赖 tuition 模块"边界，两边都读写共享的 edu.sr_queue 表，天然互通。
 */
function sm2Calculate(
  quality: number,
  easeFactor = 2.5,
  repetitions = 0,
  interval = 0,
): { interval: number; easeFactor: number; repetitions: number } {
  let ef = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  ef = Math.max(1.3, ef);
  let reps = repetitions;
  let iv = interval;
  if (quality >= 3) {
    if (reps === 0) iv = 1;
    else if (reps === 1) iv = 6;
    else iv = Math.round(iv * ef);
    reps += 1;
  } else {
    reps = 0;
    iv = 0;
  }
  iv = Math.min(iv, 365);
  return { interval: iv, easeFactor: Number(ef.toFixed(2)), repetitions: reps };
}

interface AgentEntity {
  entity_id: string;
  kind: string;
  name: string | null;
  status: string;
  config: any;
}

/**
 * 判读一道题 + 落库（answer.grade 与 lesson.submit 共用同一判读管线，保证"课上再练"与"面板判读"副作用同源）。
 * 判题：LlmClient.validateAnswer(返回对错与讲解)；落库：answer_records(作答) + wrong_questions(答错入职,幂等计数)
 *   + resolveOnCorrect 消错题 + SM-2 间隔重复队列。全部以 ctx.entityId 隔离；任一步失败不阻断判题。
 */
async function gradeAnswerRecord(ctx: any, args: any): Promise<any> {
  const { rows } = await ctx.store.query('SELECT * FROM edu.questions WHERE id = $1', [args.questionId]);
  const q = rows[0];
  const grader = new LlmClient(async () => ({ apiKey: '', model: '', baseUrl: '' }));
  const result = await grader.validateAnswer(q, args.answer);
  const isCorrect = !!result.correct;
  let recorded = false;
  let sm2Out: { interval: number; easeFactor: number; repetitions: number; nextReview: string } | null = null;
  try {
    await ctx.store.query(
      `INSERT INTO edu.answer_records (user_id, question_id, session_id, student_answer, is_correct, time_spent_ms)
       VALUES ($1, $2, NULL, $3, $4, $5)`,
      [ctx.entityId, args.questionId, String(args.answer ?? ''), isCorrect, args.timeSpentMs != null && args.timeSpentMs > 0 ? Math.round(args.timeSpentMs) : null],
    );
    recorded = true;
    if (!isCorrect && q) {
      const diffNum = ({ easy: 0.3, medium: 0.5, hard: 0.8 } as Record<string, number>)[q.difficulty ?? ''] ?? 0.5;
      await ctx.store.query(
        `INSERT INTO edu.wrong_questions
           (user_id, question_id, student_answer, correct_answer, error_type, difficulty, reviewed, mastered, review_count, wrong_count, last_attempt_at, last_reviewed_at)
         VALUES ($1, $2, $3, $4, '判读错误', $5, false, false, 0, 1, CURRENT_TIMESTAMP, NULL)
         ON CONFLICT (user_id, question_id) DO UPDATE SET wrong_count = edu.wrong_questions.wrong_count + 1, last_attempt_at = CURRENT_TIMESTAMP`,
        [ctx.entityId, args.questionId, String(args.answer ?? ''), q.answer != null ? String(q.answer) : '', diffNum],
      );
    }
    if (args.resolveOnCorrect && isCorrect) {
      await ctx.store.query(
        `UPDATE edu.wrong_questions SET is_resolved = true, mastered = true
          WHERE user_id = $1 AND question_id = $2`,
        [ctx.entityId, args.questionId],
      );
    }
    {
      const prev = await ctx.store.query(
        `SELECT ease_factor, repetitions, interval FROM edu.sr_queue WHERE user_id = $1 AND question_id = $2`,
        [ctx.entityId, args.questionId],
      );
      const p = prev.rows[0] || {};
      const sm2 = sm2Calculate(
        isCorrect ? SM2_QUALITY_CORRECT : SM2_QUALITY_WRONG,
        p.ease_factor ?? 2.5,
        p.repetitions ?? 0,
        p.interval ?? 0,
      );
      const nextReview = new Date(Date.now() + sm2.interval * 86_400_000);
      sm2Out = { interval: sm2.interval, easeFactor: sm2.easeFactor, repetitions: sm2.repetitions, nextReview: nextReview.toISOString() };
      await ctx.store.query(
        `INSERT INTO edu.sr_queue (user_id, question_id, last_reviewed, interval, ease_factor, repetitions, next_review, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, question_id) DO UPDATE SET
           last_reviewed = EXCLUDED.last_reviewed,
           interval = EXCLUDED.interval,
           ease_factor = EXCLUDED.ease_factor,
           repetitions = EXCLUDED.repetitions,
           next_review = EXCLUDED.next_review,
           updated_at = CURRENT_TIMESTAMP`,
        [ctx.entityId, args.questionId, sm2.interval, sm2.easeFactor, sm2.repetitions, nextReview],
      );
    }
  } catch { /* 作答/错题/记忆队列记录失败不阻断判题 */ }
  return { ...result, recorded, isCorrect, questionId: args.questionId, resolved: !!(args.resolveOnCorrect && isCorrect), sm2: sm2Out };
}

/**
 * lesson.record 的落盘核心 —— 把一节上完的课收束落盘到 edu.learning_plans（plan_type='lesson'）。
 * 模块级函数（lesson.record execute 与 lesson.submit 答对分支共享，同一落库源头）。
 * plan_data 存该课真实结果（读自授课状态 lesson:<kpId>）；status 直接取 outcome（一次性历史记录，不归档不堆叠）。
 */
async function lessonRecord(ctx: any, args: any): Promise<any> {
  const kpId = String(args.kpId ?? '');
  if (!kpId) return { ok: false, error: 'kpId 必填' };
  const mem = ctx.memory;
  let state: any = {};
  if (mem) {
    try { state = (await mem.get(ctx.entityId, `lesson:${kpId}`)) ?? {}; } catch { state = {}; }
  }
  // 该KP名称（缺省查库）
  let kpName = String(args.kpName ?? '');
  if (!kpName) {
    try {
      const kp = await ctx.store.query('SELECT name FROM edu.knowledge_points WHERE id = $1', [kpId]);
      kpName = kp.rows?.[0]?.name ?? kpId;
    } catch { kpName = kpId; }
  }
  const outcome = args.outcome === 'abandoned' ? 'abandoned' : 'completed';
  // 本课真实结果（读自授课状态 + 参数），落 plan_data（status 直接取 outcome：lesson 是一次性的历史记录，不归档不堆叠）
  const lessons: any = {
    kpId,
    kpName,
    outcome,
    stage: state.stage ?? 'unknown',
    baseline: typeof state.baseline === 'number' ? state.baseline : null,
    practiceMastery: typeof state.practiceMastery === 'number' ? state.practiceMastery : null,
    delta: typeof state.delta === 'number' ? state.delta : null,
    attempts: state.attempts ?? 0,
    missedCount: state.missedCount ?? 0,
    lastWrongAnswer: state.lastWrongAnswer ?? null,
    recordedAt: new Date().toISOString(),
  };
  // 落盘一行
  const { rows: ins } = await ctx.store.query(
    `INSERT INTO edu.learning_plans (user_id, title, plan_type, plan_data, total_tasks, completed_tasks, status, start_date, end_date)
     VALUES ($1, $2, 'lesson', $3::jsonb, 1, 1, $4, CURRENT_DATE, CURRENT_DATE)
     RETURNING id`,
    [ctx.entityId, `一节课「${kpName}」`, JSON.stringify(lessons), outcome],
  );
  const recordId = ins?.[0]?.id ?? null;
  return { ok: true, recordId, kpName, outcome, lessons };
}

/**
 * AgentService —— 「每个学生一个独立 AI 教师」。
 *
 * 底层是 @gri/agent-core（传输/DB 无关）。这里做薄 Nest 绑定：
 *   1. 以 req.auth.externalId 为真源，保 agent.entities 一行（每生一个持久 agent）。
 *   2. 装配每生独立的 AgentCore：ModelRouter(读 agent.llm_routes，可前台切模型)、
 *      MemoryStore(agent.memory，跨会话)、教学技能集（技能指令+工具）。
 *   3. sendMessage → AgentCore.run；返回契约稳定 {success, message, ...}。
 *
 * 所有权铁律：一律以 entityId(=externalId) 落参读写，杜绝跨学生访问。
 */
@Injectable()
export class AgentService implements OnModuleInit, OnModuleDestroy {
  /** 进程级 MCP 连接池：跨消息复用同一 server 连接（不每消息 spawn stdio 子进程）。 */
  private readonly mcpPool: McpPool;

  /**
   * 外部 agent 委派 run 的**行级上下文**（B-4）：把 runId 带给 onEvent/落库，
   * 而**不改**工厂签名（`createDelegateTool` 依旧只收 onEvent 回调孔）。
   * Node 内置 `AsyncLocalStorage`，零依赖；底座仍不碰 DB（落库全在本 host 层）。
   */
  private readonly delegateAls = new AsyncLocalStorage<{ runId: string; chain: Promise<void> }>();

  constructor(
    private readonly db: DatabaseService,
    @Optional() private readonly creds?: AgentCredentialsService,
    @Optional() @Inject(AGENT_CLI_BACKENDS) private readonly cliBackends?: CliBackendRegistry | null,
  ) {
    this.mcpPool = new McpPool(storeFrom((text: string, params?: unknown[]) => this.db.query(text, params)));
  }

  /** Nest 生命周期：启动时重启对账——把宿主重启前残留 running 的孤儿 run 置 failed/INTERRUPTED（B-4）。 */
  async onModuleInit(): Promise<void> {
    await this.reconcileInterruptedRuns();
  }

  /** Nest 生命周期：进程退出时回收全部 MCP 连接（防僵尸子进程残留）。 */
  async onModuleDestroy(): Promise<void> {
    await this.mcpPool.disconnect();
  }

  /** Store 适配：把 DatabaseService 拧成 agent-core 的 {query}。 */
  private _store() {
    return storeFrom((text: string, params?: unknown[]) => this.db.query(text, params));
  }

  /** 装配某学生的独立 agent（每调实时读库 → 大模型切换立即生效）。
   * 学科动态化（K12 全学科）：opts.subject → edu.students.current_subject → 默认 'math'，
   * 注入「当前学科」进 persona，让 AI 教师感知学生所选学科（年级同理，edu.students.grade）。 */
  private async _agent(
    entityId: string,
    opts: { subject?: string } = {},
  ): Promise<{ core: AgentCore; memory: MemoryStore; entity: AgentEntity; subject: string; gradeLevel: number | null }> {
    const entity = await this._ensureEntity(entityId);
    const store = this._store();
    // 凭据缝（B-1）：该生（entity=<id>）自持的 api key 优先，其次 default 凭据，最后 env（未配置 → null → 同今日）
    const router = new ModelRouter(store, null, this.creds?.store ?? null);
    const memory = new MemoryStore(store);
    const toolDefs = this._teachingToolDefs();
    const tools = this._teachingTools().registerAll(toolDefs);
    // MCP 桥接：把 agent.mcp_servers（enabled）的外部 server 工具并入每生 agent 的工具表。
    // 用进程级共享连接池（跨消息复用，空闲自动回收）——不每消息 spawn 子进程、工具执行不泄漏连接。
    // 无启用 server → []（no-op，不回归）；单台失败被池隔离。凭证永不经工具入模型。
    const mcpTools = await this.mcpPool.bridgeTools();
    if (mcpTools.length) tools.registerAll(mcpTools);
    const skills = this._teachingSkills(toolDefs);

    // 学科/年级链式取真源：显式 opts → 学生档案 → 默认 math
    const profile = await store.query(
      `SELECT current_subject, grade FROM edu.students WHERE user_id = $1`,
      [entityId],
    );
    const subject = String(opts.subject || profile.rows[0]?.current_subject || 'math');
    const gradeLevel = profile.rows[0]?.grade ?? null;
    const subjectName = await this._subjectDisplayName(subject);

    const core = new AgentCore({
      router,
      store,
      tools,
      skills,
      memory,
      persona:
        `你是智学慧眼为「学生 ${entityId}」配备的专属 AI 教师（独立记忆、独立进度）。` +
        `学生当前所学学科是「${subjectName}」${gradeLevel ? `（${gradeLevel} 年级）` : ''}，出题/讲解默认围绕该学科展开；` +
        `学生明确提到别的学科时以对话上下文为准，随时切换。` +
        `始终用中文，语气鼓励、追问引导，紧扣学生掌握度给予个性化讲解。`,
      defaultResponder: async (ctx, o) => this._mockTeach(ctx, o, tools),
      onRun: (a) => void this._audit(entityId, a),
      // 外部 agent 后端（B-3b）：缺省 null（未注入 → 同今日）；仅当该 routeKey 有 enabled 的 provider='cli'
      // 路由行时，LlmClient 才会改走 CliBackendRegistry（换脑子），无 cli 行则零影响。
      cliBackends: this.cliBackends ?? null,
    });

    return { core, memory, entity, subject, gradeLevel };
  }

  /** 学科展示名：ontology.subject 行（MATH → 数学）；查不到原样回 code。 */
  private async _subjectDisplayName(subject: string): Promise<string> {
    const res = await this._store().query(
      `SELECT name FROM ontology.subject WHERE code = $1`,
      [subject],
    );
    return res.rows[0]?.name ?? subject;
  }

  /** 确保每个学生一行独立 agent 实体（幂等）。 */
  private async _ensureEntity(entityId: string): Promise<AgentEntity> {
    const row = await this._store().query(
      `INSERT INTO agent.entities (entity_id, kind, status)
       VALUES ($1, 'student', 'active')
       ON CONFLICT (entity_id) DO UPDATE SET updated_at = NOW()
       RETURNING entity_id, kind, name, status, config`,
      [entityId],
    );
    return row.rows[0] as AgentEntity;
  }

  /** 教学工具定义集：学生 agent 可调用的能力（直接读库，不耦合 tuition）。 */
  private _teachingToolDefs(): any[] {
    return [
      makeTool({
        name: 'question.lookup',
        description: '按学科/知识点查题库，返回题目数组（用于出题/诊断）。subject 必填（学生提到具体学科时用该学科，否则用 persona 里的当前学科，code 形如 math/phys/chem）。',
        inputSchema: { type: 'object', properties: { subject: { type: 'string' }, limit: { type: 'number' } }, required: ['subject'] },
        async execute(ctx, args) {
          const limit = Math.min(Number(args.limit) || 5, 20);
          const { rows } = await ctx.store.query(
            `SELECT q.id, q.content, q.type, q.options, q.answer, q.difficulty, kp.name AS knowledge_point
               FROM edu.questions q
               LEFT JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id
              WHERE LOWER(kp.subject) = LOWER($1)
              ORDER BY random()
              LIMIT $2`,
            [args.subject, limit],
          );
          return rows.map((r: any) => ({ id: r.id, content: r.content, type: r.type, options: r.options, difficulty: r.difficulty }));
        },
      }),
      makeTool({
        name: 'curriculum.lookup',
        description: '导航 K12 教学体系：按学段/年级/学科查教材与章节树，再按章节查知识点（学生要「学什么/先学哪章/有哪些知识点/教学体系」时先调它，再针对具体知识点出题或讲解）。',
        inputSchema: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: '学科 code（math/phys/chem 等，缺省用当前学科）' },
            gradeLevel: { type: 'number', description: '年级数字 1-12（缺省用学生档案年级）' },
            chapterId: { type: 'string', description: '章节 UUID（给定时只返回该章知识点）' },
          },
        },
        async execute(ctx, args) {
          // 教材（学科+年级定位）
          const tb = await ctx.store.query(
            `SELECT t.id, t.code, t.name, t.publisher
               FROM ontology.textbook t
               LEFT JOIN ontology.subject s ON s.id = t.subject_id
               LEFT JOIN ontology.grade g ON g.id = t.grade_id
              WHERE (t.status = 'published' OR t.status = 'active')
                AND ($1::varchar IS NULL OR LOWER(s.code) = LOWER($1::varchar))
                AND ($2::int IS NULL OR g.code = $2::varchar OR g.sort_order = $2::int)
              ORDER BY t.code LIMIT 5`,
            [args.subject ?? null, args.gradeLevel ?? null],
          );
          // 章节（教材范围；未选教材时取全部匹配教材的章节）
          const chapters = args.chapterId
            ? (await ctx.store.query(
                `SELECT id, code, name, parent_id FROM ontology.textbook_chapter WHERE id = $1::uuid`,
                [args.chapterId],
              )).rows
            : (await ctx.store.query(
                `SELECT c.id, c.code, c.name, c.parent_id
                   FROM ontology.textbook_chapter c
                   JOIN ontology.textbook t ON t.id = c.textbook_id
                   LEFT JOIN ontology.subject s ON s.id = t.subject_id
                   LEFT JOIN ontology.grade g ON g.id = t.grade_id
                  WHERE (t.status = 'published' OR t.status = 'active')
                    AND ($1::varchar IS NULL OR LOWER(s.code) = LOWER($1::varchar))
                    AND ($2::int IS NULL OR g.code = $2::varchar OR g.sort_order = $2::int)
                  ORDER BY c.sort_order NULLS LAST, c.code LIMIT 30`,
                [args.subject ?? null, args.gradeLevel ?? null],
              )).rows;
          // 知识点（章节范围内 published）
          const chapterIds = chapters.map((c: any) => c.id);
          const kps = chapterIds.length
            ? (await ctx.store.query(
                `SELECT kp.id, kp.code, kp.name, kp.description, kp.subject, kp.grade_level, kp.chapter_id, kp.status
                   FROM edu.knowledge_points kp
                  WHERE kp.chapter_id = ANY($1::uuid[])
                    AND (kp.status = 'published' OR kp.status IS NULL)
                  ORDER BY kp.code NULLS LAST LIMIT 50`,
                [chapterIds],
              )).rows
            : [];
          return {
            textbooks: tb.rows,
            chapters: chapters.map((c: any) => ({ id: c.id, code: c.code, name: c.name, parentId: c.parent_id })),
            knowledgePoints: kps.map((k: any) => ({ id: k.id, code: k.code, name: k.name, description: k.description, chapterId: k.chapter_id })),
          };
        },
      }),
      makeTool({
        name: 'answer.grade',
        description: '判读一道题的学生答案（选择/填空/数值容差/essay），返回对错与讲解，并把本次作答写入作答记录（答错同时记入错题本），再按 SM-2 演进出间隔重复队列（edu.sr_queue，供自适应复习按到期日调度）。若 resolveOnCorrect 为 true 且答对，会同时把对应错题置已解决。',
        inputSchema: { type: 'object', properties: { questionId: { type: 'string' }, answer: { type: 'string' }, resolveOnCorrect: { type: 'boolean' }, timeSpentMs: { type: 'number' } }, required: ['questionId', 'answer'] },
        async execute(ctx, args) {
          return gradeAnswerRecord(ctx, args);
        },
      }),
      makeTool({
        name: 'wrong.list',
        description: '抽取该学生未解决的错题（用于错题重做冲刺）。返回题目内容与题型，但不含正确作答（保证重做真实性），答对用 answer.grade(resolveOnCorrect:true) 消除。复习错题先调它。',
        inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
        async execute(ctx, args) {
          const limit = Math.min(Number(args.limit) || 5, 20);
          const { rows } = await ctx.store.query(
            `SELECT wq.question_id, q.content, q.type, q.options, q.difficulty, q.knowledge_point_id,
                    wq.student_answer, wq.wrong_count, wq.last_attempt_at, kp.name AS knowledge_point
               FROM edu.wrong_questions wq
               LEFT JOIN edu.questions q ON q.id = wq.question_id
               LEFT JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id
              WHERE wq.user_id = $1 AND wq.is_resolved = false
              LIMIT $2`,
            [ctx.entityId, limit],
          );
          // 拉该生 per-KP 掌握度（与 diagnosis 同源），把错题冲刺按"最弱知识点优先"排序——先练不会的。
          const masteryByKp = new Map<string, number>();
          try {
            const agg = await ctx.store.query(
              `SELECT q.knowledge_point_id AS kp_id,
                      COUNT(ar.id)::int AS attempts,
                      COUNT(ar.id) FILTER (WHERE ar.is_correct)::int AS correct
                 FROM edu.answer_records ar
                 JOIN edu.questions q ON q.id = ar.question_id
                WHERE ar.user_id = $1
                GROUP BY q.knowledge_point_id`,
              [ctx.entityId],
            );
            for (const r of agg.rows || []) {
              const att = r.attempts || 0;
              masteryByKp.set(r.kp_id, att ? (r.correct || 0) / att : 0);
            }
          } catch { /* 掌握度拉取失败不阻断抽题 */ }
          const ranked = (rows || [])
            .map((r: any) => ({
              questionId: r.question_id,
              content: r.content,
              type: r.type,
              options: r.options,
              difficulty: r.difficulty,
              wrongAnswer: r.student_answer,
              wrongCount: r.wrong_count || 1,
              knowledgePoint: r.knowledge_point,
              lastAttemptAt: r.last_attempt_at ? new Date(r.last_attempt_at).getTime() : null,
              kpMasteryPct: Math.round(((masteryByKp.get(r.knowledge_point_id) ?? 0) || 0) * 100),
            }))
            .sort((a: any, b: any) => {
              // 最弱知识点优先 ⇒ (1-mastery) 大者前；同弱点再按错次多、最近错优先
              const ag = 1 - a.kpMasteryPct / 100;
              const bg = 1 - b.kpMasteryPct / 100;
              if (bg - ag !== 0) return bg - ag;
              if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
              return (b.lastAttemptAt ?? 0) - (a.lastAttemptAt ?? 0);
            })
            .slice(0, limit)
            .map(({ lastAttemptAt: _la, ...q }: any) => q);
          return {
            entityId: ctx.entityId,
            total: ranked.length,
            questions: ranked,
          };
        },
      }),
      makeTool({
        name: 'review.sequence',
        description:
          '为该学生生成一道自适应复习序列：按每个知识点的掌握度缺口（越弱越靠前）+ SM-2 记忆曲线间隔（edu.sr_queue 到期日越近越优先，已在册未到期自动下沉、刚练过的沉底）+ 短期答错惩罚（最近一次作答≤3天前且答错的题浮上来尽早重练）给候选题排序，返回一段有序出的题。复习/巩固/自适应出题前先调它；判读仍走 answer.grade（会自动演进间隔队列）。',
        inputSchema: {
          type: 'object',
          properties: {
            size: { type: 'number', description: '想要的数量（默认 5，上限 10）' },
            weakKnowledgePointIds: { type: 'array', items: { type: 'string' }, description: '可选：限定复习知识点，缺省为该生做过题的所有知识点按掌握度排序' },
          },
        },
        async execute(ctx, args) {
          const size = Math.min(Number(args.size) || 5, 10);
          // 1) 每知识点掌握度（复用 diagnosis 的念头：answer_records→questions→kps）
          const agg = await ctx.store.query(
            `SELECT kp.id AS kp_id, kp.name AS kp_name,
                    COUNT(ar.id)::int AS attempts,
                    COUNT(ar.id) FILTER (WHERE ar.is_correct)::int AS correct
               FROM edu.answer_records ar
               JOIN edu.questions q ON q.id = ar.question_id
               JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id
              WHERE ar.user_id = $1
              GROUP BY kp.id, kp.name`,
            [ctx.entityId],
          );
          const masteryById = new Map<string, number>();
          const kpNameById = new Map<string, string>();
          for (const r of agg.rows || []) {
            const attempts = r.attempts || 0;
            const correct = r.correct || 0;
            masteryById.set(r.kp_id, attempts ? correct / attempts : 0);
            kpNameById.set(r.kp_id, r.kp_name);
          }
          // 2) 候选知识点：限定则用给定 id（不认识的 id 忽略）；缺省用该生做过的全部
          let kpIds: string[];
          if (Array.isArray(args.weakKnowledgePointIds) && args.weakKnowledgePointIds.length) {
            kpIds = args.weakKnowledgePointIds.filter((id: string) => masteryById.has(id));
          } else {
            kpIds = [...masteryById.keys()];
          }
          if (!kpIds.length) {
            return { entityId: ctx.entityId, total: 0, questions: [], note: '该学生还没有作答记录，先做几道题我才能排出复习序列。' };
          }
          // 3) 拉候选题目 + 每题的 SM-2 间隔信号（edu.sr_queue.next_review 到期日；无档案时回退到 answer_records.created_at 距作答时长）
          const { rows } = await ctx.store.query(
            `SELECT q.id AS question_id, q.content, q.type, q.options, q.difficulty, q.knowledge_point_id,
                    MAX(CASE WHEN ar.created_at IS NOT NULL THEN ar.created_at ELSE NULL END) AS last_attempt_at,
                    MAX(CASE WHEN ar.is_correct = false THEN ar.created_at END) AS last_wrong_at,
                    MAX(sq.next_review) AS next_review
               FROM edu.questions q
               LEFT JOIN edu.answer_records ar
                 ON ar.question_id = q.id AND ar.user_id = $1
               LEFT JOIN edu.sr_queue sq
                 ON sq.question_id = q.id AND sq.user_id = $1
              WHERE q.knowledge_point_id = ANY($2::uuid[])
              GROUP BY q.id, q.knowledge_point_id`,
            [ctx.entityId, kpIds],
          );
          // 4) 自适应排序（SM-2 记忆曲线 + 短期答错惩罚）：score = gap*10 + spacingDays + wrongBoost。
          //    gap 越大(掌握度越低)越前；到期越近/越逾期越前。有 sr_queue.next_review 时按到期算——
          //    逾期(N 天前到期)=14+min(逾期天数,7)、N 天后到期=14-N(未到期自动预降，长期在册自动沉底)；
          //    无档案(原生新卡/历史作答)回退:距上次作答线性 0..14，从未做过按 14 满分。
          //    短期惩罚：最近一次作答是答错且 ≤3 天前 → wrongBoost=5 浮上来尽早重练（刚错的题不因间隔曲线被久延）。
          const now = Date.now();
          const ranked = (rows || [])
            .map((r: any) => {
              const mastery = masteryById.get(r.knowledge_point_id) ?? 0;
              const gap = 1 - mastery;
              const nrMs = r.next_review ? new Date(r.next_review).getTime() : null;
              const lastTs = r.last_attempt_at ? new Date(r.last_attempt_at).getTime() : null;
              const lastWrongTs = r.last_wrong_at ? new Date(r.last_wrong_at).getTime() : null;
              // 最近一次作答是答错（last_wrong_at 就是 last_attempt_at 那条）且 3 天内 → 短期重练
              const recentWrong = !!(
                lastWrongTs != null &&
                lastTs != null &&
                Math.abs(lastWrongTs - lastTs) < 2000 &&
                (now - lastWrongTs) / 86_400_000 < 3
              );
              const wrongBoost = recentWrong ? 5 : 0;
              let spacingDays: number;
              let dueDays: number;
              if (nrMs != null) {
                const days = (nrMs - now) / 86_400_000;
                dueDays = Math.round(days);
                spacingDays = days > 0 ? Math.max(0, 14 - days) : 14 + Math.min(-days, 7);
              } else if (lastTs != null) {
                const since = Math.max(0, (now - lastTs) / 86_400_000);
                spacingDays = Math.min(since, 14);
                dueDays = -Math.min(since, 21);
              } else {
                spacingDays = 14;
                dueDays = 0;
              }
              const score = gap * 10 + spacingDays + wrongBoost;
              return {
                questionId: r.question_id,
                kpId: r.knowledge_point_id,
                kpName: kpNameById.get(r.knowledge_point_id) ?? r.knowledge_point_id,
                content: r.content,
                type: r.type,
                options: r.options,
                difficulty: r.difficulty,
                masteryPct: Math.round(mastery * 100),
                spacingDays: Math.round(spacingDays * 10) / 10,
                dueDays: Math.round(dueDays),
                recentWrong,
                wrongBoost,
                score: Math.round(score * 100) / 100,
              };
            })
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, size)
            // 稳定去重：同知识点也允许多题，但同题只出现一次
            .filter((v: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.questionId === v.questionId) === i);
          return {
            entityId: ctx.entityId,
            total: ranked.length,
            strategy: 'mastery_gap + sm2_spacing (edu.sr_queue 到期日驱动)',
            questions: ranked,
          };
        },
      }),
      makeTool({
        name: 'memory.recall',
        description: '读回该学生已存记忆（偏好/事实/掌握度），用于个性化。',
        async execute(ctx, args) {
          void args;
          const facts = await ctx.memory.list(ctx.entityId, { limit: 20 });
          return facts;
        },
      }),
      makeTool({
        name: 'memory.remember',
        description: '存一条关于该学生的长期记忆（偏好/事实），供以后所有会话使用。',
        inputSchema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'] },
        async execute(ctx, args) {
          await ctx.memory.set(ctx.entityId, args.key, args.value, 1);
          return { saved: true, key: args.key };
        },
      }),
      makeTool({
        name: 'memory.forget',
        description: '删除该学生的一条长期记忆（当它已过时/记错/学生明确说"忘掉"时用）。key 与 memory.remember 写入的一致。',
        inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
        async execute(ctx, args) {
          await ctx.memory.delete(ctx.entityId, args.key);
          return { forgot: true, key: args.key };
        },
      }),
      makeTool({
        name: 'lesson.current',
        description:
          '驱动一节课：针对一个知识点的授课状态机，把「问答判题」升级为「设案→讲解→例题→再练」。' +
          '学生想「上课/讲解/教我/学某知识点」时用它；状态存于该生长期记忆 lesson:<kpId>，跨消息保持"正在上到第几步"。' +
          '各阶段返回真实数据：assess=摸底(该KP该生真实掌握度+未解决错题)、teach=讲解(该生该KP最近一次实际答错的写法,作"一题一错因")、example=讲一道该KP真题、drill=再练(该KP一道真题,判读仍走 answer.grade)。' +
          '每讲完一步，带上 stage 参数推进到下一步(assess→teach→example→drill→complete)，否则复用已推进的阶段。',
        inputSchema: { type: 'object', properties: { kpId: { type: 'string' }, stage: { type: 'string', enum: ['assess', 'teach', 'example', 'drill', 'complete'] } }, required: ['kpId'] },
        async execute(ctx, args) {
          if (!args.kpId) return { success: false, error: 'kpId 必填', kpId: null };
          const kpId = args.kpId;
          const mem = ctx.memory; // 可能为 undefined（无 key/mock 路径）→ 状态不持久化但不阻断授课
          const memKey = `lesson:${kpId}`;
          // 读当前阶段（跨消息续课）；LLM 显式带 stage 则推进
          let state: any = {};
          if (mem) { try { state = (await mem.get(ctx.entityId, memKey)) || {}; } catch { state = {}; } }
          const stage = (args.stage as string) || state.stage || 'assess';
          const next = stage === 'assess' ? 'teach' : stage === 'teach' ? 'example' : stage === 'example' ? 'drill' : stage === 'drill' ? 'complete' : null;
          // 该KP名称
          const kp = await ctx.store.query('SELECT name FROM edu.knowledge_points WHERE id = $1', [kpId]);
          const kpName = kp.rows?.[0]?.name ?? kpId;
          let anchor: any = {};
          if (stage === 'assess') {
            // 摸底：该KP该生真实作答聚合 + 该KP未解决错题数
            const [a, w] = await Promise.all([
              ctx.store.query(
                `SELECT kp.id AS kp_id, kp.name AS kp_name,
                        COUNT(ar.id)::int AS attempts,
                        COUNT(ar.id) FILTER (WHERE ar.is_correct)::int AS correct
                   FROM edu.knowledge_points kp
                   LEFT JOIN edu.questions q ON q.knowledge_point_id = kp.id
                   LEFT JOIN edu.answer_records ar ON ar.question_id = q.id AND ar.user_id = $1
                  WHERE kp.id = $2
                  GROUP BY kp.id, kp.name`,
                [ctx.entityId, kpId],
              ),
              ctx.store.query(
                `SELECT count(*)::int AS n
                   FROM edu.wrong_questions wq
                   JOIN edu.questions q ON q.id = wq.question_id
                  WHERE wq.user_id = $1 AND q.knowledge_point_id = $2 AND wq.is_resolved = false`,
                [ctx.entityId, kpId],
              ),
            ]);
            const row = a.rows?.[0] || {};
            const attempts = row.attempts || 0;
            anchor = { mastery: attempts ? Math.round(((row.correct || 0) / attempts) * 100) : 0, attempts, unresolvedWrong: w.rows?.[0]?.n ?? 0, baseline: attempts ? Math.round(((row.correct || 0) / attempts) * 100) : 0 };
          } else if (stage === 'teach') {
            // 错因：优先讲"这次答错"(授课状态里 lesson.submit 存的本错)；无则回退该KP最近一次实际答错的作答
            const targetedWrong = state.lastWrongAnswer && String(state.lastWrongAnswer).trim();
            if (targetedWrong) {
              anchor = { wrongAnswer: String(state.lastWrongAnswer), targeted: true };
            } else {
              const { rows } = await ctx.store.query(
                `SELECT ar.student_answer
                   FROM edu.answer_records ar
                   JOIN edu.questions q ON q.id = ar.question_id
                  WHERE ar.user_id = $1 AND q.knowledge_point_id = $2 AND ar.is_correct = false
                  ORDER BY ar.created_at DESC NULLS LAST LIMIT 1`,
                [ctx.entityId, kpId],
              );
              anchor = { wrongAnswer: rows?.[0]?.student_answer ?? null, targeted: false };
            }
          } else if (stage === 'example' || stage === 'drill') {
            // 例题 / 再练：该KP抽一道真题（真实题面；判读走 answer.grade）
            const { rows } = await ctx.store.query(
              `SELECT q.id AS question_id, q.content, q.type, q.options, q.difficulty
                 FROM edu.questions q
                WHERE q.knowledge_point_id = $1
                ORDER BY random() LIMIT 1`,
              [kpId],
            );
            const q = rows?.[0];
            anchor = q ? { questionId: q.question_id, content: q.content, type: q.type, options: q.options, difficulty: q.difficulty } : { question: null };
          }
          // 持久化推进后的阶段 + 授课数据锚(跨消息续课)：example/drill 记 lastQuestion, assess 记 baseline，lesson.submit 据此回授。
          if (mem) {
            try {
              const persist = { stage, kpId, updatedAt: new Date().toISOString() } as any;
              if ((stage === 'example' || stage === 'drill') && anchor.questionId) persist.lastQuestion = anchor.questionId;
              else if (state.lastQuestion) persist.lastQuestion = state.lastQuestion;
              if (typeof anchor.baseline === 'number') persist.baseline = anchor.baseline;
              else if (state.baseline != null) persist.baseline = state.baseline;
              if (state.lastWrongAnswer) persist.lastWrongAnswer = state.lastWrongAnswer; // 本轮错因带过 teach→example→drill,直至判对清除
              await mem.set(ctx.entityId, memKey, persist, 1);
            } catch { /* 状态未持久化不阻断 */ }
          }
          return {
            success: true,
            kpId,
            kpName,
            stage,
            next,
            state,
            hint: next ? `已到「${stage}」步，讲完带 stage:"${next}" 推进下一步。` : `该课已完成，可再用 lesson.current 开新课。`,
            ...anchor,
          };
        },
      }),
      makeTool({
        name: 'lesson.submit',
        description:
          '提交授课进程中抢时段(drill/example)的一道题作答：判题并落库(practice.answer 与 lesson 分享同一 gradeAnswerRecord，答对可消错题)。随后把结果耦送到授课状态机 lesson:<kpId>：答对则推进到 complete 并记 drillDone=true/lastCorrect=true；答错则留在 drill 记 lastCorrect=false/missedCount+1(回到 lesson.current 结论再练)。返回当次判定与该KP当前真实掌握度 practiceMastery(含 baseline 提升,即「回授掌握度」)。学生抢时作答后必须调它，别再用裸 answer.grade 以免状态机不推进。',
        inputSchema: {
          type: 'object',
          properties: {
            kpId: { type: 'string', description: '授课知识点ID' },
            questionId: { type: 'string', description: '作答的题目ID；缺省回退到授课状态机记的 lastQuestion' },
            answer: { type: 'string', description: '学生作答内容' },
          },
          required: ['kpId', 'answer'],
        },
        async execute(ctx, args) {
          const kpId = String(args.kpId ?? '');
          const answer = String(args.answer ?? '');
          const questionId = String(args.questionId ?? '');
          const mem = ctx.memory;
          let state: any = {};
          let memKey = '';
          if (mem) {
            memKey = `lesson:${kpId}`;
            try { state = (await mem.get(ctx.entityId, memKey)) ?? {}; } catch { state = {}; }
          }
          // 题目ID缺省回退到授课状态上次下发的题
          const gradeId = questionId || state.lastQuestion || '';
          if (!gradeId) {
            return { success: false, error: '缺少 questionId，且授课状态无 lastQuestion(需要先用 lesson.current 下发例题/再练题)' };
          }
          // 同源判题+落库(与 answer.grade 完全一致)
          const graded: any = await gradeAnswerRecord(ctx, { questionId: gradeId, answer, resolveOnCorrect: true });
          const isCorrect = !!graded.isCorrect;
          // 回授掌握度：该KP当前真实掌握度 + baseline 提升（先算,状态机与落盘都要用）
          let practiceMastery = 0;
          let baseline: number | null = typeof state.baseline === 'number' ? state.baseline : null;
          try {
            const { rows } = await ctx.store.query(
              `SELECT COUNT(ar.id) FILTER (WHERE ar.is_correct)::int AS correct, COUNT(ar.id)::int AS attempts
                 FROM edu.answer_records ar
                 JOIN edu.questions q ON q.id = ar.question_id
                WHERE ar.user_id = $1 AND q.knowledge_point_id = $2`,
              [ctx.entityId, kpId],
            );
            const rc = rows?.[0];
            const attempts = rc?.attempts || 0;
            if (attempts) practiceMastery = Math.round(((rc.correct || 0) / attempts) * 100);
          } catch { /* 掌握度查询失败不阻断 */ }
          // 耦合回授课状态机：答对推进,答错留练，并累计练习次数/漏档
          let stage = 'drill';
          let drillDone = false;
          let lastCorrect = false;
          const nextState: any = {
            stage,
            kpId,
            lastQuestion: gradeId,
            attempts: (state.attempts ?? 0) + 1,
            missedCount: (state.missedCount ?? 0) + (isCorrect ? 0 : 1),
            practiceMastery,
            baseline,
            delta: baseline != null ? practiceMastery - baseline : null,
            updatedAt: new Date().toISOString(),
          };
          if (isCorrect) {
            stage = 'complete';
            drillDone = true;
            lastCorrect = true;
            nextState.stage = stage;
            nextState.lastCorrect = true;
            nextState.drillDone = true;
            nextState.lastWrongAnswer = null; // 答对收束,清掉这次错因
          } else {
            nextState.lastCorrect = false;
            nextState.lastWrongAnswer = answer; // 把"这次答错的写法"耦合进状态,teach 据此重讲本错
          }
          if (mem) {
            try { await mem.set(ctx.entityId, memKey, nextState, 1); } catch { /* 状态未持久化不阻断 */ }
          }
          // 答对收束 → 落盘一节课（best-effort，失败不阻断判题返回；在 mem.set 后调用,lessonRecord 读到含 practiceMastery/delta 的新状态）
          let recordId: string | null = null;
          if (isCorrect) {
            try {
              const rec = await lessonRecord(ctx, { kpId, outcome: 'completed' });
              recordId = rec?.recordId ?? null;
            } catch { /* 落盘失败不阻断 */ }
          }
          return {
            success: true,
            kpId,
            questionId: gradeId,
            isCorrect,
            correct: isCorrect,
            stage,
            next: stage === 'complete' ? null : stage,
            drillDone,
            lastCorrect,
            attempts: nextState.attempts,
            missedCount: nextState.missedCount,
            resolved: graded.resolved,
            sm2: graded.sm2,
            practiceMastery,
            baseline,
            delta: baseline != null ? practiceMastery - baseline : null,
            recordId,
            wrongAnswer: isCorrect ? null : answer,
            targeted: !isCorrect,
            suggestedNext: isCorrect ? null : 'teach',
            hint: isCorrect
              ? `答对!该课完成,当前掌握度 ${practiceMastery}%${baseline != null ? `(摸底 ${baseline}%,提升 ${practiceMastery - baseline}%)` : ''}。`
              : `答错了。你的答案「${answer}」不对——重讲时会专门讲解这个写法错在哪,再练一次。`,
          };
        },
      }),
      makeTool({
        name: 'progress.trend',
        description:
          '返回该学生各知识点的答题掌握度随时间变化的时间序列（由 edu.answer_records 按天累计真实作答得到），用于判断进步/退步。学生问「我有没有进步/学得怎么样/练得对不对」时先调它。',
        inputSchema: { type: 'object', properties: {}, required: [] },
        async execute(ctx, args) {
          void args;
          const entityId = ctx.entityId;
          // 按天分桶：作答正确/次数（同源 diagnosis 的聚合，仅多按天分组，保证趋势与掌握度一致）
          const { rows } = await ctx.store.query(
            `SELECT q.knowledge_point_id AS kp_id, kp.name AS kp_name,
                    date_trunc('day', ar.created_at)::date AS day,
                    COUNT(*)::int AS attempts,
                    COUNT(ar.id) FILTER (WHERE ar.is_correct)::int AS correct
               FROM edu.answer_records ar
               JOIN edu.questions q ON q.id = ar.question_id
               JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id
              WHERE ar.user_id = $1
              GROUP BY q.knowledge_point_id, kp.name, date_trunc('day', ar.created_at)
              ORDER BY day ASC`,
            [entityId],
          );
          // 每 KP 按天累进掌握度 → 时间序列 + 首末差值
          const byKp = new Map<string, any>();
          for (const r of rows || []) {
            const kp = byKp.get(r.kp_id) ?? {
              kpId: r.kp_id,
              kpName: r.kp_name,
              attempts: 0,
              correct: 0,
              series: [] as { day: string; mastery: number }[],
            };
            kp.attempts += r.attempts || 0;
            kp.correct += r.correct || 0;
            const mastery = kp.attempts ? Math.round((kp.correct / kp.attempts) * 100) : 0;
            kp.series.push({ day: String(r.day).slice(0, 10), mastery });
            byKp.set(r.kp_id, kp);
          }
          const knowledgePoints = [...byKp.values()].map((k: any) => {
            const first = k.series[0];
            const last = k.series[k.series.length - 1];
            return {
              kpId: k.kpId,
              kpName: k.kpName,
              currentMastery: last?.mastery ?? 0,
              deltaPts: first && last ? last.mastery - first.mastery : 0,
              days: k.series.length,
              series: k.series,
            };
          });
          return {
            knowledgePoints,
            hasHistory: knowledgePoints.some((k: any) => k.days >= 2),
            note: knowledgePoints.length ? '' : '还没有作答记录，暂无法看趋势。',
          };
        },
      }),
      makeTool({
        name: 'diagnosis.state',
        description:
          '汇总并刷新该学生的真实学习状态：按知识点算作答掌握度、按知识点归并未解决错题，并把最新掌握度写回掌握度快照表。诊断缺口/进度前先调它。',
        async execute(ctx, args) {
          void args;
          const entityId = ctx.entityId;
          // 1) per-KP 作答掌握度（edu.answer_records → questions → knowledge_points）
          const agg = await ctx.store.query(
            `SELECT kp.id AS kp_id, kp.name AS kp_name,
                    COUNT(ar.id)::int AS attempts,
                    COUNT(ar.id) FILTER (WHERE ar.is_correct)::int AS correct,
                    ROUND(AVG(ar.time_spent_ms))::int AS avg_time_ms
               FROM edu.answer_records ar
               JOIN edu.questions q ON q.id = ar.question_id
               JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id
              WHERE ar.user_id = $1
              GROUP BY kp.id, kp.name`,
            [entityId],
          );
          // 2) 未解决错题按 KP 名归并（wrong_questions.knowledge_point 是文本）
          const wr = await ctx.store.query(
            `SELECT wq.knowledge_point AS kp_name, COUNT(*)::int AS count
               FROM edu.wrong_questions wq
              WHERE wq.user_id = $1 AND wq.is_resolved = false
              GROUP BY wq.knowledge_point`,
            [entityId],
          );
          const knowledgePoints = (agg.rows || []).map((r: any) => {
            const attempts = r.attempts || 0;
            const correct = r.correct || 0;
            return {
              kpId: r.kp_id,
              kpName: r.kp_name,
              attempts,
              correct,
              mastery: attempts ? Math.round((correct / attempts) * 100) : 0,
              avgTimeSec: r.avg_time_ms != null ? Math.round(r.avg_time_ms / 1000) : null,
            };
          });
          const unresolvedByKp = (wr.rows || []).map((r: any) => ({ kpName: r.kp_name, count: r.count }));
          const totalAttempts = knowledgePoints.reduce((s: number, k: any) => s + k.attempts, 0);
          const totalCorrect = knowledgePoints.reduce((s: number, k: any) => s + k.correct, 0);
          // 3) 把最新掌握度吃进 mastery_snapshots（每 生每 KP 一行，UPSERT）——运行时真正维护掌握度模型
          for (const k of knowledgePoints) {
            try {
              await ctx.store.query(
                `INSERT INTO edu.mastery_snapshots (user_id, knowledge_point_id, mastery_score, confidence_level, calculated_at)
                 VALUES ($1, $2, $3, $4, NOW())
                 ON CONFLICT (user_id, knowledge_point_id) DO UPDATE
                   SET mastery_score = EXCLUDED.mastery_score,
                       confidence_level = EXCLUDED.confidence_level,
                       calculated_at = NOW()`,
                [entityId, k.kpId, k.mastery, k.attempts > 0 ? Math.min(1, k.attempts / 20) : 0],
              );
            } catch { /* 快照写失败不阻断诊断 */ }
          }
          return {
            entityId,
            totalAttempts,
            totalCorrect,
            accuracy: totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
            totalUnresolved: (wr.rows || []).reduce((s: number, r: any) => s + (r.count || 0), 0),
            knowledgePoints,
            unresolvedByKp,
          };
        },
      }),
      makeTool({
        name: 'plan.generate',
        description: '把弱项知识点落成个性化学习计划：对每个弱知识点评判一条温习练习，写入学习计划表，计划在「学习计划」页可见。',
        inputSchema: {
          type: 'object',
          properties: { weakKnowledgePointIds: { type: 'array', items: { type: 'string' } } },
          required: ['weakKnowledgePointIds'],
        },
        async execute(ctx, args) {
          const entityId = ctx.entityId;
          const ids: string[] = (args.weakKnowledgePointIds || []).slice(0, 8);
          if (!ids.length) return { ok: false, reason: '未提供弱项知识点(weakKnowledgePointIds)' };
          // 1) 先归档未完成的同类计划，避免计划堆叠
          await ctx.store.query(
            `UPDATE edu.learning_plans SET status = 'archived'
              WHERE user_id = $1 AND status = 'active' AND plan_type = 'personalized'`,
            [entityId],
          );
          // 2) 取每个弱 KPs 的名称 + 抽一题作温习任务
          const { rows: kps } = await ctx.store.query(
            `SELECT id, name, subject FROM edu.knowledge_points WHERE id = ANY($1::uuid[])`,
            [ids],
          );
          const tasks = [];
          for (const k of kps || []) {
            const { rows: qs } = await ctx.store.query(
              `SELECT id FROM edu.questions WHERE knowledge_point_id = $1 ORDER BY random() LIMIT 1`,
              [k.id],
            );
            tasks.push({
              kpId: k.id,
              kpName: k.name,
              taskType: 'review',
              title: `温习「${k.name}」`,
              subject: k.subject ?? null,
              questionId: qs[0] ? qs[0].id : null,
            });
          }
          // 3) 落库一行个性化计划
          const { rows: plans } = await ctx.store.query(
            `INSERT INTO edu.learning_plans (user_id, title, plan_type, plan_data, total_tasks, completed_tasks, status, start_date, end_date)
             VALUES ($1, $2, 'personalized', $3::jsonb, $4, 0, 'active', CURRENT_DATE, CURRENT_DATE + INTERVAL '7 days')
             RETURNING id`,
            [entityId, `个性化学习计划（${tasks.length} 个弱项）`, JSON.stringify({ tasks, generatedAt: new Date().toISOString() }), tasks.length],
          );
          const planId = plans[0]?.id ?? null;
          return { ok: true, planId, title: `个性化学习计划（${tasks.length} 个弱项）`, totalTasks: tasks.length, tasks };
        },
      }),
      makeTool({
        name: 'lesson.record',
        description:
          '把一节上完的课收束落盘到 edu.learning_plans（plan_type=\'lesson\'）：plan_data 存该课真实结果（授课阶段/摸底/当前掌握度/提升增量/连错数/作答数），status 直接取 outcome（一次性历史记录,不归档不堆叠）。授课完成(答对收束)后由 lesson.submit 自动调用，也可显式调用补录历史课。运营台总览可见"上了多少节课"。',
        inputSchema: {
          type: 'object',
          properties: {
            kpId: { type: 'string', description: '本课知识点ID' },
            kpName: { type: 'string', description: '本课知识点名称(可选,缺省查库)' },
            outcome: { type: 'string', enum: ['completed', 'abandoned'], description: '本课结局(缺省 completed)' },
          },
          required: ['kpId'],
        },
        async execute(ctx, args) {
          return lessonRecord(ctx, args);
        },
      }),
      makeTool({
        name: 'plan.complete',
        description:
          '把个性化学习计划中的一条任务标记为已完成：答对会回灌该知识点的掌握度快照并消除对应未解决错题；全部任务完成时自动把计划置为「已完成」。学生做完一条任务后调它。',
        inputSchema: {
          type: 'object',
          properties: {
            planId: { type: 'string' },
            taskIndex: { type: 'integer', description: '该任务在 plan_data.tasks 中的下标(从 0 起)' },
            correct: { type: 'boolean', description: '这条任务是否答对(缺省视为答对)' },
          },
          required: ['planId', 'taskIndex'],
        },
        async execute(ctx, args) {
          const entityId = ctx.entityId;
          // 所有权铁律: 仅能取属于自己的计划, 杜绝跨学生访问
          const { rows } = await ctx.store.query(
            `SELECT id, title, plan_data, total_tasks, completed_tasks, status
               FROM edu.learning_plans
              WHERE id = $1 AND user_id = $2`,
            [args.planId, entityId],
          );
          const plan = rows[0];
          if (!plan) return { ok: false, reason: '未找到该学习计划（或不属于当前学生）' };
          const tasks: any[] = Array.isArray(plan.plan_data?.tasks) ? plan.plan_data.tasks : [];
          const idx = Number(args.taskIndex);
          if (!Number.isInteger(idx) || idx < 0 || idx >= tasks.length) {
            return { ok: false, reason: `taskIndex 越界（该计划共 ${tasks.length} 条任务）` };
          }
          const task = tasks[idx];
          task.completed = true;
          task.completedAt = new Date().toISOString();
          const total = Number(plan.total_tasks) || tasks.length;
          const completedTasks = tasks.filter((t: any) => t.completed).length;
          const progress = total ? Math.round((completedTasks / total) * 10000) / 100 : 0;
          const isComplete = completedTasks >= total;
          const nextStatus = isComplete ? 'completed' : plan.status === 'completed' ? 'completed' : 'active';
          let masteryBump: number | null = null;
          // 回灌: 答对 → 消除对应未解决错题 + 抬升该知识点掌握度快照
          if (args.correct !== false && task.kpId) {
            if (task.questionId) {
              try {
                await ctx.store.query(
                  `UPDATE edu.wrong_questions SET is_resolved = true
                    WHERE user_id = $1 AND question_id = $2 AND is_resolved = false`,
                  [entityId, task.questionId],
                );
              } catch { /* 消除错题失败不阻断完成 */ }
            }
            try {
              const cur = await ctx.store.query(
                `SELECT mastery_score FROM edu.mastery_snapshots WHERE user_id = $1 AND knowledge_point_id = $2`,
                [entityId, task.kpId],
              );
              const curV = cur.rows[0]?.mastery_score ?? null;
              const newV = curV == null ? 60 : Math.min(100, curV + 10);
              await ctx.store.query(
                `INSERT INTO edu.mastery_snapshots (user_id, knowledge_point_id, mastery_score, confidence_level, calculated_at)
                 VALUES ($1, $2, $3, 0.8, NOW())
                 ON CONFLICT (user_id, knowledge_point_id) DO UPDATE
                   SET mastery_score = EXCLUDED.mastery_score,
                       confidence_level = EXCLUDED.confidence_level,
                       calculated_at = NOW()`,
                [entityId, task.kpId, newV],
              );
              masteryBump = newV;
            } catch { /* 快照回灌失败不阻断完成 */ }
          }
          await ctx.store.query(
            `UPDATE edu.learning_plans SET plan_data = $3::jsonb, completed_tasks = $4, progress = $5, status = $6, updated_at = NOW()
             WHERE id = $1 AND user_id = $2`,
            [plan.id, entityId, JSON.stringify(plan.plan_data), completedTasks, progress, nextStatus],
          );
          return {
            ok: true,
            planId: plan.id,
            title: plan.title,
            taskIndex: idx,
            taskTitle: task.title ?? task.kpName ?? null,
            completedTasks,
            totalTasks: total,
            progress,
            status: nextStatus,
            isComplete,
            masteryBump,
          };
        },
      }),
      makeTool({
        // 版图探索（0.4.0 学科知识版图）：山体摘要——学生在山的哪里/前方是什么/顶峰之外有什么。
        // 与 /api/curriculum/knowledge-map 同源同数据（直读 knowledge_area/area_prerequisite）。
        name: 'map.explorer',
        description:
          '探索学科知识版图（登山视图）：给学科/年级，返回该学科全学段知识山体摘要——当前位置（该年级已学知识域）、前方待攀（更高年级知识域）、峰外地带（K12 之后的学科前沿）。学生问「这门学科都学什么/我学到哪了/以后学什么/这门课的尽头是什么/山顶之外有什么」时调它，用山体比喻给学生讲清全貌与位置感。',
        inputSchema: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: '学科 code（math/chn/eng/phys/chem/bio，缺省用学生当前学科）' },
            gradeLevel: { type: 'number', description: '年级数字 1-12（缺省用学生档案年级）' },
          },
        },
        async execute(ctx, args) {
          const subject = String(args.subject ?? ctx.student?.subject ?? 'math').toLowerCase();
          const gradeLevel = Number(args.gradeLevel ?? ctx.student?.gradeLevel ?? 7);
          const subj = (await ctx.store.query(
            `SELECT id, code, name FROM ontology.subject WHERE LOWER(code) = LOWER($1)`,
            [subject],
          )).rows[0];
          if (!subj) return { ok: false, reason: `未知学科：${subject}` };
          const areas = (await ctx.store.query(
            `SELECT code, name, description, scope, grade_level
               FROM ontology.knowledge_area
              WHERE subject_id = $1 AND status = 'published'
              ORDER BY grade_level NULLS LAST, code`,
            [subj.id],
          )).rows;
          if (!areas.length) return { ok: false, reason: `学科 ${subj.name} 版图尚未灌库` };
          const k12 = areas.filter((a: any) => a.scope === 'k12');
          const frontier = areas.filter((a: any) => a.scope === 'frontier');
          const passed = k12.filter((a: any) => a.grade_level < gradeLevel);
          const current = k12.filter((a: any) => a.grade_level === gradeLevel);
          const ahead = k12.filter((a: any) => a.grade_level > gradeLevel);
          const coverageRatio = areas.length ? Math.round((k12.length / areas.length) * 100) : 0;
          return {
            ok: true,
            subject: { code: subj.code, name: subj.name },
            studentGrade: gradeLevel,
            stats: {
              totalAreas: areas.length,
              k12Areas: k12.length,
              frontierAreas: frontier.length,
              coverageRatioPct: coverageRatio,
            },
            climbed: passed.map((a: any) => ({ name: a.name, grade: a.grade_level })),
            here: current.map((a: any) => ({ name: a.name, description: a.description })),
            ahead: ahead.map((a: any) => ({ name: a.name, grade: a.grade_level })),
            beyondPeak: frontier.map((a: any) => ({ name: a.name, description: a.description })),
          };
        },
      }),
    ];
  }

  private _teachingTools(): ToolRegistry {
    const registry = new ToolRegistry();
    // 委派工具（B-3c 接入点②「派活儿」）：把独立子任务交给本机外部 agent，父只拿摘要。
    // 底座侧 createDelegateTool 只做工具工厂（不 import 业务/不读 env/不碰密钥）；
    // cwd 白名单与后端注册表在此（宿主配置面）注入。缺省 cliBackends=null → 调用明确失败（不静默）。
    // B-4：宿主在此**包一层**接管 run 生命周期（建 running 行 / 事件落库 / 终态 / async 编排）——
    //      底座 delegate 保持「同步 + onEvent 透传」，DB/async 全在 host（C2）。
    registry.register(this._delegateTool());
    return registry;
  }

  /**
   * 构造**宿主接管**后的 `agent.delegate` 工具（B-4）：
   *   - onEvent 回调孔 → 宿主逐条落 `agent.external_events`（runId 经 ALS 带入，不改工厂签名）；
   *   - schema 增 `mode?: 'sync'|'async'`（缺省 sync，行为与今日逐字一致；async 为 v1 扩展）；
   *   - execute 包一层 → `_delegateExecute`（建行 → 跑 → 落终态）。
   */
  private _delegateTool(): any {
    const raw: any = createDelegateTool({
      cliBackends: this.cliBackends ?? null,
      cwdAllowlist: this._delegateCwdAllowlist(),
      onEvent: (event: any, ctx: any) => void this._onDelegateEvent(event, ctx),
    });
    const inputSchema = {
      ...(raw.inputSchema || {}),
      properties: {
        ...((raw.inputSchema && raw.inputSchema.properties) || {}),
        mode: {
          type: 'string',
          enum: ['sync', 'async'],
          description:
            '执行模式：sync（缺省，等结果一并返回）/ async（立即返回 runId，后台执行；用 /api/v1/agent/delegate/runs 查状态与事件流）',
        },
      },
    };
    return { ...raw, inputSchema, execute: (ctx: any, args: any = {}) => this._delegateExecute(raw, ctx, args) };
  }

  // ---------------------------------------------------------------------------
  // B-4：外部 agent run 生命周期（external_runs / external_events）——全部 best-effort
  // ---------------------------------------------------------------------------

  /** 一次委派：先建 running 行 → 跑 → 落终态（sync/async 统一）。sync 缺省行为与今日逐字一致。 */
  private async _delegateExecute(raw: any, ctx: any, args: any = {}): Promise<any> {
    const entityId = typeof ctx?.entityId === 'string' ? ctx.entityId : null;
    const backend = typeof args.backend === 'string' ? args.backend.trim() : '';
    const goal = typeof args.goal === 'string' ? args.goal.trim() : '';
    const mode: 'sync' | 'async' = args.mode === 'async' ? 'async' : 'sync';
    const runId = randomUUID();
    await this._createExternalRun({ runId, entityId, backend, goal, mode });
    const store = { runId, chain: Promise.resolve() };
    const startedAt = Date.now();

    if (mode === 'async') {
      // 立即返回（对话继续）；后台执行 + 落终态（C4：返回 runId 必有终态）。
      // 后台走**同一路径** raw.execute（沿用 cwd 白名单/DENYLIST/goal 校验 + 进程组超时，不复制校验）。
      void this.delegateAls.run(store, async () => {
        let result: any;
        try {
          result = await raw.execute(ctx, args);
        } catch (e: any) {
          result = { ok: false, backend, error: `委派失败：${e?.message ? e.message : String(e)}` };
        }
        await this._finishExternalRun(runId, result, startedAt, store.chain);
      });
      return { ok: true, async: true, runId, status: 'running', backend };
    }

    // sync：与今日一致的路径，仅多一次 best-effort 落行/落事件（失败静默，不阻断对话）。
    let result: any;
    try {
      result = await this.delegateAls.run(store, () => raw.execute(ctx, args));
    } catch (e: any) {
      result = { ok: false, backend, error: `委派失败：${e?.message ? e.message : String(e)}` };
    }
    await this._finishExternalRun(runId, result, startedAt, store.chain);
    return result;
  }

  /** onEvent 回调孔 → 落 external_events（best-effort；runId 由 ALS 带入；只存 child 派生 kind/data）。 */
  private async _onDelegateEvent(event: any, _ctx: any): Promise<void> {
    const store = this.delegateAls.getStore();
    if (!store) return; // 无 run 上下文 → 不落库（不伪造 run）
    const kind = typeof event?.kind === 'string' ? event.kind : 'unknown';
    const data = event?.data ?? {};
    // 串行链：保事件在库中按发生序落入（bigserial id 单调），供 SSE 增量下发。
    store.chain = store.chain.then(() => this._recordExternalEvent(store.runId, kind, data)).catch(() => {});
    await store.chain;
  }

  /** 建 run 行（status=running）。best-effort：失败静默不阻断对话（与 tool_runs 审计同格）。 */
  private async _createExternalRun(m: { runId: string; entityId: string | null; backend: string; goal: string; mode: 'sync' | 'async' }): Promise<void> {
    if (!m.entityId) return; // 无 entity 真源 → 不建行（所有权铁律：读侧按 entity_id 隔离）
    try {
      await this._store().query(
        `INSERT INTO agent.external_runs (run_id, entity_id, backend, goal, mode, status)
         VALUES ($1, $2, $3, $4, $5, 'running')`,
        [m.runId, m.entityId, m.backend || null, m.goal || null, m.mode],
      );
    } catch { /* best-effort：落库失败不阻断对话 */ }
  }

  /** 落终态（done/failed + summary/exit_code/timed_out/error_code/latency_ms/resume_key）。best-effort。 */
  private async _finishExternalRun(runId: string, result: any, startedAt: number, chain: Promise<void>): Promise<void> {
    try { await chain; } catch { /* 事件队列异常不阻断终态 */ } // 先冲事件队列（保序）再落终态
    const ok = !!(result && result.ok);
    const latencyMs = Date.now() - startedAt;
    try {
      await this._store().query(
        `UPDATE agent.external_runs
            SET status = $2, error_code = $3, summary = $4, exit_code = $5,
                timed_out = $6, resume_key = $7, latency_ms = $8, finished_at = NOW()
          WHERE run_id = $1`,
        [
          runId,
          ok ? 'done' : 'failed',
          ok ? null : this._classifyDelegateError(result),
          ok && typeof result?.summary === 'string' ? result.summary : null,
          Number.isFinite(Number(result?.exitCode)) ? Number(result.exitCode) : null,
          !!result?.timedOut,
          typeof result?.sessionId === 'string' && result.sessionId ? result.sessionId : null,
          latencyMs,
        ],
      );
    } catch { /* best-effort */ }
  }

  /** 单条事件落库（data 只含 child 派生内容；JSON 编码）。best-effort。 */
  private async _recordExternalEvent(runId: string, kind: string, data: any): Promise<void> {
    try {
      await this._store().query(
        `INSERT INTO agent.external_events (run_id, kind, data) VALUES ($1, $2, $3::jsonb)`,
        [runId, kind, JSON.stringify(data ?? {})],
      );
    } catch { /* best-effort：事件落库失败不阻断 */ }
  }

  /**
   * 失败归一为机器码（B-4 §目标4）。先看结构化字段（timedOut/exitCode），再按 delegate 稳定错误文案兜底。
   * 取值集见 EXTERNAL_RUN_ERROR_CODES。
   */
  private _classifyDelegateError(result: any): string {
    if (!result) return 'NONZERO_EXIT';
    if (result.timedOut) return 'TIMEOUT';
    if (result.exitCode != null && Number(result.exitCode) !== 0) return 'NONZERO_EXIT';
    const msg = String(result.error || '');
    if (/未注入 CliBackendRegistry/.test(msg)) return 'REGISTRY_NOT_INJECTED';
    if (/缺少 goal/.test(msg)) return 'GOAL_MISSING';
    if (/缺少 backend/.test(msg)) return 'BACKEND_NOT_FOUND';
    if (/越界/.test(msg)) return 'CWD_DENIED';
    if (/未安装|spawn 失败|未知 CLI 后端/.test(msg)) return 'BACKEND_NOT_FOUND';
    if (/超时/.test(msg)) return 'TIMEOUT';
    if (/空文本/.test(msg)) return 'EMPTY_TEXT';
    return 'NONZERO_EXIT';
  }

  /** 重启对账：宿主启动时把残留 status='running' 的孤儿 run 置 failed/INTERRUPTED（B-4 §目标4）。 */
  async reconcileInterruptedRuns(): Promise<number> {
    try {
      const res = await this._store().query(
        `UPDATE agent.external_runs
            SET status = 'failed', error_code = 'INTERRUPTED', finished_at = NOW()
          WHERE status = 'running'`,
      );
      return res.rowCount ?? 0;
    } catch {
      return 0; // 表未就绪（迁移未跑）/失败 → 静默（best-effort）
    }
  }

  /** 本人最近 run 列表（GET /api/v1/agent/delegate/runs；所有权按 entity_id 隔离）。 */
  async listExternalRuns(entityId: string, limit = 20): Promise<{ runs: any[] }> {
    const n = Math.max(1, Math.min(Number(limit) || 20, 100));
    try {
      const { rows } = await this._store().query(
        `SELECT run_id, backend, goal, mode, resume_key, status, error_code, summary,
                exit_code, timed_out, latency_ms, created_at, finished_at
           FROM agent.external_runs
          WHERE entity_id = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [entityId, n],
      );
      return { runs: rows };
    } catch {
      return { runs: [] };
    }
  }

  /** 单条 run（GET /api/v1/agent/delegate/runs/:runId）——他人/不存在 → null（控制器回 404）。 */
  async getExternalRun(entityId: string, runId: string): Promise<any | null> {
    try {
      const { rows } = await this._store().query(
        `SELECT run_id, backend, goal, mode, resume_key, status, error_code, summary,
                exit_code, timed_out, latency_ms, created_at, finished_at
           FROM agent.external_runs
          WHERE run_id = $1 AND entity_id = $2`,
        [runId, entityId],
      );
      return rows[0] ?? null;
    } catch {
      return null; // runId 非 uuid 等 → 视作不存在（404）
    }
  }

  /**
   * 增量拉某 run 的事件（SSE 面用）：先校验所有权（非本人 → ok:false），再按 (run_id, id) 递增取。
   * @param afterId 只取 id > afterId 的事件（增量）
   */
  async listExternalEvents(entityId: string, runId: string, afterId = 0): Promise<{ ok: boolean; run?: any; events?: any[] }> {
    const run = await this.getExternalRun(entityId, runId);
    if (!run) return { ok: false };
    try {
      const { rows } = await this._store().query(
        `SELECT id, kind, data, created_at
           FROM agent.external_events
          WHERE run_id = $1 AND id > $2
          ORDER BY id ASC
          LIMIT 200`,
        [runId, Number(afterId) || 0],
      );
      return { ok: true, run, events: rows };
    } catch {
      return { ok: true, run, events: [] };
    }
  }

  /** 委派 cwd 白名单（宿主配置面）：AGENT_DELEGATE_CWD_ALLOWLIST（逗号分隔）→ 默认 GRI 工作树。 */
  private _delegateCwdAllowlist(): string[] {
    const raw = process.env.AGENT_DELEGATE_CWD_ALLOWLIST;
    const list = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    return list.length ? list : ['/home/ubantu/GRI'];
  }

  /** 教学技能集：指令并入 system prompt + 携带依赖工具定义（由 AgentCore 统一装载）。 */
  private _teachingSkills(toolDefs: any[]): SkillRegistry {
    return new SkillRegistry().register({
      name: 'tutor',
      description: '学情诊断→讲解→测验的完整教师流程',
      instructions:
        '当学生发起学习请求时：(0) 学生问「该学什么/有哪些章节/教学体系/先学哪部分」时，先用 curriculum.lookup 导航教学体系（按学科/年级查教材章节与知识点），再针对具体知识点讲解或出题；' +
        '学生问「这门学科都学什么/我学到哪了/以后学什么/山顶之外有什么」这类全貌与位置感问题时，改用 map.explorer（学科知识版图）拿山体摘要（已攀/当前/前方/峰外），用登山比喻讲清该生位置与前路；' +
        '(1) 需要摸底就用 question.lookup 抽几题诊断，或先调 diagnosis.state 取该学生的真实作答掌握度与未解决错题，紧扣真实数据给出个性化讲解；' +
        '(2) 依据对错用 answer.grade 讲解知识点；(3) 学生要「诊断/进度/错题」时先调 diagnosis.state；要「计划/学习安排」时先 diagnosis.state 再用 plan.generate 把弱项落成计划，并告知计划已在学习计划页生成；' +
        '(4) 学生报告「做完/完成」某条任务时，用 plan.complete 标记完成并回灌掌握度，答对会消除对应错题，全部完成会把计划置为已完成；' +
        '(5) 记下学生偏好/掌握度用 memory.remember，之后答案要贴合记忆；记忆过时或学生明确说「忘掉/删掉」时用 memory.forget；' +
        '(6) 学生要「复习错题/错题冲刺」时，先调 wrong.list 抽未解决错题让学生重做（工具不回显正确答案，由你判读并讲解），答对用 answer.grade(resolveOnCorrect:true) 消除错题并记作答；答错用 answer.grade 正常记录；' +
        '(7) 学生要「复习巩固/自适应出题/掌握度复习」时，先调 review.sequence 拿按掌握度缺口+间隔排序的题目序列，按序出题并紧扣各题掌握度个性化讲解，判读仍走 answer.grade；' +
        '(8) 学生要「上课/学某知识点/讲解/教我」时，用 lesson.current 驱动授课：它按 assess→teach→example→drill 状态机推进(状态存于该生长期记忆,跨消息续课)，每步返回真实数据（assess=该知识点真实掌握度+未解决错题、teach=该生最近实际答错的写法当错因、example/drill=该知识点真题）；你紧扣这些真实数据讲解。抢时(example/drill)作答、判读、回授一律走 lesson.submit(它判题落库并答对推进 complete/答错留 drill)，不要用裸 answer.grade以免状态机不推进；讲完一步带 stage 推进到下一步。',
      tools: toolDefs,
    });
  }

  /** 无 key mock 路径：确定性应答（合法号形，测试/E2E 稳定）。 */
  private async _mockTeach(ctx: any, o: any, registry?: ToolRegistry): Promise<any> {
    const msg = String(o.userMessage || '').trim();
    const lower = msg.toLowerCase();
    // 「调用 <工具名> [参数JSON]」→ 直接经工具表调一个已注册工具（含 MCP 桥接工具），返回真实结果。
    // 仅 mock 路径用：让无真实 LLM 的 E2E 也能驱动工具执行，证明 bridge→AgentCore 整天链路。
    const call = msg.match(/^调用\s+([a-zA-Z0-9_\-\.]+)(?:\s+(\{.*\}))?\s*$/);
    if (call) {
      const toolName = call[1];
      let args = {};
      if (call[2]) { try { args = JSON.parse(call[2]); } catch { /* 非 JSON 参数 → {} */ } }
      if (registry && registry.has(toolName)) {
        const res = await registry.call(ctx, toolName, args, { onRun: (a) => void this._audit(o.entityId, a) });
        if (res.error) return { success: true, phase: 'teaching', message: `工具「${toolName}」执行失败：${res.error}` };
        const text = typeof res.result === 'string' ? res.result : JSON.stringify(res.result);
        return { success: true, phase: 'teaching', tool: toolName, message: `已调用工具「${toolName}」，结果：${text}` };
      }
      return { success: true, phase: 'teaching', message: `当前没有可用的工具「${toolName}」。可用：${registry ? registry.list().map((t) => t.name).join('、') : '（无）'}` };
    }
    if (/你好|hi|hello/.test(lower)) {
      return { success: true, phase: 'teaching', message: '你好！我是你的专属 AI 教师，想学哪个学科或知识点？' };
    }
    if (/记住|我叫|我喜欢|偏好/.test(lower)) {
      const kv = msg.match(/记住[：:]\s*([^，。]+)/i);
      if (kv) {
        const [k, v] = kv[1].split('=');
        await o.memory.set(o.entityId, 'pref.' + (k || 'note'), v || kv[1], 2);
        return { success: true, phase: 'teaching', message: `好的，我已记住：${kv[1]}（已存入你的长期记忆）。` };
      }
    }
    if (/题目|出题|练一练|测验/.test(lower)) {
      const q = await o.memory.get(o.entityId, 'pref.subject');
      // 通用学科匹配：中文学科名 → code（K12 全学科；不硬编码数学优先）
      const CN_SUBJECTS: Record<string, string> = { 数学: 'math', 语文: 'chn', 英语: 'eng', 物理: 'phys', 化学: 'chem', 生物: 'bio', 历史: 'hist', 地理: 'geo', 政治: 'pol' };
      let subject = q || null;
      if (!subject) {
        for (const [cn, code] of Object.entries(CN_SUBJECTS)) {
          if (msg.includes(cn)) { subject = code; break; }
        }
      }
      subject = subject || 'math';
      return { success: true, phase: 'quizzing', message: `来，做几道 ${subject} 题检验一下掌握度吧。`, subject };
    }
    if (/复习错题|错题冲刺|重做错题|冲刺/.test(lower)) {
      // 错题冲刺：抽未解决错题让学生重做（确定性渲染前 N 道，标题/题面来自工具真实返回）
      if (!registry) return { success: true, phase: 'teaching', message: '我可以帮你安排错题冲刺，请稍后再试。' };
      const res = await registry.call(ctx, 'wrong.list', { limit: 5 }, { onRun: (a: any) => void this._audit(o.entityId, a) });
      const w = res.result || {};
      const items = (w.questions || []).slice(0, 3)
        .map((qq: any, i: number) => `${i + 1}. ${qq.content ?? `题 ${qq.questionId}`}（${qq.knowledgePoint ?? '未标注知识点'}，错 ${qq.wrongCount ?? 1} 次）`)
        .join('\n');
      if (!items) return { success: true, phase: 'teaching', message: '太棒了，当前没有未解决的错题，继续保持！' };
      return { success: true, phase: 'teaching', message: `错题冲刺：还有 ${w.total ?? 0} 道未解决错题。先重做这几道：\n${items}\n答对后我会帮你消除并回灌掌握度。` };
    }
    if (/复习|巩固|自适应出题|回顾/.test(lower)) {
      // 自适应复习序列：按掌握度缺口+间隔出题（确定性渲染前 N 道，题面来自工具真实返回）
      if (!registry) return { success: true, phase: 'teaching', message: '我可以根据你的掌握度排出复习序列，请稍后再试。' };
      const res = await registry.call(ctx, 'review.sequence', { size: 5 }, { onRun: (a: any) => void this._audit(o.entityId, a) });
      const s = res.result || {};
      const items = (s.questions || []).slice(0, 3)
        .map((qq: any, i: number) => `${i + 1}. ${qq.content ?? `题 ${qq.questionId}`}（${qq.kpName ?? '未标注知识点'}，掌握度 ${qq.masteryPct ?? 0}%）`)
        .join('\n');
      if (!items) return { success: true, phase: 'teaching', message: '还没有足够的作答数据排出复习序列，先做几道题吧。' };
      return { success: true, phase: 'teaching', message: `自适应复习（按掌握度缺口+间隔排序）：\n${items}\n我们一道一道来，答对用 answer.grade 记作答。` };
    }
    if (/上课|讲解|教我|学(一下|一学)?\w+知识点|专题|讲(讲|一下)/.test(lower)) {
      // 授课（lesson.current）：针对最弱知识点驱动状态机（assess 起），确定性渲染真实数据锚点。
      if (!registry) return { success: true, phase: 'teaching', message: '我可以针对你的弱项给你上一节课，请稍后再试。' };
      const diag = await registry.call(ctx, 'diagnosis.state', {}, { onRun: (a: any) => void this._audit(o.entityId, a) });
      const kp = (diag.result?.knowledgePoints || []).slice().sort((a: any, b: any) => (a.mastery || 0) - (b.mastery || 0))[0];
      if (!kp) return { success: true, phase: 'teaching', message: '还没有足够的作答数据判断弱项，先做几道题，我就能针对你的弱项上课了。' };
      const res = await registry.call(ctx, 'lesson.current', { kpId: kp.kpId }, { onRun: (a: any) => void this._audit(o.entityId, a) });
      const r = res.result || {};
      return {
        success: true, phase: 'teaching',
        message: `好，我们上一节「${r.kpName}」的课（当前：${r.stage}～掌握度 ${r.mastery ?? 0}%、未解决错题 ${r.unresolvedWrong ?? 0} 道）。` +
          `${r.next ? `下一步是「${r.next}」；对我说「继续」或带 stage 推进。` : '这节课内容讲完了。'}`,
      };
    }
    if (/诊断|错题|掌握度|学情/.test(lower)) {
      // 数据驱动诊断：无真实 LLM 也能经工具表拿到真实掌握度/错题
      if (!registry) return { success: true, phase: 'teaching', message: '我可以帮你诊断学情，请稍后再试。' };
      const res = await registry.call(ctx, 'diagnosis.state', {}, { onRun: (a: any) => void this._audit(o.entityId, a) });
      const d = res.result || {};
      const kps = (d.knowledgePoints || []).map((k: any) => `${k.kpName}(${k.mastery}%)`).join('、');
      return {
        success: true, phase: 'teaching',
        message: `学情诊断（掌握度快照已刷新）：总作答 ${d.totalAttempts ?? 0}，准确率 ${d.accuracy ?? 0}%；` +
          `${kps ? `各知识点掌握度：${kps}；` : '暂无作答数据，学几道题我就能掌握了；'}未解决错题 ${d.totalUnresolved ?? 0} 道。`,
      };
    }
    if (/计划|学习安排/.test(lower)) {
      // 诊断出最薄弱 1 个知识点 → 落成个性化计划（确定性）
      if (!registry) return { success: true, phase: 'teaching', message: '我可以帮你定制学习计划，请稍后再试。' };
      const res = await registry.call(ctx, 'diagnosis.state', {}, { onRun: (a: any) => void this._audit(o.entityId, a) });
      const d = res.result || {};
      const weakest = [...(d.knowledgePoints || [])].sort((a: any, b: any) => a.mastery - b.mastery)[0];
      const weakIds = weakest ? [weakest.kpId] : [];
      const p = await registry.call(ctx, 'plan.generate', { weakKnowledgePointIds: weakIds }, { onRun: (a: any) => void this._audit(o.entityId, a) });
      const plan = p.result || {};
      if (weakIds.length && plan.planId) {
        return { success: true, phase: 'teaching', planId: plan.planId, message: `已把最薄弱知识点「${weakest.kpName}」生成为个性化计划（${plan.totalTasks ?? 0} 项温习任务），可在学习计划页查看。` };
      }
      return { success: true, phase: 'teaching', message: '暂无足够作答数据生成计划，先做几道题我就能帮你定制了。' };
    }
    if (/完成|做完了/.test(lower)) {
      // 计划完成回灌：取进行中最新的个性化计划，完成其第一条未完成任务（答对）
      if (!registry) return { success: true, phase: 'teaching', message: '我可以帮你记录任务完成进度，请稍后再试。' };
      const pl = await this._store().query(
        `SELECT id, plan_data FROM edu.learning_plans WHERE user_id = $1 AND status IN ('active','completed') ORDER BY created_at DESC LIMIT 1`,
        [o.entityId],
      );
      const p = pl.rows[0];
      if (!p) return { success: true, phase: 'teaching', message: '你还没有进行中的个性化学习计划，我可以先帮你生成一个。' };
      const pdata = typeof p.plan_data === 'string' ? JSON.parse(p.plan_data) : (p.plan_data || {});
      const tasks: any[] = Array.isArray(pdata.tasks) ? pdata.tasks : [];
      const i = tasks.findIndex((t: any) => !t.completed);
      if (i < 0) return { success: true, phase: 'teaching', message: '这份计划的全部任务都已完成，太棒了！要我帮你规划新的一批巩固吗？' };
      const res = await registry.call(ctx, 'plan.complete', { planId: p.id, taskIndex: i, correct: true }, { onRun: (a: any) => void this._audit(o.entityId, a) });
      const c = res.result || {};
      if (c.ok === false) return { success: true, phase: 'teaching', message: `标记完成失败：${c.reason ?? '未知原因'}` };
      const done = c.completedTasks ?? 0;
      const total = c.totalTasks ?? 0;
      return {
        success: true, phase: 'teaching',
        message: `已完成「${c.taskTitle ?? `第 ${i + 1} 条`}」(${done}/${total}${c.isComplete ? '，整份计划已完成！' : '，继续加油'}）`,
        planId: c.planId, completedTasks: done, totalTasks: total, isComplete: !!c.isComplete,
      };
    }
    if (/考|成绩|掌握|进度/.test(lower)) {
      const facts = await o.memory.list(o.entityId, { limit: 10 });
      return { success: true, phase: 'teaching', message: facts.length ? `这是你的学习记忆：${facts.map((f: any) => f.key + '=' + JSON.stringify(f.value)).join('；')}` : '目前还没有你的学习记忆，多学一学我就能记住你了。' };
    }
    return { success: true, phase: 'teaching', message: `收到：「${msg}」。我可以帮你诊断、讲解、出题，并记住你的偏好长期陪伴学习。` };
  }

  /** 工具执行审计 → agent.tool_runs（可观测；失败不阻断）。 */
  private async _audit(entityId: string, rec: any): Promise<void> {
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, args, result, latency_ms)
         VALUES ($1, $2, $3, $4, $5)`,
        [entityId, rec.tool_name, rec.args ? JSON.stringify(rec.args) : null, rec.result ? (typeof rec.result === 'string' ? rec.result : JSON.stringify(rec.result)) : rec.error, rec.latency_ms ?? null],
      );
    } catch { /* 审计失败静默，不阻断对话 */ }
  }

  /** 打开某学生的 agent 会话：建实体 + 返回当前可用工具/技能 + 记忆摘要。 */
  async openSession(entityId: string): Promise<any> {
    const { core, memory, entity } = await this._agent(entityId);
    return {
      success: true,
      entityId,
      kind: entity.kind,
      status: entity.status,
      tools: core.listTools().map((t: any) => t.name),
      skills: core.listSkills().map((s: any) => s.name),
      memoryDigest: await memory.digest(entityId, { limit: 20 }),
    };
  }

  /** 学生发一条消息给其专属 AI 教师。 */
  async sendMessage(entityId: string, message: string, opts: any = {}): Promise<any> {
    if (!message || !String(message).trim()) {
      return { success: false, message: '消息不能为空' };
    }
    // 学科兜底：前端显式带 subject（如聊天页选科后）→ persona 注入该学科
    const { core, subject } = await this._agent(entityId, { subject: opts.subject });
    const routeKey = opts.routeKey || 'default';
    const out = await core.run({
      entityId,
      userMessage: String(message),
      routeKey,
    });
    return {
      success: out.success,
      message: out.message,
      phase: out.phase || 'teaching',
      entityId,
      routeKey,
      subject,
    };
  }

  /** 读某学生的全部记忆（个人私有）。 */
  async listMemory(entityId: string): Promise<any> {
    const { memory } = await this._agent(entityId);
    return { success: true, facts: await memory.list(entityId, { limit: 50 }) };
  }

  /** 忘掉一条长期记忆 —— 复用 memory.forget 工具逻辑(不绕 LLM),供面板显式管理记忆。 */
  async forgetMemory(entityId: string, key: string): Promise<any> {
    const { memory } = await this._agent(entityId);
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'memory.forget');
    let result: any;
    try {
      result = await tool!.execute({ store: this._store(), memory, entityId }, { key });
    } catch (e: any) {
      return { success: false, error: String(e?.message || e) };
    }
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, args, result, latency_ms)
         VALUES ($1, 'memory.forget', $2, $3, NULL)`,
        [entityId, JSON.stringify({ key }), result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: result.ok !== false, ...result };
  }

  /** 授课状态机 —— 复用 lesson.current 工具逻辑(不绕 LLM),经该生记忆持久化阶段,供面板/脚本确定性驱动。 */
  async lessonProgress(entityId: string, kpId: string, stage?: string): Promise<any> {
    const { memory } = await this._agent(entityId);
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'lesson.current');
    let result: any;
    try {
      result = await tool!.execute({ store: this._store(), memory, entityId }, stage ? { kpId, stage } : { kpId });
    } catch (e: any) {
      return { success: false, error: String(e?.message || e) };
    }
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, args, result, latency_ms)
         VALUES ($1, 'lesson.current', $2, $3, NULL)`,
        [entityId, JSON.stringify({ kpId, stage }) , result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: result.success !== false, ...result };
  }

  /** 提交授课抢时段作答 —— 复用 lesson.submit 工具(判题+落库+回授掌握度+状态机推进,不绕 LLM)，供授课UI闭环。 */
  async lessonSubmit(entityId: string, kpId: string, questionId: string, answer: string): Promise<any> {
    const { memory } = await this._agent(entityId);
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'lesson.submit');
    let result: any;
    try {
      result = await tool!.execute({ store: this._store(), memory, entityId }, { kpId, questionId, answer });
    } catch (e: any) {
      return { success: false, error: String(e?.message || e) };
    }
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, args, result, latency_ms)
         VALUES ($1, 'lesson.submit', $2, $3, NULL)`,
        [entityId, JSON.stringify({ kpId, questionId, answer }), result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: result.success !== false, ...result };
  }

  /** 直接完成个性化计划的一条任务 —— 复用 plan.complete 工具逻辑(不绕 LLM)，供计划页 UI 闭环。 */
  async completePlanTask(entityId: string, planId: string, taskIndex: number, correct: boolean): Promise<any> {
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'plan.complete');
    const result = await tool!.execute({ store: this._store(), entityId }, { planId, taskIndex, correct });
    // 与 AgentCore 工具路径一致地审计（失败静默，不阻断）
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, args, result, latency_ms)
         VALUES ($1, 'plan.complete', $2, $3, NULL)`,
        [entityId, JSON.stringify({ planId, taskIndex, correct }), (result as any)?.error ? JSON.stringify({ error: (result as any).error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: (result as any)?.ok !== false, ...result };
  }

  /** 只读学情总览——复用 diagnosis.state 工具 execute(不绕 LLM),供前端面板直读真实掌握度/未解错题。 */
  async diagnosisOverview(entityId: string): Promise<any> {
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'diagnosis.state');
    const result = (await tool!.execute({ store: this._store(), entityId }, {})) as any;
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, result, latency_ms) VALUES ($1, 'diagnosis.state', $2, NULL)`,
        [entityId, result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: !result.error, phase: 'diagnosis', ...result };
  }

  /** 只读错题本——复用 wrong.list(不泄正确答案,含题面/错答/知识点)。 */
  async wrongBook(entityId: string, limit = 10): Promise<any> {
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'wrong.list');
    const result = (await tool!.execute({ store: this._store(), entityId }, { limit })) as any;
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, result, latency_ms) VALUES ($1, 'wrong.list', $2, NULL)`,
        [entityId, result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: !result.error, phase: 'wrong-book', ...result };
  }

  /** 只读复习序列预览——复用 review.sequence(掌握度缺口+间隔排序,不含答案)。 */
  async reviewPreview(entityId: string, size = 5): Promise<any> {
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'review.sequence');
    const result = (await tool!.execute({ store: this._store(), entityId }, { size })) as any;
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, result, latency_ms) VALUES ($1, 'review.sequence', $2, NULL)`,
        [entityId, result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: !result.error, phase: 'review-preview', ...result };
  }

  /** 只读掌握度趋势——复用 progress.trend(按天累计作答掌握度,判断进步/退步)。 */
  async masteryTrend(entityId: string): Promise<any> {
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'progress.trend');
    const result = (await tool!.execute({ store: this._store(), entityId }, {})) as any;
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, result, latency_ms) VALUES ($1, 'progress.trend', $2, NULL)`,
        [entityId, result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: !result.error, phase: 'mastery-trend', ...result };
  }

  /** 按知识点抽题（专项练习）——给定一个知识点(kpId)，随机抽 size 道该知识点的题，只回题面/选项/类型/难度，**不含答案**。
   *  学生作答仍走 answer.grade（判题/落库/错题/SM-2/消错题副作用统一），这里只是出题面。只读。 */
  async kpQuestions(entityId: string, kpId: string, size = 5): Promise<any> {
    if (!kpId) return { success: false, error: 'kpId 必填', questions: [] };
    const n = Math.max(1, Math.min(Number(size) || 5, 10));
    const { rows } = await this._store().query(
      `SELECT q.id, q.content, q.type, q.options, q.difficulty, kp.name AS knowledge_point
         FROM edu.questions q
         LEFT JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id
        WHERE q.knowledge_point_id = $1
        ORDER BY random()
        LIMIT $2`,
      [kpId, n],
    );
    const questions = (rows || []).map((r: any) => ({
      questionId: r.id,
      content: r.content,
      type: r.type,
      options: r.options,
      difficulty: r.difficulty,
      knowledgePoint: r.knowledge_point,
    }));
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, result, latency_ms) VALUES ($1, 'kp.drill', $2, NULL)`,
        [entityId, JSON.stringify({ kpId, size: questions.length })],
      );
    } catch { /* 审计失败静默 */ }
    return { success: true, phase: 'kp-drill', kpId, count: questions.length, questions };
  }

  /** 面板作答判读——复用 answer.grade(判题 + 作答落库 + 可选 resolveOnCorrect 消错题),不经 LLM。 */
  async gradeAnswer(entityId: string, questionId: string, answer: string, resolveOnCorrect = true, timeSpentMs?: number): Promise<any> {
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'answer.grade');
    const result = (await tool!.execute({ store: this._store(), entityId }, { questionId, answer: answer ?? '', resolveOnCorrect, timeSpentMs })) as any;
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, args, result, latency_ms)
         VALUES ($1, 'answer.grade', $2, $3, NULL)`,
        [entityId, JSON.stringify({ questionId, resolveOnCorrect, timeSpentMs }), result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: result.ok !== false, phase: 'graded', ...result };
  }

  /** 越权辅助：断言传入的 studentId 即请求者本人，否则 404。 */
  assertSelf(requestedId: string, externalId: string): void {
    if (requestedId && requestedId !== externalId) {
      throw new NotFoundException('学生不存在或无权访问');
    }
  }
}