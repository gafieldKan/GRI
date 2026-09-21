import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export interface Sm2Result {
  interval: number;
  easeFactor: number;
  repetitions: number;
}

/**
 * SM-2 间隔重复算法（移植旧 index.js:1316-1420）。
 * 纯函数（calculateSM2 / masteryToQuality）可独立单测；
 * updateSRQueue 走 DatabaseService 读写 edu.sr_queue。
 */
@Injectable()
export class SpacedRepetitionService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * SM-2 公式。quality 0-5（5=完全正确，0=完全错误）。
   * ease factor 最小 1.3，interval 最大 365 天。
   */
  calculateSM2(
    quality: number,
    easeFactor = 2.5,
    repetitions = 0,
    interval = 0,
  ): Sm2Result {
    let newEaseFactor = easeFactor;
    let newRepetitions = repetitions;
    let newInterval = interval;

    newEaseFactor = newEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    newEaseFactor = Math.max(1.3, newEaseFactor);

    if (quality >= 3) {
      if (newRepetitions === 0) newInterval = 1;
      else if (newRepetitions === 1) newInterval = 6;
      else newInterval = Math.round(newInterval * newEaseFactor);
      newRepetitions += 1;
    } else {
      newRepetitions = 0;
      newInterval = 0;
    }

    newInterval = Math.min(newInterval, 365);

    return {
      interval: newInterval,
      easeFactor: Number(newEaseFactor.toFixed(2)),
      repetitions: newRepetitions,
    };
  }

  /** 将 mastery (0-1) 映射为 SM-2 quality (0-5)。 */
  masteryToQuality(mastery: number): number {
    if (mastery >= 0.9) return 5;
    if (mastery >= 0.8) return 5;
    if (mastery >= 0.7) return 4;
    if (mastery >= 0.6) return 4;
    if (mastery >= 0.5) return 3;
    if (mastery >= 0.4) return 3;
    if (mastery >= 0.3) return 2;
    if (mastery >= 0.2) return 2;
    if (mastery >= 0.1) return 1;
    return 0;
  }

  /** 更新间隔重复队列（edu.sr_queue，PK(user_id, question_id)）。逐行按 user_id 定位，杜绝跨用户越权。 */
  async updateSRQueue(
    userId: string,
    questionId: string,
    mastery: number,
  ): Promise<{ success: boolean; interval?: number; easeFactor?: number; repetitions?: number; nextReview?: Date; error?: string }> {
    const quality = this.masteryToQuality(mastery);

    let easeFactor = 2.5;
    let repetitions = 0;
    let interval = 0;

    const existing = await this.db.query(
      `SELECT ease_factor, repetitions, interval FROM edu.sr_queue WHERE user_id = $1 AND question_id = $2`,
      [userId, questionId],
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      easeFactor = row.ease_factor ?? 2.5;
      repetitions = row.repetitions ?? 0;
      interval = row.interval ?? 0;
    }

    const sm2 = this.calculateSM2(quality, easeFactor, repetitions, interval);
    const nextReview = new Date(Date.now() + sm2.interval * 86400000);

    await this.db.query(
      `INSERT INTO edu.sr_queue (user_id, question_id, last_reviewed, interval, ease_factor, repetitions, next_review, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, question_id) DO UPDATE SET
         last_reviewed = EXCLUDED.last_reviewed,
         interval = EXCLUDED.interval,
         ease_factor = EXCLUDED.ease_factor,
         repetitions = EXCLUDED.repetitions,
         next_review = EXCLUDED.next_review,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, questionId, sm2.interval, sm2.easeFactor, sm2.repetitions, nextReview],
    );

    return { success: true, ...sm2, nextReview };
  }
}