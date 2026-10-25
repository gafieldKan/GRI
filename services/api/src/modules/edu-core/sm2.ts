/**
 * SM-2 间隔重复算法 —— **全仓唯一实现**（W2.1 收敛）。
 *
 * 收敛前的两处同式副本：`agent.service.ts` 的 `sm2Calculate` ↔
 * `tuition/agents/spaced-repetition.service.ts` 的 `SpacedRepetitionService.calculateSM2`。
 * 二者公式**逐字节相同**、又同读写 `edu.sr_queue`，却各自维护 —— 典型的静默分叉温床。现统一到此。
 *
 * **质量分策略分域保留**（不强行归一，各自语义不同，属各自领域，非重复）：
 *   - {@link binaryQuality}：AI 教师判读（答对=5 / 答错=1）。
 *   - {@link masteryToQuality}：掌握度(0–1) → quality(0–5) 连续映射。
 *     注：两条策略对「错」的取值不同（1 vs 0），EF 衰减轨迹随之不同 —— 这是**有意的领域差异**，见 README/交接说明。
 *
 * 传输无关：`applySrReview` 的读写口由调用方注入（Nest `DatabaseService` 或 agent-core `Store` 皆可）。
 */

export interface Sm2Result {
  interval: number;
  easeFactor: number;
  repetitions: number;
}

export const SM2_MIN_EASE_FACTOR = 1.3;
export const SM2_MAX_INTERVAL_DAYS = 365;
export const SM2_DEFAULT_EASE_FACTOR = 2.5;

const DAY_MS = 86_400_000;

/**
 * SM-2 公式。quality 0–5（5=完全正确，0=完全错误）。
 * ease factor 最小 1.3，interval 最大 365 天。
 */
export function calculateSM2(
  quality: number,
  easeFactor: number = SM2_DEFAULT_EASE_FACTOR,
  repetitions = 0,
  interval = 0,
): Sm2Result {
  let ef = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  ef = Math.max(SM2_MIN_EASE_FACTOR, ef);
  let reps = repetitions;
  let iv = interval;
  if (quality >= 3) {
    if (reps === 0) iv = 1;
    else if (reps === 1) iv = 6;
    else iv = Math.round(iv * ef);
    reps += 1;
  } else {
    reps = 0;
    iv = 0;
  }
  iv = Math.min(iv, SM2_MAX_INTERVAL_DAYS);
  return { interval: iv, easeFactor: Number(ef.toFixed(2)), repetitions: reps };
}

/** 下次复习时间 = 基准时刻 + interval 天。 */
export function nextReviewAt(intervalDays: number, from: number = Date.now()): Date {
  return new Date(from + intervalDays * DAY_MS);
}

/** 判读二分质量分：答对=5(掌握)、答错=1(遗忘)。 */
export function binaryQuality(isCorrect: boolean): number {
  return isCorrect ? 5 : 1;
}

/** 掌握度(0–1) → SM-2 quality(0–5)。 */
export function masteryToQuality(mastery: number): number {
  if (mastery >= 0.8) return 5;
  if (mastery >= 0.6) return 4;
  if (mastery >= 0.4) return 3;
  if (mastery >= 0.2) return 2;
  if (mastery >= 0.1) return 1;
  return 0;
}

/** `edu.sr_queue` 读旧值（PK(user_id, question_id)）。唯一真源，杜绝两处副本漂移。 */
export const SR_QUEUE_SELECT_SQL =
  `SELECT ease_factor, repetitions, interval FROM edu.sr_queue WHERE user_id = $1 AND question_id = $2`;

/** `edu.sr_queue` upsert（PK(user_id, question_id)）。 */
export const SR_QUEUE_UPSERT_SQL =
  `INSERT INTO edu.sr_queue (user_id, question_id, last_reviewed, interval, ease_factor, repetitions, next_review, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, question_id) DO UPDATE SET
         last_reviewed = EXCLUDED.last_reviewed,
         interval = EXCLUDED.interval,
         ease_factor = EXCLUDED.ease_factor,
         repetitions = EXCLUDED.repetitions,
         next_review = EXCLUDED.next_review,
         updated_at = CURRENT_TIMESTAMP`;

export interface SrQueueRow {
  ease_factor?: number | null;
  repetitions?: number | null;
  interval?: number | null;
}

/** 注入式读写口（DatabaseService.query / agent-core Store.query 同形）。 */
export type SrQueryFn = (sql: string, params?: any[]) => Promise<{ rows: any[] }>;

/**
 * 读旧值 → SM-2 → upsert，一步到位。逐 user_id 定位，杜绝跨用户越权。
 * @returns `{ sm2, nextReview }`；`nextReview` 为 Date（调用方按需转 ISO）。
 */
export async function applySrReview(
  query: SrQueryFn,
  opts: { userId: string; questionId: string; quality: number; now?: number },
): Promise<{ sm2: Sm2Result; nextReview: Date }> {
  const prev = await query(SR_QUEUE_SELECT_SQL, [opts.userId, opts.questionId]);
  const p: SrQueueRow = (prev && prev.rows && prev.rows[0]) || {};
  const sm2 = calculateSM2(
    opts.quality,
    p.ease_factor ?? SM2_DEFAULT_EASE_FACTOR,
    p.repetitions ?? 0,
    p.interval ?? 0,
  );
  const nextReview = nextReviewAt(sm2.interval, opts.now);
  await query(SR_QUEUE_UPSERT_SQL, [opts.userId, opts.questionId, sm2.interval, sm2.easeFactor, sm2.repetitions, nextReview]);
  return { sm2, nextReview };
}
