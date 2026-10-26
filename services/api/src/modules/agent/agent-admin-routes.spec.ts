import { ForbiddenException } from '@nestjs/common';
import { AgentAdminRoutesController } from './agent-admin.controller';
import { AgentCredentialsService, parseMasterKey } from './agent-credentials.service';
import { OrganizationService } from '../organization/organization.service';

// @gri/agent-core 是 ESM（type: module）；与本仓其它 @gri/* 消费 spec 一致 jest.mock 重定向。
// 真加解密/密文落库由 packages/agent-core 的 node --test 套件 + b1-verify.sh 活体覆盖；
// 本 spec 只锁 Nest 面契约：只写不读、掩码、守卫先行、未配置主密钥即拒收。
const mockRouter: { setCalls: any[]; listRows: any[]; ctorCreds: any[] } = { setCalls: [], listRows: [], ctorCreds: [] };
jest.mock('@gri/agent-core', () => ({
  ModelRouter: class {
    constructor(_store: any, _env: any, credentials: any) {
      mockRouter.ctorCreds.push(credentials);
    }
    async list() {
      return mockRouter.listRows;
    }
    async set(r: any) {
      mockRouter.setCalls.push(r);
      return true;
    }
  },
  storeFrom: (q: any) => ({ query: q }),
  CredentialStore: class {},
  makeCipher: () => ({}),
}));

const PLAINTEXT = 'nvapi-TESTKEY1234';

function makeOrg(op: boolean): OrganizationService {
  return {
    assertSiteOperator: jest.fn(async () => {
      if (!op) throw new ForbiddenException('你不是该组织成员');
    }),
  } as unknown as OrganizationService;
}

function fakeDb(): any {
  return { query: jest.fn(async () => ({ rows: [] })) };
}

/** 记录型假凭据存储：把"写进去的明文"留在内存，供断言"HTTP 面不回明文"。 */
function fakeCredsSvc(enabled = true): { svc: AgentCredentialsService; sets: any[] } {
  const sets: any[] = [];
  const rows = new Map<string, { apiKey: string; hint: string }>();
  const store = {
    set: jest.fn(async (routeKey: string, plaintext: string, opts: any) => {
      sets.push({ routeKey, plaintext, opts });
      const hint = plaintext.length >= 9 ? plaintext.slice(-4) : '****';
      rows.set(routeKey, { apiKey: plaintext, hint });
      return { ok: true, hint };
    }),
    get: jest.fn(async (routeKey: string) => rows.get(routeKey) ?? null),
    meta: jest.fn(async (routeKey: string) => {
      const r = rows.get(routeKey);
      return { has_key: !!r, hint: r?.hint ?? null, keyVersion: 1, updatedAt: null, updatedBy: null };
    }),
    remove: jest.fn(async () => true),
  };
  const svc = { store: enabled ? store : null, enabled } as unknown as AgentCredentialsService;
  return { svc, sets };
}

function req(uid: string): any {
  return { auth: { externalId: uid } as any };
}

beforeEach(() => {
  mockRouter.setCalls = [];
  mockRouter.listRows = [];
  mockRouter.ctorCreds = [];
});

describe('parseMasterKey（宿主读 env → 32 字节；长度错即 fail-fast）', () => {
  it('hex64 / base64 / 32 字符原文 → 均解出 32 字节', () => {
    expect(parseMasterKey('a'.repeat(64)).length).toBe(32);
    expect(parseMasterKey(Buffer.alloc(32, 1).toString('base64')).length).toBe(32);
    expect(parseMasterKey('x'.repeat(32)).length).toBe(32);
    expect(parseMasterKey('  ' + 'x'.repeat(32) + '  ').length).toBe(32); // 容忍首尾空白
  });

  it('长度非法 → 抛错，且错误信息不含密钥值', () => {
    const bad = 'SECRETVALUE-NOT-A-KEY';
    expect(() => parseMasterKey(bad)).toThrow(/32 字节/);
    try {
      parseMasterKey(bad);
    } catch (e: any) {
      expect(String(e.message).includes(bad)).toBe(false); // 零泄漏
    }
    expect(() => parseMasterKey('')).toThrow();
    expect(() => parseMasterKey('a'.repeat(63))).toThrow();
  });
});

describe('AgentAdminRoutesController · 凭据缝 HTTP 面（只写不读）', () => {
  it('PUT 带 api_key → 路由行照旧写入（不含 key）+ 凭据只写 + 响应只回掩码', async () => {
    const db = fakeDb();
    const { svc, sets } = fakeCredsSvc();
    const ctrl = new AgentAdminRoutesController(db, makeOrg(true), svc);

    const out = await ctrl.upsert(req('op-1'), { route_key: 'entity=u-1', model: 'm1', api_key: PLAINTEXT });

    expect(out.success).toBe(true);
    expect(out.has_key).toBe(true);
    expect(out.hint).toBe('1234'); // 仅后 4 位
    expect(JSON.stringify(out).includes(PLAINTEXT)).toBe(false); // 响应零明文
    // 路由行不含 api_key（路由行可被运营读）
    expect(mockRouter.setCalls[0]).toEqual({
      route_key: 'entity=u-1', provider: undefined, model: 'm1',
      multimodal_model: undefined, base_url: undefined, enabled: true,
    });
    expect(JSON.stringify(mockRouter.setCalls).includes(PLAINTEXT)).toBe(false);
    // 凭据写入带审计 updated_by（externalId），不记明文于审计
    expect(sets[0].routeKey).toBe('entity=u-1');
    expect(sets[0].plaintext).toBe(PLAINTEXT);
    expect(sets[0].opts.updatedBy).toBe('op-1');
  });

  it('PUT 不带 api_key → 完全不上凭据面（C9 零回归：凭据写入 0 次）', async () => {
    const db = fakeDb();
    const { svc, sets } = fakeCredsSvc();
    const ctrl = new AgentAdminRoutesController(db, makeOrg(true), svc);

    const out = await ctrl.upsert(req('op-1'), { route_key: 'default', model: 'm2' });

    expect(out.success).toBe(true);
    expect(out.has_key).toBe(false);
    expect(out.hint).toBeNull();
    expect(sets).toHaveLength(0); // 不写凭据
    expect(mockRouter.setCalls).toHaveLength(1); // 路由行照旧
  });

  it('未配置 master key（凭据面关闭）→ 带 api_key 被拒，且不写路由行/不写凭据', async () => {
    const db = fakeDb();
    const { svc, sets } = fakeCredsSvc(false);
    const ctrl = new AgentAdminRoutesController(db, makeOrg(true), svc);

    const out = await ctrl.upsert(req('op-1'), { route_key: 'entity=u-1', api_key: PLAINTEXT });

    expect(out.success).toBe(false);
    expect(String(out.error)).toMatch(/AGENT_CRED_MASTER_KEY/);
    expect(JSON.stringify(out).includes(PLAINTEXT)).toBe(false);
    expect(sets).toHaveLength(0);
    expect(mockRouter.setCalls).toHaveLength(0); // 拒绝即为"未写入任何变更"
  });

  it('api_key 过短 → 拒收（不写路由/不写凭据）', async () => {
    const db = fakeDb();
    const { svc, sets } = fakeCredsSvc();
    const ctrl = new AgentAdminRoutesController(db, makeOrg(true), svc);

    const out = await ctrl.upsert(req('op-1'), { route_key: 'entity=u-1', api_key: 'short' });

    expect(out.success).toBe(false);
    expect(sets).toHaveLength(0);
    expect(mockRouter.setCalls).toHaveLength(0);
  });

  // ── W2.6b：engine 写入口早校验（防错字把路由指到不存在的引擎）──────────────
  const agentWith = (ids: string[]): any => ({ knownEngineIds: () => ids });

  it('engine：合法 id → 透传给 router.set（写时生效）', async () => {
    const { svc } = fakeCredsSvc();
    const ctrl = new AgentAdminRoutesController(fakeDb(), makeOrg(true), svc, agentWith(['gri-core', 'claude-code', 'openclaw']));
    const out = await ctrl.upsert(req('op-1'), { route_key: 'default', engine: 'claude-code' });
    expect(out.success).toBe(true);
    expect(mockRouter.setCalls[0].engine).toBe('claude-code');
  });

  it('engine：未知 id → 写入口即拒（不写路由/不写凭据），并回可用集', async () => {
    const { svc, sets } = fakeCredsSvc();
    const ctrl = new AgentAdminRoutesController(fakeDb(), makeOrg(true), svc, agentWith(['gri-core', 'claude-code', 'openclaw']));
    const out = await ctrl.upsert(req('op-1'), { route_key: 'default', engine: 'claude-cod' });
    expect(out.success).toBe(false);
    expect(String(out.error)).toMatch(/未知引擎/);
    expect(out.knownEngines).toEqual(['gri-core', 'claude-code', 'openclaw']);
    expect(mockRouter.setCalls).toHaveLength(0);
    expect(sets).toHaveLength(0);
  });

  it('engine：不传 → undefined 透传（set 走 COALESCE 保留旧值，不静默清空）', async () => {
    const { svc } = fakeCredsSvc();
    const ctrl = new AgentAdminRoutesController(fakeDb(), makeOrg(true), svc, agentWith(['gri-core']));
    const out = await ctrl.upsert(req('op-1'), { route_key: 'default', model: 'm2' });
    expect(out.success).toBe(true);
    expect(mockRouter.setCalls[0].engine).toBeUndefined();
  });

  it('engine：未注入 AgentService（测试档）→ 跳过校验（不拦）', async () => {
    const { svc } = fakeCredsSvc();
    const ctrl = new AgentAdminRoutesController(fakeDb(), makeOrg(true), svc); // 第 4 参缺省
    const out = await ctrl.upsert(req('op-1'), { route_key: 'default', engine: 'whatever' });
    expect(out.success).toBe(true);
    expect(mockRouter.setCalls[0].engine).toBe('whatever');
  });

  it('非运营 → 守卫先行抛 Forbidden，任何写入（路由行+凭据）都不发生（C7 多租户隔离）', async () => {
    const db = fakeDb();
    const { svc, sets } = fakeCredsSvc();
    const ctrl = new AgentAdminRoutesController(db, makeOrg(false), svc);

    await expect(ctrl.upsert(req('guest'), { route_key: 'entity=other-user', api_key: PLAINTEXT }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(sets).toHaveLength(0);
    expect(mockRouter.setCalls).toHaveLength(0);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('GET → 每行附 has_key + hint（掩码），响应体零明文', async () => {
    mockRouter.listRows = [
      { route_key: 'entity=u-1', model: 'm1', enabled: true },
      { route_key: 'default', model: 'm0', enabled: true },
    ];
    const { svc } = fakeCredsSvc();
    await svc.store!.set('entity=u-1', PLAINTEXT, {});
    const ctrl = new AgentAdminRoutesController(fakeDb(), makeOrg(true), svc);

    const out = await ctrl.list(req('op-1'));

    expect(out.success).toBe(true);
    expect(out.routes[0]).toMatchObject({ route_key: 'entity=u-1', has_key: true, hint: '1234', model: 'm1' });
    expect(out.routes[1]).toMatchObject({ route_key: 'default', has_key: false, hint: null, model: 'm0' });
    expect(JSON.stringify(out).includes(PLAINTEXT)).toBe(false);
    expect(out.credentialsEnabled).toBe(true);
  });

  it('GET 非运营 → 守卫抛 Forbidden（不触库）', async () => {
    const db = fakeDb();
    const { svc } = fakeCredsSvc();
    const ctrl = new AgentAdminRoutesController(db, makeOrg(false), svc);
    await expect(ctrl.list(req('guest'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('构造时把凭据读取器注入 ModelRouter（未配置 → null，行为同今日）', async () => {
    const { svc } = fakeCredsSvc();
    const withCreds = new AgentAdminRoutesController(fakeDb(), makeOrg(true), svc);
    await withCreds.list(req('op-1'));
    expect(mockRouter.ctorCreds[0]).toBe(svc.store);

    mockRouter.ctorCreds = [];
    const withoutCreds = new AgentAdminRoutesController(fakeDb(), makeOrg(true));
    await withoutCreds.list(req('op-1'));
    expect(mockRouter.ctorCreds[0]).toBeNull();
  });
});
