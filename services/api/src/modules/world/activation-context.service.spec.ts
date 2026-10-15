import { createHash } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { IdentityService } from '../identity/identity.service';
import { ActivationContextService } from './activation-context.service';
import { WorldService } from './world.service';

const WORLD = {
  scenes: [
    { code: 'home', name: '居所', status: 'active', intents: [], modules: [] },
    { code: 'dining', name: '餐饮', status: 'active', intents: [], modules: [] },
  ],
  generatedAt: '2026-10-15T00:00:00.000Z',
};

function ctxInput() {
  return {
    db: { query: jest.fn().mockResolvedValue({ rows: [] }) } as unknown as DatabaseService,
    identity: {
      getProfileByExternalId: jest.fn().mockResolvedValue({
        user: {
          id: 'u1',
          username: 'alice',
          name: 'Alice',
          email: 'alice@example.com',
          role: 'student',
          avatar_url: null,
        },
        student: { grade: 8 },
      }),
    } as unknown as IdentityService,
    world: {
      getOrganizationsMine: jest.fn().mockResolvedValue([
        { id: 'o1', name: '示例学校', type: 'school', role: 'owner', tags: [] },
      ]),
      getWorld: jest.fn().mockResolvedValue(WORLD),
    } as unknown as WorldService,
    redis: {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      publish: jest.fn(),
      subscribe: jest.fn(),
    },
  };
}

describe('ActivationContextService', () => {
  it('build 从 DB 组装 profile/orgs/permissions/twin 并生成稳定 version', async () => {
    const input = ctxInput();
    const service = new ActivationContextService(
      input.db,
      input.identity,
      input.world,
      input.redis as any,
    );

    const ctx = await service.build('u1');

    expect(ctx.profile).toMatchObject({ id: 'u1', name: 'Alice', role: 'student' });
    expect(ctx.orgs).toEqual([
      { id: 'o1', name: '示例学校', type: 'school', role: 'owner', tags: [] },
    ]);
    expect(ctx.permissions).toEqual({ roles: [], can: [] });
    expect(ctx.twin).toMatchObject({
      entityId: 'u1',
      sceneCodes: ['home', 'dining'],
      orgCount: 1,
    });
    expect(ctx.version).toMatch(/^[0-9a-f]{16}$/);
  });

  it('get 命中 Redis 时直接返回，不查 DB', async () => {
    const input = ctxInput();
    const cached = {
      version: '0123456789abcdef',
      profile: { id: 'u1', name: 'Alice' },
      orgs: [],
      permissions: { roles: [], can: [] },
      twin: { entityId: 'u1' },
    };
    input.redis.get.mockResolvedValue(JSON.stringify(cached));
    const service = new ActivationContextService(
      input.db,
      input.identity,
      input.world,
      input.redis as any,
    );

    await expect(service.get('u1')).resolves.toEqual(cached);
    expect(input.identity.getProfileByExternalId).not.toHaveBeenCalled();
    expect(input.redis.get).toHaveBeenCalledWith('ctx:user:u1');
  });

  it('Redis 命中坏 JSON 时回源 DB 并覆盖缓存', async () => {
    const input = ctxInput();
    input.redis.get.mockResolvedValue('{bad-json');
    const service = new ActivationContextService(
      input.db,
      input.identity,
      input.world,
      input.redis as any,
    );

    const ctx = await service.get('u1');

    expect(ctx.profile.id).toBe('u1');
    expect(input.redis.del).toHaveBeenCalledWith('ctx:user:u1');
    expect(input.redis.set).toHaveBeenCalledWith(
      'ctx:user:u1',
      expect.any(String),
      expect.any(Number),
    );
  });

  it('Redis 不可用时降级回源 DB，且失败写缓存不抛 500', async () => {
    const input = ctxInput();
    input.redis.get.mockRejectedValue(new Error('redis down'));
    input.redis.set.mockRejectedValue(new Error('redis down'));
    const service = new ActivationContextService(
      input.db,
      input.identity,
      input.world,
      input.redis as any,
    );

    const ctx = await service.get('u1');

    expect(ctx.profile.id).toBe('u1');
    expect(input.identity.getProfileByExternalId).toHaveBeenCalledWith('u1');
  });

  it('invalidate 删除 key 并发布 Pub/Sub 失效消息', async () => {
    const input = ctxInput();
    input.redis.del.mockResolvedValue(1);
    input.redis.publish.mockResolvedValue(1);
    const service = new ActivationContextService(
      input.db,
      input.identity,
      input.world,
      input.redis as any,
    );

    await service.invalidate('u1');

    expect(input.redis.del).toHaveBeenCalledWith('ctx:user:u1');
    expect(input.redis.publish).toHaveBeenCalledWith(
      'ctx:invalidate',
      JSON.stringify({ userId: 'u1' }),
    );
  });

  it('version 只由物化内容派生（同数据重建稳定）', async () => {
    const a = ctxInput();
    const b = ctxInput();
    const sa = new ActivationContextService(a.db, a.identity, a.world, a.redis as any);
    const sb = new ActivationContextService(b.db, b.identity, b.world, b.redis as any);

    const ca = await sa.build('u1');
    const cb = await sb.build('u1');

    expect(ca.version).toBe(cb.version);
    expect(ca.version).toBe(
      createHash('sha256')
        .update(JSON.stringify({
          profile: ca.profile,
          orgs: ca.orgs,
          permissions: ca.permissions,
          twin: ca.twin,
        }))
        .digest('hex')
        .slice(0, 16),
    );
  });
});
