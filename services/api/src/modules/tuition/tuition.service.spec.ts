import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { TuitionService } from './tuition.service';
import { TuitionController } from './tuition.controller';
import { SpacedRepetitionService } from './agents/spaced-repetition.service';
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

function makeService(db: DatabaseService, opts?: { resolveKp?: (id: string) => Promise<string | null>; wrongOwned?: boolean; sr?: unknown }) {
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
    (opts?.sr ?? { updateSRQueue: jest.fn() }) as any,
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

  it('reviewWrongQuestion：AI 去规范行（question_id 为 NULL）→ 仍成功标记已复习、跳过 SR（非 404）', async () => {
    // migration 006 起 edu.wrong_questions.question_id 可空（AI 去规范行：无题号、只有 question_text）。
    // 旧实现「有行即 200」——本用例守着「行存在」而非「题号非空」的判据（防回归成 404）。
    const db = makeDb(jest.fn());
    const updateSRQueue = jest.fn().mockResolvedValue({});
    mockQueries(db, [
      [/SELECT question_id FROM edu\.wrong_questions WHERE id = \$1 AND user_id = \$2/, [{ question_id: null }]],
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
    expect(updateSRQueue).not.toHaveBeenCalled(); // 无题号 → 不进 SR 队列
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
  // ===================== P2-T5：会话级进度/分析闭环 =====================
  const SESSION = 'a0000000-0000-0000-0000-000000000001';
  const QUESTION = 'e0000000-0000-0000-0000-000000000001';
  const ownSession = (questions: unknown = [{ id: QUESTION }]) => [{ id: SESSION, user_id: 'alice', status: 'in_progress', questions }];
  const q1 = { id: QUESTION, answer: 'A', type: 'single_choice', difficulty: 'medium' };

  it('submitPracticeAnswer：带 sessionId → answer_records 落真实 session_id（非 NULL）', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [
      [/FROM edu\.practice_sessions WHERE id = \$1/, ownSession()],
      [/FROM edu\.questions WHERE id = \$1/, [q1]],
      [/INSERT INTO edu\.answer_records/, []],
    ]);
    const svc = makeService(db);

    const r = await svc.submitPracticeAnswer('alice', { questionId: QUESTION, answer: 'A', sessionId: SESSION });

    const insert = (db.query as jest.Mock).mock.calls.find((c) => /INSERT INTO edu\.answer_records/.test(c[0]));
    expect(insert[1][2]).toBe(SESSION);
    expect(insert[1][2]).not.toBeNull();
    expect(r.correct).toBe(true);
  });

  it('submitPracticeAnswer：缺省 sessionId → session_id 存 NULL（向后兼容旧调用方）', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [
      [/FROM edu\.questions WHERE id = \$1/, [q1]],
      [/INSERT INTO edu\.answer_records/, []],
    ]);
    const svc = makeService(db);

    await svc.submitPracticeAnswer('alice', { questionId: QUESTION, answer: 'A' });

    const insert = (db.query as jest.Mock).mock.calls.find((c) => /INSERT INTO edu\.answer_records/.test(c[0]));
    expect(insert[1][2]).toBeNull();
    const touchedSession = (db.query as jest.Mock).mock.calls.some((c) => /edu\.practice_sessions/.test(c[0]));
    expect(touchedSession).toBe(false);
  });

  it('submitPracticeAnswer：sessionId 属他人 → 403 且不写记录（防跨用户串写）', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/FROM edu\.practice_sessions WHERE id = \$1/, [{ id: SESSION, user_id: 'bob' }]]]);
    const svc = makeService(db);

    await expect(svc.submitPracticeAnswer('alice', { questionId: QUESTION, answer: 'A', sessionId: SESSION }))
      .rejects.toThrow(ForbiddenException);
    expect((db.query as jest.Mock).mock.calls.some((c) => /INSERT INTO edu\.answer_records/.test(c[0]))).toBe(false);
  });

  it('submitPracticeAnswer：sessionId 不存在（有效 UUID）→ 404', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/FROM edu\.practice_sessions WHERE id = \$1/, []]]);
    const svc = makeService(db);

    await expect(svc.submitPracticeAnswer('alice', { questionId: QUESTION, answer: 'A', sessionId: SESSION }))
      .rejects.toThrow(NotFoundException);
  });

  it('submitPracticeAnswer：malformed sessionId → 404 且根本不查库', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, []);
    const svc = makeService(db);

    await expect(svc.submitPracticeAnswer('alice', { questionId: QUESTION, answer: 'A', sessionId: 'not-a-uuid' }))
      .rejects.toThrow(NotFoundException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('getSessionProgress：返回 answered/total/correctCount/correctRate/currentIndex', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [
      [/FROM edu\.practice_sessions WHERE id = \$1/, ownSession([{ id: 'x1' }, { id: 'x2' }, { id: 'x3' }])],
      [/FROM edu\.answer_records WHERE session_id = \$1 AND user_id = \$2/, [{ answered: 3, correct: 2 }]],
    ]);
    const svc = makeService(db);

    const p = await svc.getSessionProgress('alice', SESSION);

    expect(p).toEqual({
      sessionId: SESSION, answered: 3, total: 3, correctCount: 2,
      correctRate: 2 / 3, currentIndex: 3, status: 'in_progress',
    });
  });

  it('getSessionProgress：无题面快照时 total 回退为已答数；correctRate∈[0,1]', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [
      [/FROM edu\.practice_sessions WHERE id = \$1/, ownSession(null)],
      [/FROM edu\.answer_records WHERE session_id = \$1 AND user_id = \$2/, [{ answered: 2, correct: 0 }]],
    ]);
    const svc = makeService(db);

    const p = await svc.getSessionProgress('alice', SESSION);

    expect(p.total).toBe(2);
    expect(p.correctRate).toBe(0);
    expect(p.correctRate).toBeGreaterThanOrEqual(0);
    expect(p.correctRate).toBeLessThanOrEqual(1);
  });

  it('getSessionProgress：他人会话 → 403', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/FROM edu\.practice_sessions WHERE id = \$1/, [{ id: SESSION, user_id: 'bob' }]]]);
    const svc = makeService(db);

    await expect(svc.getSessionProgress('alice', SESSION)).rejects.toThrow(ForbiddenException);
  });

  it('getSessionProgress：无效 sessionId → 404（不触发聚合查询）', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/FROM edu\.practice_sessions WHERE id = \$1/, []]]);
    const svc = makeService(db);

    await expect(svc.getSessionProgress('alice', SESSION)).rejects.toThrow(NotFoundException);
  });

  it('getSessionAnalysis：逐题解析 + 按 knowledge_point_id 聚合正确率', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [
      [/FROM edu\.practice_sessions WHERE id = \$1/, ownSession()],
      [/FROM edu\.answer_records ar/, [
        { question_id: 'q1', student_answer: 'A', is_correct: true, time_spent_ms: 1000, content: 'c1', answer: 'A', analysis: 'a1', type: 'single_choice', options: ['A', 'B'], content_latex: null, answer_latex: null, difficulty: 0.5, knowledge_point_id: 'kp1', knowledge_point_name: '勾股定理' },
        { question_id: 'q2', student_answer: 'C', is_correct: false, time_spent_ms: 2000, content: 'c2', answer: 'B', analysis: 'a2', type: 'single_choice', options: ['A', 'B'], content_latex: null, answer_latex: null, difficulty: 0.3, knowledge_point_id: 'kp1', knowledge_point_name: '勾股定理' },
        { question_id: 'q3', student_answer: 'D', is_correct: true, time_spent_ms: 1500, content: 'c3', answer: 'D', analysis: 'a3', type: null, options: null, content_latex: 'x^2', answer_latex: 'y', difficulty: 0.8, knowledge_point_id: null, knowledge_point_name: null },
      ]],
    ]);
    const svc = makeService(db);

    const a = await svc.getSessionAnalysis('alice', SESSION);

    expect(a.answered).toBe(3);
    expect(a.correctCount).toBe(2);
    expect(a.correctRate).toBeCloseTo(2 / 3, 5);
    expect(a.items).toHaveLength(3);
    expect(a.items[0]).toMatchObject({ questionId: 'q1', analysis: 'a1', correctAnswer: 'A', isCorrect: true });
    expect(a.items[2]).toMatchObject({ contentLatex: 'x^2', answerLatex: 'y', knowledgePointId: null });
    const kp1m = a.knowledgePoints.find((k) => k.knowledgePointId === 'kp1');
    expect(kp1m).toMatchObject({ knowledgePointName: '勾股定理', answered: 2, correct: 1, correctRate: 0.5 });
    const unknown = a.knowledgePoints.find((k) => k.knowledgePointId === null);
    expect(unknown).toMatchObject({ answered: 1, correct: 1, correctRate: 1 });
  });

  it('getSessionAnalysis：他人会话 → 403 且不聚合答题明细', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/FROM edu\.practice_sessions WHERE id = \$1/, [{ id: SESSION, user_id: 'bob' }]]]);
    const svc = makeService(db);

    await expect(svc.getSessionAnalysis('alice', SESSION)).rejects.toThrow(ForbiddenException);
    expect((db.query as jest.Mock).mock.calls.some((c) => /FROM edu\.answer_records ar/.test(c[0]))).toBe(false);
  });

  it('getSessionAnalysis：无效 sessionId → 404', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/FROM edu\.practice_sessions WHERE id = \$1/, []]]);
    const svc = makeService(db);

    await expect(svc.getSessionAnalysis('alice', SESSION)).rejects.toThrow(NotFoundException);
  });

  // ===================== P2-T8：错题本 due 队列 + 复习闭环 + 统计 =====================
  const WQ_ID = 'c0000000-0000-0000-0000-000000000001';
  const QID = 'e0000000-0000-0000-0000-000000000009';
  const minsAgo = (m: number) => new Date(Date.now() - m * 60000);

  it('getDueWrongQuestions：仅取 sr_queue.next_review ≤ now，按 next_review 升序（非 wrong_questions 表）', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [
      [/FROM edu\.sr_queue sq/, [
        {
          question_id: QID, last_reviewed: minsAgo(60), interval: 0, ease_factor: 2.18, repetitions: 0,
          next_review: minsAgo(30), content: 'x+y=?', type: 'single_choice', options: ['A', 'B'], answer: 'A',
          analysis: '解析', wrong_question_id: WQ_ID, error_type: '计算错误', wrong_count: 2, subject: 'math',
          wrong_difficulty: 0.5, last_attempt_at: minsAgo(90), knowledge_point: '一元一次方程',
        },
      ]],
    ]);
    const svc = makeService(db);

    const rows = await svc.getDueWrongQuestions('alice');

    const sql = (db.query as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toMatch(/FROM edu\.sr_queue sq/);
    expect(sql).toMatch(/sq\.user_id = \$1/);
    expect(sql).toMatch(/sq\.next_review <= NOW\(\)/);
    expect(sql).toMatch(/ORDER BY sq\.next_review ASC/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: WQ_ID, questionId: QID, errorType: '计算错误', wrongCount: 2, knowledgePoint: '一元一次方程', subject: 'math',
    });
    expect(rows[0].sr.easeFactor).toBe(2.18);
    expect(rows[0].sr.nextReview).toBeInstanceOf(Date);
    expect(rows[0].overdueDays).toBe(0);
  });

  it('getDueWrongQuestions：无 SR 记录 → 空数组，不报错', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/FROM edu\.sr_queue sq/, []]]);
    const svc = makeService(db);

    await expect(svc.getDueWrongQuestions('alice')).resolves.toEqual([]);
  });

  it('getDueWrongQuestions：limit 收敛到 [1,100]，缺省 20', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/FROM edu\.sr_queue sq/, []]]);
    const svc = makeService(db);

    await svc.getDueWrongQuestions('alice');
    await svc.getDueWrongQuestions('alice', 999);
    await svc.getDueWrongQuestions('alice', 0);

    const limits = (db.query as jest.Mock).mock.calls.map((c) => c[1][1]);
    expect(limits).toEqual([20, 100, 20]);
  });

  it('getDueWrongQuestions：sr_queue 有行但无错题行 → id=null，错误元数据缺省', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/FROM edu\.sr_queue sq/, [{ question_id: QID, next_review: minsAgo(1), content: 'c', answer: 'A' }]]]);
    const svc = makeService(db);

    const rows = await svc.getDueWrongQuestions('alice');

    expect(rows[0].id).toBeNull();
    expect(rows[0].errorType).toBeNull();
    expect(rows[0].wrongCount).toBe(0);
    expect(rows[0].sr.easeFactor).toBe(2.5);
  });

  it('getDueWrongQuestions：逾期卡片 overdueDays 按天向下取整', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/FROM edu\.sr_queue sq/, [{ question_id: QID, next_review: new Date(Date.now() - 3.5 * 86400000) }]]]);
    const svc = makeService(db);

    const rows = await svc.getDueWrongQuestions('alice');

    expect(rows[0].overdueDays).toBe(3);
  });

  it('getWrongQuestionStats：掌握度分布 + 高频错误 KP + 复习进度聚合', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [
      [/SELECT COUNT\(\*\)::int AS total/, [{ total: 10, unreviewed: 6, reviewing: 3, mastered: 1, reviewed: 4, resolved: 2, unresolved: 8 }]],
      [/COALESCE\(wq\.knowledge_point, kp\.name\) AS knowledge_point/, [
        { knowledge_point: '一元一次方程', wrong_count: 7, question_count: 3 },
        { knowledge_point: '勾股定理', wrong_count: 2, question_count: 1 },
        { knowledge_point: null, wrong_count: 1, question_count: 1 },
      ]],
      [/FROM edu\.sr_queue WHERE user_id = \$1/, [{ scheduled: 5, due: 4 }]],
    ]);
    const svc = makeService(db);

    const s = await svc.getWrongQuestionStats('alice');

    expect(s.studentId).toBe('alice');
    expect(s.total).toBe(10);
    expect(s.masteryBuckets).toEqual([
      { key: 'unreviewed', label: '未复习', count: 6 },
      { key: 'reviewing', label: '复习中', count: 3 },
      { key: 'mastered', label: '已掌握', count: 1 },
    ]);
    expect(s.topErrorKnowledgePoints[0]).toEqual({ knowledgePoint: '一元一次方程', wrongCount: 7, questionCount: 3 });
    expect(s.topErrorKnowledgePoints).toHaveLength(3);
    expect(s.reviewProgress).toEqual({
      total: 10, reviewed: 4, unreviewed: 6, mastered: 1, resolved: 2, unresolved: 8,
      reviewedRate: 0.4, scheduledCount: 5, dueCount: 4,
    });
  });

  it('getWrongQuestionStats：空库 → 零值且 reviewedRate=0（无除零）', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [
      [/SELECT COUNT\(\*\)::int AS total/, [{ total: 0, unreviewed: 0, reviewing: 0, mastered: 0, reviewed: 0, resolved: 0, unresolved: 0 }]],
      [/COALESCE\(wq\.knowledge_point, kp\.name\) AS knowledge_point/, []],
      [/FROM edu\.sr_queue WHERE user_id = \$1/, [{ scheduled: 0, due: 0 }]],
    ]);
    const svc = makeService(db);

    const s = await svc.getWrongQuestionStats('alice');

    expect(s.reviewProgress.reviewedRate).toBe(0);
    expect(s.topErrorKnowledgePoints).toEqual([]);
    expect(s.masteryBuckets.every((b) => b.count === 0)).toBe(true);
  });

  it('getWrongQuestionStats：按 knowledge_point 聚合并按错误次数降序（Top 5）', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/COALESCE\(wq\.knowledge_point, kp\.name\) AS knowledge_point/, []]]);
    const svc = makeService(db);

    await svc.getWrongQuestionStats('alice');

    const call = (db.query as jest.Mock).mock.calls.find((c) => /COALESCE\(wq\.knowledge_point/.test(c[0]));
    const sql = call[0] as string;
    expect(sql).toMatch(/GROUP BY COALESCE\(wq\.knowledge_point, kp\.name\)/);
    expect(sql).toMatch(/ORDER BY wrong_count DESC/);
    expect(sql).toMatch(/LIMIT 5/);
    expect(call[1][0]).toBe('alice');
  });

  it('getWrongQuestionById：返回单条详情含 SR 参数', async () => {
    const db = makeDb(jest.fn());
    const next = new Date(Date.now() + 86400000);
    mockQueries(db, [
      [/FROM edu\.wrong_questions wq/, [{
        id: WQ_ID, user_id: 'alice', question_id: QID, wrong_count: 3, last_attempt_at: minsAgo(120),
        is_resolved: false, question_text: null, question_type: null, subject: 'math',
        student_answer: 'B', correct_answer: 'A', error_type: '计算错误', difficulty: 0.5,
        mastery_level: 'mastered', reviewed: true, mastered: true, review_count: 1,
        last_reviewed_at: minsAgo(10), knowledge_point: '一元一次方程',
        content: 'x+1=2', type: 'single_choice', options: ['A', 'B'], answer: 'A', analysis: '解析',
        interval: 1, ease_factor: 2.6, repetitions: 1, next_review: next, last_reviewed: minsAgo(10),
      }]],
    ]);
    const svc = makeService(db);

    const d = await svc.getWrongQuestionById('alice', WQ_ID);

    expect(d).toMatchObject({ id: WQ_ID, questionId: QID, errorType: '计算错误', wrongCount: 3, mastered: true, knowledgePoint: '一元一次方程' });
    expect(d.sr).toMatchObject({ interval: 1, easeFactor: 2.6, repetitions: 1 });
    expect(d.sr.nextReview).toEqual(next);
  });

  it('getWrongQuestionById：不存在 → 404', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/FROM edu\.wrong_questions wq/, []]]);
    const svc = makeService(db);

    await expect(svc.getWrongQuestionById('alice', WQ_ID)).rejects.toThrow(NotFoundException);
  });

  it('getWrongQuestionById：他人错题 → 403（先取行再校验归属）', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/FROM edu\.wrong_questions wq/, [{ id: WQ_ID, user_id: 'bob', question_id: QID }]]]);
    const svc = makeService(db);

    await expect(svc.getWrongQuestionById('alice', WQ_ID)).rejects.toThrow(ForbiddenException);
  });

  it('getWrongQuestionById：无 sr_queue 行 → SR 参数缺省不炸', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [[/FROM edu\.wrong_questions wq/, [{ id: WQ_ID, user_id: 'alice', question_id: QID, wrong_count: 1 }]]]);
    const svc = makeService(db);

    const d = await svc.getWrongQuestionById('alice', WQ_ID);

    expect(d.sr).toEqual({ interval: 0, easeFactor: 2.5, repetitions: 0, nextReview: null, lastReviewed: null });
  });

  it('复习闭环：reviewWrongQuestion(0.9) 复用 SpacedRepetitionService → interval=1、EF=2.6、next_review≈+1d', async () => {
    const db = makeDb(jest.fn());
    const sr = new SpacedRepetitionService(db);
    mockQueries(db, [
      [/FROM edu\.wrong_questions WHERE id = \$1 AND user_id = \$2/, [{ question_id: QID }]],
      [/UPDATE edu\.wrong_questions/, []],
      [/SELECT ease_factor, repetitions, interval FROM edu\.sr_queue/, []],
      [/INSERT INTO edu\.sr_queue/, []],
    ]);
    const svc = makeService(db, { sr });
    const before = Date.now();

    const r = await svc.reviewWrongQuestion('alice', WQ_ID, 0.9);

    expect(r).toEqual({ success: true });
    const upsert = (db.query as jest.Mock).mock.calls.find((c) => /INSERT INTO edu\.sr_queue/.test(c[0]));
    const [uid, qid, interval, ef, reps, nextReview] = upsert[1];
    expect(uid).toBe('alice');
    expect(qid).toBe(QID);
    expect(interval).toBe(1);
    expect(ef).toBeCloseTo(2.6, 5);
    expect(reps).toBe(1);
    // 推后到 +1d → 在 due 的 `next_review <= NOW()` 条件下不再出现
    expect(nextReview.getTime()).toBeGreaterThanOrEqual(before + 86400000 - 5000);
    expect(nextReview.getTime()).toBeGreaterThan(Date.now());
  });

  it('复习闭环：reviewWrongQuestion(0.2) → SM-2 重置 interval=0、next_review≈now（立即再到期）', async () => {
    const db = makeDb(jest.fn());
    const sr = new SpacedRepetitionService(db);
    mockQueries(db, [
      [/FROM edu\.wrong_questions WHERE id = \$1 AND user_id = \$2/, [{ question_id: QID }]],
      [/UPDATE edu\.wrong_questions/, []],
      [/SELECT ease_factor, repetitions, interval FROM edu\.sr_queue/, [{ ease_factor: 2.5, repetitions: 5, interval: 100 }]],
      [/INSERT INTO edu\.sr_queue/, []],
    ]);
    const svc = makeService(db, { sr });

    await svc.reviewWrongQuestion('alice', WQ_ID, 0.2);

    const upsert = (db.query as jest.Mock).mock.calls.find((c) => /INSERT INTO edu\.sr_queue/.test(c[0]));
    expect(upsert[1][2]).toBe(0); // interval 重置
    expect(upsert[1][4]).toBe(0); // repetitions 重置
    expect(Math.abs((upsert[1][5] as Date).getTime() - Date.now())).toBeLessThan(5000);
  });

  it('路由顺序：wrong-questions/due、stats/:studentId 声明在 :id 之前（防被 :id 吞）', () => {
    const names = Object.getOwnPropertyNames(TuitionController.prototype);
    expect(names.indexOf('getDueWrongQuestions')).toBeGreaterThan(-1);
    expect(names.indexOf('getDueWrongQuestions')).toBeLessThan(names.indexOf('getWrongQuestionDetail'));
    expect(names.indexOf('getWrongQuestionStats')).toBeLessThan(names.indexOf('getWrongQuestionDetail'));
  });
});
