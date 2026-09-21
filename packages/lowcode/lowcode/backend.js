/**
 * GRI Lowcode - Backend 入口
 *
 * 仅导出后端所需的模块（不包含 JSX 组件，避免 Node.js 加载错误）
 *
 * @author GRI Team
 * @version 1.0
 */

// 核心引擎 - Repository/Service 所需
export { BaseRepository, DataSource, InMemoryDataSource, RestApiDataSource } from './repository/BaseRepository.js'
export { repositoryFactory, OrganizationRepository, DishRepository, RestaurantRepository } from './repository/index.js'

// 数据权限插件
export { dataPermissionEngine, DataPermissionPlugin, DataScope, FieldPermissionLevel } from './plugins/DataPermissionPlugin.js'

// 组织领域模型
export {
  Organization,
  OrganizationMember,
  MemberRole,
  MemberStatus,
  MemberTitle,
  MemberRoleUtils,
  Role,
  OrganizationDomainService,
} from './domain/organization/index.js'

// 用户领域
export { User } from './domain/user/User.js'

// 订单
export { Order, OrderItem } from './domain/order/Order.js'

// 购物车
export { Cart, CartItem } from './domain/cart/Cart.js'

// 领域基础类
export { BaseDomain, ValueObject } from './domain/BaseDomain.js'

// 核心服务
export { tenantManager, Tenant } from './core/TenantManager.js'
export { permissionManager } from './core/PermissionManager.js'
