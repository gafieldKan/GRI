/**
 * 低代码引擎核心
 * 统一导出引擎各模块
 */

// 组件引擎
export { componentEngine, ComponentDef, ComponentCategory } from './ComponentEngine.js'

// 应用引擎
export { appEngine, AppState, defaultAppConfig } from './AppEngine.js'

// 事件引擎
export {
  eventEngine,
  EventPriority,
  EventType,
  on,
  once,
  off,
  emit,
  addInterceptor,
  removeInterceptor,
} from './EventEngine.js'

// 状态机引擎（增强版）
export {
  stateMachineEngine,
  StateMachine,
  OrderStateMachine,
  ApprovalStateMachine,
} from './StateMachineEngine.js'

// 工作流引擎
export {
  workflowEngine,
  Workflow,
  WorkflowNode,
  NodeType,
  WorkflowState,
  InstanceState,
} from './WorkflowEngine.js'

// 高级工作流引擎（会签/或签/子流程）
export {
  advancedWorkflowEngine,
  ApprovalType,
  HandleType,
  TimeoutAction,
  WorkflowInstanceState,
  TaskState,
  CountersignConfig,
  TaskInstance,
  WorkflowInstance,
} from './AdvancedWorkflow.js'

// 可视化逻辑编排引擎
export {
  logicFlowEngine,
  FlowNodeType,
  NodeShape,
  FlowExecutionState,
  FlowNode,
  FlowEdge,
  FlowDefinition,
  FlowInstance,
} from './LogicFlowEngine.js'

// 版本管理器
export { versionManager, VersionState, EntityType, Version, DiffUtil } from './VersionManager.js'

// 响应式引擎
export {
  responsiveEngine,
  DeviceType,
  ScreenSize,
  Orientation,
  DeviceInfo,
  ResponsiveConfig,
  GridSystem,
  BREAKPOINTS,
} from './ResponsiveEngine.js'

// 数据源管理
export {
  dataSourceManager,
  DataSourceType,
  DataSourceState,
  DataSourceConfig,
} from './DataSourceManager.js'

// 核心模块重新导出
export {
  pluginRegistry,
  PluginType,
  PluginLifecycle,
  registerPlugin,
} from '../core/PluginRegistry.js'
export { schemaManager, FieldTypes, ComponentTypes } from '../core/SchemaManager.js'
export {
  permissionManager,
  PermissionLevel,
  PermissionType,
  defaultRoles,
} from '../core/PermissionManager.js'

// 数据权限管理（行级/字段级）
export {
  dataPermissionManager,
  DataScope,
  FieldPermissionLevel,
  MaskType,
  MaskRule,
  RowPermissionRule,
  FieldPermissionConfig,
} from '../core/DataPermission.js'
