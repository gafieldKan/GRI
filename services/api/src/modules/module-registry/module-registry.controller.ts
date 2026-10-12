import { Controller, ForbiddenException, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { ModuleRegistryService } from './module-registry.service';

interface ReqAuth {
  externalId?: string | null;
}

@Controller('modules')
export class ModuleRegistryController {
  constructor(private readonly moduleRegistryService: ModuleRegistryService) {}

  @Get()
  async list(@Req() req: Request) {
    const externalId = (req.auth as ReqAuth | undefined)?.externalId;
    if (!externalId) throw new ForbiddenException('缺少外部身份标识');
    return this.moduleRegistryService.listAvailableModules(externalId);
  }
}
