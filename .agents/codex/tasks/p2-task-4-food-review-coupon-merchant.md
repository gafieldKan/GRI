# T4 任务卡：`food` 模块 - 评价 / 优惠券 / 商家后台补全 + 单测

**执行者**：Codex
**依赖**：M0 基线 + M1 identity 契约（均已就绪）
**产出目录**：`services/api/src/modules/food/`
**预估**：1 天

> ⚠️ **本卡已按代码实况重写（2026-10-09）**。原卡与仓库现状严重脱节：引用了不存在的 `restaurants.merchant_id` 列、不存在的 review/coupon 表、以及**架构上不成立的 JWT `roles` 授权模型**。以下所有事实均经本地实测核对，**以本卡为准**。

---

## 📋 任务目标

补全 `food` 模块缺失业务面，使订餐切片达到**生产可用**：

1. **评价系统**：`POST /api/food/orders/:id/review`、`GET /api/food/restaurants/:id/reviews`
2. **优惠券**：`GET /api/food/coupons`、`POST /api/food/coupons/claim`、`GET /api/food/coupons/my`
3. **商家后台**：
   - `GET /api/food/merchant/restaurants`（列表/筛选，仅限**本人名下**；运营可见全部）
   - `POST /api/food/merchant/restaurants`（创建，自动挂 `merchant_id = 本人 externalId`）
   - `PUT /api/food/merchant/restaurants/:id`（更新，**归属校验**）
   - `POST /api/food/merchant/restaurants/:id/dishes`（批量增/改菜品，**归属校验**）
   - `GET /api/food/merchant/orders`（订单管理：状态流转、统计，按归属过滤）

---

## 🔴 承重事实（写代码前必须知道的实测结论）

### 事实 1：授权模型**不是** JWT `roles` —— 原卡在此处是错的

- auth-center 签发的 JWT 中 `roles` **恒为 `[]`**（`services/auth-center/src/auth/auth.service.ts` 的 `buildPayload()` 写死）。
- 这是**有意的架构决策**，非缺陷。权威注释见 `services/api/src/modules/agent/agent-admin.controller.ts`：
  > 「守卫是 DB 角色（assertSiteOperator），JWT roles 全空故前端无法自行推导」
- **运营（operator）判定** = 根组织的 owner|admin，方法：`OrganizationService.assertSiteOperator(externalId)`（`organization.service.ts:685`）。**不要**去改 auth-center 注入 roles，**不要**依赖 `req.auth.roles`。
- **商家（merchant）判定** = **数据归属**：`restaurants.merchant_id === req.auth.externalId`。本卡为此**新增该列**（库里现无）。
- ⚠️ `identity.controller.ts` 里的 `READ_ANY_ELEVATED_ROLES = ['operator','merchant']` 读的是 `req.auth.roles`，因 roles 恒空**当前实际恒为 false（既存缺陷，本卡不动它）**——**新代码不要复用它**，否则商家后台永远 403。

### 事实 2：授权身份从哪拿

- `req.auth.externalId === public.users.id`（唯一身份映射，见 `jwt-auth.middleware.ts` 与 `@gri/jwt-verifier`）。
- 商家/运营的**归属主体**一律用 `req.auth.externalId` 与库表列比对；**禁止**硬编码 `student_001` / `testuser` 之类。

### 事实 3：现有表结构（实测 DDL，别凭空假设）

```
public.restaurants(id uuid PK, name, address, phone, rating numeric(2,1) default 0,
                   status varchar default 'open', created_at, updated_at)
                   -- ❌ 现无 merchant_id 列，本卡新增
public.dishes(id uuid PK, restaurant_id → restaurants(id) ON DELETE CASCADE,
              name, description, price numeric(12,2), category, image_url,
              status varchar default 'available', created_at)
public.orders(id uuid PK, user_id → users(id), restaurant_id → restaurants(id),
              total_amount numeric(12,2), status varchar default 'pending',
              created_at, updated_at)
public.order_items(order_id → orders(id) ON DELETE CASCADE, dish_id → dishes(id), ...)
public.payments(order_id → orders(id), user_id, amount, method, status, ...)
public.users(id uuid PK, username, email, phone, name, avatar_url,
             role varchar(32) default 'consumer', status, created_at, updated_at, deleted_at)
             -- role 现值域：consumer / student（无 merchant/operator，且本卡**不依赖** users.role 做授权）
```

- 订单状态现值：`pending`（默认）/ `confirmed` / `completed` / `cancelled` / `paid`（见 `food.service.ts` 状态流转）。**评价前置状态以代码现有 `completed` 语义为准**（见服务层 `completeOrder`）。
- 业务表在 **`public`** schema（不是 `food.`）；原卡写 `food.reviews` 是错的。

### 事实 4：迁移序号与「先 build 再 migrate」纪律（T1b 教训）

- 现有迁移止于 `services/api/src/migrate/017_identity_register_contract.sql` → **本卡用 `018_food_review_coupon_merchant.sql`**。
- 迁移 runner 读的是 **`dist/migrate/*.sql`**（编译产物），不是 `src/`。
- `nest-cli.json` 已正确配置 `assets: [{include:"migrate/*.sql", outDir:"dist"}]`（**无需修工具链**）。
- ⚠️ **纪律**：新增/改动任何 `src/migrate/*.sql` 后，**必须先 `npm run build` 让 dist 同步，再 `npm run migrate`**。否则 runner 读到的是旧 dist（T1b 的 `002` 索引就是这么漏执行的）。验收脚本会显式检查这一点。

### 事实 5：现有测试

- `food.service.spec.ts` 现有 **3 个 describe / 17 个用例**（createOrder 锁价+事务、订单状态机原子守卫+所有权、支付金额锁库/签名/幂等/退款权限）。**风格照抄**：mock `db.query`、断言事务边界与权限拒绝分支。

---

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `services/api/src/modules/food/food.controller.ts` | 现有 14 端点风格、鉴权模式、`req.auth.externalId` 用法 |
| `services/api/src/modules/food/food.service.ts` | 现有事务 / 锁价 / 状态机 / 支付逻辑（评价要接 `completed` 语义） |
| `services/api/src/modules/food/food.types.ts` | 现有类型；需补 Review / Coupon / Merchant* 类型 |
| `services/api/src/modules/food/food.service.spec.ts` | 17 用例风格参考 |
| `services/api/src/auth/public-routes.ts` | 公开读白名单（本卡加 reviews / coupons 的 GET） |
| `services/api/src/modules/organization/organization.service.ts` | `assertSiteOperator` —— **运营授权的唯一正确入口** |
| `services/api/src/migrate/002_food_and_tuition.sql` | 现有 `restaurants/dishes/orders` 建表真源（新迁移照其风格） |
| `services/api/src/migrate/017_identity_register_contract.sql` | 迁移幂等写法参考（IF NOT EXISTS / DO-EXCEPTION / 约束命名） |

---

## 📦 产出物清单

| 文件 | 动作 |
|------|------|
| `services/api/src/migrate/018_food_review_coupon_merchant.sql` | **【新增·不可省】** ① `ALTER TABLE public.restaurants ADD COLUMN merchant_id uuid NULL REFERENCES public.users(id)` + 索引 `idx_restaurants_merchant`；② 建 `public.reviews`（唯一键 `(order_id)`）；③ 建 `public.coupons`、`public.coupon_claims`（唯一键 `(coupon_id,user_id)`）。**全部幂等**（IF NOT EXISTS / DO-EXCEPTION / 命名约束）。可选：种一个 merchant 归属的示例餐厅（幂等 ON CONFLICT），供验收脚本用。 |
| `services/api/src/modules/food/food.controller.ts` | 新增 9 个端点（含归属守卫 / 运营守卫） |
| `services/api/src/modules/food/food.service.ts` | 新增 `createReview / getReviews / listCoupons / claimCoupon / getMyCoupons / merchantListRestaurants / merchantCreateRestaurant / merchantUpdateRestaurant / merchantUpsertDishes / merchantListOrders / merchantOrderStats` |
| `services/api/src/modules/food/food.types.ts` | 补 `Review`、`Coupon`、`CouponClaim`、`MerchantRestaurantDto`、`MerchantDishDto`、`MerchantOrderQuery`、`MerchantOrderStats` |
| `services/api/src/modules/food/food.service.spec.ts` | 在现有 17 例基础上**新增 20+ 单测**（评价权限/重复/评分校验、优惠券限额/过期/互斥、商家归属校验、订单统计） |
| `services/api/src/modules/organization/organization.service.ts` | **可选复用**：`merchant*` 里若需「运营可见全部」，注入 `OrganizationService` 调 `assertSiteOperator`；若不想引入耦合，可用**只读 SQL 判定根组织 owner|admin**（照抄 assertSiteOperator 的 SQL）。二选一，写注释说明选择。 |
| `services/api/src/auth/public-routes.ts` | 白名单加 `GET /food/restaurants/:id/reviews`、`GET /food/coupons`（**仅这两条只读**；merchant/* 绝不入白名单） |
| `.agents/codex/outputs/p2-task-4-file-list.md` | 新增/修改文件清单（含 018 迁移 + 是否重新 build/migrate 的**执行记录**） |
| `.agents/codex/outputs/p2-task-4-verify.sh` | 自动化验收脚本（规范见下） |

---

## ✅ 验收标准（硬性）

1. **TypeScript 编译通过**：`cd services/api && npm run build` → 0 error。
2. **迁移已落地**：`npm run build && npm run migrate` 后，
   - `public.restaurants.merchant_id` 列存在；
   - `public.reviews`、`public.coupons`、`public.coupon_claims` 三表存在；
   - 重复执行 `npm run migrate` **幂等无报错**（可重入）。
3. **单测全绿**：`npm run test -- src/modules/food/` 全过，目标 **≥ 37 用例**（17 旧 + ≥20 新）。
4. **端到端验证通过**：`bash .agents/codex/outputs/p2-task-4-verify.sh` 输出 `全绿：PASS=X FAIL=0`。
5. **权限生效（按事实 1 的正确模型）**：
   - 普通用户仅能评价**自己的已完成订单**（1 单 1 评，重复 → 409）。
   - **商家**仅能读写 `merchant_id === externalId` 的餐厅；操作他人餐厅 → 403。
   - **运营**（根组织 owner|admin，经 `assertSiteOperator`）可跨餐厅读/管。
6. **业务规则**：评价 `rating∈[1,5]`、`content ≤ 500` 字、订单须 `completed`；优惠券 `total_quantity` / `per_user_limit` / 时间窗 / `mutex_group` 生效；批量 upsert 在事务内、`restaurant_id` 归属校验。

---

## 🧪 验收脚本 `p2-task-4-verify.sh` 规范

```bash
#!/usr/bin/env bash
# T4 自动化验收：food 评价/优惠券/商家后台
set -uo pipefail
API_BASE="${API_BASE:-http://localhost:3008/api}"
AUTH_BASE="${AUTH_BASE:-http://localhost:3004/auth}"

# 0. 迁移已落：psql 查 merchant_id 列 + 三表存在（否则 FAIL 提示先 build+migrate）
# 1. 用户 A 登录 → 下单 → 置 completed → 评价 → 201
# 2. 用户 A 重复评价同单 → 409
# 3. 用户 B 评价 A 的订单 → 403
# 4. GET /food/restaurants/{id}/reviews（匿名） → 200，含 A 的评价
# 5. GET /food/coupons（匿名） → 200
# 6. 用户 A 领券 → 201；再领 → 409（per_user_limit）
# 7. 过期/耗尽券 → 400/404
# 8. 商家 M（restaurant.merchant_id = M.externalId）创建餐厅 → 201；PUT 自己的 → 200
# 9. 商家 M 操作**非**归属餐厅 → 403
# 10. 运营 O（根组织 owner）列全部餐厅/订单 → 200
# 11. 商家批量 upsert 菜品 → 事务成功；构造非法归属 → 回滚（原数据不变）
# 输出末行：全绿：PASS=<n> FAIL=0（FAIL>0 即非零退出）
```

> 说明：脚本对 `extId`、`restaurantId` 等一律**从响应动态取**，不硬编码种子 uuid；`psql` 连接用容器 `gri-postgres`（`docker exec gri-postgres psql -U postgres -d gri`）。

---

## 🔐 关键实现细节

| 点 | 要求 |
|----|------|
| 评价表 | `public.reviews(id uuid PK default gen_random_uuid(), order_id uuid UNIQUE → orders(id), user_id uuid → users(id), restaurant_id uuid → restaurants(id), rating int CHECK 1..5, content varchar(500), created_at)` |
| 优惠券表 | `public.coupons(id uuid PK, code varchar UNIQUE, name, discount_type varchar, discount_value numeric(12,2), min_amount numeric(12,2) default 0, total_quantity int, claimed_quantity int default 0, per_user_limit int default 1, start_at timestamptz, end_at timestamptz, mutex_group varchar NULL, status varchar default 'active', created_at, updated_at)` |
| 领券记录 | `public.coupon_claims(id uuid PK, coupon_id uuid → coupons(id), user_id uuid → users(id), claimed_at timestamptz default now(), order_id uuid NULL → orders(id), UNIQUE(coupon_id,user_id))` |
| 商家归属 | **新增** `public.restaurants.merchant_id uuid NULL → users(id)`；商家后台一律 `WHERE merchant_id = $externalId` |
| 运营守卫 | `assertSiteOperator(externalId)`（**唯一正解**）；若走自建 SQL 判定，须写注释说明与 assertSiteOperator 等效 |
| 事务边界 | `merchantUpsertDishes`、`claimCoupon`、`createReview` 必须在事务中；领券用 `UPDATE ... WHERE claimed_quantity < total_quantity RETURNING` 原子占额 + 唯一键兜底 |
| 迁移纪律 | 改 `src/migrate/*.sql` → **先 `npm run build` 再 `npm run migrate`**；验收脚本第 0 步显式校验 |

---

## 🚫 明确不做 / 不要碰

- **不改 auth-center** 去往 JWT 注入 roles（架构明确「JWT roles 全空」）。
- **不改** `identity.controller.ts` 的 `READ_ANY_ELEVATED_ROLES`（既存缺陷，超本卡范围）。
- **不新建** `MerchantGuard` 依赖 `req.auth.roles`（会恒 403）。
- 不动 `curriculum/*`、`tuition/*` 等在途模块。
- 不物理删除任何数据。

---

## 📝 任务卡存放路径

```
.agents/codex/tasks/p2-task-4-food-review-coupon-merchant.md
```
