import { Controller, Get, Put, Delete, Param, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../database/database.service';
import { OrganizationService } from '../organization/organization.service';

/**
 * MCP server 管理面 —— /api/agent/admin/mcp-servers。
 *
 * 与 llm_routes 同级铁律：**凭证永不入库/不经此面接收**。本面只存 connection 形态
 * （name/transport/url/command/args/env-var 名引用），真实 apiKey/secret 由后端 env/SecretRef 供给。
 * 特权：一律『站点运营』（根组织 owner|admin，见 assertSiteOperator）——防学生/普通用户挂外部 server。
 *
 * 启用一个 server → 下一轮 /api/agent 消息构造时 bridgeMcpTools 把其工具桥进每生 agent。
 */
@Controller('agent/admin/mcp-servers')
export class AgentAdminMcpServersController {
  constructor(
    private readonly db: DatabaseService,
    private readonly org: OrganizationService,
  ) {}

  private async _guard(req: Request): Promise<void> {
    await this.org.assertSiteOperator((req as any).auth?.externalId as string);
  }

  /** 拒绝携带内联明文凭证的字段（apiKey/secret/token/password 等），杜绝误入库。 */
  private _assertNoInlineSecret(config: any): void {
    const banned = /api_?key|secret|token|password|credential/i;
    if (config && typeof config === 'object') {
      for (const [k, v] of Object.entries(config)) {
        if (banned.test(k) && v !== undefined && v !== null && v !== '' && typeof v !== 'boolean') {
          throw new Error(`mcp-servers 不接受内联密钥字段「${k}」——凭证请走后端 env/SecretRef，config 只放 env 变量名引用`);
        }
        if (v && typeof v === 'object') this._assertNoInlineSecret(v);
      }
    }
  }

  /** 列全部 server（含 disabled）。仅运营。 */
  @Get()
  async list(@Req() req: Request): Promise<any> {
    await this._guard(req);
    const res = await this.db.query(
      `SELECT name, transport, url, config, enabled, created_at, updated_at
         FROM agent.mcp_servers
        ORDER BY created_at, name`,
    );
    return { success: true, servers: res.rows, note: '凭证不入表；config 只存 connection 形态（command/args/url/env 变量名）' };
  }

  /**
   * 增/改一个 MCP server 并（可）启用。body:
   *   { name, transport?, url?, config?: {command, args?, env?, cwd?}, enabled? }
   * 校验：stdio 必带 config.command；http 必带 url。写表即生效，下一轮 agent 桥接读取。仅运营。
   */
  @Put()
  async upsert(@Req() req: Request, @Body() body: any): Promise<any> {
    await this._guard(req);
    const name = body?.name;
    if (!name || typeof name !== 'string') {
      return { success: false, error: 'name 必填（VARCHAR 64）' };
    }
    if (String(name).length > 64) return { success: false, error: 'name 过长（≤64）' };
    const transport = body?.transport || 'stdio';
    const config = body?.config && typeof body.config === 'object' ? body.config : {};
    this._assertNoInlineSecret(config);
    const url = body?.url || null;

    if (transport === 'http' || transport === 'http-jsonrpc' || transport === 'streamable-http') {
      if (!url) return { success: false, error: 'http transport 需要 url' };
    } else if (transport === 'stdio') {
      if (!config.command || typeof config.command !== 'string') {
        return { success: false, error: 'stdio transport 需要 config.command（可执行文件）' };
      }
    } else {
      return { success: false, error: 'transport 仅支持 stdio 或 http（Streamable HTTP）' };
    }

    const enabled = body?.enabled === undefined ? false : !!body.enabled;
    await this.db.query(
      `INSERT INTO agent.mcp_servers (name, transport, url, config, enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO UPDATE SET
         transport = EXCLUDED.transport,
         url = EXCLUDED.url,
         config = EXCLUDED.config,
         enabled = EXCLUDED.enabled,
         updated_at = NOW()`,
      [name, transport, url, config ? JSON.stringify(config) : null, enabled],
    );
    return { success: true, name, applied: true, enabled, note: '下一轮 agent 构造即桥接其工具；凭证不落库' };
  }

  /** 硬删一行（下线即停用）。仅运营。 */
  @Delete(':name')
  async remove(@Req() req: Request, @Param('name') name: string): Promise<any> {
    await this._guard(req);
    await this.db.query(`DELETE FROM agent.mcp_servers WHERE name = $1`, [name]);
    return { success: true, name, removed: true };
  }
}