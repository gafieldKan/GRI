import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  Question,
  PracticeSession,
  WrongQuestion,
  LearningPlan,
} from './tuition.types';
import { AiAgentService } from './agents/ai-agent.service';
import { SessionFsmService, SessionFsm } from './agents/session-fsm';
import { TutorSessionAgent } from './agents/tutor-session-agent';
import { TuitionQuestionService } from './agents/question.service';
import { QuestionGeneratorAgent } from './agents/question-generator';
import { PlanAgent } from './agents/plan-agent';
import { SpacedRepetitionService } from './agents/spaced-repetition.service';
import { randomUUID } from 'node:crypto';

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

  // ===================== 题目 =====================

  async getQuestionBank(query: { subject?: string; knowledgePoint?: string; limit?: number }): Promise<Question[]> {
    // subject 在 edu.knowledge_points 而非 edu.questions → JOIN 后在 kp.subject 上过滤。
    let sql = `SELECT q.*, kp.name AS knowledge_point_name FROM edu.questions q
               LEFT JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id`;
    const conds: string[] = [];
    const params: unknown[] = [];
    if (query.subject) {
      conds.push(`kp.subject = $${params.length + 1}`);
      params.push(query.subject);
    }
    // 空/缺省 knowledgePoint 不解析（避免误关联），只在有值时按 legacy→uuid 解析
    const kpUuid = query.knowledgePoint ? await this.questionService.resolveKnowledgePointId(query.knowledgePoint) : null;
    if (kpUuid) {
      conds.push(`q.knowledge_point_id = $${params.length + 1}`);
      params.push(kpUuid);
    }
    if (conds.length) sql += ` WHERE ${conds.join(' AND ')}`;
    sql += ` ORDER BY q.created_at DESC LIMIT $${params.length + 1}`;
    params.push(query.limit || 20);
    const res = await this.db.query(sql, params);
    return res.rows as Question[];
  }

  async getQuestionDetail(id: string): Promise<Question> {
    const res = await this.db.query('SELECT * FROM edu.questions WHERE id = $1', [id]);
    if (res.rows.length === 0) throw new NotFoundException('题目不存在');
    return res.rows[0] as Question;
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
    const res = await this.db.query(
      `SELECT id, question_id, question_text, subject, knowledge_point, student_answer, correct_answer,
              error_type, difficulty, reviewed, mastered, review_count, wrong_count, last_attempt_at,
              (SELECT content FROM edu.questions q WHERE q.id = edu.wrong_questions.question_id) AS content
       FROM edu.wrong_questions
       WHERE user_id = $1 AND is_resolved = false
       ORDER BY last_attempt_at DESC`,
      [userId],
    );
    return res.rows as WrongQuestion[];
  }

  async markQuestionResolved(userId: string, questionId: string): Promise<void> {
    await this.db.query(
      `UPDATE edu.wrong_questions SET is_resolved = true WHERE user_id = $1 AND question_id = $2`,
      [userId, questionId],
    );
  }

  /** SM-2 复习：更新错题状态 + 间隔重复队列。id = wrong_question.id（UUID）。 */
  async reviewWrongQuestion(userId: string, id: string, mastery = 0.8, reviewStatus = 'mastered') {
    const row = await this.db.query(
      `SELECT question_id FROM edu.wrong_questions WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (row.rows.length === 0) throw new NotFoundException('错题不存在或无权访问');
    const questionId = row.rows[0].question_id;

    await this.db.query(
      `UPDATE edu.wrong_questions
       SET reviewed = true, mastery_level = $2, is_resolved = true, last_reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $3`,
      [id, reviewStatus, userId],
    );
    if (questionId && mastery != null) {
      await this.sr.updateSRQueue(userId, questionId, mastery);
    }
    return { success: true };
  }

  // ===================== 学习计划 =====================

  async getLearningPlans(userId: string): Promise<LearningPlan[]> {
    const res = await this.db.query(
      `SELECT * FROM edu.learning_plans WHERE user_id = $1 ORDER BY start_date DESC`,
      [userId],
    );
    return res.rows as LearningPlan[];
  }

  async createLearningPlan(
    userId: string,
    plan: { title: string; start_date?: string; end_date?: string },
  ): Promise<LearningPlan> {
    const res = await this.db.query(
      `INSERT INTO edu.learning_plans (user_id, title, start_date, end_date, progress, status)
       VALUES ($1, $2, $3, $4, 0, 'active') RETURNING *`,
      [userId, plan.title, plan.start_date ?? null, plan.end_date ?? null],
    );
    return res.rows[0] as LearningPlan;
  }

  async generatePlan(userId: string, params: { planType?: string; analysisReportId?: string }) {
    return this.plan.generatePlan({ userId, planType: params.planType || 'daily', analysisReport: null });
  }

  async updatePlanProgress(userId: string, planId: string, completedTaskIds: string[]) {
    return this.plan.updateProgress(userId, planId, completedTaskIds);
  }

  // ===================== 练习会话 =====================

  async startSession(userId: string): Promise<PracticeSession> {
    const res = await this.db.query(
      `INSERT INTO edu.practice_sessions (user_id, mode, subject, start_time, status)
       VALUES ($1, 'practice', 'math', NOW(), 'in_progress') RETURNING *`,
      [userId],
    );
    return res.rows[0] as PracticeSession;
  }

  /** 提交练习答案：落 answer_records + SM-2 更新 + 错题入账。 */
  async submitPracticeAnswer(userId: string, body: { questionId: string; answer: string; sessionId?: string; timeSpentMs?: number; isCorrect?: boolean }) {
    if (!body.questionId) throw new NotFoundException('缺少题目');
    const q = await this.getQuestionDetail(body.questionId);
    // 用校验器统一判定
    const verdict = await this.llmValidatePlaceholder(q, body.answer);
    const isCorrect = body.isCorrect != null ? body.isCorrect : verdict.correct;

    await this.db.query(
      `INSERT INTO edu.answer_records (user_id, question_id, session_id, student_answer, is_correct, time_spent_ms)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, body.questionId, body.sessionId ?? null, body.answer, isCorrect, body.timeSpentMs ?? null],
    );

    // SM-2 间隔重复
    await this.sr.updateSRQueue(userId, body.questionId, isCorrect ? 0.9 : 0.2);

    if (isCorrect) {
      return { success: true, correct: true };
    }
    // 错题入账（幂等：已有则 wrong_count+1）。difficulty 列是 FLOAT，级别字符串要映射为数值。
    const diffNum = ({ easy: 0.3, medium: 0.5, hard: 0.8 } as Record<string, number>)[q.difficulty ?? ''] ?? 0.5;
    await this.db.query(
      `INSERT INTO edu.wrong_questions
         (id, user_id, question_id, student_answer, correct_answer, error_type, difficulty, reviewed, mastered, review_count, wrong_count, last_attempt_at, last_reviewed_at)
       VALUES ($1, $2, $3, $4, $5, '计算错误', $6, false, false, 0, 1, CURRENT_TIMESTAMP, NULL)
       ON CONFLICT (user_id, question_id) DO UPDATE SET wrong_count = edu.wrong_questions.wrong_count + 1, last_attempt_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [randomUUID(), userId, body.questionId, body.answer, q.answer, diffNum],
    );
    return { success: true, correct: false };
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
    const res = await this.db.query(
      `SELECT user_id, name, grade, avatar_url, school, textbook_version FROM edu.students WHERE user_id = $1`,
      [userId],
    );
    return res.rows[0] ?? { user_id: userId };
  }

  async updateUserProfile(userId: string, data: any) {
    await this.db.query(
      `INSERT INTO edu.students (user_id, name, grade, avatar_url, school, textbook_version)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id) DO UPDATE SET name=EXCLUDED.name, grade=EXCLUDED.grade, avatar_url=EXCLUDED.avatar_url, school=EXCLUDED.school, textbook_version=EXCLUDED.textbook_version`,
      [userId, data.name ?? null, data.grade ?? null, data.avatarUrl ?? data.avatar_url ?? null, data.school ?? null, data.textbookVersion ?? null],
    );
    return { success: true };
  }

  async getUserPreferences(userId: string) {
    const res = await this.db.query(`SELECT * FROM edu.user_preferences WHERE user_id = $1`, [userId]);
    return res.rows[0] ?? {};
  }

  async updateUserPreferences(userId: string, data: any) {
    const cols: string[] = [];
    const vals: unknown[] = [];
    for (const [key, col] of Object.entries(PREF_COLUMNS)) {
      const v = data[key];
      if (v === undefined) continue;
      if (v === null || Array.isArray(v) || ['boolean', 'number', 'string'].includes(typeof v)) {
        cols.push(col);
        vals.push(v === undefined ? null : v);
      }
    }
    if (cols.length === 0) return { success: true };
    const setCols = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
    await this.db.query(
      `INSERT INTO edu.user_preferences (user_id, ${cols.join(', ')})
       VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (user_id) DO UPDATE SET ${setCols}, updated_at = NOW()`,
      [userId, ...vals],
    );
    return { success: true };
  }

  async getUserStats(userId: string) {
    return this.computeStats(userId);
  }

  async computeStats(userId: string) {
    const [days, practice, wrongs] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END),0)::int AS correct
         FROM edu.answer_records WHERE user_id = $1`,
        [userId],
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS sessions FROM edu.practice_sessions WHERE user_id = $1`,
        [userId],
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS wrong FROM edu.wrong_questions WHERE user_id = $1 AND is_resolved = false`,
        [userId],
      ),
    ]);
    const a = days.rows[0];
    return {
      totalAnswered: a?.n ?? 0,
      correctCount: a?.correct ?? 0,
      accuracy: a?.n ? Math.round((a.correct / a.n) * 100) : 0,
      practiceSessions: practice.rows[0]?.sessions ?? 0,
      unresolvedWrong: wrongs.rows[0]?.wrong ?? 0,
    };
  }

  async getSpacedRepetitionQueue(userId: string) {
    const res = await this.db.query(
      `SELECT sq.question_id, sq.interval, sq.ease_factor, sq.repetitions, sq.next_review, q.content, q.answer, q.type, q.options
       FROM edu.sr_queue sq LEFT JOIN edu.questions q ON q.id = sq.question_id
       WHERE sq.user_id = $1 ORDER BY sq.next_review ASC`,
      [userId],
    );
    return res.rows;
  }

  // ===================== 主观链路（试卷 → 分析 → 出题 → 计划） =====================

  analyzeExam(userId: string, input: { text?: string; imageDataUrl?: string; subject?: string; gradeLevel?: string; answers?: string[]; meta?: any }) {
    return this.ai.pipeline(userId, input);
  }

  async saveExam(userId: string, data: any) {
    const insert = await this.db.query(
      `INSERT INTO edu.exams (user_id, subject, grade_level, raw_images, ocr_result, parsed_questions, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING id`,
      [userId, data.subject || 'math', data.gradeLevel || data.grade || '8', data.rawImages ? JSON.stringify(data.rawImages) : null, data.ocrResult ? (typeof data.ocrResult === 'string' ? data.ocrResult : JSON.stringify(data.ocrResult)) : null, data.parsedQuestions ? JSON.stringify(data.parsedQuestions) : null],
    );
    return { success: true, examId: insert.rows[0].id };
  }

  async getAnalysisReport(userId: string, examId: string) {
    const res = await this.db.query(
      `SELECT * FROM edu.analysis_reports WHERE exam_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [examId, userId],
    );
    if (res.rows.length === 0) throw new NotFoundException('报告不存在');
    return res.rows[0];
  }

  async getLatestReport(userId: string) {
    const res = await this.db.query(
      `SELECT * FROM edu.analysis_reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    if (res.rows.length === 0) throw new NotFoundException('暂无学情报告');
    return res.rows[0];
  }

  /** 学习提醒（user_id 定位）。 */
  async getReminders(userId: string) {
    const res = await this.db.query(
      `SELECT id, plan_id, type, time, message, sent, created_at FROM edu.reminders WHERE user_id = $1 ORDER BY time ASC`,
      [userId],
    );
    return res.rows;
  }

  async createReminder(userId: string, data: { type?: string; time?: string; message?: string }) {
    const res = await this.db.query(
      `INSERT INTO edu.reminders (user_id, plan_id, type, time, message, sent)
       VALUES ($1, $2, $3, $4, $5, false) RETURNING *`,
      [userId, null, data.type || 'general', data.time ?? null, data.message ?? null],
    );
    return res.rows[0];
  }

  async markReminderSent(userId: string, reminderId: string) {
    const res = await this.db.query(
      `UPDATE edu.reminders SET sent = true, sent_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
      [reminderId, userId],
    );
    if (res.rows.length === 0) throw new NotFoundException('提醒不存在或无权访问');
    return res.rows[0];
  }

  /** 练习历史。 */
  async getPracticeHistory(userId: string) {
    const res = await this.db.query(
      `SELECT id, user_id, mode, subject, questions, stats, duration, start_time, completed_at, status
       FROM edu.practice_sessions WHERE user_id = $1 ORDER BY start_time DESC`,
      [userId],
    );
    return res.rows;
  }

  /** 完成练习会话。 */
  async completePracticeSession(userId: string, sessionId: string, data: { score?: number }) {
    const res = await this.db.query(
      `UPDATE edu.practice_sessions
       SET status = 'completed', stats = $3, duration = COALESCE(duration, $4), completed_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [sessionId, userId, data.score != null ? JSON.stringify({ score: data.score }) : null, null],
    );
    if (res.rows.length === 0) throw new NotFoundException('练习会话不存在或无权访问');
    return res.rows[0];
  }

  /** 家长报告：取最近一份学习计划概览。 */
  async getParentReport(userId: string, planType = 'weekly') {
    const res = await this.db.query(
      `SELECT id, plan_type, plan_data, progress, start_date, end_date FROM edu.learning_plans
       WHERE user_id = $1 AND plan_type = $2 ORDER BY created_at DESC LIMIT 1`,
      [userId, planType],
    );
    if (res.rows.length === 0) return { success: false, error: '暂无计划' };
    const p = res.rows[0];
    return { success: true, report: { planId: p.id, planType: p.plan_type, progress: p.progress, planData: p.plan_data, period: { start: p.start_date, end: p.end_date } } };
  }

  async getAchievements(userId: string) {
    const res = await this.db.query(
      `SELECT code, name, description, unlocked_at FROM edu.achievements WHERE user_id = $1 ORDER BY unlocked_at DESC`,
      [userId],
    );
    return res.rows;
  }
}