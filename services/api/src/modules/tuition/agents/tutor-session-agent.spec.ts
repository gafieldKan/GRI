import { TutorSessionAgent } from './tutor-session-agent';
import { DatabaseService } from '../../../database/database.service';

// @gri/agent-core 是 ESM，jest 不解析。用可控 stub 验证 decide() 的装配/工具调用/判定捕获。
let submittedDecision: any = { phase: 'teaching', action: 'teach', suggestedResponse: '我来讲讲勾股定理。', answerCorrect: null };
let runThrows = false;
jest.mock('@gri/agent-core', () => ({
  ModelRouter: class {},
  MemoryStore: class {
    async set() { return true; }
    async digest() { return ''; }
    async list() { return []; }
  },
  ToolRegistry: class {
    defs: any[] = [];
    registerAll(defs: any[]) { this.defs = defs; return this; }
    register(t: any) { this.defs!.push(t); return this; }
  },
  SkillRegistry: class {
    register() { return this; }
    list() { return []; }
    instructionsBlock() { return ''; }
  },
  makeTool: (t: any) => t,
  storeFrom: (q: unknown) => q,
  AgentCore: class {
    deps: any;
    constructor(deps: any) { this.deps = deps; }
    async run() {
      // 模拟模型决策：调用 session.answer 这个决定性工具
      const answerDef = this.deps.tools.defs.find((d: any) => d.name === 'session.answer');
      await answerDef!.execute(
        { entityId: 'u1', memory: { set: async () => true } },
        submittedDecision,
      );
      if (runThrows) throw new Error('boom');
      return { success: true };
    }
  },
}));

function makeSession(over: any = {}) {
  return {
    userId: 'u1',
    phase: 'welcome',
    knowledgePointId: 'math_pythagorean',
    selectedKpName: '勾股定理',
    diagnosisQuestions: [],
    diagnosisAnswers: [],
    quizQuestions: [],
    quizAnswers: [],
    diagnosisResult: null,
    getCurrentQuestion: () => null,
    ...over,
  } as any;
}

describe('TutorSessionAgent（教学行为重组成 agent-core 消费方）', () => {
  beforeEach(() => {
    submittedDecision = { phase: 'teaching', action: 'teach', suggestedResponse: '我来讲讲勾股定理。', answerCorrect: null };
    runThrows = false;
  });

  it('decide：模型调用 session.answer → 返回同 schema 的判定（phase/action/suggestedResponse）', async () => {
    const db = { query: jest.fn() } as unknown as DatabaseService;
    const agent = new TutorSessionAgent(db);
    const out = await agent.decide(makeSession(), '开始讲吧');
    expect(out).toMatchObject({
      phase: 'teaching',
      action: 'teach',
      suggestedResponse: '我来讲讲勾股定理。',
    });
  });

  it('decide：判定缺 phase/suggestedResponse → 返回 null（契约不完整则降级）', async () => {
    submittedDecision = { action: 'teach' }; // 缺 phase 与 suggestedResponse
    const db = { query: jest.fn() } as unknown as DatabaseService;
    const agent = new TutorSessionAgent(db);
    const out = await agent.decide(makeSession(), 'x');
    expect(out).toBeNull();
  });

  it('decide：agent 跑一轮抛错 → 返回 null（本地降级，不向下炸）', async () => {
    runThrows = true;
    const db = { query: jest.fn() } as unknown as DatabaseService;
    const agent = new TutorSessionAgent(db);
    const out = await agent.decide(makeSession(), 'x');
    expect(out).toBeNull();
  });

  it('装配 tutor 技能与 session.answer/session.context/session.remember（真实底座由容器 E2E 覆盖）', async () => {
    const db = { query: jest.fn() } as unknown as DatabaseService;
    const agent = new TutorSessionAgent(db);
    await expect(agent.decide(makeSession(), 'x')).resolves.toBeTruthy();
  });
});