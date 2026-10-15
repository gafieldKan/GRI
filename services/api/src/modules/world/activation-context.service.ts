import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { IdentityService } from '../identity/identity.service';
import { WorldService } from './world.service';
import { ActivationContext } from './world.types';
import { REDIS_CLIENT } from './redis.module';

const CACHE_TTL_SECONDS = 300;

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  publish(channel: string, message: string): Promise<unknown>;
}

@Injectable()
export class ActivationContextService {
  private readonly logger = new Logger(ActivationContextService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly identity: IdentityService,
    private readonly world: WorldService,
    @Inject(REDIS_CLIENT)
    private readonly redis: RedisLike,
  ) {}

  /** 从数据库真源组装当前人的激活上下文（不依赖缓存作为授权依据）。 */
  async build(userId: string): Promise<ActivationContext> {
    const [profileRow, orgs, world] = await Promise.all([
      this.identity.getProfileByExternalId(userId),
      this.world.getOrganizationsMine(userId),
      this.world.getWorld(),
    ]);

    const profile = {
      id: profileRow.user.id,
      username: profileRow.user.username,
      name: profileRow.user.name ?? profileRow.user.username ?? profileRow.user.id,
      email: profileRow.user.email ?? null,
      role: profileRow.user.role,
      avatarUrl: profileRow.user.avatar_url ?? null,
    };

    const permissions = { roles: [], can: [] };
    const twin = {
      entityId: userId,
      sceneCodes: world.scenes.map((scene) => scene.code),
      orgCount: orgs.length,
    };

    const version = createHash('sha256')
      .update(JSON.stringify({ profile, orgs, permissions, twin }))
      .digest('hex')
      .slice(0, 16);

    return { version, profile, orgs, permissions, twin };
  }

  /** 读激活上下文：Redis 仅为物化缓存；命中坏值或 Redis 故障均回源数据库。 */
  async get(userId: string): Promise<ActivationContext> {
    const key = this.cacheKey(userId);

    let cached: string | null = null;
    try {
      cached = await this.redis.get(key);
    } catch (e) {
      this.logger.warn(`activation context redis get failed for ${userId}: ${(e as Error).message}`);
    }

    if (cached) {
      try {
        return JSON.parse(cached) as ActivationContext;
      } catch {
        try {
          await this.redis.del(key);
        } catch (e) {
          this.logger.warn(`activation context redis del malformed failed for ${userId}: ${(e as Error).message}`);
        }
      }
    }

    const context = await this.build(userId);
    try {
      await this.redis.set(key, JSON.stringify(context), CACHE_TTL_SECONDS);
    } catch (e) {
      this.logger.warn(`activation context redis set failed for ${userId}: ${(e as Error).message}`);
    }
    return context;
  }

  /** 失效缓存并广播；Redis 故障不得影响数据库写事务或读请求。 */
  async invalidate(userId: string): Promise<void> {
    const key = this.cacheKey(userId);
    try {
      await this.redis.del(key);
    } catch (e) {
      this.logger.warn(`activation context redis del failed for ${userId}: ${(e as Error).message}`);
    }
    try {
      await this.redis.publish('ctx:invalidate', JSON.stringify({ userId }));
    } catch (e) {
      this.logger.warn(`activation context redis publish failed for ${userId}: ${(e as Error).message}`);
    }
  }

  private cacheKey(userId: string): string {
    return `ctx:user:${userId}`;
  }
}
