/**
 * 平台常量集中管理
 * 包含所有枚举、状态、类型定义
 *
 * @author GRI Team
 * @version 1.0
 */

/**
 * 实体状态枚举
 */
export const EntityState = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived',
  PENDING: 'pending',
  SUSPENDED: 'suspended',
})

/**
 * 模块状态枚举
 */
export const ModuleState = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DEVELOPING: 'developing',
  DEPRECATED: 'deprecated',
})

/**
 * 模块层级枚举
 */
export const ModuleLevel = Object.freeze({
  INDUSTRY: 1,
  FUNCTION: 2,
  SERVICE: 3,
  APP: 4,
})

/**
 * 租户状态枚举
 */
export const TenantState = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
  PENDING: 'pending',
})

/**
 * 插件状态枚举
 */
export const PluginState = Object.freeze({
  INSTALLED: 'installed',
  AVAILABLE: 'available',
  UPDATABLE: 'updatable',
  DISABLED: 'disabled',
  ERROR: 'error',
})

/**
 * 插件类型枚举
 */
export const PluginType = Object.freeze({
  COMPONENT: 'component',
  FORM_COMPONENT: 'formComponent',
  DATA_SOURCE: 'dataSource',
  WORKFLOW_NODE: 'workflowNode',
  TOOLBAR: 'toolbar',
  PANEL: 'panel',
  MIDDLEWARE: 'middleware',
})

/**
 * 插件生命周期枚举
 */
export const PluginLifecycle = Object.freeze({
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
  UNLOAD: 'unload',
})

/**
 * 市场状态枚举
 */
export const MarketState = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
})

/**
 * 操作类型枚举
 */
export const Operations = Object.freeze({
  READ: 'read',
  WRITE: 'write',
  CREATE: 'create',
  DELETE: 'delete',
  UPDATE: 'update',
  SUBMIT: 'submit',
  CANCEL: 'cancel',
  APPROVE: 'approve',
  REJECT: 'reject',
  SHARE: 'share',
  EXPORT: 'export',
  IMPORT: 'import',
  PRINT: 'print',
  FULL: 'full',
})

/**
 * 权限级别枚举
 */
export const PermissionLevel = Object.freeze({
  NONE: 'none',
  READ: 'read',
  WRITE: 'write',
  ADMIN: 'admin',
  FULL: 'full',
})

/**
 * 数据权限范围枚举
 */
export const DataScope = Object.freeze({
  ALL: 'all',
  MINE: 'mine',
  DEPT: 'dept',
  DEPT_AND_SUB: 'dept_and_sub',
  CUSTOM: 'custom',
})

/**
 * 组织类型枚举
 */
export const OrganizationType = Object.freeze({
  COMPANY: 'company',
  BRANCH: 'branch',
  DEPARTMENT: 'department',
  TEAM: 'team',
  STORE: 'store',
  KITCHEN: 'kitchen',
  FARM: 'farm',
})

/**
 * 组织状态枚举
 */
export const OrganizationState = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
})

/**
 * 成员角色枚举
 */
export const MemberRole = Object.freeze({
  OWNER: 'owner',
  LEGAL: 'legal',
  MANAGER: 'manager',
  SUPERVISOR: 'supervisor',
  MEMBER: 'member',
  EMPLOYEE: 'employee',
})

/**
 * 成员状态枚举
 */
export const MemberStatus = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  RESIGNED: 'resigned',
  ARCHIVED: 'archived',
})

/**
 * 订单状态枚举
 */
export const OrderStatus = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  DELIVERING: 'delivering',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
})

/**
 * 支付状态枚举
 */
export const PaymentStatus = Object.freeze({
  UNPAID: 'unpaid',
  PAID: 'paid',
  REFUNDING: 'refunding',
  REFUNDED: 'refunded',
  FAILED: 'failed',
})

/**
 * 事件优先级枚举
 */
export const EventPriority = Object.freeze({
  HIGH: 10,
  NORMAL: 5,
  LOW: 1,
})

/**
 * 钩子位置枚举
 */
export const HookPosition = Object.freeze({
  BEFORE: 'before',
  AFTER: 'after',
})

/**
 * 默认配额配置
 */
export const DefaultQuotas = Object.freeze({
  BASIC: {
    maxUsers: 10,
    maxModels: 50,
    maxStorage: 1024 * 1024 * 100, // 100MB
    maxWorkflows: 20,
    maxPlugins: 10,
    maxApiCalls: 10000,
  },
  ENTERPRISE: {
    maxUsers: 100,
    maxModels: 500,
    maxStorage: 1024 * 1024 * 1024 * 10, // 10GB
    maxWorkflows: 200,
    maxPlugins: 50,
    maxApiCalls: 1000000,
  },
})

/**
 * 默认配置
 */
export const DefaultConfig = Object.freeze({
  timezone: 'UTC',
  locale: 'zh-CN',
  currency: 'CNY',
})

// 注意：OrderStatus 和 PaymentStatus 已在前文定义，此处不再重复导出

// 冻结所有枚举对象，防止篡改
Object.freeze(EntityState)
Object.freeze(ModuleState)
Object.freeze(TenantState)
Object.freeze(PluginState)
Object.freeze(PluginType)
Object.freeze(MarketState)
Object.freeze(Operations)
Object.freeze(PermissionLevel)
Object.freeze(DataScope)
Object.freeze(OrganizationType)
Object.freeze(OrganizationState)
Object.freeze(MemberRole)
Object.freeze(MemberStatus)
Object.freeze(OrderStatus)
Object.freeze(PaymentStatus)
Object.freeze(EventPriority)
Object.freeze(HookPosition)
Object.freeze(DefaultQuotas)
Object.freeze(DefaultConfig)
