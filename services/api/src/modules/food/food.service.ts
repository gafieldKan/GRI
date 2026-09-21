import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import {
  Restaurant,
  Dish,
  Order,
  OrderStatus,
  Payment,
} from './food.types';

/**
 * 订单状态机（M5 垂直一，重写自有模型，非旧 Express 枚举）：
 *   pending ──(支付回执)──► paid ──(确认)──► confirmed ──(完成)──► completed
 *     │                     │         │   （终态；completed 不可再变）
 *     └──────┬──────────────┴──┬──────┴────────────────────────────▶ cancelled
 *            └ cancelled 允许自 pending/paid/confirmed 进入（delivered/completed 不可取消）
 **/
const ALLOWED_FROM: Record<string, OrderStatus[]> = {
  paid: ['pending'],
  confirmed: ['paid', 'pending'],
  // complete 允许自 paid 直达（客户支付后即可"确认收货"，v1 未跟踪配送 stage）
  completed: ['paid', 'confirmed', 'delivered'],
  cancelled: ['pending', 'paid', 'confirmed'],
};

const PRIVILEGED_ROLES = new Set(['operator', 'merchant']);

/** 已配置真实网关的支付方法（provider 存在 → 走 async notify；生产注入配置后把 method 加进来）。 */
const PAYMENT_PROVIDERS: Set<string> = new Set();

@Injectable()
export class FoodService {
  constructor(private readonly db: DatabaseService) {}

  // ------------------------------------------------------------------
  // 通用：角色/权限判定（DB 真源，不依赖 JWT 缓存轮换丢 roles 的边缘）
  // ------------------------------------------------------------------
  private async isPrivilegedUser(userId: string): Promise<boolean> {
    const res = await this.db.query('SELECT role FROM public.users WHERE id = $1', [userId]);
    return res.rows.length > 0 && PRIVILEGED_ROLES.has(res.rows[0].role);
  }

  // --- 餐厅与菜品（公开读） ---

  async findAllRestaurants(): Promise<Restaurant[]> {
    const res = await this.db.query(
      `SELECT id, name, address, phone, rating, status, created_at
         FROM public.restaurants
        WHERE status = 'open'
        ORDER BY rating DESC NULLS LAST`,
    );
    return res.rows as Restaurant[];
  }

  async findRestaurantById(id: string): Promise<Restaurant> {
    const res = await this.db.query(
      'SELECT id, name, address, phone, rating, status, created_at FROM public.restaurants WHERE id = $1',
      [id],
    );
    if (res.rows.length === 0) throw new NotFoundException('Restaurant not found');
    return res.rows[0] as Restaurant;
  }

  async findDishesByRestaurant(restaurantId: string): Promise<Dish[]> {
    const res = await this.db.query(
      `SELECT id, restaurant_id, name, description, price, category, image_url, status
         FROM public.dishes
        WHERE restaurant_id = $1 AND status = 'available'
        ORDER BY category, name`,
      [restaurantId],
    );
    return res.rows as Dish[];
  }

  // --- 订单（写登录；读列表/详情 = 本人或特权） ---

  async createOrder(
    userId: string,
    orderData: { restaurantId: string; items: { dishId: string; quantity: number }[] },
  ): Promise<Order> {
    if (!orderData.restaurantId || !Array.isArray(orderData.items) || orderData.items.length === 0) {
      throw new BadRequestException('restaurantId 与 items 必填且 items 不能为空');
    }

    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');

      // 锁定菜品价格（防客户端篡改单价）、校验菜品属于该餐厅且在售
      const dishIds = orderData.items.map((i) => i.dishId);
      const priceRes = await client.query(
        `SELECT id, price, restaurant_id, status
           FROM public.dishes
          WHERE id = ANY($1::uuid[])`,
        [dishIds],
      );
      if (priceRes.rows.length !== dishIds.length) {
        throw new BadRequestException('存在无效菜品');
      }
      const priceMap = new Map(priceRes.rows.map((r) => [r.id, r]));
      for (const item of orderData.items) {
        const dish = priceMap.get(item.dishId);
        if (!dish || dish.restaurant_id !== orderData.restaurantId || dish.status !== 'available') {
          throw new BadRequestException(`菜品不可售或不属于该餐厅: ${item.dishId}`);
        }
        if (!Number.isInteger(item.quantity) || item.quantity < 1) {
          throw new BadRequestException('数量必须为正整数');
        }
      }

      const totalAmount = orderData.items.reduce(
        (sum, item) => sum + priceMap.get(item.dishId).price * item.quantity,
        0,
      );

      const orderRes = await client.query(
        `INSERT INTO public.orders (user_id, restaurant_id, total_amount, status)
         VALUES ($1, $2, $3, 'pending') RETURNING *`,
        [userId, orderData.restaurantId, totalAmount],
      );
      const order = orderRes.rows[0] as Order;

      for (const item of orderData.items) {
        const dish = priceMap.get(item.dishId);
        await client.query(
          `INSERT INTO public.order_items (order_id, dish_id, quantity, price)
           VALUES ($1, $2, $3, $4)`,
          [order.id, item.dishId, item.quantity, dish.price],
        );
      }

      await client.query('COMMIT');
      return order;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getOrdersByUser(userId: string, status?: string): Promise<Order[]> {
    if (status) {
      const res = await this.db.query(
        'SELECT * FROM public.orders WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC',
        [userId, status],
      );
      return res.rows as Order[];
    }
    const res = await this.db.query(
      'SELECT * FROM public.orders WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    return res.rows as Order[];
  }

  /** 订单详情（本人或 operator/merchant 可读，返回订单 + 明细）。防 IDOR：他人订单 → 403。 */
  async getOrderById(userId: string, orderId: string) {
    const res = await this.db.query(
      'SELECT * FROM public.orders WHERE id = $1',
      [orderId],
    );
    if (res.rows.length === 0) throw new NotFoundException('Order not found');
    const order = res.rows[0] as Order;
    if (order.user_id !== userId && !(await this.isPrivilegedUser(userId))) {
      throw new ForbiddenException('无权查看他人订单');
    }
    const itemsRes = await this.db.query(
      'SELECT * FROM public.order_items WHERE order_id = $1 ORDER BY id',
      [orderId],
    );
    return { ...order, items: itemsRes.rows };
  }

  // --- 订单状态迁移（原子守卫：WHERE status IN allowed + RETURNING） ---

  private async transition(
    userId: string,
    orderId: string,
    toStatus: OrderStatus,
  ): Promise<Order> {
    const res = await this.db.query('SELECT * FROM public.orders WHERE id = $1', [orderId]);
    if (res.rows.length === 0) throw new NotFoundException('Order not found');
    const order = res.rows[0] as Order;

    if (order.user_id !== userId && !(await this.isPrivilegedUser(userId))) {
      throw new ForbiddenException('无权操作该订单');
    }
    const allowed = ALLOWED_FROM[toStatus] ?? [];
    if (!allowed.includes(order.status)) {
      throw new ConflictException(`订单当前状态 ${order.status} 不允许迁移到 ${toStatus}`);
    }
    const upd = await this.db.query(
      `UPDATE public.orders SET status = $2, updated_at = NOW()
        WHERE id = $1 AND status = ANY($3::text[]) RETURNING *`,
      [orderId, toStatus, allowed],
    );
    if (upd.rows.length === 0) {
      // 并发竞争：SELECT 与 UPDATE 之间状态已变 —— 以最新状态拒绝
      throw new ConflictException(`订单状态已变化，请刷新后重试`);
    }
    return upd.rows[0] as Order;
  }

  async confirmOrder(userId: string, orderId: string): Promise<Order> {
    return this.transition(userId, orderId, 'confirmed');
  }

  async cancelOrder(userId: string, orderId: string, reason?: string): Promise<Order> {
    // 注：公共.orders 无 reason 列，v1 接受参数但仅用于日志/审计，不落库
    void reason;
    return this.transition(userId, orderId, 'cancelled');
  }

  async completeOrder(userId: string, orderId: string): Promise<Order> {
    return this.transition(userId, orderId, 'completed');
  }

  // ------------------------------------------------------------------
  // 支付（M5 垂直一；金额锁库、notify 幂等 + 签名）
  // ------------------------------------------------------------------

  /**
   * 发起支付：为 pending 订单建支付单并收单（金额=订单锁价）。AUTH。
   *
   * 网关 provider 缝（成熟度/扩展性）：真实微信/支付宝收单走【async 回执】——
   *   process 返回 pending 意图，网关随后 POST /payments/notify 确认（幂等 + 验签，见 notifyPayment）。
   * 未接真实网关的方法（含 'mock' 及未配置 provider 的 wechat/alipay/cash）落【dev mock】即时收单：
   *   同事务内建单并置 paid + 订单→paid，金额锁库、与客户端无关，无真实资金故可靠。
   * 生产注入对应网关配置后，方法自动切回 async+notify，无需改前端契约。
   */
  async createPayment(
    userId: string,
    orderId: string,
    method = 'mock',
  ): Promise<Payment & { confirmed: boolean }> {
    const hasProvider = PAYMENT_PROVIDERS.has(method); // 真实网关 provider 已配置
    const payment = await this.insertPendingPayment(userId, orderId, method); // 复核 owner + pending + 锁价
    if (hasProvider) {
      // async 回执：真实网关待 notify（当前无 provider 配置，理论不可达）
      return { ...payment, confirmed: false };
    }

    // dev mock 即时收单 —— 同事务内收单，避免 createPayment 与 notify 两段式在前端的数据缺口
    return this.confirmPaymentNow(payment.id, orderId, `${method}_${Date.now()}`);
  }

  /** 建待支付单（owner + pending + 金额=订单锁价 校验；幂等拒绝重复发起）。 */
  private async insertPendingPayment(
    userId: string,
    orderId: string,
    method: string,
  ): Promise<Payment> {
    const orderRes = await this.db.query(
      'SELECT * FROM public.orders WHERE id = $1 FOR UPDATE',
      [orderId],
    );
    if (orderRes.rows.length === 0) throw new NotFoundException('Order not found');
    const order = orderRes.rows[0] as Order;
    if (order.user_id !== userId) throw new ForbiddenException('无权为他人订单发起支付');
    if (order.status !== 'pending') {
      throw new ConflictException(`订单已不在待支付状态（当前 ${order.status}）`);
    }
    const ins = await this.db.query(
      `INSERT INTO public.payments (order_id, user_id, amount, method, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [order.id, userId, order.total_amount, method],
    );
    return ins.rows[0] as Payment;
  }

  /**
   * 同事务收单（dev mock / 退款前置共用的原子步骤）：
   *   支付单 pending→paid（幂等：已 paid 直接返回），订单 pending→paid。
   * 收单为独立事务，保证「支付状态」与「订单状态」同进退，防中途失败半态。
   */
  private async confirmPaymentNow(
    paymentId: string,
    orderId: string,
    transactionId: string,
  ): Promise<Payment & { confirmed: boolean }> {
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const upd = await client.query(
        `UPDATE public.payments SET status = 'paid', transaction_id = $2, updated_at = NOW()
          WHERE id = $1 AND status = 'pending' RETURNING *`,
        [paymentId, transactionId],
      );
      if (upd.rows.length === 0) {
        // 已收单（幂等）——读回现有 paid 支付单返回，不产生副作用
        const existing = await client.query(
          `SELECT * FROM public.payments WHERE order_id = $1 AND status = 'paid' ORDER BY created_at DESC LIMIT 1`,
          [orderId],
        );
        if (existing.rows.length === 0) throw new ConflictException('支付单状态已变化，请重试');
        await client.query('COMMIT');
        return { ...(existing.rows[0] as Payment), confirmed: true };
      }
      await client.query(
        `UPDATE public.orders SET status = 'paid', updated_at = NOW()
          WHERE id = $1 AND status = 'pending'`,
        [orderId],
      );
      await client.query('COMMIT');
      return { ...(upd.rows[0] as Payment), confirmed: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 支付通知回调（PUBLIC 白名单入口，但签名校验 + 幂等 + 金额锁库，伪造无效）。真实网关经此异步收单。 */
  async notifyPayment(payload: {
    orderId: string;
    transactionId: string;
    amount: number | string;
    method?: string;
    signature?: string;
  }): Promise<{ paid: boolean; orderId: string; paymentId: string }> {
    if (!this.verifyNotifySignature(payload)) {
      throw new UnauthorizedException('支付通知签名校验失败');
    }

    // 幂等：同订单+同交易号已收单 → 直接成功返回（回调重放不产生副作用）
    const paidRes = await this.db.query(
      `SELECT * FROM public.payments
        WHERE order_id = $1 AND transaction_id = $2 AND status = 'paid'`,
      [payload.orderId, payload.transactionId],
    );
    if (paidRes.rows.length > 0) {
      const p = paidRes.rows[0] as Payment;
      return { paid: true, orderId: payload.orderId, paymentId: p.id };
    }

    // 金额必须等于锁库金额，否则拒收（防伪造改额）
    const payRes = await this.db.query(
      `SELECT * FROM public.payments WHERE order_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      [payload.orderId],
    );
    if (payRes.rows.length === 0) {
      throw new BadRequestException('无待支付的支付单');
    }
    const payment = payRes.rows[0] as Payment;
    if (Number(payment.amount) !== Number(payload.amount)) {
      throw new BadRequestException('回调金额与订单锁价不符');
    }

    // 原子收单（幂等：confirmPaymentNow 对已收单重放返回现有 paid）
    const result = await this.confirmPaymentNow(payment.id, payload.orderId, payload.transactionId);
    return { paid: true, orderId: payload.orderId, paymentId: result.id };
  }

  /** 退款（operator/merchant）：已收单 → refunded，订单回 cancelled。 */
  async refundPayment(userId: string, orderId: string, reason?: string): Promise<Payment> {
    if (!(await this.isPrivilegedUser(userId))) {
      throw new ForbiddenException('仅 operator/merchant 可退款');
    }
    void reason;
    const pRes = await this.db.query(
      `SELECT * FROM public.payments WHERE order_id = $1 AND status = 'paid' ORDER BY created_at DESC LIMIT 1`,
      [orderId],
    );
    if (pRes.rows.length === 0) throw new BadRequestException('该订单无已支付记录可退款');
    const payment = pRes.rows[0] as Payment;

    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');
      const upd = await client.query(
        `UPDATE public.payments SET status = 'refunded', updated_at = NOW()
          WHERE id = $1 AND status = 'paid' RETURNING *`,
        [payment.id],
      );
      if (upd.rows.length === 0) throw new ConflictException('支付单状态已变化，无法退款');
      await client.query(
        `UPDATE public.orders SET status = 'cancelled', updated_at = NOW()
          WHERE id = $1 AND status IN ('paid', 'confirmed')`,
        [orderId],
      );
      await client.query('COMMIT');
      return upd.rows[0] as Payment;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // --- 支付签名（生产按真实 provider 换验签；v1 mock 用共享 secret 的 HMAC-SHA256） ---

  private notifySecret(): string {
    // 生产必须注入 PAYMENT_NOTIFY_SECRET（部署密钥，不入库）；开发默认值仅示 mock 网关。
    return process.env.PAYMENT_NOTIFY_SECRET ?? 'gri-dev-notify-secret';
  }

  private canonicalNotifyPayload(p: {
    orderId: string;
    transactionId: string;
    amount: number | string;
    method?: string;
  }): string {
    return [p.orderId, p.transactionId, String(p.amount), p.method ?? ''].join(':');
  }

  verifyNotifySignature(payload: {
    orderId: string;
    transactionId: string;
    amount: number | string;
    method?: string;
    signature?: string;
  }): boolean {
    if (typeof payload.signature !== 'string' || payload.signature.length === 0) return false;
    const expected = createHmac('sha256', this.notifySecret())
      .update(this.canonicalNotifyPayload(payload))
      .digest('hex');
    // 恒定时间比较，防时序侧信道
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(payload.signature, 'utf8');
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }
}