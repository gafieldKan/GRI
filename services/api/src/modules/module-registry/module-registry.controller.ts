import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
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
    return this.moduleRegistryService.listAvailableModules(this.externalId(req));
  }

  @Post(':code/enable')
  @HttpCode(HttpStatus.OK)
  async enable(@Req() req: Request, @Param('code') code: string) {
    return this.moduleRegistryService.enableModule(this.externalId(req), code);
  }

  @Post(':code/disable')
  @HttpCode(HttpStatus.OK)
  async disable(@Req() req: Request, @Param('code') code: string) {
    return this.moduleRegistryService.disableModule(this.externalId(req), code);
  }

  private externalId(req: Request): string {
    const externalId = (req.auth as ReqAuth | undefined)?.externalId;
    if (!externalId) throw new ForbiddenException('缺少外部身份标识');
    return externalId;
  }
}
