import { Controller, ForbiddenException, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { ActivationContextService } from './activation-context.service';
import { WorldService } from './world.service';

interface ReqAuth {
  externalId?: string | null;
}

function externalId(req: Request): string {
  const id = (req.auth as ReqAuth | undefined)?.externalId;
  if (!id) throw new ForbiddenException('缺少外部身份标识');
  return id;
}

@Controller()
export class WorldController {
  constructor(
    private readonly worldService: WorldService,
    private readonly context: ActivationContextService,
  ) {}

  /** 人本世界只读视图：匿名可读。 */
  @Get('world')
  worldView() {
    return this.worldService.getWorld();
  }

  /** 登录人的激活上下文物化视图；真源始终在 DB。 */
  @Get('context/me')
  async contextMe(@Req() req: Request) {
    return this.context.get(externalId(req));
  }

  /** 当前人的多组织归属（ontology.org_member）。 */
  @Get('organizations/mine')
  async myOrganizations(@Req() req: Request) {
    return this.worldService.getOrganizationsMine(externalId(req));
  }

  /** 保留测试契约所需的 `world()` 方法名。 */
  world() {
    return this.worldView();
  }
}
