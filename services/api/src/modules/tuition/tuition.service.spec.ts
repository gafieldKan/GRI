import { NotFoundException } from '@nestjs/common';
import { TuitionService } from './tuition.service';
import { DatabaseService } from '../../database/database.service';

// @gri/agent-core 是 ESM，jest 不解析；本 spec 不注入 db → router 为 null，给最小桩即可。
jest.mock('@gri/agent-core', () => ({ ModelRouter: class {}, storeFrom: (q: unknown) => q }));

/**
 * tuition.service 门面回归：锁两个 M5 前端 E2E 踩出的真 bug 及服务级所有权旁路——
 *  1) 题库 subject 过滤必须 JOIN edu.knowledge_points（edu.questions 无 subject 列，直接过滤会
 *     "column subject does not exist" 500，且是公开路由→访客也炸）；
 *  2) user_preferences 更新走 camelCase→snake_case 白名单（旧实现把 body 键直接当列名：
 *     dailyGoal→dailygoal 列不存在→500，且未知键会被插进 SQL 列名）；
 *  3) 错题复习越权：别人的错题 id → 404（服务级所有权旁路，防 IDOR）。
 */
type HasQuery = { query: jest.Mock };

function makeDb(query: jest.Mock): DatabaseService {
  return { query } as unknown as DatabaseService;
}

function mockQueries(db: DatabaseService, rules: Array<[RegExp, unknown[]]>) {
  (db.query as jest.Mock).mockImplementation((sql: string) => {
    for (const [re, rows] of rules) {
      if (re.test(sql)) return Promise.resolve({ rows } as any);
    }
    return Promise.resolve({ rows: [] } as any);
  });
}

function makeService(db: DatabaseService, opts?: { resolveKp?: (id: string) => Promise<string | null>; wrongOwned?: boolean }) {
  const questionService = {
    resolveKnowledgePointId: opts?.resolveKp ?? (async () => null),
    getDiagnosisQuestions: async () => [],
    getQuizQuestions: async () => [],
  };
  const svc = new TuitionService(
    db,
    { pipeline: jest.fn() } as any,
    { createSession: jest.fn(), loadSession: jest.fn(), flush: jest.fn() } as any,
    questionService as any,
    { generateQuestions: jest.fn() } as any,
    { generatePlan: jest.fn(), updateProgress: jest.fn() } as any,
    { updateSRQueue: jest.fn() } as any,
    { decide: async () => null } as any, // TutorSessionAgent 默认降级（走 FSM fallback）
  );
  return svc;
}

describe('TuitionService（M5 前端面门面回归）', () => {
  it('getQuestionBank：subject 过滤 JOIN 到 kp.subject（edu.questions 无 subject 列）', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/JOIN edu\.knowledge_points kp/, [{ id: 'q1', content: '3-4-?' }]]]);
    const svc = makeService(db);

    const rows = await svc.getQuestionBank({ subject: 'math', limit: 5 });

    expect((db.query as jest.Mock).mock.calls[0][0]).toMatch(/kp\.subject = \$1/);
    expect(rows).toHaveLength(1);
  });

  it('getQuestionBank：knowledgePoint legacy 经解析成 uuid 后按 kp 过滤', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/LEFT JOIN edu\.knowledge_points kp/, []]]);
    const resolveKp = jest.fn().mockResolvedValue('bbfbb21c-0c48-4144-b148-9c4299b544f5');
    const svc = makeService(db, { resolveKp });

    await svc.getQuestionBank({ knowledgePoint: 'math_pythagorean' });

    expect(resolveKp).toHaveBeenCalledWith('math_pythagorean');
    const sql = (db.query as jest.Mock).mock.calls[0][0];
    expect(sql).toMatch(/q\.knowledge_point_id = \$\d+/);
  });

  it('getQuestionBank：空/缺省 knowledgePoint 不触发 legacy 解析、不炸', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/LEFT JOIN edu\.knowledge_points kp/, []]]);
    // resolveKp 若是 '' 会抛——断言根本没被调用
    const resolveKp = jest.fn(() => { throw new Error('should not be called'); });
    const svc = makeService(db, { resolveKp });

    await expect(svc.getQuestionBank({ subject: 'math' })).resolves.toEqual([]);
    expect(resolveKp).not.toHaveBeenCalled();
  });

  it('updateUserPreferences：camelCase 键→snake_case 列写入，数组/布尔/数值均落库', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, []);
    const svc = makeService(db);

    const r = await svc.updateUserPreferences('u1', {
      dailyGoal: 20, soundEnabled: false, preferredSubjects: ['math'],
    });

    expect(r.success).toBe(true);
    const [sql, params] = (db.query as jest.Mock).mock.calls[0];
    expect(sql).toMatch(/INSERT INTO edu\.user_preferences/);
    // 全 snake_case 列，顺序无关；绝无 camelCase 键被当列名
    expect(sql).toMatch(/daily_goal/);
    expect(sql).toMatch(/sound_enabled/);
    expect(sql).toMatch(/preferred_subjects/);
    expect(sql).not.toMatch(/dailyGoal|soundEnabled|preferredSubjects/);
    expect(params).toContain(20);
    expect(params).toContain(false);
  });

  it('updateUserPreferences：未知键一律忽略，不落库不 500（杜绝 body 键当列名注入）', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, []);
    const svc = makeService(db);

    const r = await svc.updateUserPreferences('u1', { role: 'admin', foo: 1 });

    expect(r.success).toBe(true);
    expect(db.query).not.toHaveBeenCalledWith(expect.stringContaining('role')) as any;
  });

  it('reviewWrongQuestion：他人错题 id → 404（服务级所有权旁路，防 IDOR）', async () => {
    const db = makeDb(jest.fn());
    // SELECT 错题按 (id, user_id) 查——他人 id 查不到 → 0 行
    mockQueries(db, [
      [/SELECT question_id FROM edu\.wrong_questions WHERE id = \$1 AND user_id = \$2/, []],
    ]);
    const svc = makeService(db);

    await expect(svc.reviewWrongQuestion('alice', '92950cf8-4c40-444f-8d6e-2b9c2fd7f0f9', 0.95))
      .rejects
      .toThrow(NotFoundException);
  });

  it('reviewWrongQuestion：本主错题复习 → 更新状态并推进 SM-2 队列', async () => {
    const db = makeDb(jest.fn());
    const updateSRQueue = jest.fn().mockResolvedValue({});
    const rows = [{ question_id: 'e0000000-0000-0000-0000-000000000001' }];
    mockQueries(db, [
      [/SELECT question_id FROM edu\.wrong_questions WHERE id = \$1 AND user_id = \$2/, rows],
      [/UPDATE edu\.wrong_questions[\s\S]*SET reviewed/, [{ id: 'w1' }]],
    ]);
    const questionService = {
      resolveKnowledgePointId: async () => null,
      getDiagnosisQuestions: async () => [],
      getQuizQuestions: async () => [],
    };
    const svc = new TuitionService(
      db,
      { pipeline: jest.fn() } as any,
      { createSession: jest.fn(), loadSession: jest.fn(), flush: jest.fn() } as any,
      questionService as any,
      { generateQuestions: jest.fn() } as any,
      { generatePlan: jest.fn(), updateProgress: jest.fn() } as any,
      { updateSRQueue } as any,
      { decide: async () => null } as any,
    );

    const r = await svc.reviewWrongQuestion('alice', 'w1', 0.95, 'mastered');

    expect(r.success).toBe(true);
    expect(updateSRQueue).toHaveBeenCalledWith('alice', 'e0000000-0000-0000-0000-000000000001', 0.95);
  });

  it('getQuestionBank：chapterId 过滤落到 kp.chapter_id（练习中心「主题」= 教材章节）', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/LEFT JOIN edu\.knowledge_points kp/, []]]);
    const svc = makeService(db);

    await svc.getQuestionBank({ subject: 'math', chapterId: 'c0000000-0000-0000-0000-000000000001', limit: 5 });

    const [sql, params] = (db.query as jest.Mock).mock.calls[0];
    expect(sql).toMatch(/kp\.chapter_id = \$\d+/);
    expect(params).toContain('c0000000-0000-0000-0000-000000000001');
  });

  it('startPracticeSession：落 practice_sessions 行（mode/subject/topicId/questions）并回带 uuid', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/INSERT INTO edu\.practice_sessions/, [{ id: 's0000000-0000-0000-0000-000000000001', status: 'in_progress' }]]]);
    const svc = makeService(db);

    const row = await svc.startPracticeSession('alice', {
      mode: 'quick', subject: 'math', topicId: 'c0000000-0000-0000-0000-000000000001', questions: [{ id: 'q1' }],
    });

    const [sql, params] = (db.query as jest.Mock).mock.calls[0];
    expect(sql).toMatch(/INSERT INTO edu\.practice_sessions/);
    expect(params[0]).toBe('alice');
    expect(params[1]).toBe('quick');
    expect(params[2]).toBe('math');
    expect(params[3]).toBe('c0000000-0000-0000-0000-000000000001');
    expect(row.id).toBe('s0000000-0000-0000-0000-000000000001');
  });

  it('completePracticeSession：落 answers/stats/duration 并标记 completed', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/UPDATE edu\.practice_sessions/, [{ id: 's1', status: 'completed' }]]]);
    const svc = makeService(db);

    const row = await svc.completePracticeSession('alice', 's1', {
      answers: [{ questionId: 'q1', isCorrect: true }],
      stats: { correct: 1, total: 1, accuracy: 100 },
      duration: 42,
    });

    const [sql, params] = (db.query as jest.Mock).mock.calls[0];
    expect(sql).toMatch(/answers = COALESCE\(\$3::jsonb/);
    expect(sql).toMatch(/stats = COALESCE\(\$4::jsonb/);
    expect(params[4]).toBe(42);
    expect(row.status).toBe('completed');
  });

  it('completePracticeSession：会话不存在 → 404', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/UPDATE edu\.practice_sessions/, []]]);
    const svc = makeService(db);

    await expect(svc.completePracticeSession('alice', 'nope', { stats: {} }))
      .rejects
      .toThrow(NotFoundException);
  });

  it('getWeaknessQuestions：未解决错题 JOIN 题库出完整题面', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/FROM edu\.wrong_questions wq/, [{ id: 'q1', content: '题', options: ['a', 'b'], answer: 'A' }]]]);
    const svc = makeService(db);

    const rows = await svc.getWeaknessQuestions('alice', 10);

    const [sql, params] = (db.query as jest.Mock).mock.calls[0];
    expect(sql).toMatch(/JOIN edu\.questions q ON q\.id = wq\.question_id/);
    expect(sql).toMatch(/wq\.is_resolved = false/);
    expect(params[0]).toBe('alice');
    expect(rows).toHaveLength(1);
  });
});