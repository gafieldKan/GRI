# GRI Web 端测试操作手册

本手册面向「测试环境的 Web 端功能测试」，环境为 **Docker 全栈**（已在宿主机运行）。测试人员按本手册即可完成登录、点餐下单、支付、订单流转等核心功能的走查验证。

---

## 一、测试环境概览

| 组件 | 容器名 | 端口 | 说明 |
|------|--------|------|------|
| 订餐后端 | `gri-backend` | 3002 | Express，`/health` 返回 ok |
| 订餐前端 (Web) | `gri-web` | **5174** | 浏览器打开地址 |
| PostgreSQL | `gri-postgres` | 5432 | 库 `gri_db`，迁移 001–017 |
| AI 辅导后端 | `gri-ai-tutor-backend` | 3003 | 与订餐功能无关 |
| Redis | `gri-redis` | 6379 | 共享缓存 |

**测试地址**：`http://localhost:5174`（同机浏览器）

**种子账号**：

| 邮箱 | 密码 | 说明 |
|------|------|------|
| `test@example.com` | `test1234` | 开发环境专用账号（明文密码） |

> 若用手机/其它设备访问，`localhost` 需替换为宿主机局域网 IP（本机为 `http://192.168.1.11`），且后端地址由前端构建变量决定（见「常见问题」）。

---

## 二、启动 / 停止测试环境

```bash
# 启动全部服务
docker-compose up -d

# 仅查看状态
docker-compose ps

# 查看某个服务日志（排查问题）
docker logs -f gri-backend
docker logs -f gri-web

# 停止（不删除数据）
docker-compose stop

# 彻底停止并删除容器（保留数据库卷数据）
docker-compose down
```

> 注：数据库表结构由 `gri-backend` 启动时 `await migrate()` 自动应用（`_migrations` 表跟踪），无需手工导 SQL。

**验证后端**：

```bash
curl http://localhost:3002/health   # 期望 {"status":"ok",...}
```

---

## 三、登录（鉴权门禁）

前端 `App.vue` 启动时校验登录态，未登录会强制跳转登录页。

**操作**：

1. 浏览器打开 `http://localhost:5174`，应进入登录页（标题「GRI」）。
2. 输入账号 `test@example.com`、密码 `test1234`。
3. 点击登录。

**预期**：登录成功进入首页（tabBar：首页 / 购物车 / 订单 / 我的）。

**命令行等价验证**（校验登录接口本身）：

```bash
curl -X POST http://localhost:3002/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"test1234"}'
# 期望返回 code:200 及 token 字段
```

---

## 四、功能测试走查清单

### ① 登录 / 鉴权
- 错误密码（如 `test12345`）→ 提示「Invalid credentials」/ 登录失败。
- 空账号或密码 → 提示必填。
- 登录后退出 → 重新访问应回到登录页。

### ② 首页 → 菜单 → 加购
1. 首页浏览餐厅/菜品入口。
2. 进入「菜单」，选择菜品（如「Test Dish」/ 种子菜品）。
3. 点击「加入购物车」，购物车角标数量增加。

**预期**：购物车数量正确累加，可修改数量/删除条目。

### ③ 购物车 → 结算
1. 打开「购物车」tab，核对条目与金额。
2. 点击「去结算」，进入「确认订单」页。

**预期**：结算页展示收货地址、配送方式、备注、订单金额与明细，含**订单签名**摘要。

### ④ 下单 → 自动跳支付页
1. 结算页确认地址/配送方式后点击「提交订单」。
2. 下单成功后约 1.5s **自动跳转「订单支付」页**（携带 `orderId` 与金额）。

**预期**：跳转成功，支付页显示待付金额与三种支付方式（微信/支付宝/货到付款）。

### ⑤ 支付
1. 在支付页选择「微信支付」或「支付宝」。
2. 点击「确认支付」。

**预期**：支付成功，订单状态流转；随后跳转「订单」列表。

> 说明：微信/支付宝未配真实商户凭据，`/api/payments/process` 走 **mock 回退**，支付仍能成功流转（`pending → confirmed`），属预期行为。选「货到付款」同样可完成。

### ⑥ 订单列表与状态
1. 进入「订单」tab。
2. 查看订单列表，核对状态、金额。
3. 对未支付订单可「取消」或「去支付」；对已支付订单可查看状态流转。

**预期**：订单状态正确展示（pending / confirmed / paid / cancelled 等），操作后刷新生效。

### ⑦ 个人中心 / 数据大屏
1. 进入「我的」tab。
2. 进入「数据大屏」入口（`pages/dashboard/index`）。

**预期**：数据大屏页打开，展示统计数据（后端 `/api/dashboard`）。

### ⑧ 后端 API 冒烟（curl）

```bash
# 订单
curl http://localhost:3002/api/orders?userId=a0000000-0000-0000-0000-000000000001&limit=5

# 助农订单
curl -X POST http://localhost:3002/api/farm-orders \
  -H 'Content-Type: application/json' \
  -d '{"farmerId":"a0000000-0000-0000-0000-000000000001","cooperativeId":"a0000000-0000-0000-0000-000000000002","cropType":"rice","cropName":"大米","quantity":100,"price":3.5}'

# 批发订单
curl http://localhost:3002/api/wholesale-orders

# 支付端点
curl -X POST http://localhost:3002/api/payments/process \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"nonexistent","paymentMethod":"wechat","transactionId":"test-1"}'

# 统计
curl http://localhost:3002/api/dashboard
```

> 一行脚本兜底：`node scripts/full-test.js`（应输出「通过 11 项，失败 0 项」）。

---

## 五、常见问题排查

| 现象 | 原因 | 处理 |
|------|------|------|
| 浏览器打开 5174 页面空白/接口全失败 | 前端 API base 指向了 Docker 内网名 `backend`，浏览器无法解析 | 确认 `gri-web` 环境变量 `VITE_API_BASE_URL=http://localhost:3002`；手机访问需改宿主机 IP 后重建 web |
| 登录提示 `Invalid credentials` | 账号密码不对，或后端未连上库导致误报 | 用第三节 curl 验证；确认 `test@example.com` / `test1234` |
| 登录 500 / `Connection terminated due to connection timeout` | `gri-postgres` 容器已停止，后端连不到库 | `docker start <postgres 容器>`，等 healthy 后重试 |
| `/health` 无响应 | `gri-backend` 未起 | `docker logs gri-backend` 看启动报错 |
| 支付未真实扣款 | 双模回退 mock（未配真实商户凭据） | 属预期，见④/⑤说明 |

---

## 六、本轮修复说明（供复阅）

测试环境部署过程中修复了三处后端登录链路上的潜在缺陷（均已落库/代码）：

1. **登录密码字段映射错误**：`UserRepository.findByEmail` 返回数据库原始 `snake_case` 行，登录接口却读 camelCase `user.passwordHash`（实为 `undefined`），导致恒 401。改为读 `user.password_hash`，并修复 `/login`、`/me`、`/refresh` 三处 `password_hash` 未剔除的属性泄漏。
2. **`userRepo.pool` 不存在**：`UserRepository` 无 `.pool` 属性，登录时 `userRepo.pool.query(...)` 抛错 500。改为使用模块级 `pool`。
3. **`users.last_login_at` 列缺失**：登录更新最后登录时间时引用了不存在的列，新增迁移 `017_add_last_login_at.sql` 补列。

验证结果：登录返回 `code:200` + token；`node scripts/full-test.js` **11/11 通过**。