import { DashboardService } from './dashboard.service';
import { DatabaseService } from '../../database/database.service';

type FakeClient = { query: jest.Mock; release: jest.Mock };
function makeDb(client: FakeClient) {
  const db = { query: jest.fn(), getPool: jest.fn(() => ({ connect: jest.fn().mockResolvedValue(client) })) };
  return db as unknown as DatabaseService;
}

function mockDbQueries(db: DatabaseService, rules: Array<[RegExp, unknown[]]>) {
  (db.query as jest.Mock).mockImplementation((sql: string) => {
    for (const [re, rows] of rules) {
      if (re.test(sql)) return Promise.resolve({ rows });
    }
    return Promise.resolve({ rows: [] });
  });
}

describe('DashboardService（M5 dashboard 聚合）', () => {
  it('overview：聚合并映射裸 body 键（今日/商家/客单价）', async () => {
    const db = makeDb({ query: jest.fn(), release: jest.fn() });
    mockDbQueries(db, [
      [/COUNT[\s\S]*public\.orders[\s\S]*CURRENT_DATE/, [{ count: 3 }]],
      [/public\.payments[\s\S]*status = 'paid'/, [{ total: 100.5 }]],
      [/COUNT[\s\S]*public\.restaurants/, [{ total: 5, closed: 1 }]],
      [/FROM public\.orders/, [{ avg: '20.2' }]],
      [/COUNT[\s\S]*public\.users[\s\S]*CURRENT_DATE/, [{ count: 2 }]],
    ]);
    const svc = new DashboardService(db);

    const r = await svc.getOverview();
    expect(r).toEqual({
      todayOrders: 3,
      todayRevenue: 100.5,
      todayUsers: 2,
      totalMerchants: 5,
      pendingMerchants: 1,
      avgOrderValue: 20.2,
    });
  });

  it('orders-trend：映射 order_count/order_amount → camelCase', async () => {
    const db = makeDb({ query: jest.fn(), release: jest.fn() });
    mockDbQueries(db, [
      [/public\.orders[\s\S]*6 days/, [
        { date: '09/11', order_count: 2, order_amount: 50 },
        { date: '09/12', order_count: 4, order_amount: 120 },
      ]],
    ]);
    const svc = new DashboardService(db);

    const r = await svc.getOrdersTrend();
    expect(r).toEqual([
      { date: '09/11', orderCount: 2, orderAmount: 50 },
      { date: '09/12', orderCount: 4, orderAmount: 120 },
    ]);
  });

  it('region-distribution：餐厅名 + 订单数，字符串标识不变', async () => {
    const db = makeDb({ query: jest.fn(), release: jest.fn() });
    mockDbQueries(db, [
      [/JOIN[\s\S]*public\.orders/, [{ name: '食味轩', value: 9 }, { name: '', value: 1 }]],
    ]);
    const svc = new DashboardService(db);

    const r = await svc.getRegionDistribution();
    expect(r).toEqual([
      { name: '食味轩', value: 9 },
      { name: '', value: 1 },
    ]);
  });

  it('top-products：JOIN dishes 取名 + 锁价金额聚合', async () => {
    const db = makeDb({ query: jest.fn(), release: jest.fn() });
    mockDbQueries(db, [
      [/JOIN public\.dishes/, [
        { name: '红烧肉', sales: 15, amount: 300 },
        { name: undefined, sales: 3, amount: 12 },
      ]],
    ]);
    const svc = new DashboardService(db);

    const r = await svc.getTopProducts();
    expect(r).toEqual([
      { name: '红烧肉', sales: 15, amount: 300 },
      { name: undefined, sales: 3, amount: 12 },
    ]);
  });

  it('user-funnel：按月聚合新增用户', async () => {
    const db = makeDb({ query: jest.fn(), release: jest.fn() });
    mockDbQueries(db, [
      [/public\.users/, [{ month: '2026-08', count: 7 }, { month: '2026-09', count: 12 }]],
    ]);
    const svc = new DashboardService(db);

    const r = await svc.getUserFunnel();
    expect(r).toEqual([
      { month: '2026-08', count: 7 },
      { month: '2026-09', count: 12 },
    ]);
  });
});