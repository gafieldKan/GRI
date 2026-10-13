import { Body, Controller, ForbiddenException, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { OrganizationService } from '../organization/organization.service';
import { TaxonomyService } from './taxonomy.service';

interface ReqAuth {
  externalId?: string | null;
}

@Controller('taxonomy')
export class TaxonomyController {
  constructor(
    private readonly taxonomyService: TaxonomyService,
    private readonly org: OrganizationService,
  ) {}

  private externalId(req: Request): string {
    const id = (req.auth as ReqAuth | undefined)?.externalId;
    if (!id) throw new ForbiddenException('缺少外部身份标识');
    return id;
  }

  @Get(':name/children')
  children(@Param('name') name: string, @Query('parent') parent?: string) {
    return this.taxonomyService.children(name, parent);
  }

  @Get(':name/node/:id')
  node(@Param('name') name: string, @Param('id') id: string) {
    return this.taxonomyService.getNode(name, id);
  }

  @Get(':name/search')
  search(
    @Param('name') name: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.taxonomyService.search(name, q, limit);
  }

  @Get(':name/path/:id')
  path(@Param('name') name: string, @Param('id') id: string) {
    return this.taxonomyService.path(name, id);
  }

  /** 全树（参考 Explorer 同形；供内嵌实例从 API 取数据）。 */
  @Get(':name/tree')
  tree(@Param('name') name: string) {
    return this.taxonomyService.fullTree(name);
  }

  /** 维度变更审计流水（治理查看；operator 门禁）。 */
  @Get(':name/changes')
  async changes(@Req() req: Request, @Param('name') name: string, @Query('limit') limit?: string) {
    await this.org.assertSiteOperator(this.externalId(req));
    return this.taxonomyService.changes(name, limit ? Number(limit) : 50);
  }

  /** 维度节点维护（改名称；operator 门禁 + 审计）。 */
  @Patch(':name/node/:id')
  async update(
    @Req() req: Request,
    @Param('name') name: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const actorId = this.externalId(req);
    await this.org.assertSiteOperator(actorId);
    return this.taxonomyService.updateNode(name, id, body || {}, actorId);
  }
}
