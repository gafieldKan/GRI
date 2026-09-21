/**
 * MemoryStore —— 按 entity 隔离的跨会话持久记忆（agent.memory 表）。
 * 每个学生（entity）一个独立记忆命名空间；他人 entity 读不到（按 entity_id 过滤）。
 * 值一律 JSONB；strength 反映掌握度/读写频率，供 AgentCore 装配进 prompt 时排序。
 *
 * key 约定：`setting.*`（偏好）、`mastery.<kpId>`（掌握度）、`fact.*`（家庭/事实）…
 */

const AVOID_KEYS = /(password|secret|token|api_?key|credential)/i;

export class MemoryStore {
  /**
   * @param {import('./store.js').Store} store
   * @param {{ttlDays?:number, maxFacts?:number}} [opts]
   */
  constructor(store, opts = {}) {
    this.store = store;
    this.ttlDays = opts.ttlDays || 90;
    this.maxFacts = opts.maxFacts || 200;
  }

  /** 读一条事实（不存在 → null）。 */
  async get(entityId, factKey) {
    this._guardKey(factKey);
    const { rows } = await this.store.query(
      'SELECT value, strength, updated_at FROM agent.memory WHERE entity_id = $1 AND fact_key = $2',
      [entityId, factKey],
    );
    if (!rows || !rows[0]) return null;
    return rows[0].value;
  }

  /** 写一条事实（upsert，strength 取较大者）。value 一律 JSON 编码进 JSONB 列。 */
  async set(entityId, factKey, value, strength = 1) {
    this._guardKey(factKey);
    await this.store.query(
      `INSERT INTO agent.memory (entity_id, fact_key, value, strength) VALUES ($1, $2, $3, $4)
       ON CONFLICT (entity_id, fact_key) DO UPDATE SET
         value = EXCLUDED.value,
         strength = GREATEST(agent.memory.strength, EXCLUDED.strength),
         updated_at = NOW()`,
      [entityId, factKey, JSON.stringify(value), strength],
    );
    return true;
  }

  /** 删除一条事实。 */
  async delete(entityId, factKey) {
    this._guardKey(factKey);
    await this.store.query(
      'DELETE FROM agent.memory WHERE entity_id = $1 AND fact_key = $2',
      [entityId, factKey],
    );
    return true;
  }

  /**
   * 汇总某 entity 的记忆（按 strength 降序、截断 maxFacts）。
   * 一次性读全量 → 由 AgentCore 拼进 system prompt。
   * @returns {Array<{key:string,value:any,strength:number,updatedAt:any}>}
   */
  async list(entityId, { limit = 50 } = {}) {
    const { rows } = await this.store.query(
      `SELECT fact_key, value, strength, updated_at
         FROM agent.memory
        WHERE entity_id = $1
        ORDER BY strength DESC, updated_at DESC
        LIMIT $2`,
      [entityId, Math.min(limit, this.maxFacts || 200)],
    );
    return (rows || []).map((r) => ({
      key: r.fact_key,
      value: r.value,
      strength: r.strength,
      updatedAt: r.updated_at,
    }));
  }

  /** 记忆摘要（给 prompt 的紧凑字符串）。 */
  async digest(entityId, { limit = 50 } = {}) {
    const facts = await this.list(entityId, { limit });
    if (!facts.length) return '';
    return facts
      .map((f) => {
        const v = typeof f.value === 'string' ? f.value : JSON.stringify(f.value);
        return `${f.key}=${v}`;
      })
      .join('; ');
  }

  _guardKey(key) {
    if (typeof key !== 'string' || !key.trim()) throw new Error('memory fact_key 必填');
    if (AVOID_KEYS.test(key)) throw new Error(`memory key 拒绝含敏感字: ${key}`);
  }
}