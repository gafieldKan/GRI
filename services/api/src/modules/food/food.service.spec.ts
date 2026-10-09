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

function mockQueryRouter(
  db: ReturnType<typeof makeDb>,
  rules: Array<[RegExp, (sql: string, params?: unknown[]) => unknown[]]>
) {
  (db.query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
    for (const [re, rows] of rules) {
      if (re.test(sql)) return Promise.resolve({ rows: rows(sql, params) });
    }
    return Promise.resolve({ rows: [] });
  });
}

function mockClientRouter(
  client: FakeClient,
  rules: Array<[RegExp, (sql: string, params?: unknown[]) => unknown[]]>
) {
  client.query.mockImplementation((sql: string, params?: unknown[]) => {
    if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return Promise.resolve({ rows: [] });
    for (const [re, rows] of rules) {
      if (re.test(sql)) return Promise.resolve({ rows: rows(sql, params) });
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

describe('FoodService 评价（completed 前置 / 所有权 / 唯一性）', () => {
  const OWNER = 'u-owner';
  const OTHER = 'u-other';
  const ORDER = {
    id: 'o1',
    user_id: OWNER,
    restaurant_id: 'r1',
    total_amount: 25,
    status: 'completed',
  };

  it.each([0, 6, 2.5])('评分非法（%s）→ BadRequest，不触事务', async (rating) => {
    const client = makeClient();
    const svc = new FoodService(makeDb(client));
    await expect(svc.createReview(OWNER, 'o1', { rating })).rejects.toBeInstanceOf(BadRequestException);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('content 超过 500 字 → BadRequest，不触事务', async () => {
    const client = makeClient();
    const svc = new FoodService(makeDb(client));
    await expect(
      svc.createReview(OWNER, 'o1', { rating: 5, content: 'x'.repeat(501) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('订单不存在 → NotFound + 回滚', async () => {
    const client = makeClient();
    mockClientRouter(client, []);
    const svc = new FoodService(makeDb(client));
    await expect(svc.createReview(OWNER, 'missing', { rating: 5 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(client.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
  });

  it('评价他人订单 → Forbidden + 回滚', async () => {
    const client = makeClient();
    mockClientRouter(client, [[/FROM public\.orders WHERE id = \$1 FOR UPDATE/, () => [ORDER]]]);
    const svc = new FoodService(makeDb(client));
    await expect(svc.createReview(OTHER, 'o1', { rating: 5 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(client.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
  });

  it('未完成订单 → Conflict + 回滚', async () => {
    const client = makeClient();
    mockClientRouter(client, [
      [/FROM public\.orders WHERE id = \$1 FOR UPDATE/, () => [{ ...ORDER, status: 'paid' }]],
    ]);
    const svc = new FoodService(makeDb(client));
    await expect(svc.createReview(OWNER, 'o1', { rating: 5 })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(client.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
  });

  it('一单一评：已有评价 → Conflict + 回滚', async () => {
    const client = makeClient();
    mockClientRouter(client, [
      [/FROM public\.orders WHERE id = \$1 FOR UPDATE/, () => [ORDER]],
      [/FROM public\.reviews WHERE order_id = \$1/, () => [{ id: 'rv-existing' }]],
    ]);
    const svc = new FoodService(makeDb(client));
    await expect(svc.createReview(OWNER, 'o1', { rating: 5 })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(client.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
  });

  it('合法评价：同一事务插入评价并提交', async () => {
    const review = {
      id: 'rv1',
      order_id: 'o1',
      user_id: OWNER,
      restaurant_id: 'r1',
      rating: 5,
      content: '很好',
    };
    const client = makeClient();
    mockClientRouter(client, [
      [/FROM public\.orders WHERE id = \$1 FOR UPDATE/, () => [ORDER]],
      [/FROM public\.reviews WHERE order_id = \$1/, () => []],
      [/INTO public\.reviews/, () => [review]],
    ]);
    const svc = new FoodService(makeDb(client));
    await expect(svc.createReview(OWNER, 'o1', { rating: 5, content: '很好' })).resolves.toEqual(
      review,
    );
    const insert = client.query.mock.calls.find((c) => /INTO public\.reviews/.test(c[0] as string));
    expect(insert?.[1]).toEqual([OWNER, 'o1', 'r1', 5, '很好']);
    expect(client.query.mock.calls.some((c) => c[0] === 'COMMIT')).toBe(true);
  });

  it('并发重复评价（唯一键 23505）→ Conflict + 回滚', async () => {
    const duplicate = Object.assign(new Error('duplicate'), { code: '23505' });
    const client = makeClient();
    client.query.mockImplementation((sql: string) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return Promise.resolve({ rows: [] });
      if (/FROM public\.orders WHERE id = \$1 FOR UPDATE/.test(sql))
        return Promise.resolve({ rows: [ORDER] });
      if (/FROM public\.reviews WHERE order_id = \$1/.test(sql)) return Promise.resolve({ rows: [] });
      if (/INTO public\.reviews/.test(sql)) return Promise.reject(duplicate);
      return Promise.resolve({ rows: [] });
    });
    const svc = new FoodService(makeDb(client));
    await expect(svc.createReview(OWNER, 'o1', { rating: 5 })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(client.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
  });

  it('餐厅评价列表按时间倒序返回', async () => {
    const db = makeDb(makeClient());
    const rows = [{ id: 'rv1', order_id: 'o1', user_id: OWNER, restaurant_id: 'r1', rating: 5 }];
    mockDbQueries(db, [[/FROM public\.reviews/, rows]]);
    const svc = new FoodService(db);
    await expect(svc.getReviews('r1')).resolves.toEqual(rows);
    const call = (db.query as jest.Mock).mock.calls[0];
    expect(call[1]).toEqual(['r1']);
  });
});

describe('FoodService 优惠券（限额 / 时间窗 / 互斥 / 原子领券）', () => {
  const USER = 'u1';
  const COUPON = {
    id: 'cp1',
    code: 'NEW10',
    name: '新人券',
    discount_type: 'fixed',
    discount_value: '10.00',
    min_amount: '20.00',
    total_quantity: 10,
    claimed_quantity: 1,
    per_user_limit: 1,
    start_at: new Date('2026-01-01T00:00:00Z'),
    end_at: new Date('2099-01-01T00:00:00Z'),
    mutex_group: null,
    status: 'active',
  };

  it('列券只返回 active、时间窗内且仍有库存的券', async () => {
    const db = makeDb(makeClient());
    mockDbQueries(db, [[/FROM public\.coupons/, [COUPON]]]);
    const svc = new FoodService(db);
    await expect(svc.listCoupons()).resolves.toEqual([COUPON]);
    const sql = String((db.query as jest.Mock).mock.calls[0][0]);
    expect(sql).toMatch(/status = 'active'/);
    expect(sql).toMatch(/start_at <= NOW\(\)/);
    expect(sql).toMatch(/end_at >= NOW\(\)/);
    expect(sql).toMatch(/claimed_quantity < total_quantity/);
  });

  it('券不存在 → NotFound + 回滚', async () => {
    const client = makeClient();
    mockClientRouter(client, []);
    const svc = new FoodService(makeDb(client));
    await expect(svc.claimCoupon(USER, { couponId: 'missing' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(client.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
  });

  it.each([
    ['停用', { ...COUPON, status: 'inactive' }],
    ['未开始', { ...COUPON, start_at: new Date('2099-01-01T00:00:00Z') }],
    ['已过期', { ...COUPON, end_at: new Date('2020-01-01T00:00:00Z') }],
  ])('%s 券 → BadRequest + 回滚', async (_name, coupon) => {
    const client = makeClient();
    mockClientRouter(client, [
      [/FROM public\.coupons WHERE id = \$1 FOR UPDATE/, () => [coupon]],
    ]);
    const svc = new FoodService(makeDb(client));
    await expect(svc.claimCoupon(USER, { couponId: COUPON.id })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(client.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
  });

  it('库存耗尽（原子 UPDATE 0 行）→ BadRequest + 回滚', async () => {
    const client = makeClient();
    mockClientRouter(client, [
      [/FROM public\.coupons WHERE id = \$1 FOR UPDATE/, () => [COUPON]],
      [/FROM public\.coupon_claims WHERE coupon_id = \$1 AND user_id = \$2/, () => []],
      [/UPDATE public\.coupons SET claimed_quantity = claimed_quantity \+ 1/, () => []],
    ]);
    const svc = new FoodService(makeDb(client));
    await expect(svc.claimCoupon(USER, { couponId: COUPON.id })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(client.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
  });

  it('超过 per_user_limit → Conflict + 回滚', async () => {
    const client = makeClient();
    mockClientRouter(client, [
      [/FROM public\.coupons WHERE id = \$1 FOR UPDATE/, () => [COUPON]],
      [/FROM public\.coupon_claims WHERE coupon_id = \$1 AND user_id = \$2/, () => [{ count: '1' }]],
    ]);
    const svc = new FoodService(makeDb(client));
    await expect(svc.claimCoupon(USER, { couponId: COUPON.id })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(client.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
  });

  it('互斥组已有有效券 → Conflict + 回滚', async () => {
    const mutexCoupon = { ...COUPON, mutex_group: 'seasonal' };
    const client = makeClient();
    mockClientRouter(client, [
      [/FROM public\.coupons WHERE id = \$1 FOR UPDATE/, () => [mutexCoupon]],
      [/FROM public\.coupon_claims WHERE coupon_id = \$1 AND user_id = \$2/, () => []],
      [/JOIN public\.coupons c ON c\.id = cc\.coupon_id/, () => [{ exists: 1 }]],
    ]);
    const svc = new FoodService(makeDb(client));
    await expect(svc.claimCoupon(USER, { couponId: COUPON.id })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(client.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
  });

  it('领券成功：原子占额 + 写入 claim + 提交', async () => {
    const claimed = { id: 'cc1', coupon_id: COUPON.id, user_id: USER };
    const client = makeClient();
    mockClientRouter(client, [
      [/FROM public\.coupons WHERE id = \$1 FOR UPDATE/, () => [COUPON]],
      [/FROM public\.coupon_claims WHERE coupon_id = \$1 AND user_id = \$2/, () => []],
      [/UPDATE public\.coupons SET claimed_quantity = claimed_quantity \+ 1/, () => [
        { ...COUPON, claimed_quantity: 2 },
      ]],
      [/INTO public\.coupon_claims/, () => [claimed]],
    ]);
    const svc = new FoodService(makeDb(client));
    await expect(svc.claimCoupon(USER, { couponId: COUPON.id })).resolves.toEqual(claimed);
    const update = client.query.mock.calls.find((c) =>
      /UPDATE public\.coupons SET claimed_quantity/.test(c[0] as string),
    );
    expect(update?.[1]).toEqual([COUPON.id]);
    expect(client.query.mock.calls.some((c) => c[0] === 'COMMIT')).toBe(true);
  });

  it('并发超领（唯一键 23505）→ Conflict + 回滚', async () => {
    const duplicate = Object.assign(new Error('duplicate'), { code: '23505' });
    const client = makeClient();
    client.query.mockImplementation((sql: string) => {
      if (/BEGIN|COMMIT|ROLLBACK/.test(sql)) return Promise.resolve({ rows: [] });
      if (/FROM public\.coupons WHERE id = \$1 FOR UPDATE/.test(sql))
        return Promise.resolve({ rows: [COUPON] });
      if (/FROM public\.coupon_claims WHERE coupon_id = \$1 AND user_id = \$2/.test(sql))
        return Promise.resolve({ rows: [] });
      if (/UPDATE public\.coupons SET claimed_quantity/.test(sql))
        return Promise.resolve({ rows: [{ ...COUPON, claimed_quantity: 2 }] });
      if (/INTO public\.coupon_claims/.test(sql)) return Promise.reject(duplicate);
      return Promise.resolve({ rows: [] });
    });
    const svc = new FoodService(makeDb(client));
    await expect(svc.claimCoupon(USER, { couponId: COUPON.id })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(client.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
  });

  it('我的券返回 claim + coupon 视图', async () => {
    const rows = [{ id: 'cc1', coupon_id: COUPON.id, user_id: USER, code: COUPON.code }];
    const db = makeDb(makeClient());
    mockDbQueries(db, [[/FROM public\.coupon_claims cc/, rows]]);
    const svc = new FoodService(db);
    await expect(svc.getMyCoupons(USER)).resolves.toEqual(rows);
    expect((db.query as jest.Mock).mock.calls[0][1]).toEqual([USER]);
  });
});

describe('FoodService 商家后台（归属校验 / 运营旁路 / 事务）', () => {
  const MERCHANT = 'm1';
  const OTHER = 'm2';
  const OPERATOR = 'op1';
  const RESTAURANT = {
    id: 'r1',
    name: '商家餐厅',
    address: 'A 街 1 号',
    merchant_id: MERCHANT,
    status: 'open',
  };

  function withSiteOperator(db: ReturnType<typeof makeDb>, role: 'owner' | null) {
    const base = db.query as jest.Mock;
    const original = base.getMockImplementation();
    base.mockImplementation((sql: string, params?: unknown[]) => {
      if (/FROM tenant\.organizations WHERE parent_id IS NULL/.test(sql))
        return Promise.resolve({ rows: [{ id: 'root' }] });
      if (/FROM tenant\.organization_members/.test(sql))
        return Promise.resolve({ rows: role ? [{ role }] : [] });
      return original ? original(sql, params) : Promise.resolve({ rows: [] });
    });
    return db;
  }

  it('商家列餐厅仅按 merchant_id 过滤', async () => {
    const db = makeDb(makeClient());
    mockQueryRouter(db, [
      [/FROM tenant\.organizations WHERE parent_id IS NULL/, () => [{ id: 'root' }]],
      [/FROM tenant\.organization_members/, () => []],
      [/FROM public\.restaurants/, () => [RESTAURANT]],
    ]);
    const svc = new FoodService(db);
    await expect(svc.merchantListRestaurants(MERCHANT, { status: 'open', q: '商家' })).resolves.toEqual([
      RESTAURANT,
    ]);
    const call = (db.query as jest.Mock).mock.calls.find((c) =>
      /FROM public\.restaurants/.test(c[0] as string),
    );
    expect(call?.[1]).toContain(MERCHANT);
    expect(String(call?.[0])).toMatch(/merchant_id = \$1/);
    expect(String(call?.[0])).toMatch(/status = \$2/);
    expect(String(call?.[0])).toMatch(/name ILIKE \$3 OR address ILIKE \$3/);
  });

  it('普通用户列餐厅返回空集合而非越权数据', async () => {
    const db = makeDb(makeClient());
    mockQueryRouter(db, [
      [/FROM tenant\.organizations WHERE parent_id IS NULL/, () => [{ id: 'root' }]],
      [/FROM tenant\.organization_members/, () => []],
      [/FROM public\.restaurants/, () => []],
    ]);
    const svc = new FoodService(db);
    await expect(svc.merchantListRestaurants(OTHER)).resolves.toEqual([]);
    const call = (db.query as jest.Mock).mock.calls.find((c) =>
      /FROM public\.restaurants/.test(c[0] as string),
    );
    expect(call?.[1]).toEqual([OTHER]);
  });

  it('运营列餐厅不过滤 merchant_id，可看全部', async () => {
    const db = makeDb(makeClient());
    mockQueryRouter(db, [
      [/FROM tenant\.organizations WHERE parent_id IS NULL/, () => [{ id: 'root' }]],
      [/FROM tenant\.organization_members/, () => [{ role: 'owner' }]],
      [/FROM public\.restaurants/, () => [RESTAURANT]],
    ]);
    const svc = new FoodService(db);
    await svc.merchantListRestaurants(OPERATOR);
    const call = (db.query as jest.Mock).mock.calls.find((c) =>
      /FROM public\.restaurants/.test(c[0] as string),
    );
    expect(String(call?.[0])).not.toMatch(/merchant_id = \$1/);
    expect(call?.[1]).toEqual([]);
  });

  it('创建餐厅自动挂 merchant_id = externalId', async () => {
    const created = { ...RESTAURANT, id: 'r-new' };
    const db = makeDb(makeClient());
    mockDbQueries(db, [[/INTO public\.restaurants/, [created]]]);
    const svc = new FoodService(db);
    await expect(
      svc.merchantCreateRestaurant(MERCHANT, { name: '新店', address: 'B 街 2 号' }),
    ).resolves.toEqual(created);
    expect((db.query as jest.Mock).mock.calls[0][1]).toEqual([
      MERCHANT,
      '新店',
      'B 街 2 号',
      undefined,
      'open',
    ]);
  });

  it('创建餐厅缺 name/address → BadRequest，不触库', async () => {
    const db = makeDb(makeClient());
    const svc = new FoodService(db);
    await expect(
      svc.merchantCreateRestaurant(MERCHANT, { name: '', address: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('商家更新自己的餐厅 → 200 语义（返回更新行）', async () => {
    const updated = { ...RESTAURANT, name: '新名称' };
    const db = withSiteOperator(makeDb(makeClient()), null);
    (db.query as jest.Mock).mockImplementation((sql: string) => {
      if (/FROM tenant\.organizations WHERE parent_id IS NULL/.test(sql))
        return Promise.resolve({ rows: [{ id: 'root' }] });
      if (/FROM tenant\.organization_members/.test(sql)) return Promise.resolve({ rows: [] });
      if (/FROM public\.restaurants WHERE id = \$1/.test(sql))
        return Promise.resolve({ rows: [RESTAURANT] });
      if (/UPDATE public\.restaurants SET/.test(sql)) return Promise.resolve({ rows: [updated] });
      return Promise.resolve({ rows: [] });
    });
    const svc = new FoodService(db);
    await expect(
      svc.merchantUpdateRestaurant(MERCHANT, RESTAURANT.id, { name: '新名称' }),
    ).resolves.toEqual(updated);
  });

  it('商家更新他人餐厅 → Forbidden', async () => {
    const db = makeDb(makeClient());
    mockQueryRouter(db, [
      [/FROM tenant\.organizations WHERE parent_id IS NULL/, () => [{ id: 'root' }]],
      [/FROM tenant\.organization_members/, () => []],
      [/FROM public\.restaurants WHERE id = \$1/, () => [RESTAURANT]],
    ]);
    const svc = new FoodService(db);
    await expect(
      svc.merchantUpdateRestaurant(OTHER, RESTAURANT.id, { name: '越权' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('运营可更新非本人餐厅', async () => {
    const updated = { ...RESTAURANT, status: 'closed' };
    const db = makeDb(makeClient());
    mockQueryRouter(db, [
      [/FROM public\.restaurants WHERE id = \$1/, () => [RESTAURANT]],
      [/FROM tenant\.organizations WHERE parent_id IS NULL/, () => [{ id: 'root' }]],
      [/FROM tenant\.organization_members/, () => [{ role: 'admin' }]],
      [/UPDATE public\.restaurants SET/, () => [updated]],
    ]);
    const svc = new FoodService(db);
    await expect(
      svc.merchantUpdateRestaurant(OPERATOR, RESTAURANT.id, { status: 'closed' }),
    ).resolves.toEqual(updated);
  });

  it('批量 upsert 菜品：归属有效时事务内插入/更新并提交', async () => {
    const dish = {
      id: 'd1',
      restaurant_id: RESTAURANT.id,
      name: '招牌菜',
      price: 18,
      status: 'available',
    };
    const client = makeClient();
    mockClientRouter(client, [
      [/FROM public\.restaurants WHERE id = \$1 FOR UPDATE/, () => [RESTAURANT]],
      [/FROM tenant\.organizations WHERE parent_id IS NULL/, () => [{ id: 'root' }]],
      [/FROM tenant\.organization_members/, () => []],
      [/INTO public\.dishes/, () => [dish]],
    ]);
    const svc = new FoodService(makeDb(client));
    await expect(
      svc.merchantUpsertDishes(MERCHANT, RESTAURANT.id, [
        { name: '招牌菜', price: 18, status: 'available' },
      ]),
    ).resolves.toEqual([dish]);
    expect(client.query.mock.calls.some((c) => c[0] === 'COMMIT')).toBe(true);
  });

  it('批量 upsert 非法归属 → Forbidden + 回滚', async () => {
    const client = makeClient();
    mockClientRouter(client, [
      [/FROM public\.restaurants WHERE id = \$1 FOR UPDATE/, () => [RESTAURANT]],
      [/FROM tenant\.organizations WHERE parent_id IS NULL/, () => [{ id: 'root' }]],
      [/FROM tenant\.organization_members/, () => []],
    ]);
    const svc = new FoodService(makeDb(client));
    await expect(
      svc.merchantUpsertDishes(OTHER, RESTAURANT.id, [{ name: '越权菜', price: 1 }]),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
    expect(client.query.mock.calls.some((c) => /INTO public\.dishes/.test(c[0] as string))).toBe(false);
  });

  it('批量 upsert 带 id 但菜品不属于该餐厅 → BadRequest + 回滚', async () => {
    const client = makeClient();
    mockClientRouter(client, [
      [/FROM public\.restaurants WHERE id = \$1 FOR UPDATE/, () => [RESTAURANT]],
      [/FROM tenant\.organizations WHERE parent_id IS NULL/, () => [{ id: 'root' }]],
      [/FROM tenant\.organization_members/, () => []],
      [/UPDATE public\.dishes SET/, () => []],
    ]);
    const svc = new FoodService(makeDb(client));
    await expect(
      svc.merchantUpsertDishes(MERCHANT, RESTAURANT.id, [{ id: 'd-other', name: '坏菜', price: 1 }]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
  });

  it('商家订单列表按名下餐厅过滤', async () => {
    const orders = [{ id: 'o1', restaurant_id: RESTAURANT.id, status: 'paid' }];
    const db = makeDb(makeClient());
    mockQueryRouter(db, [
      [/FROM tenant\.organizations WHERE parent_id IS NULL/, () => [{ id: 'root' }]],
      [/FROM tenant\.organization_members/, () => []],
      [/FROM public\.orders o/, () => orders],
    ]);
    const svc = new FoodService(db);
    await expect(
      svc.merchantListOrders(MERCHANT, { status: 'paid', restaurantId: RESTAURANT.id }),
    ).resolves.toEqual(orders);
    const call = (db.query as jest.Mock).mock.calls.find((c) => /FROM public\.orders o/.test(c[0] as string));
    expect(String(call?.[0])).toMatch(/r\.merchant_id = \$1/);
    expect(call?.[1]).toEqual([MERCHANT, 'paid', RESTAURANT.id]);
  });

  it('运营订单列表不过滤 merchant_id', async () => {
    const orders = [{ id: 'o1', restaurant_id: RESTAURANT.id, status: 'paid' }];
    const db = makeDb(makeClient());
    mockQueryRouter(db, [
      [/FROM tenant\.organizations WHERE parent_id IS NULL/, () => [{ id: 'root' }]],
      [/FROM tenant\.organization_members/, () => [{ role: 'owner' }]],
      [/FROM public\.orders o/, () => orders],
    ]);
    const svc = new FoodService(db);
    await svc.merchantListOrders(OPERATOR);
    const call = (db.query as jest.Mock).mock.calls.find((c) => /FROM public\.orders o/.test(c[0] as string));
    expect(String(call?.[0])).not.toMatch(/r\.merchant_id = \$1/);
    expect(call?.[1]).toEqual([]);
  });

  it('商家订单统计按名下餐厅聚合并数值化', async () => {
    const stats = {
      total: '3',
      pending: '1',
      paid: '1',
      confirmed: '0',
      completed: '1',
      cancelled: '0',
      revenue: '88.50',
    };
    const db = makeDb(makeClient());
    mockQueryRouter(db, [
      [/FROM tenant\.organizations WHERE parent_id IS NULL/, () => [{ id: 'root' }]],
      [/FROM tenant\.organization_members/, () => []],
      [/COUNT\(\*\)::int AS total/, () => [stats]],
    ]);
    const svc = new FoodService(db);
    await expect(svc.merchantOrderStats(MERCHANT)).resolves.toEqual({
      total: 3,
      pending: 1,
      paid: 1,
      confirmed: 0,
      completed: 1,
      cancelled: 0,
      revenue: 88.5,
    });
  });

  it('运营订单统计不过滤 merchant_id', async () => {
    const db = makeDb(makeClient());
    mockQueryRouter(db, [
      [/FROM tenant\.organizations WHERE parent_id IS NULL/, () => [{ id: 'root' }]],
      [/FROM tenant\.organization_members/, () => [{ role: 'admin' }]],
      [/COUNT\(\*\)::int AS total/, () => [
        { total: 0, pending: 0, paid: 0, confirmed: 0, completed: 0, cancelled: 0, revenue: 0 },
      ]],
    ]);
    const svc = new FoodService(db);
    await svc.merchantOrderStats(OPERATOR);
    const call = (db.query as jest.Mock).mock.calls.find((c) =>
      /COUNT\(\*\)::int AS total/.test(c[0] as string),
    );
    expect(String(call?.[0])).not.toMatch(/r\.merchant_id = \$1/);
  });
});
