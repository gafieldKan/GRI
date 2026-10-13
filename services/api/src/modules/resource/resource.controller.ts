import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { OrganizationService } from '../organization/organization.service';
import { ResourceDimensionInput } from './resource.types';
import { ResourceService } from './resource.service';

interface ReqAuth {
  externalId?: string | null;
}

@Controller('resources')
export class ResourceController {
  constructor(
    private readonly resourceService: ResourceService,
    private readonly organizationService: OrganizationService,
  ) {}

  @Get()
  list(
    @Query('region') region?: string,
    @Query('industry') industry?: string,
    @Query('type') type?: string,
  ) {
    return this.resourceService.list({ region, industry, type });
  }

  @Put(':type/:id/dimension')
  async putDimension(
    @Req() req: Request,
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() body: ResourceDimensionInput,
  ) {
    const actorId = this.externalId(req);
    await this.organizationService.assertSiteOperator(actorId);
    return this.resourceService.setDimension(type, id, body, actorId);
  }

  private externalId(req: Request): string {
    const externalId = (req.auth as ReqAuth | undefined)?.externalId;
    if (!externalId) throw new ForbiddenException('缺少外部身份标识');
    return externalId;
  }
}
