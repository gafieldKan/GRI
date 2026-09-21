/**
 * Awesome Lowcode - 核心导出
 * 统一导出所有核心模块
 *
 * 核心能力：
 * - 运行时渲染引擎：基于 JSON Schema 动态渲染页面/表单
 * - API 连接器：REST/SOAP/GraphQL数据源连接管理
 * - 表达式引擎：支持变量解析、函数计算、条件表达式、数据绑定
 * - 数据源管理：支持 REST、GraphQL、MySQL、PostgreSQL、MongoDB 等
 * - 自动 API 生成：基于模型 Schema 自动生成 CRUD REST API
 * - 国际化系统：多语言包管理、翻译管理、运行时切换
 * - 版本管理：版本快照、差异对比、回滚功能
 * - 主题定制：Design Token 系统、主题配置中心
 * - 页面路由管理：页面树管理、路由配置、菜单自动生成
 * - 逻辑编排引擎：可视化业务逻辑编排
 * - 状态机引擎：支持订单状态流转、审批流等
 * - 数据权限插件：自动拦截 Repository 调用，注入租户隔离条件
 * - 模型校验：支持通过 JSON 配置定义模型字段和校验规则
 */

// ==================== 新增核心引擎 ====================

// 运行时渲染引擎
export { renderEngine, RenderConfig, DataBinding, RendererType } from './engine/RenderEngine.js'

// API 连接器
export {
  apiConnector,
  ApiConfig,
  Endpoint,
  ApiType,
  HttpMethod,
  AuthType,
  RequestBuilder,
} from './engine/ApiConnector.js'

// 连接器模板（第三方服务预置连接器）
export {
  ConnectorTemplates,
  getAllTemplates,
  getTemplate,
  getTemplatesByCategory,
  getTemplateCategories,
} from './engine/ConnectorTemplates.js'

// 数据库驱动
export {
  databaseManager,
  DatabaseConfig,
  DatabaseType,
  MySqlDriver,
  PostgreSQLDriver,
  SQLiteDriver,
  QueryBuilder,
} from './engine/DatabaseDriver.js'

// 模板管理
export {
  templateManager,
  Template,
  TemplateType,
  TemplateSource,
  TEMPLATE_CATEGORIES,
} from './engine/TemplateManager.js'

// 环境管理
export {
  environmentManager,
  Environment,
  EnvironmentType,
  DeployStatus,
  Deployment,
  DeploymentBuilder,
} from './engine/EnvironmentManager.js'

// 响应式引擎
export {
  responsiveEngine,
  DeviceInfo,
  DeviceType,
  ScreenSize,
  Orientation,
  ResponsiveConfig,
  GridSystem,
  BREAKPOINTS,
} from './engine/ResponsiveEngine.js'

// 性能监控
export { performanceMonitor, PerformanceMetric, MetricType } from './engine/PerformanceMonitor.js'

// 错误日志
export { errorLogger, ErrorLog, ErrorLevel, ErrorSource, catchError } from './engine/ErrorLogger.js'

// Webhook 管理
export {
  webhookManager,
  WebhookConfig,
  WebhookStatus,
  WebhookLog,
} from './engine/WebhookManager.js'

// 状态管理
export { stateManager, PersistType } from './engine/StateManager.js'

// 逻辑调试
export {
  logicDebugger,
  Breakpoint,
  ExecutionContext,
  ExecutionStatus,
  DebugUtils,
} from './engine/LogicDebugger.js'

// 审计日志
export { auditLogger, AuditEntry, AuditAction, AuditLevel } from './engine/AuditLogger.js'

// 表达式引擎
export { expressionEngine, ExpressionError } from './engine/ExpressionEngine.js'

// 数据源管理
export {
  dataSourceManager,
  DataSourceConfig,
  DataSourceType,
  DataSourceState,
} from './engine/DataSourceManager.js'

// 自动 API 生成
export { apiGenerator, ApiResponse, QueryParser, BaseDAO } from './server/ApiGenerator.js'

// 国际化管理
export { i18nManager, t, DEFAULT_LOCALES, LocalePack } from './engine/I18nManager.js'

// RTL 语言支持
export {
  rtlManager,
  RTL_LOCALES,
  LTR_LOCALES,
  RTL_CSS_MAP,
  getAllLocales,
  isRtlLocale,
  getLocaleDirection,
  isRtl,
  getDirection,
} from './engine/RtlManager.js'

// 版本管理
export {
  versionManager,
  Version,
  VersionState,
  EntityType,
  DiffUtil,
} from './engine/VersionManager.js'

// 主题定制
export {
  themeManager,
  Theme,
  CssVarGenerator,
  DEFAULT_THEME,
  PRESET_THEMES,
} from './engine/ThemeManager.js'

// 页面路由管理
export {
  routeManager,
  PageConfig,
  PageType,
  PageState,
  MenuItem,
  RouteParser,
} from './engine/RouteManager.js'

// 逻辑编排引擎
export {
  logicEngine,
  LogicNode,
  LogicEdge,
  LogicFlow,
  LogicNodeType,
  LogicNodeState,
} from './engine/LogicEngine.js'

// ==================== 原有引擎模块 ====================

// 组件引擎
export { componentEngine, ComponentDef, ComponentCategory } from './engine/ComponentEngine.js'

// 应用引擎
export { appEngine, AppState, defaultAppConfig } from './engine/AppEngine.js'

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
} from './engine/EventEngine.js'

// 状态机引擎
export {
  stateMachineEngine,
  StateMachine,
  OrderStateMachine,
  ApprovalStateMachine,
} from './engine/StateMachineEngine.js'

// 工作流引擎
export {
  workflowEngine,
  Workflow,
  WorkflowNode,
  NodeType,
  WorkflowState,
  InstanceState,
} from './engine/WorkflowEngine.js'

// ==================== 核心模块 ====================

// 插件注册
export {
  pluginRegistry,
  PluginType,
  PluginLifecycle,
  registerPlugin,
} from './core/PluginRegistry.js'

// Schema 管理
export { schemaManager, FieldTypes, ComponentTypes } from './core/SchemaManager.js'

// 权限管理
export {
  permissionManager,
  PermissionLevel,
  PermissionType,
  defaultRoles,
  Operations,
  DataScope,
  hasPermission,
  hasRole,
  getUserPermissions,
} from './core/PermissionManager.js'

// 数据模型 Schema
export {
  FieldType,
  ValidationType,
  FieldConfig,
  ModelConfig,
  RelationType,
  RelationConfig,
  defineModel,
  defineField,
} from './core/ModelSchema.js'

// 模型验证器
export {
  modelValidator,
  ModelValidator,
  ValidatorConfig,
  ModelValidationError,
  RepositoryValidationPlugin,
} from './core/ModelValidator.js'

// 数据权限插件
export {
  dataPermissionEngine,
  DataPermissionPlugin,
  DataPermissionConfig,
  FieldPermissionLevel,
} from './plugins/DataPermissionPlugin.js'

// 引擎索引导出
export * from './engine/index.js'

// ==================== Repository 层 ====================
// Repository 基类与实现
export {
  BaseRepository,
  DataSource,
  InMemoryDataSource,
  RestApiDataSource,
  OrganizationRepository,
  OrganizationMemberRepository,
  RoleRepository,
  RestaurantRepository,
  DishRepository,
  repositoryFactory,
} from './repository/index.js'

// 插件导出
export * from './plugins/index.js'

// ==================== UI 组件 ====================

// API 调试工具

// 连接器模板列表

// Git 版本管理
export {
  gitManager,
  createGitManager,
  GitManager,
  GitCommit,
  GitBranch,
  GitConfig,
} from './engine/GitManager.js'

// 图表组件

// 用户行为分析
export {
  analyticsManager,
  createAnalyticsManager,
  AnalyticsEvent,
  UserSession,
  HeatmapData,
} from './engine/AnalyticsManager.js'

// 多端发布
export {
  multiPlatformPublisher,
  createMultiPlatformPublisher,
  PlatformType,
  PublishStatus,
  PublishConfig,
  BuildTask,
} from './engine/MultiPlatformPublisher.js'

// 单点登录 (SSO)
export {
  ssoManager,
  createSSOManager,
  AuthProtocol,
  LoginStatus,
  SSOConfig,
  UserInfo,
  TokenInfo,
} from './engine/SSOManager.js'

// 协同编辑
export {
  collaborationManager,
  createCollaborationManager,
  CollaborationStatus,
  LockStatus,
  OperationType,
  ConflictStrategy,
  Collaborator,
  OperationLock,
  CollaborativeOperation,
} from './engine/CollaborationManager.js'

// 自定义代码注入
export {
  codeInjector,
  createCodeInjector,
  CodeInjector,
  InjectPoint,
  CodeType,
  InjectedCode,
  SandboxConfig,
  CodeSandbox,
} from './engine/CodeInjector.js'

// 评论与批注
export {
  commentManager,
  createCommentManager,
  CommentType,
  CommentStatus,
  Comment,
} from './engine/CommentManager.js'

// 打印模板管理
export {
  printTemplateManager,
  createPrintTemplateManager,
  PrintTemplate,
  PaperSize,
  PrintOrientation,
} from './engine/PrintTemplateManager.js'

// ==================== 领域模型 ====================

// 组织与角色
export {
  Organization,
  OrganizationConfig,
  OrganizationMetadata,
  OrganizationType,
  ORG_LEVEL_LIMITS,
  ORG_TYPE_LABELS,
  ORG_TYPE_ICONS,
  OrganizationUtils,
  OrganizationMember,
  MemberRole,
  MemberStatus,
  MemberTitle,
  MemberRoleUtils,
  Role,
  PermissionDescriptor,
  PermissionAction,
  PermissionResource,
  DATA_SCOPE_LEVEL,
  RoleTemplates,
  RoleFactory,
  OrganizationDomainService,
} from './domain/organization/index.js'
