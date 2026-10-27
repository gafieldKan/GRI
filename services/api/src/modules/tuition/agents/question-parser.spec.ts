import { QuestionParser, DEFAULT_KNOWLEDGE_POINT } from './question-parser';
import { MOCK_OCR_TEXT } from './ocr-processor';
import type { LlmClient } from '@gri/agent-core';
import type { OcrBlock } from '../tuition.types';
// 值引入被测类会传递加载 ESM 包 @gri/agent-core —— 按既有范式 mock（同其它 tuition spec）
jest.mock("@gri/agent-core", () => ({ ModelRouter: class {}, storeFrom: (q: unknown) => q, LlmClient: class {} }));

/**
 * 结构化解析单测（P2-T7）。
 * 覆盖：单选/多选/填空/解答判别、选项抽取（同行/分行）、空白数、KP 映射（关键词 + 名录）、
 * 空/乱码输入不崩、无 key 不调 LLM、有 key 时 LLM 兜底微调。
 */

function makeLlm(opts: { real?: boolean; chat?: jest.Mock } = {}) {
  const chat = opts.chat ?? jest.fn();
  const isRealKey = jest.fn().mockReturnValue(!!opts.real);
  return {
    llm: { isRealKey, chat } as unknown as LlmClient,
    isRealKey,
    chat,
  };
}

describe('QuestionParser —— 题型判别', () => {
  it('单选题：type=single_choice + 4 选项 + 纯题干（剔除选项）+ KP 非空', async () => {
    const { llm } = makeLlm();
    const [q] = await new QuestionParser(llm).parse(
      '1. 已知直角三角形的两条直角边分别是 3 和 4，求斜边的长度。\nA. 5   B. 6   C. 7   D. 8',
      { subject: 'math' },
    );
    expect(q.type).toBe('single_choice');
    expect(q.options).toEqual(['5', '6', '7', '8']);
    expect(q.content).not.toContain('A.');
    expect(q.content).toContain('斜边');
    expect(q.knowledgePoint).toBeTruthy();
  });

  it('填空题：type=fill_blank + blanks[] 数量正确', async () => {
    const { llm } = makeLlm();
    const [q] = await new QuestionParser(llm).parse(
      '2. 若一次函数 y = kx + b 的图像经过点 (1, 2) 和 (3, 6)，则 k = ______，b = ______。',
    );
    expect(q.type).toBe('fill_blank');
    expect(q.blanks).toHaveLength(2);
    expect(q.blanks.map((b) => b.index)).toEqual([0, 1]);
  });

  it('解答题：无选项无空位 → type=solution', async () => {
    const { llm } = makeLlm();
    const [q] = await new QuestionParser(llm).parse('3. 解方程：2x + 5 = 15');
    expect(q.type).toBe('solution');
    expect(q.options).toHaveLength(0);
    expect(q.blanks).toHaveLength(0);
  });

  it('多选题：题干含「多选/不正确的是」等 → type=multiple_choice', async () => {
    const { llm } = makeLlm();
    const [q] = await new QuestionParser(llm).parse(
      '1. 下列说法不正确的是（多选）\nA. 甲   B. 乙   C. 丙   D. 丁',
    );
    expect(q.type).toBe('multiple_choice');
    expect(q.options).toHaveLength(4);
  });

  it('按题号切分：整卷解析出 3 题，题型依次为 单选/填空/解答', async () => {
    const { llm } = makeLlm();
    const qs = await new QuestionParser(llm).parse(MOCK_OCR_TEXT, { subject: 'math', gradeLevel: '8' });
    expect(qs).toHaveLength(3);
    expect(qs.map((q) => q.type)).toEqual(['single_choice', 'fill_blank', 'solution']);
    for (const q of qs) expect(q.knowledgePoint).toBeTruthy();
  });
});

describe('QuestionParser —— 选项抽取', () => {
  it('同行选项按标签切分', async () => {
    const { llm } = makeLlm();
    const [q] = await new QuestionParser(llm).parse('1. 选出正确答案\nA.甲  B.乙  C.丙  D.丁');
    expect(q.options).toEqual(['甲', '乙', '丙', '丁']);
  });

  it('分行选项按标签切分', async () => {
    const { llm } = makeLlm();
    const [q] = await new QuestionParser(llm).parse('1. 选出正确答案\nA. 甲\nB. 乙\nC. 丙\nD. 丁');
    expect(q.options).toEqual(['甲', '乙', '丙', '丁']);
  });

  it('非连续标签（如仅有 A/B）不误判为选项', async () => {
    const { llm } = makeLlm();
    const [q] = await new QuestionParser(llm).parse('1. 证明 A 与 B 平行');
    expect(q.options).toHaveLength(0);
    expect(q.type).toBe('solution');
  });
});

describe('QuestionParser —— KP 映射与难度', () => {
  it('优先按 edu.knowledge_points 名录（子串）匹配，最长名称优先', async () => {
    const { llm } = makeLlm();
    const [q] = await new QuestionParser(llm).parse('1. 已知一次函数的图像', {
      knowledgePoints: ['函数', '一次函数'],
    });
    expect(q.knowledgePoint).toBe('一次函数');
  });

  it('无名录时退回内置关键词表', async () => {
    const { llm } = makeLlm();
    const [q] = await new QuestionParser(llm).parse('1. 求直角三角形斜边的长度。\nA. 3  B. 4  C. 5  D. 6');
    expect(q.knowledgePoint).toBe('勾股定理');
  });

  it('无法匹配时 KP 兜底非空；difficulty 落在合法闭集', async () => {
    const { llm } = makeLlm();
    const [q] = await new QuestionParser(llm).parse('1. 请计算 1 + 1');
    expect(q.knowledgePoint).toBe(DEFAULT_KNOWLEDGE_POINT);
    expect(['easy', 'medium', 'hard']).toContain(q.difficulty);
  });
});

describe('QuestionParser —— 边界与 LLM 兜底', () => {
  it('空输入 / 空白输入 → []（不抛错）', async () => {
    const { llm } = makeLlm();
    const p = new QuestionParser(llm);
    expect(await p.parse('')).toEqual([]);
    expect(await p.parse('   \n  ')).toEqual([]);
  });

  it('乱码输入不崩溃（返回数组）', async () => {
    const { llm } = makeLlm();
    const qs = await new QuestionParser(llm).parse('@@@###%%%\n???');
    expect(Array.isArray(qs)).toBe(true);
  });

  it('接受 OcrBlock[] 输入', async () => {
    const { llm } = makeLlm();
    const blocks: OcrBlock[] = [
      { type: 'text', text: '1. 已知直角三角形的两条直角边分别是 3 和 4，求斜边的长度。' },
      { type: 'text', text: 'A. 5   B. 6   C. 7   D. 8' },
    ];
    const [q] = await new QuestionParser(llm).parse(blocks);
    expect(q.type).toBe('single_choice');
    expect(q.options).toHaveLength(4);
  });

  it('无 key 时不调用 LLM', async () => {
    const { llm, chat } = makeLlm({ real: false });
    await new QuestionParser(llm).parse(MOCK_OCR_TEXT);
    expect(chat).not.toHaveBeenCalled();
  });

  it('有 key 时用 LLM 微调知识/难度（题型不变）', async () => {
    const chat = jest.fn().mockResolvedValue({
      content: '{"knowledgePoint": "自定义KP", "difficulty": "hard"}',
    });
    const { llm } = makeLlm({ real: true, chat });
    const [q] = await new QuestionParser(llm).parse('1. 解方程：2x + 5 = 15');
    expect(q.type).toBe('solution'); // 题型由规则定，不被 LLM 改动
    expect(q.knowledgePoint).toBe('自定义KP');
    expect(q.difficulty).toBe('hard');
  });
});
