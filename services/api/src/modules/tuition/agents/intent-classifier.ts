import { Injectable } from '@nestjs/common';
// LlmClient 必须值导入（emitDecoratorMetadata 依赖运行期引用）；`import type` 会使 Nest 无法注入。
import { LlmClient } from '@gri/agent-core';
import { llmTimeoutMs } from './llm-provider';
import type { Intent } from '../tuition.types';

export type { Intent };

/**
 * 意图识别（P2-T6）—— 把学生输入分到 7 个教学意图。
 *
 * 策略：**规则优先、LLM 兜底**。
 *   1. 关键词/正则规则表打分（多命中累加），命中即给出 confidence ≥ 0.6 直接返回；
 *   2. 规则无法判定（confidence < 0.6）时调本类 `_analyzeUserMessage`（底座 LLM）兜底；
 *   3. 无 key（`isRealKey()===false` → `_analyzeUserMessage` 返回 null）或异常 → 退回规则默认。
 *
 * 无状态、纯逻辑，但持有底座 `LlmClient` 以便兜底 —— 按 N6 在既有 tuition.module 注册为 provider。
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
 * LLM 兜底词表：`_analyzeUserMessage` 的 intent 空间（answer|greeting|understood|
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
  constructor(private readonly llm: LlmClient) {}

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

  /**
   * LLM 兜底：把学生消息交给底座 LLM 判意图（W2.4 由原 tuition 自持 LLM 客户端的同名方法迁入本类）。
   * 无 key（`isRealKey()===false`）或异常 → null（调用方退回规则默认，绝不抛错）。
   */
  private async _analyzeUserMessage(context: any): Promise<any | null> {
    const {
      currentState = 'WAIT_START',
      knowledgePoint = '当前知识点',
      conversationHistory = [],
      userMessage,
      currentQuestion = null,
    } = context;

    if (!userMessage || !(await this.llm.isRealKey())) return null;

    const questionInfo = currentQuestion
      ? `\n当前题目：${currentQuestion.content || ''}\n题目类型：${currentQuestion.type || 'text'}\n正确答案：${currentQuestion.answer || ''}`
      : '';

    const analysisPrompt = `你是一个教学分析助手。请分析学生的这条消息，判断其意图和答案正确性。

当前教学状态：${currentState}
知识点：${knowledgePoint}${questionInfo}

对话历史：
${conversationHistory.slice(-6).map((m: any) => `${m.role}: ${m.content}`).join('\n')}

学生最新消息：${userMessage}

请以 JSON 格式返回分析结果（只返回 JSON，不要其他文字）：
{
  "intent": "answer|greeting|understood|confused|next|complete|chat|skip_diagnosis",
  "answerCorrect": true|false|null,
  "answerValue": "从消息中提取的答案部分（如果 intent=answer）",
  "analysis": "对消息的简短分析（20字以内）",
  "suggestedResponse": "建议给学生的回复（50字以内）",
  "confidence": 0.0-1.0
}

intent 说明：
- answer: 学生在提交题目答案
- greeting: 学生在打招呼/开始对话
- understood: 学生表示理解了
- confused: 学生表示困惑/不懂
- next: 学生想进入下一阶段
- complete: 学生想结束学习
- chat: 学生在闲聊/评论（非提交答案）
- skip_diagnosis: 学生明确要求跳过题目/直接讲解/直接教学，或学生连续多次表示困惑且对话历史显示老师持续出题未被回应

重要行为准则：
- 当学生说"不能"、"不知道"、"直接教学"、"跳过题目"、"讲给我听"、"什么是"时，intent=skip_diagnosis
- 当 intent=skip_diagnosis 时，suggestedResponse 应直接开始讲解知识点的核心内容（如概念解释、公式），不再出题或反问。简短讲解20-30字后，用提问确认理解。例如："勾股定理是直角三角形中两条直角边的平方和等于斜边的平方，即a²+b²=c²。你理解这个关系吗？"
- 当当前状态为 DIAGNOSING 且学生明确表达不耐烦时，应识别为 skip_diagnosis
- answerCorrect 仅当 intent="answer" 且有当前题目时判断`;

    try {
      const messages = [
        { role: 'system', content: analysisPrompt },
        ...conversationHistory.slice(-8).map((m: any) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        { role: 'user', content: `[待分析消息] ${userMessage}` },
      ];
      const response = await this.llm.chat(messages, 'default', {
        temperature: 0.3,
        max_tokens: 4096,
        timeoutMs: llmTimeoutMs(),
        maxRetries: 2,
        baseDelayMs: 2000,
      });
      const parsed = this.llm.parseJSON(response.content);
      if (parsed) {
        if (parsed.confidence == null) parsed.confidence = 0.7;
        if (!parsed.intent) parsed.intent = 'chat';
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** LLM 兜底：映射 `_analyzeUserMessage` 的意图空间；无 key/异常 → null。 */
  private async _llmClassify(text: string, ctx: IntentContext): Promise<IntentResult | null> {
    try {
      const res = await this._analyzeUserMessage({
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
