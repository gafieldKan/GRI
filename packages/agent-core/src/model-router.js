/**
 * ModelRouter —— 前台可配大模型路由（仿 OpenClaw ``models.providers`` provider-catalog 的浓缩）。
 * 读 agent.llm_routes 表（Store 注入），按 routeKey 从最具体到 default 选首个 enabled 行，
 * 未命中则回退 env 缺省。切换=写表立即生效（每轮 resolve 都读库），无需重启。
 *
 * apiKey 永不入库：路由行只覆盖 provider/model/multimodal_model/base_url；
 * apiKey 一律取自注入的 env（生产走 SecretRef，dev 走 LLM_API_KEY 环境变量）。
 *
 * routeKey 约定：'default' | 'kind=<kind>' | 'entity=<entityId>'（越具体越优先）。
 */
export class ModelRouter {
  /**
   * @param {{ query: Function }} store
   * @param {Record<string,string|undefined>} [env] 注入 env 便于测试；缺省 process.env
   */
  constructor(store, env = null) {
    this.store = store;
    this.env = env || process.env || {};
  }

  _envDefaults() {
    return {
      provider: this.env.LLM_PROVIDER || 'nvidia',
      model: this.env.LLM_MODEL || 'deepseek-ai/deepseek-v4-flash-0731',
      multimodalModel: this.env.LLM_MULTIMODAL_MODEL || 'nvidia/neva-22b',
      baseUrl: this.env.LLM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions',
      apiKey: this.env.LLM_API_KEY || '',
    };
  }

  /**
   * 解析某 routeKey 当前生效的 LLM 配置。
   * @param {string} routeKey
   * @returns {Promise<{provider:string,model:string,multimodalModel:string,baseUrl:string,apiKey:string,source:'route'|'env'}>}
   */
  async resolve(routeKey) {
    const base = this._envDefaults();
    const row = await this._pick(routeKey);
    if (!row) return { ...base, source: 'env' };
    return {
      provider: row.provider || base.provider,
      model: row.model || base.model,
      multimodalModel: row.multimodal_model || base.multimodalModel,
      baseUrl: row.base_url || base.baseUrl,
      apiKey: base.apiKey, // 运行凭据不随路由行存
      source: 'route',
    };
  }

  /** mock gate：真实 key 为 nvapi- 前缀。 */
  async isRealKey(routeKey) {
    const cfg = await this.resolve(routeKey);
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

  /** 增改一条路由（admin 用）。enabled 缺省 true；apiKey 不入参。 */
  async set(route) {
    const r = route || {};
    if (!r.route_key) throw new Error('route_key required');
    await this.store.query(
      `INSERT INTO agent.llm_routes (route_key, provider, model, multimodal_model, base_url, enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (route_key) DO UPDATE SET
         provider=$2, model=$3, multimodal_model=$4, base_url=$5, enabled=$6, updated_at=NOW()`,
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