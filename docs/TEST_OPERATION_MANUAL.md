# GRI 测试环境部署与操作手册

本手册指导如何在本地完成 GRI 点餐系统的测试环境部署，并进行功能验证。

## 前提条件

- Node.js >= 18.x
- npm >= 9.x
- Git（可选，已有代码）
- 建议使用 VS Code 或其他 IDE 进行调试

## 一、获取代码并安装依赖

```bash
# 克隆代码（如果尚未有）
git clone https://github.com/gafieldKan/GRI.git
cd GRI

# 安装 monorepo 依赖
npm install
```

> 注：monorepo 使用 npm workspaces，根目录 `npm install` 会为所有 workspace 安装依赖。

## 二、启动后端服务

后端服务默认运行在 `http://localhost:3002`。

```bash
# 进入后端目录（可选，也可在根目录直接运行脚本）
cd services/backend

# 启动开发服务（带文件监听）
npm run dev
```

或在根目录：

```bash
npm run dev:backend
```

### 验证后端是否正常运行

打开另一个终端，执行：

```bash
curl -s http://localhost:3002/health
```

期望返回：

```json
{
  "status": "ok",
  "timestamp": "2026-07-02T...",
  "version": "3.0.0 - 配置化 API 生成器"
}
```

## 三、启动前端服务

### Web 端（H5）

```bash
npm run dev:web
```

默认运行在 `http://localhost:5173`。

### 微信小程序端

```bash
npm run dev:mini
```

默认运行在 `http://localhost:5173`（uni-app 编译为 H5 以便调试），可在微信开发者工具中导入 `dist/dev/mp-weixin` 进行真机调试。

## 四、运行自动化测试

### 后端单元测试

```bash
npm test
```

或在后端目录：

```bash
cd services/backend && npm test
```

期望看到所有测试通过（包括 Order 领域、NotificationService 等）。

### 前端测试（若有）

目前前端暂无单元测试，可通过手动操作验证。

## 五、功能测试操作指南

以下列出已实现功能的测试步骤，使用 curl 或浏览器/Postman 进行验证。

> **注意**：所有接口均需在后端运行中进行测试。部分接口需要鉴权头（`x-user-id`, `x-organization-id`, `x-user-role`），测试时可自行填入测试值。

### 1. 健康检查 & 版本信息

- `GET /health` → 返回服务状态
- `GET /api/version` → 返回 API 版本和已注册模型列表

### 2. 订单相关（现有功能）

#### 创建订单（示例，实际需调用业务流程）

```bash
curl -X POST http://localhost:3002/api/orders \
  -H "Content-Type: application/json" \
  -H "x-user-id: test_user" \
  -H "x-organization-id: test_org" \
  -d '{
        "userId": "test_user",
        "organizationId": "test_org",
        "items": [
          { "dishId": "dish1", "name": "测试菜品", "price": 20, "count": 2 }
        ]
      }'
```

期望返回创建的订单对象，包含 `orderNo`、`status: "pending"` 等。

#### 订单确认（模拟支付成功）

```bash
curl -X POST http://localhost:3002/api/orders/:id/confirm \
  -H "Content-Type: application/json" \
  -H "x-user-id: test_user" \
  -H "x-organization-id: test_org"
```

将 `:id` 替换为刚才创建的订单 ID。

### 3. 支付仿真接口（后端已实现）

由于我们使用了模拟的微信/支付宝服务，支付流程如下：

#### 发起支付（调用后端支付接口）

```bash
curl -X POST http://localhost:3002/api/payments/process \
  -H "Content-Type: application/json" \
  -H "x-user-id: test_user" \
  -H "x-organization-id: test_org" \
  -d '{
        "orderId": "刚才创建的订单ID",
        "paymentMethod": "wechat",
        "transactionId": ""
      }'
```

期望返回：

```json
{
  "success": true,
  "data": {
    // 更新后的订单对象，status 为 "confirmed"，payment_info 中含支付信息
  }
}
```

> 如果换成 `alipay` 同样有效。

#### 支付回调仿真（直接调用服务层，实际项目中会由第三方服务器 POST）

为简化测试，我们可以直接调用 `PaymentService.handlePaymentNotify`（需通过控制器）。目前控制器只有 `/api/payments/notify` 路由，但需要微信/支付宝签名验证（我们暂未实现真实验证），故在此仅演示流程。

实际测试中，可使用以下方式绕过签名（仅用于本地测试）：

```bash
curl -X POST http://localhost:3002/api/payments/notify \
  -H "Content-Type: application/json" \
  -d '{
        "orderId": "测试订单ID",
        "paymentMethod": "wechat",
        "transactionId": "wx_sim_123456",
        "status": "success"
      }'
```

期望返回更新后的订单（状态 `confirmed`）。

### 4. 通知服务测试

我们未直接暴露通知服务的 HTTP 接口（实际应由业务触发）。为验证通知是否能发送，可在后端代码中手动调用或编写简单脚本。

#### 发送短信/邮件（示例脚本）

在后端目录新建文件 `test_notify.js`：

```js
const notificationService = require('./src/services/notification/NotificationService.js');

(async () => {
  const userInfo = { phone: '13800138000', email: 'test@example.com', userId: 'user1' };
  const orderInfo = { orderNo: 'ORD123456', amount: 99.9, payTime: new Date().toISOString() };
  await notificationService.sendOrderSuccessNotification(userInfo, orderInfo);
  console.log('通知发送完毕（检查控制台日志）');
})();
```

然后运行：

```bash
node test_notify.js
```

- 若短信/邮件配置已启用（在 `.env` 中设置 `SMS_ENABLED=true` 等并填入真实凭证），会实际发送。
- 目前默认均为 `false`，仅会在控制台打印日志。

> 为了测试，可暂时将 `.env` 中的 `SMS_ENABLED=true`、`EMAIL_ENABLED=true` 并填入测试凭证（如使用 Maildev 捕获邮件，Twilio 测试账号等）。

### 5. 运营后台测试

后台管理路由均在 `/api/admin/*` 下，需要 `x-user-role: admin` 或 `operator`。

#### 获取商家列表

```bash
curl -s "http://localhost:3002/api/admin/merchants?page=1&pageSize=5" \
  -H "x-user-role: admin"
```

期望返回包含 `list`、`total` 等分页数据。

#### 获取待审商家

```bash
curl -s "http://localhost:3002/api/admin/merchants?status=pending" \
  -H "x-user-role: admin"
```

#### 审核商家（通过）

假设返回的列表中有 id=1 的商家：

```bash
curl -X POST http://localhost:3002/api/admin/merchants/1/review \
  -H "Content-Type: application/json" \
  -H "x-user-role: admin" \
  -d '{
        "action": "approve",
        "remark": "测试通过"
      }'
```

期望返回：

```json
{
  "code": 0,
  "message": "商家通过审核成功",
  "data": { /* 商家对象，status: "approved" */ }
}
```

#### 获取统计数据

```bash
curl -s http://localhost:3002/api/admin/stats \
  -H "x-user-role: admin"
```

期望返回：

```json
{
  "code": 0,
  "data": {
    "total": 2,
    "pending": 1,
    "approved": 1,
    "rejected": 0
  }
}
```

### 6. 数据大屏测试

所有接口均在 `/api/dashboard/stats/*` 下，**无需鉴权**（演示环境可直接访问）。

#### 概览数据

```bash
curl -s http://localhost:3002/api/dashboard/stats/overview
```

期望返回类似：

```json
{
  "code": 0,
  "data": {
    "todayOrders": 128,
    "todayRevenue": 12560.5,
    "todayUsers": 45,
    "totalMerchants": 12,
    "pendingMerchants": 3,
    "avgOrderValue": 98.13
  }
}
```

#### 订单趋势

```bash
curl -s http://localhost:3002/api/dashboard/stats/orders-trend
```

#### 区域分布（热力图）

```bash
curl -s http://localhost:3002/api/dashboard/stats/region-distribution
```

#### 热销商品

```bash
curl -s http://localhost:3002/api/dashboard/stats/top-products
```

#### 用户漏斗

```bash
curl -s http://localhost:3002/api/dashboard/stats/user-funnel
```

所有接口应返回 `code: 0` 和对应数据。

## 六、常见问题及排查

| 问题 | 检查点 |
|------|--------|
| 后端启动失败，报 `Cannot find module 'wechatpay'` | 确认已运行 `npm install`，且 `package.json` 中含 `wechatpay` 和 `alipay-sdk`。若仍缺失，尝试删除 `node_modules` 和 `package-lock.json` 重新安装。 |
| `curl` 返回 `Connection refused` | 后端未启动或端口被占用。检查 `npm run dev:backend` 输出是否有 `服务启动成功，监听端口 3002`。 |
| 后台接口返回 `403 权限不足` | 请求头缺少 `x-user-role: admin` 或 `x-user-role: operator`。 |
| 支付接口返回 `Order not found` | 确认 `orderId` 正确且该订单已通过之前的创建接口存在。 |
| 通知未发送（仅看到日志） | 检查 `.env` 中 `SMS_ENABLED`、`EMAIL_ENABLED` 是否设为 `true`，并填入有效的测试凭证。 |
| 前端页面显示空白或错误 | 打开浏览器开发者工具（F12）查看控制台错误，确认已成功连接到后端地址（通常在 `src/api/` 或 `src/services/api/` 中配置基础URL）。 |

## 七、测试数据清理

- 后端使用内存数据（如商家列表、订单存储在服务运行期间的内存中），重启后端后数据将恢复为初始状态。
- 若需彻底重置，只需重启后端服务：
  ```bash
  # 在后端目录
  pkill -f "node src/index.js"   # 或在另一终端按 Ctrl+C 停止当前运行
  npm run dev:backend
  ```

## 八、后续扩展建议

1. **替换为真实支付网关**：  
   - 安装官方 SDK：`npm install wechatpay-nodejs-v3@latest alipay-sdk@latest`（若仓库可用）。  
   - 在 `WeChatPayService`、`AlipayService` 中使用真实的网关调用（查询订单、退款等），并添加签名验证中间件。

2. **引入持久化存储**：  
   - 将后台商家、订单等模型迁移至真实数据库（PostgreSQL），使用现有的 `typeorm` 或 `kysely` 配置。

3. **丰富通知模板**：  
   - 从数据库或文件系统读取短信/邮件模板，支持变量替换（如 `{orderNo}`、`{amount}`）。

4. **实现推送服务**：  
   - 使用 `web-push` 库，保存用户订阅，向浏览器或移动端推送消息。

5. **编写端到端测试**：  
   - 使用 Cypress、Playwright 或 Puppeteer 对关键路径（下单→支付→通知→后台审核→大屏展示）进行自动化验证。

---

> 本手册基于当前代码状态（2026-07-02）编写。如代码有更新，请参照最新的源码和注释进行调整。祝测试顺利！ 🚀