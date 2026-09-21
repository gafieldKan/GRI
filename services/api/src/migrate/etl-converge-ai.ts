/**
 * GRI 重写 ETL 收敛脚本（M5 AI 垂直）—— 把旧 smartlens 学情表收敛进单库 gri edu.*。
 * 用法：npm run build --workspace=services/api && node dist/migrate/etl-converge-ai.js
 *
 * 需在 postgres-ai（旧 smartlens 库，:5433）仍在线时执行一次；跑通后确认行数，
 * 再冻结 postgres-ai / 移除 ai-tutor-backend（见 docker-compose.yml）。
 *
 * 幂等：目标表都有 legacy_id 列 + 通用映射表 public._etl_entity_map(entity, legacy_id, new_id)。
 *   每个实体先按 legacy_id 查映射 → 命中则跳过，未命中则新建 UUID 并记录；ON CONFLICT DO NOTHING。
 *   同一脚本重复执行 = no-op，不翻倍。
 *
 * 学生（students varcharkey → public.users uuid）：
 *   复用既有 _etl_student_map（旧 etl-converge.ts 已产）。缺失则现场补：建 public.users(role=student)
 *   + edu.students + 映射记录，保证本脚本独立可幂等.
 *
 * 明确不迁：learning_sessions / interaction_logs —— 它们是旧内存 Map 会话的持久落盘，
 *   新架构会话由 edu.sessions 每次重建（SessionFSM 全量持久化），历史对话不迁移。
 *   answer_records 高搅拌低历史价值，仅当源表有行时可选迁移（默认跳过，由 practice 会话重建）。
 *
 * 环境变量（区隔两库）：
 *   - 新单库 gri：DB_HOST/DB_PORT/DB_NAME(默认 gri)/DB_USER/DB_PASSWORD
 *   - 旧学情库：LEGACY_EDU_HOST/LEGACY_EDU_PORT/LEGACY_EDU_NAME(默认 smartlens)/...USER/PASSWORD
 */
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

export type Pg = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number }>;
  end?: () => Promise<void>;
};

function poolOf(prefix: string, defDb: string): Pool {
  return new Pool({
    host: process.env[`${prefix}_HOST`] ?? 'localhost',
    port: parseInt(process.env[`${prefix}_PORT`] ?? '5432', 10),
    database: process.env[`${prefix}_NAME`] ?? defDb,
    user: process.env[`${prefix}_USER`] ?? 'postgres',
    password: process.env[`${prefix}_PASSWORD`] ?? 'postgres',
  });
}

/** 从目标库查 _etl_entity_map；命中返回 uuid，否则生成新 uuid 并写入映射（幂等核心）。 */
async function newId(dest: Pg, entity: string, legacyId: string): Promise<string> {
  const hit = await dest.query(
    `SELECT new_id FROM public._etl_entity_map WHERE entity = $1 AND legacy_id = $2`,
    [entity, legacyId],
  );
  if (hit.rows.length > 0) return hit.rows[0].new_id;
  const uuid = randomUUID();
  await dest.query(
    `INSERT INTO public._etl_entity_map (entity, legacy_id, new_id) VALUES ($1, $2, $3)
     ON CONFLICT (entity, legacy_id) DO NOTHING`,
    [entity, legacyId, uuid],
  );
  return uuid;
}

/** studentId(varchar) → user_id(uuid)：优先既有 _etl_student_map，缺失现场建。 */
async function resolveStudent(dest: Pg, src: Pg, legacyId: string, row: any): Promise<string> {
  const hit = await dest.query(
    `SELECT user_id FROM public._etl_student_map WHERE legacy_student_id = $1`,
    [legacyId],
  );
  if (hit.rows.length > 0) return hit.rows[0].user_id;
  const uuid = randomUUID();
  const s = row;
  await dest.query(
    `INSERT INTO public.users (id, username, name, avatar_url, role, status)
     VALUES ($1, $2, $3, $4, 'student', 'active') ON CONFLICT (id) DO NOTHING`,
    [uuid, legacyId, s?.name ?? legacyId, s?.avatar_url ?? null],
  );
  await dest.query(
    `INSERT INTO edu.students (user_id, name, grade, avatar_url, textbook_version, school, legacy_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (user_id) DO NOTHING`,
    [uuid, s?.name, s?.grade ?? null, s?.avatar_url ?? null, s?.textbook_version ?? null, s?.school ?? null, legacyId, s?.created_at ?? new Date(), s?.updated_at ?? new Date()],
  );
  await dest.query(
    `INSERT INTO public._etl_student_map (legacy_student_id, user_id) VALUES ($1, $2)
     ON CONFLICT (legacy_student_id) DO NOTHING`,
    [legacyId, uuid],
  );
  return uuid;
}

/** legacy 题目 difficulty(int 1/2/3) → nest 枚举 easy|medium|hard */
function diffText(d: unknown): string {
  const n = Number(d);
  if (n <= 1) return 'easy';
  if (n === 2) return 'medium';
  return 'hard';
}

export async function runEtl(src: Pg, dest: Pg): Promise<{ counts: Record<string, number> }> {
  const counts: Record<string, number> = {};

  // 源库表集合：缺表（契约收敛进程里旧库可能未建齐）→ 跳过该实体，不中断其余表。
  const srcTables = new Set<string>(
    (await src.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)).rows.map((r: any) => r.tablename),
  );
  const srcHas = (t: string): boolean => srcTables.has(t);
  /** 源表查询：缺表 → 空结果（跳过该实体，不中断收敛其余表）。 */
  const srcQ = async (t: string): Promise<{ rows: any[]; rowCount?: number }> =>
    srcHas(t) ? src.query(`SELECT * FROM ${t}`) : { rows: [], rowCount: 0 };

  // legacy student_id → uuid user_id（跨实体复用，供 exams/reports/… 定位属主）
  const studentId = new Map<string, string>();

  // ---------- students ----------
  if (srcHas('students')) {
    const students = await src.query(`SELECT * FROM students`);
    for (const s of students.rows) {
      const uid = await resolveStudent(dest, src, s.id, s);
      studentId.set(s.id, uid);
    }
    counts.students = students.rowCount ?? students.rows.length;
  } else {
    counts.students = 0;
  }

  // ---------- knowledge_points ----------
  const kps = await srcQ('knowledge_points');
  for (const k of kps.rows) {
    const nid = await newId(dest, 'knowledge_points', k.id);
    await dest.query(
      `INSERT INTO edu.knowledge_points
         (id, name, description, level, subject, grade_level, prerequisites, formula, mastery, examples, common_mistakes, related_knowledge, legacy_id, created_at)
       VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO NOTHING`,
      [nid, k.name, k.description ?? null, k.subject ?? null, k.grade_level ?? null,
       k.prerequisites ? (Array.isArray(k.prerequisites) ? JSON.stringify(k.prerequisites) : k.prerequisites) : '[]',
       k.formula ?? null, Number(k.mastery ?? 0), k.examples ? JSON.stringify(k.examples) : '[]',
       k.common_mistakes ? JSON.stringify(k.common_mistakes) : '[]',
       k.related_knowledge ? JSON.stringify(k.related_knowledge) : '[]', k.id, k.created_at ?? new Date()],
    );
  }
  counts.knowledge_points = kps.rows.length;

  // ---------- questions ----------
  const qs = await srcQ('questions');
  const questionId = new Map<string, string>();
  for (const q of qs.rows) {
    const nid = await newId(dest, 'questions', q.id);
    // knowledge_point 映射（可能缺失 → NULL）
    let kpUuid: string | null = null;
    if (q.knowledge_point_id) {
      const kpHit = await dest.query(
        `SELECT new_id FROM public._etl_entity_map WHERE entity='knowledge_points' AND legacy_id=$1`,
        [q.knowledge_point_id],
      );
      kpUuid = kpHit.rows[0]?.new_id ?? null;
    }
    // variant_of 映射（同表，先占位后补）
    let variantUuid: string | null = null;
    if (q.variant_of && questionId.has(q.variant_of)) variantUuid = questionId.get(q.variant_of)!;
    await dest.query(
      `INSERT INTO edu.questions
         (id, knowledge_point_id, content, content_latex, answer, answer_latex, type, difficulty, options, analysis, explanation, variant_of, legacy_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO NOTHING`,
      [nid, kpUuid, q.content, q.content_latex ?? null, q.answer, q.answer_latex ?? null,
       q.type ?? 'fill', diffText(q.difficulty), q.options ? JSON.stringify(q.options) : null,
       q.analysis ?? null, q.explanation ?? null, variantUuid, q.id, q.created_at ?? new Date()],
    );
    questionId.set(q.id, nid);
  }
  counts.questions = qs.rows.length;

  // ---------- exams ----------
  const exams = await srcQ('exams');
  const examId = new Map<string, string>();
  for (const e of exams.rows) {
    const nid = await newId(dest, 'exams', e.id);
    const uid = e.student_id && studentId.has(e.student_id) ? studentId.get(e.student_id)! : await resolveStudent(dest, src, e.student_id, null);
    await dest.query(
      `INSERT INTO edu.exams
         (id, user_id, subject, grade_level, exam_date, exam_type, raw_images, ocr_result, parsed_questions, status, legacy_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO NOTHING`,
      [nid, uid, e.subject, e.grade_level ?? null, e.exam_date ?? null, e.exam_type ?? 'manual',
       e.raw_images ? JSON.stringify(e.raw_images) : null, e.ocr_result ? JSON.stringify(e.ocr_result) : null,
       e.parsed_questions ? JSON.stringify(e.parsed_questions) : null, e.status ?? 'pending',
       e.id, e.created_at ?? new Date(), e.updated_at ?? new Date()],
    );
    examId.set(e.id, nid);
  }
  counts.exams = exams.rows.length;

  // ---------- analysis_reports ----------
  const reports = await srcQ('analysis_reports');
  for (const r of reports.rows) {
    const nid = await newId(dest, 'analysis_reports', r.id);
    const uid = r.student_id && studentId.has(r.student_id) ? studentId.get(r.student_id)! : await resolveStudent(dest, src, r.student_id, null);
    const eid = r.exam_id && examId.has(r.exam_id) ? examId.get(r.exam_id)! : null;
    await dest.query(
      `INSERT INTO edu.analysis_reports
         (id, exam_id, user_id, knowledge_points, ability_dims, error_attribution,
          peer_percentile, peer_avg_score, student_score, ai_suggestions, weak_points, strong_points, legacy_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO NOTHING`,
      [nid, eid, uid, r.knowledge_points ? JSON.stringify(r.knowledge_points) : null,
       r.ability_dims ? JSON.stringify(r.ability_dims) : null, r.error_attribution ? JSON.stringify(r.error_attribution) : null,
       r.peer_percentile ?? null, r.peer_avg_score ?? null, r.student_score ?? null,
       r.ai_suggestions ? JSON.stringify(r.ai_suggestions) : null, r.weak_points ? JSON.stringify(r.weak_points) : null,
       r.strong_points ? JSON.stringify(r.strong_points) : null, r.id, r.created_at ?? new Date(), r.updated_at ?? new Date()],
    );
  }
  counts.analysis_reports = reports.rows.length;

  // ---------- wrong_questions（AI 去规范行：question_id NULL + question_text）----------
  const wrongs = await srcQ('wrong_questions');
  for (const w of wrongs.rows) {
    const nid = await newId(dest, 'wrong_questions', w.id);
    const uid = w.student_id && studentId.has(w.student_id) ? studentId.get(w.student_id)! : await resolveStudent(dest, src, w.student_id, null);
    const eid = w.exam_id && examId.has(w.exam_id) ? examId.get(w.exam_id)! : null;
    await dest.query(
      `INSERT INTO edu.wrong_questions
         (id, user_id, exam_id, question_text, question_type, subject, knowledge_point, student_answer,
          correct_answer, error_type, difficulty, mastery_level, reviewed, mastered, review_count,
          last_reviewed_at, wrong_count, legacy_id, last_attempt_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,1,$17,NULL,$18,$19)
       ON CONFLICT (id) DO NOTHING`,
      [nid, uid, eid, w.question_text ?? '', w.question_type ?? null, w.subject ?? null, w.knowledge_point ?? null,
       w.student_answer ?? null, w.correct_answer ?? null, w.error_type ?? null, w.difficulty ?? 0.5,
       w.mastery_level ?? null, w.reviewed ?? false, w.mastered ?? false, w.review_count ?? 0,
       w.last_reviewed_at ?? null, w.id, w.created_at ?? new Date(), w.updated_at ?? new Date()],
    );
  }
  counts.wrong_questions = wrongs.rows.length;

  // ---------- learning_plans ----------
  const plans = await srcQ('learning_plans');
  for (const p of plans.rows) {
    const nid = await newId(dest, 'learning_plans', p.id);
    const uid = p.student_id && studentId.has(p.student_id) ? studentId.get(p.student_id)! : await resolveStudent(dest, src, p.student_id, null);
    await dest.query(
      `INSERT INTO edu.learning_plans
         (id, user_id, title, plan_type, plan_period, plan_data, progress, total_tasks, completed_tasks,
          start_date, end_date, status, legacy_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO NOTHING`,
      [nid, uid, p.plan_type ? `${p.plan_type}学习计划` : '学习计划', p.plan_type ?? null, p.plan_period ?? null,
       p.plan_data ? JSON.stringify(p.plan_data) : null, Number(p.progress ?? 0), p.total_tasks ?? null,
       p.completed_tasks ?? 0, p.start_date ?? null, p.end_date ?? null, p.status ?? 'active',
       p.id, p.created_at ?? new Date(), p.updated_at ?? new Date()],
    );
  }
  counts.learning_plans = plans.rows.length;

  // ---------- practice_sessions ----------
  const pracs = await srcQ('practice_sessions');
  const pracId = new Map<string, string>();
  for (const p of pracs.rows) {
    const nid = await newId(dest, 'practice_sessions', p.id);
    const uid = p.student_id && studentId.has(p.student_id) ? studentId.get(p.student_id)! : await resolveStudent(dest, src, p.student_id, null);
    await dest.query(
      `INSERT INTO edu.practice_sessions
         (id, user_id, mode, subject, topic_id, questions, answers, stats, duration, completed_at,
          start_time, end_time, status, legacy_id)
       VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO NOTHING`,
      [nid, uid, p.mode, p.subject ?? null, p.questions ? JSON.stringify(p.questions) : null,
       p.answers ? JSON.stringify(p.answers) : null, p.stats ? JSON.stringify(p.stats) : null,
       p.duration ?? null, p.completed_at ?? null, p.created_at ?? new Date(), p.completed_at ?? null,
       p.completed_at ? 'completed' : 'in_progress', p.id],
    );
    pracId.set(p.id, nid);
  }
  counts.practice_sessions = pracs.rows.length;

  // ---------- sr_queue ----------
  const sr = await srcQ('sr_queue');
  for (const q of sr.rows) {
    const uid = q.student_id && studentId.has(q.student_id) ? studentId.get(q.student_id)! : await resolveStudent(dest, src, q.student_id, null);
    const qid = q.question_id && questionId.has(q.question_id) ? questionId.get(q.question_id)! : null;
    if (!qid) continue;
    await dest.query(
      `INSERT INTO edu.sr_queue (user_id, question_id, last_reviewed, interval, ease_factor, repetitions, next_review, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id, question_id) DO NOTHING`,
      [uid, qid, q.last_reviewed ?? null, q.interval ?? 0, q.ease_factor ?? 2.5, q.repetitions ?? 0, q.next_review ?? null, q.updated_at ?? new Date()],
    );
  }
  counts.sr_queue = sr.rows.length;

  // ---------- reminders ----------
  const rems = await srcQ('reminders');
  for (const r of rems.rows) {
    const nid = await newId(dest, 'reminders', r.id);
    const uid = r.student_id && studentId.has(r.student_id) ? studentId.get(r.student_id)! : await resolveStudent(dest, src, r.student_id, null);
    await dest.query(
      `INSERT INTO edu.reminders (id, user_id, plan_id, type, time, message, sent, legacy_id, created_at)
       VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [nid, uid, r.type ?? 'general', r.time ?? null, r.message ?? null, r.sent ?? false, r.id, r.created_at ?? new Date()],
    );
  }
  counts.reminders = rems.rows.length;

  // ---------- user_preferences ----------
  const prefs = await srcQ('user_preferences');
  for (const p of prefs.rows) {
    const uid = p.student_id && studentId.has(p.student_id) ? studentId.get(p.student_id)! : await resolveStudent(dest, src, p.student_id, null);
    await dest.query(
      `INSERT INTO edu.user_preferences
         (user_id, daily_goal, reminder_time, preferred_subjects, preferred_difficulty, auto_play_audio,
          show_hints, show_explanations, push_enabled, email_enabled, streak_reminder, weekly_report,
          achievement_alerts, quiet_hours_start, quiet_hours_end, sound_enabled, sound_volume, haptic_enabled,
          analytics_enabled, crash_reporting, personalized_ads, data_sync, auto_login, biometric_auth, session_timeout, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
       ON CONFLICT (user_id) DO NOTHING`,
      [uid, p.daily_goal ?? 15, p.reminder_time ?? null, p.preferred_subjects ?? null, p.preferred_difficulty ?? null,
       p.auto_play_audio ?? true, p.show_hints ?? true, p.show_explanations ?? true, p.push_enabled ?? true,
       p.email_enabled ?? true, p.streak_reminder ?? true, p.weekly_report ?? true, p.achievement_alerts ?? true,
       p.quiet_hours_start ?? null, p.quiet_hours_end ?? null, p.sound_enabled ?? true, p.sound_volume ?? 1.0,
       p.haptic_enabled ?? true, p.analytics_enabled ?? true, p.crash_reporting ?? true, p.personalized_ads ?? false,
       p.data_sync ?? true, p.auto_login ?? false, p.biometric_auth ?? false, p.session_timeout ?? 30, p.updated_at ?? new Date()],
    );
  }
  counts.user_preferences = prefs.rows.length;

  // ---------- achievements ----------
  const achs = await srcQ('achievements');
  for (const a of achs.rows) {
    const nid = await newId(dest, 'achievements', a.id);
    const uid = a.student_id && studentId.has(a.student_id) ? studentId.get(a.student_id)! : await resolveStudent(dest, src, a.student_id, null);
    await dest.query(
      `INSERT INTO edu.achievements (id, user_id, code, name, description, unlocked_at, legacy_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [nid, uid, a.code ?? 'unknown', a.name ?? null, a.description ?? null, a.unlocked_at ?? null, a.id, a.created_at ?? new Date()],
    );
  }
  counts.achievements = achs.rows.length;

  // ---------- mastery_snapshots ----------
  const snaps = await srcQ('mastery_snapshots');
  for (const s of snaps.rows) {
    const nid = await newId(dest, 'mastery_snapshots', s.id);
    const uid = s.student_id && studentId.has(s.student_id) ? studentId.get(s.student_id)! : await resolveStudent(dest, src, s.student_id, null);
    const kpid = s.knowledge_point_id ? dest.query(
      `SELECT new_id FROM public._etl_entity_map WHERE entity='knowledge_points' AND legacy_id=$1`, [s.knowledge_point_id],
    ).then((r) => r.rows[0]?.new_id ?? null) : Promise.resolve(null);
    await dest.query(
      `INSERT INTO edu.mastery_snapshots (id, user_id, knowledge_point_id, mastery_score, confidence_level, legacy_id, calculated_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [nid, uid, await kpid, s.mastery_score ?? null, s.confidence_level ?? null, s.id, s.calculated_at ?? new Date(), s.created_at ?? new Date()],
    );
  }
  counts.mastery_snapshots = snaps.rows.length;

  return { counts };
}

async function run() {
  const dest = new Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME ?? 'gri',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
  });
  const src = poolOf('LEGACY_EDU', 'smartlens');

  const { counts } = await runEtl(src as unknown as Pg, dest as unknown as Pg);
  // eslint-disable-next-line no-console
  console.log('[etl-converge-ai] done', counts);

  await dest.end();
  await src.end();
}

// 直接运行（node dist/migrate/etl-converge-ai.js）时执行；jest 环境（JEST_WORKER_ID）跳过，
// 让 etl-converge-ai.spec.ts 能用 fake pool 测 runEtl 的幂等性，不触碰真实库。
if (process.env.JEST_WORKER_ID === undefined) {
  run().catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[etl-converge-ai] failed:', e?.message ?? e);
    process.exit(1);
  });
}