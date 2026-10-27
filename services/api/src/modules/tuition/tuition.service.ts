import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  Question,
  PracticeSession,
  WrongQuestion,
  LearningPlan,
  AnswerSubmitDto,
  SessionProgressDto,
  SessionAnalysisDto,
  SessionAnalysisItem,
  KnowledgePointMastery,
  DueWrongQuestionDto,
  WrongQuestionDetailDto,
  WrongQuestionStatsDto,
} from './tuition.types';
import { AiAgentService } from './agents/ai-agent.service';
import { SessionFsmService, SessionFsm } from './agents/session-fsm';
import { TutorSessionAgent } from './agents/tutor-session-agent';
import { TuitionQuestionService } from './agents/question.service';
import { QuestionGeneratorAgent } from './agents/question-generator';
import { PlanAgent } from './agents/plan-agent';
import { SpacedRepetitionService } from './agents/spaced-repetition.service';
import { randomUUID } from 'node:crypto';
import {
  eduQuery,
  listQuestionBank,
  findQuestionById,
  listActiveWrongQuestions,
  markWrongResolvedByQuestion,
  findWrongQuestionForReview,
  markWrongQuestionReviewed,
  listDueWrongQuestions,
  findWrongQuestionDetail,
  wrongQuestionStatsAgg,
  wrongQuestionStatsByKp,
  srQueueStats,
  listLearningPlans,
  insertLearningPlanBasic,
  insertPracticeSessionBasic,
  insertPracticeSession,
  listWeaknessQuestions,
  findPracticeSessionById,
  insertPracticeAnswerRecord,
  upsertPracticeWrongQuestion,
  sessionAnswerAgg,
  sessionAnalysisRows,
  findStudentProfileCols,
  upsertStudentProfile,
  findUserPreferences,
  upsertUserPreferences,
  answerStatsAgg,
  practiceSessionCount,
  unresolvedWrongCount,
  listSrQueueWithQuestions,
  insertExam,
  findReportByExam,
  findLatestReport,
  listReminders,
  insertReminder,
  markReminderSent,
  listPracticeHistory,
  completePracticeSession,
  findLatestPlanByType,
  listAchievements,
} from '../edu-core/repository';

/**
 * 学情域统一门面。所有权铁律：一切个人数据以 `userId`（≡ req.auth.externalId）为真源，
 * handler 传入的 :studentId/:examId/:sessionId/:planId 仅作越权校验——不一致即 403/404。
 */
// user_preferences 白名单：camelCase 请求体键 → snake_case 表列。白名单同时杜绝未知键被
// 插进列名（旧实现直接拼 body 键为列名，既列名不匹配又会把任意键当 SQL 列名——不安全工作法）。
const PREF_COLUMNS: Record<string, string> = {
  dailyGoal: 'daily_goal',
  reminderTime: 'reminder_time',
  preferredSubjects: 'preferred_subjects',
  preferredDifficulty: 'preferred_difficulty',
  autoPlayAudio: 'auto_play_audio',
  showHints: 'show_hints',
  showExplanations: 'show_explanations',
  pushEnabled: 'push_enabled',
  emailEnabled: 'email_enabled',
  streakReminder: 'streak_reminder',
  weeklyReport: 'weekly_report',
  achievementAlerts: 'achievement_alerts',
  quietHoursStart: 'quiet_hours_start',
  quietHoursEnd: 'quiet_hours_end',
  soundEnabled: 'sound_enabled',
  soundVolume: 'sound_volume',
  hapticEnabled: 'haptic_enabled',
  analyticsEnabled: 'analytics_enabled',
  crashReporting: 'crash_reporting',
  personalizedAds: 'personalized_ads',
  dataSync: 'data_sync',
  autoLogin: 'auto_login',
  biometricAuth: 'biometric_auth',
  sessionTimeout: 'session_timeout',
};

@Injectable()
export class TuitionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly ai: AiAgentService,
    private readonly sessions: SessionFsmService,
    private readonly questionService: TuitionQuestionService,
    private readonly generator: QuestionGeneratorAgent,
    private readonly plan: PlanAgent,
    private readonly sr: SpacedRepetitionService,
    private readonly tutorSessionAgent: TutorSessionAgent,
  ) {}

  /** UUID 格式校验：malformed sessionId 直接 404，避免 PG uuid 解析抛错变 500。 */
  private static readonly UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // ===================== 题目 =====================

  async getQuestionBank(query: { subject?: string; knowledgePoint?: string; chapterId?: string; limit?: number }): Promise<Question[]> {
    // 空/缺省 knowledgePoint 不解析（避免误关联），只在有值时按 legacy→uuid 解析
    const kpUuid = query.knowledgePoint ? await this.questionService.resolveKnowledgePointId(query.knowledgePoint) : null;
    const rows = await listQuestionBank(eduQuery(this.db), {
      subject: query.subject,
      chapterId: query.chapterId,
      kpUuid,
      limit: query.limit || 20,
    });
    return rows as Question[];
  }

  async getQuestionDetail(id: string): Promise<Question> {
    const q = await findQuestionById(eduQuery(this.db), id);
    if (!q) throw new NotFoundException('题目不存在');
    return q as Question;
  }

  async generateQuestions(userId: string, params: any) {
    const out = await this.generator.generateQuestions(params);
    // 记录已生成题目（user_id 归属，供题库复用）
    return out;
  }

  // ===================== 教学会话（持久化 FSM） =====================

  async createSession(userId: string, knowledgePointId: string) {
    const fsm = await this.sessions.createSession(userId, knowledgePointId);
    return {
      sessionId: fsm.sessionId,
      state: fsm.phase,
      phase: fsm.phase,
      message: '会话已创建，让我们开始学习吧！',
    };
  }

  async getSessionState(userId: string, sessionId: string) {
    const fsm = await this.sessions.loadSession(userId, sessionId);
    return { sessionId: fsm.sessionId, state: fsm.phase, phase: fsm.phase, context: { knowledgePointId: fsm.knowledgePointId, masteryLevel: fsm.masteryLevel } };
  }

  async sendSessionMessage(userId: string, sessionId: string, content: string) {
    const fsm = await this.sessions.loadSession(userId, sessionId);
    // 教学行为已重组为 agent-core 技能/工具：先由 TutorSessionAgent 求出判定，再交给 FSM 执行。
    // 判定为 null（无 key / 模型未调 session.answer）→ FSM 本地关键词降级。
    const decision = await this.tutorSessionAgent.decide(fsm, content);
    return fsm.handleUserMessage(content, decision ?? null);
  }

  // ===================== 错题本 =====================

  async getWrongQuestions(userId: string): Promise<WrongQuestion[]> {
    const rows = await listActiveWrongQuestions(eduQuery(this.db), userId);
    return rows as WrongQuestion[];
  }

  async markQuestionResolved(userId: string, questionId: string): Promise<void> {
    await markWrongResolvedByQuestion(eduQuery(this.db), userId, questionId);
  }

  /** SM-2 复习：更新错题状态 + 间隔重复队列。id = wrong_question.id（UUID）。 */
  async reviewWrongQuestion(userId: string, id: string, mastery = 0.8, reviewStatus = 'mastered') {
    const row = await findWrongQuestionForReview(eduQuery(this.db), id, userId);
    if (!row) throw new NotFoundException('错题不存在或无权访问');
    // 题号可能是 NULL（AI 去规范行，migration 006 起 question_id 可空）——故判「行存在」而非「题号非空」，
    // 与旧实现（rows.length===0 才 404）逐字节等价：去规范行照常标记已复习、跳过 SR。
    const questionId = row.question_id;

    await markWrongQuestionReviewed(eduQuery(this.db), id, reviewStatus, userId);
    if (questionId && mastery != null) {
      await this.sr.updateSRQueue(userId, questionId, mastery);
    }
    return { success: true };
  }

  /**
   * 到期复习卡片流（P2-T8 ①）。
   * 数据源铁律：edu.sr_queue.next_review ≤ now（升序）——edu.wrong_questions 无 next_review_at，
   * 只借其补错误元数据（error_type/wrong_count/knowledge_point）。无 SR 记录 → 空数组，不报错。
   */
  async getDueWrongQuestions(userId: string, limit = 20): Promise<DueWrongQuestionDto[]> {
    const n = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const rows = await listDueWrongQuestions(eduQuery(this.db), userId, n);
    const now = Date.now();
    return rows.map((r: any) => {
      const nextReview = r.next_review ? new Date(r.next_review) : null;
      return {
        id: r.wrong_question_id ?? null,
        questionId: r.question_id,
        content: r.content ?? null,
        type: r.type ?? null,
        options: r.options ?? null,
        answer: r.answer ?? null,
        analysis: r.analysis ?? null,
        subject: r.subject ?? null,
        knowledgePoint: r.knowledge_point ?? null,
        errorType: r.error_type ?? null,
        wrongCount: r.wrong_count ?? 0,
        difficulty: r.wrong_difficulty ?? null,
        lastAttemptAt: r.last_attempt_at ? new Date(r.last_attempt_at) : null,
        sr: {
          interval: r.interval ?? 0,
          easeFactor: r.ease_factor ?? 2.5,
          repetitions: r.repetitions ?? 0,
          nextReview,
          lastReviewed: r.last_reviewed ? new Date(r.last_reviewed) : null,
        },
        overdueDays: nextReview ? Math.max(0, Math.floor((now - nextReview.getTime()) / 86400000)) : 0,
      };
    });
  }

  /**
   * 单条错题详情（P2-T8 ③），含 SR 参数。:id = edu.wrong_questions.id。
   * 所有权：先按 id 取行，不存在 → 404；属他人 → 403（与 loadOwnedSession 同语义）。
   */
  async getWrongQuestionById(userId: string, id: string): Promise<WrongQuestionDetailDto> {
    const r = await findWrongQuestionDetail(eduQuery(this.db), id);
    if (!r) throw new NotFoundException('错题不存在或无权访问');
    if (r.user_id !== userId) throw new ForbiddenException('无权访问他人错题');
    return {
      id: r.id,
      questionId: r.question_id ?? null,
      content: r.content ?? null,
      questionText: r.question_text ?? null,
      type: r.type ?? null,
      questionType: r.question_type ?? null,
      options: r.options ?? null,
      answer: r.answer ?? null,
      analysis: r.analysis ?? null,
      subject: r.subject ?? null,
      knowledgePoint: r.knowledge_point ?? null,
      studentAnswer: r.student_answer ?? null,
      correctAnswer: r.correct_answer ?? null,
      errorType: r.error_type ?? null,
      difficulty: r.difficulty ?? null,
      masteryLevel: r.mastery_level ?? null,
      reviewed: r.reviewed ?? false,
      mastered: r.mastered ?? false,
      isResolved: r.is_resolved ?? false,
      reviewCount: r.review_count ?? 0,
      wrongCount: r.wrong_count ?? 0,
      lastAttemptAt: r.last_attempt_at ? new Date(r.last_attempt_at) : null,
      lastReviewedAt: r.last_reviewed_at ? new Date(r.last_reviewed_at) : null,
      sr: {
        interval: r.interval ?? 0,
        easeFactor: r.ease_factor ?? 2.5,
        repetitions: r.repetitions ?? 0,
        nextReview: r.next_review ? new Date(r.next_review) : null,
        lastReviewed: r.last_reviewed ? new Date(r.last_reviewed) : null,
      },
    };
  }

  /**
   * 错题统计聚合（P2-T8 ②）：掌握度分布 + 高频错误 KP + 复习进度。
   * KP 维度：优先错题表 knowledge_point 文本，缺失回退 edu.knowledge_points.name（练习链路错题行 KP 多为空）。
   * 错误类型沿用库内中文值（N6），不做英文枚举映射。
   */
  async getWrongQuestionStats(userId: string): Promise<WrongQuestionStatsDto> {
    const [a, kps, s] = await Promise.all([
      wrongQuestionStatsAgg(eduQuery(this.db), userId),
      wrongQuestionStatsByKp(eduQuery(this.db), userId),
      srQueueStats(eduQuery(this.db), userId),
    ]);
    const total = a.total ?? 0;
    const reviewed = a.reviewed ?? 0;
    return {
      studentId: userId,
      total,
      masteryBuckets: [
        { key: 'unreviewed', label: '未复习', count: a.unreviewed ?? 0 },
        { key: 'reviewing', label: '复习中', count: a.reviewing ?? 0 },
        { key: 'mastered', label: '已掌握', count: a.mastered ?? 0 },
      ],
      topErrorKnowledgePoints: kps.map((r: any) => ({
        knowledgePoint: r.knowledge_point ?? null,
        wrongCount: r.wrong_count ?? 0,
        questionCount: r.question_count ?? 0,
      })),
      reviewProgress: {
        total,
        reviewed,
        unreviewed: total - reviewed,
        mastered: a.mastered ?? 0,
        resolved: a.resolved ?? 0,
        unresolved: a.unresolved ?? 0,
        reviewedRate: total ? Number((reviewed / total).toFixed(4)) : 0,
        scheduledCount: s.scheduled ?? 0,
        dueCount: s.due ?? 0,
      },
    };
  }

  // ===================== 学习计划 =====================

  async getLearningPlans(userId: string): Promise<LearningPlan[]> {
    return (await listLearningPlans(eduQuery(this.db), userId)) as LearningPlan[];
  }

  async createLearningPlan(
    userId: string,
    plan: { title: string; start_date?: string; end_date?: string },
  ): Promise<LearningPlan> {
    return (await insertLearningPlanBasic(eduQuery(this.db), {
      userId,
      title: plan.title,
      startDate: plan.start_date ?? null,
      endDate: plan.end_date ?? null,
    })) as LearningPlan;
  }

  async generatePlan(userId: string, params: { planType?: string; analysisReportId?: string; startDate?: string; endDate?: string; subjects?: string[] }) {
    return this.plan.generatePlan({
      userId,
      planType: params.planType,
      analysisReport: null,
      startDate: params.startDate,
      endDate: params.endDate,
      subjects: params.subjects,
    });
  }

  async updatePlanProgress(userId: string, planId: string, completedTaskIds: string[]) {
    return this.plan.updateProgress(userId, planId, completedTaskIds);
  }

  // ===================== 练习会话 =====================

  async startSession(userId: string): Promise<PracticeSession> {
    return (await insertPracticeSessionBasic(eduQuery(this.db), userId)) as PracticeSession;
  }

  /**
   * 开启一次练习会话：写入真实 practice_sessions 行（mode/subject/topicId(章节)/题面快照），
   * 返回含 uuid 的行——前端以此 id 作为 sessionId 回传 submit/complete。
   */
  async startPracticeSession(
    userId: string,
    opts: { mode?: string; subject?: string; topicId?: string; questions?: unknown[] } = {},
  ): Promise<PracticeSession> {
    return (await insertPracticeSession(eduQuery(this.db), {
      userId,
      mode: opts.mode || 'quick',
      subject: opts.subject || 'math',
      topicId: opts.topicId || null,
      questions: opts.questions,
    })) as PracticeSession;
  }

  /** 薄弱攻克：学生未解决错题 → 完整题面（含选项/答案/解析），供练习中心「薄弱攻克」模式。 */
  async getWeaknessQuestions(userId: string, limit = 15) {
    const n = Math.min(Math.max(Number(limit) || 15, 1), 50);
    return listWeaknessQuestions(eduQuery(this.db), userId, n);
  }

  /**
   * 会话归属校验（真源 userId，防 IDOR）：非 UUID/不存在 → 404；属他人 → 403。
   * 返回 practice_sessions 行供进度/分析复用。
   */
  private async loadOwnedSession(userId: string, sessionId: string): Promise<any> {
    if (!TuitionService.UUID_RE.test(sessionId)) throw new NotFoundException('练习会话不存在');
    const row = await findPracticeSessionById(eduQuery(this.db), sessionId);
    if (!row) throw new NotFoundException('练习会话不存在');
    if (row.user_id !== userId) throw new ForbiddenException('无权访问他人练习会话');
    return row;
  }

  /** 提交练习答案：落 answer_records（含真实 session_id）+ SM-2 更新 + 错题入账。 */
  async submitPracticeAnswer(userId: string, body: AnswerSubmitDto) {
    if (!body.questionId) throw new NotFoundException('缺少题目');
    // 带 sessionId 时必须归属本主（会话级进度/分析的数据源，杜绝跨用户串写）。
    if (body.sessionId) await this.loadOwnedSession(userId, body.sessionId);
    const q = await this.getQuestionDetail(body.questionId);
    // 用校验器统一判定
    const verdict = await this.llmValidatePlaceholder(q, body.answer);
    const isCorrect = body.isCorrect != null ? body.isCorrect : verdict.correct;

    await insertPracticeAnswerRecord(eduQuery(this.db), {
      userId,
      questionId: body.questionId,
      sessionId: body.sessionId ?? null,
      studentAnswer: body.answer,
      isCorrect,
      timeSpentMs: body.timeSpentMs ?? null,
    });

    // SM-2 间隔重复
    await this.sr.updateSRQueue(userId, body.questionId, isCorrect ? 0.9 : 0.2);

    if (isCorrect) {
      return { success: true, correct: true };
    }
    // 错题入账（幂等：已有则 wrong_count+1）。difficulty 列是 FLOAT，级别字符串要映射为数值。
    const diffNum = ({ easy: 0.3, medium: 0.5, hard: 0.8 } as Record<string, number>)[q.difficulty ?? ''] ?? 0.5;
    await upsertPracticeWrongQuestion(eduQuery(this.db), {
      id: randomUUID(),
      userId,
      questionId: body.questionId,
      studentAnswer: body.answer,
      correctAnswer: q.answer,
      difficulty: diffNum,
    });
    return { success: true, correct: false };
  }

  /** 会话进度：已答/总数/正确率/当前题索引。 */
  async getSessionProgress(userId: string, sessionId: string): Promise<SessionProgressDto> {
    const session = await this.loadOwnedSession(userId, sessionId);
    const agg = await sessionAnswerAgg(eduQuery(this.db), sessionId, userId);
    const answered = Number(agg?.answered ?? 0);
    const correctCount = Number(agg?.correct ?? 0);
    // total 优先取会话题面快照长度；无快照时回退为已答数（不臆造分母）。
    const planned = Array.isArray(session.questions) ? session.questions.length : 0;
    const total = planned > 0 ? planned : answered;
    return {
      sessionId,
      answered,
      total,
      correctCount,
      correctRate: answered ? correctCount / answered : 0,
      currentIndex: answered,
      status: session.status,
    };
  }

  /** 会话分析：逐题解析数组 + 按 knowledge_point_id 聚合的正确率。 */
  async getSessionAnalysis(userId: string, sessionId: string): Promise<SessionAnalysisDto> {
    await this.loadOwnedSession(userId, sessionId);
    const rows = await sessionAnalysisRows(eduQuery(this.db), sessionId, userId);
    const items: SessionAnalysisItem[] = (rows as any[]).map((r) => ({
      questionId: r.question_id,
      content: r.content ?? null,
      type: r.type ?? null,
      options: Array.isArray(r.options) ? r.options : null,
      studentAnswer: r.student_answer ?? null,
      correctAnswer: r.answer ?? null,
      isCorrect: r.is_correct ?? null,
      analysis: r.analysis ?? null,
      contentLatex: r.content_latex ?? null,
      answerLatex: r.answer_latex ?? null,
      difficulty: r.difficulty != null ? String(r.difficulty) : null,
      knowledgePointId: r.knowledge_point_id ?? null,
      knowledgePointName: r.knowledge_point_name ?? null,
      timeSpentMs: r.time_spent_ms ?? null,
    }));
    const kpMap = new Map<string, KnowledgePointMastery>();
    for (const it of items) {
      const key = it.knowledgePointId ?? '__unknown__';
      const cur = kpMap.get(key) ?? {
        knowledgePointId: it.knowledgePointId,
        knowledgePointName: it.knowledgePointName,
        answered: 0,
        correct: 0,
        correctRate: 0,
      };
      cur.answered += 1;
      if (it.isCorrect) cur.correct += 1;
      cur.correctRate = cur.answered ? cur.correct / cur.answered : 0;
      kpMap.set(key, cur);
    }
    const answered = items.length;
    const correctCount = items.filter((i) => i.isCorrect).length;
    return {
      sessionId,
      answered,
      correctCount,
      correctRate: answered ? correctCount / answered : 0,
      items,
      knowledgePoints: [...kpMap.values()],
    };
  }

  private async llmValidatePlaceholder(q: any, answer: string) {
    // 轻量判定：填空唯一数值用容差，其余精确/包含
    const correct = (q.answer ?? '').toString().trim().toLowerCase();
    const student = (answer ?? '').toString().trim().toLowerCase();
    if (!student) return { correct: false };
    if (q.type === 'fill' && correct) {
      const c = parseFloat(correct);
      const s = parseFloat(student);
      if (!isNaN(c) && !isNaN(s)) return { correct: Math.abs(c - s) / (Math.abs(c) + 0.001) < 0.01 };
    }
    return { correct: correct.includes(student) || student.includes(correct) || student === correct };
  }

  // ===================== 用户画像 =====================

  async getUserProfile(userId: string) {
    return (await findStudentProfileCols(eduQuery(this.db), userId)) ?? { user_id: userId };
  }

  async updateUserProfile(userId: string, data: any) {
    await upsertStudentProfile(eduQuery(this.db), {
      userId,
      name: data.name ?? null,
      grade: data.grade ?? null,
      avatarUrl: data.avatarUrl ?? data.avatar_url ?? null,
      school: data.school ?? null,
      textbookVersion: data.textbookVersion ?? null,
    });
    return { success: true };
  }

  async getUserPreferences(userId: string) {
    return (await findUserPreferences(eduQuery(this.db), userId)) ?? {};
  }

  async updateUserPreferences(userId: string, data: any) {
    const cols: { column: string; value: unknown }[] = [];
    for (const [key, col] of Object.entries(PREF_COLUMNS)) {
      const v = data[key];
      if (v === undefined) continue;
      if (v === null || Array.isArray(v) || ['boolean', 'number', 'string'].includes(typeof v)) {
        cols.push({ column: col, value: v === undefined ? null : v });
      }
    }
    await upsertUserPreferences(eduQuery(this.db), userId, cols);
    return { success: true };
  }

  async getUserStats(userId: string) {
    return this.computeStats(userId);
  }

  async computeStats(userId: string) {
    const [a, practiceSessions, unresolvedWrong] = await Promise.all([
      answerStatsAgg(eduQuery(this.db), userId),
      practiceSessionCount(eduQuery(this.db), userId),
      unresolvedWrongCount(eduQuery(this.db), userId),
    ]);
    return {
      totalAnswered: a?.n ?? 0,
      correctCount: a?.correct ?? 0,
      accuracy: a?.n ? Math.round((a.correct / a.n) * 100) : 0,
      practiceSessions,
      unresolvedWrong,
    };
  }

  async getSpacedRepetitionQueue(userId: string) {
    return listSrQueueWithQuestions(eduQuery(this.db), userId);
  }

  // ===================== 主观链路（试卷 → 分析 → 出题 → 计划） =====================

  analyzeExam(userId: string, input: { text?: string; imageDataUrl?: string; subject?: string; gradeLevel?: string; answers?: string[]; meta?: any }) {
    return this.ai.pipeline(userId, input);
  }

  async saveExam(userId: string, data: any) {
    const examId = await insertExam(eduQuery(this.db), {
      userId,
      subject: data.subject || 'math',
      gradeLevel: data.gradeLevel || data.grade || '8',
      rawImages: data.rawImages ? JSON.stringify(data.rawImages) : null,
      ocrResult: data.ocrResult ? (typeof data.ocrResult === 'string' ? data.ocrResult : JSON.stringify(data.ocrResult)) : null,
      parsedQuestions: data.parsedQuestions ? JSON.stringify(data.parsedQuestions) : null,
    });
    return { success: true, examId };
  }

  async getAnalysisReport(userId: string, examId: string) {
    const r = await findReportByExam(eduQuery(this.db), examId, userId);
    if (!r) throw new NotFoundException('报告不存在');
    return r;
  }

  async getLatestReport(userId: string) {
    const r = await findLatestReport(eduQuery(this.db), userId);
    if (!r) throw new NotFoundException('暂无学情报告');
    return r;
  }

  /** 学习提醒（user_id 定位）。 */
  async getReminders(userId: string) {
    return listReminders(eduQuery(this.db), userId);
  }

  async createReminder(userId: string, data: { type?: string; time?: string; message?: string }) {
    return insertReminder(eduQuery(this.db), {
      userId,
      type: data.type || 'general',
      time: data.time ?? null,
      message: data.message ?? null,
    });
  }

  async markReminderSent(userId: string, reminderId: string) {
    const r = await markReminderSent(eduQuery(this.db), reminderId, userId);
    if (!r) throw new NotFoundException('提醒不存在或无权访问');
    return r;
  }

  /** 练习历史。 */
  async getPracticeHistory(userId: string) {
    return listPracticeHistory(eduQuery(this.db), userId);
  }

  /** 完成练习会话：落答案明细 + 统计 + 用时，标记 completed。 */
  async completePracticeSession(
    userId: string,
    sessionId: string,
    data: { answers?: unknown[]; stats?: unknown; duration?: number; score?: number },
  ) {
    const stats = data.stats ?? (data.score != null ? { score: data.score } : null);
    const row = await completePracticeSession(eduQuery(this.db), {
      sessionId,
      userId,
      answers: data.answers?.length ? JSON.stringify(data.answers) : null,
      stats: stats ? JSON.stringify(stats) : null,
      duration: data.duration ?? null,
    });
    if (!row) throw new NotFoundException('练习会话不存在或无权访问');
    return row;
  }

  /** 家长报告：取最近一份学习计划概览。 */
  async getParentReport(userId: string, planType = 'weekly') {
    const p = await findLatestPlanByType(eduQuery(this.db), userId, planType);
    if (!p) return { success: false, error: '暂无计划' };
    return { success: true, report: { planId: p.id, planType: p.plan_type, progress: p.progress, planData: p.plan_data, period: { start: p.start_date, end: p.end_date } } };
  }

  async getAchievements(userId: string) {
    return listAchievements(eduQuery(this.db), userId);
  }
}
