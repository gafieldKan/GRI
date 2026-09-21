/**
 * 插件导出索引
 *
 * 插件列表：
 * - DataPermissionPlugin: 数据权限插件
 * - RepositoryValidationPlugin: 模型验证插件
 */

// 数据权限插件
export {
  dataPermissionEngine,
  DataPermissionPlugin,
  DataPermissionConfig,
  DataScope,
  FieldPermissionLevel,
} from './DataPermissionPlugin.js'

// 仓库验证插件
export { RepositoryValidationPlugin } from '../core/ModelValidator.js'
