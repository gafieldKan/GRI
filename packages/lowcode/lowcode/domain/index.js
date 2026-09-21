/**
 * 领域模型导出
 *
 * 领域驱动设计 (DDD) 核心层
 * 包含所有业务领域模型及其值对象
 *
 * @author GRI Team
 * @version 1.0
 */

// 基础类
export { BaseDomain, ValueObject } from './BaseDomain.js'

// 组织与角色领域
export {
  // 组织实体
  Organization,
  OrganizationConfig,
  OrganizationMetadata,
  OrganizationType,
  ORG_LEVEL_LIMITS,
  ORG_TYPE_LABELS,
  ORG_TYPE_ICONS,
  OrganizationUtils,
  // 组织成员
  OrganizationMember,
  MemberRole,
  MemberStatus,
  MemberTitle,
  MemberRoleUtils,
  // 角色与权限
  Role,
  PermissionDescriptor,
  PermissionAction,
  PermissionResource,
  DataScope,
  DATA_SCOPE_LEVEL,
  RoleTemplates,
  RoleFactory,
  // 领域服务
  OrganizationDomainService,
} from './organization/index.js'

// 餐厅领域
export { Restaurant, Address, BusinessHours } from './restaurant/Restaurant.js'

// 菜品领域
export { Dish, Price, Specification } from './dish/Dish.js'

// 订单领域
export { Order, OrderItem, DeliveryAddress, PaymentInfo } from './order/Order.js'

// 购物车领域
export { Cart, CartItem } from './cart/Cart.js'

// 用户领域
export { User } from './user/User.js'

/**
 * 领域服务接口（抽象）
 */
export class DomainService {
  /**
   * 验证业务规则
   */
  validate(entity) {
    throw new Error('子类必须实现 validate 方法')
  }

  /**
   * 执行领域操作
   */
  execute(operation, context) {
    throw new Error('子类必须实现 execute 方法')
  }
}

/**
 * 领域事件处理器接口
 */
export class DomainEventHandler {
  /**
   * 处理领域事件
   */
  handle(event) {
    throw new Error('子类必须实现 handle 方法')
  }
}

/**
 * 领域工厂接口
 */
export class DomainFactory {
  /**
   * 创建领域对象
   */
  create(config) {
    throw new Error('子类必须实现 create 方法')
  }

  /**
   * 从持久化数据重建领域对象
   */
  rebuild(data) {
    throw new Error('子类必须实现 rebuild 方法')
  }
}
