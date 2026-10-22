/**
 * CredentialStore + makeCipher —— 底座「凭据缝」：每 routeKey（`entity=<id>` / `default`）
 * 各持一把大模型 api key 的**密文**存储。表 agent.llm_credentials（032 迁移）。
 *
 * 分层判据（docs/AGENT_LAYERING.md 判据 3）：加密原语是通用能力 → 属底座；**master key 本身
 * 由宿主注入** → 本模块**不读环境变量、不读 .env**（源码里对环境变量的读取命中恒为 0）。宿主
 * （Nest）从 env 读入后 `makeCipher(key)` 注入。
 *
 * 铁律：
 *   - 明文永不落库（只写 ciphertext/iv/auth_tag）；hint 仅后 4 位。
 *   - 明文永不外传（meta() 只回 {has_key, hint, …}）；错误信息不含明文/密文。
 *   - 解密失败（篡改 / algo 不符 / key_version 不符）→ **fail-fast 抛错**，绝不返回 null
 *     让调用方静默回退 env（否则用错 key 会产生"假成功"）。
 *
 * 持久层只经注入的 query（storeFrom 同款 QueryFn）→ 与 pg 解耦，可用 fake store 单测。
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** 唯一支持的算法（AES-256-GCM：机密性 + 完整性一体）。 */
const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32;   // aes-256
const IV_BYTES = 12;    // GCM 推荐 96-bit nonce
/** hint 只保留后 4 位；短于该阈值一律全掩，防"key 短到后 4 位=全量"泄漏。 */
const HINT_MIN_LEN = 9;
const HINT_PLACEHOLDER = '****';

/**
 * 加密原语（node:crypto，AES-256-GCM）。底座自带，master key 由宿主传入。
 * @param {Buffer|Uint8Array} masterKey 32 字节主密钥
 * @param {{keyVersion?: number}} [opts] keyVersion 用于 master key 轮换（行密文代际比对）
 * @returns {{algo: string, keyVersion: number, encrypt: (p: string) => {ciphertext: Buffer, iv: Buffer, authTag: Buffer}, decrypt: (e: {ciphertext: Buffer|Uint8Array, iv: Buffer|Uint8Array, authTag: Buffer|Uint8Array}) => string}}
 */
export function makeCipher(masterKey, opts = {}) {
  const key = toBuf(masterKey);
  if (!key || key.length !== KEY_BYTES) {
    // fail-fast：配置错（长度不符）必须启动即炸，不留到首次解密才暴露。
    throw new Error(`makeCipher: master key 必须 ${KEY_BYTES} 字节（实得 ${key ? key.length : 'n/a'}），请检查 AGENT_CRED_MASTER_KEY`);
  }
  const keyVersion = Number(opts.keyVersion ?? 1);
  return {
    algo: ALGO,
    keyVersion,
    /** @param {string} plaintext @returns {{ciphertext: Buffer, iv: Buffer, authTag: Buffer}} */
    encrypt(plaintext) {
      if (typeof plaintext !== 'string' || plaintext.length === 0) {
        throw new Error('makeCipher.encrypt: plaintext 必填且非空');
      }
      const iv = randomBytes(IV_BYTES); // 每次写入新 IV（GCM 复用 nonce 会毁掉机密性）
      const cipher = createCipheriv(ALGO, key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return { ciphertext, iv, authTag: cipher.getAuthTag() };
    },
    /** @param {{ciphertext: any, iv: any, authTag: any}} sealed @returns {string} 明文（仅供调用方内部使用） */
    decrypt(sealed) {
      const ciphertext = toBuf(sealed && sealed.ciphertext);
      const iv = toBuf(sealed && sealed.iv);
      const authTag = toBuf(sealed && sealed.authTag);
      if (!ciphertext || !iv || !authTag) throw new Error('makeCipher.decrypt: 密文行不完整');
      const decipher = createDecipheriv(ALGO, key, iv);
      decipher.setAuthTag(authTag);
      // GCM 校验失败（篡改/密钥不符）在此抛 Error —— 由 CredentialStore 包成不带明文的错误。
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    },
  };
}

/**
 * 凭据存储：agent.llm_credentials 的读写（DB 无关，只经注入 query）。
 */
export class CredentialStore {
  /**
   * @param {{cipher: {encrypt: Function, decrypt: Function, algo?: string, keyVersion?: number}, query: import('./store.js').QueryFn}} deps
   */
  constructor({ cipher, query } = {}) {
    if (!cipher || typeof cipher.encrypt !== 'function' || typeof cipher.decrypt !== 'function') {
      throw new Error('CredentialStore: 需要注入 cipher（makeCipher 产物）');
    }
    if (typeof query !== 'function') {
      throw new Error('CredentialStore: 需要注入 query（storeFrom 同款 QueryFn）');
    }
    this._cipher = cipher;
    this._query = query;
    this.algo = cipher.algo || ALGO;
    this.keyVersion = Number(cipher.keyVersion ?? 1);
  }

  /**
   * 读并解密某 routeKey 的 key。无行 → null（调用方回退 default 凭据 / env）。
   * 解密类错误一律抛出（C8 fail-fast），不返回 null。
   * @param {string} routeKey
   * @returns {Promise<{apiKey: string, keyVersion: number}|null>}
   */
  async get(routeKey) {
    assertRouteKey(routeKey);
    const { rows } = await this._query(
      'SELECT ciphertext, iv, auth_tag, algo, key_version FROM agent.llm_credentials WHERE route_key = $1',
      [routeKey],
    );
    const row = (rows || [])[0];
    if (!row) return null;
    if (String(row.algo) !== this.algo) {
      throw new Error(`凭据算法不符（route_key=${routeKey} 行=${row.algo} 期望=${this.algo}）→ 拒绝解密`);
    }
    if (Number(row.key_version) !== this.keyVersion) {
      throw new Error(
        `凭据 key_version 不符（route_key=${routeKey} 行=${row.key_version} 当前=${this.keyVersion}）→ 需轮换重加密，拒绝回退 env`,
      );
    }
    let apiKey;
    try {
      apiKey = this._cipher.decrypt({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag });
    } catch (e) {
      // 零明文/零密文进错误信息：只报 routeKey 与原因类别。
      throw new Error(`凭据解密失败（route_key=${routeKey}）：密钥不符或密文被篡改`);
    }
    return { apiKey, keyVersion: Number(row.key_version) };
  }

  /**
   * 写：加密后 upsert。返回 {ok, hint}（hint = 后 4 位，供 UI 掩码）。
   * @param {string} routeKey
   * @param {string} plaintext
   * @param {{updatedBy?: string|null}} [opts]
   */
  async set(routeKey, plaintext, { updatedBy = null } = {}) {
    assertRouteKey(routeKey);
    const { ciphertext, iv, authTag } = this._cipher.encrypt(plaintext);
    const hint = hintOf(plaintext);
    await this._query(
      `INSERT INTO agent.llm_credentials (route_key, ciphertext, iv, auth_tag, algo, key_version, hint, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (route_key) DO UPDATE SET
         ciphertext=$2, iv=$3, auth_tag=$4, algo=$5, key_version=$6, hint=$7, updated_by=$8, updated_at=NOW()`,
      [routeKey, ciphertext, iv, authTag, this.algo, this.keyVersion, hint, updatedBy],
    );
    return { ok: true, hint };
  }

  /** 删凭据（路由行保留；下次 resolve 回退 default 凭据 / env）。 */
  async remove(routeKey) {
    assertRouteKey(routeKey);
    await this._query('DELETE FROM agent.llm_credentials WHERE route_key = $1', [routeKey]);
    return true;
  }

  /**
   * 只回元数据（永不含明文/密文）：{has_key, hint, keyVersion, updatedAt, updatedBy}。
   * @param {string} routeKey
   */
  async meta(routeKey) {
    assertRouteKey(routeKey);
    const { rows } = await this._query(
      'SELECT hint, key_version, updated_at, updated_by FROM agent.llm_credentials WHERE route_key = $1',
      [routeKey],
    );
    const row = (rows || [])[0];
    return {
      has_key: !!row,
      hint: row ? row.hint ?? null : null,
      keyVersion: row ? Number(row.key_version) : null,
      updatedAt: row ? row.updated_at ?? null : null,
      updatedBy: row ? row.updated_by ?? null : null,
    };
  }
}

/** hint：仅后 4 位；短 key 全掩（防"后 4 位即全量"）。 */
export function hintOf(plaintext) {
  const s = String(plaintext ?? '');
  return s.length >= HINT_MIN_LEN ? s.slice(-4) : HINT_PLACEHOLDER;
}

function assertRouteKey(routeKey) {
  if (typeof routeKey !== 'string' || !routeKey.trim()) throw new Error('route_key 必填');
}

/** pg 的 BYTEA 回 Buffer；兼容 Uint8Array 与 '\x…' hex 文本（fake store / 其它驱动）。 */
function toBuf(v) {
  if (v == null) return null;
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  if (typeof v === 'string') {
    if (/^\\x[0-9a-fA-F]*$/.test(v)) return Buffer.from(v.slice(2), 'hex');
    return Buffer.from(v, 'utf8');
  }
  return null;
}
