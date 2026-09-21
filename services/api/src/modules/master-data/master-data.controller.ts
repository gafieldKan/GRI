import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { MasterDataService } from './master-data.service';

/**
 * M4 master-data 门面（公开读）。
 * 鉴权由全局 AuthRouterMiddleware + 白名单（public-routes.ts）决定，全部 GET 游客可见。
 * 路径：
 *   GET /master-data/kinds            — 字典分类概览
 *   GET /master-data/kinds/:kind      — 某字典的启用条目
 *   GET /master-data/:id              — 单条目（显式 UUID）
 * 注意：'kinds' 字面路径须放 ':id' 之前。
 */
@Controller('master-data')
export class MasterDataController {
  constructor(private readonly masterDataService: MasterDataService) {}

  @Get('kinds')
  listKinds() {
    return this.masterDataService.listKinds();
  }

  @Get('kinds/:kind')
  byKind(@Param('kind') kind: string) {
    return this.masterDataService.listByKind(kind);
  }

  @Get(':id')
  byId(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.masterDataService.getById(id);
  }
}