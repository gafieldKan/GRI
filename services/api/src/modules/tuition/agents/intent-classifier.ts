import { Injectable } from '@nestjs/common';
import type { LlmService } from './llm.service';
import type { Intent } from '../tuition.types';

export type { Intent };

/**
 * 意图识别（P2-T6）—— 把学生输入分到 7 个教学意图。
 *
 * 策略：**规则优先、LLM 兜底**。
 *   1. 关键词/正则规则表打分（多命中累加），命中即给出 confidence ≥ 0.6 直接返回；
 *   2. 规则无法判定（confidence < 0.6）时调 `LlmService.analyzeUserMessage` 兜底；
 *   3. 无 key（`isRealKey()===false` → analyzeUserMessage 返回 null）或异常 → 退回规则默认。
 *
 * 无状态、纯逻辑，但持有 `LlmService` 以便兜底 —— 按 N6 在既有 tuition.module 注册为 provider。
 */

export interface IntentResult {
  intent: Intent;
  confidence: number;
}

/** 分类所需的会话上下文（供 LLM 兜底时拼提示词）。 */
export interface IntentContext {
  knowledgePoint?: string;
  currentState?: string;
  currentQuestion?: unknown;
  conversationHistory?: Array<{ role: string; content: string }>;
}

/**
 * LLM 兜底词表：`LlmService.analyzeUserMessage` 的 intent 空间（answer|greeting|understood|
 * confused|next|complete|chat|skip_diagnosis）→ 本分类器 7 意图。
 */
const LLM_INTENT_MAP: Record<string, Intent> = {
  answer: 'ATTEMPT_ANSWER',
  greeting: 'OFF_TOPIC',
  understood: 'NEXT_QUESTION',
  confused: 'ASK_CLARIFICATION',
  next: 'NEXT_QUESTION',
  complete: 'NEXT_QUESTION',
  chat: 'OFF_TOPIC',
  skip_diagnosis: 'ASK_SOLUTION',
};

/** 规则组：命中任一关键词/正则计 1 分；组间按声明顺序打破平局。 */
interface RuleGroup {
  intent: Intent;
  keywords: string[];
  patterns?: RegExp[];
}

/** 规则表（顺序 = 平局优先级）：越具体的意图越靠前。 */
const RULES: RuleGroup[] = [
  {
    intent: 'GIVE_UP',
    keywords: [
      '放弃', '不会', '不做了', '不做啦', '不想做', '太难了', '太难', '想不出来', '做不出来',
      '算了吧', '直接讲', '直接说吧', '别出题', '我做不到', '教教我', '不懂做', '搞不定',
    ],
  },
  {
    intent: 'ASK_SOLUTION',
    keywords: [
      '答案是什么', '直接告诉我答案', '告诉我答案', '给我答案', '求答案', '看答案', '正确答案',
      '解题步骤', '完整解法', '完整过程', '解开', '求解', '答案呢', '怎么解', '详细步骤',
    ],
  },
  {
    intent: 'ASK_HINT',
    keywords: [
      '提示', 'hint', '思路', '怎么入手', '从哪开始', '从哪里开始', '从何入手', '提个醒',
      '点拨', '帮我一下', '引导我', '给点线索', '给点提示', '有没有思路', '怎么想',
    ],
  },
  {
    intent: 'NEXT_QUESTION',
    keywords: [
      '下一题', '下一道', '下一问', '换一题', '换个题', '再来一题', '再来一道', '再来个',
      '继续下一', '跳过这题', '跳过', 'next', '换一道',
    ],
  },
  {
    intent: 'ASK_CLARIFICATION',
    keywords: [
      '为什么', '什么意思', '啥意思', '听不懂', '没懂', '不明白', '不理解', '解释一下',
      '什么是', '怎么理解', '再讲一遍', '再讲一次', '没听懂', '看不懂', '没看明白',
    ],
  },
  {
    intent: 'ATTEMPT_ANSWER',
    keywords: ['答案是', '我选', '我觉得是', '应该是', '我算得', '我的答案', '等于', '我答', '结果是', '选'],
    patterns: [/^[A-Da-d]$/, /^[A-Da-d][.、)）]/, /[=＝]\s*-?\d/, /^选\s*[A-Da-d]/],
  },
  {
    intent: 'OFF_TOPIC',
    keywords: ['天气', '游戏', '吃什么', '你叫什么', '你是谁', '聊点别的', '讲个笑话', '电影', '明星', '无聊'],
  },
];

const CONFIDENCE_FLOOR = 0.6;

@Injectable()
export class IntentClassifier {
  constructor(private readonly llm: LlmService) {}

  /** 分类入口：规则优先、LLM 兜底。永不抛错（异常一律降级）。 */
  async classify(input: unknown, ctx: IntentContext = {}): Promise<IntentResult> {
    const text = (input ?? '').toString().trim();
    if (!text) return { intent: 'OFF_TOPIC', confidence: 0 };

    const rule = this._ruleClassify(text);
    if (rule.confidence >= CONFIDENCE_FLOOR) return rule;

    const llm = await this._llmClassify(text, ctx);
    if (llm) return llm;

    // 规则无命中（confidence 0）且 LLM 不可用 → OFF_TOPIC（低置信，调用方可再兜底）
    return rule.confidence > 0 ? rule : { intent: 'OFF_TOPIC', confidence: 0 };
  }

  /** 规则打分：命中数越多越自信；无命中 confidence=0。 */
  private _ruleClassify(text: string): IntentResult {
    const lower = text.toLowerCase();
    let best: { intent: Intent; score: number } | null = null;

    for (const group of RULES) {
      let score = 0;
      for (const kw of group.keywords) if (lower.includes(kw.toLowerCase())) score += 1;
      for (const re of group.patterns ?? []) if (re.test(text.trim())) score += 1;
      // 严格大于：平局保留先声明者（RULES 顺序即优先级）
      if (score > 0 && (!best || score > best.score)) best = { intent: group.intent, score };
    }

    if (!best) return { intent: 'OFF_TOPIC', confidence: 0 };
    const confidence = Math.min(0.95, 0.7 + 0.1 * (best.score - 1));
    return { intent: best.intent, confidence };
  }

  /** LLM 兜底：映射 analyzeUserMessage 的意图空间；无 key/异常 → null。 */
  private async _llmClassify(text: string, ctx: IntentContext): Promise<IntentResult | null> {
    try {
      const res = await this.llm.analyzeUserMessage({
        userMessage: text,
        currentState: ctx.currentState,
        knowledgePoint: ctx.knowledgePoint,
        currentQuestion: ctx.currentQuestion ?? null,
        conversationHistory: ctx.conversationHistory ?? [],
      });
      if (!res || !res.intent) return null;
      const intent = LLM_INTENT_MAP[res.intent] ?? 'OFF_TOPIC';
      const confidence = typeof res.confidence === 'number' ? res.confidence : 0.7;
      return { intent, confidence };
    } catch {
      return null;
    }
  }
}
