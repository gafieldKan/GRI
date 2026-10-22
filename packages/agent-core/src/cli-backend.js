/**
 * CliBackendRegistry —— 底座「外部 agent 后端」端口（第二类模型后端）。
 *
 * 仿 OpenClaw `registerCliBackend` / Hermes `delegate_tool` 的架构意图：把本机已装的
 * 外部 CLI agent（claude / codex / openclaw / hermes…）当成**可委派的推理后端**。
 *
 * 分层判据（docs/AGENT_LAYERING.md 判据 1/2/3）：
 *   - 换行业仍成立、换场景不改代码 → 属**底座通用端口**；
 *   - **哪个 agent 用哪个后端是部署配置**（routeKey 装配），不写进本模块；
 *   - 本模块**不 import 业务、不读 env、不碰 apiKey/token**（CLI 自持登录态，或宿主注入 env）。
 *
 * 三条硬约束（docs/EXTERNAL_AGENT_HARNESS.md §三）：
 *   1. 后端**只描述 argv 与解析**，密钥一概不碰。
 *   2. **id 全局唯一**：撞名 register 抛错 + 诊断，绝不静默覆盖。
 *   3. **默认最小权限**：危险放权旗标（bypassPermissions / --dangerously-bypass* / --yolo）
 *      默认**不放开**；进 DENYLIST，仅显式 `allowDangerous` 才可加。
 *
 * 安全铁律：
 *   - `spawn(bin, args, {shell:false})`：prompt 走 **argv 数组**，绝不字符串拼接（防注入）。
 *   - `detached:true` 建独立进程组；超时 `process.kill(-pid)` **杀整组**，不留孤儿。
 *   - 返回/日志**不落完整 prompt**；stderr 摘要截断 ≤512B（C6 零明文）。
 */
import { spawn } from 'node:child_process';

/** stderr 摘要上限（字节）。 */
const STDERR_CLIP_BYTES = 512;
/** 单行未换行的最大缓冲（防后端输出无换行的超大流吃爆内存）。 */
const MAX_LINE_BYTES = 1024 * 1024;
/** 超时杀进程组后的哨兵退出码（与 GNU timeout 一致）。 */
const TIMEOUT_EXIT_CODE = 124;

/**
 * 危险放权旗标清单（C3）。默认 argv 不得含其中任一；仅显式 `allowDangerous` 放权才可加。
 * @type {ReadonlyArray<string>}
 */
export const DENYLIST = Object.freeze([
  '--dangerously-skip-permissions',
  '--allow-dangerously-skip-permissions',
  '--dangerously-bypass-approvals-and-sandbox',
  '--dangerously-bypass-hook-trust',
  '--yolo',
  'bypassPermissions', // claude-code `--permission-mode <mode>` 的危险取值
]);

/**
 * 在 argv 中查首个命中 DENYLIST 的项（含 `--dangerously-bypass*` 前缀族与 bypassPermissions 取值）。
 * @param {string[]} args
 * @returns {string|null} 命中的原始 token（用于诊断），无则 null
 */
export function findDeniedArg(args) {
  for (const raw of args || []) {
    const s = String(raw);
    if (DENYLIST.includes(s)) return s;
    if (/^--dangerously-bypass/.test(s)) return s;
    if (/bypassPermissions/i.test(s)) return s;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 四个内置后端（argv 与解析按 2026-10-22 实测；详见 docs/EXTERNAL_AGENT_HARNESS.md）
// ---------------------------------------------------------------------------

/**
 * claude-code：`claude -p <prompt> --output-format stream-json --verbose --permission-mode default`
 * 实测：`--output-format=stream-json` **必须带 `--verbose`**，否则 CLI 报错。
 * stream-json：末尾 `{"type":"result","result":"…","session_id":…}` 含最终文本；
 * 首行 `{"type":"system","subtype":"init","session_id":…}` 起各行均带 session_id。
 */
export const claudeCodeBackend = {
  id: 'claude-code',
  label: 'Claude Code',
  bin: 'claude',
  resumeKey: 'session_id',
  timeoutMs: 600000,
  /** @param {{prompt: string, cwd?: string}} input */
  buildArgs({ prompt }) {
    return ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'default'];
  },
  /** stream-json 逐行解析：文本只取 `type==='result'` 行（最终答复，避免与 assistant 增量重复）。 */
  parseLine(line) {
    const obj = safeJson(line);
    if (!obj) return null;
    const out = {};
    if (obj.session_id) out.sessionId = String(obj.session_id);
    if (obj.type === 'result' && typeof obj.result === 'string') out.text = obj.result;
    return Object.keys(out).length ? out : null;
  },
  /** 显式放权才追加（默认永不出现在 buildArgs）。 */
  dangerousFlags: ['--dangerously-skip-permissions'],
};

/**
 * codex：`codex exec <prompt> --json --skip-git-repo-check`
 * JSONL：`{"type":"thread.started","thread_id":…}` 起；最终文本在
 * `{"type":"item.completed","item":{"type":"agent_message","text":"…"}}`。
 */
export const codexBackend = {
  id: 'codex',
  label: 'Codex CLI',
  bin: 'codex',
  resumeKey: 'thread_id',
  timeoutMs: 900000,
  /** @param {{prompt: string, cwd?: string}} input */
  buildArgs({ prompt }) {
    return ['exec', prompt, '--json', '--skip-git-repo-check'];
  },
  /** JSONL 逐行解析：thread.started → sessionId；item.completed(agent_message) → text。 */
  parseLine(line) {
    const obj = safeJson(line);
    if (!obj) return null;
    if (obj.type === 'thread.started' && obj.thread_id) return { sessionId: String(obj.thread_id) };
    if (obj.type === 'item.completed' && obj.item && obj.item.type === 'agent_message') {
      return typeof obj.item.text === 'string' ? { text: obj.item.text } : null;
    }
    return null;
  },
  dangerousFlags: ['--dangerously-bypass-approvals-and-sandbox'],
};

/**
 * openclaw：`openclaw agent exec --json --cwd <dir> <msg>`
 * 实测：`--json` 回**多行 pretty JSON 信封**（非 JSONL）→ 用 parseOutput 整体解析：
 * `{ok, final, payloads:[{text}], sessionId, usage}`。文本取 `final`（回退 payloads[].text）。
 * 前置：需 ambient config 的 provider 凭据（或 `--url` 指网关）；`--isolated` 会缺鉴权报错。
 */
export const openclawBackend = {
  id: 'openclaw',
  label: 'OpenClaw',
  bin: 'openclaw',
  resumeKey: 'sessionId',
  timeoutMs: 600000,
  /** @param {{prompt: string, cwd?: string}} input */
  buildArgs({ prompt, cwd }) {
    return ['agent', 'exec', '--json', '--cwd', cwd || process.cwd(), prompt];
  },
  /** 多行信封非逐行可析 → parseLine 不产出（文本统一走 parseOutput）。 */
  parseLine() {
    return null;
  },
  /** 整体 stdout 解析 openclaw `--json` 稳定信封。 */
  parseOutput(stdout) {
    const obj = safeJson(String(stdout || '').trim());
    if (!obj || typeof obj !== 'object') {
      return { error: 'openclaw 未返回可解析的 JSON 信封（前置：需 ambient provider 凭据，或 --url 指网关）' };
    }
    let text = typeof obj.final === 'string' ? obj.final : '';
    if (!text && Array.isArray(obj.payloads)) {
      text = obj.payloads.map((p) => (p && typeof p.text === 'string' ? p.text : '')).filter(Boolean).join('\n');
    }
    const out = { text };
    if (obj.sessionId) out.sessionId = String(obj.sessionId);
    if (obj.ok === false) out.error = String(obj.error || obj.message || 'openclaw 报告 ok=false（运行未成功）');
    return out;
  },
  dangerousFlags: [],
};

/**
 * hermes：`hermes -z <prompt>`（one-shot，仅打最终文本）。
 * 实测：本机 headless ≥120s 无输出即挂起 → 必须靠 timeoutMs 强制杀组并**明确报错**（不静默/不挂死）。
 */
export const hermesBackend = {
  id: 'hermes',
  label: 'Hermes Agent',
  bin: 'hermes',
  resumeKey: null,
  timeoutMs: 600000,
  /** @param {{prompt: string, cwd?: string}} input */
  buildArgs({ prompt }) {
    return ['-z', prompt];
  },
  /** 纯文本：逐行追加（one-shot 只打最终答复）。 */
  parseLine(line) {
    const t = String(line).replace(/\r$/, '');
    return t.length ? { text: t, append: true } : null;
  },
  dangerousFlags: ['--yolo'],
};

/**
 * 四个内置后端，按 id 索引（`BACKENDS['claude-code']`）。可扩展：自带 `register` 加新后端。
 * @type {Readonly<Record<string, object>>}
 */
export const BACKENDS = Object.freeze({
  'claude-code': claudeCodeBackend,
  codex: codexBackend,
  openclaw: openclawBackend,
  hermes: hermesBackend,
});

// ---------------------------------------------------------------------------
// 注册表
// ---------------------------------------------------------------------------

export class CliBackendRegistry {
  /** @param {Array<object>|Record<string, object>} [backends] 初始后端（数组或 id→后端映射） */
  constructor(backends) {
    /** @type {Map<string, object>} */
    this._backends = new Map();
    if (backends) this.registerAll(backends);
  }

  /**
   * 注册一个后端。id 必填且**全局唯一**——撞名抛错 + 诊断（不静默覆盖）。
   * @param {object} backend {id,label,bin,buildArgs,parseLine,resumeKey?,timeoutMs?}
   */
  register(backend) {
    validateBackend(backend);
    if (this._backends.has(backend.id)) {
      throw new Error(
        `CLI 后端 id 冲突：'${backend.id}' 已注册（bin=${this._backends.get(backend.id).bin}），` +
          `拒绝覆盖为 bin=${backend.bin}；请改用唯一 id`,
      );
    }
    this._backends.set(backend.id, backend);
    return this;
  }

  /** @param {Array<object>|Record<string, object>} backends */
  registerAll(backends) {
    const list = Array.isArray(backends) ? backends : Object.values(backends);
    for (const b of list) this.register(b);
    return this;
  }

  /** @param {string} id */
  has(id) {
    return this._backends.has(id);
  }

  /** @param {string} id @returns {object|null} */
  get(id) {
    return this._backends.get(id) || null;
  }

  /** 可序列化清单（不含函数）：{id,label,bin,timeoutMs,resumeKey} */
  list() {
    return Array.from(this._backends.values()).map((b) => ({
      id: b.id,
      label: b.label,
      bin: b.bin,
      timeoutMs: b.timeoutMs,
      resumeKey: b.resumeKey ?? null,
    }));
  }

  /**
   * 只读问答执行器：spawn 后端 → 行流式解析 → 超时杀进程组 → 汇总结果。
   * @param {string} id 后端 id
   * @param {{prompt: string, cwd?: string, timeoutMs?: number, allowDangerous?: boolean}} opts
   * @returns {Promise<{text: string, sessionId: string|null, exitCode: number, stderr: string, pid: number|null, timedOut: boolean, error: string|null}>}
   */
  async run(id, opts = {}) {
    const backend = this._backends.get(id);
    if (!backend) throw new Error(`未知 CLI 后端: '${id}'（已注册：${this.list().map((b) => b.id).join(', ') || '无'}）`);
    const { prompt, cwd, timeoutMs, allowDangerous = false } = opts;
    if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('run: prompt 必填且非空');

    const args = backend.buildArgs({ prompt, cwd });
    if (allowDangerous && Array.isArray(backend.dangerousFlags) && backend.dangerousFlags.length) {
      args.push(...backend.dangerousFlags);
    }
    // C3：默认最小权限——未显式放权时，argv 不得含任何危险旗标（防后端 buildArgs 误加）。
    if (!allowDangerous) {
      const denied = findDeniedArg(args);
      if (denied) throw new Error(`拒绝执行：argv 含禁用旗标 '${denied}'（需显式 allowDangerous 放权）`);
    }

    const effectiveCwd = cwd || process.cwd();
    const effectiveTimeout = Number(timeoutMs ?? backend.timeoutMs ?? 600000);
    return spawnRun({
      id: backend.id,
      bin: backend.bin,
      args,
      cwd: effectiveCwd,
      timeoutMs: effectiveTimeout,
      parseLine: backend.parseLine,
      parseOutput: backend.parseOutput,
    });
  }
}

// ---------------------------------------------------------------------------
// 进程编排（spawn / 行解析 / 超时杀组）
// ---------------------------------------------------------------------------

/**
 * spawn 一个后端并收集结果。**shell:false + argv 数组**（防注入）；detached 独立进程组。
 * @param {{id: string, bin: string, args: string[], cwd: string, timeoutMs: number, parseLine?: Function, parseOutput?: Function}} spec
 */
function spawnRun({ id, bin, args, cwd, timeoutMs, parseLine, parseOutput }) {
  return new Promise((resolve, reject) => {
    /** @type {{text: string, sessionId: string|null}} */
    const state = { text: '', sessionId: null };
    let stdoutAll = '';
    let stderr = '';
    let lineBuf = '';
    let timedOut = false;
    let spawnErr = null;
    let settled = false;

    let child;
    try {
      child = spawn(bin, args, {
        cwd,
        shell: false, // C4：绝不 shell 拼接
        detached: true, // 独立进程组 → 超时可整组 kill
        stdio: ['ignore', 'pipe', 'pipe'], // stdin 忽略：防 CLI 等 stdin 而挂起
      });
    } catch (e) {
      reject(new Error(`spawn 失败（${id}/${bin}）：${e && e.message ? e.message : String(e)}`));
      return;
    }
    const pid = child.pid ?? null;

    const feedLine = (line) => {
      if (!line || typeof parseLine !== 'function') return;
      let parsed;
      try {
        parsed = parseLine(line, state);
      } catch {
        return; // 单行解析失败不致命（后端可能打印非 JSON 噪音行）
      }
      if (!parsed) return;
      if (typeof parsed.sessionId === 'string' && parsed.sessionId) state.sessionId = parsed.sessionId;
      if (typeof parsed.text === 'string') {
        state.text = parsed.append ? (state.text ? `${state.text}\n${parsed.text}` : parsed.text) : parsed.text;
      }
    };

    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdoutAll += chunk;
        lineBuf += chunk;
        let idx;
        while ((idx = lineBuf.indexOf('\n')) >= 0) {
          feedLine(lineBuf.slice(0, idx));
          lineBuf = lineBuf.slice(idx + 1);
        }
        if (lineBuf.length > MAX_LINE_BYTES) {
          feedLine(lineBuf); // 无换行的超长行：强制冲刷，防吃爆内存
          lineBuf = '';
        }
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        if (stderr.length < 8192) stderr += chunk; // 只在内存里留少量，最终再截 512B
      });
    }

    child.on('error', (e) => {
      spawnErr = e; // ENOENT 等 → close 也会触发，统一在 close 结算
    });

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child);
    }, Math.max(1, effectiveTimeoutNum(timeoutMs)));
    if (typeof timer.unref === 'function') timer.unref();

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (lineBuf.length) feedLine(lineBuf); // 尾部无换行的残留行

      if (spawnErr) {
        reject(new Error(`spawn 失败（${id}/${bin}）：${spawnErr.message}${spawnErr.code === 'ENOENT' ? ' —— 该 CLI 未安装或不在 PATH' : ''}`));
        return;
      }

      let text = state.text.trim();
      let sessionId = state.sessionId;
      let error = null;

      if (typeof parseOutput === 'function') {
        try {
          const out = parseOutput(stdoutAll) || null;
          if (out) {
            if (typeof out.text === 'string' && out.text.trim()) text = out.text.trim();
            if (typeof out.sessionId === 'string' && out.sessionId) sessionId = out.sessionId;
            if (typeof out.error === 'string' && out.error) error = out.error;
          }
        } catch (e) {
          error = `输出解析失败：${e && e.message ? e.message : String(e)}`;
        }
      }

      const exitCode = timedOut ? TIMEOUT_EXIT_CODE : code == null ? (signal ? 128 : 1) : code;
      if (timedOut) {
        error = `超时（>${timeoutMs}ms）已杀进程组：该后端前置条件未就绪或响应过慢（id=${id}）`;
      } else if (!text && !error) {
        // §5/C6：不得静默——有任何"没拿到文本"的情形都给出**明确错误**（不把前置未就绪伪装成成功）。
        if (code === 0 || code == null) {
          error = `后端 '${id}' 正常退出但无输出（静默）；前置条件可能未就绪（详见 stderr 字段）`;
        } else {
          error = `后端 '${id}' 非零退出（exitCode=${exitCode}）且无文本输出；前置条件未就绪（详见 stderr 字段）`;
        }
      }
      resolve({
        text,
        sessionId: sessionId || null,
        exitCode,
        stderr: clipBytes(stderr.trim(), STDERR_CLIP_BYTES),
        pid,
        timedOut,
        error,
        signal: signal || null,
      });
    });
  });
}

/** 杀整个进程组（detached → child 是组长）；失败再退化为单进程 kill。 */
function killGroup(child) {
  if (!child || child.pid == null) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      /* 已退出 */
    }
  }
}

/** 截断到 ≤maxBytes 字节（UTF-8 安全：按字节切后重解码，去掉残码点）。 */
function clipBytes(s, maxBytes) {
  const str = String(s ?? '');
  const buf = Buffer.from(str, 'utf8');
  if (buf.length <= maxBytes) return str;
  return buf.subarray(0, maxBytes).toString('utf8').replace(/�+$/, '');
}

function effectiveTimeoutNum(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 600000;
}

/** 容错 JSON.parse：非 JSON（噪音行 / 空）→ null。 */
function safeJson(text) {
  const s = String(text ?? '').trim();
  if (!s || (s[0] !== '{' && s[0] !== '[')) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** 注册校验：id/bin 必填唯一，buildArgs/parseLine 必须是函数。 */
function validateBackend(backend) {
  if (!backend || typeof backend !== 'object') throw new Error('register: 后端必须是对象');
  const { id, bin, buildArgs, parseLine } = backend;
  if (typeof id !== 'string' || !id.trim()) throw new Error('register: 后端 id 必填（非空字符串）');
  if (typeof bin !== 'string' || !bin.trim()) throw new Error(`register: 后端 '${id}' 的 bin 必填（非空字符串）`);
  if (typeof buildArgs !== 'function') throw new Error(`register: 后端 '${id}' 必须提供 buildArgs 函数`);
  if (typeof parseLine !== 'function') throw new Error(`register: 后端 '${id}' 必须提供 parseLine 函数`);
}

/**
 * 建一个预装四内置后端的注册表（可再 `register` 追加自定义后端）。
 * 属**装配**入口：装哪些后端是部署配置（docs/EXTERNAL_AGENT_HARNESS.md §五），非底座语义。
 * @param {Array<object>|Record<string, object>} [extra] 追加后端（撞名则抛错）
 * @returns {CliBackendRegistry}
 */
export function createCliBackendRegistry(extra) {
  const registry = new CliBackendRegistry(BACKENDS);
  if (extra) registry.registerAll(extra);
  return registry;
}

/**
 * 进程级默认注册表（四内置后端已就绪）。测试/B-3b 装配可直接复用；
 * 需要隔离时用 `createCliBackendRegistry()` 另建实例。
 * @type {CliBackendRegistry}
 */
export const cliBackends = createCliBackendRegistry();
