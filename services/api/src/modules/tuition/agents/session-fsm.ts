import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { LlmClient } from '@gri/agent-core';
import { llmTimeoutMs } from './llm-provider';
import { eduQuery, findKnowledgePointName, insertSession, findSessionOwned, flushSession } from '../../edu-core/repository';
import { TuitionQuestionService } from './question.service';
import { TuitionQuestion } from './question.service';

/**
 * 教学会话状态机（移植旧 SessionFSM.js），但**持久化**：
 * 状态推进在内存计算后全量写回 edu.sessions.session_data（JSONB），
 * 重启不丢、GET /sessions/:id 可由行重建 —— 取代旧架构的内存 Map。
 *
 * 阶段：welcome → diagnosis → teaching → quizzing → done。
 *
 * 响应契约（与前端/旧后端一致）：{success, phase, state, message, questions?,
 *   diagnosisResult?, quizResult?, result?}，state=phase 兼容双前端聊天。
 *
 * `flush` 由 SessionFsmService 注入：每次 handleUserMessage 返回前把自身状态落库。
 */

/** 一条已答题记录（答题/诊断/测验共用）。 */
export interface AnswerRecord {
  content: string;
  isCorrect: boolean;
  questionId?: string;
  timestamp?: number;
}

export interface DiagnosisProgress {
  answered: number;
  total: number;
}

export interface FsmResponse {
  success: boolean;
  phase: string;
  state: string;
  message: string;
  questions?: Array<{ id: string; content: string; type: string; options?: string[]; difficulty?: string }>;
  diagnosisResult?: { correctCount: number; total: number; correctRate: number };
  quizResult?: { correctCount: number; total: number; correctRate: number };
  result?: any;
  _analysis?: string;
}

export class SessionFsm {
  sessionId: string;
  userId: string;
  knowledgePointId: string;
  phase: 'welcome' | 'diagnosis' | 'teaching' | 'quizzing' | 'done' = 'welcome';

  interactionHistory: Array<{ role: string; content: string; timestamp?: number }> = [];
  diagnosisQuestions: TuitionQuestion[] = [];
  diagnosisAnswers: AnswerRecord[] = [];
  diagnosisResult: { correctCount: number; total: number; correctRate: number } | null = null;
  quizQuestions: TuitionQuestion[] = [];
  quizAnswers: AnswerRecord[] = [];
  quizResult: { correctCount: number; total: number; correctRate: number } | null = null;
  masteryLevel = 0;
  selectedKpName?: string;

  private _sentQuestionIds = new Set<string>();

  constructor(
    sessionId: string,
    userId: string,
    knowledgePointId: string,
    private readonly llm: LlmClient,
    private readonly questionService: TuitionQuestionService,
    private readonly flush: () => Promise<void>,
    kpName?: string,
  ) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.knowledgePointId = knowledgePointId;
    this.selectedKpName = kpName;
  }

  /** 加载诊断/测验题库（失败不阻断会话，前端按空题显示）。 */
  async loadQuestions(): Promise<void> {
    try {
      this.diagnosisQuestions = await this.questionService.getDiagnosisQuestions(this.knowledgePointId);
      this.quizQuestions = await this.questionService.getQuizQuestions(this.knowledgePointId, 5);
    } catch (e) {
      // 题库未就绪 → 空表，诊断/测验阶段由 LLM/降级驱动
      this.diagnosisQuestions = this.diagnosisQuestions || [];
      this.quizQuestions = this.quizQuestions || [];
    }
  }

  getCurrentQuestion(): TuitionQuestion | null {
    if (this.phase === 'diagnosis') return this.diagnosisQuestions[this.diagnosisAnswers.length] ?? null;
    if (this.phase === 'quizzing') return this.quizQuestions[this.quizAnswers.length] ?? null;
    return null;
  }

  /**
   * 核心：处理用户消息 — 一次 LLM 调用完成分析+回复+阶段判断（无 key 走本地降级）。
   *
   * @param content 学生消息
   * @param overrideDecision 可选：调用方（TuitionService）已用 TutorSessionAgent(agent-core) 求出教学判定。
   *   - 传了（含 null）：直接应用，不再走本 FSM 内部的底座 LLM 调用；null → 本地关键词降级。
   *   - 没传：保持旧行为（内部调用 `_generateTeachingResponse`，测试/E2E 兼容）。
   */
  async handleUserMessage(content: string, overrideDecision?: any): Promise<FsmResponse> {
    this.interactionHistory.push({ role: 'user', content, timestamp: Date.now() });

    const currentQuestion = this.getCurrentQuestion();
    const diagProgress: DiagnosisProgress | null =
      this.phase === 'diagnosis'
        ? { answered: this.diagnosisAnswers.length, total: this.diagnosisQuestions.length }
        : null;
    const quizProgress: DiagnosisProgress | null =
      this.phase === 'quizzing'
        ? { answered: this.quizAnswers.length, total: this.quizQuestions.length }
        : null;

    let result: FsmResponse;
    if (overrideDecision !== undefined) {
      // 调方已用 agent-core 求出判定 → 直接应用（null 即降级），不再内部调 LLM
      result = overrideDecision
        ? this.applyLlmDecision(overrideDecision, content, currentQuestion)
        : this._fallback(content);
    } else {
      // 旧路径：内部一次 LLM 调用（无 key 走本地降级）
      const llm = await this._generateTeachingResponse({
        phase: this.phase,
        knowledgePoint: this.selectedKpName || this.knowledgePointId,
        conversationHistory: this.interactionHistory,
        userMessage: content,
        currentQuestion,
        diagnosisProgress: diagProgress,
        quizProgress,
        diagnosisResult: this.diagnosisResult,
      });
      result = llm ? this.applyLlmDecision(llm, content, currentQuestion) : this._fallback(content);
    }

    // 落库：把状态写回 edu.sessions（幂等——每次都整段覆盖 session_data）
    try {
      await this.flush();
    } catch (e) {
      // 持久化失败不阻断回复；会话仍可推进（下次成功 flush 覆盖）
    }

    return result;
  }

  /**
   * 一体式教学响应生成（W2.4 由原 tuition 自持 LLM 客户端的同名方法迁入本 FSM）。
   * 一次底座 LLM 调用返回 {phase, action, answerCorrect, studentAnswer, suggestedResponse, analysis}。
   * 无 key → 返回 null，调用方（handleUserMessage）降级到本地关键词判定。
   */
  private async _generateTeachingResponse(context: any): Promise<any | null> {
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

    if (!(await this.llm.isRealKey())) return null;

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
      const messages = [
        { role: 'system', content: prompt },
        ...conversationHistory.slice(-8).map((m: any) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        { role: 'user', content: `[待响应] ${userMessage}` },
      ];
      const responseObj = await this.llm.chat(messages, 'default', {
        temperature: 0.3,
        max_tokens: 4096,
        timeoutMs: llmTimeoutMs(),
        maxRetries: 2,
        baseDelayMs: 2000,
      });
      const parsed = this.llm.parseJSON(responseObj.content);
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

  applyLlmDecision(llm: any, content: string, currentQuestion: TuitionQuestion | null): FsmResponse {
    const result: FsmResponse = { success: true, phase: this.phase, state: this.phase, message: llm.suggestedResponse || '请继续学习' };

    // 答案提交处理
    if (llm.action === 'evaluate_answer' && llm.answerCorrect != null) {
      const studentAnswer = llm.studentAnswer || content;
      if (this.phase === 'diagnosis') {
        this._recordAnswer(this.diagnosisAnswers, studentAnswer, llm.answerCorrect, currentQuestion);
        const nextQ = this.getCurrentQuestion();
        if (!nextQ && this.diagnosisQuestions.length > 0) {
          const correctCount = this.diagnosisAnswers.filter((a) => a.isCorrect).length;
          const correctRate = correctCount / this.diagnosisAnswers.length;
          this.diagnosisResult = { correctCount, total: this.diagnosisAnswers.length, correctRate };
          this.masteryLevel = correctRate * 100;
          result.diagnosisResult = this.diagnosisResult;
          result.phase = 'teaching';
          this.phase = 'teaching';
        }
      } else if (this.phase === 'quizzing') {
        this._recordAnswer(this.quizAnswers, studentAnswer, llm.answerCorrect, currentQuestion);
        const nextQ = this.getCurrentQuestion();
        if (!nextQ && this.quizQuestions.length > 0) {
          const correctCount = this.quizAnswers.filter((a) => a.isCorrect).length;
          const correctRate = correctCount / this.quizAnswers.length;
          this.quizResult = { correctCount, total: this.quizAnswers.length, correctRate };
          result.quizResult = this.quizResult;
          result.phase = 'done';
          this.phase = 'done';
        }
      }
      // teaching 阶段回答：不改变阶段，由 LLM 回复处理
    }

    // 阶段切换 — 仅在本地上锁（诊断题没做完不能跳到 teaching）
    const llmPhase = llm.phase;
    if (llmPhase === 'diagnosis' && this.phase === 'welcome') {
      this.phase = 'diagnosis';
      result.phase = 'diagnosis';
    } else if (llmPhase === 'teaching' && this.phase === 'diagnosis') {
      if (this.diagnosisAnswers.length < this.diagnosisQuestions.length) {
        const skipped = /直接教学|跳过|讲给我听|不能|不知道|先回答/.test(content);
        if (skipped) {
          this.phase = 'teaching';
          result.phase = 'teaching';
        }
      } else {
        this.phase = 'teaching';
        result.phase = 'teaching';
      }
    } else if (llmPhase === 'quizzing' && this.phase === 'teaching') {
      this.phase = 'quizzing';
      result.phase = 'quizzing';
    } else if (llmPhase === 'done' && (this.phase === 'quizzing' || this.phase === 'teaching')) {
      this.phase = 'done';
      result.phase = 'done';
    }

    result.message = llm.suggestedResponse || result.message;
    result._analysis = llm.analysis;
    result.state = result.phase || this.phase;

    // 推送题目（去重：已发送的题目不再重复推送）
    if (llm.action === 'ask_question' && this.phase === 'diagnosis') {
      const nextQ = this.getCurrentQuestion();
      if (nextQ && !this._sentQuestionIds.has(nextQ.id)) {
        this._sentQuestionIds.add(nextQ.id);
        result.questions = [this._toClientQuestion(nextQ)];
      }
    }
    if (llm.action === 'give_quiz' || (llm.action === 'ask_question' && this.phase === 'quizzing')) {
      const newQs = this.quizQuestions.filter((q) => !this._sentQuestionIds.has(q.id));
      newQs.forEach((q) => this._sentQuestionIds.add(q.id));
      if (newQs.length > 0) result.questions = newQs.map((q) => this._toClientQuestion(q));
    }

    return result;
  }

  private _recordAnswer(answers: AnswerRecord[], studentAnswer: string, isCorrect: boolean, question: TuitionQuestion | null) {
    answers.push({ content: studentAnswer, isCorrect, questionId: question?.id, timestamp: Date.now() });
  }

  private _toClientQuestion(q: TuitionQuestion) {
    return { id: q.id, content: q.content, type: q.type, options: q.options || undefined, difficulty: q.difficulty };
  }

  /** 降级：LLM 不可用（无 key / 调用失败）时本地关键词判定。 */
  _fallback(content: string): FsmResponse {
    const lower = (content || '').toLowerCase();
    const currentQuestion = this.getCurrentQuestion();
    const isAnswer = /我选择|答案是|^[abcd]$/i.test(content.trim());

    if (isAnswer && currentQuestion && (this.phase === 'diagnosis' || this.phase === 'quizzing')) {
      const res = this.llm.validateAnswer(currentQuestion, content);
      if (this.phase === 'diagnosis') {
        this.diagnosisAnswers.push({ content, isCorrect: res.correct, questionId: currentQuestion.id });
        if (this.diagnosisAnswers.length >= this.diagnosisQuestions.length && this.diagnosisQuestions.length > 0) {
          const cc = this.diagnosisAnswers.filter((a) => a.isCorrect).length;
          this.diagnosisResult = { correctCount: cc, total: this.diagnosisAnswers.length, correctRate: cc / this.diagnosisAnswers.length };
          this.phase = 'teaching';
          return { success: true, state: 'teaching', phase: 'teaching', message: res.explanation, diagnosisResult: this.diagnosisResult! };
        }
        return { success: true, state: 'diagnosis', phase: 'diagnosis', message: res.explanation };
      }
      if (this.phase === 'quizzing') {
        this.quizAnswers.push({ content, isCorrect: res.correct, questionId: currentQuestion.id });
        if (this.quizAnswers.length >= this.quizQuestions.length && this.quizQuestions.length > 0) {
          const cc = this.quizAnswers.filter((a) => a.isCorrect).length;
          this.quizResult = { correctCount: cc, total: this.quizAnswers.length, correctRate: cc / this.quizAnswers.length };
          this.phase = 'done';
          return { success: true, state: 'done', phase: 'done', message: res.explanation, quizResult: this.quizResult! };
        }
        return { success: true, state: 'quizzing', phase: 'quizzing', message: res.explanation };
      }
      return { success: true, state: this.phase, phase: this.phase, message: '收到答案' };
    }

    if (this.phase === 'welcome') {
      this.phase = 'diagnosis';
      const newQs = this.diagnosisQuestions.filter((q) => !this._sentQuestionIds.has(q.id));
      newQs.forEach((q) => this._sentQuestionIds.add(q.id));
      return { success: true, state: 'diagnosis', phase: 'diagnosis', message: '让我们开始诊断测试吧！', questions: newQs.map((q) => this._toClientQuestion(q)) };
    }

    if (this.phase === 'diagnosis') {
      if (/直接教学|跳过|讲给我听|不能|不知道/.test(content)) {
        this.phase = 'teaching';
        return { success: true, state: 'teaching', phase: 'teaching', message: '好的，让我直接为你讲解这个知识点。' };
      }
      if (currentQuestion) {
        const res = this.llm.validateAnswer(currentQuestion, content);
        this.diagnosisAnswers.push({ content, isCorrect: res.correct, questionId: currentQuestion.id });
        return { success: true, state: 'diagnosis', phase: 'diagnosis', message: res.explanation };
      }
    }

    if (this.phase === 'teaching') {
      if (/理解|懂了|明白/.test(lower)) {
        this.phase = 'quizzing';
        const newQs = this.quizQuestions.filter((q) => !this._sentQuestionIds.has(q.id));
        newQs.forEach((q) => this._sentQuestionIds.add(q.id));
        return { success: true, state: 'quizzing', phase: 'quizzing', message: '好的，来做几道题验证一下！', questions: newQs.map((q) => this._toClientQuestion(q)) };
      }
      return { success: true, state: 'teaching', phase: 'teaching', message: '请继续，有什么问题可以问我。' };
    }

    if (this.phase === 'quizzing') {
      if (currentQuestion) {
        const res = this.llm.validateAnswer(currentQuestion, content);
        if (res.correct && this.quizAnswers.length + 1 >= this.quizQuestions.length && this.quizQuestions.length > 0) {
          this.quizAnswers.push({ content, isCorrect: true, questionId: currentQuestion.id });
          const cc = this.quizAnswers.filter((a) => a.isCorrect).length;
          this.quizResult = { correctCount: cc, total: this.quizAnswers.length, correctRate: cc / this.quizAnswers.length };
          this.phase = 'done';
          return { success: true, state: 'done', phase: 'done', message: res.explanation, quizResult: this.quizResult };
        }
        this.quizAnswers.push({ content, isCorrect: res.correct, questionId: currentQuestion.id });
        return { success: true, state: 'quizzing', phase: 'quizzing', message: res.explanation };
      }
    }

    return { success: true, state: this.phase, phase: this.phase, message: '收到你的消息' };
  }

  /** 序列化会话内存态（除题库外，会随 flush 写回 session_data）。 */
  toSnapshot() {
    return {
      phase: this.phase,
      masteryLevel: this.masteryLevel,
      selectedKpName: this.selectedKpName ?? null,
      interactionHistory: this.interactionHistory,
      diagnosisAnswers: this.diagnosisAnswers,
      diagnosisResult: this.diagnosisResult,
      quizAnswers: this.quizAnswers,
      quizResult: this.quizResult,
      sentQuestionIds: Array.from(this._sentQuestionIds),
    };
  }

  /** 从快照恢复会话内存态（题库会随 loadQuestions 重新装载）。 */
  restore(snapshot: any) {
    if (snapshot?.phase && ['welcome', 'diagnosis', 'teaching', 'quizzing', 'done'].includes(snapshot.phase)) {
      this.phase = snapshot.phase;
    }
    this.masteryLevel = snapshot?.masteryLevel ?? 0;
    this.selectedKpName = snapshot?.selectedKpName ?? undefined;
    this.interactionHistory = snapshot?.interactionHistory ?? [];
    this.diagnosisAnswers = snapshot?.diagnosisAnswers ?? [];
    this.diagnosisResult = snapshot?.diagnosisResult ?? null;
    this.quizAnswers = snapshot?.quizAnswers ?? [];
    this.quizResult = snapshot?.quizResult ?? null;
    if (Array.isArray(snapshot?.sentQuestionIds)) this._sentQuestionIds = new Set(snapshot.sentQuestionIds);
  }
}

/**
 * 会话持久化门面：创建（建行）、加载（按行长重建）、flush（整段覆盖 session_data）。
 * 所有权由调用方用 userId 落参控制 —— 这里一律把 user_id 写进 WHERE/INSERT，杜绝跨用户读改。
 */
@Injectable()
export class SessionFsmService {
  constructor(
    private readonly db: DatabaseService,
    private readonly llm: LlmClient,
    private readonly questionService: TuitionQuestionService,
  ) {}

  /** 选知识点名（解析 legacy → 查库，失败仅回退为 null，不影响存在性判断）。 */
  private async _kpName(kpId: string): Promise<string | undefined> {
    const uuid = await this.questionService.resolveKnowledgePointId(kpId);
    if (!uuid) return undefined;
    return (await findKnowledgePointName(eduQuery(this.db), uuid)) ?? undefined;
  }

  /** 建会话：写行 + 装载题库 + 返回 FSM 实例。owner=userId。 */
  async createSession(userId: string, knowledgePointId: string): Promise<SessionFsm> {
    // 先解析 legacy→uuid（_etl_entity_map），得到确定的知识点 UUID 再落行，
    // 避免在一条 SQL 里混用 `id = $n::uuid OR legacy_id = $n`（$n 被定型为 uuid 会炸 varchar 支）。
    const kpUuid = await this.questionService.resolveKnowledgePointId(knowledgePointId);
    const kpName = await this._kpName(knowledgePointId);
    const insert = await insertSession(eduQuery(this.db), userId, kpUuid, knowledgePointId);
    const sessionId = insert?.session_id as string;

    let fsm: SessionFsm;
    fsm = new SessionFsm(sessionId, userId, knowledgePointId, this.llm, this.questionService, () =>
      this.flush(sessionId, userId, fsm),
      kpName,
    );
    // 题库装配
    fsm.diagnosisQuestions = await this.questionService.getDiagnosisQuestions(knowledgePointId);
    fsm.quizQuestions = await this.questionService.getQuizQuestions(knowledgePointId, 5);
    await this.flush(sessionId, userId, fsm);
    return fsm;
  }

  /** 按会话行加载（必须校验 user_id 所有权）。无行/他人会话 → NotFound。 */
  async loadSession(userId: string, sessionId: string): Promise<SessionFsm> {
    const row = await findSessionOwned(eduQuery(this.db), sessionId, userId);
    if (!row) {
      throw new NotFoundException('会话不存在或无权访问');
    }
    let fsm: SessionFsm;
    fsm = new SessionFsm(row.id, row.user_id, row.session_data?.knowledgePointId ?? '', this.llm, this.questionService, () =>
      this.flush(row.id, userId, fsm),
      row.session_data?.selectedKpName,
    );
    fsm.restore(row.session_data);
    // 重建题库（与 create 一致，避免空会话无题可答）
    fsm.diagnosisQuestions = await this.questionService.getDiagnosisQuestions(fsm.knowledgePointId);
    fsm.quizQuestions = await this.questionService.getQuizQuestions(fsm.knowledgePointId, 5);
    return fsm;
  }

  /** 把 FSM 状态整段写回 session_data（幂等覆盖）。 */
  async flush(sessionId: string, userId: string, fsm: SessionFsm): Promise<void> {
    const data = {
      ...fsm.toSnapshot(),
      knowledgePointId: fsm.knowledgePointId,
      selectedKpName: fsm.selectedKpName ?? null,
    };
    await flushSession(eduQuery(this.db), { sessionId, userId, phase: fsm.phase, data: JSON.stringify(data) });
  }
}