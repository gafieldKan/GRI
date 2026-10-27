/**
 * 教育域**数据访问层** —— `edu.*` 表的唯一读写口（W2.1 单一领域组件）。
 *
 * 收敛前：`agent.service.ts` 的 16 个工具各自内联 SQL 直取 `edu.*`（判读/错题/间隔/掌握度/
 * 计划/授课…），领域知识散落在业务文件里。收敛后：**所有 `edu.*` 语句只此一处**，工具只调函数。
 *
 * 这是插件化（W2.3）的**前置条件**：工具被拆成 `agent.skill` 插件后，插件不得再嵌 SQL，
 * 否则下一次「语句迁入领域端口」会作废每一份 manifest —— 自造的第二次重写。
 *
 * **传输无关**：读写口由调用方注入（{@link EduQueryFn}），Nest `DatabaseService.query` 与
 * agent-core `Store.query` 同形皆可。**语句文本逐字保留**（含缩进），既有 spec 的
 * `fakeDb` 按 SQL 子串匹配，故迁移对测试**零可见变化**。
 *
 * 解构一律写 `const { rows = [] } = await query(...)` —— 对齐收敛前调用点的
 * `x.rows || []` / `x.rows?.[0]` 防御（端口返回对象但缺 `rows` 键时降级为空集，而非抛 TypeError）。
 */

/** 注入式读写口（`DatabaseService.query` / agent-core `Store.query` 同形）。 */
export type EduQueryFn = (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }>;

/** 把任意 store（`{ query }`：`DatabaseService` / agent-core `Store` / 工具 `ctx.store`）拧成 {@link EduQueryFn}。 */
export function eduQuery(store: any): EduQueryFn {
  return (sql: string, params?: any[]) => store.query(sql, params);
}

// ---------------------------------------------------------------------------
// 题目 edu.questions
// ---------------------------------------------------------------------------

/** 取完整题目（含 type/answer，供判读）。 */
export const QUESTION_BY_ID_SQL = 'SELECT * FROM edu.questions WHERE id = $1';

export async function findQuestionById(query: EduQueryFn, questionId: string): Promise<any | null> {
  const { rows = [] } = await query(QUESTION_BY_ID_SQL, [questionId]);
  return rows[0] ?? null;
}

/** 按学科抽题（题库，供出题/诊断）——JOIN 知识点取学科名过滤。 */
export const QUESTIONS_BY_SUBJECT_SQL = `SELECT q.id, q.content, q.type, q.options, q.answer, q.difficulty, kp.name AS knowledge_point
               FROM edu.questions q
               LEFT JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id
              WHERE LOWER(kp.subject) = LOWER($1)
              ORDER BY random()
              LIMIT $2`;

export async function listQuestionsBySubject(query: EduQueryFn, subject: string, limit: number): Promise<any[]> {
  const { rows = [] } = await query(QUESTIONS_BY_SUBJECT_SQL, [subject, limit]);
  return rows;
}

/** 按知识点抽题（只出题面，供专项练习/例题/温习任务）。 */
export const QUESTIONS_BY_KP_SQL = `SELECT q.id, q.content, q.type, q.options, q.difficulty, kp.name AS knowledge_point
         FROM edu.questions q
         LEFT JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id
        WHERE q.knowledge_point_id = $1
        ORDER BY random()
        LIMIT $2`;

export async function listQuestionsByKp(query: EduQueryFn, kpId: string, limit: number): Promise<any[]> {
  const { rows = [] } = await query(QUESTIONS_BY_KP_SQL, [kpId, limit]);
  return rows;
}

/** 按知识点随机抽一道真题（授课 example/drill、计划温习任务）。 */
export const RANDOM_QUESTION_BY_KP_SQL = `SELECT q.id AS question_id, q.content, q.type, q.options, q.difficulty
                 FROM edu.questions q
                WHERE q.knowledge_point_id = $1
                ORDER BY random() LIMIT 1`;

export async function findRandomQuestionByKp(query: EduQueryFn, kpId: string): Promise<any | null> {
  const { rows = [] } = await query(RANDOM_QUESTION_BY_KP_SQL, [kpId]);
  return rows[0] ?? null;
}

/** 只取题目 id（计划温习任务抽一题）。 */
export const QUESTION_ID_BY_KP_SQL = `SELECT id FROM edu.questions WHERE knowledge_point_id = $1 ORDER BY random() LIMIT 1`;

export async function findQuestionIdByKp(query: EduQueryFn, kpId: string): Promise<string | null> {
  const { rows = [] } = await query(QUESTION_ID_BY_KP_SQL, [kpId]);
  return rows[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// 作答记录 edu.answer_records
// ---------------------------------------------------------------------------

/** 落一条作答（session_id 恒 NULL：会话关联未启用）。 */
export const INSERT_ANSWER_RECORD_SQL = `INSERT INTO edu.answer_records (user_id, question_id, session_id, student_answer, is_correct, time_spent_ms)
       VALUES ($1, $2, NULL, $3, $4, $5)`;

export async function insertAnswerRecord(
  query: EduQueryFn,
  input: { userId: string; questionId: string; studentAnswer: unknown; isCorrect: boolean; timeSpentMs?: number | null },
): Promise<void> {
  const spent = input.timeSpentMs != null && input.timeSpentMs > 0 ? Math.round(input.timeSpentMs) : null;
  await query(INSERT_ANSWER_RECORD_SQL, [input.userId, input.questionId, String(input.studentAnswer ?? ''), input.isCorrect, spent]);
}

/** 该KP该生最近一次答错的写法（授课 teach 的通用错因回退）。 */
export const LAST_WRONG_ANSWER_SQL = `SELECT ar.student_answer
                   FROM edu.answer_records ar
                   JOIN edu.questions q ON q.id = ar.question_id
                  WHERE ar.user_id = $1 AND q.knowledge_point_id = $2 AND ar.is_correct = false
                  ORDER BY ar.created_at DESC NULLS LAST LIMIT 1`;

export async function findLastWrongAnswer(query: EduQueryFn, userId: string, kpId: string): Promise<string | null> {
  const { rows = [] } = await query(LAST_WRONG_ANSWER_SQL, [userId, kpId]);
  return rows[0]?.student_answer ?? null;
}

// ---------------------------------------------------------------------------
// 掌握度聚合（读 edu.answer_records JOIN edu.questions[/knowledge_points]）
// ---------------------------------------------------------------------------

/** per-KP 作答聚合（kp_id/kp_name/attempts/correct）——自适应复习序列的排序依据。 */
export const MASTERY_BY_KNOWLEDGE_POINT_SQL = `SELECT kp.id AS kp_id, kp.name AS kp_name,
                    COUNT(ar.id)::int AS attempts,
                    COUNT(ar.id) FILTER (WHERE ar.is_correct)::int AS correct
               FROM edu.answer_records ar
               JOIN edu.questions q ON q.id = ar.question_id
               JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id
              WHERE ar.user_id = $1
              GROUP BY kp.id, kp.name`;

export async function masteryByKnowledgePoint(query: EduQueryFn, userId: string): Promise<any[]> {
  const { rows = [] } = await query(MASTERY_BY_KNOWLEDGE_POINT_SQL, [userId]);
  return rows;
}

/** per-KP 作答聚合 + 平均用时——诊断快照（avg_time_ms 供面板展示）。 */
export const MASTERY_BY_KNOWLEDGE_POINT_WITH_TIME_SQL = `SELECT kp.id AS kp_id, kp.name AS kp_name,
                    COUNT(ar.id)::int AS attempts,
                    COUNT(ar.id) FILTER (WHERE ar.is_correct)::int AS correct,
                    ROUND(AVG(ar.time_spent_ms))::int AS avg_time_ms
               FROM edu.answer_records ar
               JOIN edu.questions q ON q.id = ar.question_id
               JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id
              WHERE ar.user_id = $1
              GROUP BY kp.id, kp.name`;

export async function masteryByKnowledgePointWithTime(query: EduQueryFn, userId: string): Promise<any[]> {
  const { rows = [] } = await query(MASTERY_BY_KNOWLEDGE_POINT_WITH_TIME_SQL, [userId]);
  return rows;
}

/** 按题目所属 KP 聚合（无 kp 名）——错题冲刺的「最弱知识点优先」排序依据。 */
export const MASTERY_BY_QUESTION_KP_SQL = `SELECT q.knowledge_point_id AS kp_id,
                      COUNT(ar.id)::int AS attempts,
                      COUNT(ar.id) FILTER (WHERE ar.is_correct)::int AS correct
                 FROM edu.answer_records ar
                 JOIN edu.questions q ON q.id = ar.question_id
                WHERE ar.user_id = $1
                GROUP BY q.knowledge_point_id`;

export async function masteryByQuestionKp(query: EduQueryFn, userId: string): Promise<any[]> {
  const { rows = [] } = await query(MASTERY_BY_QUESTION_KP_SQL, [userId]);
  return rows;
}

/** 单个 KP 的作答聚合（授课 assess 摸底；LEFT JOIN 保证零作答也出该 KP 行）。 */
export const MASTERY_BY_SINGLE_KP_SQL = `SELECT kp.id AS kp_id, kp.name AS kp_name,
                        COUNT(ar.id)::int AS attempts,
                        COUNT(ar.id) FILTER (WHERE ar.is_correct)::int AS correct
                   FROM edu.knowledge_points kp
                   LEFT JOIN edu.questions q ON q.knowledge_point_id = kp.id
                   LEFT JOIN edu.answer_records ar ON ar.question_id = q.id AND ar.user_id = $1
                  WHERE kp.id = $2
                  GROUP BY kp.id, kp.name`;

export async function masteryBySingleKp(query: EduQueryFn, userId: string, kpId: string): Promise<any | null> {
  const { rows = [] } = await query(MASTERY_BY_SINGLE_KP_SQL, [userId, kpId]);
  return rows[0] ?? null;
}

/** 单个 KP 的练习计数（授课回授掌握度：答对/总次）。 */
export const PRACTICE_AGG_BY_KP_SQL = `SELECT COUNT(ar.id) FILTER (WHERE ar.is_correct)::int AS correct, COUNT(ar.id)::int AS attempts
                 FROM edu.answer_records ar
                 JOIN edu.questions q ON q.id = ar.question_id
                WHERE ar.user_id = $1 AND q.knowledge_point_id = $2`;

export async function practiceAggByKp(query: EduQueryFn, userId: string, kpId: string): Promise<{ correct: number; attempts: number }> {
  const { rows = [] } = await query(PRACTICE_AGG_BY_KP_SQL, [userId, kpId]);
  const r = rows[0] ?? {};
  return { correct: r.correct || 0, attempts: r.attempts || 0 };
}

/** 按天分桶的 per-KP 掌握度时间序列（progress.trend）。 */
export const DAILY_MASTERY_SERIES_SQL = `SELECT q.knowledge_point_id AS kp_id, kp.name AS kp_name,
                    date_trunc('day', ar.created_at)::date AS day,
                    COUNT(*)::int AS attempts,
                    COUNT(ar.id) FILTER (WHERE ar.is_correct)::int AS correct
               FROM edu.answer_records ar
               JOIN edu.questions q ON q.id = ar.question_id
               JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id
              WHERE ar.user_id = $1
              GROUP BY q.knowledge_point_id, kp.name, date_trunc('day', ar.created_at)
              ORDER BY day ASC`;

export async function dailyMasterySeries(query: EduQueryFn, userId: string): Promise<any[]> {
  const { rows = [] } = await query(DAILY_MASTERY_SERIES_SQL, [userId]);
  return rows;
}

/** 复习候选题目 + 每题间隔信号（作答距时 + sr_queue.next_review，均按 user 隔离）。 */
export const REVIEW_CANDIDATES_SQL = `SELECT q.id AS question_id, q.content, q.type, q.options, q.difficulty, q.knowledge_point_id,
                    MAX(CASE WHEN ar.created_at IS NOT NULL THEN ar.created_at ELSE NULL END) AS last_attempt_at,
                    MAX(CASE WHEN ar.is_correct = false THEN ar.created_at END) AS last_wrong_at,
                    MAX(sq.next_review) AS next_review
               FROM edu.questions q
               LEFT JOIN edu.answer_records ar
                 ON ar.question_id = q.id AND ar.user_id = $1
               LEFT JOIN edu.sr_queue sq
                 ON sq.question_id = q.id AND sq.user_id = $1
              WHERE q.knowledge_point_id = ANY($2::uuid[])
              GROUP BY q.id, q.knowledge_point_id`;

export async function listReviewCandidates(query: EduQueryFn, userId: string, kpIds: string[]): Promise<any[]> {
  const { rows = [] } = await query(REVIEW_CANDIDATES_SQL, [userId, kpIds]);
  return rows;
}

// ---------------------------------------------------------------------------
// 错题本 edu.wrong_questions
// ---------------------------------------------------------------------------

/** 答错入账（幂等：已有则仅计数 +1）。difficulty 取题目难度权重。 */
export const UPSERT_WRONG_QUESTION_SQL = `INSERT INTO edu.wrong_questions
           (user_id, question_id, student_answer, correct_answer, error_type, difficulty, reviewed, mastered, review_count, wrong_count, last_attempt_at, last_reviewed_at)
         VALUES ($1, $2, $3, $4, '判读错误', $5, false, false, 0, 1, CURRENT_TIMESTAMP, NULL)
         ON CONFLICT (user_id, question_id) DO UPDATE SET wrong_count = edu.wrong_questions.wrong_count + 1, last_attempt_at = CURRENT_TIMESTAMP`;

/** 题目难度 → 错题本 difficulty 权重（缺省 medium）。 */
export function wrongQuestionDifficulty(difficulty: string | null | undefined): number {
  return ({ easy: 0.3, medium: 0.5, hard: 0.8 } as Record<string, number>)[difficulty ?? ''] ?? 0.5;
}

export async function upsertWrongQuestion(
  query: EduQueryFn,
  input: { userId: string; questionId: string; studentAnswer: unknown; correctAnswer: unknown; difficulty?: string | null },
): Promise<void> {
  await query(UPSERT_WRONG_QUESTION_SQL, [
    input.userId,
    input.questionId,
    String(input.studentAnswer ?? ''),
    input.correctAnswer != null ? String(input.correctAnswer) : '',
    wrongQuestionDifficulty(input.difficulty),
  ]);
}

/** 答对消错题（并把 mastered 置真）——判读 resolveOnCorrect 路径。 */
export const RESOLVE_MASTERED_WRONG_QUESTION_SQL = `UPDATE edu.wrong_questions SET is_resolved = true, mastered = true
          WHERE user_id = $1 AND question_id = $2`;

export async function resolveMasteredWrongQuestion(query: EduQueryFn, userId: string, questionId: string): Promise<void> {
  await query(RESOLVE_MASTERED_WRONG_QUESTION_SQL, [userId, questionId]);
}

/** 答对消错题（不触碰 mastered；仅未解决才更新）——计划任务完成回灌路径。 */
export const RESOLVE_WRONG_QUESTION_SQL = `UPDATE edu.wrong_questions SET is_resolved = true
                    WHERE user_id = $1 AND question_id = $2 AND is_resolved = false`;

export async function resolveWrongQuestion(query: EduQueryFn, userId: string, questionId: string): Promise<void> {
  await query(RESOLVE_WRONG_QUESTION_SQL, [userId, questionId]);
}

/** 抽未解决错题（JOIN 题目/知识点，**不回带正确答案**，保重做真实性）。 */
export const LIST_UNRESOLVED_WRONG_SQL = `SELECT wq.question_id, q.content, q.type, q.options, q.difficulty, q.knowledge_point_id,
                    wq.student_answer, wq.wrong_count, wq.last_attempt_at, kp.name AS knowledge_point
               FROM edu.wrong_questions wq
               LEFT JOIN edu.questions q ON q.id = wq.question_id
               LEFT JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id
              WHERE wq.user_id = $1 AND wq.is_resolved = false
              LIMIT $2`;

export async function listUnresolvedWrongQuestions(query: EduQueryFn, userId: string, limit: number): Promise<any[]> {
  const { rows = [] } = await query(LIST_UNRESOLVED_WRONG_SQL, [userId, limit]);
  return rows;
}

/** 未解决错题按 KP 名（文本）归并计数（诊断）。 */
export const COUNT_UNRESOLVED_WRONG_BY_KP_NAME_SQL = `SELECT wq.knowledge_point AS kp_name, COUNT(*)::int AS count
               FROM edu.wrong_questions wq
              WHERE wq.user_id = $1 AND wq.is_resolved = false
              GROUP BY wq.knowledge_point`;

export async function countUnresolvedWrongByKpName(query: EduQueryFn, userId: string): Promise<any[]> {
  const { rows = [] } = await query(COUNT_UNRESOLVED_WRONG_BY_KP_NAME_SQL, [userId]);
  return rows;
}

/** 某 KP 未解决错题数（授课 assess）。 */
export const COUNT_UNRESOLVED_WRONG_BY_KP_SQL = `SELECT count(*)::int AS n
                   FROM edu.wrong_questions wq
                   JOIN edu.questions q ON q.id = wq.question_id
                  WHERE wq.user_id = $1 AND q.knowledge_point_id = $2 AND wq.is_resolved = false`;

export async function countUnresolvedWrongByKp(query: EduQueryFn, userId: string, kpId: string): Promise<number> {
  const { rows = [] } = await query(COUNT_UNRESOLVED_WRONG_BY_KP_SQL, [userId, kpId]);
  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// 知识点 edu.knowledge_points
// ---------------------------------------------------------------------------

/** 该 KP 名称（缺省回退 kpId 由调用方决定）。 */
export const KP_NAME_BY_ID_SQL = 'SELECT name FROM edu.knowledge_points WHERE id = $1';

export async function findKnowledgePointName(query: EduQueryFn, kpId: string): Promise<string | null> {
  const { rows = [] } = await query(KP_NAME_BY_ID_SQL, [kpId]);
  return rows[0]?.name ?? null;
}

/** 章节范围内已发布的知识点（课程体系导航）。 */
export const KPS_BY_CHAPTER_IDS_SQL = `SELECT kp.id, kp.code, kp.name, kp.description, kp.subject, kp.grade_level, kp.chapter_id, kp.status
                   FROM edu.knowledge_points kp
                  WHERE kp.chapter_id = ANY($1::uuid[])
                    AND (kp.status = 'published' OR kp.status IS NULL)
                  ORDER BY kp.code NULLS LAST LIMIT 50`;

export async function listKnowledgePointsByChapters(query: EduQueryFn, chapterIds: string[]): Promise<any[]> {
  const { rows = [] } = await query(KPS_BY_CHAPTER_IDS_SQL, [chapterIds]);
  return rows;
}

/** 按 id 批量取 KP 元数据（id/name/subject）。 */
export const KPS_BY_IDS_SQL = `SELECT id, name, subject FROM edu.knowledge_points WHERE id = ANY($1::uuid[])`;

export async function listKnowledgePointsByIds(query: EduQueryFn, ids: string[]): Promise<any[]> {
  const { rows = [] } = await query(KPS_BY_IDS_SQL, [ids]);
  return rows;
}

// ---------------------------------------------------------------------------
// 掌握度快照 edu.mastery_snapshots（每生每 KP 一行，UPSERT）
// ---------------------------------------------------------------------------

/** UPSERT 掌握度快照（诊断刷新 / 计划回灌共用；confidence 由调用方给）。 */
export const UPSERT_MASTERY_SNAPSHOT_SQL = `INSERT INTO edu.mastery_snapshots (user_id, knowledge_point_id, mastery_score, confidence_level, calculated_at)
                 VALUES ($1, $2, $3, $4, NOW())
                 ON CONFLICT (user_id, knowledge_point_id) DO UPDATE
                   SET mastery_score = EXCLUDED.mastery_score,
                       confidence_level = EXCLUDED.confidence_level,
                       calculated_at = NOW()`;

export async function upsertMasterySnapshot(
  query: EduQueryFn,
  input: { userId: string; kpId: string; mastery: number; confidence: number },
): Promise<void> {
  await query(UPSERT_MASTERY_SNAPSHOT_SQL, [input.userId, input.kpId, input.mastery, input.confidence]);
}

/** UPSERT 掌握度快照（计划回灌固定 confidence 0.8）。 */
export const UPSERT_MASTERY_SNAPSHOT_BUMPED_SQL = `INSERT INTO edu.mastery_snapshots (user_id, knowledge_point_id, mastery_score, confidence_level, calculated_at)
                 VALUES ($1, $2, $3, 0.8, NOW())
                 ON CONFLICT (user_id, knowledge_point_id) DO UPDATE
                   SET mastery_score = EXCLUDED.mastery_score,
                       confidence_level = EXCLUDED.confidence_level,
                       calculated_at = NOW()`;

export async function upsertMasterySnapshotBumped(query: EduQueryFn, userId: string, kpId: string, mastery: number): Promise<void> {
  await query(UPSERT_MASTERY_SNAPSHOT_BUMPED_SQL, [userId, kpId, mastery]);
}

/** 读现有掌握度快照（计划回灌做增量抬升）。 */
export const MASTERY_SNAPSHOT_BY_KP_SQL = `SELECT mastery_score FROM edu.mastery_snapshots WHERE user_id = $1 AND knowledge_point_id = $2`;

export async function findMasterySnapshot(query: EduQueryFn, userId: string, kpId: string): Promise<number | null> {
  const { rows = [] } = await query(MASTERY_SNAPSHOT_BY_KP_SQL, [userId, kpId]);
  return rows[0]?.mastery_score ?? null;
}

// ---------------------------------------------------------------------------
// 学习计划 edu.learning_plans
// ---------------------------------------------------------------------------

/** 落一节「课」记录（plan_type='lesson'，一次性历史记录：status 直接取 outcome）。 */
export const INSERT_LESSON_PLAN_SQL = `INSERT INTO edu.learning_plans (user_id, title, plan_type, plan_data, total_tasks, completed_tasks, status, start_date, end_date)
     VALUES ($1, $2, 'lesson', $3::jsonb, 1, 1, $4, CURRENT_DATE, CURRENT_DATE)
     RETURNING id`;

export async function insertLessonPlan(
  query: EduQueryFn,
  input: { userId: string; title: string; planData: unknown; status: string },
): Promise<string | null> {
  const { rows = [] } = await query(INSERT_LESSON_PLAN_SQL, [input.userId, input.title, JSON.stringify(input.planData), input.status]);
  return rows[0]?.id ?? null;
}

/** 归档未完成的同类（personalized active）计划，避免计划堆叠。 */
export const ARCHIVE_PERSONALIZED_PLANS_SQL = `UPDATE edu.learning_plans SET status = 'archived'
              WHERE user_id = $1 AND status = 'active' AND plan_type = 'personalized'`;

export async function archivePersonalizedPlans(query: EduQueryFn, userId: string): Promise<void> {
  await query(ARCHIVE_PERSONALIZED_PLANS_SQL, [userId]);
}

/** 落一行个性化学习计划（plan_type='personalized'，7 天窗口）。 */
export const INSERT_PERSONALIZED_PLAN_SQL = `INSERT INTO edu.learning_plans (user_id, title, plan_type, plan_data, total_tasks, completed_tasks, status, start_date, end_date)
             VALUES ($1, $2, 'personalized', $3::jsonb, $4, 0, 'active', CURRENT_DATE, CURRENT_DATE + INTERVAL '7 days')
             RETURNING id`;

export async function insertPersonalizedPlan(
  query: EduQueryFn,
  input: { userId: string; title: string; planData: unknown; totalTasks: number },
): Promise<string | null> {
  const { rows = [] } = await query(INSERT_PERSONALIZED_PLAN_SQL, [
    input.userId,
    input.title,
    JSON.stringify(input.planData),
    input.totalTasks,
  ]);
  return rows[0]?.id ?? null;
}

/** 按 id + user 取计划（**所有权铁律**：仅能取属于自己的，杜绝跨学生访问）。 */
export const PLAN_FOR_USER_SQL = `SELECT id, title, plan_data, total_tasks, completed_tasks, status
               FROM edu.learning_plans
              WHERE id = $1 AND user_id = $2`;

export async function findPlanForUser(query: EduQueryFn, planId: string, userId: string): Promise<any | null> {
  const { rows = [] } = await query(PLAN_FOR_USER_SQL, [planId, userId]);
  return rows[0] ?? null;
}

/** 取该生进行中/已完成的最近一份计划（mock 完成意图）。 */
export const LATEST_PLAN_SQL = `SELECT id, plan_data FROM edu.learning_plans WHERE user_id = $1 AND status IN ('active','completed') ORDER BY created_at DESC LIMIT 1`;

export async function findLatestPlan(query: EduQueryFn, userId: string): Promise<any | null> {
  const { rows = [] } = await query(LATEST_PLAN_SQL, [userId]);
  return rows[0] ?? null;
}

/** 更新计划任务进度（重算 completed_tasks/progress/status）。 */
export const UPDATE_PLAN_PROGRESS_SQL = `UPDATE edu.learning_plans SET plan_data = $3::jsonb, completed_tasks = $4, progress = $5, status = $6, updated_at = NOW()
             WHERE id = $1 AND user_id = $2`;

export async function updatePlanProgress(
  query: EduQueryFn,
  input: { planId: string; userId: string; planData: unknown; completedTasks: number; progress: number; status: string },
): Promise<void> {
  await query(UPDATE_PLAN_PROGRESS_SQL, [
    input.planId,
    input.userId,
    JSON.stringify(input.planData),
    input.completedTasks,
    input.progress,
    input.status,
  ]);
}

// ---------------------------------------------------------------------------
// 学生档案 edu.students
// ---------------------------------------------------------------------------

/** 学生档案（当前学科 + 年级，供 persona 动态化）。 */
export const STUDENT_PROFILE_SQL = `SELECT current_subject, grade FROM edu.students WHERE user_id = $1`;

export async function findStudentProfile(query: EduQueryFn, userId: string): Promise<{ current_subject?: string; grade?: number } | null> {
  const { rows = [] } = await query(STUDENT_PROFILE_SQL, [userId]);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// 运营只读聚合（agent-admin.controller：总览 / 全班学情 / 题目钻取）
// ---------------------------------------------------------------------------

/** 有学习数据的学生数（作答过的去重学生）。 */
export const COUNT_STUDENTS_WITH_DATA_SQL = 'SELECT count(DISTINCT user_id)::int AS n FROM edu.answer_records';

export async function countStudentsWithData(query: EduQueryFn): Promise<any[]> {
  const { rows = [] } = await query(COUNT_STUDENTS_WITH_DATA_SQL);
  return rows;
}

/** 全库未解决错题总数。 */
export const COUNT_UNRESOLVED_WRONG_TOTAL_SQL = "SELECT count(*)::int AS n FROM edu.wrong_questions WHERE is_resolved = false";

export async function countUnresolvedWrongTotal(query: EduQueryFn): Promise<any[]> {
  const { rows = [] } = await query(COUNT_UNRESOLVED_WRONG_TOTAL_SQL);
  return rows;
}

/** 进行中的学习计划数。 */
export const COUNT_ACTIVE_PLANS_SQL = "SELECT count(*)::int AS n FROM edu.learning_plans WHERE status = 'active'";

export async function countActivePlans(query: EduQueryFn): Promise<any[]> {
  const { rows = [] } = await query(COUNT_ACTIVE_PLANS_SQL);
  return rows;
}

/** 授课落盘聚合：上了多少节课 + 涉及知识点数 + 平均掌握度提升。 */
export const LESSON_ROLLUP_SQL = `SELECT count(*)::int AS n,
                count(DISTINCT (plan_data->>'kpId'))::int AS kps,
                ROUND(AVG(NULLIF(plan_data->>'delta','')::numeric))::int AS "avgDelta"
           FROM edu.learning_plans
          WHERE plan_type = 'lesson'`;

export async function lessonRollup(query: EduQueryFn): Promise<any[]> {
  const { rows = [] } = await query(LESSON_ROLLUP_SQL);
  return rows;
}

/** 全班每题/每知识点集合准确率（跨全体学生透视）。 */
export const CLASS_KP_ACCURACY_SQL = `SELECT kp.id AS kp_id, kp.name AS kp_name,
                count(*)::int           AS attempts,
                count(*) FILTER (WHERE ar.is_correct)::int AS correct,
                count(DISTINCT ar.user_id)::int AS students
           FROM edu.answer_records ar
           JOIN edu.questions q        ON q.id = ar.question_id
           JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id
          GROUP BY kp.id, kp.name`;

export async function classKpAccuracy(query: EduQueryFn): Promise<any[]> {
  const { rows = [] } = await query(CLASS_KP_ACCURACY_SQL);
  return rows;
}

/** 每位学生总掌握（学生 × 累计作答准确率）。 */
export const CLASS_STUDENT_ACCURACY_SQL = `SELECT ar.user_id AS student_id,
                count(*)::int AS attempts,
                count(*) FILTER (WHERE ar.is_correct)::int AS correct
           FROM edu.answer_records ar
          GROUP BY ar.user_id`;

export async function classStudentAccuracy(query: EduQueryFn): Promise<any[]> {
  const { rows = [] } = await query(CLASS_STUDENT_ACCURACY_SQL);
  return rows;
}

/** 某知识点下每题的全班作答统计（按作答数降序）。 */
export const KP_QUESTION_STATS_SQL = `SELECT q.id AS question_id, q.content, q.difficulty, q.type,
                count(ar.id)::int                    AS attempts,
                count(ar.id) FILTER (WHERE ar.is_correct)::int AS correct
           FROM edu.questions q
           LEFT JOIN edu.answer_records ar ON ar.question_id = q.id
          WHERE q.knowledge_point_id = $1
          GROUP BY q.id
          ORDER BY attempts DESC`;

export async function kpQuestionStats(query: EduQueryFn, kpId: string): Promise<any[]> {
  const { rows = [] } = await query(KP_QUESTION_STATS_SQL, [kpId]);
  return rows;
}

/** 单题元数据（题面/难度/类型/所属知识点名）。 */
export const QUESTION_META_SQL = `SELECT q.content, q.difficulty, q.type, q.knowledge_point_id, kp.name AS kp_name
                       FROM edu.questions q
                       LEFT JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id
                      WHERE q.id = $1`;

export async function findQuestionMeta(query: EduQueryFn, questionId: string): Promise<any | null> {
  const { rows = [] } = await query(QUESTION_META_SQL, [questionId]);
  return rows[0] ?? null;
}

/** 单题答错人次。 */
export const QUESTION_WRONG_COUNT_SQL = 'SELECT count(*)::int AS n FROM edu.answer_records WHERE question_id = $1 AND is_correct = false';

export async function countQuestionWrong(query: EduQueryFn, questionId: string): Promise<number> {
  const { rows = [] } = await query(QUESTION_WRONG_COUNT_SQL, [questionId]);
  return rows[0]?.n ?? 0;
}

/** 单题全班最常见的错法分布（非空错答 TOP5）。 */
export const QUESTION_TOP_WRONG_SQL = `SELECT student_answer, count(*)::int AS n
                       FROM edu.answer_records
                      WHERE question_id = $1 AND is_correct = false AND student_answer IS NOT NULL AND student_answer <> ''
                      GROUP BY student_answer ORDER BY n DESC LIMIT 5`;

export async function topWrongAnswers(query: EduQueryFn, questionId: string): Promise<any[]> {
  const { rows = [] } = await query(QUESTION_TOP_WRONG_SQL, [questionId]);
  return rows;
}

/** 单题答错的学生明细（谁、写成什么）。 */
export const QUESTION_WRONG_STUDENTS_SQL = `SELECT DISTINCT user_id, student_answer FROM edu.answer_records
                      WHERE question_id = $1 AND is_correct = false ORDER BY user_id`;

export async function wrongStudentsByQuestion(query: EduQueryFn, questionId: string): Promise<any[]> {
  const { rows = [] } = await query(QUESTION_WRONG_STUDENTS_SQL, [questionId]);
  return rows;
}

// ---------------------------------------------------------------------------
// W2.1c：identity / twin 装配所需（整行档案读、按日聚合读、白名单 upsert）
// ---------------------------------------------------------------------------

/** 学生扩展档案**整行**（identity 装配 user+student 用；与窄投影 STUDENT_PROFILE_SQL 区分）。 */
export const STUDENT_ROW_BY_USER_SQL = 'SELECT * FROM edu.students WHERE user_id = $1';

export async function findStudentRow(query: EduQueryFn, userId: string): Promise<any | null> {
  const { rows = [] } = await query(STUDENT_ROW_BY_USER_SQL, [userId]);
  return rows[0] ?? null;
}

/** 按日聚合作答（孪生历史回填）：date_trunc('day')，当日题数 + 答对数。 */
export const DAILY_ANSWER_AGGREGATE_SQL = `SELECT date_trunc('day', created_at) AS d,
              COUNT(*)::int AS n,
              COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END), 0)::int AS correct
         FROM edu.answer_records
        WHERE user_id = $1
        GROUP BY d
        ORDER BY d ASC`;

export async function dailyAnswerAggregate(query: EduQueryFn, userId: string): Promise<any[]> {
  const { rows = [] } = await query(DAILY_ANSWER_AGGREGATE_SQL, [userId]);
  return rows;
}

/**
 * 白名单字段 upsert edu.students（人物画像自助更新）。
 * `cols` 的键=列名、值=$2.. 参数——**列名由调用方白名单产生**（无注入面，同原 twin 内联口径）；
 * 空对象 → no-op（调用方自行判空，本函数不再造分支）。
 */
export async function upsertStudentFields(
  query: EduQueryFn,
  userId: string,
  cols: Record<string, unknown>,
): Promise<void> {
  const keys = Object.keys(cols);
  if (keys.length === 0) return;
  const colsSql = keys.join(', ');
  const placeholders = keys.map((_, i) => `$${i + 2}`).join(', ');
  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(
    `INSERT INTO edu.students (user_id, ${colsSql})
         VALUES ($1, ${placeholders})
         ON CONFLICT (user_id) DO UPDATE SET ${setClause}, updated_at = NOW()`,
    [userId, ...keys.map((k) => cols[k])],
  );
}
