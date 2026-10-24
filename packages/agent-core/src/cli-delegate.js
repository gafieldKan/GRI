/**
 * cli-delegate —— 「派活儿」接入点（②）：把本机外部 agent 当**独立工人**（B-3c）。
 *
 * 与接入点①（`provider='cli'` 路由，LlmClient._chatViaCli）的区别（docs/EXTERNAL_AGENT_HARNESS.md §四）：
 *   ① 是「换脑子」——**同一对话**，外部 agent 只产出**回答文本**；
 *   ② 是「派活儿」——子任务有**独立上下文/文件副作用**，父只拿**摘要结果**
 *      （对标 Hermes `delegate_tool`：parent 看不到 child 的中间工具调用）。
 *
 * 分层：本模块是**底座通用端口**（换行业仍成立）——只做「工具工厂」：
 *   - **不 import 业务、不读 env、不碰 apiKey/token**（沿用 B-1/B-3a/B-3b 红线，C3）；
 *   - CLI 只经注入的 `CliBackendRegistry`（B-3a）执行，本模块不 spawn；
 *   - 哪个 agent 用哪个后端、白名单放哪些目录 = **部署/装配配置**，不写进本模块（`cwdAllowlist` 由宿主注入）。
 *
 * 三条硬约束：
 *   - **C1 默认只读**：`agent.delegate` **不**开放 `allowDangerous`（危险旗标仍被 B-3a DENYLIST 挡下）。
 *   - **C2 cwd 白名单强制**：`cwd` 必须落在 `cwdAllowlist`（含子路径，前缀判定）；越界**明确拒绝**（不 spawn）。
 *   - **C5/C6 超时 + 不静默**：委派必带超时（调用方或后端默认）；失败**明确返回 error**（不返回空成功）；
 *     只回**摘要**（不回 child 中间产物/stderr），prompt 走 argv 数组（B-3a），密钥永不进 prompt/argv（C4）。
 */
import { resolve as resolvePath, sep } from 'node:path';
import { makeTool } from './tool.js';

/**
 * 默认 cwd 白名单：GRI 工作树。**可由宿主配置扩**（`createDelegateTool({cwdAllowlist})`），不写死在业务里。
 * @type {ReadonlyArray<string>}
 */
export const DEFAULT_DELEGATE_CWD_ALLOWLIST = Object.freeze(['/home/ubantu/GRI']);

/** 两个绝对路径是否同根或子路径（前缀判定；处理根 `'/'` 的边界）。 */
function isWithin(target, root) {
  if (target === root) return true;
  const prefix = root.endsWith(sep) ? root : root + sep;
  return target.startsWith(prefix);
}

/** 把白名单规整成**绝对、去尾分隔符**的根集合（非字符串/空项丢弃；全空则回默认）。 */
function normalizeAllowlist(cwdAllowlist) {
  const list = Array.isArray(cwdAllowlist) && cwdAllowlist.length ? cwdAllowlist : DEFAULT_DELEGATE_CWD_ALLOWLIST;
  const roots = [];
  for (const raw of list) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    let abs = resolvePath(raw.trim());
    if (abs.length > 1 && abs.endsWith(sep)) abs = abs.slice(0, -1);
    if (!roots.includes(abs)) roots.push(abs);
  }
  return roots.length ? roots : [...DEFAULT_DELEGATE_CWD_ALLOWLIST];
}

/**
 * cwd 白名单判定（§八第 3 条 / C2）。
 * 未提供 `cwd` → 落白名单首根（即「显式 cwd」的默认值）；相对路径**相对白名单首根**解析
 * （`../` 越界会被拒），绝对路径原样解析（越界绝对路径自然落到白名单外）。
 * @param {string|null|undefined} cwd
 * @param {string[]} [cwdAllowlist]
 * @returns {{ok:true,cwd:string}|{ok:false,error:string}}
 */
export function resolveDelegateCwd(cwd, cwdAllowlist) {
  const roots = normalizeAllowlist(cwdAllowlist);
  const root = roots[0];
  const raw = cwd == null ? '' : String(cwd).trim();
  const target = raw === '' ? root : resolvePath(root, raw);
  for (const r of roots) {
    if (isWithin(target, r)) return { ok: true, cwd: target };
  }
  return {
    ok: false,
    error: `agent.delegate: cwd 越界，拒绝委派 —— '${raw}' 不在白名单内（允许：${roots.join(', ')}）`,
  };
}

/**
 * 造一个 `agent.delegate` 委派工具（makeTool 产物，供 ToolRegistry.register）。
 *
 * `execute(ctx, {backend, goal, cwd?, resumeKey?, timeoutMs?})`：
 *   校验 backend/goal → 校验 cwd 白名单 → `cliBackends.run(backend, {prompt:goal, cwd, resumeKey?, timeoutMs?, onEvent?})`
 *   → 只回 `{ok, backend, summary, sessionId, exitCode, timedOut, error}`（**父只拿摘要**）。
 *
 * `onEvent(event, ctx)`（B-4，可选）：把底座逐行冒泡的事件**透传**给宿主——
 *   `event = {kind, data, backend}`（kind ∈ started|tool_use|assistant_delta|result|error）；
 *   只含 child 派生信息（文本/工具名），**不含** argv/prompt/密钥。未提供时不向 run 传 onEvent（零回归）。
 *   **本工具的 execute 仍是同步语义**（async 编排/落库由宿主接管，底座不碰 DB/不读 env）。
 *
 * @param {{cliBackends?: {run: Function}|null, cwdAllowlist?: string[], onEvent?: ((event: object, ctx: any) => void)|null}} [opts]
 * @returns {import('./tool.js').Tool}
 */
export function createDelegateTool({ cliBackends = null, cwdAllowlist = DEFAULT_DELEGATE_CWD_ALLOWLIST, onEvent = null } = {}) {
  const roots = normalizeAllowlist(cwdAllowlist);
  return makeTool({
    name: 'agent.delegate',
    description:
      '把一个**独立子任务**交给本机已装的外部 agent 执行，只拿回该子任务的**摘要结果**（看不到对方的中间过程）。' +
      '适用「去读某文件并总结」「跑一段独立检索/核实」等有独立上下文或文件副作用的活儿；' +
      '只需普通问答时，直接用你自己的知识回答，不要委派。cwd 必须落在允许目录内。',
    inputSchema: {
      type: 'object',
      properties: {
        backend: {
          type: 'string',
          enum: ['claude-code', 'codex', 'openclaw', 'hermes'],
          description: '外部 agent 后端 id',
        },
        goal: { type: 'string', description: '要委派给外部 agent 的子任务（自然语言目标）' },
        cwd: {
          type: 'string',
          description: `子任务工作目录，必须落在允许目录内（${roots.join(', ')}）；缺省=首个允许目录`,
        },
        resumeKey: {
          type: 'string',
          description: '续接既有会话的 id（仅 claude-code/codex 支持；其余后端忽略，退化为新上下文）',
        },
        timeoutMs: { type: 'number', description: '超时（毫秒）；缺省用该后端默认' },
      },
      required: ['backend', 'goal'],
    },
    category: 'delegate',
    execute: async (_ctx, args = {}) => {
      const backend = typeof args.backend === 'string' ? args.backend.trim() : '';
      const goal = typeof args.goal === 'string' ? args.goal.trim() : '';
      if (!backend) return { ok: false, backend: null, error: 'agent.delegate: 缺少 backend（外部 agent 后端 id）' };
      if (!goal) return { ok: false, backend, error: 'agent.delegate: 缺少 goal（子任务目标）' };
      if (!cliBackends || typeof cliBackends.run !== 'function') {
        return { ok: false, backend, error: 'agent.delegate: 未注入 CliBackendRegistry —— 拒绝静默降级' };
      }

      // C2：cwd 白名单强制（越界明确拒绝，不 spawn）
      const cwdCheck = resolveDelegateCwd(args.cwd, roots);
      if (!cwdCheck.ok) return { ok: false, backend, error: cwdCheck.error };

      // C4：prompt 走 argv 数组（B-3a）；本处不拼任何密钥/token。
      // C1：**不传** allowDangerous（危险旗标由 B-3a DENYLIST 挡下）。
      const runOpts = { prompt: goal, cwd: cwdCheck.cwd };
      if (args.timeoutMs != null) {
        const n = Number(args.timeoutMs);
        if (Number.isFinite(n) && n > 0) runOpts.timeoutMs = n; // 未传则用后端默认（C5）
      }
      if (typeof args.resumeKey === 'string' && args.resumeKey.trim()) runOpts.resumeKey = args.resumeKey.trim();

      // B-4：事件透传（**仅当**宿主注入 onEvent 时才向 run 传，未注入 → runOpts 逐字不变，零回归）。
      // event 只含 child 派生信息（kind/data），本处不拼任何密钥/argv/prompt。
      if (typeof onEvent === 'function') {
        runOpts.onEvent = (kind, data) => {
          try {
            onEvent({ kind, data, backend }, _ctx);
          } catch {
            /* 宿主事件回调异常不阻断委派 */
          }
        };
      }

      let res;
      try {
        res = await cliBackends.run(backend, runOpts);
      } catch (e) {
        return { ok: false, backend, timedOut: false, error: `委派失败：${e && e.message ? e.message : String(e)}` };
      }
      // C5/C6：失败/超时**明确返回 error**（不静默返回空成功）
      if (!res || res.timedOut || res.error) {
        const why = (res && (res.error || (res.timedOut ? '超时（已杀进程组）' : null))) || '无结果';
        return { ok: false, backend, timedOut: !!(res && res.timedOut), error: `委派失败：${why}` };
      }
      const text = typeof res.text === 'string' ? res.text.trim() : '';
      if (!text) return { ok: false, backend, timedOut: false, error: 'agent.delegate: 外部 agent 返回空文本 —— 拒绝静默返回空' };
      // 父只拿摘要：仅最终文本 + 少量元信息；**不**回 child 中间产物/stderr。
      return {
        ok: true,
        backend,
        summary: text,
        sessionId: res.sessionId ?? null,
        exitCode: res.exitCode ?? null,
        timedOut: false,
        error: null,
      };
    },
  });
}
