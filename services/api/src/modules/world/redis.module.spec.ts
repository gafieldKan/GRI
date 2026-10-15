const redisConstructor = jest.fn();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: redisConstructor.mockImplementation(() => ({
    on: jest.fn(),
    disconnect: jest.fn(),
  })),
}));

import { RedisClient } from './redis.module';

describe('RedisClient', () => {
  beforeEach(() => {
    redisConstructor.mockClear();
  });

  it('开启即连接，避免首个缓存命令落入不可写流', () => {
    new RedisClient();

    expect(redisConstructor).toHaveBeenCalledTimes(1);
    expect(redisConstructor.mock.calls[0][0]).toMatchObject({
      lazyConnect: false,
      enableOfflineQueue: false,
    });
  });
});
