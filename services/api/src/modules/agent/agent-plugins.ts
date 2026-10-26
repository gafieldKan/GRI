/**
 * 出厂插件装载面（W2.3）—— 宿主把「AI 教师能做什么」的一部分交给**插件**。
 *
 * 为什么单独成件：`teaching-tools.ts` 保持**同步、纯内建**；「从目录发现并装配插件」是宿主的活，
 * 落在这一处缝里，将来换装载位置/加 kind 只动这里。
 *
 * 三条要点：
 * 1. **同步 + memo**：插件的工具定义要在**同步**路径（`_teachingToolDefs()`）里就位，
 *    故走 `loadPlugins` 的同步装配（`assembleSync`）；且是**进程级一次性**资产，不每消息扫盘。
 * 2. **不阻断启动（P5）**：目录缺失 / 清单非法 / 入口抛错 / 撞名 —— 全部只记 `diagnostics.errors`，
 *    宿主照常启动；缺的工具**在诊断里可见**（`onModuleInit` 打日志），绝不静默。
 * 3. **可拔**：把 `plugins/memory` 目录删掉，教师即少三个记忆工具而宿主不崩 —— 这就是「卸一插件不退化」。
 */
import { resolve } from 'node:path';

import { loadPlugins, type LoadPluginsResult } from '@gri/plugin-host';
import { parseSkillMarkdown, sanitizeToolName } from '@gri/agent-core';

import { HOST_RESERVED_TOOL_NAMES } from './teaching-tools';

/**
 * 出厂插件目录：`AGENT_PLUGINS_DIR` 可覆盖（容器/自定义部署）。
 * 缺省 `../../../plugins` —— `src/modules/agent` 与 `dist/modules/agent` 同深度，故开发与生产同一相对路径。
 */
export function agentPluginsDir(): string {
  return process.env.AGENT_PLUGINS_DIR || resolve(__dirname, '../../../plugins');
}

/**
 * 是否**生产档**（装配清单**恒含** authz 策略插件，fail-closed）。容器/编排置 `NODE_ENV=production`
 * （见 `services/api/Dockerfile` `ENV NODE_ENV=production`）。测试/开发非生产 → 走 `skipKinds`。
 */
function isProductionTier(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * 宿主是否**真装上了** `kind="policy"` 插件（读宿主诊断，**不抛**——判定自身不得成为崩溃点）。
 *
 * 为什么生产侧要**自己**复核、不能信装载器：`loadPlugins` 的 `finish()` 把 `assembleSync` 的抛错
 * **吞进 `diagnostics.errors`**（P5：装配失败不炸宿主）——于是 `assemble({requirePolicy:true})` 抛的
 * `POLICY_REQUIRED` 不会传播出来，`loadPlugins` 照常返回一个**没有 policy** 的宿主，而
 * `PluginHost.authorize()` 在无 policy 时**直接放行**（fail-open）。故生产档必须在此**显式复核**，
 * 缺 policy 即**拒绝启动**——把「后组装 ≠ 生产可缺省」从文档升为**代码闸门**。
 */
function policyAssembled(result: LoadPluginsResult): boolean {
  try {
    const host = (result as { host?: unknown }).host;
    if (!host || typeof (host as { diagnostics?: unknown }).diagnostics !== 'function') return false;
    const diag = (host as { diagnostics: () => { policyAssembled?: boolean } }).diagnostics();
    return diag?.policyAssembled === true;
  } catch {
    return false; // 判定失败 → 视为「未装配」→ 生产档拒绝（fail-closed）
  }
}

let cache: LoadPluginsResult | null = null;

/**
 * 进程内一次性装载（memo）。插件是启动期资产：不每消息扫盘、不每 entity 重装。
 *
 * `reservedTools` 传宿主**自有**工具名（`HOST_RESERVED_TOOL_NAMES`）——插件撞名即被拒绝并诊断，
 * 因为宿主工具与插件工具同进一个 ToolRegistry（后写覆盖），不设防就会被**无声顶替**。
 * `nameKey` 传**清洗名**规则（`sanitizeToolName`）——模型看到的 function 名是多对一的
 * （`answer.grade` 与 `answer-grade` 同键），只按原样比，插件就能用清洗名顶替宿主工具。
 *
 * **授权装配档（W2.7）**：生产档 `requirePolicy`（恒含 authz 策略插件，缺则**拒绝启动**）；
 * 测试/开发档 `skipKinds:['policy']`（免搭权限——组件组装测试不必每次先配鉴权）。
 */
export function agentPlugins(): LoadPluginsResult {
  if (!cache) {
    const requirePolicy = isProductionTier();
    const loaded = loadPlugins({
      dir: agentPluginsDir(),
      reservedTools: HOST_RESERVED_TOOL_NAMES,
      nameKey: sanitizeToolName,
      assemble: requirePolicy ? { requirePolicy: true } : { skipKinds: ['policy'] },
    });
    // 装载器把装配抛错吞成诊断（见 `policyAssembled` 注释）→ 生产侧自己复核，缺 policy 即拒绝启动。
    if (requirePolicy && !policyAssembled(loaded)) {
      const detail =
        loaded.diagnostics.errors.map((e) => e.code || e.message).join('; ') || '未知原因';
      throw new Error(
        `生产装配要求 authz 策略插件（kind="policy"，fail-closed），但未装配成功：${detail}。` +
          `请确认 ${agentPluginsDir()}/authz 存在且 kind="policy"（或显式设置非生产档以跳过 —— 不推荐）。`,
      );
    }
    cache = loaded;
  }
  return cache;
}

/** 测试用：清空 memo（切换 env/目录后重新装载）。 */
export function resetAgentPlugins(): void {
  cache = null;
  skillCache = null;
}

/** 已解析的插件技能（正文已从 SKILL.md 取出并解析 frontmatter，可直接塞进 SkillRegistry）。 */
export interface AgentPluginSkill {
  /** 提供该技能的插件 id（诊断用）。 */
  id: string;
  name: string;
  description: string;
  instructions: string;
}

export interface AgentPluginSkillsResult {
  skills: AgentPluginSkill[];
  /**
   * 正文存在但**装不成可用技能** —— 逐条报出，不静默丢。两类：
   * 1. **解析失败**（如 frontmatter 缺 `name`）；
   * 2. **正文为空**（只剩 frontmatter）：`parseSkillMarkdown` 会给一个占位正文（`（skill x）`），
   *    于是「装载成功、却一个字的教学指令都没有」**不会**被 `empty` 抓到 —— 与「一个都没载成」同害，故同等报出。
   */
  errors: Array<{ id: string; message: string }>;
  /** 目录里有插件、但**一个技能正文都没装载成**：朗读提示词会整块消失，属高危，须响亮。 */
  empty: boolean;
  dir: string | null;
}

let skillCache: AgentPluginSkillsResult | null = null;

/**
 * 插件技能正文（`plugins/<id>/SKILL.md`）—— 装载器只负责**读出文本**（并守住目录监狱），
 * frontmatter 解析是 `@gri/agent-core` 的 `parseSkillMarkdown` 的活，在这里接上。
 *
 * 为什么解析结果要 memo 且带 `errors`/`empty`：技能正文是**内容资产**，装载失败不会让宿主崩，
 * 却会让 AI 教师**静默失去教学正文**（system prompt 里的技能块整块没了）。故这里把「一条都没载成」
 * 显式标出来，由 `agent.service` 的启动期诊断喊出来 —— 与工具侧「缺工具给诊断」同一原则。
 */
export function agentSkills(): AgentPluginSkillsResult {
  if (!skillCache) {
    const { skills, diagnostics } = agentPlugins();
    const parsed: AgentPluginSkill[] = [];
    const errors: Array<{ id: string; message: string }> = [];
    for (const s of skills) {
      try {
        const raw = String(s?.markdown ?? '');
        const md = parseSkillMarkdown(raw);
        // **只有 frontmatter、正文为空**：`parseSkillMarkdown` 会补一个占位正文（`（skill x）`），
        // 于是「技能装载成功、却一个字的教学指令都没有」**不会**被 `empty` 抓到 —— 而它和
        // 「一个技能都没载成」是同等危害（AI 教师没有教学指令）。故按解析失败同等报出、不计入 skills。
        const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
        if (!body) {
          errors.push({ id: s?.id, message: `SKILL.md 正文为空（只剩 frontmatter）—— 该技能给不出任何教学指令` });
          continue;
        }
        parsed.push({ id: s.id, name: md.name, description: md.description, instructions: md.instructions });
      } catch (e) {
        // 错误对象由**插件正文的解析器**抛出，理论上都是 `Error`；但 `catch` 到的值可以是任何东西
        // （Proxy / 带抛错 getter 的对象）——「诊断自身不得成为崩溃点」：取值再抛就穿出 `agentSkills`。
        // 与 `@gri/plugin-host` 的 `errorInfo()` 同一原则，此处内联（够小，不引依赖）。
        let message: string;
        try {
          message = e instanceof Error ? e.message : String(e);
        } catch {
          message = '[不可读的错误对象]';
        }
        errors.push({ id: s?.id, message });
      }
    }
    skillCache = { skills: parsed, errors, empty: parsed.length === 0, dir: diagnostics.dir };
  }
  // **交副本，不交 memo 本体**：memo 是**进程级**资产，调用方若 `push` 进 `.skills`，污染的是全进程
  // （下一条消息、下一个 entity 都读得到）—— 与工具侧 `.slice()` 同规。数组小，克隆成本可忽略。
  return { skills: skillCache.skills.slice(), errors: skillCache.errors.slice(), empty: skillCache.empty, dir: skillCache.dir };
}
