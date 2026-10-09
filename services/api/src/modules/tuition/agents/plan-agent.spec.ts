import { PlanAgent } from './plan-agent';
import { DatabaseService } from '../../../database/database.service';

// @gri/agent-core 是 ESM，jest 不解析；本 spec 只测 plan-agent 自身逻辑（不触 LLM），给最小桩即可。
jest.mock('@gri/agent-core', () => ({ ModelRouter: class {}, storeFrom: (q: unknown) => q }));

type HasQuery = { query: jest.Mock };

function makeDb(query: jest.Mock): DatabaseService {
  return { query } as unknown as DatabaseService;
}

/**
 * plan-agent 回归：锁「学习计划」端到端打通踩出的两个后端真问题——
 *  1) 周计划任务缺稳定 id/completed → 前端勾选无从落地、刷新即丢；
 *  2) updateProgress 只记“完成数量”标量、不记“哪些任务完成”→ 刷新丢失勾选。
 * 现改为按 id 标记式写回 plan_data + 重算 progress（零迁移）。
 */
describe('PlanAgent（学习计划落库回归）', () => {
  it('_generateWeeklyPlan：每条任务带稳定唯一 id 与 completed=false', async () => {
    const agent = new PlanAgent(makeDb(jest.fn()), { generatePracticeSet: jest.fn() } as any);
    const plan = await (agent as any)._generateWeeklyPlan({ weakPoints: ['乘法'] });

    const tasks = plan.weeklyTasks.flatMap((d: any) => d.tasks);
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) {
      expect(typeof t.id).toBe('string');
      expect(t.id.length).toBeGreaterThan(0);
      expect(t.completed).toBe(false);
    }
    // id 全局唯一（跨天不串）
    expect(new Set(tasks.map((t: any) => t.id)).size).toBe(tasks.length);
  });

  it('updateProgress：按 id 在 plan_data 标记 completed、重算 progress 并写回 JSONB', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [
      [/SELECT plan_data, total_tasks/, [{ plan_data: { tasks: [{ id: 'd0' }, { id: 'd1' }] }, total_tasks: 2 }]],
      [/UPDATE edu\.learning_plans/, [{ id: 'p1', progress: '50.00', completed_tasks: 1, status: 'active' }]],
    ]);
    const agent = new PlanAgent(db, {} as any);

    const res = await agent.updateProgress('u1', 'p1', ['d0']);

    expect(res.success).toBe(true);
    const [sql, params] = (db.query as jest.Mock).mock.calls[1];
    expect(sql).toMatch(/plan_data = \$3::jsonb/);
    const written = JSON.parse(params[2]);
    expect(written.tasks.find((t: any) => t.id === 'd0').completed).toBe(true);
    expect(written.tasks.find((t: any) => t.id === 'd1').completed).toBe(false);
    expect(params[3]).toBe(1); // completed_tasks
    expect(params[4]).toBe(50); // progress
  });

  it('updateProgress：周计划拍平 weeklyTasks[].tasks 一并标记', async () => {
    const db = makeDb(jest.fn());
    mockQueries(db, [
      [/SELECT plan_data, total_tasks/, [{
        plan_data: { weeklyTasks: [{ day: '周一', tasks: [{ id: 'w0-t0' }, { id: 'w0-t1' }] }, { day: '周二', tasks: [{ id: 'w1-t0' }] }] },
        total_tasks: 3,
      }]],
      [/UPDATE edu\.learning_plans/, [{ id: 'p1', progress: '66.67' }]],
    ]);
    const agent = new PlanAgent(db, {} as any);

    const res = await agent.updateProgress('u1', 'p1', ['w0-t0', 'w1-t0']);

    expect(res.success).toBe(true);
    const written = JSON.parse((db.query as jest.Mock).mock.calls[1][1][2]);
    expect(written.weeklyTasks[0].tasks[0].completed).toBe(true);
    expect(written.weeklyTasks[0].tasks[1].completed).toBe(false);
    expect(written.weeklyTasks[1].tasks[0].completed).toBe(true);
    expect((db.query as jest.Mock).mock.calls[1][1][3]).toBe(2); // completed_tasks
  });

  it('updateProgress：他人/不存在的计划 → success:false（owner 经 user_id 收敛）', async () => {
    const db = makeDb(jest.fn().mockResolvedValue({ rows: [] }));
    const agent = new PlanAgent(db, {} as any);

    const res = await agent.updateProgress('u1', 'p1', ['d0']);

    expect(res.success).toBe(false);
    const [sql, params] = (db.query as jest.Mock).mock.calls[0];
    expect(sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
    expect(params[0]).toBe('p1');
    expect(params[1]).toBe('u1');
  });
});

function mockQueries(db: DatabaseService, rules: Array<[RegExp, unknown[]]>) {
  (db.query as jest.Mock).mockImplementation((sql: string) => {
    for (const [re, rows] of rules) {
      if (re.test(sql)) return Promise.resolve({ rows } as any);
    }
    return Promise.resolve({ rows: [] } as any);
  });
}
