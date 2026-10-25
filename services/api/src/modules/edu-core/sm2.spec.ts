import {
  calculateSM2,
  nextReviewAt,
  binaryQuality,
  masteryToQuality,
  applySrReview,
  SR_QUEUE_SELECT_SQL,
  SR_QUEUE_UPSERT_SQL,
} from './sm2';

describe('edu-core/sm2（SM-2 唯一实现）', () => {
  describe('calculateSM2 公式', () => {
    it('首次答对 quality=5 → interval 1 天、reps 1、EF 上升', () => {
      const r = calculateSM2(5);
      expect(r.interval).toBe(1);
      expect(r.repetitions).toBe(1);
      expect(r.easeFactor).toBeGreaterThan(2.5);
    });

    it('第二次答对 → interval 6 天', () => {
      const r = calculateSM2(4, 2.6, 1, 1);
      expect(r.interval).toBe(6);
      expect(r.repetitions).toBe(2);
    });

    it('后续答对 → 按 EF 增长', () => {
      const r = calculateSM2(5, 2.5, 4, 27);
      expect(r.interval).toBe(Math.round(27 * r.easeFactor));
    });

    it('quality<3 → 重置 reps/interval', () => {
      const r = calculateSM2(2, 2.5, 5, 100);
      expect(r.repetitions).toBe(0);
      expect(r.interval).toBe(0);
    });

    it('EF 下限 1.3、interval 上限 365', () => {
      let ef = 2.5;
      let reps = 0;
      let interval = 0;
      for (let i = 0; i < 20; i++) {
        const r = calculateSM2(0, ef, reps, interval);
        ef = r.easeFactor;
        reps = r.repetitions;
        interval = r.interval;
      }
      expect(ef).toBeGreaterThanOrEqual(1.3);
      expect(calculateSM2(5, 3.0, 6, 300).interval).toBeLessThanOrEqual(365);
    });
  });

  describe('质量分策略（分域保留）', () => {
    it('binaryQuality：判读二分（对=5/错=1）', () => {
      expect(binaryQuality(true)).toBe(5);
      expect(binaryQuality(false)).toBe(1);
    });

    it('masteryToQuality：掌握度连续映射（去重后语义不变）', () => {
      expect(masteryToQuality(0.95)).toBe(5);
      expect(masteryToQuality(0.75)).toBe(4);
      expect(masteryToQuality(0.55)).toBe(3);
      expect(masteryToQuality(0.45)).toBe(3);
      expect(masteryToQuality(0.25)).toBe(2);
      expect(masteryToQuality(0.1)).toBe(1);
      expect(masteryToQuality(0.05)).toBe(0);
    });

    it('nextReviewAt：基准时刻 + interval 天', () => {
      const base = Date.UTC(2026, 0, 1);
      expect(nextReviewAt(6, base).getTime()).toBe(base + 6 * 86_400_000);
    });
  });

  describe('applySrReview（读旧值 → 算 → upsert）', () => {
    it('逐 user_id 定位：先 SELECT 旧值，再 upsert', async () => {
      const calls: Array<[string, any[] | undefined]> = [];
      const query = jest.fn(async (sql: string, params?: any[]) => {
        calls.push([sql, params]);
        return { rows: [] };
      });
      const { sm2, nextReview } = await applySrReview(query, { userId: 'u1', questionId: 'q1', quality: 5 });

      expect(sm2).toEqual({ interval: 1, easeFactor: 2.6, repetitions: 1 });
      expect(nextReview).toBeInstanceOf(Date);
      expect(calls[0][0]).toBe(SR_QUEUE_SELECT_SQL);
      expect(calls[0][1]).toEqual(['u1', 'q1']);
      expect(calls[1][0]).toBe(SR_QUEUE_UPSERT_SQL);
      expect(calls[1][1]!.slice(0, 2)).toEqual(['u1', 'q1']);
    });

    it('携旧值续算；SQL 含隔离谓词与 upsert 冲突键（不跨用户）', async () => {
      const query = jest.fn(async () => ({ rows: [{ ease_factor: 2.5, repetitions: 5, interval: 100 }] }));
      const { sm2 } = await applySrReview(query, { userId: 'u1', questionId: 'q1', quality: 1 });
      expect(sm2.interval).toBe(0);
      expect(sm2.repetitions).toBe(0);
      expect(SR_QUEUE_SELECT_SQL).toContain('WHERE user_id = $1 AND question_id = $2');
      expect(SR_QUEUE_UPSERT_SQL).toContain('ON CONFLICT (user_id, question_id)');
    });
  });
});
