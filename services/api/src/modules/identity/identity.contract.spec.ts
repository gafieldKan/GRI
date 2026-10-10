import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { OrganizationService } from '../organization/organization.service';
import { DatabaseService } from '../../database/database.service';
import { User } from './identity.types';

/**
 * P2-T3 契约测试：`external_id ≡ public.users.id ≡ edu.students.user_id`（身份唯一真源）。
 *
 * 全链路（施工图 §3.2）：
 *   auth.identities.id ──(sub)──► JWT.sub
 *   auth.identities.external_id ──► JWT.external_id ──► req.auth.externalId
 *                                                 ├──► public.users.id
 *                                                 └──► edu.students.user_id
 *   浮锚点：`external_id !== sub`（否则退回「external_id 退化为 identity.id」的旧 bug）。
 *
 * 本 spec 分层验证链路四段：
 *   A 签发侧（auth-center buildPayload）：sub=identity.id、external_id=identity.externalId、roles=[]；
 *   B 校验侧（@gri/jwt-verifier 映射）：externalId 取自 payload.external_id，sub 仅退化兜底；
 *   C 业务侧（IdentityService 真实代码）：同一 externalId 同键 thread 到 users.id 与 students.user_id；
 *   D 控制器链（IdentityController 真实代码）：req.auth.externalId 是唯一业务键，/me 返回 user.id===externalId；
 *   E 反例锚：external_id===sub 必须被判为违约（锁定旧 bug 不得回潮）。
 *
 * 关于 A/B 为何用源码锚（source anchor）而非直接 import：
 *   `@gri/jwt-verifier` 与 auth-center 为 ESM 包，services/api 的 Jest 运行于 CJS（ts-jest），
 *   直接 import 会 “Cannot use import statement outside a module”（既有中间件 spec 因此 mock 掉它）。
 *   跨包契约无法进程内 import，故对**契约表达式本身**做漂移锚定：一旦映射/签发表达式被改写，
 *   本测试立即失败（这正是契约测试的职责）。行为断言由 C/D/E 以真实代码承担。
 */

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** 从 __dirname 逐级上溯，定位仓库根（含两个跨包契约文件）。 */
function findRepoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i += 1) {
    const hasVerifier = existsSync(resolve(dir, 'packages/jwt-verifier/src/index.js'));
    const hasAuthCenter = existsSync(
      resolve(dir, 'services/auth-center/src/auth/auth.service.ts'),
    );
    if (hasVerifier && hasAuthCenter) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`契约测试无法定位仓库根（起点 ${__dirname}）`);
}

const REPO_ROOT = findRepoRoot();

function readSource(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), 'utf8');
}

/** 折叠空白，令跨格式（换行/缩进）的表达式锚匹配稳健。 */
function squash(source: string): string {
  return source.replace(/\s+/g, ' ');
}

function mockDb(queryImpl: jest.Mock): DatabaseService {
  return { query: queryImpl, getPool: jest.fn() } as unknown as DatabaseService;
}

// ---------------------------------------------------------------------------
// A. 签发侧契约（auth-center buildPayload）
// ---------------------------------------------------------------------------

describe('契约 A：签发侧 —— auth-center 用 identity.id 作 sub、identity.externalId 作业务主键', () => {
  const src = squash(readSource('services/auth-center/src/auth/auth.service.ts'));

  it('A1 buildPayload 的 sub = identity.id（JWT 主体）', () => {
    expect(src).toMatch(/sub: identity\.id\b/);
  });

  it('A2 buildPayload 的 external_id = identity.externalId（业务主键，唯一映射点）', () => {
    expect(src).toMatch(/external_id: identity\.externalId\b/);
  });

  it('A3 roles 硬编码为空数组（架构恒空，授权不依赖 JWT roles）', () => {
    expect(src).toMatch(/roles: \[\]/);
  });

  it('A4 反例锚：签发侧不得把 external_id 写成 identity.id（旧退化 bug）', () => {
    expect(src).not.toMatch(/external_id: identity\.id\b/);
  });
});

// ---------------------------------------------------------------------------
// B. 校验侧映射契约（@gri/jwt-verifier）
// ---------------------------------------------------------------------------

describe('契约 B：校验侧 —— req.auth.externalId 取自 payload.external_id，sub 仅退化兜底', () => {
  const src = squash(readSource('packages/jwt-verifier/src/index.js'));

  it('B1 externalId 映射表达式 = payload.external_id ?? payload.sub ?? null', () => {
    expect(src).toMatch(/externalId: payload\.external_id \?\? payload\.sub \?\? null/);
  });

  it('B2 反例锚：externalId 不得直接取 payload.sub（会让身份退化为 identity.id）', () => {
    expect(src).not.toMatch(/externalId: payload\.sub\b/);
  });

  it('B3 主链路每次命中（快路径与 JWKS 重试路径都不得退回 sub）', () => {
    const occurrences = src.match(/externalId: payload\.external_id/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// C. 业务侧契约（IdentityService 真实代码 —— 同一 externalId 同键贯穿三表）
// ---------------------------------------------------------------------------

describe('契约 C：业务侧 —— externalId 同键 thread 到 public.users.id 与 edu.students.user_id', () => {
  it('C1 getProfileByExternalId 以 externalId 作 public.users.id 查询键', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'EXT-1', username: 'u', role: 'consumer' }] });
    const svc = new IdentityService(mockDb(query));

    const profile = await svc.getProfileByExternalId('EXT-1');

    expect(profile.user.id).toBe('EXT-1');
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('public.users');
    expect(sql).toContain('id = $1');
    expect(params).toEqual(['EXT-1']);
  });

  it('C2 student 角色用同一 externalId 作 edu.students.user_id 查询键（三表同键贯通）', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'EXT-1', username: 'u', role: 'student' }] })
      .mockResolvedValueOnce({ rows: [{ user_id: 'EXT-1', grade: 7 }] });
    const svc = new IdentityService(mockDb(query));

    const profile = await svc.getProfileByExternalId('EXT-1');

    expect(profile.student?.user_id).toBe('EXT-1');
    const [sql, params] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('edu.students');
    expect(sql).toContain('user_id = $1');
    // 关键：两次查询共用同一个 externalId 键——users.id 与 students.user_id 是同一个值
    expect(params).toEqual(['EXT-1']);
    expect(query.mock.calls[0][1]).toEqual(query.mock.calls[1][1]);
  });

  it('C3 非 student 不触达 edu.students（避免错误地把 externalId 当 students 主键）', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'EXT-1', username: 'u', role: 'merchant' }] });
    const svc = new IdentityService(mockDb(query));

    const profile = await svc.getProfileByExternalId('EXT-1');

    expect(profile.student).toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// D. 控制器链（IdentityController 真实代码 —— req.auth.externalId 唯一业务键）
// ---------------------------------------------------------------------------

describe('契约 D：控制器链 —— /me 以 req.auth.externalId 为业务键，返回 user.id === externalId', () => {
  const service = {
    getProfileByExternalId: jest.fn(),
  } as unknown as jest.Mocked<IdentityService>;
  const org = { assertSiteOperator: jest.fn() } as unknown as jest.Mocked<OrganizationService>;
  const controller = new IdentityController(service, org);

  afterEach(() => jest.clearAllMocks());

  it('D1 getMe 用 req.auth.externalId（非 sub）读档，返回 user.id === externalId', async () => {
    service.getProfileByExternalId.mockImplementation(async (ext: string) => ({
      user: { id: ext, username: 'u', role: 'consumer' } as User,
    }));

    const res = await controller.getMe({
      auth: { sub: 'IDENTITY-1', externalId: 'USERS-1' },
    } as never);

    expect(service.getProfileByExternalId).toHaveBeenCalledWith('USERS-1');
    expect(res.user.id).toBe('USERS-1');
  });

  it('D2 反例锚：getMe 绝不以 sub 作业务键（sub===identity.id ≠ users.id）', async () => {
    service.getProfileByExternalId.mockResolvedValue({
      user: { id: 'USERS-1', username: 'u', role: 'consumer' } as User,
    });

    await controller.getMe({ auth: { sub: 'IDENTITY-1', externalId: 'USERS-1' } } as never);

    expect(service.getProfileByExternalId).not.toHaveBeenCalledWith('IDENTITY-1');
    expect(service.getProfileByExternalId).toHaveBeenCalledTimes(1);
  });

  it('D3 externalId 缺失（理论上不应发生）→ 拒绝，不以 sub 兜底当业务键', async () => {
    await expect(
      controller.getMe({ auth: { sub: 'IDENTITY-1', externalId: null } } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.getProfileByExternalId).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// E. 反例锚（纯模型）：external_id === sub 必须被判违约
// ---------------------------------------------------------------------------

describe('契约 E：反例锚 —— external_id 不得等于 sub', () => {
  /** 契约链最小模型；其规则由 A/B 源码锚锁定，故非自证。 */
  function mapAuth(payload: { sub: string; external_id?: string | null }): {
    sub: string;
    externalId: string | null;
  } {
    return { sub: payload.sub, externalId: payload.external_id ?? payload.sub ?? null };
  }

  function businessKeyOf(payload: { sub: string; external_id?: string | null }): string {
    const auth = mapAuth(payload);
    if (auth.externalId === null) throw new Error('CONTRACT_VIOLATION: externalId 为空');
    if (auth.externalId === auth.sub) {
      throw new Error('CONTRACT_VIOLATION: external_id 退化为 sub（旧 bug 回潮）');
    }
    return auth.externalId;
  }

  it('E1 正常令牌：externalId === external_id，且 !== sub', () => {
    const key = businessKeyOf({ sub: 'identity-1', external_id: 'users-1' });
    expect(key).toBe('users-1');
    expect(key).not.toBe('identity-1');
  });

  it('E2 退化令牌（缺 external_id）→ 判为违约并抛出（锚点捕获旧 bug）', () => {
    expect(() => businessKeyOf({ sub: 'identity-1' })).toThrow(/CONTRACT_VIOLATION/);
  });

  it('E3 退化令牌（external_id 恰等于 sub）→ 判为违约并抛出', () => {
    expect(() => businessKeyOf({ sub: 'same', external_id: 'same' })).toThrow(
      /CONTRACT_VIOLATION/,
    );
  });

  it('E4 模型规则与 B 源码锚一致（external_id 优先，sub 仅兜底）', () => {
    const src = squash(readSource('packages/jwt-verifier/src/index.js'));
    expect(src).toContain('payload.external_id ?? payload.sub');
  });
});

// ---------------------------------------------------------------------------
// 其它
// ---------------------------------------------------------------------------

describe('契约辅助：getProfileByExternalId 未命中即 404（已注销/不存在）', () => {
  it('查无此人 → NotFoundException（externalId 键无对应 users 行）', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const svc = new IdentityService(mockDb(query));
    await expect(svc.getProfileByExternalId('EXT-missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
