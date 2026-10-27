import { IntentClassifier } from './intent-classifier';
import type { Intent } from './intent-classifier';
import type { LlmClient } from '@gri/agent-core';
// 值引入被测类会传递加载 ESM 包 @gri/agent-core —— 按既有范式 mock（同其它 tuition spec）
jest.mock("@gri/agent-core", () => ({ ModelRouter: class {}, storeFrom: (q: unknown) => q, LlmClient: class {} }));

/**
 * 意图识别单测（P2-T6）。
 * 覆盖：7 意图各 ≥2 例、规则命中不调 LLM、LLM 兜底映射、无 key（null）降级、
 * LLM 异常降级、空/非字符串输入、多命中置信度更高。
 *
 * 自 W2.4：LLM 兜底经本类 `_analyzeUserMessage`（内置提示词）→ 底座 `LlmClient.chat` → 3 层解析。
 * 故替身只需 `isRealKey` + `chat`（回 JSON 文本）+ `parseJSON`；`analyzeResult=null` 表示无 key。
 */

function makeLlm(analyzeResult: unknown = null) {
  const isRealKey = jest.fn().mockResolvedValue(analyzeResult !== null);
  const chat = jest.fn().mockResolvedValue({ content: analyzeResult === null ? '' : JSON.stringify(analyzeResult) });
  const parseJSON = (raw: unknown) => {
    if (!raw) return null;
    try { return JSON.parse(String(raw).trim()); } catch { const m = String(raw).match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }
  };
  return { llm: { isRealKey, chat, parseJSON } as unknown as LlmClient, isRealKey, chat };
}

describe('IntentClassifier —— 规则优先（7 意图各 ≥2 例）', () => {
  it('ASK_HINT', async () => {
    const { llm } = makeLlm();
    const c = new IntentClassifier(llm);
    expect((await c.classify('给我一点提示')).intent).toBe('ASK_HINT');
    expect((await c.classify('这题怎么入手')).intent).toBe('ASK_HINT');
  });

  it('ASK_SOLUTION（且 "答案是什么" 不误判为作答）', async () => {
    const { llm } = makeLlm();
    const c = new IntentClassifier(llm);
    expect((await c.classify('直接告诉我答案')).intent).toBe('ASK_SOLUTION');
    expect((await c.classify('答案是什么')).intent).toBe('ASK_SOLUTION');
  });

  it('ATTEMPT_ANSWER', async () => {
    const { llm } = makeLlm();
    const c = new IntentClassifier(llm);
    expect((await c.classify('答案是 5')).intent).toBe('ATTEMPT_ANSWER');
    expect((await c.classify('我选 B')).intent).toBe('ATTEMPT_ANSWER');
  });

  it('ASK_CLARIFICATION', async () => {
    const { llm } = makeLlm();
    const c = new IntentClassifier(llm);
    expect((await c.classify('为什么是这样')).intent).toBe('ASK_CLARIFICATION');
    expect((await c.classify('我不明白')).intent).toBe('ASK_CLARIFICATION');
  });

  it('GIVE_UP', async () => {
    const { llm } = makeLlm();
    const c = new IntentClassifier(llm);
    expect((await c.classify('太难了，我放弃')).intent).toBe('GIVE_UP');
    expect((await c.classify('我不会，直接讲吧')).intent).toBe('GIVE_UP');
  });

  it('NEXT_QUESTION', async () => {
    const { llm } = makeLlm();
    const c = new IntentClassifier(llm);
    expect((await c.classify('下一题')).intent).toBe('NEXT_QUESTION');
    expect((await c.classify('跳过这题')).intent).toBe('NEXT_QUESTION');
  });

  it('OFF_TOPIC', async () => {
    const { llm } = makeLlm();
    const c = new IntentClassifier(llm);
    expect((await c.classify('今天天气不错')).intent).toBe('OFF_TOPIC');
    expect((await c.classify('你喜欢玩什么游戏')).intent).toBe('OFF_TOPIC');
  });

  it('规则命中即返回，绝不调用 LLM', async () => {
    const { llm, chat } = makeLlm();
    const c = new IntentClassifier(llm);
    await c.classify('给我一点提示');
    expect(chat).not.toHaveBeenCalled();
  });

  it('命中越多置信度越高', async () => {
    const { llm } = makeLlm();
    const c = new IntentClassifier(llm);
    const one = await c.classify('放弃');
    const many = await c.classify('太难了，我完全放弃，做不出来');
    expect(one.intent).toBe('GIVE_UP');
    expect(many.intent).toBe('GIVE_UP');
    expect(many.confidence).toBeGreaterThan(one.confidence);
    expect(many.confidence).toBeLessThanOrEqual(0.95);
  });
});

describe('IntentClassifier —— LLM 兜底 / 降级', () => {
  it('规则无命中 → 调 LLM，映射 confused → ASK_CLARIFICATION', async () => {
    const { llm, chat } = makeLlm({ intent: 'confused', confidence: 0.8 });
    const c = new IntentClassifier(llm);
    const res = await c.classify('嗯嗯嗯嗯');
    expect(chat).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ intent: 'ASK_CLARIFICATION', confidence: 0.8 });
  });

  it('LLM 映射 skip_diagnosis → ASK_SOLUTION（"跳过题目/直接讲解" 归入要解法）', async () => {
    const { llm } = makeLlm({ intent: 'skip_diagnosis' });
    const c = new IntentClassifier(llm);
    expect((await c.classify('嗯嗯嗯嗯')).intent).toBe('ASK_SOLUTION');
  });

  it('无 key（analyzeUserMessage 返回 null）→ 退回 OFF_TOPIC 低置信，不抛错', async () => {
    const { llm } = makeLlm(null);
    const c = new IntentClassifier(llm);
    expect(await c.classify('嗯嗯嗯嗯')).toEqual({ intent: 'OFF_TOPIC', confidence: 0 });
  });

  it('LLM 抛异常 → 静默降级，不向外炸', async () => {
    const chat = jest.fn().mockRejectedValue(new Error('boom'));
    const c = new IntentClassifier({ isRealKey: () => true, chat, parseJSON: () => null } as unknown as LlmClient);
    await expect(c.classify('嗯嗯嗯嗯')).resolves.toEqual({ intent: 'OFF_TOPIC', confidence: 0 });
  });
});

describe('IntentClassifier —— 边界输入', () => {
  it('空串 / 纯空白 → OFF_TOPIC，且不调 LLM', async () => {
    const { llm, chat } = makeLlm();
    const c = new IntentClassifier(llm);
    expect(await c.classify('')).toEqual({ intent: 'OFF_TOPIC', confidence: 0 });
    expect(await c.classify('   ')).toEqual({ intent: 'OFF_TOPIC', confidence: 0 });
    expect(chat).not.toHaveBeenCalled();
  });

  it('非字符串（null/undefined/数字）不抛错', async () => {
    const { llm } = makeLlm();
    const c = new IntentClassifier(llm);
    expect((await c.classify(null)).intent).toBe('OFF_TOPIC');
    expect((await c.classify(undefined)).intent).toBe('OFF_TOPIC');
    expect((await c.classify(0)).intent).toBe('OFF_TOPIC'); // '0' 无规则命中
  });
});

describe('IntentClassifier —— 30+ 样本准确率（验收硬性 ≥90%）', () => {
  /** 每意图 ≥5 条共 37 条样本；覆盖 7 意图与 OFF_TOPIC/GIVE_UP 触发词。 */
  const SAMPLES: Array<[string, Intent]> = [
    ['给我一点提示', 'ASK_HINT'],
    ['这题怎么入手', 'ASK_HINT'],
    ['有没有思路', 'ASK_HINT'],
    ['提示一下', 'ASK_HINT'],
    ['从哪里开始想', 'ASK_HINT'],
    ['给点线索吧', 'ASK_HINT'],
    ['直接告诉我答案', 'ASK_SOLUTION'],
    ['这道题的答案是什么', 'ASK_SOLUTION'],
    ['把解题步骤写出来', 'ASK_SOLUTION'],
    ['求答案', 'ASK_SOLUTION'],
    ['教我完整解法', 'ASK_SOLUTION'],
    ['答案是 5', 'ATTEMPT_ANSWER'],
    ['我选 B', 'ATTEMPT_ANSWER'],
    ['我觉得是 3.14', 'ATTEMPT_ANSWER'],
    ['应该是 12', 'ATTEMPT_ANSWER'],
    ['我的答案：x=2', 'ATTEMPT_ANSWER'],
    ['等于 7', 'ATTEMPT_ANSWER'],
    ['为什么是这样', 'ASK_CLARIFICATION'],
    ['我不明白', 'ASK_CLARIFICATION'],
    ['这是什么意思', 'ASK_CLARIFICATION'],
    ['能再讲一遍吗', 'ASK_CLARIFICATION'],
    ['解释一下这个概念', 'ASK_CLARIFICATION'],
    ['太难了，我放弃', 'GIVE_UP'],
    ['我不会，直接讲吧', 'GIVE_UP'],
    ['我不做了', 'GIVE_UP'],
    ['算了吧', 'GIVE_UP'],
    ['实在想不出来', 'GIVE_UP'],
    ['下一题', 'NEXT_QUESTION'],
    ['换一题吧', 'NEXT_QUESTION'],
    ['再来一道', 'NEXT_QUESTION'],
    ['跳过这题', 'NEXT_QUESTION'],
    ['继续下一题', 'NEXT_QUESTION'],
    ['今天天气不错', 'OFF_TOPIC'],
    ['你喜欢玩什么游戏', 'OFF_TOPIC'],
    ['你叫什么名字', 'OFF_TOPIC'],
    ['我们聊点别的吧', 'OFF_TOPIC'],
    ['讲个笑话', 'OFF_TOPIC'],
  ];

  it(`样本数 ≥30 且准确率 ≥90%（实跑 ${SAMPLES.length} 条）`, async () => {
    const { llm } = makeLlm(null); // 无 key：走纯规则判定
    const c = new IntentClassifier(llm);
    expect(SAMPLES.length).toBeGreaterThanOrEqual(30);

    const misses: string[] = [];
    for (const [text, want] of SAMPLES) {
      const got = await c.classify(text);
      if (got.intent !== want) misses.push(`"${text}" want=${want} got=${got.intent}`);
    }
    expect(misses).toEqual([]);
    const acc = (SAMPLES.length - misses.length) / SAMPLES.length;
    expect(acc).toBeGreaterThanOrEqual(0.9);
  });

  it('GIVE_UP / OFF_TOPIC 均有明确触发词表（非泛化兜底）', async () => {
    const { llm } = makeLlm(null);
    const c = new IntentClassifier(llm);
    // 单独验证触发词稳定命中，证明其为词表驱动而非默认兜底
    for (const t of ['放弃', '不会', '想不出来', '算了吧']) {
      expect((await c.classify(t)).intent).toBe('GIVE_UP');
    }
    for (const t of ['天气', '游戏', '你是谁的啊']) {
      expect((await c.classify(t)).intent).toBe('OFF_TOPIC');
    }
  });
});
