import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { loadConfig } from '../../config/config';
import type { RedisLike } from './activation-context.service';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Injectable()
export class RedisClient implements RedisLike, OnModuleDestroy {
  private readonly logger = new Logger(RedisClient.name);
  private readonly client: Redis;

  constructor() {
    const config = loadConfig().redis;
    this.client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password || undefined,
      db: config.db,
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.client.on('error', (error) => {
      this.logger.warn(`Redis unavailable: ${error.message}`);
    });
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  set(key: string, value: string, ttlSeconds?: number): Promise<unknown> {
    if (ttlSeconds !== undefined) {
      return this.client.set(key, value, 'EX', ttlSeconds);
    }
    return this.client.set(key, value);
  }

  del(key: string): Promise<unknown> {
    return this.client.del(key);
  }

  publish(channel: string, message: string): Promise<unknown> {
    return this.client.publish(channel, message);
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}

@Global()
@Module({
  providers: [{ provide: REDIS_CLIENT, useClass: RedisClient }],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
