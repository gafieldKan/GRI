import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { OrganizationService } from '../organization/organization.service';
import { ModuleBindingInput } from './module-registry.types';
import { ModuleRegistryService } from './module-registry.service';

interface ReqAuth {
  externalId?: string | null;
}

@Controller('modules')
export class ModuleRegistryController {
  constructor(
    private readonly moduleRegistryService: ModuleRegistryService,
    private readonly organizationService: OrganizationService,
  ) {}

  @Get()
  async list(
    @Req() req: Request,
    @Query('region') region?: string,
    @Query('industry') industry?: string,
  ) {
    return this.moduleRegistryService.listAvailableModules(this.externalId(req), {
      region,
      industry,
    });
  }

  @Get('dimensions')
  async dimensions() {
    return this.moduleRegistryService.listDimensionOptions();
  }

  @Get(':code/bindings')
  async getBindings(@Req() req: Request, @Param('code') code: string) {
    const externalId = this.externalId(req);
    await this.organizationService.assertSiteOperator(externalId);
    return this.moduleRegistryService.getModuleBindings(code);
  }

  @Put(':code/bindings')
  async putBindings(
    @Req() req: Request,
    @Param('code') code: string,
    @Body() body: ModuleBindingInput,
  ) {
    const externalId = this.externalId(req);
    await this.organizationService.assertSiteOperator(externalId);
    return this.moduleRegistryService.replaceModuleBindings(code, body);
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
