import { Controller, Get, Param } from '@nestjs/common';
import { OntologyService } from './ontology.service';

/**
 * M4 ontology 门面（公开读）。
 *
 * 语义真源是 `@gri/ontology` 的 DSL 文件（registry 装载），此处只做确定性内省，
 * 全部 GET 走白名单游客可见（见 public-routes.ts）；不承载写。
 * 路径：
 *   GET /ontology/objects                 — 对象目录
 *   GET /ontology/objects/:name           — 对象详情（含继承字段集/链/抽象缺口）
 *   GET /ontology/objects/:name/chain     — 继承链（基类 → 目标）
 *   GET /ontology/objects/:name/dispatch/:action — 多态派发（最具体实现）
 */
@Controller('ontology')
export class OntologyController {
  constructor(private readonly ontologyService: OntologyService) {}

  @Get('objects')
  listObjects() {
    return this.ontologyService.listObjects();
  }

  @Get('objects/:name')
  getObject(@Param('name') name: string) {
    return this.ontologyService.getObject(name);
  }

  @Get('objects/:name/chain')
  chain(@Param('name') name: string) {
    return this.ontologyService.chain(name);
  }

  @Get('objects/:name/dispatch/:action')
  dispatch(@Param('name') name: string, @Param('action') action: string) {
    return this.ontologyService.dispatch(name, action);
  }
}