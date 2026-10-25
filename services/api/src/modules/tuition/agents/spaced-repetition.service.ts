import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import {
  calculateSM2 as sm2Formula,
  masteryToQuality as masteryToQualityPure,
  applySrReview,
  SM2_DEFAULT_EASE_FACTOR,
  Sm2Result,
} from '../../edu-core/sm2';

export type { Sm2Result };

/**
 * SM-2 间隔重复服务 —— **算法已收敛到 `edu-core/sm2`**（W2.1 唯一实现，此前与 agent.service.ts 各持一份同式副本）。
 * 本类保留面向 tuition 的门面与方法签名（纯函数委托仍可独立单测），并以 DatabaseService 作读写口。
 * updateSRQueue 走 edu-core 的 applySrReview 读写 edu.sr_queue。
 */
@Injectable()
export class SpacedRepetitionService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * SM-2 公式（委托 edu-core）。quality 0-5（5=完全正确，0=完全错误）。
   * ease factor 最小 1.3，interval 最大 365 天。
   */
  calculateSM2(
    quality: number,
    easeFactor: number = SM2_DEFAULT_EASE_FACTOR,
    repetitions = 0,
    interval = 0,
  ): Sm2Result {
    return sm2Formula(quality, easeFactor, repetitions, interval);
  }

  /** 将 mastery (0-1) 映射为 SM-2 quality (0-5)（委托 edu-core）。 */
  masteryToQuality(mastery: number): number {
    return masteryToQualityPure(mastery);
  }

  /** 更新间隔重复队列（edu.sr_queue，PK(user_id, question_id)）。逐行按 user_id 定位，杜绝跨用户越权。 */
  async updateSRQueue(
    userId: string,
    questionId: string,
    mastery: number,
  ): Promise<{ success: boolean; interval?: number; easeFactor?: number; repetitions?: number; nextReview?: Date; error?: string }> {
    const quality = this.masteryToQuality(mastery);
    const { sm2, nextReview } = await applySrReview(
      (sql, params) => this.db.query(sql, params),
      { userId, questionId, quality },
    );
    return { success: true, ...sm2, nextReview };
  }
}
