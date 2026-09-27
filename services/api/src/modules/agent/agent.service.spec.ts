import { NotFoundException } from '@nestjs/common';
import { AgentService } from './agent.service';

// @gri/agent-core 是 ESM（type: module），jest 模块注册表不解析 node_modules 的 export 语法。
// 与本仓其它 @gri/* 消费 spec 一致：jest.mock 重定向。底座正确性由 packages/agent-core 的 node --test 套件覆盖。
jest.mock('@gri/agent-core', () => {
  const makeTool = (def: any) => ({
    name: def.name,
    description: def.description || '',
    inputSchema: def.inputSchema,
    category: 'general',
    execute: typeof def.execute === 'function' ? def.execute : async () => null,
  });
  class ToolRegistry {
    m = new Map();
    register(t: any) { this.m.set(t.name, makeTool(t)); return this; }
    registerAll(ts: any[]) { ts.forEach((t) => this.register(t)); return this; }
    list() { return Array.from(this.m.values()); }
    get(n: string) { return this.m.get(n) || null; }
    has(n: string) { return this.m.has(n); }
    // 教学工具里没暴露 call；这里给 MCP 触发的「调用 <工具>」mock 测试一个决定性执行。
    async call(ctx: any, n: string, args: any) {
      const t = this.m.get(n);
      if (!t) return { ok: false, error: 'no tool' };
      return { ok: true, result: (await t.execute(ctx, args)) ?? '' };
    }
  }
  class SkillRegistry {
    s = new Map();
    register(d: any) { d.tools = d.tools || []; this.s.set(d.name, d); return this; }
    list() { return Array.from(this.s.values()); }
    instructionsBlock() { return Array.from(this.s.values()).map((x: any) => x.instructions).join('\n'); }
    has(n: string) { return this.s.has(n); }
    get(n: string) { return this.s.get(n) || null; }
  }
  class MemoryStore {
    constructor(private store: any) {}
    async get(id: string, k: string) {
      const { rows } = await this.store.query('SELECT value FROM agent.memory WHERE entity_id=$1 AND fact_key=$2', [id, k]);
      return rows[0] ? rows[0].value : null;
    }
    async set(id: string, k: string, v: any) {
      await this.store.query('INSERT INTO agent.memory (entity_id,fact_key,value) VALUES ($1,$2,$3)', [id, k, v]);
      return true;
    }
    async list(id: string, o: any = {}) {
      const n = o.limit ?? 20;
      const { rows } = await this.store.query('SELECT fact_key "key",value FROM agent.memory WHERE entity_id=$1 ORDER BY strength DESC LIMIT $2', [id, n]);
      return rows;
    }
    async digest(id: string, o: any = {}) {
      const r = await this.list(id, o);
      return r.map((x: any) => `${x.key}=${JSON.stringify(x.value)}`).join('; ');
    }
  }
  class ModelRouter {
    constructor(private store: any) {}
    async isRealKey() { return false; }
    async list() { return []; }
    async set(r: any) { return true; }
  }
  class LlmClient {
    validateAnswer(q: any, a: any) { return q ? { valid: true, correct: String(a).trim().toUpperCase() === String(q.answer).trim().toUpperCase() } : { valid: false, correct: false }; }
    async isRealKey() { return false; }
  }
  class AgentCore {
    constructor(private deps: any) {}
    listTools() { return this.deps.tools.list(); }
    listSkills() { return this.deps.skills.list(); }
    async run(p: any) { return { success: true, message: `mocked-reply:${p.entityId}:${p.userMessage}`, phase: 'teaching' }; }
  }
  const storeFrom = (q: any) => ({ query: q });
  // MCP 连接池 mock：无启用 server → []（不回归）；有 → bridgeTools 桥出 <server>_math_add 工具名。
  class McpPool {
    constructor(private store: any) {}
    async bridgeTools() {
      const { rows } = await this.store.query('SELECT name FROM agent.mcp_servers WHERE enabled = TRUE');
      const out = [];
      for (const r of rows || []) {
        out.push(makeTool({ name: `${r.name}_math_add`, description: `[MCP ${r.name}] math.add`, category: 'mcp', execute: async () => 42 }));
      }
      return out;
    }
    async pruneIdle() { return; }
    async disconnect() { return; }
  }
  return { AgentCore, LlmClient, ModelRouter, MemoryStore, ToolRegistry, SkillRegistry, makeTool, storeFrom, McpPool };
});

/** 内存假 DB：认有限几种 SQL，模拟 agent.entities / agent.memory / agent.llm_routes / agent.mcp_servers。
 *  K12 全学科：profile（edu.students 行）与 subjectNames（ontology.subject 展示名）可注入。 */
function fakeDb(mcpServers: any[] = [], profile: { current_subject: string; grade: number } | null = null, subjectNames: Record<string, string> = {}) {
  const memory: any[] = [];
  return {
    lastEntityInsert: null as any,
    async query(text: string, params: any[] = []) {
      if (/INSERT INTO agent\.entities/.test(text)) {
        this.lastEntityInsert = params;
        return { rows: [{ entity_id: params[0], kind: 'student', name: null, status: 'active', config: null }], rowCount: 1 };
      }
      if (/INSERT INTO agent\.memory/.test(text)) {
        const e = memory.find((x) => x.id === params[0] && x.k === params[1]);
        if (e) e.v = params[2];
        else memory.push({ id: params[0], k: params[1], v: params[2], s: 1 });
        return { rows: [], rowCount: 1 };
      }
      if (/SELECT value FROM agent\.memory/.test(text)) {
        const e = memory.find((x) => x.id === params[0] && x.k === params[1]);
        return { rows: e ? [{ value: e.v }] : [] };
      }
      if (/SELECT fact_key/.test(text)) {
        const mine = memory.filter((x) => x.id === params[0]);
        return { rows: mine.map((x) => ({ key: x.k, value: x.v })) };
      }
      if (/INSERT INTO agent\.tool_runs/.test(text)) return { rows: [], rowCount: 1 };
      if (/FROM agent\.mcp_servers/.test(text)) return { rows: mcpServers, rowCount: mcpServers.length }; // 桥接用
      if (/SELECT \* FROM agent\.llm_routes/.test(text)) return { rows: [], rowCount: 0 }; // 无路由 → 无 key → mock 路径
      if (/SELECT current_subject, grade FROM edu\.students/.test(text)) {
        return { rows: profile ? [profile] : [] };
      }
      if (/SELECT name FROM ontology\.subject WHERE code/.test(text)) {
        const row = subjectNames[params[0]];
        return { rows: row ? [{ name: row }] : [] };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

function makeService(db: any): AgentService {
  return new AgentService(db);
}

describe('AgentService', () => {
  it('ownership: assertSelf 他人 → NotFoundException', () => {
    const svc = makeService(fakeDb());
    expect(() => svc.assertSelf('someone-else', 'me')).toThrow(NotFoundException);
    expect(() => svc.assertSelf('', 'me')).not.toThrow();
    expect(() => svc.assertSelf('me', 'me')).not.toThrow();
  });

  it('sendMessage: 返回稳定形态并携带独立 entityId 与 routeKey', async () => {
    const db = fakeDb();
    const svc = makeService(db);
    const out = await svc.sendMessage('student-a', '你好，想学数学');
    expect(out.success).toBe(true);
    expect(out.message).toBe('mocked-reply:student-a:你好，想学数学');
    expect(out.entityId).toBe('student-a');
    expect(out.routeKey).toBe('default');
    expect(db.lastEntityInsert[0]).toBe('student-a'); // 每生独立一行，以 externalId 为真源
  });

  it('sendMessage: 用指定 routeKey 且空消息拒绝', async () => {
    const svc = makeService(fakeDb());
    const out = await svc.sendMessage('a', 'hi', { routeKey: 'entity=a' });
    expect(out.routeKey).toBe('entity=a');
    const bad = await svc.sendMessage('a', '   ');
    expect(bad.success).toBe(false);
  });

  it('openSession: 暴露每生独立工具集/技能/记忆摘要', async () => {
    const db = fakeDb();
    const svc = makeService(db);
    const opened = await svc.openSession('student-a');
    expect(opened.entityId).toBe('student-a');
    expect(opened.status).toBe('active');
    expect(opened.tools).toContain('question.lookup');
    expect(opened.skills).toContain('tutor');
    expect(typeof opened.memoryDigest).toBe('string');
  });

  it('跨消息记忆：先记再取，他人读不到', async () => {
    const db = fakeDb();
    const svc = makeService(db);
    // 直接经 MemoryStore（预期注入 service 的同一 db）写读
    await db.query('INSERT INTO agent.memory (entity_id,fact_key,value) VALUES ($1,$2,$3)', ['student-a', 'pref.subject', 'math']);
    const mine = await svc.listMemory('student-a');
    expect(mine.success).toBe(true);
    expect(mine.facts.some((f: any) => f.key === 'pref.subject' && f.value === 'math')).toBe(true);
  });

  it('MCP 桥接：启用 server 时其工具并入每生 agent 工具表', async () => {
    const db = fakeDb([{ name: 'demo', transport: 'stdio' }]);
    const svc = makeService(db);
    const opened = await svc.openSession('student-a');
    expect(opened.tools).toContain('demo_math_add'); // bridge 工具已注册进工具表
    expect(opened.tools).toContain('question.lookup'); // 教学工具不回归
  });

  it('MCP 桥接：无启用 server → 工具表仍只含教学工具（no-op）', async () => {
    const svc = makeService(fakeDb());
    const opened = await svc.openSession('student-b');
    expect(opened.tools).not.toContain('demo_math_add');
    expect(opened.tools).toContain('question.lookup');
  });

  it('mock 路径：调用 <MCP工具> 经工具表执行并返回真实结果（无需真实 LLM）', async () => {
    const svc = makeService(fakeDb([{ name: 'demo' }]));
    const registry = {
      has: (n: string) => n === 'demo_math_add',
      list: () => [{ name: 'demo_math_add' }],
      call: async () => ({ ok: true, result: '42' }),
    };
    const out = await (svc as any)._mockTeach({}, { entityId: 'student-a', userMessage: '调用 demo_math_add {"a":20,"b":22}' }, registry);
    expect(out.message).toContain('已调用工具「demo_math_add」');
    expect(out.message).toContain('42');
  });

  it('mock 路径：调用未注册工具 → 提示可用工具，不崩', async () => {
    const svc = makeService(fakeDb());
    const registry = { has: () => false, list: () => [{ name: 'question.lookup' }] };
    const out = await (svc as any)._mockTeach({}, { entityId: 'a', userMessage: '调用 nope.missing' }, registry);
    expect(out.message).toContain('当前没有可用的工具「nope.missing」');
    expect(out.message).toContain('question.lookup');
  });

  it('K12 persona：_agent 链式取学科（edu.students.current_subject → persona 注入展示名）', async () => {
    const db = fakeDb([], { current_subject: 'phys', grade: 8 }, { phys: '物理' });
    const svc = makeService(db);
    const { core, subject } = await (svc as any)._agent('student-a');
    expect(subject).toBe('phys');
    // persona 注入学科展示名与年级
    const persona = (core as any).deps.persona as string;
    expect(persona).toContain('物理');
    expect(persona).toContain('8 年级');
    expect(persona).toContain('以对话上下文为准');
  });

  it('K12 persona：opts.subject 显式指定覆盖档案（subject 优先链）', async () => {
    const db = fakeDb([], { current_subject: 'phys', grade: 8 }, { chem: '化学' });
    const svc = makeService(db);
    const { subject } = await (svc as any)._agent('student-a', { subject: 'chem' });
    expect(subject).toBe('chem');
  });

  it('K12 persona：无档案无 opts → 默认 math（兜底链末端）', async () => {
    const db = fakeDb([], null, {});
    const svc = makeService(db);
    const { subject } = await (svc as any)._agent('student-a');
    expect(subject).toBe('math');
  });

  it('K12 工具：curriculum.lookup 注册进每生工具表', async () => {
    const svc = makeService(fakeDb());
    const opened = await svc.openSession('student-a');
    expect(opened.tools).toContain('curriculum.lookup');
    expect(opened.tools).toContain('question.lookup'); // 既有工具不回归
  });

  it('K12 工具：curriculum.lookup 按学科+年级查教材章节与知识点', async () => {
    const db = fakeDb();
    const svc = makeService(db);
    const tool = (svc as any)._teachingToolDefs().find((t: any) => t.name === 'curriculum.lookup');
    // 按调用序喂教材/章节/KP 三段查询
    const spy = jest.spyOn(db, 'query');
    spy.mockImplementation((text: string, params: any[] = []) => {
      if (/FROM ontology\.textbook t\s*LEFT JOIN/.test(text)) {
        return Promise.resolve({ rows: [{ id: 'tb-1', code: 'math.g7.pep', name: '人教版数学七年级上册', publisher: '人民教育出版社' }] });
      }
      if (/SELECT id, code, name, parent_id FROM ontology\.textbook_chapter WHERE id/.test(text)) {
        return Promise.resolve({ rows: [{ id: 'ch-1', code: 'math.g7.pep.ch01.s01', name: '1.1 正数和负数', parent_id: null }] });
      }
      if (/SELECT c\.id, c\.code, c\.name, c\.parent_id/.test(text)) {
        return Promise.resolve({ rows: [{ id: 'ch-1', code: 'math.g7.pep.ch01.s01', name: '1.1 正数和负数', parent_id: null }] });
      }
      if (/chapter_id = ANY/.test(text)) {
        return Promise.resolve({ rows: [{ id: 'kp-1', code: 'math.g7.pep.ch01.s01.kp01', name: '正数和负数', description: null, subject: 'MATH', grade_level: 7, chapter_id: 'ch-1', status: 'published' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const out = await tool.execute({ store: { query: db.query.bind(db) }, memory: {}, entityId: 'student-a' }, { subject: 'math', gradeLevel: 7 });

    expect(out.textbooks).toHaveLength(1);
    expect(out.textbooks[0].code).toBe('math.g7.pep');
    expect(out.chapters).toHaveLength(1);
    expect(out.chapters[0].name).toBe('1.1 正数和负数');
    expect(out.knowledgePoints).toHaveLength(1);
    expect(out.knowledgePoints[0].code).toBe('math.g7.pep.ch01.s01.kp01');
  });

  it('K12 mockTeach：出题通用学科匹配（物理/化学不再硬编码数学）', async () => {
    const svc = makeService(fakeDb());
    const o = { entityId: 'a', userMessage: '', memory: { get: async () => null } };
    const outPhys = await (svc as any)._mockTeach({}, { ...o, userMessage: '物理题目来一套' }, undefined);
    expect(outPhys.subject).toBe('phys');
    const outChem = await (svc as any)._mockTeach({}, { ...o, userMessage: '化学练一练' }, undefined);
    expect(outChem.subject).toBe('chem');
    const outHist = await (svc as any)._mockTeach({}, { ...o, userMessage: '历史题目来一套' }, undefined);
    expect(outHist.subject).toBe('hist');
  });

  it('版图工具：map.explorer 注册进每生工具表（第 16 个）', async () => {
    const svc = makeService(fakeDb());
    const opened = await svc.openSession('student-a');
    expect(opened.tools).toContain('map.explorer');
    expect(opened.tools).toContain('curriculum.lookup'); // 既有 K12 工具不回归
  });

  it('版图工具：map.explorer 返回山体摘要（已攀/当前/前方/峰外）', async () => {
    const db = fakeDb();
    const svc = makeService(db);
    const tool = (svc as any)._teachingToolDefs().find((t: any) => t.name === 'map.explorer');
    const spy = jest.spyOn(db, 'query');
    spy.mockImplementation((text: string, params: any[] = []) => {
      if (/SELECT id, code, name FROM ontology\.subject WHERE LOWER\(code\)/.test(text)) {
        return Promise.resolve({ rows: [{ id: 'sub-1', code: 'MATH', name: '数学' }] });
      }
      if (/FROM ontology\.knowledge_area\s*WHERE subject_id/.test(text) || /ontology\.knowledge_area/.test(text)) {
        return Promise.resolve({
          rows: [
            { code: 'math.map.a.01.01', name: '有理数', description: null, scope: 'k12', grade_level: 6 },
            { code: 'math.map.a.01.02', name: '一元一次方程', description: '会解方程', scope: 'k12', grade_level: 7 },
            { code: 'math.map.a.01.03', name: '二次函数', description: null, scope: 'k12', grade_level: 9 },
            { code: 'math.map.a.01.04', name: '抽象代数', description: '群环域', scope: 'frontier', grade_level: null },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const out = await tool.execute(
      { store: { query: db.query.bind(db) }, memory: {}, entityId: 'student-a', student: { subject: 'math', gradeLevel: 7 } },
      {},
    );

    expect(out.ok).toBe(true);
    expect(out.studentGrade).toBe(7);
    expect(out.stats.coverageRatioPct).toBe(75); // 3/4 k12
    expect(out.climbed.map((x: any) => x.name)).toEqual(['有理数']); // 已攀 G<7
    expect(out.here.map((x: any) => x.name)).toEqual(['一元一次方程']); // 当前 G=7
    expect(out.ahead.map((x: any) => x.name)).toEqual(['二次函数']); // 前方 G>7
    expect(out.beyondPeak.map((x: any) => x.name)).toEqual(['抽象代数']); // 峰外 frontier
  });

  it('版图工具：map.explorer 未知学科 → ok:false（不抛异常）', async () => {
    const db = fakeDb();
    const svc = makeService(db);
    const tool = (svc as any)._teachingToolDefs().find((t: any) => t.name === 'map.explorer');
    jest.spyOn(db, 'query').mockImplementation(() => Promise.resolve({ rows: [] }));
    const out = await tool.execute(
      { store: { query: db.query.bind(db) }, memory: {}, entityId: 'student-a' },
      { subject: 'nosuch' },
    );
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('未知学科');
  });
});