import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Req,
  Param,
  Query,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { OrganizationService } from './organization.service';
import { Organization, OrganizationInvitation, OrganizationRole } from './organization.types';
import { WorldService } from '../world/world.service';

/** req.auth 载荷的精简断言（与 @gri/jwt-verifier VerifierAuth 对齐）。 */
interface ReqAuth {
  externalId: string | null;
}

/**
 * M4 organization 切片。
 *
 * 鉴权由全局 AuthRouterMiddleware（main.ts）决定，白名单见 src/auth/public-routes.ts：
 *   - 公开读：GET /organizations（清单）、/tree、/search、/:id(显式 UUID)、/:id/children；
 *   - 其余：登录写/个人数据 —— 泛 UUID 之外的路径统一强制鉴权，身份取 req.auth.externalId。
 * 组织级写权限（owner/admin、owner-only）由 OrganizationService.assertRole 强制。
 */
@Controller('organizations')
export class OrganizationController {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly worldService: WorldService,
  ) {}

  private auth(req: Request): ReqAuth {
    return req.auth as ReqAuth;
  }

  private externalId(req: Request): string {
    const id = this.auth(req).externalId;
    if (!id) throw new ForbiddenException('缺少外部身份标识');
    return id;
  }

  // --- 公开读（目录浏览，白名单放行） ---

  @Get()
  list() {
    return this.organizationService.findAllActive();
  }

  @Get('tree')
  tree() {
    return this.organizationService.getTree();
  }

  @Get('search')
  search(@Query('q') q?: string, @Query('type') type?: string) {
    return this.organizationService.search(q, type);
  }

  // --- 登录读（个人/内部数据）—— 必须声明在 ':id' 之上，避免 ':id' 路由吞掉字面路径 ---

  @Get('my')
  my(@Req() req: Request) {
    return this.organizationService.getMemberships(this.externalId(req));
  }

  /** W1 人本世界组织视图；必须早于 ':id'，否则会被 UUID 参数路由吞掉。 */
  @Get('mine')
  mine(@Req() req: Request) {
    return this.worldService.getOrganizationsMine(this.externalId(req));
  }

  /**
   * 站点运营探询：是否根组织 owner|admin（纯 DB，JWT roles 全空故前端靠此开关）。
   * 零资源暴露，专供前端决定是否显示运营入口/面板。与 agent-admin capability 同源。
   */
  @Get('capability')
  async capability(@Req() req: Request) {
    try {
      const id = this.auth(req).externalId;
      if (!id) return { success: true, isOperator: false };
      await this.organizationService.assertSiteOperator(id);
      return { success: true, isOperator: true };
    } catch {
      return { success: true, isOperator: false };
    }
  }

  /**
   * 用户目录查询（站点运营专用）：按用户名/邮箱/名搜 public.users，供「添加成员」选人。
   * 门禁 assertSiteOperator —— 仅运营可枚举用户，控 PII 暴露。
   */
  @Get('users/lookup')
  async userLookup(@Req() req: Request, @Query('q') q?: string, @Query('limit') limit?: string) {
    await this.organizationService.assertSiteOperator(this.externalId(req));
    const users = await this.organizationService.lookupUsers(q, limit ? parseInt(limit, 10) : 10);
    return { success: true, users };
  }

  @Get(':id')
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.organizationService.getById(id);
  }

  @Get(':id/children')
  children(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.organizationService.getChildren(id);
  }

  // --- 组织写（支持创建根组织 / 子组织） ---

  @Post()
  create(@Req() req: Request, @Body() body: { name: string; type?: string; code?: string; short_name?: string; description?: string; parent_id?: string }) {
    // 附带 signed JWT 已含的 identity 摘要（username/name）：自供给 creator 的 public.users 行。
    const auth = (req as Request & { auth?: { username?: string | null; name?: string | null } }).auth;
    return this.organizationService.createOrganization(
      this.externalId(req),
      body,
      { username: auth?.username ?? null, name: auth?.name ?? null },
    );
  }

  @Put(':id')
  update(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: Partial<Organization>) {
    return this.organizationService.updateOrganization(this.externalId(req), id, body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.organizationService.deleteOrganization(this.externalId(req), id);
  }

  // --- 成员管理 ---

  @Get(':id/members')
  members(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.organizationService.listMembers(id);
  }

  @Post(':id/members')
  addMember(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { userId: string; role?: string; department?: string; title?: string; employee_no?: string },
  ) {
    return this.organizationService.addMember(this.externalId(req), id, body);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.organizationService.removeMember(this.externalId(req), id, userId);
  }

  @Put(':id/members/:userId/role')
  updateMemberRole(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: { role: string },
  ) {
    return this.organizationService.updateMemberRole(this.externalId(req), id, userId, body.role);
  }

  @Get(':id/members/:userId/has-role/:role')
  hasRole(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Param('role') role: string,
  ) {
    return this.organizationService.hasRole(id, userId, role);
  }

  // --- 角色管理 ---

  @Get(':id/roles')
  roles(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.organizationService.listRoles(id);
  }

  @Post(':id/roles')
  createRole(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { name: string; code: string; description?: string; permissions?: string[] },
  ) {
    return this.organizationService.createRole(this.externalId(req), id, body);
  }

  @Put(':id/roles/:roleId')
  updateRole(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @Body() body: Partial<OrganizationRole>,
  ) {
    return this.organizationService.updateRole(this.externalId(req), id, roleId, body);
  }

  // --- 邀请 ---

  /**
   * 邀请清单（owner/admin 门禁，见 service.listInvitations）。
   * 可选 ?status= 筛选；?limit=&offset= 分页（缺省保持「返回全部」旧行为）。
   */
  @Get(':id/invitations')
  invitations(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.organizationService.listInvitations(this.externalId(req), id, {
      status: status || undefined,
      limit: intQuery(limit),
      offset: intQuery(offset),
    });
  }

  @Post(':id/invitations')
  createInvitation(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { email: string; roleId?: string; message?: string },
  ) {
    return this.organizationService.createInvitation(this.externalId(req), id, body);
  }

  @Delete(':id/invitations/:invitationId')
  cancelInvitation(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
  ) {
    return this.organizationService.cancelInvitation(this.externalId(req), id, invitationId);
  }

  @Put('invitations/accept/:token')
  acceptInvitation(@Req() req: Request, @Param('token') token: string): Promise<OrganizationInvitation> {
    return this.organizationService.acceptInvitation(token, this.externalId(req));
  }

  /**
   * 审计日志（只读）：owner/admin 门禁（service 内 assertRole）。
   * 分页 ?limit=&offset=；筛选 ?action=&entityType=&actorId=&from=&to=（全部 bind 参数）。
   * 响应保留旧字段 rows（Portal 消费不变），增量给出 total/limit/offset。
   */
  @Get(':id/audit')
  async audit(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('actorId') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const page = await this.organizationService.getAudit(this.externalId(req), id, {
      limit: intQuery(limit),
      offset: intQuery(offset),
      action: action || undefined,
      entityType: entityType || undefined,
      actorId: actorId || undefined,
      from: from || undefined,
      to: to || undefined,
    });
    return { success: true, ...page };
  }
}

/** 查询串整数解析：缺省/非法 → undefined（service 侧再统一钳制）。 */
function intQuery(raw?: string): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? undefined : n;
}
