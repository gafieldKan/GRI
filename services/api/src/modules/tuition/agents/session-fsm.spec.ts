import { NotFoundException } from '@nestjs/common';
import { SessionFsm, SessionFsmService } from './session-fsm';
import type { LlmClient } from '@gri/agent-core';
import { TuitionQuestionService } from './question.service';
import { DatabaseService } from '../../../database/database.service';

// @gri/agent-core 是 ESM，jest 不解析；测试注入最小 LlmClient 替身即可。
jest.mock('@gri/agent-core', () => ({ ModelRouter: class {}, storeFrom: (q: unknown) => q, LlmClient: class {} }));

/** 构造无真实 LLM 的 FSM（isRealKey=false → `_generateTeachingResponse` 返回 null → 本地降级路径） */
function makeFsm(questionService: Partial<TuitionQuestionService>) {
  const llm = {
    isRealKey: jest.fn().mockResolvedValue(false),
    validateAnswer: jest.fn(),
  } as unknown as LlmClient;
  const flush = jest.fn().mockResolvedValue(undefined);
  const fsm = new SessionFsm('s1', 'u1', 'math_pythagorean', llm, questionService as TuitionQuestionService, flush, '勾股定理');
  // 直接构造不经过 createSession → 手动装题库（与持久化门面行为一致）
  fsm.diagnosisQuestions = [...DIAG_QS];
  fsm.quizQuestions = [...QUIZ_QS];
  return { fsm, llm, flush };
}

/** 假题库 */
const DIAG_QS = [
  { id: 'd1', content: '3-4-?', type: 'fill', answer: '5', options: [], difficulty: 'easy' },
  { id: 'd2', content: '5-12-?', type: 'fill', answer: '13', options: [], difficulty: 'medium' },
];
const QUIZ_QS = [
  { id: 'q1', content: 'quad 1', type: 'fill', answer: 'x', options: [], difficulty: 'medium' },
];
const qSvc = {
  getDiagnosisQuestions: jest.fn().mockResolvedValue(DIAG_QS),
  getQuizQuestions: jest.fn().mockResolvedValue(QUIZ_QS),
  resolveKnowledgePointId: jest.fn(async (kpId: string) => (kpId === 'math_pythagorean' ? 'kp-uuid' : null)),
} as unknown as TuitionQuestionService;

describe('SessionFsm 状态迁移（本地降级 _fallback）', () => {
  it('welcome → diagnosis：首条非答案消息自动进诊断并推题', async () => {
    const { fsm } = makeFsm(qSvc);
    const res = await fsm.handleUserMessage('我们开始吧');
    expect(res.state).toBe('diagnosis');
    expect(res.phase).toBe('diagnosis');
    expect(res.questions?.length).toBeGreaterThan(0);
  });

  it('diagnosis 答题全对 → teaching（诊断得分回填 diagnosisResult）', async () => {
    const { fsm, llm } = makeFsm(qSvc);
    (llm.validateAnswer as jest.Mock)
      .mockReturnValue({ correct: true, explanation: '正确！' })
      .mockReturnValueOnce({ correct: true, explanation: '正确！' })
      .mockReturnValueOnce({ correct: true, explanation: '正确！' });

    await fsm.handleUserMessage('我们开始吧'); // welcome→diagnosis
    await fsm.handleUserMessage('答案是5'); // 答对 d1
    const secondAnswer = await fsm.handleUserMessage('答案是13'); // 答对 d2 → teaching
    expect(secondAnswer.phase).toBe('teaching');
    expect(fsm.diagnosisResult).toMatchObject({ correctCount: 2, total: 2 });
  });

  it('teaching 确认理解 → quizzing（推测验题）', async () => {
    const { fsm } = makeFsm(qSvc);
    // 直接从 teaching 态装配
    fsm.phase = 'teaching';
    const res = await fsm.handleUserMessage('我理解了');
    expect(res.phase).toBe('quizzing');
    expect(res.questions?.length).toBeGreaterThan(0);
  });

  it('quizzing 答完最后一题 → done（回填 quizResult）', async () => {
    const { fsm, llm } = makeFsm(qSvc);
    (llm.validateAnswer as jest.Mock).mockReturnValue({ correct: true, explanation: '正确！' });
    fsm.phase = 'quizzing';
    const res = await fsm.handleUserMessage('答案是x');
    expect(res.phase).toBe('done');
    expect(fsm.quizResult).toMatchObject({ correctCount: 1, total: 1 });
  });

  it('diagnosis 阶段说“直接教学”→ 跳过诊断到 teaching', async () => {
    const { fsm } = makeFsm(qSvc);
    fsm.phase = 'diagnosis';
    const res = await fsm.handleUserMessage('直接教学吧');
    expect(res.phase).toBe('teaching');
  });

  it('TutorSessionAgent 注入的判定 welcome→diagnosis 并推题（agent 驱动路径）', async () => {
    const { fsm } = makeFsm(qSvc);
    // 与 tuition.service 一致：decide() 求出判定后作为 overrideDecision 传入
    const decision = {
      phase: 'diagnosis', action: 'ask_question', answerCorrect: null,
      suggestedResponse: '让我给你来几道诊断题。', analysis: '进入诊断',
    };
    const res = await fsm.handleUserMessage('我们开始吧', decision);
    expect(res.phase).toBe('diagnosis');
    expect(res.message).toBe('让我给你来几道诊断题。');
    expect(res.questions?.length).toBeGreaterThan(0);
    expect(fsm.phase).toBe('diagnosis');
  });

  it('注入判定为 null（无 key）→ 等价未注入，走本地降级', async () => {
    const { fsm } = makeFsm(qSvc);
    const res = await fsm.handleUserMessage('我们开始吧', null as any);
    expect(res.phase).toBe('diagnosis'); // welcome → 诊断
  });

  it('旧路径（未注入 overrideDecision）：内部 `_generateTeachingResponse` 走底座 LLM 并应用判定', async () => {
    const flush = jest.fn().mockResolvedValue(undefined);
    const llm = {
      isRealKey: jest.fn().mockResolvedValue(true),
      chat: jest.fn().mockResolvedValue({
        content: JSON.stringify({ phase: 'diagnosis', action: 'ask_question', suggestedResponse: '先来道诊断题。', analysis: '进入诊断' }),
      }),
      parseJSON: (s: string) => JSON.parse(s),
      validateAnswer: jest.fn(),
    } as unknown as LlmClient;
    const fsm = new SessionFsm('s1', 'u1', 'math_pythagorean', llm, qSvc as TuitionQuestionService, flush, '勾股定理');
    fsm.diagnosisQuestions = [...DIAG_QS];
    fsm.quizQuestions = [...QUIZ_QS];
    const res = await fsm.handleUserMessage('我们开始吧'); // 不传 overrideDecision → 旧路径
    expect(res.phase).toBe('diagnosis');
    expect(res.message).toBe('先来道诊断题。'); // 判定来自底座 LLM（非本地降级）
    expect(llm.chat as jest.Mock).toHaveBeenCalledTimes(1);
    expect(res.questions?.length).toBeGreaterThan(0);
  });

  it('flush 在每次 handleUserMessage 后调用（持久化）', async () => {
    const { fsm, flush } = makeFsm(qSvc);
    await fsm.handleUserMessage('我们开始吧');
    expect(flush).toHaveBeenCalled();
  });
});

describe('SessionFsmService（持久化 / 所有权）', () => {
  it('createSession 建行 + 装载题库', async () => {
    const db = { query: jest.fn() } as unknown as DatabaseService;
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ name: '勾股定理' }] }) // _kpName
      .mockResolvedValueOnce({ rows: [{ session_id: 'sess1' }] }) // INSERT sessions
      .mockResolvedValueOnce({ rows: [] }); // flush
    const svc = new SessionFsmService(db, {} as LlmClient, qSvc);
    const fsm = await svc.createSession('u1', 'math_pythagorean');
    expect(fsm.sessionId).toBe('sess1');
    expect(fsm.userId).toBe('u1');
    expect(fsm.diagnosisQuestions.length).toBe(2);
  });

  it('loadSession 他人/不存在会话 → NotFound', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) } as unknown as DatabaseService;
    const svc = new SessionFsmService(db, {} as LlmClient, qSvc);
    await expect(svc.loadSession('u2', 'sess1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('loadSession 本人会话 → 按行重建并组装题库', async () => {
    const db = { query: jest.fn() } as unknown as DatabaseService;
    (db.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{ id: 'sess1', user_id: 'u1', phase: 'teaching', status: 'active', session_data: { phase: 'teaching', knowledgePointId: 'math_pythagorean', selectedKpName: '勾股定理' } }],
      })
      .mockResolvedValueOnce({ rows: [] }); // flush
    const svc = new SessionFsmService(db, {} as LlmClient, qSvc);
    const fsm = await svc.loadSession('u1', 'sess1');
    expect(fsm.phase).toBe('teaching');
  });
});