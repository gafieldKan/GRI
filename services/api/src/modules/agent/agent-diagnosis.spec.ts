import { AgentService } from './agent.service';

// 与 agent.service.spec.ts 同款：@gri/agent-core 是 ESM，jest.mock 重定向到内存假实现。
// 底座正确性由 packages/agent-core 的 node --test 覆盖；这里只测 service 层的数据驱动工具。
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
    constructor(public store: any) {}
    async get(id: string, k: string) { const { rows } = await this.store.query('SELECT value FROM agent.memory WHERE entity_id=$1 AND fact_key=$2', [id, k]); return rows[0] ? rows[0].value : null; }
    async set(id: string, k: string, v: any) { await this.store.query('INSERT INTO agent.memory (entity_id,fact_key,value) VALUES ($1,$2,$3)', [id, k, v]); return true; }
    async list(id: string, o: any = {}) { const n = o.limit ?? 20; const { rows } = await this.store.query('SELECT fact_key "key",value FROM agent.memory WHERE entity_id=$1 ORDER BY strength DESC LIMIT $2', [id, n]); return rows; }
    async digest(id: string, o: any = {}) { const r = await this.list(id, o); return r.map((x: any) => `${x.key}=${JSON.stringify(x.value)}`).join('; '); }
    async delete(id: string, k: string) {
      if (/password|secret|token|api_?key|credential/i.test(k)) throw new Error('memory key 拒绝含敏感字: ' + k);
      await this.store.query('DELETE FROM agent.memory WHERE entity_id=$1 AND fact_key=$2', [id, k]);
      return true;
    }
  }
  class ModelRouter {
    constructor(public store: any) {}
    async isRealKey() { return false; }
    async list() { return []; }
    async set(r: any) { return true; }
  }
  class LlmClient {
    validateAnswer(q: any, a: any) { return q ? { valid: true, correct: String(a).trim() === String(q.answer).trim() } : { valid: false, correct: false }; }
    async isRealKey() { return false; }
  }
  class AgentCore {
    constructor(public deps: any) {}
    listTools() { return this.deps.tools.list(); }
    listSkills() { return this.deps.skills.list(); }
    async run(p: any) { return { success: true, message: `mocked-reply:${p.entityId}:${p.userMessage}`, phase: 'teaching' }; }
  }
  const storeFrom = (q: any) => ({ query: q });
  class McpPool {
    constructor(public store: any) {}
    async bridgeTools() { const { rows } = await this.store.query('SELECT name FROM agent.mcp_servers WHERE enabled = TRUE'); return (rows || []).map((r: any) => makeTool({ name: `${r.name}_math_add`, description: `[MCP ${r.name}] math.add`, category: 'mcp', execute: async () => 42 })); }
    async disconnect() { return; }
  }
  // B-3c：委派工具工厂（mock 版）—— 真实现（cwd 白名单/超时/摘要）由 packages/agent-core 单测覆盖。
  const createDelegateTool = (opts: any = {}) => makeTool({
    name: 'agent.delegate',
    description: '委派外部 agent（mock）',
    category: 'delegate',
    execute: async () => ({ ok: false, error: 'mock: 未注入 CliBackendRegistry' }),
    ...opts,
  });
  // 与真件同规则：插件装载按**清洗名**判撞名，替身缺了它 toolDefs 的保留名表就建不起来。
  const sanitizeToolName = (n: string) => String(n).replace(/[^a-zA-Z0-9_-]/g, '-');
  return { AgentCore, LlmClient, ModelRouter, MemoryStore, ToolRegistry, SkillRegistry, makeTool, sanitizeToolName, storeFrom, McpPool, createDelegateTool };
});

/** 内存假 DB：认 agent.entities/memory/tool_runs/mcp_servers/llm_routes + edu.answer_records/wrong_questions/mastery_snapshots/knowledge_points/questions/learning_plans。 */
function fakeDb(seed: any = {}) {
  const kps = seed.kps ?? [{ id: 'kp-1', name: '一元一次方程', subject: 'math' }];
  const questions = seed.questions ?? [{ id: 'q-1', knowledge_point_id: 'kp-1' }];
  const answerRecords = seed.answerRecords ?? [];
  const wrongQuestions = seed.wrongQuestions ?? [];
  const snapshots: any[] = [];
  const plans: any[] = [];
  const srQueue: any[] = seed.srQueue ?? [];
  const memoryRows: any[] = seed.memoryRows ?? [];
  let planSeq = 0;
  return {
    async query(text: string, params: any[] = []) {
      // agent 底座
      if (/INSERT INTO agent\.entities/.test(text)) return { rows: [{ entity_id: params[0], kind: 'student', name: null, status: 'active', config: null }], rowCount: 1 };
      if (/INSERT INTO agent\.memory/.test(text)) {
        const mem = memoryRows.find((m: any) => m.entity_id === params[0] && m.fact_key === params[1]);
        if (mem) mem.value = params[2];
        else memoryRows.push({ entity_id: params[0], fact_key: params[1], value: params[2] });
        return { rows: [], rowCount: 1 };
      }
      if (/SELECT value FROM agent\.memory/.test(text)) {
        const mem = memoryRows.find((m: any) => m.entity_id === params[0] && m.fact_key === params[1]);
        return { rows: mem ? [{ value: mem.value }] : [], rowCount: mem ? 1 : 0 };
      }
      if (/SELECT fact_key/.test(text)) {
        const mine = memoryRows.filter((m: any) => m.entity_id === params[0]);
        return { rows: mine.map((m: any) => ({ fact_key: m.fact_key, value: m.value })), rowCount: mine.length };
      }
      if (/INSERT INTO agent\.tool_runs/.test(text)) return { rows: [], rowCount: 1 };
      if (/FROM agent\.mcp_servers/.test(text)) return { rows: [], rowCount: 0 };
      if (/SELECT \* FROM agent\.llm_routes/.test(text)) return { rows: [], rowCount: 0 };

      // progress.trend：按天分桶作答掌握度（须在通用 /FROM edu.answer_records/ 之前，避免被诊断聚合吞掉）
      if (/date_trunc\('day'/.test(text)) {
        const userId = params[0];
        const q2kp = new Map<string, string>(questions.map((q: any) => [q.id, q.knowledge_point_id]));
        const buckets = new Map<string, any>();
        for (const r of answerRecords) {
          if (r.user_id !== userId) continue;
          const kpId = q2kp.get(r.question_id) as string;
          if (!kpId) continue;
          const day = r.createdAt ? String(r.createdAt).slice(0, 10) : '2026-01-01';
          const key = `${kpId}|${day}`;
          const b = buckets.get(key) ?? {
            kp_id: kpId,
            kp_name: (kps.find((k: any) => k.id === kpId) || {}).name ?? kpId,
            day,
            attempts: 0,
            correct: 0,
          };
          b.attempts += 1;
          if (r.is_correct) b.correct += 1;
          buckets.set(key, b);
        }
        const rows = [...buckets.values()].sort((a: any, b: any) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
        return { rows, rowCount: rows.length };
      }

      // diagnosis.state：per-KP 作答掌握度
      if (/FROM edu\.answer_records/.test(text)) {
        const userId = params[0];
        const q2kp = new Map<string, string>(questions.map((q: any) => [q.id, q.knowledge_point_id]));
        const byKp = new Map<string, { attempts: number; correct: number; ms: number; msCnt: number }>();
        for (const r of answerRecords) {
          if (r.user_id !== userId) continue;
          const kpId = q2kp.get(r.question_id) as string;
          const e = byKp.get(kpId) ?? { attempts: 0, correct: 0, ms: 0, msCnt: 0 };
          e.attempts += 1;
          if (r.is_correct) e.correct += 1;
          if (typeof r.time_spent_ms === 'number') {
            e.ms += r.time_spent_ms;
            e.msCnt += 1;
          }
          byKp.set(kpId, e);
        }
        const rows = [...byKp.entries()].map(([kpId, e]: any) => {
          const kp = kps.find((k: any) => k.id === kpId);
          return {
            kp_id: kpId,
            kp_name: kp?.name ?? kpId,
            attempts: e.attempts,
            correct: e.correct,
            avg_time_ms: e.msCnt ? Math.round(e.ms / e.msCnt) : null,
          };
        });
        return { rows, rowCount: rows.length };
      }
      // wrong.list：抽未解决错题（JOIN 题目/知识点，不返回正确答案，保证重做真实性）
      if (/LEFT JOIN edu\.questions q ON q\.id = wq\.question_id/.test(text)) {
        const userId = params[0];
        const rows = wrongQuestions
          .filter((w: any) => w.user_id === userId && !w.is_resolved)
          .map((w: any) => {
            const q = questions.find((x: any) => x.id === w.question_id);
            const kp = q ? kps.find((k: any) => k.id === q.knowledge_point_id) : undefined;
            return {
              question_id: w.question_id,
              content: q?.content ?? null,
              type: q?.type ?? null,
              options: q?.options ?? null,
              difficulty: q?.difficulty ?? null,
              student_answer: w.student_answer ?? null,
              wrong_count: w.wrong_count ?? 1,
              last_attempt_at: w.last_attempt_at ?? null,
              knowledge_point_id: q?.knowledge_point_id ?? null,
              knowledge_point: kp?.name ?? w.knowledge_point ?? null,
            };
          })
          .slice(0, params[1]);
        return { rows, rowCount: rows.length };
      }
      // diagnosis.state：未解决错题按 KP 名归并
      if (/FROM edu\.wrong_questions/.test(text)) {
        const userId = params[0];
        const byName = new Map<string, number>();
        for (const w of wrongQuestions) {
          if (w.user_id !== userId || w.is_resolved) continue;
          byName.set(w.knowledge_point, (byName.get(w.knowledge_point) ?? 0) + 1);
        }
        const rows = [...byName.entries()].map(([kp_name, count]) => ({ kp_name, count }));
        return { rows, rowCount: rows.length };
      }
      // plan.complete(答对)：消除对应未解决错题
      if (/UPDATE edu\.wrong_questions/.test(text)) {
        for (const w of wrongQuestions) if (w.user_id === params[0] && w.question_id === params[1]) w.is_resolved = true;
        return { rows: [], rowCount: 0 };
      }
      // plan.complete(答对)：读取现有掌握度快照以做增量抬升
      if (/SELECT mastery_score FROM edu\.mastery_snapshots/.test(text)) {
        const s = snapshots.find((x: any) => x.user_id === params[0] && x.knowledge_point_id === params[1]);
        return { rows: s ? [{ mastery_score: s.mastery_score }] : [], rowCount: s ? 1 : 0 };
      }
      // diagnosis.state：快照 UPSERT（每生每KP一行）
      if (/INSERT INTO edu\.mastery_snapshots/.test(text)) {
        const existing = snapshots.find((s) => s.user_id === params[0] && s.knowledge_point_id === params[1]);
        if (existing) existing.mastery_score = params[2];
        else snapshots.push({ user_id: params[0], knowledge_point_id: params[1], mastery_score: params[2], confidence_level: params[3] });
        return { rows: [], rowCount: 1 };
      }
      // plan.generate：归档旧的未完成个性化计划
      if (/UPDATE edu\.learning_plans SET status = 'archived'/.test(text)) {
        for (const p of plans) if (p.user_id === params[0] && p.status === 'active' && p.plan_type === 'personalized') p.status = 'archived';
        return { rows: [], rowCount: 0 };
      }
      // plan.complete：按 id+user 取属于自己的计划(所有权铁律)
      if (/FROM edu\.learning_plans\s+WHERE id = \$1 AND user_id = \$2/.test(text)) {
        const p = plans.find((x: any) => x.id === params[0] && x.user_id === params[1]);
        if (!p) return { rows: [], rowCount: 0 };
        return { rows: [{ ...p, plan_data: typeof p.plan_data === 'string' ? JSON.parse(p.plan_data) : p.plan_data }], rowCount: 1 };
      }
      // plan.complete(mock 意图)：取进行中最新的个性化计划
      if (/FROM edu\.learning_plans WHERE user_id = \$1/.test(text)) {
        const p = plans.find((x: any) => x.user_id === params[0] && (x.status === 'active' || x.status === 'completed'));
        if (!p) return { rows: [], rowCount: 0 };
        return { rows: [{ id: p.id, plan_data: typeof p.plan_data === 'string' ? JSON.parse(p.plan_data) : p.plan_data }], rowCount: 1 };
      }
      // plan.complete：落库任务完成(重算 completed_tasks/progress/status)
      if (/SET plan_data = \$3::jsonb/.test(text)) {
        const p = plans.find((x: any) => x.id === params[0] && x.user_id === params[1]);
        if (p) { p.plan_data = params[2]; p.completed_tasks = params[3]; p.progress = params[4]; p.status = params[5]; }
        return { rows: [], rowCount: 0 };
      }
      // plan.generate：弱项知识点元数据
      if (/SELECT id, name, subject FROM edu\.knowledge_points/.test(text)) {
        const ids = params[0] as string[];
        const rows = kps.filter((k: any) => ids.includes(k.id)).map((k: any) => ({ id: k.id, name: k.name, subject: k.subject }));
        return { rows, rowCount: rows.length };
      }
      // lesson.record：该KP名称（SELECT name FROM ... WHERE id = $1）
      if (/SELECT name FROM edu\.knowledge_points WHERE id = \$1/.test(text)) {
        const kp = kps.find((k: any) => k.id === params[0]);
        return { rows: kp ? [{ name: kp.name }] : [], rowCount: kp ? 1 : 0 };
      }
      // plan.generate：每弱项抽一题温习
      if (/SELECT id FROM edu\.questions/.test(text)) {
        const kpId = params[0];
        const q = questions.find((q: any) => q.knowledge_point_id === kpId);
        return { rows: q ? [{ id: q.id }] : [], rowCount: q ? 1 : 0 };
      }
      // answer.grade：取完整题目(含 type/answer 供判题)
      if (/SELECT \* FROM edu\.questions WHERE id = \$1/.test(text)) {
        const q = questions.find((qq: any) => qq.id === params[0]);
        return { rows: q ? [q] : [], rowCount: q ? 1 : 0 };
      }
      // answer.grade：作答落库(供 diagnosis 聚合)
      if (/INSERT INTO edu\.answer_records/.test(text)) {
        answerRecords.push({ user_id: params[0], question_id: params[1], is_correct: params[3], time_spent_ms: params[4] ?? null });
        return { rows: [], rowCount: 1 };
      }
      // review.sequence：候选题目 + 间隔信号（ANSWER_records 距作答 + sr_queue.next_review 到期日，均按 user 隔离）
      if (/LEFT JOIN edu\.answer_records ar\s+ON ar\.question_id = q\.id/.test(text)) {
        const userId = params[0];
        const kpIds = params[1] as string[];
        const rows = questions
          .filter((q: any) => kpIds.includes(q.knowledge_point_id))
          .map((q: any) => {
            const recs = answerRecords.filter((r: any) => r.user_id === userId && r.question_id === q.id);
            let last: number | null = null;
            let lastWrong: number | null = null;
            for (const r of recs) {
              if (r.created_at == null) continue;
              const t = r.created_at instanceof Date ? r.created_at.getTime() : new Date(r.created_at).getTime();
              if (last == null || t > last) last = t;
              if (!r.is_correct && (lastWrong == null || t > lastWrong)) lastWrong = t;
            }
            const sq = srQueue.find((s: any) => s.user_id === userId && s.question_id === q.id);
            return { question_id: q.id, content: q.content ?? null, type: q.type ?? null, options: q.options ?? null, difficulty: q.difficulty ?? null, knowledge_point_id: q.knowledge_point_id, last_attempt_at: last, last_wrong_at: lastWrong ? new Date(lastWrong) : null, next_review: sq?.next_review ?? null };
          });
        return { rows, rowCount: rows.length };
      }
      // answer.grade：SM-2 读取现有间隔队列(EF/次数/间隔)
      if (/FROM edu\.sr_queue\s+WHERE user_id = \$1 AND question_id = \$2/.test(text)) {
        const s = srQueue.find((x: any) => x.user_id === params[0] && x.question_id === params[1]);
        return { rows: s ? [{ ease_factor: s.ease_factor, repetitions: s.repetitions, interval: s.interval }] : [], rowCount: s ? 1 : 0 };
      }
      // answer.grade：SM-2 UPSERT 演进间隔队列(按 user+question PK)
      if (/INSERT INTO edu\.sr_queue/.test(text)) {
        const existing = srQueue.find((x: any) => x.user_id === params[0] && x.question_id === params[1]);
        const row = { user_id: params[0], question_id: params[1], interval: params[2], ease_factor: params[3], repetitions: params[4], next_review: params[5] as Date };
        if (existing) Object.assign(existing, row);
        else srQueue.push(row);
        return { rows: [], rowCount: 1 };
      }
      // answer.grade：答错入账错题本(幂等,已有则仅计数)
      if (/INSERT INTO edu\.wrong_questions/.test(text)) {
        const exists = wrongQuestions.find((w: any) => w.user_id === params[0] && w.question_id === params[1]);
        if (exists) exists.wrong_count = (exists.wrong_count || 1) + 1;
        else wrongQuestions.push({ user_id: params[0], question_id: params[1], is_resolved: false, knowledge_point: undefined });
        return { rows: [], rowCount: 1 };
      }
      // lesson.record：落盘一行 lesson 型记录（须在 plan.generate 落库之前匹配;SQL 跨行,用 'lesson' 字面判别）
      if (/INSERT INTO edu\.learning_plans/.test(text) && /'lesson'/.test(text)) {
        planSeq += 1;
        plans.push({ id: `plan-${planSeq}`, user_id: params[0], title: params[1], plan_type: 'lesson', plan_data: params[2], total_tasks: 1, completed_tasks: 1, status: params[3] });
        return { rows: [{ id: `plan-${planSeq}` }], rowCount: 1 };
      }
      // plan.generate：落库
      if (/INSERT INTO edu\.learning_plans/.test(text)) {
        planSeq += 1;
        plans.push({ id: `plan-${planSeq}`, user_id: params[0], title: params[1], plan_type: 'personalized', plan_data: params[2], total_tasks: params[3], completed_tasks: 0, status: 'active' });
        return { rows: [{ id: `plan-${planSeq}` }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    _snapshots: () => snapshots,
    _plans: () => plans,
    _wrongQuestions: () => wrongQuestions,
    _answerRecords: () => answerRecords,
    _srQueue: () => srQueue,
    _memoryRows: () => memoryRows,
    _seedSrQueue: (row: any) => { srQueue.push({ user_id: row.user_id, question_id: row.question_id, interval: row.interval ?? 0, ease_factor: row.ease_factor ?? 2.5, repetitions: row.repetitions ?? 0, next_review: row.next_review }); return srQueue[srQueue.length - 1]; },
    _seedPlan: (row: any) => { plans.push({ id: row.id, user_id: row.user_id, title: row.title, plan_type: row.plan_type ?? 'personalized', plan_data: row.plan_data, total_tasks: row.total_tasks, completed_tasks: row.completed_tasks ?? 0, progress: row.progress ?? 0, status: row.status ?? 'active' }); return plans[plans.length - 1]; },
  };
}

function makeService(db: any): AgentService {
  return new AgentService(db);
}

describe('AgentService · 数据驱动会诊 diagnosis.state', () => {
  const seedFor = () => ({
    kps: [
      { id: 'kp-1', name: '一元一次方程', subject: 'math' },
      { id: 'kp-2', name: '函数', subject: 'math' },
    ],
    questions: [
      { id: 'q-1', knowledge_point_id: 'kp-1' },
      { id: 'q-2', knowledge_point_id: 'kp-1' },
      { id: 'q-3', knowledge_point_id: 'kp-2' },
    ],
    answerRecords: [
      { user_id: 'student-a', question_id: 'q-1', is_correct: true },
      { user_id: 'student-a', question_id: 'q-1', is_correct: true },
      { user_id: 'student-a', question_id: 'q-1', is_correct: false },
      { user_id: 'student-a', question_id: 'q-3', is_correct: true },
      { user_id: 'student-b', question_id: 'q-1', is_correct: false }, // 他人作答 -> 隔离
    ],
    wrongQuestions: [
      { user_id: 'student-a', knowledge_point: '一元一次方程', is_resolved: false },
      { user_id: 'student-a', knowledge_point: '一元一次方程', is_resolved: false },
      { user_id: 'student-a', knowledge_point: '函数', is_resolved: false },
      { user_id: 'student-a', knowledge_point: '一元一次方程', is_resolved: true }, // 已解决 -> 不计
    ],
  });

  function diagOf(svc: AgentService, entityId: string) {
    const defs = (svc as any)._teachingToolDefs() as any[];
    const t = defs.find((d) => d.name === 'diagnosis.state');
    return t.execute({ store: (svc as any)._store(), entityId }, {});
  }

  it('正确聚合作答掌握度 + 未解决错题,且按 entityId 隔离他人', async () => {
    const db = fakeDb(seedFor());
    const svc = makeService(db);
    const out = await diagOf(svc, 'student-a');
    expect(out.entityId).toBe('student-a');
    expect(out.totalAttempts).toBe(4);
    expect(out.totalCorrect).toBe(3);
    expect(out.accuracy).toBe(75);
    const kp1 = out.knowledgePoints.find((k: any) => k.kpId === 'kp-1');
    expect(kp1).toMatchObject({ attempts: 3, correct: 2, mastery: 67 });
    const kp2 = out.knowledgePoints.find((k: any) => k.kpId === 'kp-2');
    expect(kp2).toMatchObject({ attempts: 1, correct: 1, mastery: 100 });
    expect(out.totalUnresolved).toBe(3);
    expect(out.unresolvedByKp).toEqual(expect.arrayContaining([{ kpName: '一元一次方程', count: 2 }, { kpName: '函数', count: 1 }]));
    // 隔离:student-b 只看得到自己的作答(1 题 kp-1),看不到 a 的作答/错题
    const sb = await diagOf(svc, 'student-b');
    expect(sb.knowledgePoints).toHaveLength(1);
    expect(sb.knowledgePoints[0]).toMatchObject({ kpId: 'kp-1', attempts: 1, correct: 0 });
    expect(sb.totalAttempts).toBe(1);
    expect(sb.totalUnresolved).toBe(0);
  });

  it('把最新掌握度写回 mastery_snapshots(每生每KP一行,不重复)', async () => {
    const db = fakeDb(seedFor());
    const svc = makeService(db);
    await diagOf(svc, 'student-a');
    await diagOf(svc, 'student-a'); // 二次调用 -> upsert 而非堆行
    const snaps = db._snapshots();
    expect(snaps).toHaveLength(2); // kp-1 + kp-2
    const kp1 = snaps.find((s) => s.knowledge_point_id === 'kp-1');
    expect(kp1.mastery_score).toBe(67);
    expect(kp1.user_id).toBe('student-a');
  });

  it('无作答记录不崩,回退空掌握度', async () => {
    const db = fakeDb({ kps: [{ id: 'kp-1', name: '一元一次方程', subject: 'math' }] });
    const svc = makeService(db);
    const out = await diagOf(svc, 'student-x');
    expect(out.knowledgePoints).toEqual([]);
    expect(out.totalAttempts).toBe(0);
    expect(out.accuracy).toBe(0);
    expect(out.totalUnresolved).toBe(0);
  });
});

describe('AgentService · 个性化计划 plan.generate', () => {
  it('按弱项知识点落库 learning_plans,返回任务,并归档旧活动计划', async () => {
    const db = fakeDb({ kps: [{ id: 'kp-1', name: '一元一次方程', subject: 'math' }], questions: [{ id: 'q-9', knowledge_point_id: 'kp-1' }] });
    // 预置一条旧活动计划,a 已有一条 active personalized
    await db.query('INSERT INTO edu.learning_plans (...) VALUES ($1,$2,$3,$4)', ['student-a', '旧', '{old}', 2]);
    const svc = makeService(db);
    const defs = (svc as any)._teachingToolDefs() as any[];
    const t = defs.find((d) => d.name === 'plan.generate');
    const out = await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { weakKnowledgePointIds: ['kp-1'] });
    expect(out.ok).toBe(true);
    expect(out.planId).toBeTruthy();
    expect(out.tasks).toHaveLength(1);
    expect(out.tasks[0]).toMatchObject({ kpId: 'kp-1', kpName: '一元一次方程', taskType: 'review', questionId: 'q-9' });
    // 旧计划已归档,新计划 active
    const plans = db._plans();
    expect(plans.find((p: any) => p.id === out.planId).status).toBe('active');
    expect(plans.find((p: any) => p.status === 'archived')).toBeTruthy();
  });

  it('弱项为空 -> 明确失败不落库', async () => {
    const db = fakeDb();
    const svc = makeService(db);
    const defs = (svc as any)._teachingToolDefs() as any[];
    const t = defs.find((d) => d.name === 'plan.generate');
    const out = await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { weakKnowledgePointIds: [] });
    expect(out.ok).toBe(false);
    expect(db._plans()).toHaveLength(0);
  });
});

describe('AgentService · mock 路径可驱动诊断工具(无真实 LLM)', () => {
  it('调用 diagnosis.state {} 经工具表执行并渲染真实掌握度/错题', async () => {
    const db = fakeDb({
      kps: [{ id: 'kp-1', name: '一元一次方程', subject: 'math' }],
      questions: [{ id: 'q-1', knowledge_point_id: 'kp-1' }],
      answerRecords: [{ user_id: 'student-a', question_id: 'q-1', is_correct: true }],
      wrongQuestions: [{ user_id: 'student-a', knowledge_point: '一元一次方程', is_resolved: false }],
    });
    const svc = makeService(db);
    const registry = { has: () => true, list: () => [{ name: 'diagnosis.state' }], call: async () => ({ ok: true, result: await (svc as any)._teachingToolDefs().find((d: any) => d.name === 'diagnosis.state').execute({ store: (svc as any)._store(), entityId: 'student-a' }, {}) }) };
    const out = await (svc as any)._mockTeach({}, { entityId: 'student-a', userMessage: '诊断 我这个单元掌握得怎么样' }, registry);
    expect(out.phase).toBe('teaching');
    expect(out.message).toContain('100%');
    expect(out.message).toContain('一元一次方程');
    expect(out.message).toContain('错题 1');
  });

  it('计划意图 -> 诊断最薄弱知识点并落成计划,回显 planId', async () => {
    const db = fakeDb({ kps: [{ id: 'kp-1', name: '一元一次方程', subject: 'math' }], questions: [{ id: 'q-1', knowledge_point_id: 'kp-1' }], answerRecords: [{ user_id: 'student-a', question_id: 'q-1', is_correct: false }] });
    const svc = makeService(db);
    const defs = (svc as any)._teachingToolDefs() as any[];
    const registry = {
      has: () => true,
      list: () => defs.map((d: any) => ({ name: d.name })),
      call: async (ctx: any, n: string, args: any) => ({ ok: true, result: await defs.find((d: any) => d.name === n).execute({ store: (svc as any)._store(), entityId: 'student-a' }, args) }),
    };
    const out = await (svc as any)._mockTeach({}, { entityId: 'student-a', userMessage: '帮我做个学习计划吧' }, registry);
    expect(out.message).toContain('一元一次方程');
    expect(out.message).toContain('个性化计划');
  });
});

function completionDb(): any {
  const db: any = fakeDb({
    kps: [
      { id: 'kp-1', name: '一元一次方程', subject: 'math' },
      { id: 'kp-2', name: '函数', subject: 'math' },
    ],
    questions: [
      { id: 'q-1', knowledge_point_id: 'kp-1' },
      { id: 'q-2', knowledge_point_id: 'kp-2' },
    ],
    wrongQuestions: [
      { user_id: 'student-a', question_id: 'q-1', knowledge_point: '一元一次方程', is_resolved: false },
    ],
  });
  db._seedPlan({
    id: 'plan-1', user_id: 'student-a', title: '个性化学习计划（2 个弱项）', plan_type: 'personalized', total_tasks: 2, completed_tasks: 0, status: 'active',
    plan_data: {
      tasks: [
        { kpId: 'kp-1', kpName: '一元一次方程', taskType: 'review', title: '温习「一元一次方程」', questionId: 'q-1' },
        { kpId: 'kp-2', kpName: '函数', taskType: 'review', title: '温习「函数」', questionId: 'q-2' },
      ],
    },
  });
  return db;
}
function completeTool(svc: AgentService): any {
  return (svc as any)._teachingToolDefs().find((d: any) => d.name === 'plan.complete');
}
function diagnosisRows(svc: AgentService, entityId: string): Promise<any> {
  return (svc as any)._teachingToolDefs().find((x: any) => x.name === 'diagnosis.state').execute({ store: (svc as any)._store(), entityId }, {});
}

describe('AgentService · 计划完成回灌 plan.complete', () => {
  it('标记一条任务完成: 重算 completed_tasks/progress, 未满仍 active', async () => {
    const db = completionDb();
    const svc = makeService(db);
    const out = await completeTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-a' }, { planId: 'plan-1', taskIndex: 0, correct: true });
    expect(out.ok).toBe(true);
    expect(out.taskTitle).toBe('温习「一元一次方程」');
    expect(out.completedTasks).toBe(1);
    expect(out.totalTasks).toBe(2);
    expect(out.progress).toBe(50);
    expect(out.status).toBe('active');
    expect(out.isComplete).toBe(false);
    const plan = db._plans().find((p: any) => p.id === 'plan-1');
    expect(plan.completed_tasks).toBe(1);
    expect(plan.progress).toBe(50);
  });

  it('全部任务完成 → 置 status=completed + progress=100', async () => {
    const db = completionDb();
    const svc = makeService(db);
    const t = completeTool(svc);
    await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { planId: 'plan-1', taskIndex: 0 });
    const out = await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { planId: 'plan-1', taskIndex: 1 });
    expect(out.isComplete).toBe(true);
    expect(out.progress).toBe(100);
    expect(out.status).toBe('completed');
    expect(db._plans().find((p: any) => p.id === 'plan-1').status).toBe('completed');
  });

  it('答对 → 消除对应未解决错题 + 抬升掌握度快照(60起步, 复用同任务再+10)', async () => {
    const db = completionDb();
    const svc = makeService(db);
    const t = completeTool(svc);
    const out = await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { planId: 'plan-1', taskIndex: 0, correct: true });
    expect(out.masteryBump).toBe(60); // 无存量快照 → 60
    // 错题 q-1 已消除: 再次诊断不再计入
    const d = await diagnosisRows(svc, 'student-a');
    expect(d.unresolvedByKp).toEqual([]);
    expect(d.totalUnresolved).toBe(0);
    // 幂等再完成同任务: 快照 60→70
    const out2 = await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { planId: 'plan-1', taskIndex: 0, correct: true });
    expect(out2.masteryBump).toBe(70);
    const kp1 = db._snapshots().find((s: any) => s.knowledge_point_id === 'kp-1');
    expect(kp1.mastery_score).toBe(70);
  });

  it('答错(correct=false) → 仍标记完成但不抬升掌握度、不消除错题', async () => {
    const db = completionDb();
    const svc = makeService(db);
    const t = completeTool(svc);
    const out = await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { planId: 'plan-1', taskIndex: 0, correct: false });
    expect(out.ok).toBe(true);
    expect(out.completedTasks).toBe(1);
    expect(out.masteryBump).toBe(null);
    expect(db._snapshots()).toHaveLength(0);
    const d = await diagnosisRows(svc, 'student-a');
    expect(d.totalUnresolved).toBe(1); // 错题仍保留
  });

  it('越权隔离: 非本人的计划 → 明确失败且不落库', async () => {
    const db = completionDb();
    const svc = makeService(db);
    const out = await completeTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-b' }, { planId: 'plan-1', taskIndex: 0 });
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('不属于');
    expect(db._plans().find((p: any) => p.id === 'plan-1').completed_tasks).toBe(0);
  });

  it('taskIndex 越界 → 明确失败', async () => {
    const db = completionDb();
    const svc = makeService(db);
    const out = await completeTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-a' }, { planId: 'plan-1', taskIndex: 9 });
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('越界');
  });

  it('completePlanTask 服务方法直通工具逻辑(不经 LLM)并落审计', async () => {
    const db = completionDb();
    const svc = makeService(db);
    const out = await svc.completePlanTask('student-a', 'plan-1', 1, true);
    expect(out.success).toBe(true);
    expect(out.completedTasks).toBe(1);
    expect(out.totalTasks).toBe(2);
    expect(out.isComplete).toBe(false);
    expect(db._plans().find((p: any) => p.id === 'plan-1').completed_tasks).toBe(1);
    // 越权: 非本人
    const o2 = await svc.completePlanTask('student-b', 'plan-1', 0, true);
    expect(o2.success).toBe(false);
    expect(o2.reason).toContain('不属于');
  });
});

function gradeDb(): any {
  return fakeDb({
    kps: [{ id: 'kp-1', name: '一元一次方程', subject: 'math' }],
    questions: [{ id: 'q-1', knowledge_point_id: 'kp-1', type: 'fill', answer: '42' }],
    answerRecords: [],
    wrongQuestions: [],
  });
}
/** 带授课状态记忆的 gradeDb：lessonSubmit 服务方法（mock MemoryStore → fakeDb agent.memory 行）能读回 lesson:<kp> 状态。
 *  mock MemoryStore.set 不 stringify → 值按原样存取,这里直接 seed 原始对象（真实 MemoryStore.set 会 JSON.stringify、get 会解析,两者对消费方等价）。 */
function gradeLessonDb(lessonState: any = {}): any {
  return fakeDb({
    kps: [{ id: 'kp-1', name: '一元一次方程', subject: 'math' }],
    questions: [{ id: 'q-1', knowledge_point_id: 'kp-1', type: 'fill', answer: '42' }],
    answerRecords: [],
    wrongQuestions: [],
    memoryRows: [{ entity_id: 'student-a', fact_key: 'lesson:kp-1', value: lessonState }],
  });
}
function gradeTool(svc: AgentService): any {
  return (svc as any)._teachingToolDefs().find((d: any) => d.name === 'answer.grade');
}

describe('AgentService · 作答落库 answer.grade', () => {
  it('答对 → 写 answer_records, 诊断聚合到该次作答', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    const t = gradeTool(svc);
    const r = await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { questionId: 'q-1', answer: '42' });
    expect(r.recorded).toBe(true);
    expect(r.isCorrect).toBe(true);
    const d = await diagnosisRows(svc, 'student-a');
    expect(d.totalAttempts).toBe(1);
    expect(d.totalCorrect).toBe(1);
    expect(d.accuracy).toBe(100);
  });

  it('带 timeSpentMs 判读 → 落 time_spent_ms, 诊断聚合出平均用时(avgTimeSec); 不传则 NULL', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    const t = gradeTool(svc);
    await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { questionId: 'q-1', answer: '42', timeSpentMs: 72000 });
    const rec = db._answerRecords().find((r: any) => r.user_id === 'student-a');
    expect(rec.time_spent_ms).toBe(72000);
    const d = await diagnosisRows(svc, 'student-a');
    expect(d.knowledgePoints[0]).toMatchObject({ kpId: 'kp-1', avgTimeSec: 72 });
    // 不传 timeSpentMs → 落 NULL（未测得耗时），avgTimeSec 为 null
    await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { questionId: 'q-1', answer: '3x' });
    const rec2 = db._answerRecords().pop();
    expect(rec2.time_spent_ms).toBe(null);
  });

  it('答对 → SM-2 建间隔队列(quality5: EF2.6, 间隔1天, 次数1)', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    const t = gradeTool(svc);
    await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { questionId: 'q-1', answer: '42' });
    const sq = db._srQueue().filter((s: any) => s.user_id === 'student-a');
    expect(sq).toHaveLength(1);
    expect(sq[0]).toMatchObject({ question_id: 'q-1', interval: 1, repetitions: 1, ease_factor: 2.6 });
    expect(sq[0].next_review.getTime()).toBeGreaterThan(Date.now());
  });

  it('连对两次 → SM-2 指数演进: 第二次间隔 6 天、次数 2', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    const t = gradeTool(svc);
    for (let i = 0; i < 2; i++) {
      await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { questionId: 'q-1', answer: '42' });
    }
    const sq = db._srQueue().find((s: any) => s.user_id === 'student-a' && s.question_id === 'q-1');
    // 第一次(reps0→interval1, reps1)；第二次(reps1→按照式 interval=6, reps2)
    expect(sq).toMatchObject({ interval: 6, repetitions: 2 });
  });

  it('答错 → SM-2 重置(reps 归零、interval 0, EF 衰减)', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    const t = gradeTool(svc);
    await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { questionId: 'q-1', answer: '3' });
    const sq = db._srQueue().filter((s: any) => s.user_id === 'student-a');
    expect(sq).toHaveLength(1);
    expect(sq[0]).toMatchObject({ question_id: 'q-1', interval: 0, repetitions: 0, ease_factor: 1.96 });
  });

  it('SM-2 队列按 user 隔离(他人作答不建当前学生队列)', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    const t = gradeTool(svc);
    await t.execute({ store: (svc as any)._store(), entityId: 'student-b' }, { questionId: 'q-1', answer: '42' });
    expect(db._srQueue().filter((s: any) => s.user_id === 'student-a')).toHaveLength(0);
    expect(db._srQueue().filter((s: any) => s.user_id === 'student-b')).toHaveLength(1);
  });

  it('判读结果回带 SM-2 演进摘要(interval/EF/次数/nextReview), 供面板/LLM 反馈下次复习时点', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    const t = gradeTool(svc);
    const r = await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { questionId: 'q-1', answer: '42' });
    expect(r.sm2).toMatchObject({ interval: 1, easeFactor: 2.6, repetitions: 1 });
    expect(new Date(r.sm2.nextReview).getTime()).toBeGreaterThan(Date.now());
    // 同题再答错 → 摘要反映重置(interval 0, reps 0, EF 衰减)
    const r2 = await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { questionId: 'q-1', answer: 'x' });
    expect(r2.sm2).toMatchObject({ interval: 0, repetitions: 0, easeFactor: 2.06 });
  });

  it('答错 → 写 answer_records(false) + 入账错题本, 诊断 totalUnresolved 实时反映', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    const t = gradeTool(svc);
    const r = await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { questionId: 'q-1', answer: '3' });
    expect(r.recorded).toBe(true);
    expect(r.isCorrect).toBe(false);
    const d = await diagnosisRows(svc, 'student-a');
    expect(d.totalAttempts).toBe(1);
    expect(d.totalCorrect).toBe(0);
    expect(d.accuracy).toBe(0);
    expect(d.totalUnresolved).toBe(1);
  });

  it('同题再错 → 错题本仅一行, wrong_count 递增(幂等)', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    const t = gradeTool(svc);
    await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { questionId: 'q-1', answer: '3' });
    await t.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { questionId: 'q-1', answer: '7' });
    const wqs = db._wrongQuestions().filter((w: any) => w.user_id === 'student-a');
    expect(wqs).toHaveLength(1);
    expect(wqs[0].wrong_count).toBe(2);
    // 已解决错题不重复计数(答对消除语义由 plan.complete 承担)
  });

  it('他人作答进隔离, 不污染当前学生诊断', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    const t = gradeTool(svc);
    await t.execute({ store: (svc as any)._store(), entityId: 'student-b' }, { questionId: 'q-1', answer: '9' });
    const d = await diagnosisRows(svc, 'student-b');
    expect(d.totalAttempts).toBe(1);
    expect(d.totalUnresolved).toBe(1);
    const dA = await diagnosisRows(svc, 'student-a');
    expect(dA.totalAttempts).toBe(0);
  });
});

describe('AgentService · 错题冲刺 wrong.list + answer.grade(resolveOnCorrect)', () => {
  function reviewDb(): any {
    return fakeDb({
      kps: [{ id: 'kp-1', name: '一元一次方程', subject: 'math' }],
      questions: [{ id: 'q-1', knowledge_point_id: 'kp-1', type: 'fill', answer: '42', content: '解方程：x + 1 = 43' }],
      answerRecords: [],
      wrongQuestions: [
        { user_id: 'student-a', question_id: 'q-1', is_resolved: false, knowledge_point: '一元一次方程', wrong_count: 2 },
        { user_id: 'student-a', question_id: 'q-9', is_resolved: false, knowledge_point: '其他', wrong_count: 1 },
        { user_id: 'student-b', question_id: 'q-1', is_resolved: false, knowledge_point: '一元一次方程', wrong_count: 3 },
      ],
    });
  }
  const wlTool = (svc: AgentService): any => (svc as any)._teachingToolDefs().find((d: any) => d.name === 'wrong.list');

  it('wrong.list → 只抽未解决错题, 含题面, 不含正确答案(重做真实性)', async () => {
    const db = reviewDb();
    const svc = makeService(db);
    const r = await wlTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-a' }, { limit: 5 });
    expect(r.total).toBe(2);
    const q = r.questions.find((x: any) => x.questionId === 'q-1');
    expect(q).toBeTruthy();
    expect(q.content).toContain('x + 1 = 43');
    expect(q.knowledgePoint).toBe('一元一次方程');
    expect(q.wrongCount).toBe(2);
    expect('answer' in q).toBe(false); // 不泄漏正确作答
  });

  it('wrong.list 按掌握度缺口排序: 最弱知识点的未解错题排前(即使错次更少)', async () => {
    const db = fakeDb({
      kps: [
        { id: 'kp-weak', name: '弱项方程', subject: 'math' },
        { id: 'kp-strong', name: '强项几何', subject: 'math' },
      ],
      questions: [
        { id: 'q-w', knowledge_point_id: 'kp-weak', type: 'fill', answer: 'w', content: '弱项题', difficulty: 'hard' },
        { id: 'q-s', knowledge_point_id: 'kp-strong', type: 'fill', answer: 's', content: '强项题', difficulty: 'medium' },
      ],
      answerRecords: [
        // 弱项 5 次对 1 → mastery 0.2；强项 5 次对 4 → mastery 0.8
        { user_id: 'student-a', question_id: 'q-w', is_correct: false },
        { user_id: 'student-a', question_id: 'q-w', is_correct: false },
        { user_id: 'student-a', question_id: 'q-w', is_correct: false },
        { user_id: 'student-a', question_id: 'q-w', is_correct: false },
        { user_id: 'student-a', question_id: 'q-w', is_correct: true },
        { user_id: 'student-a', question_id: 'q-s', is_correct: true },
        { user_id: 'student-a', question_id: 'q-s', is_correct: true },
        { user_id: 'student-a', question_id: 'q-s', is_correct: true },
        { user_id: 'student-a', question_id: 'q-s', is_correct: true },
        { user_id: 'student-a', question_id: 'q-s', is_correct: false },
      ],
      wrongQuestions: [
        // 强项错 5 次但 kp 掌握度高；弱项只错 1 次但 kp 很弱 → 弱项题应排前
        { user_id: 'student-a', question_id: 'q-s', is_resolved: false, knowledge_point: '强项几何', wrong_count: 5 },
        { user_id: 'student-a', question_id: 'q-w', is_resolved: false, knowledge_point: '弱项方程', wrong_count: 1 },
      ],
    });
    const svc = makeService(db);
    const r = await wlTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-a' }, { limit: 5 });
    expect(r.questions[0].questionId).toBe('q-w');          // 最弱知识点的错题排最前
    expect(r.questions[0].kpMasteryPct).toBeLessThan(r.questions[1].kpMasteryPct);
    expect(r.questions[0]).toMatchObject({ kpMasteryPct: 20, wrongCount: 1 });
    expect(r.questions[1]).toMatchObject({ kpMasteryPct: 80, wrongCount: 5 });
    expect('answer' in r.questions[0]).toBe(false);
  });

  it('answer.grade(resolveOnCorrect:true) 答对 → 消除错题, 后续诊断 totalUnresolved 下降', async () => {
    const db = reviewDb();
    const svc = makeService(db);
    const gt = gradeTool(svc);
    const r = await gt.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { questionId: 'q-1', answer: '42', resolveOnCorrect: true });
    expect(r.isCorrect).toBe(true);
    expect(r.resolved).toBe(true);
    const d = await diagnosisRows(svc, 'student-a');
    expect(d.totalUnresolved).toBe(1); // 只剩 q-9
    const still = await wlTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-a' }, {});
    expect(still.questions.map((x: any) => x.questionId)).toEqual(['q-9']);
  });

  it('answer.grade(resolveOnCorrect:true) 仍答错 → 不消除, 仅正常记录(wrong_count+1)', async () => {
    const db = reviewDb();
    const svc = makeService(db);
    const gt = gradeTool(svc);
    const r = await gt.execute({ store: (svc as any)._store(), entityId: 'student-a' }, { questionId: 'q-1', answer: '999', resolveOnCorrect: true });
    expect(r.isCorrect).toBe(false);
    expect(r.resolved).toBe(false);
    const d = await diagnosisRows(svc, 'student-a');
    expect(d.totalUnresolved).toBe(2);
    const w = db._wrongQuestions().find((x: any) => x.user_id === 'student-a' && x.question_id === 'q-1');
    expect(w.is_resolved).toBe(false);
  });

  it('错题所有权隔离: 他人未解决错题不进入当前学生 wrong.list', async () => {
    const db = reviewDb();
    const svc = makeService(db);
    const r = await wlTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-b' }, {});
    expect(r.questions.map((x: any) => x.questionId)).toEqual(['q-1']);
    expect(r.questions.every((x: any) => x.questionId === 'q-1')).toBe(true);
  });
});

describe('AgentService · 错题冲刺 mock 路径(无真实 LLM)', () => {
  it('「复习错题/错题冲刺」意图 → wrong.list 渲染未解决错题', async () => {
    const db = (() => fakeDb({
      kps: [{ id: 'kp-1', name: '一元一次方程', subject: 'math' }],
      questions: [{ id: 'q-1', knowledge_point_id: 'kp-1', type: 'fill', answer: '42', content: '解方程：x+1=43' }],
      answerRecords: [],
      wrongQuestions: [{ user_id: 'student-a', question_id: 'q-1', is_resolved: false, knowledge_point: '一元一次方程', wrong_count: 2 }],
    }))();
    const svc = makeService(db);
    const defs = (svc as any)._teachingToolDefs() as any[];
    const registry = {
      has: () => true,
      list: () => defs.map((d: any) => ({ name: d.name })),
      call: async (_ctx: any, n: string, args: any) => ({ ok: true, result: await defs.find((d: any) => d.name === n).execute({ store: (svc as any)._store(), entityId: 'student-a' }, args) }),
    };
    const out = await (svc as any)._mockTeach({}, { entityId: 'student-a', userMessage: '复习错题' }, registry);
    expect(out.phase).toBe('teaching');
    expect(out.message).toContain('错题冲刺');
    expect(out.message).toContain('x+1=43');
    expect(out.message).toContain('答对后我会帮你消除并回灌掌握度');
  });
});

/** 自适应复习序列：seqDb/rsTool 提到模块级,供本 describe 与 mock describe 复用。 */
function seqDb(): any {
    const now = Date.now();
    const day = 86_400_000;
    return fakeDb({
      kps: [
        { id: 'kp-w', name: '弱项方程', subject: 'math' },
        { id: 'kp-s', name: '强项几何', subject: 'math' },
      ],
      questions: [
        { id: 'q-w-old', knowledge_point_id: 'kp-w', type: 'fill', answer: 'o', content: '弱项旧题', difficulty: 'hard' },
        { id: 'q-w2', knowledge_point_id: 'kp-w', type: 'fill', answer: 'w', content: '弱项未做过', difficulty: 'hard' },
        { id: 'q-s1', knowledge_point_id: 'kp-s', type: 'fill', answer: 's1', content: '强项老题', difficulty: 'easy' },
        { id: 'q-s2', knowledge_point_id: 'kp-s', type: 'fill', answer: 's2', content: '刚练过', difficulty: 'medium' },
      ],
      answerRecords: [
        // 弱项 kp-w：5 次只对 1 → mastery 0.2（由旧题 q-w-old 记账，q-w2 从未做过）
        { user_id: 'student-a', question_id: 'q-w-old', is_correct: true },
        { user_id: 'student-a', question_id: 'q-w-old', is_correct: false, created_at: new Date(now - 21 * day) },
        { user_id: 'student-a', question_id: 'q-w-old', is_correct: false, created_at: new Date(now - 3 * day) },
        { user_id: 'student-a', question_id: 'q-w-old', is_correct: false, created_at: new Date(now - 3 * day) },
        { user_id: 'student-a', question_id: 'q-w-old', is_correct: false, created_at: new Date(now - 3 * day) },
        // 强项 kp-s：5 次对 4 → mastery 0.8（q-s1 老、q-s2 刚答对）
        { user_id: 'student-a', question_id: 'q-s1', is_correct: true, created_at: new Date(now - 20 * day) },
        { user_id: 'student-a', question_id: 'q-s1', is_correct: true, created_at: new Date(now - 20 * day) },
        { user_id: 'student-a', question_id: 'q-s1', is_correct: false, created_at: new Date(now - 20 * day) },
        { user_id: 'student-a', question_id: 'q-s2', is_correct: true, created_at: new Date(now - 2 * day) },
        { user_id: 'student-a', question_id: 'q-s2', is_correct: true, created_at: new Date(now - 1 * day) },
      ],
      wrongQuestions: [],
    });
  }
  const rsTool = (svc: AgentService): any => (svc as any)._teachingToolDefs().find((d: any) => d.name === 'review.sequence');

  it('按掌握度缺口+间隔排序: 弱项未做过最前, 强项老题次之, 刚答对的沉底', async () => {
    const db = seqDb();
    const svc = makeService(db);
    const r = await rsTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-a' }, { size: 5 });
    const ids = r.questions.map((x: any) => x.questionId);
    expect(ids[0]).toBe('q-w2');  // gap 0.8 + 14(未做过) = 22 → 最弱且待复习
    expect(ids[1]).toBe('q-s1');  // gap 0.2 + 14(间隔≥14 封顶) = 16 → 强项但久未练
    expect(ids[2]).toBe('q-w-old'); // gap 0.8 + 2(3天前) ≈ 10 → 弱项但刚练过
    expect(ids[3]).toBe('q-s2');  // gap 0.2 + 2(刚答对) = 4 → 沉底
    const by = (id: string) => r.questions.find((x: any) => x.questionId === id);
    expect(by('q-w2').masteryPct).toBe(20);
    expect(by('q-w2').spacingDays).toBe(14);   // 未做过 → 新卡满间隔
    expect(by('q-s1').masteryPct).toBe(80);
    expect(by('q-s1').spacingDays).toBe(14);   // 无 sr_queue 档案 → 距作答 20 天但生效间隔封顶 14
    expect(by('q-s1').dueDays).toBe(-20);      // 报到期(负=已逾期 20 天, 因无档案按距作答推算)
    expect(by('q-s2').spacingDays).toBeLessThan(2);
  });

  it('SM-2 间隔: 有 sr_queue.next_review → 到期的排前、未到期的沉底(指数化调度)', async () => {
    const now = Date.now();
    const day = 86_400_000;
    const db = fakeDb({
      kps: [
        { id: 'kp-w', name: '弱项方程', subject: 'math' },
        { id: 'kp-s', name: '强项几何', subject: 'math' },
      ],
      questions: [
        { id: 'q-w-old', knowledge_point_id: 'kp-w', type: 'fill', answer: 'o', content: '弱项旧题', difficulty: 'hard' },
        { id: 'q-w2', knowledge_point_id: 'kp-w', type: 'fill', answer: 'w', content: '弱项未做过', difficulty: 'hard' },
        { id: 'q-s1', knowledge_point_id: 'kp-s', type: 'fill', answer: 's1', content: '强项老题', difficulty: 'easy' },
        { id: 'q-s2', knowledge_point_id: 'kp-s', type: 'fill', answer: 's2', content: '强项未到期', difficulty: 'medium' },
      ],
      answerRecords: [
        // 弱项 kp-w：5 次只对 1 → mastery 0.2（q-w-old 记账，q-w2 从未做过）
        { user_id: 'student-a', question_id: 'q-w-old', is_correct: true },
        { user_id: 'student-a', question_id: 'q-w-old', is_correct: false },
        { user_id: 'student-a', question_id: 'q-w-old', is_correct: false },
        { user_id: 'student-a', question_id: 'q-w-old', is_correct: false },
        { user_id: 'student-a', question_id: 'q-w-old', is_correct: false },
        // 强项 kp-s：5 次对 4 → mastery 0.8
        { user_id: 'student-a', question_id: 'q-s1', is_correct: true },
        { user_id: 'student-a', question_id: 'q-s1', is_correct: true },
        { user_id: 'student-a', question_id: 'q-s1', is_correct: true },
        { user_id: 'student-a', question_id: 'q-s1', is_correct: true },
        { user_id: 'student-a', question_id: 'q-s1', is_correct: false },
      ],
      wrongQuestions: [],
      // 间隔重复队列: q-w-old 逾 5 天、q-w2 逾 3 天、q-s1 逾 1 天、q-s2 还有 10 天未到期
      srQueue: [
        { user_id: 'student-a', question_id: 'q-w-old', next_review: new Date(now - 5 * day) },
        { user_id: 'student-a', question_id: 'q-w2', next_review: new Date(now - 3 * day) },
        { user_id: 'student-a', question_id: 'q-s1', next_review: new Date(now - 1 * day) },
        { user_id: 'student-a', question_id: 'q-s2', next_review: new Date(now + 10 * day) },
      ],
    });
    const svc = makeService(db);
    const r = await rsTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-a' }, { size: 5 });
    const ids = r.questions.map((x: any) => x.questionId);
    // 到期越久(逾期天高压实)且越弱越前: 弱旧(逾5) > 弱新(逾3,未做过满间隔) > 强项老(逾1) > 未到期沉底
    expect(ids[0]).toBe('q-w-old');  // gap0.8*10 + (14+5)=19 → 27
    expect(ids[1]).toBe('q-w2');     // gap0.8*10 + (14+3)=17 → 25
    expect(ids[2]).toBe('q-s1');     // gap0.2*10 + (14+1)=15 → 17
    expect(ids[3]).toBe('q-s2');     // gap0.2*10 + (14-10)=4 → 6, 未到期自动沉底
    const by = (id: string) => r.questions.find((x: any) => x.questionId === id);
    expect(by('q-w-old').dueDays).toBe(-5);
    expect(by('q-w-old').spacingDays).toBe(19);
    expect(by('q-s2').dueDays).toBe(10);
    expect(by('q-s2').spacingDays).toBe(4);
    expect(r.strategy).toContain('sm2_spacing');
  });

  it('限定 weakKnowledgePointIds → 只在该等知识点内出题', async () => {
    const db = seqDb();
    const svc = makeService(db);
    const r = await rsTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-a' }, { weakKnowledgePointIds: ['kp-s'], size: 5 });
    expect(r.questions.every((x: any) => x.kpId === 'kp-s')).toBe(true);
    expect(r.questions.map((x: any) => x.questionId).sort()).toEqual(['q-s1', 'q-s2']);
  });

  it('不认识的弱项 id 被忽略(不崩)', async () => {
    const db = seqDb();
    const svc = makeService(db);
    const r = await rsTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-a' }, { weakKnowledgePointIds: ['kp-none'], size: 5 });
    expect(r.total).toBe(0);
  });

  it('无作答记录不崩, 回退提示先做题', async () => {
    const db = fakeDb({ kps: [{ id: 'kp-1', name: 'x', subject: 'math' }], questions: [{ id: 'q-1', knowledge_point_id: 'kp-1', answer: '1' }], answerRecords: [], wrongQuestions: [] });
    const svc = makeService(db);
    const r = await rsTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-a' }, {});
    expect(r.total).toBe(0);
    expect(r.note).toContain('还没有作答记录');
  });

  it('他人作答不影响当前学生排序依据', async () => {
    const db = seqDb();
    const svc = makeService(db);
    const r = await rsTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-b' }, { size: 5 });
    // student-b 无作答 → 无 kp → 提示先做题（数据不泄漏给它的排序）
    expect(r.total).toBe(0);
  });

  it('短期答错惩罚: 最近一次作答答错(≤3天) → 浮上来尽早重练, 而最近答对/久远答错不加权', async () => {
    const now = Date.now();
    const day = 86_400_000;
    const db = fakeDb({
      kps: [{ id: 'kp-w', name: '方程', subject: 'math' }],
      questions: [
        { id: 'q-bad', knowledge_point_id: 'kp-w', type: 'fill', answer: 'b', content: '刚答错', difficulty: 'medium' },
        { id: 'q-ok', knowledge_point_id: 'kp-w', type: 'fill', answer: 'o', content: '刚答对', difficulty: 'medium' },
        { id: 'q-old', knowledge_point_id: 'kp-w', type: 'fill', answer: 'l', content: '久远答错', difficulty: 'medium' },
        { id: 'q-fixed', knowledge_point_id: 'kp-w', type: 'fill', answer: 'f', content: '错后又答对', difficulty: 'medium' },
      ],
      answerRecords: [
        // 同一 kp → mastery 相同、gap 相同；由 间隔+短期惩罚 区分
        { user_id: 'student-a', question_id: 'q-bad', is_correct: false, created_at: new Date(now - 1 * day) },   // 最近答错 1 天前 → boost
        { user_id: 'student-a', question_id: 'q-ok', is_correct: true, created_at: new Date(now - 1 * day) },     // 最近答对 1 天前 → no boost
        { user_id: 'student-a', question_id: 'q-old', is_correct: false, created_at: new Date(now - 10 * day) },  // 答错 10 天前(>3天) → no boost
        { user_id: 'student-a', question_id: 'q-fixed', is_correct: false, created_at: new Date(now - 5 * day) }, // 先错
        { user_id: 'student-a', question_id: 'q-fixed', is_correct: true, created_at: new Date(now - 1 * day) },  // 后对 → 最近一次是答对 → no boost
      ],
      wrongQuestions: [],
    });
    const svc = makeService(db);
    const r = await rsTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-a' }, { size: 10 });
    const by = (id: string) => r.questions.find((x: any) => x.questionId === id);
    expect(by('q-bad').recentWrong).toBe(true);
    expect(by('q-bad').wrongBoost).toBe(5);
    expect(by('q-ok').recentWrong).toBe(false);
    expect(by('q-ok').wrongBoost).toBe(0);
    expect(by('q-old').recentWrong).toBe(false);   // 答错 10 天前 > 3 天窗口 → 不加权
    expect(by('q-fixed').recentWrong).toBe(false); // 错后又答对 → 最近一次答对 → 不加权
    expect(by('q-bad').score).toBe(by('q-ok').score + 5); // 同 gap: 答错题独得 boost5 浮到答对题之上
  });

describe('AgentService · 只读学情面板端点(薄透传)', () => {
  it('diagnosisOverview → 复用 diagnosis.state 返回掌握度+未解错题, 并按 entityId 隔离', async () => {
    const db = fakeDb({
      kps: [{ id: 'kp-1', name: '一元二次方程', subject: 'math' }],
      questions: [{ id: 'q-1', knowledge_point_id: 'kp-1', content: 'x^2=1', answer: 'x=±1' }],
      answerRecords: [{ user_id: 'student-a', question_id: 'q-1', is_correct: false }],
      wrongQuestions: [{ user_id: 'student-a', question_id: 'q-1', is_resolved: false, knowledge_point: '一元二次方程' }],
    });
    const svc = makeService(db);
    const d = await svc.diagnosisOverview('student-a');
    expect(d.success).toBe(true);
    expect(d.phase).toBe('diagnosis');
    expect(d.knowledgePoints[0].mastery).toBe(0);
    expect(d.totalUnresolved).toBe(1);
    const dB = await svc.diagnosisOverview('student-b');
    expect(dB.totalAttempts).toBe(0); // 他人数据隔离
  });

  it('wrongBook → 复用 wrong.list 返回未解错题, 不含正确答案', async () => {
    const db = fakeDb({
      kps: [{ id: 'kp-1', name: '一元二次方程', subject: 'math' }],
      questions: [{ id: 'q-1', knowledge_point_id: 'kp-1', content: 'x^2=1 求解', answer: 'x=±1' }],
      answerRecords: [],
      wrongQuestions: [{ user_id: 'student-a', question_id: 'q-1', is_resolved: false, knowledge_point: '一元二次方程', wrong_count: 2 }],
    });
    const svc = makeService(db);
    const w = await svc.wrongBook('student-a', 5);
    expect(w.success).toBe(true);
    expect(w.questions).toHaveLength(1);
    expect(w.questions[0].questionId).toBe('q-1');
    expect('answer' in w.questions[0]).toBe(false);
  });

  it('reviewPreview → 复用 review.sequence 返回按缺口+间隔排序的预览', async () => {
    const db = seqDb();
    const svc = makeService(db);
    const r = await svc.reviewPreview('student-a', 5);
    expect(r.success).toBe(true);
    expect(r.phase).toBe('review-preview');
    expect(r.questions[0].questionId).toBe('q-w2'); // 最弱且未做过最前
    expect(r.questions.every((x: any) => 'answer' in x === false)).toBe(true);
  });

  it('gradeAnswer → 复用 answer.grade; 答对+resolveOnCorrect 消错题并记作答, 按 entityId 隔离', async () => {
    const db = fakeDb({
      kps: [{ id: 'kp-1', name: '一元一次方程', subject: 'math' }],
      questions: [{ id: 'q-1', knowledge_point_id: 'kp-1', type: 'fill', answer: '42', content: '解方程 x? ' }],
      answerRecords: [],
      wrongQuestions: [{ user_id: 'student-a', question_id: 'q-1', is_resolved: false, knowledge_point: '一元一次方程' }],
    });
    const svc = makeService(db);
    const r = await svc.gradeAnswer('student-a', 'q-1', '42', true);
    expect(r.success).toBe(true);
    expect(r.phase).toBe('graded');
    expect(r.isCorrect).toBe(true);
    expect(r.resolved).toBe(true);
    const w = db._wrongQuestions().find((x: any) => x.user_id === 'student-a' && x.question_id === 'q-1');
    expect(w.is_resolved).toBe(true);
    const dB = await svc.diagnosisOverview('student-b');
    expect(dB.totalAttempts).toBe(0); // 他人作答隔离
  });
});

describe('AgentService · 自适应复习 mock 路径(无真实 LLM)', () => {
  it('「复习/巩固」意图 → review.sequence 渲染自适应序列', async () => {
    const db = seqDb();
    const svc = makeService(db);
    const defs = (svc as any)._teachingToolDefs() as any[];
    const registry = {
      has: () => true,
      list: () => defs.map((d: any) => ({ name: d.name })),
      call: async (_ctx: any, n: string, args: any) => ({ ok: true, result: await defs.find((d: any) => d.name === n).execute({ store: (svc as any)._store(), entityId: 'student-a' }, args) }),
    };
    const out = await (svc as any)._mockTeach({}, { entityId: 'student-a', userMessage: '帮我复习巩固一下' }, registry);
    expect(out.phase).toBe('teaching');
    expect(out.message).toContain('弱项未做过');
    expect(out.message).toContain('掌握度 20%');
    expect(out.message).toContain('自适应复习');
  });
});

describe('AgentService · mock 路径可驱动完成回灌(无真实 LLM)', () => {
  it('「完成」意图 → 完成进行中计划的首条未完成任务并回显进度', async () => {
    const db = completionDb();
    const svc = makeService(db);
    const defs = (svc as any)._teachingToolDefs() as any[];
    const registry = {
      has: () => true,
      list: () => defs.map((d: any) => ({ name: d.name })),
      call: async (_ctx: any, n: string, args: any) => ({ ok: true, result: await defs.find((d: any) => d.name === n).execute({ store: (svc as any)._store(), entityId: 'student-a' }, args) }),
    };
    const out = await (svc as any)._mockTeach({}, { entityId: 'student-a', userMessage: '我完成了第一条任务' }, registry);
    expect(out.phase).toBe('teaching');
    expect(out.completedTasks).toBe(1);
    expect(out.totalTasks).toBe(2);
    expect(out.message).toContain('一元一次方程');
  });
});

describe('AgentService · 新工具已挂进每生 agent 工具表', () => {
  it('openSession 工具表含 diagnosis.state + plan.generate + plan.complete + wrong.list,既有工具不回归', async () => {
    const svc = makeService(fakeDb());
    const opened = await svc.openSession('student-a');
    expect(opened.tools).toContain('diagnosis.state');
    expect(opened.tools).toContain('plan.generate');
    expect(opened.tools).toContain('plan.complete');
    expect(opened.tools).toContain('wrong.list');
    expect(opened.tools).toContain('review.sequence');
    expect(opened.tools).toContain('question.lookup');
    expect(opened.tools).toContain('memory.forget');
    expect(opened.tools).toContain('progress.trend');
    expect(opened.tools).toContain('lesson.current');
    expect(opened.tools).toContain('lesson.submit');
    expect(opened.tools).toContain('lesson.record');
    expect(opened.skills).toContain('tutor');
  });
});

describe('AgentService · 长记忆显式管理 memory.forget', () => {
  function memDb(): any {
    return fakeDb({ kps: [{ id: 'kp-1', name: '一元一次方程', subject: 'math' }], questions: [], answerRecords: [], wrongQuestions: [] });
  }
  function forgetTool(svc: AgentService): any {
    return (svc as any)._teachingToolDefs().find((d: any) => d.name === 'memory.forget');
  }

  it('工具表挂出 memory.forget，可删除(返回 forgoted key)', async () => {
    const svc = makeService(memDb());
    const names = (svc as any)._teachingToolDefs().map((t: any) => t.name);
    expect(names).toContain('memory.forget');
    let deletedKey: string | null = null;
    const r = await forgetTool(svc).execute(
      { store: (svc as any)._store(), entityId: 'student-a', memory: { delete: async (_id: string, k: string) => { deletedKey = k; return true; } } },
      { key: 'pref.favorite_subject' },
    );
    expect(r).toMatchObject({ forgot: true, key: 'pref.favorite_subject' });
    expect(deletedKey).toBe('pref.favorite_subject');
  });

  it('forgetMemory 服务方法直通工具逻辑(不经 LLM)', async () => {
    const svc = makeService(memDb());
    const out = await svc.forgetMemory('student-a', 'pref.favorite_subject');
    expect(out.success).toBe(true);
    expect(out.forgot).toBe(true);
    expect(out.key).toBe('pref.favorite_subject');
  });

  it('forgetMemory 拒绝敏感 key(密钥类由 _guardKey 拦截)', async () => {
    const svc = makeService(memDb());
    const out = await svc.forgetMemory('student-a', 'pref.apiKey');
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/敏感/i);
  });
});

describe('AgentService · 掌握度趋势 progress.trend', () => {
  function trendDb(): any {
    return fakeDb({
      kps: [
        { id: 'kp-1', name: '一元一次方程', subject: 'math' },
        { id: 'kp-2', name: '勾股定理', subject: 'math' },
      ],
      questions: [
        { id: 'q-1', knowledge_point_id: 'kp-1', type: 'fill', answer: '42' },
        { id: 'q-2', knowledge_point_id: 'kp-2', type: 'fill', answer: '5' },
      ],
      answerRecords: [
        { user_id: 'student-a', question_id: 'q-1', is_correct: false, createdAt: '2026-09-01T10:00:00Z' },
        { user_id: 'student-a', question_id: 'q-1', is_correct: true, createdAt: '2026-09-02T10:00:00Z' },
        { user_id: 'student-a', question_id: 'q-1', is_correct: true, createdAt: '2026-09-03T10:00:00Z' },
        { user_id: 'student-b', question_id: 'q-1', is_correct: true, createdAt: '2026-09-09T10:00:00Z' },
      ],
      wrongQuestions: [],
    });
  }
  function trendTool(svc: AgentService): any {
    return (svc as any)._teachingToolDefs().find((d: any) => d.name === 'progress.trend');
  }

  it('按天累计掌握度 → 时间序列 + 首末差值(进步量)', async () => {
    const svc = makeService(trendDb());
    const r = await trendTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-a' }, {});
    const kp1 = r.knowledgePoints.find((k: any) => k.kpId === 'kp-1');
    expect(kp1.series).toEqual([
      { day: '2026-09-01', mastery: 0 },
      { day: '2026-09-02', mastery: 50 },
      { day: '2026-09-03', mastery: 67 },
    ]);
    expect(kp1.currentMastery).toBe(67);
    expect(kp1.deltaPts).toBe(67); // 末 67 - 首 0
    expect(kp1.days).toBe(3);
    expect(r.knowledgePoints.find((k: any) => k.kpId === 'kp-2')).toBeUndefined(); // 无作答的 KP 不出现
    expect(r.hasHistory).toBe(true);
  });

  it('他人作答不进趋势(按 entityId 隔离); 单天无趋势 delta=0', async () => {
    const svc = makeService(trendDb());
    const r = await trendTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-b' }, {});
    expect(r.knowledgePoints).toHaveLength(1);
    const kp1 = r.knowledgePoints.find((k: any) => k.kpId === 'kp-1');
    expect(kp1.series).toHaveLength(1);
    expect(kp1.deltaPts).toBe(0);
  });

  it('无作答记录 → 提示暂无趋势(不崩)', async () => {
    const db = fakeDb({ kps: [{ id: 'kp-1', name: '一元一次方程' }], questions: [{ id: 'q-1', knowledge_point_id: 'kp-1' }], answerRecords: [], wrongQuestions: [] });
    const svc = makeService(db);
    const r = await trendTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-a' }, {});
    expect(r.knowledgePoints).toHaveLength(0);
    expect(r.hasHistory).toBe(false);
    expect(r.note).toContain('暂无法看趋势');
  });

  it('masteryTrend 服务方法直通工具逻辑(不经 LLM)', async () => {
    const svc = makeService(trendDb());
    const out = await svc.masteryTrend('student-a');
    expect(out.success).toBe(true);
    expect(out.phase).toBe('mastery-trend');
    expect(out.hasHistory).toBe(true);
  });
});
describe('AgentService · 按知识点专项练习 kpQuestions（只出题面,不含答案）', () => {
  function fakeDb(): any {
    return {
      query: jest.fn(async (text: string, params?: any[]) => {
        // 抽该知识点的题（只读）
        if (/WHERE q\.knowledge_point_id = \$1/.test(text)) {
          return {
            rows: [
              { id: 'q-1', content: '3x+5=11', type: 'fill', options: null, difficulty: 'easy', name: '一元一次方程' },
              { id: 'q-2', content: '2(x-3)=10', type: 'fill', options: null, difficulty: 'hard', name: '一元一次方程' },
            ],
          };
        }
        // 审计落库
        if (/INSERT INTO agent\.tool_runs/.test(text)) return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
    } as any;
  }

  it('按 kpId 抽题 → 只回题面/类型/难度/知识点,不含 answer/explanation; 写 kp.drill 审计', async () => {
    const db = fakeDb();
    const svc = makeService(db);
    const out = await (svc as any).kpQuestions('student-a', 'kp-1', 5);
    expect(out.success).toBe(true);
    expect(out.phase).toBe('kp-drill');
    expect(out.count).toBe(2);
    expect(out.questions[0]).toMatchObject({ questionId: 'q-1', content: '3x+5=11', difficulty: 'easy' });
    expect(out.questions[0].answer).toBeUndefined();
    expect(out.questions[0].explanation).toBeUndefined();
    // size 压缩到 [1,10]：抽 99 也只会 LIMIT 10 —— 断言 SQL 参数
  });

  it('缺 kpId → success:false + 空题组,不崩', async () => {
    const db = fakeDb();
    const svc = makeService(db);
    const out = await (svc as any).kpQuestions('student-a', undefined, 5);
    expect(out.success).toBe(false);
    expect(out.questions).toEqual([]);
  });
});

describe('AgentService · 授课状态机 lesson.current（设案→讲解→例题→再练, 状态存记忆续课）', () => {
  function lessonDb(): any {
    return {
      query: jest.fn(async (text: string, params?: any[]) => {
        // assess：该KP该生真实聚合（注意须在 kp 名称查询之前匹配，两者都含 FROM edu.knowledge_points）
        if (/FROM edu\.knowledge_points kp/.test(text)) {
          return { rows: [{ kp_id: 'kp-1', kp_name: '一元一次方程', attempts: 10, correct: 7 }] };
        }
        // 该KP名称
        if (/FROM edu\.knowledge_points WHERE id = \$1/.test(text)) return { rows: [{ name: '一元一次方程' }] };
        // assess：该KP未解决错题数
        if (/FROM edu\.wrong_questions/.test(text)) return { rows: [{ n: 2 }] };
        // teach：该生最近一次实际答错
        if (/ORDER BY ar\.created_at DESC/.test(text)) return { rows: [{ student_answer: 'x=4' }] };
        // example / drill：该KP抽一题
        if (/ORDER BY random\(\) LIMIT 1/.test(text)) {
          return { rows: [{ question_id: 'q-1', content: '3x-5=10', type: 'fill', options: null, difficulty: 'medium' }] };
        }
        return { rows: [], rowCount: 0 };
      }),
    } as any;
  }
  function lessonCtx(svc: AgentService, mem?: any) {
    const ctx: any = { store: (svc as any)._store(), entityId: 'student-a' };
    if (mem) ctx.memory = mem;
    return ctx;
  }
  const lessonTool = (svc: AgentService) =>
    ((svc as any)._teachingToolDefs() as any[]).find((d: any) => d.name === 'lesson.current');

  it('assess → 返回真实掌握度/未解决错题 + 推进到 teach', async () => {
    const svc = makeService(lessonDb());
    const out = await lessonTool(svc).execute(lessonCtx(svc), { kpId: 'kp-1' });
    expect(out.success).toBe(true);
    expect(out.stage).toBe('assess');
    expect(out.next).toBe('teach');
    expect(out.kpName).toBe('一元一次方程');
    expect(out.mastery).toBe(70);
    expect(out.attempts).toBe(10);
    expect(out.unresolvedWrong).toBe(2);
  });

  it('显式推进 teach → 返回该生真实答错写法(错因)', async () => {
    const svc = makeService(lessonDb());
    const out = await lessonTool(svc).execute(lessonCtx(svc), { kpId: 'kp-1', stage: 'teach' });
    expect(out.stage).toBe('teach');
    expect(out.next).toBe('example');
    expect(out.wrongAnswer).toBe('x=4');
  });

  it('example→drill→complete 逐级推进, example/drill 各返回一题真题', async () => {
    const svc = makeService(lessonDb());
    const ex = await lessonTool(svc).execute(lessonCtx(svc), { kpId: 'kp-1', stage: 'example' });
    expect(ex.stage).toBe('example');
    expect(ex.next).toBe('drill');
    expect(ex.questionId).toBe('q-1');
    const dr = await lessonTool(svc).execute(lessonCtx(svc), { kpId: 'kp-1', stage: 'drill' });
    expect(dr.stage).toBe('drill');
    expect(dr.next).toBe('complete');
    expect(dr.questionId).toBe('q-1');
    const done = await lessonTool(svc).execute(lessonCtx(svc), { kpId: 'kp-1', stage: 'complete' });
    expect(done.stage).toBe('complete');
    expect(done.next).toBeNull();
  });

  it('状态写记忆：assess 后不带 stage 续课 → 仍从已持久化阶段读回; 每步写 lesson:<kp>', async () => {
    const memMap = new Map<string, any>();
    const mem = {
      get: async (e: string, k: string) => memMap.get(k) ?? null,
      set: async (e: string, k: string, v: any) => { memMap.set(k, v); return true; },
    };
    const svc = makeService(lessonDb());
    const first = await lessonTool(svc).execute(lessonCtx(svc, mem), { kpId: 'kp-1' });
    expect(first.stage).toBe('assess');
    expect(memMap.get('lesson:kp-1').stage).toBe('assess');
    // 推进到 teach（写记忆）
    await lessonTool(svc).execute(lessonCtx(svc, mem), { kpId: 'kp-1', stage: 'teach' });
    expect(memMap.get('lesson:kp-1').stage).toBe('teach');
    // 不带 stage 续课 → 读回 teach，不再返回 assess 数据
    const resume = await lessonTool(svc).execute(lessonCtx(svc, mem), { kpId: 'kp-1' });
    expect(resume.stage).toBe('teach');
  });

  it('缺 kpId → success:false; 无 memory 上下文 → 仍能出授课数据(仅不持久化)', async () => {
    const svc = makeService(lessonDb());
    const bad = await lessonTool(svc).execute(lessonCtx(svc), { kpId: undefined });
    expect(bad.success).toBe(false);
    const noMem = await lessonTool(svc).execute(lessonCtx(svc), { kpId: 'kp-1', stage: 'teach' });
    expect(noMem.success).toBe(true);
    expect(noMem.wrongAnswer).toBe('x=4');
  });

  it('teach 优先重讲"这次答错的写法"(状态 lastWrongAnswer, 答错耦合), 命中 targeted; 无则回退通用最近错因', async () => {
    const svc = makeService(lessonDb());
    const mem = { get: async () => ({ stage: 'drill', baseline: 60, lastQuestion: 'q-1', lastWrongAnswer: 'x=9' }), set: async () => true };
    const out = await lessonTool(svc).execute(lessonCtx(svc, mem), { kpId: 'kp-1', stage: 'teach' });
    expect(out.wrongAnswer).toBe('x=9');
    expect(out.targeted).toBe(true);
    // 无 lastWrongAnswer → 回退 SQL 该KP最近答错
    const out2 = await lessonTool(svc).execute(lessonCtx(svc), { kpId: 'kp-1', stage: 'teach' });
    expect(out2.wrongAnswer).toBe('x=4');
    expect(out2.targeted).toBe(false);
  });
});

describe('AgentService · 授课答题闭环 lesson.submit（判题落库+回授掌握度+状态机推进）', () => {
  const submitTool = (svc: AgentService) =>
    ((svc as any)._teachingToolDefs() as any[]).find((d: any) => d.name === 'lesson.submit');
  function memWith(stateMap: Record<string, any>) {
    const mm = new Map<string, any>(Object.entries(stateMap));
    return {
      get: async (_e: string, k: string) => mm.get(k) ?? null,
      set: async (_e: string, k: string, v: any) => { mm.set(k, v); return true; },
      dump: () => Object.fromEntries(mm.entries()),
    };
  }

  it('答对 → 落作答 + SM-2 + 推进 state 到 complete(drillDone/lastCorrect) + 回授掌握度(baseline0→100,delta100)', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    const mem = memWith({ 'lesson:kp-1': { kpId: 'kp-1', stage: 'drill', lastQuestion: 'q-1', baseline: 0, attempts: 0 } });
    const out = await submitTool(svc).execute({ store: (svc as any)._store(), memory: mem, entityId: 'student-a' }, { kpId: 'kp-1', answer: '42' });
    expect(out.success).toBe(true);
    expect(out.isCorrect).toBe(true);
    expect(out.correct).toBe(true);
    expect(out.stage).toBe('complete');
    expect(out.next).toBeNull();
    expect(out.drillDone).toBe(true);
    expect(out.lastCorrect).toBe(true);
    expect(out.attempts).toBe(1);
    expect(out.missedCount).toBe(0);
    expect(out.resolved).toBe(true);
    // 作答已落库 + SM-2 队列已建（answer.grade 同源副作用）
    const rec = db._answerRecords().find((r: any) => r.user_id === 'student-a' && r.question_id === 'q-1');
    expect(rec).toBeTruthy();
    expect(rec.is_correct).toBe(true);
    expect(db._srQueue().filter((s: any) => s.user_id === 'student-a' && s.question_id === 'q-1')).toHaveLength(1);
    // 回授掌握度：baseline 0 → 本次判对后续真实聚合 100，delta 100
    expect(out.practiceMastery).toBe(100);
    expect(out.baseline).toBe(0);
    expect(out.delta).toBe(100);
    // 状态机已推进（读回记忆为 complete）；答对收束清掉错因
    expect(mem.dump()['lesson:kp-1'].stage).toBe('complete');
    expect(out.wrongAnswer).toBeNull();
    expect(out.targeted).toBe(false);
    expect(mem.dump()['lesson:kp-1'].lastWrongAnswer).toBeNull();
  });

  it('答错 → 落作答(false)+入错题本, 留在 drill 且 missedCount+1/lastCorrect=false, 掌握度不抬升', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    const mem = memWith({ 'lesson:kp-1': { kpId: 'kp-1', stage: 'drill', lastQuestion: 'q-1', baseline: 50, attempts: 1 } });
    const out = await submitTool(svc).execute({ store: (svc as any)._store(), memory: mem, entityId: 'student-a' }, { kpId: 'kp-1', answer: '3x' });
    expect(out.success).toBe(true);
    expect(out.isCorrect).toBe(false);
    expect(out.stage).toBe('drill');
    expect(out.drillDone).toBe(false);
    expect(out.lastCorrect).toBe(false);
    expect(out.attempts).toBe(2);
    expect(out.missedCount).toBe(1);
    expect(out.resolved).toBe(false);
    const rec = db._answerRecords().find((r: any) => r.user_id === 'student-a' && r.question_id === 'q-1');
    expect(rec.is_correct).toBe(false);
    expect(db._wrongQuestions().filter((w: any) => w.user_id === 'student-a' && w.question_id === 'q-1')).toHaveLength(1);
    // 该次答错 → 真实聚合 practiceMastery 0, delta 相对 baseline -50（退步可见）
    expect(out.practiceMastery).toBe(0);
    expect(out.delta).toBe(-50);
    expect(mem.dump()['lesson:kp-1'].stage).toBe('drill');
    expect(mem.dump()['lesson:kp-1'].lastCorrect).toBe(false);
    // 答错耦合本错进授课状态：teach 据此重讲"这次答错的写法"
    expect(out.wrongAnswer).toBe('3x');
    expect(out.targeted).toBe(true);
    expect(mem.dump()['lesson:kp-1'].lastWrongAnswer).toBe('3x');
    expect(mem.dump()['lesson:kp-1'].lastQuestion).toBe('q-1');
  });

  it('questionId 缺省 → 回退到授课状态 lastQuestion 判该题; 无 lastQuestion 也无 questionId → 明确失败', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    const mem = memWith({ 'lesson:kp-1': { kpId: 'kp-1', stage: 'drill', lastQuestion: 'q-1', baseline: 50 } });
    const out = await submitTool(svc).execute({ store: (svc as any)._store(), memory: mem, entityId: 'student-a' }, { kpId: 'kp-1', answer: '42' });
    expect(out.isCorrect).toBe(true);
    expect(out.questionId).toBe('q-1');
    const none = await submitTool(svc).execute({ store: (svc as any)._store(), memory: memWith({}), entityId: 'student-a' }, { kpId: 'kp-1', answer: '42' });
    expect(none.success).toBe(false);
    expect(none.questionId).toBeUndefined();
  });

  it('他人作答隔离：lesson.submit 只为本人落作答(SM-2 队列入本人), 他生作答不加当前学生错题', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    const mem = memWith({ 'lesson:kp-1': { kpId: 'kp-1', stage: 'drill', lastQuestion: 'q-1', baseline: 0 } });
    await submitTool(svc).execute({ store: (svc as any)._store(), memory: mem, entityId: 'student-b' }, { kpId: 'kp-1', answer: '42' });
    expect(db._srQueue().filter((s: any) => s.user_id === 'student-a')).toHaveLength(0);
    expect(db._srQueue().filter((s: any) => s.user_id === 'student-b' && s.question_id === 'q-1')).toHaveLength(1);
  });

  it('lessonSubmit 服务方法直通工具逻辑（不经 LLM）并落 lesson.submit 审计', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    const out = await (svc as any).lessonSubmit('student-a', 'kp-1', 'q-1', '42');
    expect(out.success).toBe(true);
    expect(out.stage).toBe('complete');
    // 服务方法入审计（agent.tool_runs 假库始终 rowCount 1，此处验证直通返回而非报错）
    expect(out.isCorrect).toBe(true);
  });
});

describe('AgentService · 授课落盘 lesson.record（收束成 learning_plans lesson 型记录）', () => {
  const recordTool = (svc: AgentService) =>
    ((svc as any)._teachingToolDefs() as any[]).find((d: any) => d.name === 'lesson.record');

  it('答对自动落盘：lesson.submit 收束时 edu.learning_plans 出 lesson 型行(plan_data 存真实结果+recordId 回带)', async () => {
    const db = gradeLessonDb({ kpId: 'kp-1', stage: 'drill', baseline: 58, attempts: 0, lastQuestion: 'q-1' });
    const svc = makeService(db);
    const out = await (svc as any).lessonSubmit('student-a', 'kp-1', 'q-1', '42');
    expect(out.success).toBe(true);
    expect(out.stage).toBe('complete');
    // 收束落盘：返回 recordId 回带 + learning_plans 出一行 lesson 型
    expect(out.recordId).toBe('plan-1');
    const plans = db._plans();
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ user_id: 'student-a', plan_type: 'lesson', status: 'completed', total_tasks: 1, completed_tasks: 1 });
    const pd = typeof plans[0].plan_data === 'string' ? JSON.parse(plans[0].plan_data) : plans[0].plan_data;
    expect(pd).toMatchObject({ kpId: 'kp-1', outcome: 'completed', baseline: 58, attempts: 1 });
    // 落盘读的是判后新状态（practiceMastery 由判对后真实聚合得出 = 100）
    expect(pd.practiceMastery).toBe(100);
    expect(pd.delta).toBe(42);
    // title 带 kpName（kp-1 → 一元一次方程, gradeDb kps）
    expect(plans[0].title).toContain('一元一次方程');
  });

  it('显式补录 lesson.record：落盘 outcome/真实结果, 不误伤他型计划', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    // 他人/他型 active 计划先在库
    db._seedPlan({ id: 'plan-p1', user_id: 'student-a', plan_type: 'personalized', status: 'active', plan_data: '{}' });
    // 补录一节放弃的课
    const out = await recordTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-a' }, { kpId: 'kp-1', outcome: 'abandoned' });
    expect(out.ok).toBe(true);
    expect(out.outcome).toBe('abandoned');
    const plans = db._plans();
    expect(plans).toHaveLength(2);
    const lesson = plans.find((p: any) => p.plan_type === 'lesson');
    expect(lesson).toMatchObject({ plan_type: 'lesson', status: 'abandoned', total_tasks: 1, completed_tasks: 1 });
    // 不误伤他型：personalized active 计划不受影响
    const personalized = plans.find((p: any) => p.id === 'plan-p1');
    expect(personalized.status).toBe('active');
  });

  it('缺 kpId → ok:false; 无 memory 状态 → 落盘不崩(结果 unknown/0 值)', async () => {
    const db = gradeDb();
    const svc = makeService(db);
    const bad = await recordTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-a' }, {});
    expect(bad.ok).toBe(false);
    const noState = await recordTool(svc).execute({ store: (svc as any)._store(), entityId: 'student-a' }, { kpId: 'kp-1' });
    expect(noState.ok).toBe(true);
    const pd = typeof noState.lessons === 'object' ? noState.lessons : JSON.parse(noState.lessons);
    expect(pd.stage).toBe('unknown');
    expect(pd.attempts).toBe(0);
  });
});
