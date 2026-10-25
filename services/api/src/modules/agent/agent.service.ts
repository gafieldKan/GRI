import { Injectable, NotFoundException, OnModuleInit, OnModuleDestroy, Optional, Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseService } from '../../database/database.service';
import { AgentCredentialsService } from './agent-credentials.service';
import { AgentCore, LlmClient, ModelRouter, MemoryStore, ToolRegistry, SkillRegistry, storeFrom, McpPool, createDelegateTool } from '@gri/agent-core';
import type { CliBackendRegistry } from '@gri/agent-core';

import { eduQuery, findStudentProfile, findLatestPlan, listQuestionsByKp } from '../edu-core/repository';
import { AgentTeachingTools } from './teaching-tools';
import { loadConfig } from '../../config/config';

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

/**
 * 教育域数据访问**已收敛到 `edu-core`**（W2.1 单一领域组件）：本文件不再内联任何 `edu.*` SQL，
 * 一律经 `../edu-core/repository`（SM-2 见 `../edu-core/sm2`）。这是工具插件化（W2.3）的前置条件。
 */

interface AgentEntity {
  entity_id: string;
  kind: string;
  name: string | null;
  status: string;
  config: any;
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
    const profile = await findStudentProfile(eduQuery(store), entityId);
    const subject = String(opts.subject || profile?.current_subject || 'math');
    const gradeLevel = profile?.grade ?? null;
    const subjectName = await this._subjectDisplayName(subject);

    const core = new AgentCore({
      router,
      store,
      tools,
      skills,
      memory,
      // 底座保持业务中立（默认 '## 记忆'）；宿主在此注入业务文案，prompt 逐字不变（零回归）。
      memoryHeading: '## 关于该学生的记忆',
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
      // LLM 单次调用超时（宿主 env LLM_TIMEOUT_MS，默认 150s）：deepseek 推理模型大 prompt 下 60s 误杀
      llmTimeoutMs: loadConfig().llm.timeoutMs,
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

  /** 教学工具定义集（W2.2）：实现已抽到 {@link AgentTeachingTools}（见 ./teaching-tools）；调用点不变，W2.3 将插件化。 */
  private readonly _teach = new AgentTeachingTools();

  private _teachingToolDefs(): any[] {
    return this._teach.toolDefs();
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
  private _teachingSkills(toolDefs: any[]): SkillRegistry {
    return this._teach.skills(toolDefs);
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
      const p = await findLatestPlan(eduQuery(this._store()), o.entityId);
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
    const rows = await listQuestionsByKp(eduQuery(this._store()), kpId, n);
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