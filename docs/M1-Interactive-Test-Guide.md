# M1 全功能大巡游 - 交互式测试操作手册

> **测试目标**: 验证 GRI 项目 M1 模块的核心功能，包括行政树、主数据继承、资源注册、千人千面推荐和低代码验证。  
> **测试环境**: 本地开发环境  
> **前置条件**: PostgreSQL 数据库已启动

---

## 一、前置准备

### 1. 启动后端服务

```bash
cd /home/ubantu/reactProject/GRI/gri-backend
npm install
npm start
```

**预期输出**:
```
[GRI] 服务启动成功，监听端口 3002
[GRI] 健康检查：http://localhost:3002/health
[GRI] API 版本：http://localhost:3002/api/version
```

### 2. 验证服务健康状态

```bash
curl http://localhost:3002/health
```

**预期输出**:
```json
{
  "status": "ok",
  "timestamp": "2026-05-18T...",
  "version": "3.0.0 - 配置化 API 生成器"
}
```

---

## 二、测试入口

| 类型 | 地址 | 说明 |
|------|------|------|
| 健康检查 | `http://localhost:3002/health` | 服务状态检查 |
| API 版本 | `http://localhost:3002/api/version` | 查看可用 API 列表 |
| 基础 API | `http://localhost:3002/api/restaurants` | 餐厅资源 CRUD |
| 订单 API | `http://localhost:3002/api/orders` | 订单管理 |

---

## 三、5 个可视化测试场景

### 场景 1: 看行政树 - 查看行政组织架构

**测试内容**: 调用组织树 API，返回 UN → Region → Country → Local 四级行政树结构。

**操作步骤**:

```bash
# 获取行政树根节点
curl -X GET "http://localhost:3002/api/admin-tree/root"

# 获取完整行政树（限制深度）
curl -X GET "http://localhost:3002/api/admin-tree?maxDepth=5"
```

**cURL 命令**:
```bash
curl -s http://localhost:3002/api/organizations | jq .
```

**预期输出**:
```json
{
  "code": 200,
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000001",
      "name": "United Nations",
      "admin_level": "un",
      "admin_code": "UN",
      "admin_parent_path": "/",
      "admin_level_depth": 1,
      "type": "non_profit",
      "status": "active",
      "local_attributes": {
        "officialLanguages": ["en", "zh", "fr", "es", "ru", "ar"],
        "timezone": "UTC",
        "currency": "USD"
      }
    },
    {
      "id": "00000000-0000-0000-0000-000000000002",
      "name": "East Asia Region",
      "admin_level": "region",
      "admin_code": "EAS",
      "admin_parent_id": "00000000-0000-0000-0000-000000000001",
      ...
    }
  ]
}
```

**验证点**:
- [ ] 返回的组织包含行政层级字段（admin_level）
- [ ] 行政编码格式正确（UN, EAS, CN, CN-110000 等）
- [ ] 层级路径完整（/un-root/region-east-asia/country-cn/...）

---

### 场景 2: 测继承链 - 查看"朝阳区"的货币继承列表

**测试内容**: 调用主数据继承 API，查看从 UN 到朝阳区的货币定义继承链。

**操作步骤**:

```bash
# 获取朝阳区的继承货币列表
curl -X GET "http://localhost:3002/api/master-data/local-beijing-chaoyang/currency"
```

**cURL 命令**:
```bash
# 注意：实际测试需要使用正确的 UUID
curl -s "http://localhost:3002/api/master-data/00000000-0000-0000-0000-000000000005/currency" | jq .
```

**预期输出**:
```json
{
  "CNY": {
    "id": "...",
    "code": "CNY",
    "name": "人民币",
    "type": "currency",
    "attributes": {
      "symbol": "¥",
      "decimalPlaces": 2,
      "countries": ["CN"]
    },
    "_sourceOrgId": "00000000-0000-0000-0000-000000000003",
    "_sourceOrgName": "People's Republic of China"
  },
  "USD": {
    "code": "USD",
    "name": "美元",
    "attributes": {
      "symbol": "$",
      "decimalPlaces": 2
    }
  },
  "EUR": {
    "code": "EUR",
    "name": "欧元",
    "attributes": {
      "symbol": "€",
      "decimalPlaces": 2
    }
  },
  "_inheritanceChain": [
    {"key": "CNY", "orgId": "...", "orgName": "China"},
    {"key": "USD", "orgId": "...", "orgName": "United Nations"},
    ...
  ]
}
```

**验证点**:
- [ ] 返回包含从 UN 继承的货币（USD, EUR）
- [ ] 返回中国特有的货币定义（CNY）
- [ ] 继承链清晰展示来源组织

---

### 场景 3: 注册资源 - 模拟 SAP 导入资源

**测试内容**: 调用资源注册 API，从外部系统（SAP ERP）导入资源，返回资源 ID。

**操作步骤**:

```bash
curl -X POST "http://localhost:3002/api/resources/register" \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -H "x-organization-id: 00000000-0000-0000-0000-000000000005" \
  -d '{
    "externalSystemId": "SAP-ERP-001",
    "externalOrgId": "CN01",
    "resourceData": {
      "name": "测试餐厅",
      "adminOrgId": "00000000-0000-0000-0000-000000000005",
      "dataType": "restaurant",
      "industryCode": "55"
    }
  }'
```

**简化版 cURL**:
```bash
curl -X POST "http://localhost:3002/api/resources" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试餐厅",
    "adminOrgId": "00000000-0000-0000-0000-000000000005",
    "type": "restaurant"
  }' | jq .
```

**预期输出**:
```json
{
  "code": 201,
  "data": {
    "resourceId": "CN-110105-55-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
    "success": true,
    "adminOrg": {
      "id": "00000000-0000-0000-0000-000000000005",
      "name": "Chaoyang District",
      "adminCode": "CN-110105"
    },
    "masterData": {...},
    "industry": {
      "code": "55",
      "name": "餐饮业"
    }
  }
}
```

**验证点**:
- [ ] 返回全局唯一的资源 ID
- [ ] 资源 ID 格式：{adminCode}-{industryCode}-{uuid}
- [ ] 包含行政组织信息
- [ ] 包含继承的主数据

---

### 场景 4: 千人千面 - 模拟不同角色调用推荐接口

**测试内容**: 分别模拟"商家"和"消费者"角色调用推荐 API，对比返回结果差异。

**操作步骤**:

**步骤 4.1: 商家视角**
```bash
curl -X GET "http://localhost:3002/api/recommendations?role=merchant" \
  -H "x-user-role: merchant" \
  -H "x-org-id: 00000000-0000-0000-0000-000000000005" | jq .
```

**步骤 4.2: 消费者视角**
```bash
curl -X GET "http://localhost:3002/api/recommendations?role=consumer" \
  -H "x-user-role: consumer" \
  -H "x-org-id: 00000000-0000-0000-0000-000000000005" | jq .
```

**预期输出对比**:

| 字段 | 商家视角 | 消费者视角 |
|------|---------|-----------|
| 推荐类型 | 菜品优化建议、成本控制 | 菜品推荐、优惠活动 |
| 数据范围 | 本餐厅数据 | 全平台热门数据 |
| 操作权限 | 可编辑、上下架 | 仅查看、收藏 |

**商家返回示例**:
```json
{
  "role": "merchant",
  "recommendations": [
    {
      "type": "optimization",
      "title": "菜品优化建议",
      "data": {
        "dishName": "红烧肉",
        "suggestion": "价格低于同类平均 15%，建议上调",
        "currentPrice": 28.00,
        "marketAvgPrice": 32.50
      }
    }
  ]
}
```

**消费者返回示例**:
```json
{
  "role": "consumer",
  "recommendations": [
    {
      "type": "dish",
      "title": "您可能喜欢的菜品",
      "data": {
        "dishName": "宫保鸡丁",
        "restaurant": "川香阁",
        "price": 32.00,
        "discount": "满 100 减 20"
      }
    }
  ]
}
```

**验证点**:
- [ ] 不同角色返回不同的推荐内容
- [ ] 商家看到经营相关数据
- [ ] 消费者看到消费相关内容

---

### 场景 5: 低代码验证 - 动态创建 TestModel 并验证

**测试内容**: 通过配置动态创建一个 "TestModel"，然后立即调用其 API 验证是否生效。

**操作步骤**:

**步骤 5.1: 创建模型配置**
```bash
# 创建 TestModel 配置文件
cat > /tmp/test-model.json << 'EOF'
{
  "name": "TestModel",
  "tableName": "test_models",
  "primaryKey": "id",
  "fields": [
    {"name": "id", "type": "uuid", "required": true, "autoGenerate": true},
    {"name": "name", "type": "string", "required": true, "length": 100},
    {"name": "description", "type": "string", "required": false},
    {"name": "created_at", "type": "timestamp", "autoGenerate": true}
  ],
  "api": {
    "enabled": true,
    "basePath": "/api/test-models",
    "permissions": {"create": ["admin"], "read": ["public"], "update": ["admin"], "delete": ["admin"]}
  }
}
EOF
```

**步骤 5.2: 注册模型到系统**
```bash
curl -X POST "http://localhost:3002/api/models/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TestModel",
    "config": {
      "tableName": "test_models",
      "fields": [
        {"name": "id", "type": "uuid", "autoGenerate": true},
        {"name": "name", "type": "string", "length": 100},
        {"name": "description", "type": "string"}
      ],
      "api": {"basePath": "/api/test-models"}
    }
  }' | jq .
```

**步骤 5.3: 创建测试数据**
```bash
curl -X POST "http://localhost:3002/api/test-models" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试条目 1 号",
    "description": "这是动态创建的测试数据"
  }' | jq .
```

**预期输出**:
```json
{
  "code": 201,
  "data": {
    "id": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
    "name": "测试条目 1 号",
    "description": "这是动态创建的测试数据",
    "created_at": "2026-05-18T00:00:00.000Z"
  }
}
```

**步骤 5.4: 验证 API 生效**
```bash
# 获取列表
curl -X GET "http://localhost:3002/api/test-models" | jq .

# 获取详情
curl -X GET "http://localhost:3002/api/test-models/{id}" | jq .
```

**预期输出**:
```json
{
  "code": 200,
  "data": [
    {
      "id": "...",
      "name": "测试条目 1 号",
      "description": "这是动态创建的测试数据"
    }
  ]
}
```

**验证点**:
- [ ] 模型配置成功注册
- [ ] CRUD 接口立即可用
- [ ] 数据持久化成功
- [ ] 查询返回正确

---

## 四、常见问题排查

### 1. 服务无法启动

**现象**: `npm start` 后报错

**排查步骤**:
```bash
# 1. 检查端口占用
lsof -i :3002

# 2. 检查数据库连接
psql -h localhost -U postgres -d gri_db -c "SELECT 1"

# 3. 查看完整错误日志
npm start 2>&1 | tee startup.log
```

### 2. 数据库迁移失败

**现象**: 迁移过程中报错

**解决方案**:
```bash
# 重置迁移记录（谨慎操作）
psql -h localhost -U postgres -d gri_db -c "DROP TABLE IF EXISTS _migrations CASCADE;"

# 重新运行迁移
npm start
```

### 3. API 返回 404

**现象**: `curl http://localhost:3002/api/xxx` 返回 404

**排查步骤**:
```bash
# 1. 检查服务是否运行
curl http://localhost:3002/health

# 2. 检查已注册的 API 列表
curl http://localhost:3002/api/version
```

---

## 五、测试检查清单

| 场景 | 验证点 | 状态 |
|------|--------|------|
| 1. 行政树 | 返回包含完整层级路径 | [ ] |
| 2. 继承链 | 正确合并各层级主数据 | [ ] |
| 3. 资源注册 | 生成全局唯一资源 ID | [ ] |
| 4. 千人千面 | 不同角色返回不同推荐 | [ ] |
| 5. 低代码 | 动态模型立即可用 | [ ] |

---

## 六、附录：环境信息

| 项目 | 值 |
|------|-----|
| 后端端口 | 3002 |
| 数据库 | PostgreSQL (gri_db) |
| Node.js 版本 | >=18.0.0 |
| 依赖管理 | npm |

**文档版本**: 1.0.0  
**更新日期**: 2026-05-18  
**维护者**: GRI Team
