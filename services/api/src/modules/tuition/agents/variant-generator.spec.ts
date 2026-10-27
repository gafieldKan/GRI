import { VariantGenerator, NUMERIC_FACTORS } from './variant-generator';
import { QuestionParser } from './question-parser';
import type { LlmClient } from '@gri/agent-core';
import type { QuestionSeed } from '../tuition.types';
// 值引入被测类会传递加载 ESM 包 @gri/agent-core —— 按既有范式 mock（同其它 tuition spec）
jest.mock("@gri/agent-core", () => ({ ModelRouter: class {}, storeFrom: (q: unknown) => q, LlmClient: class {} }));

/**
 * 变式生成单测（P2-T7）。
 * 覆盖：3 变式数值不同 / KP 同源 / 选项数不变、每题经 parser 反向校验、确定性、count 生效、
 * 空种子、已知未知互换、选择题退化保护、数值非零。
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

function makeGen() {
  const { llm } = makeLlm({ real: false });
  const parser = new QuestionParser(llm);
  return { parser, gen: new VariantGenerator(parser, llm), llm };
}

/** 单选题种子（与 parser 产出同形）。 */
const CHOICE_SEED: QuestionSeed = {
  id: 'q1',
  type: 'single_choice',
  content: '已知直角三角形的两条直角边分别是 3 和 4，求斜边的长度。',
  options: ['5', '6', '7', '8'],
  answer: '5',
  knowledgePoint: '勾股定理',
  difficulty: 'easy',
  subject: 'math',
};

/** 解答题种子（含「已知…求…」可供互换）。 */
const SOLUTION_SEED: QuestionSeed = {
  id: 'q3',
  type: 'solution',
  content: '已知直角三角形的两条直角边分别是 3 和 4，求斜边的长度。',
  options: [],
  answer: '',
  knowledgePoint: '勾股定理',
  difficulty: 'medium',
  subject: 'math',
};

/** 渲染变式为文本，供反向校验。 */
function render(v: { content: string; options: string[] }): string {
  const opts = v.options.map((o, i) => `${'ABCD'[i] ?? 'A'}. ${o}`).join('\n');
  return opts ? `1. ${v.content}\n${opts}` : `1. ${v.content}`;
}

describe('VariantGenerator —— 变式基本约束', () => {
  it('单选题种子 → 3 变式：数值不同、KP 同源、选项数一致', async () => {
    const { gen } = makeGen();
    const vs = await gen.generate(CHOICE_SEED, { count: 3 });

    expect(vs).toHaveLength(3);
    for (const v of vs) {
      expect(v.knowledgePoint).toBe('勾股定理'); // KP 同源
      expect(v.options).toHaveLength(4); // 选项数不变
      expect(v.content).not.toBe(CHOICE_SEED.content); // 数值/表述已变
    }
    // 三个变式内容两两互异
    const uniq = new Set(vs.map((v) => v.content));
    expect(uniq.size).toBe(3);
  });

  it('原题干里的数值确实被替换（3、4 不再原样出现）', async () => {
    const { gen } = makeGen();
    const vs = await gen.generate(CHOICE_SEED, { count: 3, strategy: 'numeric' });
    for (const v of vs) {
      expect(v.content).not.toContain('分别是 3 和 4');
    }
  });

  it('每个变式都能被 question-parser 反向校验为合法（题型 + 选项数一致）', async () => {
    const { gen, parser } = makeGen();
    const vs = await gen.generate(CHOICE_SEED, { count: 3 });
    for (const v of vs) {
      const [re] = await parser.parse(render(v), { subject: 'math', gradeLevel: '8' });
      expect(re).toBeTruthy();
      expect(re.type).toBe('single_choice');
      expect(re.options).toHaveLength(v.options.length);
    }
  });

  it('确定性：同种子同选项连跑两次结果完全一致', async () => {
    const { gen } = makeGen();
    const a = await gen.generate(CHOICE_SEED, { count: 3 });
    const b = await gen.generate(CHOICE_SEED, { count: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('count 生效：numeric 策略下请求 5 个得 5 个', async () => {
    const { gen } = makeGen();
    const vs = await gen.generate(CHOICE_SEED, { count: 5, strategy: 'numeric' });
    expect(vs).toHaveLength(5);
    expect(new Set(vs.map((v) => v.content)).size).toBe(5);
  });

  it('空种子 / count=0 → []（不抛错）', async () => {
    const { gen } = makeGen();
    expect(await gen.generate({ ...CHOICE_SEED, content: '   ' }, { count: 3 })).toEqual([]);
    expect(await gen.generate(CHOICE_SEED, { count: 0 })).toEqual([]);
  });
});

describe('VariantGenerator —— 互换与边界', () => {
  it('swap 策略：已知/未知互换（解答题）', async () => {
    const { gen } = makeGen();
    const [v] = await gen.generate(SOLUTION_SEED, { count: 1, strategy: 'swap' });
    expect(v.content.startsWith('已知斜边的长度')).toBe(true);
    expect(v.content).toContain('求直角');
  });

  it('选择题 + swap：退化为数值替换（不破坏题干/选项语义）', async () => {
    const { gen } = makeGen();
    const [v] = await gen.generate(CHOICE_SEED, { count: 1, strategy: 'swap' });
    expect(v.content).toContain('求斜边'); // 未被互换
    expect(v.options).toHaveLength(4);
  });

  it('数值替换因子均在 ±20% 内且非 1；替换结果非零', async () => {
    for (const f of NUMERIC_FACTORS) {
      expect(f).toBeGreaterThanOrEqual(0.8);
      expect(f).toBeLessThanOrEqual(1.2);
      expect(f).not.toBe(1);
    }
    const { gen } = makeGen();
    const [v] = await gen.generate({ ...SOLUTION_SEED, content: '请计算 1 + 1 的值。' }, { count: 1 });
    expect(v.content).not.toContain('0'); // 非零
  });
});
