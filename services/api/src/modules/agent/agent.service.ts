import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional, Inject } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AgentCredentialsService } from './agent-credentials.service';
import { AgentCore, LlmClient, ModelRouter, MemoryStore, ToolRegistry, SkillRegistry, storeFrom, McpPool } from '@gri/agent-core';
import type { CliBackendRegistry } from '@gri/agent-core';

import { eduQuery, findStudentProfile, findLatestPlan } from '../edu-core/repository';
import { AgentTeachingTools, HOST_RESERVED_TOOL_NAMES, dropHostNameCollisions } from './teaching-tools';
import { AgentDelegateRunsService } from './agent-delegate.service';
import { AgentPanelService } from './agent-panel.service';
import { agentPlugins } from './agent-plugins';
import { loadConfig } from '../../config/config';

/**
 * DI 令牌：外部 agent CLI 后端注册表（B-3b「换脑子」）。
 * 由 AgentModule 注入进程级共享 `cliBackends`（B-3a）；未提供 → 注入 null → AgentCore/LlmClient 行为同今日（零回归）。
 * 是否真正启用只看 `agent.llm_routes` 是否有 enabled 的 provider='cli' 行（C2，无全局开关）。
 */
export const AGENT_CLI_BACKENDS = 'AGENT_CLI_BACKENDS';

/** 出厂插件装载的日志通道（W2.3）—— 装配了什么、哪条装载失败，启动即可见。 */
const agentPluginLogger = new Logger('AgentPlugins');

/**
 * 外部 agent run 的 `error_code` 取值集（B-4 §目标4）—— 定义随委派面移入 ./agent-delegate.service，
 * 自此处再导出以保对外契约不变；`status='failed'` 的 run 必带其一（绝不静默）。
 */
export { EXTERNAL_RUN_ERROR_CODES } from './agent-delegate.service';

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

  constructor(
    private readonly db: DatabaseService,
    @Optional() private readonly creds?: AgentCredentialsService,
    @Optional() @Inject(AGENT_CLI_BACKENDS) private readonly cliBackends?: CliBackendRegistry | null,
  ) {
    this.mcpPool = new McpPool(storeFrom((text: string, params?: unknown[]) => this.db.query(text, params)));
    this.delegate = new AgentDelegateRunsService(this.db, this.cliBackends ?? null);
    this.panel = new AgentPanelService(this.db, {
      _agent: (id: string) => this._agent(id),
      _teachingToolDefs: () => this._teachingToolDefs(),
    });
  }

  /** Nest 生命周期：启动时重启对账——把宿主重启前残留 running 的孤儿 run 置 failed/INTERRUPTED（B-4）。 */
  async onModuleInit(): Promise<void> {
    this._reportPluginDiagnostics();
    await this.reconcileInterruptedRuns();
  }

  /** Nest 生命周期：进程退出时回收全部 MCP 连接（防僵尸子进程残留）。 */
  async onModuleDestroy(): Promise<void> {
    await this.mcpPool.disconnect();
  }

  /**
   * 插件装载诊断（W2.3）：装配了什么、哪一条装载失败 —— 启动时打出来。
   * 「不阻断启动」的前提是**问题可见**：缺插件只少工具，但绝不静默。
   */
  private _reportPluginDiagnostics(): void {
    const { dir, activated, ignored, errors } = agentPlugins().diagnostics;
    agentPluginLogger.log(`出厂插件：${activated.length ? activated.join('、') : '（无）'} ← ${dir}`);
    // 目录存在却无清单 → 按非插件跳过：不是错误，但**必须可见**（否则「插件整个不见了」查无对证）。
    for (const g of ignored) agentPluginLogger.log(`插件目录跳过：${JSON.stringify(g)}`);
    for (const e of errors) agentPluginLogger.warn(`插件装载问题：${JSON.stringify(e)}`);
    // 防漂移：宿主**所有**自有工具名都必须登记进保留表，否则插件（或 MCP）可无声顶替它。
    // 两个来源缺一不可：① 宿主自注册进 registry 的（委派工具 `agent.delegate`）；
    // ② 内建工具表 **纯内建**（`toolDefs([])`，不含插件）——漏了它就等于给第 14 个内建工具留个无声顶替口。
    const reserved = new Set(HOST_RESERVED_TOOL_NAMES);
    const ownTools = new Set([
      ...this._teachingTools().list().map((t) => t.name),
      ...this._teach.toolDefs([]).map((t) => t.name),
    ]);
    for (const name of ownTools) {
      if (!reserved.has(name)) agentPluginLogger.warn(`宿主工具 ${name} 未登记进 HOST_RESERVED_TOOL_NAMES —— 插件可无声顶替它`);
    }
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
    if (mcpTools.length) {
      // MCP 工具与宿主/插件工具同进一个 ToolRegistry（**后写覆盖**）：撞宿主自有名 → 丢弃并告警。
      // 现状下这**几乎不会命中**：MCP 工具名恒为 `<server>_<tool>`（见 agent-core mcp/pool.js），含 `_`
      // 分隔符，而保留名里没有 `_` —— 故这是**兜底**（MCP 命名规则若变、或将来接入非前缀命名的桥，撞名即被拦）。
      // 保留它是为了把「后写覆盖 → 无声顶替」这条机制**补上最后一道口**，而非声称当前必然发生。
      const { safe, dropped } = dropHostNameCollisions(mcpTools);
      for (const t of dropped) agentPluginLogger.warn(`MCP 工具 ${t && t.name} 撞宿主自有名，已丢弃（不无声顶替内建/委派工具）`);
      if (safe.length) tools.registerAll(safe);
    }
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
    // W2.3：插件提供的工具（出厂插件目录，进程内一次性装载）按原位拼回；缺插件 → 少工具但宿主可用（P5）。
    return this._teach.toolDefs(agentPlugins().tools as any[]);
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
   * B-4 委派/外部 run 面已抽到 {@link AgentDelegateRunsService}（见 ./agent-delegate.service）。
   * 以下为**薄委托**：保留原方法名，使调用点（_teachingTools/onModuleInit/v1 控制器）与既有 spec 一字不动。
   */
  private readonly delegate: AgentDelegateRunsService;

  private _delegateTool(): any {
    return this.delegate._delegateTool();
  }

  private async _delegateExecute(raw: any, ctx: any, args: any = {}): Promise<any> {
    return this.delegate._delegateExecute(raw, ctx, args);
  }

  private async _onDelegateEvent(event: any, _ctx: any): Promise<void> {
    return this.delegate._onDelegateEvent(event, _ctx);
  }

  private _classifyDelegateError(result: any): string {
    return this.delegate._classifyDelegateError(result);
  }

  async reconcileInterruptedRuns(): Promise<number> {
    return this.delegate.reconcileInterruptedRuns();
  }

  async listExternalRuns(entityId: string, limit = 20): Promise<{ runs: any[] }> {
    return this.delegate.listExternalRuns(entityId, limit);
  }

  async getExternalRun(entityId: string, runId: string): Promise<any | null> {
    return this.delegate.getExternalRun(entityId, runId);
  }

  async listExternalEvents(entityId: string, runId: string, afterId = 0): Promise<{ ok: boolean; run?: any; events?: any[] }> {
    return this.delegate.listExternalEvents(entityId, runId, afterId);
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

  /**
   * 面板面已抽到 {@link AgentPanelService}（见 ./agent-panel.service）。以下为**同签名薄委托**，
   * 使控制器/tuition/twin 与既有 spec 一字不动；实现（含按名取工具再 execute）在后件。
   */
  private readonly panel: AgentPanelService;

  async listMemory(entityId: string): Promise<any> {
    return this.panel.listMemory(entityId);
  }

  async forgetMemory(entityId: string, key: string): Promise<any> {
    return this.panel.forgetMemory(entityId, key);
  }

  async lessonProgress(entityId: string, kpId: string, stage?: string): Promise<any> {
    return this.panel.lessonProgress(entityId, kpId, stage);
  }

  async lessonSubmit(entityId: string, kpId: string, questionId: string, answer: string): Promise<any> {
    return this.panel.lessonSubmit(entityId, kpId, questionId, answer);
  }

  async completePlanTask(entityId: string, planId: string, taskIndex: number, correct: boolean): Promise<any> {
    return this.panel.completePlanTask(entityId, planId, taskIndex, correct);
  }

  async diagnosisOverview(entityId: string): Promise<any> {
    return this.panel.diagnosisOverview(entityId);
  }

  async wrongBook(entityId: string, limit = 10): Promise<any> {
    return this.panel.wrongBook(entityId, limit);
  }

  async reviewPreview(entityId: string, size = 5): Promise<any> {
    return this.panel.reviewPreview(entityId, size);
  }

  async masteryTrend(entityId: string): Promise<any> {
    return this.panel.masteryTrend(entityId);
  }

  async kpQuestions(entityId: string, kpId: string, size = 5): Promise<any> {
    return this.panel.kpQuestions(entityId, kpId, size);
  }

  async gradeAnswer(entityId: string, questionId: string, answer: string, resolveOnCorrect = true, timeSpentMs?: number): Promise<any> {
    return this.panel.gradeAnswer(entityId, questionId, answer, resolveOnCorrect, timeSpentMs);
  }

  assertSelf(requestedId: string, externalId: string): void {
    return this.panel.assertSelf(requestedId, externalId);
  }

}