# P2-T4 变更文件清单（food 评价 / 优惠券 / 商家后台补全 + 单测）

> 对应任务卡：`.agents/codex/tasks/p2-task-4-food-review-coupon-merchant.md`
> 排除：`node_modules/`、`dist/`。`M`=修改，`A`=新增。

## services/api（food 模块 + 迁移 + 授权白名单）

| 动作 | 文件 | 说明 |
|------|------|------|
| A | `services/api/src/migrate/018_food_review_coupon_merchant.sql` | ① `restaurants.merchant_id`（`ADD COLUMN IF NOT EXISTS` + 命名 FK + 索引）；② `public.reviews`（`order_id` 唯一 + `rating` CHECK 1..5 + 索引）；③ `public.coupons`（唯一 `code` + 值域/时间窗/库存 CHECK）；④ `public.coupon_claims`（唯一 `(coupon_id,user_id)` + 索引）。全幂等，`BEGIN/COMMIT`。 |
| M | `services/api/src/modules/food/food.service.ts` | 新增 `createReview / getReviews / listCoupons / claimCoupon / getMyCoupons / merchantListRestaurants / merchantCreateRestaurant / merchantUpdateRestaurant / merchantUpsertDishes / merchantListOrders / merchantOrderStats`；私有 `assertSiteOperator`（只读 SQL 判根组织 `owner|admin`）；`isUniqueViolation`（23505→409）。 |
| M | `services/api/src/modules/food/food.controller.ts` | 新增 11 个路由：`POST orders/:id/review`、`GET restaurants/:id/reviews`、`GET coupons`、`POST coupons/claim`、`GET coupons/my`、`GET/POST merchant/restaurants`、`PUT merchant/restaurants/:id`、`POST merchant/restaurants/:id/dishes`、`GET merchant/orders`、`GET merchant/orders/stats`。身份取 `req.auth.externalId`。 |
| M | `services/api/src/modules/food/food.types.ts` | 补 `Review`、`Coupon`、`CouponClaim`、`MerchantRestaurantDto`、`MerchantDishDto`、`MerchantOrderQuery`、`MerchantOrderStats`；`Restaurant` 加 `merchant_id`。 |
| M | `services/api/src/modules/food/food.service.spec.ts` | 在既有 17 例基础上新增评价/优惠券/商家后台用例，现共 **54 例**（≥ 37 目标）。 |
| M | `services/api/src/auth/public-routes.ts` | 仅新增匿名只读两条：`GET /food/restaurants/:id/reviews`、`GET /food/coupons`。`merchant/*` 绝不入白名单。 |

## 产出物

| 动作 | 文件 |
|------|------|
| A | `.agents/codex/outputs/p2-task-4-file-list.md`（本文件） |
| A | `.agents/codex/outputs/p2-task-4-verify.sh` — 自动化验收脚本（12 步，末行打印「全绿：PASS=X FAIL=0」） |

---

## 迁移执行记录（先 build 再 migrate 纪律）

| 命令 | 结果 |
|------|------|
| `cd services/api && npm run build` | ✅ 退出码 0（`nest build`） |
| `dist/migrate/018_food_review_coupon_merchant.sql` 存在性 | ✅ 已随 assets 拷入 dist |
| `cd services/api && npm run migrate` | ❌ `[migrate] failed: connect EPERM 127.0.0.1:5432`（本执行环境无可达 PG：docker 不可访问、5432 未监听） |

> ⚠️ **本次未能在执行环境内落库**：该沙箱内 `/var/run/docker.sock` 权限被拒、无本地 PostgreSQL、5432 无监听，形同 air-gapped。
> 因此迁移与端到端验收需在具备 `docker compose` 全栈的环境重跑：
> ```
> cd services/api && npm run build && npm run migrate   # 首次应用 + 幂等
> npm run migrate                                       # 第二次：应打印 skip 018
> bash .agents/codex/outputs/p2-task-4-verify.sh
> ```

---

## ⚠️ 与任务卡的偏差

1. **运营判定用「自建只读 SQL」而非注入 `OrganizationService`**。
   卡允许二选一。为避免 food ← organization 的模块耦合（且 `assertSiteOperator` 仅 4 行只读 SQL），food 侧私有 `assertSiteOperator` 照抄其等效查询（`tenant.organizations` 根 + `tenant.organization_members` 的 `owner|admin`），并在代码注释标注「与 `OrganizationService.assertSiteOperator` 等效」。不依赖 JWT `roles`（恒空）。
2. **控制器多出 `GET /food/merchant/orders/stats`**。
   卡的服务层清单含 `merchantOrderStats`，但端点清单只写到 `GET /food/merchant/orders`。为让统计能力可达，补一个只读子路由（属 `merchant/*`，强制鉴权）。除此之外无额外端点。
3. **`createReview` 先校验评分/内容再做订单状态判定**。
   评分越界/内容超长 → 400，先于「订单未 completed → 409」。这使入参非法时 fail-fast，不触库。
