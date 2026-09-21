import { ForbiddenException } from '@nestjs/common';
import { AgentAdminMcpServersController } from './agent-admin-mcp.controller';
import { DatabaseService } from '../../database/database.service';
import { OrganizationService } from '../organization/organization.service';

const OPERATOR = 'o0000000-0000-0000-0000-000000000001';

function makeDb(): DatabaseService {
  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    if (/SELECT name, transport, url, config, enabled/.test(sql)) {
      return {
        rows: [
          { name: 'demo', transport: 'stdio', url: null, config: { command: 'node', args: ['/demo.mjs'] }, enabled: true },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
  return { query } as unknown as DatabaseService;
}

function makeOrg(op: boolean): OrganizationService {
  return {
    assertSiteOperator: jest.fn(async (uid: string) => {
      if (!op) throw new ForbiddenException('你不是该组织成员');
    }),
  } as unknown as OrganizationService;
}

function req(uid = OPERATOR): any {
  return { auth: { externalId: uid } as any };
}

describe('AgentAdminMcpServersController（仅站点运营，凭证不入表）', () => {
  it('PUT 注册 stdio server（带 command）→ UPSERT 落库 + 返回 applied', async () => {
    const db = makeDb();
    const ctrl = new AgentAdminMcpServersController(db, makeOrg(true));
    const out = await ctrl.upsert(req(), {
      name: 'demo',
      transport: 'stdio',
      config: { command: 'node', args: ['/app/demo.mjs'], env: ['LLM_API_KEY_VAR'] },
      enabled: true,
    });
    expect(out.success).toBe(true);
    expect(out.applied).toBe(true);
    const insert = (db.query as jest.Mock).mock.calls.find((c: unknown[]) => /INSERT INTO agent\.mcp_servers/.test(c[0] as string));
    expect(insert).toBeTruthy();
    // config 若含 env 变量名引用会被序列化进 JSONB——只存引用，不存值
    expect(typeof JSON.parse((insert[1] as unknown[])[3] as string)).toBe('object');
  });

  it('PUT http server（带 url）→ 允许', async () => {
    const ctrl = new AgentAdminMcpServersController(makeDb(), makeOrg(true));
    const out = await ctrl.upsert(req(), { name: 's', transport: 'http', url: 'https://mcp.example.svc:3000/mcp', enabled: true });
    expect(out.success).toBe(true);
  });

  it('PUT 缺 name / stdio 缺 command / http 缺 url → 各自拒绝', async () => {
    const ctrl = new AgentAdminMcpServersController(makeDb(), makeOrg(true));
    expect((await ctrl.upsert(req(), {})).success).toBe(false);
    expect((await ctrl.upsert(req(), { name: 's', transport: 'stdio' })).success).toBe(false);
    expect((await ctrl.upsert(req(), { name: 's', transport: 'http' })).success).toBe(false);
  });

  it('PUT 携带内联明文凭证（config.apiKey）→ 拒绝，apiKey 永不入表', async () => {
    const db = makeDb();
    const ctrl = new AgentAdminMcpServersController(db, makeOrg(true));
    await expect(
      ctrl.upsert(req(), { name: 's', transport: 'stdio', config: { command: 'node', apiKey: 'nvapi-REAL' } }),
    ).rejects.toThrow(/凭证/);
    // 未落任何 INSERT
    expect((db.query as jest.Mock).mock.calls.some((c: unknown[]) => /INSERT INTO agent\.mcp_servers/.test(c[0] as string))).toBe(false);
  });

  it('GET 列出全部 server（含 disabled），GET/DELETE 可用', async () => {
    const db = makeDb();
    const ctrl = new AgentAdminMcpServersController(db, makeOrg(true));
    const list = await ctrl.list(req());
    expect(list.success).toBe(true);
    expect(list.servers[0].name).toBe('demo');
    const del = await ctrl.remove(req(), 'demo');
    expect(del.removed).toBe(true);
    expect((db.query as jest.Mock).mock.calls.some((c: unknown[]) => /DELETE FROM agent\.mcp_servers/.test(c[0] as string))).toBe(true);
  });

  it('非运营 → PUT/GET/DELETE 一律 Forbidden（防学生挂外部 server）', async () => {
    const org = makeOrg(false);
    const db = makeDb();
    const ctrl = new AgentAdminMcpServersController(makeDb(), org);
    await expect(ctrl.list(req('guest'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctrl.upsert(req('guest'), { name: 'x', transport: 'stdio', config: { command: 'node' } })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctrl.remove(req('guest'), 'x')).rejects.toBeInstanceOf(ForbiddenException);
    expect(org.assertSiteOperator).toHaveBeenCalledTimes(3);
  });
});