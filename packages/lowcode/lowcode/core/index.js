/**
 * Core 模块统一导出
 */
export { BaseEntity, ConfigurableEntity, HookManager } from './BaseEntity.js'
export { TypeValidator, ValidationError, TypeCheck } from './TypeValidator.js'
export {
  EntityState, ModuleState, ModuleLevel, TenantState, PluginState, PluginType,
  MarketState, Operations, PermissionLevel, DataScope, OrganizationType, OrganizationState,
  MemberRole, MemberStatus, OrderStatus, PaymentStatus, EventPriority, HookPosition,
  DefaultQuotas, DefaultConfig,
} from './Constants.js'
export { pluginRegistry, registerPlugin, PluginType as PluginTypeEnum } from './PluginRegistry.js'
export { pluginMarket } from '../plugins/PluginMarket.js'
export { eventEngine, EventType } from '../engine/EventEngine.js'
export { tenantManager, Tenant, TenantFactory, QuotaStrategy } from './TenantManager.js'
export {
  permissionManager, PermissionDescriptor, PermissionStrategy,
  ModelPermissionStrategy, DataPermissionStrategy, Role, UserPermissionContext,
} from './PermissionManager.js'
export { configService, i18n, ConfigItem, ConfigLayer } from './ConfigService.js'
export {
  modelValidator, ModelValidator, ValidatorConfig, ModelValidationError, RepositoryValidationPlugin,
} from './ModelValidator.js'
export {
  FieldType, ValidationType, FieldConfig, ModelConfig,
  RelationType, RelationConfig, defineModel, defineField,
} from './ModelSchema.js'
export {
  dataPermissionManager, DataScope, MaskType, MaskRule,
} from './DataPermission.js'

// 全局工具函数
export function deepMerge(target, source) {
  const output = { ...target }
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) Object.assign(output, { [key]: source[key] })
        else output[key] = deepMerge(target[key], source[key])
      } else Object.assign(output, { [key]: source[key] })
    })
  }
  return output
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item)
}

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => { timeout = null; func(...args) }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

export function throttle(func, limit) {
  let inThrottle
  return function (...args) {
    if (!inThrottle) { func.apply(this, args); inThrottle = true }
    setTimeout(() => (inThrottle = false), limit)
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function retry(fn, retries = 3, delay = 1000) {
  let lastError
  for (let i = 0; i < retries; i++) {
    try { return await fn() } catch (error) { lastError = error; await sleep(delay) }
  }
  throw lastError
}
