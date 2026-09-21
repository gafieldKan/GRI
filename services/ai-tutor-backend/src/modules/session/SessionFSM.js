/**
 * AI 教学会话 (Session)
 * LLM 直驱 4 阶段: welcome → diagnosis → teaching → quizzing → done
 */

import { AIService } from '../ai/AIService.js';

export class SessionFSM {
  constructor(sessionId, studentId, knowledgePointId, aiService, questionService) {
    this.sessionId = sessionId;
    this.studentId = studentId;
    this.knowledgePointId = knowledgePointId;
    this.aiService = aiService || new AIService();
    this.questionService = questionService || null;
    this.phase = 'welcome';
    this.questionsLoaded = false;

    this.interactionHistory = [];
    this.diagnosisQuestions = [];
    this.diagnosisAnswers = [];
    this.diagnosisResult = null;
    this.quizQuestions = [];
    this.quizAnswers = [];
    this.quizResult = null;
    this.masteryLevel = 0;
    this._sentQuestionIds = new Set();
    this._loadQuestions();
  }

  async _loadQuestions() {
    if (!this.questionService) {
      this.questionsLoaded = true;
      return;
    }
    try {
      this.diagnosisQuestions = await this.questionService.getDiagnosisQuestions(this.knowledgePointId);
      this.quizQuestions = await this.questionService.getQuizQuestions(this.knowledgePointId, 5);
      console.log(`[Session] 题目加载: 诊断${this.diagnosisQuestions.length}题, 测验${this.quizQuestions.length}题`);
    } catch (e) {
      console.error('[Session] 题目加载失败:', e);
    }
    this.questionsLoaded = true;
  }

  getState() {
    return {
      sessionId: this.sessionId,
      state: this.phase,  // 前端兼容：state=phase
      phase: this.phase,
      context: {
        knowledgePointId: this.knowledgePointId,
        masteryLevel: this.masteryLevel,
        interactionCount: this.interactionHistory.length
      }
    };
  }

  getCurrentQuestion() {
    if (this.phase === 'diagnosis') {
      const idx = this.diagnosisAnswers.length;
      return this.diagnosisQuestions[idx] || null;
    }
    if (this.phase === 'quizzing') {
      const idx = this.quizAnswers.length;
      return this.quizQuestions[idx] || null;
    }
    return null;
  }

  /**
   * 核心：处理用户消息 — 一次 LLM 调用完成分析+回复+阶段判断
   */
  async handleUserMessage(content) {
    console.log(`[Session] 用户消息 (${this.phase}): ${content?.substring(0, 50)}...`);
    this.interactionHistory.push({ role: 'user', content, timestamp: Date.now() });

    const currentQuestion = this.getCurrentQuestion();
    const diagProgress = this.phase === 'diagnosis'
      ? { answered: this.diagnosisAnswers.length, total: this.diagnosisQuestions.length }
      : null;
    const quizProgress = this.phase === 'quizzing'
      ? { answered: this.quizAnswers.length, total: this.quizQuestions.length }
      : null;

    // 一次 LLM 调用
    const llm = await this.aiService.generateTeachingResponse({
      phase: this.phase,
      knowledgePoint: this.knowledgePointId,
      conversationHistory: this.interactionHistory,
      userMessage: content,
      currentQuestion,
      diagnosisProgress: diagProgress,
      quizProgress,
      diagnosisResult: this.diagnosisResult,
    });

    if (!llm) {
      return this._fallback(content);
    }

    console.log(`[Session] LLM: phase=${llm.phase}, action=${llm.action}, answerCorrect=${llm.answerCorrect}`);

    // 本地校验并执行 LLM 的判定
    const result = { success: true, phase: llm.phase };

    // 答案提交处理
    if (llm.action === 'evaluate_answer' && llm.answerCorrect != null) {
      result._answerCorrect = llm.answerCorrect;
      const studentAnswer = llm.studentAnswer || content;

      if (this.phase === 'diagnosis') {
        this._recordAnswer(this.diagnosisAnswers, studentAnswer, llm.answerCorrect, currentQuestion);
        const nextQ = this.getCurrentQuestion();
        if (!nextQ && this.diagnosisQuestions.length > 0) {
          // 诊断完成
          const correctCount = this.diagnosisAnswers.filter(a => a.isCorrect).length;
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
          const correctCount = this.quizAnswers.filter(a => a.isCorrect).length;
          const correctRate = correctCount / this.quizAnswers.length;
          this.quizResult = { correctCount, total: this.quizAnswers.length, correctRate };
          result.quizResult = this.quizResult;
          result.phase = 'done';
          this.phase = 'done';
        }
      } else {
        // 在 teaching 阶段回答 — 不改变阶段，由 LLM 回复处理
      }
    }

    // 阶段切换 — 仅在本地上锁（诊断题没做完不能跳到 teaching）
    const llmPhase = llm.phase;
    if (llmPhase === 'diagnosis' && this.phase === 'welcome') {
      this.phase = 'diagnosis';
      result.phase = 'diagnosis';
    } else if (llmPhase === 'teaching' && this.phase === 'diagnosis') {
      // LLM 判断应该到 teaching（如 skip_diagnosis），本地校验
      if (this.diagnosisAnswers.length < this.diagnosisQuestions.length) {
        // 用户明确跳过，允许
        const skipped = /直接教学|跳过|讲给我听|不能|不知道|先回答/.test(content);
        if (skipped) {
          this.phase = 'teaching';
          result.phase = 'teaching';
        }
        // 否则保持 diagnosis
      } else {
        this.phase = 'teaching';
      }
    } else if (llmPhase === 'quizzing' && this.phase === 'teaching') {
      this.phase = 'quizzing';
    } else if (llmPhase === 'done' && (this.phase === 'quizzing' || this.phase === 'teaching')) {
      this.phase = 'done';
    }

    // LLM 回复始终优先
    result.message = llm.suggestedResponse || '请继续学习';
    result._analysis = llm.analysis;

    // 前端兼容：state=phase
    result.state = result.phase || this.phase;

    // 推送题目 (去重：已发送的题目不再重复推送)
    if (llm.action === 'ask_question' && this.phase === 'diagnosis') {
      const nextQ = this.getCurrentQuestion();
      if (nextQ && !this._sentQuestionIds.has(nextQ.id)) {
        this._sentQuestionIds.add(nextQ.id);
        result.questions = [{ id: nextQ.id, content: nextQ.content, type: nextQ.type, options: nextQ.options, difficulty: nextQ.difficulty }];
      }
    }
    if (llm.action === 'give_quiz' || (llm.action === 'ask_question' && this.phase === 'quizzing')) {
      const newQs = this.quizQuestions.filter(q => !this._sentQuestionIds.has(q.id));
      newQs.forEach(q => this._sentQuestionIds.add(q.id));
      if (newQs.length > 0) result.questions = newQs.map(q => ({ id: q.id, content: q.content, type: q.type, options: q.options, difficulty: q.difficulty }));
    }

    return result;
  }

  _recordAnswer(answers, studentAnswer, isCorrect, question) {
    answers.push({
      content: studentAnswer,
      isCorrect,
      questionId: question?.id,
      timestamp: Date.now()
    });
  }

  /**
   * 降级：LLM 不可用时的关键词检测
   */
  _fallback(content) {
    const lower = (content || '').toLowerCase();
    const currentQuestion = this.getCurrentQuestion();
    const isAnswer = /我选择|答案是|^[abcd]$/i.test(content.trim());

    // 答案提交
    if (isAnswer && currentQuestion && (this.phase === 'diagnosis' || this.phase === 'quizzing')) {
      const result = this.aiService.validateAnswer(currentQuestion, content);
      if (this.phase === 'diagnosis') {
        this.diagnosisAnswers.push({ content, isCorrect: result.correct, questionId: currentQuestion.id });
        if (this.diagnosisAnswers.length >= this.diagnosisQuestions.length) {
          const cc = this.diagnosisAnswers.filter(a => a.isCorrect).length;
          this.diagnosisResult = { correctCount: cc, total: this.diagnosisAnswers.length, correctRate: cc / this.diagnosisAnswers.length };
          this.phase = 'teaching';
          return { success: true, state: 'teaching', phase: 'teaching', message: result.explanation, diagnosisResult: this.diagnosisResult };
        }
        return { success: true, state: 'diagnosis', phase: 'diagnosis', message: result.explanation };
      }
      if (this.phase === 'quizzing') {
        this.quizAnswers.push({ content, isCorrect: result.correct, questionId: currentQuestion.id });
        if (this.quizAnswers.length >= this.quizQuestions.length) {
          const cc = this.quizAnswers.filter(a => a.isCorrect).length;
          this.quizResult = { correctCount: cc, total: this.quizAnswers.length, correctRate: cc / this.quizAnswers.length };
          this.phase = 'done';
          return { success: true, state: 'done', phase: 'done', message: result.explanation, quizResult: this.quizResult };
        }
        return { success: true, state: 'quizzing', phase: 'quizzing', message: result.explanation };
      }
      return { success: true, state: this.phase, phase: this.phase, message: '收到答案' };
    }

    // 阶段切换关键词
    if (this.phase === 'welcome') {
      this.phase = 'diagnosis';
      const newQs = this.diagnosisQuestions.filter(q => !this._sentQuestionIds.has(q.id));
      newQs.forEach(q => this._sentQuestionIds.add(q.id));
      const qs = newQs.map(q => ({ id: q.id, content: q.content, type: q.type, options: q.options, difficulty: q.difficulty }));
      return { success: true, state: 'diagnosis', phase: 'diagnosis', message: '让我们开始诊断测试吧！', questions: qs };
    }

    if (this.phase === 'diagnosis') {
      if (/直接教学|跳过|讲给我听|不能|不知道/.test(content)) {
        this.phase = 'teaching';
        return { success: true, state: 'teaching', phase: 'teaching', message: '好的，让我直接为你讲解这个知识点。' };
      }
      // Try to evaluate as answer
      if (currentQuestion) {
        const result = this.aiService.validateAnswer(currentQuestion, content);
        this.diagnosisAnswers.push({ content, isCorrect: result.correct, questionId: currentQuestion.id });
        return { success: true, state: 'diagnosis', phase: 'diagnosis', message: result.explanation };
      }
    }

    if (this.phase === 'teaching') {
      if (/理解|懂了|明白/.test(lower)) {
        this.phase = 'quizzing';
        const newQs = this.quizQuestions.filter(q => !this._sentQuestionIds.has(q.id));
        newQs.forEach(q => this._sentQuestionIds.add(q.id));
        const qs = newQs.map(q => ({ id: q.id, content: q.content, type: q.type, options: q.options, difficulty: q.difficulty }));
        return { success: true, state: 'quizzing', phase: 'quizzing', message: '好的，来做几道题验证一下！', questions: qs };
      }
      return { success: true, state: 'teaching', phase: 'teaching', message: '请继续，有什么问题可以问我。' };
    }

    if (this.phase === 'quizzing') {
      if (currentQuestion) {
        const result = this.aiService.validateAnswer(currentQuestion, content);
        this.quizAnswers.push({ content, isCorrect: result.correct, questionId: currentQuestion.id });
        return { success: true, state: 'quizzing', phase: 'quizzing', message: result.explanation };
      }
    }

    return { success: true, state: this.phase, phase: this.phase, message: '收到你的消息' };
  }
}