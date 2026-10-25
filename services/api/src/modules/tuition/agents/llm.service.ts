import { Injectable } from '@nestjs/common';
import { loadConfig } from '../../../config/config';
import { DatabaseService } from '../../../database/database.service';
import { ModelRouter, storeFrom } from '@gri/agent-core';

export interface LlmMessage {
  role: string;
  content: string;
}

export interface LlmCallOptions {
  temperature?: number;
  max_tokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
}

export interface LlmResponse {
  content: string;
  usage?: unknown;
}

/** 每轮生效的 LLM 连接配置。 */
interface ActiveCfg {
  model: string;
  apiUrl: string;
  apiKey: string;
  multimodalModel: string;
}

/**
 * LLM 客户端（移植旧 services/ai-tutor-backend/src/modules/ai/AIService.js）。
 *
 * 契约：
 *   - Real key（`nvapi-`）→ 调 NVIDIA/OpenAI 兼容 chat/completions。
 *   - 无 key / 非 `nvapi-` → mock gate：调用方降级到结构化 mock（分析/出题）或
 *     本地关键词（会话聊天），**绝不返回旧的 pending_ai_integration 占位**。
 *   - 3 层 JSON 解析（直接→正则 `\{[\s\S]*\}`→null），429 指数退避，AbortController
 *     超时，content||reasoning_content||reasoning 兜底（reasoning 模型）。
 *
 * 版本说明：模型/密钥不做一次性快照，改为逐轮经 ModelRouter 实时解析（agent.llm_routes 优先、
 * loadConfig().llm 兜底）——前台切大模型/换 base_url 对 tuition 同样即时生效（多数 MCP/平台解耦）。
 * 仍仅依赖注入的 db（可省）：无 db 时退回纯 loadConfig（纯客户端，可独立单测）。
 */
@Injectable()
export class LlmService {
  readonly apiKey: string;
  readonly apiUrl: string;
  readonly model: string;
  readonly provider: string;
  readonly multimodalModel: string;
  /** LLM 单次调用超时（ms；宿主 env LLM_TIMEOUT_MS，默认 150000）。 */
  readonly timeoutMs: number;

  /** loadConfig 快照 = 兜底默认（路由器查不到路由/表缺失时用）。 */
  private readonly fallback: ActiveCfg;
  /** 有 db 时才装 ModelRouter（读 agent.llm_routes），否则纯 env/loadConfig。 */
  private readonly router: ModelRouter | null;

  constructor(private readonly db?: DatabaseService) {
    const llm = loadConfig().llm;
    this.fallback = {
      model: llm.model,
      apiUrl: llm.apiUrl,
      apiKey: llm.apiKey,
      multimodalModel: llm.multimodalModel,
    };
    // 兼容既有读取方：公开只读字段保持同步快照。
    this.apiKey = llm.apiKey;
    this.apiUrl = llm.apiUrl;
    this.model = llm.model;
    this.provider = llm.provider;
    this.multimodalModel = llm.multimodalModel;
    this.timeoutMs = llm.timeoutMs;
    this.router = db
      ? new ModelRouter(storeFrom((text: string, params?: unknown[]) => db.query(text, params)))
      : null;
  }

  /** 是否真实 LLM key（nvapi- 前缀）。缺省走 mock gate。 */
  isRealKey(): boolean {
    return !!this.apiKey && this.apiKey.startsWith('nvapi-');
  }

  /** 逐轮实时解析生效配置：路由(agent.llm_routes)优先，loadConfig 兜底；失败亦回退。 */
  private async _activeCfg(): Promise<ActiveCfg> {
    if (!this.router) return this.fallback;
    try {
      const r = await this.router.resolve('default');
      return {
        model: r.model || this.fallback.model,
        apiUrl: r.baseUrl || this.fallback.apiUrl,
        apiKey: r.apiKey || this.fallback.apiKey,
        multimodalModel: r.multimodalModel || this.fallback.multimodalModel,
      };
    } catch {
      return this.fallback;
    }
  }

  /**
   * 一体式教学响应生成（SessionFSM 主入口）。
   * 一次 LLM 调用返回 {phase, action, answerCorrect, studentAnswer, suggestedResponse, analysis}。
   * 无 key → 返回 null，调用方（SessionFSM）降级到本地关键词判定。
   */
  async generateTeachingResponse(context: any): Promise<any | null> {
    const {
      phase = 'welcome',
      knowledgePoint = '当前知识点',
      conversationHistory = [],
      userMessage,
      currentQuestion = null,
      diagnosisProgress = null,
      quizProgress = null,
      diagnosisResult = null,
    } = context;

    if (!this.isRealKey()) return null;

    const questionInfo = currentQuestion
      ? `\n当前题目：${currentQuestion.content || ''}\n题目类型：${currentQuestion.type || 'text'}\n正确答案：${currentQuestion.answer || ''}`
      : '';

    const progressInfo: string[] = [];
    if (phase === 'diagnosis' && diagnosisProgress) {
      progressInfo.push(`诊断进度：已答${diagnosisProgress.answered}/${diagnosisProgress.total}题`);
    }
    if (phase === 'quizzing' && quizProgress) {
      progressInfo.push(`测验进度：已答${quizProgress.answered}/${quizProgress.total}题`);
    }
    if (diagnosisResult) {
      progressInfo.push(`诊断结果：正确${diagnosisResult.correctCount}/${diagnosisResult.total} (${Math.round(diagnosisResult.correctRate * 100)}%)`);
    }

    const prompt = `你是一位专业的K12数学老师，采用启发式教学。你需要分析学生消息并同时给出回复。

当前阶段：${phase}
知识点：${knowledgePoint}${questionInfo}
${progressInfo.join('\n')}

对话历史：
${conversationHistory.slice(-6).map((m: any) => `${m.role}: ${m.content}`).join('\n')}

学生最新消息：${userMessage}

请以JSON格式返回（只返回JSON，不要其他文字）：
{
  "phase": "welcome|diagnosis|teaching|quizzing|done",
  "action": "greet|ask_question|evaluate_answer|teach|respond|give_quiz|complete",
  "answerCorrect": true|false|null,
  "studentAnswer": "从消息中提取的答案部分",
  "suggestedResponse": "回复内容",
  "analysis": "简短分析(10字内)"
}

phase 判定规则：
- welcome: 学生首次打招呼，尚未开始学习
- diagnosis: 在诊断测试阶段，或应该进入诊断阶段
- teaching: 在讲解/互动阶段。当学生明确要求直接教学/跳过题目、说"不能/不知道"时，phase=teaching
- quizzing: 学生确认理解后进入，或已在测验阶段
- done: 所有测验已完成

action 判定规则：
- greet: 首次打招呼
- ask_question: 需要出一道题给学生（仅在 diagnosis/quizzing 阶段）
- evaluate_answer: 学生在答题，需要评判并反馈
- teach: 直接讲解概念/知识点，不抛出问题
- respond: 回应学生的闲聊/提问/困惑
- give_quiz: 开始给出测验题
- complete: 学习已完成

重要行为准则：
- 当学生说"不能"、"不知道"、"直接教学"、"跳过"、"讲给我听"、"先回答我的问题"时，phase=teaching, action=teach，直接讲解知识点的核心概念
- teaching 阶段的 suggestedResponse 应直接讲解（如概念解释、公式），不再出题或反问。用简短讲解后以提问确认理解结尾
- 仅当 action=ask_question 或 action=give_quiz 时，服务器才会从题库推送题目
- 当 diagnosis 阶段的题目全部做完后，服务器会自动推送 diagnosisResult，你应在看到诊断结果后将 phase 改为 teaching`;

    try {
      const messages: LlmMessage[] = [
        { role: 'system', content: prompt },
        ...conversationHistory.slice(-8).map((m: any) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        { role: 'user', content: `[待响应] ${userMessage}` },
      ];
      const responseObj = await this._callLLMWithRetry(messages, {
        temperature: 0.3,
        max_tokens: 4096,
        timeoutMs: this.timeoutMs,
        maxRetries: 2,
        baseDelayMs: 2000,
      });
      const parsed = this._parseAnalysisJSON(responseObj.content);
      if (parsed) {
        if (!parsed.phase) parsed.phase = phase;
        if (!parsed.action) parsed.action = 'respond';
        if (!parsed.suggestedResponse) parsed.suggestedResponse = '请继续学习，有什么问题可以问我。';
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** 用户消息意图分析（answer|greeting|understood|confused|next|complete|chat|skip_diagnosis）。 */
  async analyzeUserMessage(context: any): Promise<any | null> {
    const {
      currentState = 'WAIT_START',
      knowledgePoint = '当前知识点',
      conversationHistory = [],
      userMessage,
      currentQuestion = null,
    } = context;

    if (!userMessage || !this.isRealKey()) return null;

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
      const messages: LlmMessage[] = [
        { role: 'system', content: analysisPrompt },
        ...conversationHistory.slice(-8).map((m: any) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        { role: 'user', content: `[待分析消息] ${userMessage}` },
      ];
      const response = await this._callLLMWithRetry(messages, {
        temperature: 0.3,
        max_tokens: 4096,
        timeoutMs: this.timeoutMs,
        maxRetries: 2,
        baseDelayMs: 2000,
      });
      const parsed = this._parseAnalysisJSON(response.content);
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

  /** 通用结构化 LLM 调用（出题/分析/计划 agent 用）；失败抛错由上层捕获或 mock 兜底。 */
  async chatCompletion(messages: LlmMessage[], opts: LlmCallOptions = {}): Promise<LlmResponse> {
    return this._callLLMWithRetry(messages, opts);
  }

  /**
   * 多模态调用（ExamScanner OCR）：传 base64 data-URL 图片 + 提示词，调 multimodal 模型。
   * 无 key → 抛错，由调用方回退 mock。复用 _callMultimodalWithRetry 的 429 退避 + 超时。
   */
  async chatCompletionMultimodal(
    imageDataUrl: string,
    text: string,
    opts: LlmCallOptions = {},
  ): Promise<LlmResponse> {
    if (!this.isRealKey()) throw new Error('NO_LLM_KEY');
    return this._callMultimodalWithRetry(imageDataUrl, text, opts);
  }

  /** 3 层 JSON 解析：直接 JSON.parse → 正则 `\{[\s\S]*\}` → null。 */
  _parseAnalysisJSON(rawContent: string | null): any {
    if (!rawContent) return null;
    try {
      return JSON.parse(rawContent.trim());
    } catch {
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          /* layer 3: null */
        }
      }
    }
    return null;
  }

  /** 内部通用 LLM 调用：429 指数退避 + AbortController 超时 + reasoning 内容兜底。 */
  async _callLLMWithRetry(messages: LlmMessage[], options: LlmCallOptions = {}): Promise<LlmResponse> {
    const {
      temperature = 0.7,
      max_tokens = 4096,
      timeoutMs = this.timeoutMs,
      maxRetries = 3,
      baseDelayMs = 1000,
    } = options;

    const cfg = await this._activeCfg(); // 模型/密钥逐轮实时解析
    const payload = {
      model: cfg.model,
      messages,
      temperature,
      max_tokens,
      stream: false,
    };

    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

      try {
        const response = await fetch(cfg.apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: timeoutController.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.text();
          if (response.status === 429 && attempt < maxRetries) {
            const delay = baseDelayMs * 2 ** attempt;
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw new Error(`API 调用失败：${response.status} - ${error}`);
        }

        const data = (await response.json()) as any;
        const message = data?.choices?.[0]?.message || {};
        return {
          content: message.content || message.reasoning_content || message.reasoning || '{}',
          usage: data?.usage,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        if ((error as any).name === 'AbortError') {
          throw new Error(`AI API 请求超时（${timeoutMs}ms）`);
        }
        lastError = error;
        // 429 且已设定继续重试则本轮到 catch（响应在 try 内就以 continue 继续了）；
        // 到达这里说明非 429 / 耗尽重试 → 抛出
        if (attempt >= maxRetries) throw error;
      }
    }
    throw lastError;
  }

  /** 内部多模态调用：POST 到 multimodal 模型，429 指数退避 + AbortController 超时。 */
  async _callMultimodalWithRetry(imageDataUrl: string, text: string, options: LlmCallOptions = {}): Promise<LlmResponse> {
    const { max_tokens = 4096, timeoutMs = 60000, maxRetries = 2, baseDelayMs = 2000 } = options;

    const cfg = await this._activeCfg(); // 模型/密钥逐轮实时解析
    const payload = {
      model: cfg.multimodalModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageDataUrl } },
            { type: 'text', text },
          ],
        },
      ],
      temperature: 0.2,
      top_p: 0.95,
      max_tokens,
      stream: false,
    };

    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(cfg.apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(tid);
        if (!response.ok) {
          const err = await response.text();
          if (response.status === 429) {
            await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
            continue;
          }
          throw new Error(`多模态调用失败：${response.status} - ${err}`);
        }
        const data = (await response.json()) as any;
        const message = data?.choices?.[0]?.message || {};
        return { content: message.content || message.reasoning_content || message.reasoning || '{}', usage: data?.usage };
      } catch (error) {
        clearTimeout(tid);
        if ((error as any).name === 'AbortError') throw new Error(`多模态请求超时（${timeoutMs}ms）`);
        lastError = error;
        if (attempt >= maxRetries) throw error;
      }
    }
    throw lastError;
  }

  /** 校验答案（选择题/填空/文本），支持近似值与文本标准化。 */
  validateAnswer(question: any, studentAnswer: string | number, _context: any = {}): any {
    if (!question) {
      return { valid: false, correct: false, error: '题目不存在', explanation: '', confidence: 0 };
    }
    const correctAnswer = (question.answer ?? '').toString().toLowerCase().trim();
    const rawAnswer = (studentAnswer ?? '').toString().toLowerCase().trim();

    const answerText = rawAnswer
      .replace('我选择：', '')
      .replace('选择', '')
      .replace('答案是', '')
      .replace('答案：', '')
      .replace('选项', '')
      .trim();

    // 选择题
    if (question.type === 'choice') {
      const studentOption = answerText.toUpperCase();
      const correctOption = correctAnswer.toUpperCase();
      const isCorrect =
        studentOption === correctOption || answerText === correctOption || rawAnswer.includes(correctOption);
      return {
        valid: true,
        correct: isCorrect,
        correctAnswer: question.answer,
        explanation: isCorrect
          ? question.explanation ? `回答正确！${question.explanation}` : '回答正确！'
          : `正确答案是：${question.answer}. ${question.explanation || ''}`,
        confidence: 1.0,
        feedback: isCorrect ? 'positive' : 'corrective',
      };
    }

    // 填空/计算题
    if (question.type === 'fill' || question.type === 'text') {
      const answerNum = this.extractNumber(answerText);
      const correctNum = this.extractNumber(correctAnswer);
      if (answerNum !== null && correctNum !== null) {
        const isCorrect = Math.abs(answerNum - correctNum) / (Math.abs(correctNum) + 0.001) < 0.01;
        return {
          valid: true,
          correct: isCorrect,
          correctAnswer: question.answer,
          explanation: isCorrect
            ? question.explanation ? `回答正确！${question.explanation}` : '回答正确！'
            : `正确答案是：${question.answer}. ${question.explanation || ''}`,
          confidence: 1.0,
          feedback: isCorrect ? 'positive' : 'corrective',
        };
      }
      const normalizedStudent = this.normalizeText(answerText);
      const normalizedCorrect = this.normalizeText(correctAnswer);
      const isExactMatch =
        normalizedStudent === normalizedCorrect ||
        answerText.includes(correctAnswer) ||
        correctAnswer.includes(answerText);
      return {
        valid: true,
        correct: isExactMatch,
        correctAnswer: question.answer,
        explanation: isExactMatch
          ? question.explanation ? `回答正确！${question.explanation}` : '回答正确！'
          : `正确答案是：${question.answer}. ${question.explanation || ''}`,
        confidence: 1.0,
        feedback: isExactMatch ? 'positive' : 'corrective',
      };
    }

    // 文本问答题默认给分
    if (question.type === 'essay') {
      return {
        valid: true,
        correct: true,
        correctAnswer: studentAnswer,
        explanation: '回答合理',
        confidence: 0.8,
        feedback: 'positive',
      };
    }

    return {
      valid: false,
      correct: false,
      correctAnswer: question.answer,
      explanation: '答案格式不匹配',
      confidence: 0,
      feedback: 'neutral',
    };
  }

  normalizeText(text: unknown): string {
    if (!text) return '';
    return text
      .toString()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[,.!?;:，。！？；：]/g, '')
      .trim();
  }

  extractNumber(str: unknown): number | null {
    if (!str) return null;
    const match = str.toString().match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
  }
}