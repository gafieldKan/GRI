/**
 * ModelRouter —— 前台可配大模型路由（仿 OpenClaw ``models.providers`` provider-catalog 的浓缩）。
 * 读 agent.llm_routes 表（Store 注入），按 routeKey 从最具体到 default 选首个 enabled 行，
 * 未命中则回退 env 缺省。切换=写表立即生效（每轮 resolve 都读库），无需重启。
 *
 * apiKey 来源（B-1 凭据缝，优先级从高到低）：
 *   ① 该 routeKey 的密文凭据（注入的 CredentialStore，agent.llm_credentials，AES-256-GCM）
 *   ② default 的密文凭据
 *   ③ 注入的 env（生产走 SecretRef，dev 走 LLM_API_KEY）
 * 未注入 credentials → 行为与既有完全一致（只走 env，向后兼容）。明文永不进路由行、永不外传
 * （HTTP 面只回 has_key + 掩码，见 agent-admin.controller）。
 *
 * routeKey 约定：'default' | 'kind=<kind>' | 'entity=<entityId>'（越具体越优先）。
 *
 * provider='cli' 分支（B-3b「换脑子」接入点）：某 routeKey 的**路由行** provider='cli' 时，
 * `model` 字段即外部 agent 后端 id（claude-code/codex/openclaw/hermes），`resolve` 额外回
 * `cliBackend=<model>`（其余情形恒 `null`）供 LlmClient 改走 CliBackendRegistry（不 POST）。
 * 用户可选 = 该 routeKey 是否存在 enabled 的 provider='cli' 行：无 → 走原 provider（默认态，零回归）。
 * 判定只看**路由行**，不读 env —— 不引入任何全局开关（C2）。
 */
export class ModelRouter {
  /**
   * @param {{ query: Function }} store
   * @param {Record<string,string|undefined>} [env] 注入 env 便于测试；缺省 process.env
   * @param {{get: (routeKey: string) => Promise<{apiKey: string, keyVersion?: number}|null>}} [credentials]
   *        可空：每 routeKey 的密文凭据读取器（底座 CredentialStore）。缺省 → 只走 env（向后兼容）。
   */
  constructor(store, env = null, credentials = null) {
    this.store = store;
    this.env = env || process.env || {};
    this.credentials = credentials || null;
  }

  _envDefaults() {
    return {
      provider: this.env.LLM_PROVIDER || 'nvidia',
      // v4-flash-0731 于 2026-09-21 EOL，默认改后继 v4.1-flash
      model: this.env.LLM_MODEL || 'deepseek-ai/deepseek-v4.1-flash',
      multimodalModel: this.env.LLM_MULTIMODAL_MODEL || 'nvidia/neva-22b',
      baseUrl: this.env.LLM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions',
      apiKey: this.env.LLM_API_KEY || '',
    };
  }

  /**
   * 解析某 routeKey 当前生效的 LLM 配置。
   * provider='cli' 时 `cliBackend = <model>`（外部 agent 后端 id），source='route:cli'；否则 cliBackend=null。
   * @param {string} routeKey
   * @returns {Promise<{provider:string,model:string,multimodalModel:string,baseUrl:string,apiKey:string,cliBackend:string|null,source:'route'|'env'|'cred'|'route+cred'|'route:cli'}>}
   */
  async resolve(routeKey) {
    const base = this._envDefaults();
    const row = await this._pick(routeKey);
    const cred = await this._credential(routeKey); // 该 routeKey 密文凭据 → default 凭据（可空注入 → null）
    // provider='cli' 只看路由行（不看 env）：该 routeKey 有 enabled cli 行 → 走外部 CLI 后端（换脑子）。
    const isCli = !!row && row.provider === 'cli';
    return {
      provider: row?.provider || base.provider,
      model: row?.model || base.model,
      multimodalModel: row?.multimodal_model || base.multimodalModel,
      baseUrl: row?.base_url || base.baseUrl,
      apiKey: cred?.apiKey || base.apiKey, // 用户 key 优先（解密所得），env 兜底
      cliBackend: isCli ? row.model || null : null, // provider='cli' → model 即后端 id；其余恒 null（零回归）
      source: isCli ? 'route:cli' : cred ? (row ? 'route+cred' : 'cred') : row ? 'route' : 'env',
    };
  }

  /**
   * 取该 routeKey 生效的密文凭据：具体键优先，其次 default（与路由行同样的「越具体越优先」）。
   * 未注入 credentials → null（行为同今日）。表缺失（迁移未应用）→ 视为无凭据（不回归）；
   * 其余错误（解密失败 / algo / key_version 不符 / 篡改）**一律上抛 fail-fast**（C8），静默回退 env 会用错 key。
   * @param {string} routeKey
   */
  async _credential(routeKey) {
    if (!this.credentials || typeof this.credentials.get !== 'function') return null;
    const candidates = routeKey === 'default' ? ['default'] : [routeKey, 'default'];
    for (const key of candidates) {
      try {
        const cred = await this.credentials.get(key);
        if (cred && cred.apiKey) return cred;
      } catch (e) {
        if (isMissingRelation(e)) continue; // 表/迁移缺失 → 回退下一候选 / env
        throw e; // fail-fast：绝不把解密失败吞成"无凭据"
      }
    }
    return null;
  }

  /**
   * mock gate：真实 key 为 nvapi- 前缀；**cli 路由**（有 enabled provider='cli' 行）视为真
   * ——否则会误判无 key 而落 mock，外部 CLI 后端永不执行。
   */
  async isRealKey(routeKey) {
    const cfg = await this.resolve(routeKey);
    if (cfg.cliBackend) return true; // 外部 CLI 后端：由路由行显式开启（换脑子）
    return !!cfg.apiKey && cfg.apiKey.startsWith('nvapi-');
  }

  /**
   * 选路由：候选键从具体→default，取首个 enabled（enabled 缺省 true）。
   * @param {string} routeKey
   * @returns {Promise<object|null>}
   */
  async _pick(routeKey) {
    const candidates = routeKey === 'default' ? ['default'] : [routeKey, 'default'];
    for (const key of candidates) {
      try {
        const { rows } = await this.store.query('SELECT * FROM agent.llm_routes WHERE route_key = $1', [key]);
        const row = rows && rows[0];
        if (row && row.enabled !== false) return row;
      } catch {
        // 表缺失/查错 → 回退下一候选 / env
      }
    }
    return null;
  }

  /** 列出全部可配路由（admin 用）。 */
  async list() {
    try {
      const { rows } = await this.store.query('SELECT route_key, provider, model, multimodal_model, base_url, enabled, updated_at FROM agent.llm_routes ORDER BY route_key');
      return rows || [];
    } catch {
      return [];
    }
  }

  /** 增改一条路由（admin 用）。enabled 缺省 true；apiKey 不入参（密文凭据走 CredentialStore）。 */
  async set(route) {
    const r = route || {};
    if (!r.route_key) throw new Error('route_key required');
    // provider 是 NOT NULL DEFAULT 'nvidia'：未传时必须落默认/保留旧值，不能显式写 NULL
    // （否则插入直接吃 23502 not-null violation —— "只改 model 不改 provider" 这种最常见写法会 500）。
    await this.store.query(
      `INSERT INTO agent.llm_routes (route_key, provider, model, multimodal_model, base_url, enabled)
       VALUES ($1, COALESCE($2, 'nvidia'), $3, $4, $5, $6)
       ON CONFLICT (route_key) DO UPDATE SET
         provider = COALESCE($2, agent.llm_routes.provider),
         model=$3, multimodal_model=$4, base_url=$5, enabled=$6, updated_at=NOW()`,
      [
        r.route_key,
        r.provider || null,
        r.model || null,
        r.multimodal_model || null,
        r.base_url || null,
        r.enabled === undefined ? true : !!r.enabled,
      ],
    );
    return true;
  }
}

/** 表/迁移尚未应用（pg 42P01 undefined_table）→ 视为「无凭据」而非篡改，允许回退 env。 */
function isMissingRelation(e) {
  if (!e) return false;
  if (e.code === '42P01') return true;
  return /relation .* does not exist/i.test(String(e.message || ''));
}