import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CredentialStore, makeCipher, ModelRouter, storeFrom } from '../src/index.js';

const KEY = Buffer.alloc(32, 7); // 固定 32 字节主密钥（仅测试）
const PLAINTEXT = 'nvapi-TESTKEY1234';

/** 内存 fake store：模拟 agent.llm_credentials 表（含 bytea→Buffer 语义）。 */
function fakeCredStore(seed = {}) {
  const rows = new Map(Object.entries(seed));
  const calls = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    if (/INSERT INTO agent\.llm_credentials/.test(text)) {
      rows.set(params[0], {
        ciphertext: params[1], iv: params[2], auth_tag: params[3],
        algo: params[4], key_version: params[5], hint: params[6], updated_by: params[7],
        updated_at: '2026-10-22T00:00:00Z',
      });
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT ciphertext/.test(text)) {
      const r = rows.get(params[0]);
      return { rows: r ? [r] : [] };
    }
    if (/SELECT hint/.test(text)) {
      const r = rows.get(params[0]);
      return { rows: r ? [r] : [] };
    }
    if (/DELETE FROM agent\.llm_credentials/.test(text)) {
      rows.delete(params[0]);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [] };
  };
  return { query, calls, rows };
}

// ── makeCipher：原语本身 ────────────────────────────────────────────────────

test('makeCipher: 非 32 字节 master key → fail-fast 抛错', () => {
  assert.throws(() => makeCipher(Buffer.alloc(31)), /32 字节/);
  assert.throws(() => makeCipher(Buffer.alloc(33)), /32 字节/);
  assert.throws(() => makeCipher(null), /32 字节/);
});

test('makeCipher: 加密→解密往返一致，且带 algo/keyVersion 元数据', () => {
  const c = makeCipher(KEY);
  assert.equal(c.algo, 'aes-256-gcm');
  assert.equal(c.keyVersion, 1);
  const sealed = c.encrypt(PLAINTEXT);
  assert.ok(Buffer.isBuffer(sealed.ciphertext) && Buffer.isBuffer(sealed.iv) && Buffer.isBuffer(sealed.authTag));
  assert.equal(sealed.iv.length, 12); // GCM 12 字节 IV
  assert.equal(sealed.authTag.length, 16);
  assert.equal(c.decrypt(sealed), PLAINTEXT);
});

test('makeCipher: 同一明文两次加密 IV 不同 → 密文不同（随机 nonce）', () => {
  const c = makeCipher(KEY);
  const a = c.encrypt(PLAINTEXT);
  const b = c.encrypt(PLAINTEXT);
  assert.notEqual(a.iv.toString('hex'), b.iv.toString('hex'));
  assert.notEqual(a.ciphertext.toString('hex'), b.ciphertext.toString('hex'));
});

test('makeCipher: 明文不出现在密文里（真加密，非编码）', () => {
  const c = makeCipher(KEY);
  const sealed = c.encrypt(PLAINTEXT);
  assert.equal(sealed.ciphertext.includes(Buffer.from(PLAINTEXT, 'utf8')), false);
});

test('makeCipher: 篡改 authTag / 换密钥 → 解密抛错（GCM 认证失败）', () => {
  const c = makeCipher(KEY);
  const sealed = c.encrypt(PLAINTEXT);
  const tampered = { ...sealed, authTag: Buffer.from(sealed.authTag) };
  tampered.authTag[0] ^= 0xff;
  assert.throws(() => c.decrypt(tampered));
  const other = makeCipher(Buffer.alloc(32, 9));
  assert.throws(() => other.decrypt(sealed));
  assert.throws(() => c.decrypt({ ...sealed, ciphertext: Buffer.from('zz') }));
});

// ── CredentialStore：存储 + 隔离 ────────────────────────────────────────────

test('CredentialStore: set→get 往返（解密 == 原值），hint 只回后 4 位', async () => {
  const { query, calls } = fakeCredStore();
  const cs = new CredentialStore({ cipher: makeCipher(KEY), query });
  const out = await cs.set('entity=abc', PLAINTEXT, { updatedBy: 'op-1' });
  assert.deepEqual(out, { ok: true, hint: '1234' });
  const got = await cs.get('entity=abc');
  assert.equal(got.apiKey, PLAINTEXT);
  assert.equal(got.keyVersion, 1);
  // 落库参数零明文：8 个 bind 参数里不含明文串
  const ins = calls.find((c) => /INSERT INTO agent\.llm_credentials/.test(c.text));
  assert.ok(ins, '应走 INSERT … ON CONFLICT');
  assert.equal(JSON.stringify(ins.params.map((p) => (Buffer.isBuffer(p) ? p.toString('base64') : String(p)))).includes(PLAINTEXT), false);
  assert.equal(ins.params[6], '1234'); // hint 列只存后 4 位
  assert.equal(ins.params[7], 'op-1'); // 审计 updated_by
});

test('CredentialStore: 短 key 全掩（不因"后 4 位=全量"泄漏）', async () => {
  const { query } = fakeCredStore();
  const cs = new CredentialStore({ cipher: makeCipher(KEY), query });
  assert.deepEqual(await cs.set('default', 'abc'), { ok: true, hint: '****' });
  assert.deepEqual(await cs.set('default', '12345'), { ok: true, hint: '****' });
  assert.deepEqual(await cs.set('default', '12345678'), { ok: true, hint: '****' });
  assert.deepEqual(await cs.set('default', 'abcdefghi'), { ok: true, hint: 'fghi' });
});

test('CredentialStore: 无行 → get null / meta has_key:false（调用方回退 env）', async () => {
  const { query } = fakeCredStore();
  const cs = new CredentialStore({ cipher: makeCipher(KEY), query });
  assert.equal(await cs.get('entity=none'), null);
  assert.deepEqual(await cs.meta('entity=none'), {
    has_key: false, hint: null, keyVersion: null, updatedAt: null, updatedBy: null,
  });
});

test('CredentialStore: meta 只回元数据，永不含明文/密文', async () => {
  const { query } = fakeCredStore();
  const cs = new CredentialStore({ cipher: makeCipher(KEY), query });
  await cs.set('entity=abc', PLAINTEXT, { updatedBy: 'op-1' });
  const m = await cs.meta('entity=abc');
  assert.equal(m.has_key, true);
  assert.equal(m.hint, '1234');
  assert.equal(m.updatedBy, 'op-1');
  assert.equal(JSON.stringify(m).includes(PLAINTEXT), false);
  assert.equal('apiKey' in m, false);
});

test('CredentialStore: upsert 覆盖同一 route_key 的旧密文；remove 后回 null', async () => {
  const { query } = fakeCredStore();
  const cs = new CredentialStore({ cipher: makeCipher(KEY), query });
  await cs.set('default', 'nvapi-FIRST0001');
  await cs.set('default', 'nvapi-SECOND002');
  assert.equal((await cs.get('default')).apiKey, 'nvapi-SECOND002');
  assert.equal((await cs.meta('default')).hint, 'D002');
  await cs.remove('default');
  assert.equal(await cs.get('default'), null);
});

test('CredentialStore: 篡改密文 → get 抛错（fail-fast，绝不返回 null）', async () => {
  const { query, rows } = fakeCredStore();
  const cs = new CredentialStore({ cipher: makeCipher(KEY), query });
  await cs.set('entity=abc', PLAINTEXT);
  rows.get('entity=abc').auth_tag = Buffer.from('0000000000000000', 'hex');
  await assert.rejects(() => cs.get('entity=abc'), /凭据解密失败/);
});

test('CredentialStore: key_version 不符 → 抛错（不静默回退，提示轮换）', async () => {
  const { query, rows } = fakeCredStore();
  const cs = new CredentialStore({ cipher: makeCipher(KEY), query });
  await cs.set('entity=abc', PLAINTEXT);
  rows.get('entity=abc').key_version = 2;
  await assert.rejects(() => cs.get('entity=abc'), /key_version 不符/);
});

test('CredentialStore: algo 不符 → 抛错', async () => {
  const { query, rows } = fakeCredStore();
  const cs = new CredentialStore({ cipher: makeCipher(KEY), query });
  await cs.set('entity=abc', PLAINTEXT);
  rows.get('entity=abc').algo = 'aes-128-cbc';
  await assert.rejects(() => cs.get('entity=abc'), /算法不符/);
});

test('CredentialStore: 构造缺 cipher/query → 抛错（装配 fail-fast）；route_key 必填', async () => {
  assert.throws(() => new CredentialStore({ query: async () => ({ rows: [] }) }), /cipher/);
  assert.throws(() => new CredentialStore({ cipher: makeCipher(KEY) }), /query/);
  const { query } = fakeCredStore();
  const cs = new CredentialStore({ cipher: makeCipher(KEY), query });
  await assert.rejects(() => cs.get(''), /route_key 必填/);
});

test('CredentialStore: 无 process.env 依赖（底座不读 env —— 判据 3）', async () => {
  const { query } = fakeCredStore();
  const cs = new CredentialStore({ cipher: makeCipher(KEY), query });
  assert.equal(typeof cs.get, 'function');
  // 源码级断言在 verify.sh §底座零 env；此处保证 module 加载期不读 env 即可正常构造
});

// ── ModelRouter.resolve 合并凭据 ───────────────────────────────────────────

/** 只答 agent.llm_routes 的 fake store；credentials 用真 CredentialStore（真加解密）。 */
function fakeRouteStore(routes = []) {
  const byKey = new Map(routes.map((r) => [r.route_key, r]));
  return { query: async (text, params = []) => (/llm_routes/.test(text) ? { rows: byKey.get(params[0]) ? [byKey.get(params[0])] : [] } : { rows: [] }) };
}

test('model-router: entity 凭据优先于 default 凭据，再优先于 env', async () => {
  const { query } = fakeCredStore();
  const creds = new CredentialStore({ cipher: makeCipher(KEY), query });
  await creds.set('default', 'nvapi-DEFAULT99');
  await creds.set('entity=abc', 'nvapi-ENTITY1234');
  const r = new ModelRouter(fakeRouteStore([{ route_key: 'entity=abc', model: 'route-model', enabled: true }]), { LLM_API_KEY: 'nvapi-ENVKEY' }, creds);

  const cfg = await r.resolve('entity=abc');
  assert.equal(cfg.apiKey, 'nvapi-ENTITY1234'); // 具体凭据最优先
  assert.equal(cfg.model, 'route-model');
  assert.equal(cfg.source, 'route+cred');
  assert.equal(await r.isRealKey('entity=abc'), true);
});

test('model-router: entity 无凭据 → 落 default 凭据（route_key 无行也算有凭据）', async () => {
  const { query } = fakeCredStore();
  const creds = new CredentialStore({ cipher: makeCipher(KEY), query });
  await creds.set('default', 'nvapi-DEFAULT99');
  const r = new ModelRouter(fakeRouteStore([]), { LLM_API_KEY: 'nvapi-ENVKEY' }, creds);

  const cfg = await r.resolve('entity=abc');
  assert.equal(cfg.apiKey, 'nvapi-DEFAULT99');
  assert.equal(cfg.source, 'cred'); // 无路由行、只有凭据
});

test('model-router: 无凭据行 → 与今日一致（env 兜底，source 不变）', async () => {
  const { query } = fakeCredStore();
  const creds = new CredentialStore({ cipher: makeCipher(KEY), query });
  const routes = fakeRouteStore([{ route_key: 'entity=abc', model: 'm', enabled: true }]);
  const r = new ModelRouter(routes, { LLM_API_KEY: 'nvapi-ENVKEY' }, creds);
  const cfg = await r.resolve('entity=abc');
  assert.equal(cfg.apiKey, 'nvapi-ENVKEY');
  assert.equal(cfg.source, 'route'); // 注入 creds 但无行 → 旧语义不变（C9）
});

test('model-router: 未注入 credentials → 行为与今日完全一致', async () => {
  const r = new ModelRouter(fakeRouteStore([{ route_key: 'entity=abc', model: 'm', enabled: true }]), { LLM_API_KEY: 'nvapi-ENVKEY' });
  const cfg = await r.resolve('entity=abc');
  assert.equal(cfg.apiKey, 'nvapi-ENVKEY');
  assert.equal(cfg.source, 'route');
});

test('model-router: 凭据被篡改 → resolve 抛错（不静默回退 env）', async () => {
  const { query, rows } = fakeCredStore();
  const creds = new CredentialStore({ cipher: makeCipher(KEY), query });
  await creds.set('entity=abc', 'nvapi-ENTITY1234');
  rows.get('entity=abc').ciphertext = Buffer.from('deadbeef', 'hex');
  const r = new ModelRouter(fakeRouteStore([]), { LLM_API_KEY: 'nvapi-ENVKEY' }, creds);
  await assert.rejects(() => r.resolve('entity=abc'), /凭据解密失败/);
  await assert.rejects(() => r.isRealKey('entity=abc'), /凭据解密失败/);
});

test('model-router: 凭据表缺失（迁移未应用）→ 回退 env，不崩', async () => {
  const missing = {
    get: async () => {
      const e = new Error('relation "agent.llm_credentials" does not exist');
      e.code = '42P01';
      throw e;
    },
  };
  const r = new ModelRouter(fakeRouteStore([]), { LLM_API_KEY: 'nvapi-ENVKEY' }, missing);
  const cfg = await r.resolve('entity=abc');
  assert.equal(cfg.apiKey, 'nvapi-ENVKEY');
  assert.equal(cfg.source, 'env');
});

test('model-router: 明文永不进路由行写入（set 仍无 api_key 列）', async () => {
  const calls = [];
  const store = storeFrom(async (text, params) => {
    calls.push({ text, params });
    return { rows: [], rowCount: 0 };
  });
  const { query } = fakeCredStore();
  const creds = new CredentialStore({ cipher: makeCipher(KEY), query });
  const r = new ModelRouter(store, {}, creds);
  await r.set({ route_key: 'entity=abc', model: 'm' });
  assert.equal(calls.some((c) => /api_?key/i.test(c.text)), false);
  assert.equal(JSON.stringify(calls).includes('nvapi-'), false);
});
