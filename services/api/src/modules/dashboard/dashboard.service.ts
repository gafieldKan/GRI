import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

/**
 * 数据大屏统计（M5 dashboard 子切片）。
 *
 * 由旧 `services/backend/src/routes/dashboard/stats.js` 收敛而来：把旧 Express 跑在
 * 独立 `gri_db` 库上的 5 段聚合 SQL，改写为跑重写后端单库 `gri` 的 `public.*` 表。
 * 契约对齐旧后端 shape（字段名不变），但：
 *   - 响应为「裸 body」（M5 放映契约），去 `{code, data}` 信封；
 *   - 表名一律显式 `public.` 命名空间（防 schema_search_path 多址）；
 *   - 旧列差异适配：payments.payment_status→status、订单明细 dish_name→JOIN dishes 取名、
 *     restaurants 无 'pending' 商家审核态（status 只有 open/closed）。
 *
 * 安全：本批为聚合只读分析端点，走公开读白名单（与旧后端一致、与公开目录同级）。
 * 加固 TODO：如做实 operator/merchant 管理台，应改为强制特权角色（JWT roles + DB 真源复核）。
 */
@Injectable()
export class DashboardService {
  constructor(private readonly db: DatabaseService) {}

  /** 概览：今日订单/营收/新增用户、商家总数/未营业、客单价。 */
  async getOverview() {
    const [orders, revenue, merchants, avgOrder, users] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*)::int AS count FROM public.orders WHERE created_at >= CURRENT_DATE`,
      ),
      this.db.query(
        // 今日营收 = 今日支付的支付单金额（支付单转 paid 时 updated_at=NOW()，即收单时刻）
        `SELECT COALESCE(SUM(amount), 0)::float AS total
           FROM public.payments
          WHERE status = 'paid' AND updated_at >= CURRENT_DATE`,
      ),
      this.db.query(
        // 商家：总数 + 未营业（status<>'open'）。旧后端 'pending' 商家审核态已废弃——重写无审核流。
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status <> 'open')::int AS closed
           FROM public.restaurants`,
      ),
      this.db.query(
        `SELECT COALESCE(AVG(total_amount), 0)::float AS avg FROM public.orders`,
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS count FROM public.users WHERE created_at >= CURRENT_DATE`,
      ),
    ]);

    const todayUsers = users.rows[0].count;
    return {
      todayOrders: orders.rows[0].count,
      todayRevenue: revenue.rows[0].total,
      todayUsers,
      totalMerchants: merchants.rows[0].total,
      pendingMerchants: merchants.rows[0].closed, // 语义从旧「待审」→ 重写「未营业」，前端标签已改
      avgOrderValue: Math.round(avgOrder.rows[0].avg * 100) / 100,
    };
  }

  /** 订单趋势：最近 7 天按日聚合（件数 + 金额）。 */
  async getOrdersTrend() {
    const res = await this.db.query(
      `SELECT to_char(created_at, 'MM/DD') AS date,
              COUNT(*)::int AS order_count,
              COALESCE(SUM(total_amount), 0)::float AS order_amount
         FROM public.orders
        WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY to_char(created_at, 'MM/DD'), created_at::date
        ORDER BY created_at::date`,
    );
    return res.rows.map((r) => ({
      date: r.date,
      orderCount: r.order_count,
      orderAmount: r.order_amount,
    }));
  }

  /** 商家订单分布：每家餐厅关联订单数，降序。 */
  async getRegionDistribution() {
    const res = await this.db.query(
      `SELECT COALESCE(NULLIF(r.name, ''), '未知商家') AS name,
              COUNT(o.id)::int AS value
         FROM public.restaurants r
         LEFT JOIN public.orders o ON o.restaurant_id = r.id
        GROUP BY r.name
        ORDER BY value DESC
        LIMIT 20`,
    );
    return res.rows.map((r) => ({ name: r.name, value: r.value }));
  }

  /** 热销商品 TOP10：聚合销量 + 锁价金额（金额=下单时锁的单价，与真实流水一致）。 */
  async getTopProducts() {
    const res = await this.db.query(
      `SELECT COALESCE(d.name, '未知菜品') AS name,
              SUM(oi.quantity)::int AS sales,
              COALESCE(SUM(oi.price * oi.quantity), 0)::float AS amount
         FROM public.order_items oi
         LEFT JOIN public.dishes d ON d.id = oi.dish_id
        GROUP BY d.name
        ORDER BY sales DESC
        LIMIT 10`,
    );
    return res.rows.map((r) => ({ name: r.name, sales: r.sales, amount: r.amount }));
  }

  /** 用户增长：近 12 个月每月新增用户数。 */
  async getUserFunnel() {
    const res = await this.db.query(
      `SELECT to_char(created_at, 'YYYY-MM') AS month,
              COUNT(*)::int AS count
         FROM public.users
        GROUP BY to_char(created_at, 'YYYY-MM'), date_trunc('month', created_at)
        ORDER BY date_trunc('month', created_at)
        LIMIT 12`,
    );
    return res.rows.map((r) => ({ month: r.month, count: r.count }));
  }
}