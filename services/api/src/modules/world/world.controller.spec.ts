import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { ActivationContextService } from './activation-context.service';
import { WorldController } from './world.controller';
import { WorldService } from './world.service';

describe('WorldController', () => {
  let controller: WorldController;
  let world: jest.Mocked<WorldService>;
  let context: jest.Mocked<ActivationContextService>;

  const req = (auth: Record<string, unknown>): Request => ({ auth } as unknown as Request);

  beforeEach(async () => {
    world = {
      getWorld: jest.fn(),
      getOrganizationsMine: jest.fn(),
    } as any;
    context = {
      get: jest.fn(),
      build: jest.fn(),
      invalidate: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorldController],
      providers: [
        { provide: WorldService, useValue: world },
        { provide: ActivationContextService, useValue: context },
      ],
    }).compile();

    controller = module.get(WorldController);
  });

  it('GET /world 不需要身份，直接返回人本世界', async () => {
    const data = { scenes: [], generatedAt: 'now' };
    world.getWorld.mockResolvedValue(data as any);

    await expect(controller.world()).resolves.toEqual(data);
    expect(world.getWorld).toHaveBeenCalledTimes(1);
  });

  it('GET /context/me 只按 req.auth.externalId 取激活上下文', async () => {
    context.get.mockResolvedValue({ version: 'v1' } as any);

    await expect(controller.contextMe(req({ externalId: 'u1', roles: ['operator'] })))
      .resolves.toEqual({ version: 'v1' });
    expect(context.get).toHaveBeenCalledWith('u1');
  });

  it('GET /organizations/mine 只按 req.auth.externalId 查多归属', async () => {
    world.getOrganizationsMine.mockResolvedValue([]);

    await expect(controller.myOrganizations(req({ externalId: 'u1' }))).resolves.toEqual([]);
    expect(world.getOrganizationsMine).toHaveBeenCalledWith('u1');
  });

  it('缺少 externalId 时个人读端点 Forbidden', async () => {
    await expect(controller.contextMe(req({ sub: 'identity-1' })))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.myOrganizations(req({ sub: 'identity-1' })))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(context.get).not.toHaveBeenCalled();
    expect(world.getOrganizationsMine).not.toHaveBeenCalled();
  });
});
