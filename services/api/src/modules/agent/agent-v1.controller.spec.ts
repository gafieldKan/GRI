import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'node:http';
import { AgentV1Controller, AGENT_API_VERSION } from './agent-v1.controller';
import { AgentService, AGENT_CLI_BACKENDS } from './agent.service';

// @gri/agent-core 是 ESM（type: module）；与本仓其它消费 spec 一致 jest.mock 重定向。
// 本 spec 只锁 v1 **契约面**（路由注册/信封形状/入参校验/所有权真源）；
// 底座与 AgentService 的真实行为由既有 agent.service.spec.ts + packages/agent-core node --test 覆盖。
jest.mock('@gri/agent-core', () => ({
  AgentCore: class {},
  LlmClient: class {},
  ModelRouter: class {},
  MemoryStore: class {},
  ToolRegistry: class {},
  SkillRegistry: class {},
  McpPool: class {},
  makeTool: (def: any) => def,
  storeFrom: (query: any) => ({ query }),
  createDelegateTool: () => ({ name: 'agent.delegate' }),
}));

interface HttpResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  json: any;
}

/** 极简 HTTP 客户端（不引 supertest，零新依赖）。 */
function request(port: number, method: string, path: string, opts: { body?: any; user?: string } = {}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const data = opts.body === undefined ? null : JSON.stringify(opts.body);
    const headers: Record<string, string> = {};
    if (opts.user) headers['x-test-user'] = opts.user;
    if (data !== null) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(Buffer.byteLength(data));
    }
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let json: any = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          json = raw;
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, json });
      });
    });
    req.on('error', reject);
    if (data !== null) req.write(data);
    req.end();
  });
}

describe('AgentV1Controller —— /api/v1/agent/* 对外版本化契约（B-2）', () => {
  let app: INestApplication;
  let port: number;

  const svc = {
    openSession: jest.fn(async (entityId: string) => ({
      success: true,
      entityId,
      kind: 'student',
      status: 'active',
      tools: ['diagnosis.state', 'wrong.list'],
      skills: ['tutor'],
      memoryDigest: { facts: 0 },
    })),
    sendMessage: jest.fn(async (entityId: string, content: string, opts: any) => ({
      success: true,
      entityId,
      message: `echo:${content}`,
      routeKey: opts?.routeKey ?? 'default',
    })),
    diagnosisOverview: jest.fn(async (entityId: string) => ({ success: true, phase: 'diagnosis', entityId, mastery: 0.5 })),
  };
  const backends = { list: () => [{ id: 'claude-code', label: 'Claude Code', bin: 'claude', timeoutMs: 1000, resumeKey: null }] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AgentV1Controller],
      providers: [
        { provide: AgentService, useValue: svc },
        { provide: AGENT_CLI_BACKENDS, useValue: backends },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    // 与 main.ts 一致：全局前缀 /api（证明最终 URL 确为 /api/v1/agent/*）
    app.setGlobalPrefix('api', { exclude: ['health'] });
    // 中间件替身：注入 req.auth（真鉴权面由全局 AuthRouterMiddleware 挂接，不在本 spec 范围）
    app.use((req: any, _res: any, next: any) => {
      req.auth = { externalId: req.headers['x-test-user'] || 'user-1' };
      next();
    });
    await app.init();
    await app.listen(0);
    port = (app.getHttpServer().address() as any).port;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  // ── §1 路由注册（真 HTTP，逐条证明「路径存在」）────────────────────────────
  it('§1.1 GET /api/v1/agent/me → 200 + v1 信封 + 版本头', async () => {
    const r = await request(port, 'GET', '/api/v1/agent/me');
    expect(r.status).toBe(200);
    expect(r.headers['x-agent-api-version']).toBe(String(AGENT_API_VERSION));
    expect(r.json).toMatchObject({ v: 1, success: true });
    expect(r.json.data.entityId).toBe('user-1');
    expect(r.json.data.tools).toContain('diagnosis.state');
  });

  it('§1.2 POST /api/v1/agent/me/message → 200，routeKey 透传', async () => {
    const r = await request(port, 'POST', '/api/v1/agent/me/message', { body: { content: '光合作用是什么', routeKey: 'entity=user-1' } });
    expect(r.status).toBe(201); // Nest POST 默认 201
    expect(r.json).toMatchObject({ v: 1, success: true });
    expect(r.json.data.message).toBe('echo:光合作用是什么');
    expect(r.json.data.routeKey).toBe('entity=user-1');
  });

  it('§1.3 GET /api/v1/agent/me/diagnosis → 200', async () => {
    const r = await request(port, 'GET', '/api/v1/agent/me/diagnosis');
    expect(r.status).toBe(200);
    expect(r.json.data.phase).toBe('diagnosis');
    expect(r.json.data.mastery).toBe(0.5);
  });

  it('§1.4 GET /api/v1/agent/delegate/backends → 200，只读列出 CLI 后端', async () => {
    const r = await request(port, 'GET', '/api/v1/agent/delegate/backends');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json.data.backends)).toBe(true);
    expect(r.json.data.backends).toHaveLength(1);
    expect(r.json.data.backends[0].id).toBe('claude-code');
    // 只读：不得回传任何函数/凭据字段
    expect(JSON.stringify(r.json)).not.toMatch(/apiKey|api_key|token|secret/i);
  });

  // ── §2 入参校验（fail-fast：结构化 error，不软失败）──────────────────────────
  it('§2.1 空 content → 400 + error.code=INVALID_CONTENT（不到 service）', async () => {
    const r = await request(port, 'POST', '/api/v1/agent/me/message', { body: { content: '   ' } });
    expect(r.status).toBe(400);
    expect(r.json).toMatchObject({ v: 1, success: false, error: { code: 'INVALID_CONTENT' } });
    expect(svc.sendMessage).not.toHaveBeenCalled();
  });

  it('§2.2 缺 content 字段 → 400', async () => {
    const r = await request(port, 'POST', '/api/v1/agent/me/message', { body: {} });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('INVALID_CONTENT');
  });

  // ── §3 所有权真源 = req.auth.externalId（C4）────────────────────────────────
  it('§3.1 主体恒取 externalId（换 token → 换主体，v1 面无 studentId 入参可越权）', async () => {
    await request(port, 'GET', '/api/v1/agent/me', { user: 'user-2' });
    expect(svc.openSession).toHaveBeenCalledWith('user-2');
    await request(port, 'POST', '/api/v1/agent/me/message', { user: 'user-3', body: { content: 'hi' } });
    expect(svc.sendMessage).toHaveBeenCalledWith('user-3', 'hi', expect.objectContaining({}));
  });

  // ── §4 delegate/backends 无注册表 → 空数组不报错 ────────────────────────────
  it('§4.1 未注入 cliBackends → { backends: [] }（探测面绝不 5xx）', () => {
    const bare = new AgentV1Controller(svc as unknown as AgentService, null);
    expect(bare.backends()).toEqual({ v: 1, success: true, data: { backends: [] } });
    const undefinedReg = new AgentV1Controller(svc as unknown as AgentService, undefined);
    expect(undefinedReg.backends().data).toEqual({ backends: [] });
  });
});
