import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { FoodService } from './food.service';
import { DatabaseService } from '../../database/database.service';

type FakeClient = {
  query: jest.Mock;
  release: jest.Mock;
};

function makeClient() {
  const client: FakeClient = { query: jest.fn(), release: jest.fn() };
  return client;
}

function makeDb(client: FakeClient) {
  const db = { query: jest.fn(), getPool: jest.fn(() => ({ connect: jest.fn().mockResolvedValue(client) })) };
  return db as unknown as DatabaseService;
}

/** 让假 client.query 对 BEGIN/COMMIT/ROLLBACK 直接成功 */
function markTransactionBoundaries(client: FakeClient) {
  client.query.mockImplementation((sql: string, _params?: unknown[]) => {
    if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return Promise.resolve({ rows: [] });
    return Promise.resolve({ rows: [] });
  });
}

/** 让 db.query 依 regex 返回 rows；未命中默认空 */
function mockDbQueries(db: ReturnType<typeof makeDb>, rules: Array<[RegExp, unknown[]]>) {
  (db.query as jest.Mock).mockImplementation((sql: string) => {
    for (const [re, rows] of rules) {
      if (re.test(sql)) return Promise.resolve({ rows });
    }
    return Promise.resolve({ rows: [] });
  });
}

const NOTIFY_SECRET = 'gri-dev-notify-secret';
function signNotify(p: { orderId: string; transactionId: string; amount: number | string; method?: string }) {
  return createHmac('sha256', NOTIFY_SECRET)
    .update([p.orderId, p.transactionId, String(p.amount), p.method ?? ''].join(':'))
    .digest('hex');
}

describe('FoodService.createOrder（服务端锁价 + 事务）', () => {
  const RESTAURANT_ID = 'r1';
  const DISH_ID = 'd1';
  const USER_ID = 'u1';
  const DISH_ROW = { id: DISH_ID, price: '12.50', restaurant_id: RESTAURANT_ID, status: 'available' };

  it('客户端篡改单价 → 仍以库价为准计算总额', async () => {
    const client = makeClient();
    markTransactionBoundaries(client);
    // 菜品 SELECT 返回库价
    client.query.mockImplementation((sql: string) => {
      if (/FROM public.dishes/.test(sql)) return Promise.resolve({ rows: [DISH_ROW] });
      if (/INTO public.orders/.test(sql)) return Promise.resolve({ rows: [{ id: 'o1', status: 'pending' }] });
      if (/INTO public.order_items/.test(sql)) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });
    const db = makeDb(client);
    const svc = new FoodService(db);

    // 客户端传 price: 0.01，库价 12.50 → 应锁 12.50
    const order = await svc.createOrder(USER_ID, {
      restaurantId: RESTAURANT_ID,
      items: [{ dishId: DISH_ID, quantity: 2, price: 0.01 } as any],
    });

    // orders 插的 total_amount 来自库价 12.50 * 2 = 25（pg NUMERIC 返回字符串 '12.50'，运算后为数值 25）
    const orderInsert = client.query.mock.calls.find((c) => /INTO public.orders/.test(c[0] as string));
    expect(orderInsert).toBeTruthy();
    expect(orderInsert![1]).toEqual([USER_ID, RESTAURANT_ID, 25]);
    // order_items 插的单价也是库价 12.50，不是 0.01
    const itemInsert = client.query.mock.calls.find((c) => /INTO public.order_items/.test(c[0] as string));
    expect(itemInsert![1]).toContain('12.50');
    // 事务干净提交
    expect(client.query.mock.calls.some((c) => c[0] === 'COMMIT')).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  it('菜品不属于该餐厅 → BadRequest + 回滚', async () => {
    const client = makeClient();
    markTransactionBoundaries(client);
    client.query.mockImplementation((sql: string) => {
      if (/FROM public.dishes/.test(sql))
        return Promise.resolve({ rows: [{ ...DISH_ROW, restaurant_id: 'OTHER' }] });
      return Promise.resolve({ rows: [] });
    });
    const svc = new FoodService(makeDb(client));

    await expect(
      svc.createOrder(USER_ID, { restaurantId: RESTAURANT_ID, items: [{ dishId: DISH_ID, quantity: 1, price: 10 } as any] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
  });

  it('items 为空或在售状态不符 → BadRequest，不触库', async () => {
    const client = makeClient();
    const svc = new FoodService(makeDb(client));

    await expect(
      svc.createOrder(USER_ID, { restaurantId: RESTAURANT_ID, items: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.query).not.toHaveBeenCalled();
  });
});
describe('FoodService 订单状态机（原子守卫 + 所有权）', () => {
  const OWNER = 'u-owner';
  const OTHER = 'u-other';
  const OP = 'u-op';
  const ORDER = { id: 'o1', user_id: OWNER, status: 'pending', restaurant_id: 'r1', total_amount: 25 };

  it('confirm：仅允许 pending/paid → confirmed', async () => {
    const db = makeDb(makeClient());
    mockDbQueries(db, [[/SELECT \* FROM public.orders WHERE id = \$1/, [ORDER]]]);
    (db.query as jest.Mock).mockImplementation((sql: string) => {
      if (/SELECT \* FROM public.orders WHERE id = \$1/.test(sql)) return Promise.resolve({ rows: [ORDER] });
      if (/SELECT role FROM public.users/.test(sql)) return Promise.resolve({ rows: [{ role: 'consumer' }] });
      if (/UPDATE public.orders SET status/.test(sql))
        return Promise.resolve({ rows: [{ ...ORDER, status: 'confirmed' }] });
      return Promise.resolve({ rows: [] });
    });
    const svc = new FoodService(db);
    const updated = await svc.confirmOrder(OWNER, 'o1');
    expect(updated.status).toBe('confirmed');
  });

  it('complete：非 allowed 状态（pending）→ Conflict，不落库', async () => {
    const db = makeDb(makeClient());
    mockDbQueries(db, [
      [/SELECT \* FROM public.orders WHERE id = \$1/, [ORDER]],
      [/SELECT role FROM public.users/, [{ rows: [{ role: 'consumer' }] }]],
    ]);
    const svc = new FoodService(db);
    await expect(svc.completeOrder(OWNER, 'o1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('越权操作他人订单 → Forbidden（非本人且非特权）', async () => {
    const db = makeDb(makeClient());
    mockDbQueries(db, [
      [/SELECT \* FROM public.orders WHERE id = \$1/, [ORDER]],
      [/SELECT role FROM public.users/, [{ role: 'consumer' }]],
    ]);
    const svc = new FoodService(db);
    await expect(svc.cancelOrder(OTHER, 'o1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('订单不存在 → NotFound', async () => {
    const db = makeDb(makeClient());
    mockDbQueries(db, []);
    const svc = new FoodService(db);
    await expect(svc.getOrderById(OWNER, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getOrderById 防 IDOR：privileged(operator) 可读他人订单并带明细', async () => {
    const db = makeDb(makeClient());
    (db.query as jest.Mock).mockImplementation((sql: string) => {
      if (/SELECT \* FROM public.orders WHERE id = \$1/.test(sql)) return Promise.resolve({ rows: [ORDER] });
      if (/SELECT role FROM public.users/.test(sql)) return Promise.resolve({ rows: [{ role: 'operator' }] });
      if (/FROM public.order_items/.test(sql)) return Promise.resolve({ rows: [{ id: 'oi1', dish_id: 'd1' }] });
      return Promise.resolve({ rows: [] });
    });
    const svc = new FoodService(db);
    const detail = await svc.getOrderById(OP, 'o1');
    expect(detail.items).toHaveLength(1);
  });

  it('非特权读他人订单 → Forbidden', async () => {
    const db = makeDb(makeClient());
    (db.query as jest.Mock).mockImplementation((sql: string) => {
      if (/SELECT \* FROM public.orders WHERE id = \$1/.test(sql)) return Promise.resolve({ rows: [ORDER] });
      if (/SELECT role FROM public.users/.test(sql)) return Promise.resolve({ rows: [{ role: 'consumer' }] });
      return Promise.resolve({ rows: [] });
    });
    const svc = new FoodService(db);
    await expect(svc.getOrderById(OTHER, 'o1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('FoodService 支付（金额锁库 / 签名 / 幂等 / 退款权限）', () => {
  const OWNER = 'u-owner';
  const OP = 'u-op';
  const ORDER = { id: 'o1', user_id: OWNER, status: 'pending', restaurant_id: 'r1', total_amount: 100 };
  const PAYMENT = { id: 'p1', order_id: 'o1', user_id: OWNER, amount: 100, status: 'pending', transaction_id: null };

  it('createPayment（dev mock）：金额取订单锁价，同事务收单 → paid + confirmed', async () => {
    const client = makeClient();
    markTransactionBoundaries(client);
    client.query.mockImplementation((sql: string) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return Promise.resolve({ rows: [] });
      if (/UPDATE public.payments SET status = 'paid'/.test(sql))
        return Promise.resolve({ rows: [{ ...PAYMENT, status: 'paid', transaction_id: 'mock_1' }] });
      if (/UPDATE public.orders SET status = 'paid'/.test(sql))
        return Promise.resolve({ rows: [{ ...ORDER, status: 'paid' }] });
      return Promise.resolve({ rows: [] });
    });
    const db = makeDb(client);
    (db.query as jest.Mock).mockImplementation((sql: string) => {
      if (/FROM public.orders WHERE id = \$1 FOR UPDATE/.test(sql)) return Promise.resolve({ rows: [ORDER] });
      if (/INTO public.payments/.test(sql)) return Promise.resolve({ rows: [{ ...PAYMENT }] });
      if (/SELECT role FROM public.users/.test(sql)) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });
    const svc = new FoodService(db);
    const p = await svc.createPayment(OWNER, 'o1', 'mock');
    expect(p.amount).toBe(100);
    expect(p.status).toBe('paid');
    expect(p.confirmed).toBe(true);
  });

  it('createPayment：他人订单 → Forbidden', async () => {
    const db = makeDb(makeClient());
    (db.query as jest.Mock).mockImplementation((sql: string) => {
      if (/FROM public.orders WHERE id = \$1 FOR UPDATE/.test(sql)) return Promise.resolve({ rows: [ORDER] });
      return Promise.resolve({ rows: [] });
    });
    const svc = new FoodService(db);
    await expect(svc.createPayment('u-other', 'o1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('notify：签名错 → Unauthorized，不触发任何更新', async () => {
    const db = makeDb(makeClient());
    const client = makeClient();
    const svc = new FoodService(makeDb(client));
    await expect(
      svc.notifyPayment({ orderId: 'o1', transactionId: 'tx1', amount: 100, signature: 'forged' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('notify：金额与锁库不符 → BadRequest（防伪造改额）', async () => {
    const good = signNotify({ orderId: 'o1', transactionId: 'tx1', amount: 999 });
    const db = makeDb(makeClient());
    (db.query as jest.Mock).mockImplementation((sql: string) => {
      if (/status = 'paid'/.test(sql)) return Promise.resolve({ rows: [] });
      if (/status = 'pending' ORDER BY created_at DESC LIMIT 1/.test(sql))
        return Promise.resolve({ rows: [PAYMENT] });
      return Promise.resolve({ rows: [] });
    });
    const svc = new FoodService(db);
    await expect(
      svc.notifyPayment({ orderId: 'o1', transactionId: 'tx1', amount: 999, signature: good }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('notify：签名对 + 金额对 → 支付单 paid + 订单 paid（原子事务）', async () => {
    const good = signNotify({ orderId: 'o1', transactionId: 'tx1', amount: 100 });
    const client = makeClient();
    markTransactionBoundaries(client);
    client.query.mockImplementation((sql: string) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return Promise.resolve({ rows: [] });
      if (/UPDATE public.payments SET status = 'paid'/.test(sql))
        return Promise.resolve({ rows: [{ ...PAYMENT, status: 'paid', transaction_id: 'tx1' }] });
      if (/UPDATE public.orders SET status = 'paid'/.test(sql))
        return Promise.resolve({ rows: [{ ...ORDER, status: 'paid' }] });
      return Promise.resolve({ rows: [] });
    });
    const db = makeDb(client);
    (db.query as jest.Mock).mockImplementation((sql: string) => {
      if (/status = 'paid'/.test(sql)) return Promise.resolve({ rows: [] });
      if (/status = 'pending' ORDER BY created_at DESC LIMIT 1/.test(sql))
        return Promise.resolve({ rows: [PAYMENT] });
      return Promise.resolve({ rows: [] });
    });
    const svc = new FoodService(db);
    const r = await svc.notifyPayment({ orderId: 'o1', transactionId: 'tx1', amount: 100, signature: good });
    expect(r.paid).toBe(true);
    // 双表都进入 paid
    expect(client.query.mock.calls.filter((c) => /SET status = 'paid'/.test(String(c[0])))).toHaveLength(2);
  });

  it('notify：同订单+同交易号重放幂等，无副作用（不再更新）', async () => {
    const good = signNotify({ orderId: 'o1', transactionId: 'tx-replay', amount: 100 });
    const db = makeDb(makeClient());
    (db.query as jest.Mock).mockImplementation((sql: string) => {
      if (/status = 'paid'/.test(sql))
        return Promise.resolve({ rows: [{ ...PAYMENT, status: 'paid', transaction_id: 'tx-replay' }] });
      return Promise.resolve({ rows: [] });
    });
    const svc = new FoodService(db);
    const r = await svc.notifyPayment({ orderId: 'o1', transactionId: 'tx-replay', amount: 100, signature: good });
    expect(r.paid).toBe(true);
    expect(db.query).toHaveBeenCalledTimes(1); // 只做幂等查询，不碰事务更新
  });

  it('refund：非 operator/merchant → Forbidden', async () => {
    const db = makeDb(makeClient());
    (db.query as jest.Mock).mockImplementation((sql: string) => {
      if (/SELECT role FROM public.users/.test(sql)) return Promise.resolve({ rows: [{ role: 'consumer' }] });
      return Promise.resolve({ rows: [] });
    });
    const svc = new FoodService(db);
    await expect(svc.refundPayment(OWNER, 'o1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refund：privileged → 支付单 refunded + 订单 cancelled', async () => {
    const paid = { ...PAYMENT, status: 'paid', transaction_id: 'tx1' };
    const client = makeClient();
    markTransactionBoundaries(client);
    client.query.mockImplementation((sql: string) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return Promise.resolve({ rows: [] });
      if (/UPDATE public.payments SET status = 'refunded'/.test(sql))
        return Promise.resolve({ rows: [{ ...paid, status: 'refunded' }] });
      if (/UPDATE public.orders SET status = 'cancelled'/.test(sql))
        return Promise.resolve({ rows: [{ ...ORDER, status: 'cancelled' }] });
      return Promise.resolve({ rows: [] });
    });
    const db2 = makeDb(client);
    (db2.query as jest.Mock).mockImplementation((sql: string) => {
      if (/SELECT role FROM public.users/.test(sql)) return Promise.resolve({ rows: [{ role: 'operator' }] });
      if (/status = 'paid' ORDER BY created_at DESC LIMIT 1/.test(sql)) return Promise.resolve({ rows: [paid] });
      return Promise.resolve({ rows: [] });
    });
    const svc = new FoodService(db2);
    const r = await svc.refundPayment(OP, 'o1');
    expect(r.status).toBe('refunded');
  });
});
