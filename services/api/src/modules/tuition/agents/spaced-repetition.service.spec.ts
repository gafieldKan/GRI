import { SpacedRepetitionService } from './spaced-repetition.service';
import { DatabaseService } from '../../../database/database.service';

describe('SpacedRepetitionService', () => {
  const svc = new SpacedRepetitionService({} as DatabaseService);

  describe('calculateSM2（SM-2 核心公式）', () => {
    it('首次答对（quality=5）→ interval 1 天', () => {
      const r = svc.calculateSM2(5);
      expect(r.interval).toBe(1);
      expect(r.repetitions).toBe(1);
      expect(r.easeFactor).toBeGreaterThan(2.5); // 答对提高 EF
    });

    it('第二次答对 → interval 6 天', () => {
      const r = svc.calculateSM2(4, 2.6, 1, 1);
      expect(r.interval).toBe(6);
      expect(r.repetitions).toBe(2);
    });

    it('后续答对 → interval 按 EF 增长', () => {
      const r = svc.calculateSM2(5, 2.5, 4, 27);
      expect(r.interval).toBe(Math.round(27 * r.easeFactor));
      expect(r.interval).toBeGreaterThan(27);
    });

    it('答错（quality<3）→ 重置 repetition/interval', () => {
      const r = svc.calculateSM2(2, 2.5, 5, 100);
      expect(r.repetitions).toBe(0);
      expect(r.interval).toBe(0);
    });

    it('ease factor 下限 1.3', () => {
      // 持续答错会把 EF 压到底，但不应低于 1.3
      let ef = 2.5;
      let reps = 0;
      let interval = 0;
      for (let i = 0; i < 20; i++) {
        const r = svc.calculateSM2(0, ef, reps, interval);
        ef = r.easeFactor;
        reps = r.repetitions;
        interval = r.interval;
      }
      expect(ef).toBeGreaterThanOrEqual(1.3);
    });

    it('interval 上限 365 天', () => {
      const r = svc.calculateSM2(5, 3.0, 6, 300);
      expect(r.interval).toBeLessThanOrEqual(365);
    });
  });

  describe('masteryToQuality（mastery 0-1 → SM-2 quality 0-5）', () => {
    it('高分 → quality 5/4', () => {
      expect(svc.masteryToQuality(0.95)).toBe(5);
      expect(svc.masteryToQuality(0.75)).toBe(4);
    });
    it('中分 → quality 3', () => {
      expect(svc.masteryToQuality(0.55)).toBe(3);
      expect(svc.masteryToQuality(0.45)).toBe(3);
    });
    it('低分 → quality ≤ 2', () => {
      expect(svc.masteryToQuality(0.25)).toBe(2);
      expect(svc.masteryToQuality(0.1)).toBe(1);
      expect(svc.masteryToQuality(0.05)).toBe(0);
    });
  });

  describe('updateSRQueue（逐 user_id 定位，杜绝跨用户）', () => {
    it('PRIMARY KEY(user_id, question_id)：读旧值、算 SM-2、upsert', async () => {
      const db = { query: jest.fn() } as unknown as DatabaseService;
      const out = new SpacedRepetitionService(db);

      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // SELECT 旧值：无
        .mockResolvedValueOnce({ rows: [] }); // upsert

      const res = await out.updateSRQueue('u1', 'q1', 0.9);
      expect(res.success).toBe(true);
      expect(res.interval).toBe(1); // 首次高分
      expect(res.repetitions).toBe(1);

      const queries = (db.query as jest.Mock).mock.calls.map((c: unknown[]) => c[0]);
      expect(queries[0]).toContain('WHERE user_id = $1 AND question_id = $2');
      expect(queries[1]).toContain('ON CONFLICT (user_id, question_id)');
    });

    it('无 mastery 的纯负例 → 重置', async () => {
      const db = { query: jest.fn() } as unknown as DatabaseService;
      const out = new SpacedRepetitionService(db);
      (db.query as jest.Mock).mockResolvedValue({ rows: [{ ease_factor: 2.5, repetitions: 5, interval: 100 }] });
      const res = await out.updateSRQueue('u1', 'q1', 0.1);
      expect(res.interval).toBe(0);
      expect(res.repetitions).toBe(0);
    });
  });
});