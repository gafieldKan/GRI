import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { loadConfig } from '../../config/config';
import {
  Organization,
  OrganizationMember,
  OrganizationRole,
  OrganizationInvitation,
  OrganizationNode,
  INVITATION_TTL_DAYS,
} from './organization.types';

/**
 * M4 organization 切片：把 identity 里临时的 operator/merchant 粗判据，
 * 升级为「组织级角色」权限模型。
 *
 * 权限语义：
 *   - 公开读：组织目录（GET /tree|/search|/:id|/:id/children）走白名单，游客可见；
 *   - 登录读：我的组织、成员清单、角色清单、邀请清单 —— 需登录（req.auth.externalId）；
 *   - 组织写：新增成员/改角色/建角色/邀请/删组织 —— 需该组织 owner|admin；
 *   - 删组织/转让所有者 —— 仅 owner。
 * 所有「人」列视为 externalId ≡ public.users.id，绝不引入 req.user 桥接。
 */
@Injectable()
export class OrganizationService {
  constructor(private readonly db: DatabaseService) {}

  private readonly identityCfg = loadConfig().identity;

  // -------------------------------------------------------------------------
  // 身份目录桥（auth-center 服务间面）。仅由 assertSiteOperator 门禁的端点调用，
  // 携带共享 SERVICE_TOKEN 代查身份（PII），把单点权威留在业务端。见 AdminModule。
  // -------------------------------------------------------------------------

  private async identityFetchRaw(path: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(`${this.identityCfg.authCenterUrl}${path}`, {
        headers: { 'x-service-token': this.identityCfg.serviceToken },
      });
      if (!res.ok) return null;
      return (await res.json().catch(() => null)) as Record<string, unknown> | null;
    } catch {
      return null; // 桥不可用不炸业务读
    }
  }

  private async identityCatalog(
    q?: string,
    limit = 10,
  ): Promise<Record<string, unknown>[]> {
    const qs = new URLSearchParams();
    if (q?.trim()) qs.set('q', q.trim());
    qs.set('limit', String(Math.min(Math.max(limit, 1), 50)));
    const body = await this.identityFetchRaw(`/auth/admin/identities/lookup?${qs.toString()}`);
    if (!body || body.success !== true) return [];
    return Array.isArray(body.identities) ? (body.identities as Record<string, unknown>[]) : [];
  }

  private async identityByBusinessId(
    businessId: string,
  ): Promise<Record<string, unknown> | null> {
    const body = await this.identityFetchRaw(
      `/auth/admin/identities/${encodeURIComponent(businessId)}`,
    );
    if (!body || body.success !== true || !body.identity) return null;
    return body.identity as Record<string, unknown>;
  }

  /** public.users 自供给（幂等）：凭证来自已校验 signed JWT 或 auth-center 身份目录。 */
  private async ensurePublicUser(
    exec: { query(sql: string, params?: unknown[]): Promise<unknown> },
    id: string,
    info?: { username?: string | null; name?: string | null },
  ): Promise<void> {
    await exec.query(
      `INSERT INTO public.users (id, username, name, role, status)
       VALUES ($1, $2, $3, 'consumer', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [id, info?.username ?? null, info?.name ?? null],
    );
  }

  // -------------------------------------------------------------------------
  // 公开读（目录浏览） — 白名单见 public-routes.ts
  // -------------------------------------------------------------------------

  async findAllActive(): Promise<Organization[]> {
    const res = await this.db.query(
      `SELECT * FROM tenant.organizations WHERE status = 'active' ORDER BY level, name`,
    );
    return res.rows as Organization[];
  }

  /** 组织树（嵌套结构）。树上挂每个节点的 active 子节点。 */
  async getTree(): Promise<OrganizationNode[]> {
    const orgs = await this.findAllActive();
    return this.buildTree(orgs, null);
  }

  async getById(id: string): Promise<Organization> {
    const res = await this.db.query(
      `SELECT * FROM tenant.organizations WHERE id = $1 AND status = 'active'`,
      [id],
    );
    if (res.rows.length === 0) throw new NotFoundException('Organization not found');
    return res.rows[0] as Organization;
  }

  async getChildren(id: string): Promise<Organization[]> {
    const res = await this.db.query(
      `SELECT * FROM tenant.organizations WHERE parent_id = $1 AND status = 'active' ORDER BY name`,
      [id],
    );
    return res.rows as Organization[];
  }

  async search(q?: string, type?: string): Promise<Organization[]> {
    const conds: string[] = [`status = 'active'`];
    const params: unknown[] = [];
    if (q) {
      params.push(`%${q}%`);
      conds.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length} OR short_name ILIKE $${params.length})`);
    }
    if (type) {
      params.push(type);
      conds.push(`type = $${params.length}`);
    }
    const res = await this.db.query(
      `SELECT * FROM tenant.organizations WHERE ${conds.join(' AND ')} ORDER BY level, name`,
      params,
    );
    return res.rows as Organization[];
  }

  // -------------------------------------------------------------------------
  // 登录读（个人数据/内部数据）
  // -------------------------------------------------------------------------

  /** 我所在的组织及我在其中的角色/职务。 */
  async getMemberships(userId: string): Promise<{ organization: Organization; role: string; title: string | null }[]> {
    const res = await this.db.query(
      `SELECT org.*, m.role, m.title
         FROM tenant.organization_members m
         JOIN tenant.organizations org ON org.id = m.organization_id
        WHERE m.user_id = $1 AND m.status = 'active' AND org.status = 'active'
        ORDER BY org.created_at`,
      [userId],
    );
    return res.rows.map((r) => ({
      organization: this.stripMemberFields(r),
      role: r.role,
      title: r.title,
    }));
  }

  // -------------------------------------------------------------------------
  // 组织写（需登录 + 组织角色）
  // -------------------------------------------------------------------------

  /** 创建组织：发起人自动成为 owner 成员；写审计。 */
  async createOrganization(
    actorId: string,
    data: { name: string; type?: string; code?: string; short_name?: string; description?: string; parent_id?: string | null },
    actor?: { username?: string | null; name?: string | null },
  ): Promise<Organization> {
    if (!data.name || !data.name.trim()) throw new BadRequestException('组织名必填');

    let parent: Organization | null = null;
    if (data.parent_id) {
      parent = await this.fetchOrg(data.parent_id);
      // 在父组织下建子组织：须是该父组织的 admin 级成员
      await this.assertRole(actorId, data.parent_id, { ownerOnly: false });
    }

    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');

      // 自供给 actor 的业务域人档：auth-center 注册只落 auth.identities，业务库 public.users
      // 平时无人写（仅 seed/ETL）。组织成员 FK → public.users.id，故 creator 须先有行。
      // 凭证来自 api 已用 JWKS 验证过的 signed JWT（username/name 可信）。
      await this.ensurePublicUser(client, actorId, actor);

      const parentPath = parent ? `${parent.parent_path ?? '/'}${parent.id}/` : '/';
      const level = parent ? (parent.level ?? 1) + 1 : 1;
      const orgType = data.type ?? 'other';

      const orgRes = await client.query(
        `INSERT INTO tenant.organizations (name, code, short_name, description, parent_id, parent_path, level, type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [data.name.trim(), data.code ?? null, data.short_name ?? null, data.description ?? null, data.parent_id ?? null, parentPath, level, orgType],
      );
      const org = orgRes.rows[0] as Organization;

      await client.query(
        `INSERT INTO tenant.organization_members (organization_id, user_id, role, status)
         VALUES ($1, $2, 'owner', 'active')`,
        [org.id, actorId],
      );

      await this.insertAudit(client, org.id, 'organization.create', 'organization', org.id, actorId, { name: org.name, parent_id: org.parent_id });

      await client.query('COMMIT');
      return org;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 更新组织：owner/admin。 */
  async updateOrganization(
    actorId: string,
    id: string,
    data: Partial<Organization>,
  ): Promise<Organization> {
    await this.fetchOrg(id);
    await this.assertRole(actorId, id, { ownerOnly: false });

    const whitelist = ['name', 'code', 'short_name', 'description', 'logo_url', 'settings', 'metadata'];
    const allowed: Record<string, string> = {};
    for (const k of whitelist) {
      if (data[k as keyof Organization] !== undefined) allowed[k] = data[k as keyof Organization] as string;
    }
    if (Object.keys(allowed).length === 0) return this.fetchOrg(id);

    const cols = Object.keys(allowed);
    const setClause = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
    const values = [id, ...cols.map((c) => allowed[c])];

    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `UPDATE tenant.organizations SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        values,
      );
      await this.insertAudit(client, id, 'organization.update', 'organization', id, actorId, allowed);
      await client.query('COMMIT');
      return res.rows[0] as Organization;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 删除组织（级联清成员/角色/邀请/审计）。仅 owner。 */
  async deleteOrganization(actorId: string, id: string): Promise<void> {
    await this.fetchOrg(id);
    await this.assertRole(actorId, id, { ownerOnly: true });

    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM tenant.organizations WHERE id = $1', [id]);
      // 审计记录随组织级联删除；父组织下的此变更也会被清理
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // 成员管理
  // -------------------------------------------------------------------------

  async listMembers(organizationId: string): Promise<OrganizationMember[]> {
    await this.fetchOrg(organizationId);
    const res = await this.db.query(
      `SELECT * FROM tenant.organization_members
        WHERE organization_id = $1 AND status = 'active'
        ORDER BY role, created_at`,
      [organizationId],
    );
    return res.rows as OrganizationMember[];
  }

  /** 新增成员：owner/admin。targetUserId ≡ externalId。 */
  async addMember(
    actorId: string,
    organizationId: string,
    data: { userId: string; role?: string; department?: string; title?: string; employee_no?: string },
  ): Promise<OrganizationMember> {
    if (!data.userId) throw new BadRequestException('userId 必填');
    if (!['owner', 'admin', 'member'].includes(data.role ?? 'member')) {
      throw new BadRequestException('role 仅支持 owner|admin|member');
    }
    await this.fetchOrg(organizationId);
    await this.assertRole(actorId, organizationId, { ownerOnly: false });

    // 人列 FK → public.users(id)：先验证目标用户存在，避免 23503 未处理成 500。
    // 身份发现：本地无行时，按业务主键查 auth-center 身份目录并在事务内自供给，
    // 使「已注册但未供给」的用户也能被添加为成员（本端点 owner/admin 见上方 assertRole）。
    const userRes = await this.db.query('SELECT id FROM public.users WHERE id = $1', [data.userId]);
    let targetIdentity: Record<string, unknown> | null = null;
    if (userRes.rows.length === 0) {
      targetIdentity = await this.identityByBusinessId(data.userId);
      if (!targetIdentity) throw new NotFoundException(`目标用户不存在`);
    }

    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      if (targetIdentity) {
        await this.ensurePublicUser(client, data.userId, {
          username: (targetIdentity.username as string) ?? null,
          name: (targetIdentity.name as string) ?? null,
        });
      }
      const res = await client.query(
        `INSERT INTO tenant.organization_members (organization_id, user_id, role, department, title, employee_no)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (organization_id, user_id)
           DO UPDATE SET role = EXCLUDED.role, department = EXCLUDED.department, title = EXCLUDED.title, employee_no = EXCLUDED.employee_no, status = 'active', updated_at = NOW()
         RETURNING *`,
        [organizationId, data.userId, data.role ?? 'member', data.department ?? null, data.title ?? null, data.employee_no ?? null],
      );
      await this.insertAudit(client, organizationId, 'member.add', 'member', res.rows[0].id, actorId, { user_id: data.userId, role: data.role });
      await client.query('COMMIT');
      return res.rows[0] as OrganizationMember;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 移除成员：owner/admin。 */
  async removeMember(actorId: string, organizationId: string, targetUserId: string): Promise<void> {
    await this.fetchOrg(organizationId);
    await this.assertRole(actorId, organizationId, { ownerOnly: false });

    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE tenant.organization_members SET status = 'inactive', updated_at = NOW()
          WHERE organization_id = $1 AND user_id = $2`,
        [organizationId, targetUserId],
      );
      await this.insertAudit(client, organizationId, 'member.remove', 'member', null, actorId, { user_id: targetUserId });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 改成员角色：owner/admin。 */
  async updateMemberRole(
    actorId: string,
    organizationId: string,
    targetUserId: string,
    role: string,
  ): Promise<OrganizationMember> {
    if (!['owner', 'admin', 'member'].includes(role)) throw new BadRequestException('role 仅支持 owner|admin|member');
    await this.fetchOrg(organizationId);
    await this.assertRole(actorId, organizationId, { ownerOnly: false });

    // 转让 owner 仅 owner 本人（ownerOnly 校验走 assertRole 的 ownerOnly 分支）
    if (role === 'owner') await this.assertRole(actorId, organizationId, { ownerOnly: true });

    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `UPDATE tenant.organization_members SET role = $3, updated_at = NOW()
          WHERE organization_id = $1 AND user_id = $2 AND status = 'active'
          RETURNING *`,
        [organizationId, targetUserId, role],
      );
      if (res.rows.length === 0) throw new NotFoundException('目标成员不存在');
      await this.insertAudit(client, organizationId, 'member.role.update', 'member', res.rows[0].id, actorId, { user_id: targetUserId, role });
      await client.query('COMMIT');
      return res.rows[0] as OrganizationMember;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 查询某一用户在该组织是否拥有指定角色（登录）。 */
  async hasRole(organizationId: string, userId: string, role: string): Promise<boolean> {
    const res = await this.db.query(
      `SELECT 1 FROM tenant.organization_members
        WHERE organization_id = $1 AND user_id = $2 AND role = $3 AND status = 'active'`,
      [organizationId, userId, role],
    );
    return res.rows.length > 0;
  }

  // -------------------------------------------------------------------------
  // 角色管理（自定义角色：权限 JSONB）
  // -------------------------------------------------------------------------

  async listRoles(organizationId: string): Promise<OrganizationRole[]> {
    await this.fetchOrg(organizationId);
    const res = await this.db.query(
      `SELECT * FROM tenant.organization_roles WHERE organization_id = $1 ORDER BY sort_order, name`,
      [organizationId],
    );
    return res.rows as OrganizationRole[];
  }

  async createRole(
    actorId: string,
    organizationId: string,
    data: { name: string; code: string; description?: string; permissions?: string[] },
  ): Promise<OrganizationRole> {
    if (!data.name || !data.code) throw new BadRequestException('name/code 必填');
    await this.fetchOrg(organizationId);
    await this.assertRole(actorId, organizationId, { ownerOnly: false });

    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `INSERT INTO tenant.organization_roles (organization_id, name, code, description, permissions)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [organizationId, data.name, data.code, data.description ?? null, JSON.stringify(data.permissions ?? [])],
      );
      await this.insertAudit(client, organizationId, 'role.create', 'role', res.rows[0].id, actorId, { code: data.code });
      await client.query('COMMIT');
      return res.rows[0] as OrganizationRole;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async updateRole(
    actorId: string,
    organizationId: string,
    roleId: string,
    data: Partial<OrganizationRole>,
  ): Promise<OrganizationRole> {
    await this.fetchOrg(organizationId);
    await this.assertRole(actorId, organizationId, { ownerOnly: false });

    const whitelist = ['name', 'code', 'description', 'permissions', 'sort_order'];
    const allowed: Record<string, unknown> = {};
    for (const k of whitelist) {
      if (data[k as keyof OrganizationRole] !== undefined) {
        allowed[k] = k === 'permissions' ? JSON.stringify(data.permissions) : data[k as keyof OrganizationRole];
      }
    }
    if (Object.keys(allowed).length === 0) throw new BadRequestException('无更新字段');

    const cols = Object.keys(allowed);
    const setClause = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');

    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `UPDATE tenant.organization_roles SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [roleId, ...cols.map((c) => allowed[c])],
      );
      if (res.rows.length === 0) throw new NotFoundException('Role not found');
      await this.insertAudit(client, organizationId, 'role.update', 'role', roleId, actorId, allowed);
      await client.query('COMMIT');
      return res.rows[0] as OrganizationRole;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // 邀请
  // -------------------------------------------------------------------------

  async listInvitations(organizationId: string): Promise<OrganizationInvitation[]> {
    await this.fetchOrg(organizationId);
    const res = await this.db.query(
      `SELECT * FROM tenant.organization_invitations WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId],
    );
    return res.rows as OrganizationInvitation[];
  }

  async createInvitation(
    actorId: string,
    organizationId: string,
    data: { email: string; roleId?: string | null; message?: string },
  ): Promise<OrganizationInvitation> {
    if (!data.email || !/^\S+@\S+\.\S+$/.test(data.email)) throw new BadRequestException('合法邮箱必填');
    await this.fetchOrg(organizationId);
    await this.assertRole(actorId, organizationId, { ownerOnly: false });

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000).toISOString();

    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `INSERT INTO tenant.organization_invitations (organization_id, email, role_id, inviter_id, token, expires_at, message)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [organizationId, data.email, data.roleId ?? null, actorId, token, expiresAt, data.message ?? null],
      );
      await this.insertAudit(client, organizationId, 'invitation.create', 'invitation', res.rows[0].id, actorId, { email: data.email });
      await client.query('COMMIT');
      return res.rows[0] as OrganizationInvitation;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 凭 token 接受邀请（token 即授信凭据，登录用户 self-claim 到该组织）。 */
  async acceptInvitation(token: string, userId: string): Promise<OrganizationInvitation> {
    const invRes = await this.db.query(
      `SELECT * FROM tenant.organization_invitations WHERE token = $1`,
      [token],
    );
    if (invRes.rows.length === 0) throw new NotFoundException('邀请不存在');
    const inv = invRes.rows[0] as OrganizationInvitation;
    if (inv.status !== 'pending') throw new BadRequestException('邀请已处理');
    if (new Date(inv.expires_at) < new Date()) throw new BadRequestException('邀请已过期');

    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      // 幂等：已在该组织则并入目标角色
      await client.query(
        `INSERT INTO tenant.organization_members (organization_id, user_id, role, status)
         VALUES ($1, $2, 'member', 'active')
         ON CONFLICT (organization_id, user_id)
           DO UPDATE SET status = 'active', updated_at = NOW()`,
        [inv.organization_id, userId],
      );
      await client.query(
        `UPDATE tenant.organization_invitations
            SET status = 'accepted', accepted_at = NOW(), accepted_by = $2
          WHERE id = $1 RETURNING *`,
        [inv.id, userId],
      );
      await client.query('COMMIT');
      return inv;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async cancelInvitation(actorId: string, organizationId: string, invitationId: string): Promise<void> {
    await this.fetchOrg(organizationId);
    await this.assertRole(actorId, organizationId, { ownerOnly: false });

    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE tenant.organization_invitations SET status = 'cancelled', updated_at = NOW()
          WHERE id = $1 AND organization_id = $2`,
        [invitationId, organizationId],
      );
      await this.insertAudit(client, organizationId, 'invitation.cancel', 'invitation', invitationId, actorId, {});
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // 站点运营：用户目录查询 + 审计日志读取
  // -------------------------------------------------------------------------

  /** 按用户名/邮箱/名模糊查用户（站点运营专用，控 PII 暴露）。 */
  async lookupUsers(q?: string, limit = 10): Promise<{ id: string; username: string | null; email: string | null; name: string | null }[]> {
    const params: unknown[] = [];
    let where = '';
    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      where = `WHERE (username ILIKE $1 OR email ILIKE $1 OR name ILIKE $1)`;
    }
    params.push(Math.min(Math.max(limit, 1), 50));
    const res = await this.db.query(
      `SELECT id, username, email, name FROM public.users ${where} ORDER BY username NULLS LAST LIMIT $${params.length}`,
      params,
    );
    const local = res.rows as { id: string; username: string | null; email: string | null; name: string | null }[];

    // 并入身份目录（auth-center）：operator 可搜到/添加「已注册但未供给」的用户。
    // 业务主键遵循 verifier 的 external_id ?? id；本地行优先（去重）。桥不可用时仅本地。
    const remote = (await this.identityCatalog(q, limit)).map((c) => ({
      id: (c.external_id as string) ?? (c.id as string),
      username: (c.username as string) ?? null,
      email: (c.email as string) ?? null,
      name: (c.name as string) ?? null,
    }));
    const seen = new Set(local.map((r) => r.id));
    const merged = [...local, ...remote.filter((r) => !seen.has(r.id))];
    // 全量 limit 截断（本地 + 远程统一口径）
    return merged.slice(0, Math.min(Math.max(limit, 1), 50));
  }

  /** 读某组织的审计日志（关联演员名）。owner/admin 门禁。 */
  async getAudit(
    actorId: string,
    orgId: string,
    limit = 50,
  ): Promise<{
    id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    actor_id: string;
    actor_name: string | null;
    changes: unknown;
    created_at: string;
  }[]> {
    await this.fetchOrg(orgId);
    await this.assertRole(actorId, orgId, { ownerOnly: false });
    const params = [orgId, Math.min(Math.max(limit, 1), 200)];
    const res = await this.db.query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.actor_id, u.name AS actor_name, a.changes, a.created_at
         FROM tenant.organization_audit_logs a
         LEFT JOIN public.users u ON u.id = a.actor_id
        WHERE a.organization_id = $1
        ORDER BY a.created_at DESC
        LIMIT $2`,
      params,
    );
    return res.rows as {
      id: string;
      action: string;
      entity_type: string;
      entity_id: string | null;
      actor_id: string;
      actor_name: string | null;
      changes: unknown;
      created_at: string;
    }[];
  }

  // -------------------------------------------------------------------------
  // 内部工具
  // -------------------------------------------------------------------------

  private async fetchOrg(id: string): Promise<Organization> {
    const res = await this.db.query('SELECT * FROM tenant.organizations WHERE id = $1', [id]);
    if (res.rows.length === 0) throw new NotFoundException('Organization not found');
    return res.rows[0] as Organization;
  }

  /**
   * 断言 actor 在该组织拥有可管理角色的权限。
   *   ownerOnly=true  → 仅 owner 通过；
   *   ownerOnly=false → owner|admin 通过；
   *   非成员/权限不足 → ForbiddenException。
   */
  /** 站点运营权限门槛：必须是根组织的 owner|admin（M4 语义里 testuser=根 owner）。 */
  async assertSiteOperator(actorId: string): Promise<void> {
    const root = await this.db.query(
      `SELECT id FROM tenant.organizations WHERE parent_id IS NULL ORDER BY created_at, id LIMIT 1`,
    );
    const rootId = root.rows[0]?.id as string | undefined;
    if (!rootId) throw new ForbiddenException('平台尚未初始化组织，无法执行运营操作');
    await this.assertRole(actorId, rootId, { ownerOnly: false }); // owner 或 admin
  }

  private async assertRole(
    actorId: string,
    organizationId: string,
    opts: { ownerOnly: boolean },
  ): Promise<void> {
    const role = await this.getActorRole(actorId, organizationId);
    if (!role) throw new ForbiddenException('你不是该组织成员');
    const ok = opts.ownerOnly ? role === 'owner' : role === 'owner' || role === 'admin';
    if (!ok) throw new ForbiddenException(opts.ownerOnly ? '仅组织所有者可执行此操作' : '仅组织管理员可执行此操作');
  }

  private async getActorRole(actorId: string, organizationId: string): Promise<string | null> {
    const res = await this.db.query(
      `SELECT role FROM tenant.organization_members
        WHERE organization_id = $1 AND user_id = $2 AND status = 'active'`,
      [organizationId, actorId],
    );
    return res.rows[0]?.role ?? null;
  }

  /** 在事务内写审计（写操作统一落 tenant.organization_audit_logs）。 */
  private async insertAudit(
    client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
    organizationId: string,
    action: string,
    entityType: string,
    entityId: string | null,
    actorId: string,
    changes: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO tenant.organization_audit_logs (organization_id, action, entity_type, entity_id, actor_id, changes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [organizationId, action, entityType, entityId, actorId, JSON.stringify(changes)],
    );
  }

  /** 自引用组织表 → 嵌套树。 */
  private buildTree(orgs: Organization[], parentId: string | null): OrganizationNode[] {
    const children = orgs.filter((o) => (o.parent_id ?? null) === parentId);
    return children.map((o) => ({
      ...o,
      children: this.buildTree(orgs, o.id),
    }));
  }

  /** 去掉 JOIN 带入的成员字段，返回纯组织行。 */
  private stripMemberFields(row: {
    id: string;
    [k: string]: unknown;
  }): Organization {
    const { ...rest } = row;
    delete rest.role;
    delete rest.title;
    return rest as unknown as Organization;
  }
}