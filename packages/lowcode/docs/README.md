# GRI 低代码平台开发文档索引

## 文档导航

### 规范与标准
- [代码规范与设计原则](./代码规范与设计原则.md) - GRI 低代码平台编码规范
- [实现示例](./实现示例.md) - 代码规范实现示例
- [扩展组件使用指南](./扩展组件使用指南.md) - 扩展组件使用方法

### 架构与重构
- [领域驱动重构总结](./领域驱动重构总结.md) - DDD 重构完整说明
- [低代码平台能力评估报告](./低代码平台能力评估报告.md) - 平台能力评估
- [重构说明](./重构说明.md) - 核心模块重构说明
- [重构完成总结](./重构完成总结.md) - 重构工作总结

### 使用指南
- [扩展组件使用指南](./扩展组件使用指南.md)
- [领域驱动重构总结](./领域驱动重构总结.md)

---

## 快速开始

### 1. 项目结构
```
awesome-lowcode/
├── lowcode/                    # 低代码核心
│   ├── core/                   # 核心模块
│   │   ├── BaseEntity.js       # 基础实体类
│   │   ├── ModuleManager.js    # 模块管理器
│   │   ├── TenantManager.js    # 租户管理器
│   │   ├── PermissionManager.js# 权限管理器
│   │   ├── ConfigService.js    # 配置服务
│   │   └── index.js            # 统一导出
│   ├── domain/                 # 领域模型层
│   │   ├── BaseDomain.js       # 领域基类
│   │   ├── restaurant/         # 餐厅领域
│   │   ├── dish/               # 菜品领域
│   │   ├── order/              # 订单领域
│   │   ├── cart/               # 购物车领域
│   │   └── user/               # 用户领域
│   ├── repository/             # 数据访问层
│   │   ├── BaseRepository.js   # Repository 基类
│   │   ├── RestaurantRepository.js
│   │   └── DishRepository.js
│   ├── service/                # 服务层
│   │   ├── BaseService.js      # Service 基类
│   │   └── RestaurantService.js
│   ├── api/                    # API 客户端
│   │   └── ApiClient.js
│   ├── state/                  # 状态管理
│   │   └── BaseState.js
│   ├── engine/                 # 引擎层
│   └── server/                 # 服务端
├── src/                        # 源码
├── docs/                       # 文档
└── tests/                      # 测试
```

### 2. 核心概念

#### 2.1 分层架构
```
UI Layer -> State Layer -> Service Layer -> Domain Layer -> Repository Layer -> API Layer
```

#### 2.2 设计原则
- **封装**: 所有实体使用私有字段
- **继承**: 统一继承基类
- **多态**: 接口与实现分离
- **钩子扩展**: 所有核心类提供钩子

### 3. 使用示例

#### 3.1 使用服务层
```javascript
import { RestaurantService } from './service/RestaurantService.js'
import { RestaurantRepository } from './repository/RestaurantRepository.js'

const repository = new RestaurantRepository(dataSource)
const service = new RestaurantService(repository, eventPublisher)

// 获取餐厅列表
const restaurants = await service.getRestaurantList({ status: 'active' })
```

#### 3.2 使用状态管理
```javascript
import { CartState } from './state/BaseState.js'

const cartState = new CartState()
cartState.addItem({ dishId: '1', name: '汉堡', price: 32, quantity: 1 })
cartState.subscribe(state => console.log(state))
```

---

## 更新日志

### v1.0 (2026-05-14)
- ✅ 完成核心模块重构（BaseEntity, ModuleManager 等）
- ✅ 完成领域模型层（Restaurant, Dish, Order, Cart）
- ✅ 完成 Repository 层抽象
- ✅ 完成 Service 层抽象
- ✅ 完成 API 客户端抽象
- ✅ 完成状态管理抽象
- ✅ 创建完整文档体系

---

## 相关链接

- [GRI 餐饮生态平台总体设计](../../餐饮生态平台总体设计.md)
- [GRI 平台模块架构设计](../../GRI 平台模块架构设计.md)
