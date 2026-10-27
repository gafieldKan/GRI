import { TutorAgent } from './tutor-agent';
import type { DatabaseService } from '../../../database/database.service';
import type { LlmClient } from '@gri/agent-core';

// TutorAgent 值导入 LlmClient，间接加载 ESM 包 @gri/agent-core。
jest.mock('@gri/agent-core', () => ({ ModelRouter: class {}, storeFrom: (q: unknown) => q, LlmClient: class {} }));

function makeAgent() {
  const db = { query: jest.fn() } as unknown as DatabaseService;
  const llm = { isRealKey: jest.fn().mockReturnValue(false) } as unknown as LlmClient;
  return new TutorAgent(db, llm);
}

describe('TutorAgent —— question_type 词汇归一', () => {
  it.each([
    ['single_choice', 'choice', 'A', 'A'],
    ['multiple_choice', 'choice', 'A', 'A'],
    ['fill_blank', 'fill', '100', '100.5'],
    ['solution', 'solution', 'x=1', 'x=1'],
  ] as const)(
    '%s 归一到 TutorAgent 的 %s 消费键',
    (type, normalizedType, correctAnswer, studentAnswer) => {
      const agent = makeAgent();
      const question = { id: 'q1', type, answer: correctAnswer };

      const analysis = (agent as any)._analyzeAnswers([question], [studentAnswer]);

      expect(analysis.byType[normalizedType].total).toBe(1);
      expect(analysis.byType[normalizedType].correct).toBe(1);
      expect(analysis.details[0].isCorrect).toBe(true);
    },
  );

  it('unknown 类型仍计入总分但不臆造 byType 分桶', () => {
    const agent = makeAgent();

    const analysis = (agent as any)._analyzeAnswers(
      [{ id: 'q1', type: 'unknown_type', answer: 'x' }],
      ['x'],
    );

    expect(analysis.correct).toBe(1);
    expect(analysis.byType).not.toHaveProperty('unknown_type');
  });
});
