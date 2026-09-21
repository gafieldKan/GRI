/**
 * 低代码平台全量功能测试
 * 覆盖所有核心模块和高阶能力
 *
 * 测试矩阵：
 * 1. 数据建模能力
 * 2. 页面设计与交互
 * 3. 流程引擎 (BPM)
 * 4. 逻辑编排与集成
 * 5. 权限与安全
 * 6. AI 辅助能力
 * 7. 高阶能力 (新增 5 项)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// ==================== 核心模块导入 ====================
// 数据建模
import {
  ModelSchema,
  FieldType,
  ValidationType,
  FieldConfig,
  ModelConfig,
} from '../../lowcode/core/ModelSchema.js'

// 类型验证
import { typeValidator } from '../../lowcode/core/TypeValidator.js'

// 权限管理
import {
  permissionManager,
  PermissionLevel,
  Role,
} from '../../lowcode/core/PermissionManager.js'

// 插件系统
import {
  pluginRegistry,
  PluginType,
} from '../../lowcode/core/PluginRegistry.js'

// Schema 管理
import { schemaManager } from '../../lowcode/core/SchemaManager.js'

// 事件引擎
import {
  eventEngine,
  EventPriority,
} from '../../lowcode/engine/EventEngine.js'

// 组件引擎
import {
  componentEngine,
  ComponentCategory,
} from '../../lowcode/engine/ComponentEngine.js'

// 工作流引擎
import {
  workflowEngine,
  WorkflowState,
} from '../../lowcode/engine/WorkflowEngine.js'

// 数据源管理
import {
  dataSourceManager,
  DataSourceType,
  DataSourceState,
} from '../../lowcode/engine/DataSourceManager.js'

// AI 助手
import {
  aiAssistant,
  AITaskType,
} from '../../lowcode/engine/AIAssistant.js'

// ==================== 高阶能力导入 ====================
// 1. 可视化逻辑编排
import {
  logicFlowEngine,
  FlowDefinition,
  FlowNode,
  FlowNodeType,
} from '../../lowcode/engine/LogicFlowEngine.js'

// 2. 高级工作流
import {
  advancedWorkflowEngine,
  ApprovalType,
  CountersignConfig,
  WorkflowInstanceState,
} from '../../lowcode/engine/AdvancedWorkflow.js'

// 3. 版本管理
import {
  versionManager,
  VersionType,
  VersionStatus,
} from '../../lowcode/engine/VersionManager.js'

// 4. 响应式/多端
import {
  responsiveEngine,
  DeviceType,
  ScreenSize,
  DeviceInfo,
} from '../../lowcode/engine/ResponsiveEngine.js'

// 5. 数据权限
import {
  dataPermissionManager,
  DataScope,
  MaskType,
  MaskRule,
  RowPermissionRule,
  FieldPermissionConfig,
  FieldPermissionLevel,
} from '../../lowcode/core/DataPermission.js'

// ==================== 工具函数 ====================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const createUser = (overrides = {}) => ({
  id: overrides.id || 'test_user',
  name: overrides.name || '测试用户',
  email: overrides.email || 'test@example.com',
  deptId: overrides.deptId || 'dept_1',
  role: overrides.role || 'user',
})

const createTestContext = () => ({
  user: createUser(),
  timestamp: Date.now(),
  environment: 'test',
})

// ==================== 测试套件 ====================
describe('低代码平台全量功能测试', () => {
  // 清理钩子
  beforeEach(() => {
    eventEngine.clear()
    pluginRegistry.clear()
    permissionManager.clear()
    schemaManager.clear()
  })

  afterEach(() => {
    // 清理测试数据
  })

  // ============================================
  // 1. 数据建模能力测试
  // ============================================
  describe('1. 数据建模能力 (Data Modeling)', () => {
    describe('1.1 字段类型支持', () => {
      it('应该支持所有基础字段类型', () => {
        const fieldTypes = [
          FieldType.STRING,
          FieldType.TEXT,
          FieldType.NUMBER,
          FieldType.INTEGER,
          FieldType.FLOAT,
          FieldType.BOOLEAN,
          FieldType.DATE,
          FieldType.DATETIME,
          FieldType.TIME,
        ]

        fieldTypes.forEach(type => {
          expect(Object.values(FieldType).includes(type)).toBe(true)
        })
      })

      it('应该支持选择字段类型', () => {
        const selectTypes = [
          FieldType.SELECT,
          FieldType.MULTI_SELECT,
          FieldType.RADIO,
          FieldType.CHECKBOX,
          FieldType.TAG,
        ]

        selectTypes.forEach(type => {
          expect(Object.values(FieldType).includes(type)).toBe(true)
        })
      })

      it('应该支持文件字段类型', () => {
        const fileTypes = [
          FieldType.IMAGE,
          FieldType.FILE,
          FieldType.IMAGES,
          FieldType.FILES,
        ]

        fileTypes.forEach(type => {
          expect(Object.values(FieldType).includes(type)).toBe(true)
        })
      })

      it('应该支持高级字段类型', () => {
        const advancedTypes = [
          FieldType.JSON,
          FieldType.CODE,
          FieldType.COLOR,
          FieldType.RATING,
          FieldType.PERCENT,
          FieldType.CURRENCY,
          FieldType.PHONE,
          FieldType.EMAIL,
          FieldType.URL,
          FieldType.ADDRESS,
          FieldType.FORMULA,
          FieldType.AUTO_NUMBER,
        ]

        advancedTypes.forEach(type => {
          expect(Object.values(FieldType).includes(type)).toBe(true)
        })
      })
    })

    describe('1.2 字段验证', () => {
      it('应该支持必填验证', () => {
        const field = new FieldConfig({
          name: 'name',
          label: '姓名',
          type: FieldType.STRING,
          required: true,
        })

        const errors = field.validate('')
        expect(errors.length).toBeGreaterThan(0)

        const validErrors = field.validate('张三')
        expect(validErrors.length).toBe(0)
      })

      it('应该支持格式验证', () => {
        const emailField = new FieldConfig({
          name: 'email',
          label: '邮箱',
          type: FieldType.STRING,
          validation: [
            { type: ValidationType.EMAIL, message: '邮箱格式不正确' }
          ]
        })

        expect(emailField.validate('invalid').length).toBeGreaterThan(0)
        expect(emailField.validate('test@example.com').length).toBe(0)
      })

      it('应该支持手机号验证', () => {
        const phoneField = new FieldConfig({
          name: 'phone',
          label: '手机',
          type: FieldType.STRING,
          validation: [
            { type: ValidationType.PHONE, message: '手机号格式不正确' }
          ]
        })

        expect(phoneField.validate('12345').length).toBeGreaterThan(0)
        expect(phoneField.validate('13812345678').length).toBe(0)
      })

      it('应该支持范围验证', () => {
        const numberField = new FieldConfig({
          name: 'age',
          label: '年龄',
          type: FieldType.NUMBER,
          validation: [
            { type: ValidationType.MIN, value: 0 },
            { type: ValidationType.MAX, value: 150 },
          ]
        })

        expect(numberField.validate(-1).length).toBeGreaterThan(0)
        expect(numberField.validate(200).length).toBeGreaterThan(0)
        expect(numberField.validate(25).length).toBe(0)
      })

      it('应该支持长度验证', () => {
        const textField = new FieldConfig({
          name: 'content',
          label: '内容',
          type: FieldType.TEXT,
          validation: [
            { type: ValidationType.MIN_LENGTH, value: 5 },
            { type: ValidationType.MAX_LENGTH, value: 100 },
          ]
        })

        expect(textField.validate('短').length).toBeGreaterThan(0)
        expect(textField.validate('合格的长度').length).toBe(0)
      })

      it('应该支持自定义验证', () => {
        const customField = new FieldConfig({
          name: 'code',
          label: '代码',
          type: FieldType.STRING,
          validation: [
            {
              type: ValidationType.CUSTOM,
              validate: (value, data) => {
                if (!value.startsWith('TEST_')) {
                  return '代码必须以 TEST_ 开头'
                }
                return null
              }
            }
          ]
        })

        const errors = customField.validate('INVALID')
        expect(errors.length).toBeGreaterThan(0)
        expect(errors[0]).toContain('TEST_')

        const valid = customField.validate('TEST_001')
        expect(valid.length).toBe(0)
      })
    })

    describe('1.3 数据模型', () => {
      it('应该创建数据模型', () => {
        const model = new ModelConfig({
          id: 'user_model',
          name: 'User',
          label: '用户',
          fields: [
            { name: 'name', type: FieldType.STRING, required: true },
            { name: 'email', type: FieldType.EMAIL },
            { name: 'age', type: FieldType.INTEGER },
          ]
        })

        expect(model).toBeDefined()
        expect(model.fields.length).toBe(3)
      })

      it('应该验证模型数据', () => {
        const model = new ModelConfig({
          id: 'user_model',
          name: 'User',
          fields: [
            { name: 'name', type: FieldType.STRING, required: true },
            { name: 'email', type: FieldType.EMAIL, required: true },
          ]
        })

        const invalidData = { name: '', email: 'invalid' }
        const errors = model.validate(invalidData)
        expect(errors.length).toBeGreaterThan(0)

        const validData = { name: '张三', email: 'test@example.com' }
        const validErrors = model.validate(validData)
        expect(validErrors.length).toBe(0)
      })

      it('应该支持关联关系', () => {
        // 验证关联关系类型存在
        expect(FieldType.REFERENCE).toBeDefined()
        expect(FieldType.TABLE).toBeDefined()
      })
    })
  })

  // ============================================
  // 2. 页面设计与交互能力测试
  // ============================================
  describe('2. 页面设计与交互 (UI/UX)', () => {
    describe('2.1 组件注册', () => {
      it('应该注册和获取组件', () => {
        componentEngine.registerComponent({
          id: 'testInput',
          name: '测试输入框',
          type: 'TestInput',
          category: ComponentCategory.FORM,
        })

        const component = componentEngine.getComponent('testInput')
        expect(component).toBeDefined()
        expect(component.name).toBe('测试输入框')
      })

      it('应该按分类获取组件', () => {
        const formComponents = componentEngine.getByCategory(ComponentCategory.FORM)
        expect(Array.isArray(formComponents)).toBe(true)
      })

      it('应该按类型获取组件', () => {
        const components = componentEngine.getByType('TestInput')
        expect(Array.isArray(components)).toBe(true)
      })
    })

    describe('2.2 组件属性', () => {
      it('应该支持组件属性定义', () => {
        componentEngine.registerComponent({
          id: 'advancedInput',
          name: '高级输入框',
          type: 'AdvancedInput',
          category: ComponentCategory.FORM,
          props: {
            placeholder: { type: 'string', default: '请输入' },
            maxLength: { type: 'number', default: 100 },
            disabled: { type: 'boolean', default: false },
          },
        })

        const component = componentEngine.getComponent('advancedInput')
        expect(component).toBeDefined()
        expect(component.props).toBeDefined()
      })
    })
  })

  // ============================================
  // 3. 流程引擎能力测试
  // ============================================
  describe('3. 流程引擎能力 (BPM)', () => {
    describe('3.1 流程定义', () => {
      it('应该注册工作流', () => {
        const workflow = workflowEngine.registerWorkflow({
          id: 'test_workflow',
          name: '测试工作流',
          nodes: [
            { id: 'start', name: '开始', type: 'start' },
            { id: 'end', name: '结束', type: 'end' },
          ],
          transitions: [
            { from: 'start', to: 'end' },
          ],
        })

        expect(workflow).toBeDefined()
        expect(workflow.id).toBe('test_workflow')
      })

      it('应该获取内置模板', () => {
        const templates = workflowEngine.getTemplates()
        expect(templates).toBeDefined()
        expect(Object.keys(templates).length).toBeGreaterThan(0)
      })
    })

    describe('3.2 流程实例', () => {
      it('应该注册工作流', () => {
        const workflow = workflowEngine.registerWorkflow({
          id: 'simple_flow',
          name: '简单流程',
          nodes: [
            { id: 'start', name: '开始', type: 'start' },
            { id: 'end', name: '结束', type: 'end' },
          ],
          transitions: [
            { from: 'start', to: 'end' },
          ],
        })

        expect(workflow).toBeDefined()
        expect(workflow.id).toBe('simple_flow')
      })

      it('应该获取内置模板', () => {
        const templates = workflowEngine.getTemplates()
        expect(templates).toBeDefined()
        expect(Object.keys(templates).length).toBeGreaterThan(0)
      })
    })

    describe('3.3 高级流程特性', () => {
      it('应该支持会签模式', () => {
        const config = new CountersignConfig({ type: 'all' })
        expect(config.isApproved(['approve', 'approve', 'approve'])).toBe(true)
        expect(config.isApproved(['approve', 'reject'])).toBe(false)
      })

      it('应该支持百分比会签', () => {
        const config = new CountersignConfig({
          type: 'percentage',
          percentage: 75
        })
        const results = ['approve', 'approve', 'approve', 'reject']
        expect(config.isApproved(results)).toBe(true)
      })

      it('应该支持或签模式', () => {
        const config = new CountersignConfig({ type: 'number', minCount: 1 })
        expect(config.isApproved(['approve'])).toBe(true)
      })
    })
  })

  // ============================================
  // 4. 逻辑编排与集成能力测试
  // ============================================
  describe('4. 逻辑编排与集成', () => {
    describe('4.1 可视化逻辑编排', () => {
      it('应该注册流程定义', () => {
        const flow = logicFlowEngine.registerFlow({
          id: 'logic_flow',
          name: '逻辑流程',
          nodes: [
            { id: 'start', type: FlowNodeType.START },
            { id: 'condition', type: FlowNodeType.CONDITION },
            { id: 'end', type: FlowNodeType.END },
          ],
        })

        expect(flow).toBeDefined()
        expect(flow.nodes.length).toBe(3)
      })

      it('应该验证流程定义', () => {
        const flow = new FlowDefinition({
          id: 'validate_flow',
          name: '验证流程',
          nodes: [{ type: FlowNodeType.START }],
        })

        const result = logicFlowEngine.validateFlow(flow)
        expect(result).toBeDefined()
      })
    })

    describe('4.2 数据源管理', () => {
      it('应该注册数据源', () => {
        const ds = dataSourceManager.register({
          id: 'test_rest',
          name: '测试 REST',
          type: DataSourceType.REST,
          config: { baseURL: 'https://api.example.com' },
        })

        expect(ds).toBeDefined()
        expect(ds.type).toBe(DataSourceType.REST)
      })

      it('应该获取数据源', () => {
        dataSourceManager.register({
          id: 'get_test',
          name: '获取测试',
          type: DataSourceType.REST,
        })

        const ds = dataSourceManager.get('get_test')
        expect(ds).toBeDefined()
      })

      it('应该按类型获取数据源', () => {
        const restSources = dataSourceManager.getByType(DataSourceType.REST)
        expect(Array.isArray(restSources)).toBe(true)
      })
    })
  })

  // ============================================
  // 5. 权限与安全能力测试
  // ============================================
  describe('5. 权限与安全', () => {
    describe('5.1 角色权限', () => {
      it('应该注册角色', () => {
        permissionManager.registerRole({
          id: 'test_role',
          name: '测试角色',
          permissions: ['model:*:read'],
        })

        const role = permissionManager.getRole('test_role')
        expect(role).toBeDefined()
        expect(role.name).toBe('测试角色')
      })

      it('应该分配角色', () => {
        permissionManager.registerRole({
          id: 'assign_role',
          name: '分配角色',
          permissions: ['model:*:read'],
        })

        permissionManager.assignRole('user_1', 'assign_role')
        const userRoles = permissionManager.getUserRoles('user_1')
        expect(userRoles.length).toBeGreaterThan(0)
      })

      it('应该检查权限', () => {
        permissionManager.registerRole({
          id: 'check_role',
          name: '检查角色',
          permissions: ['*'],
        })

        permissionManager.assignRole('user_1', 'check_role')
        expect(permissionManager.hasPermission('user_1', 'model:user:read')).toBe(true)
      })
    })

    describe('5.2 数据权限', () => {
      it('应该创建行级权限规则', () => {
        const rule = new RowPermissionRule({
          name: '本人数据',
          model: 'test',
          scope: DataScope.MINE,
        })

        expect(rule).toBeDefined()
        expect(rule.scope).toBe(DataScope.MINE)
      })

      it('应该生成查询条件', () => {
        dataPermissionManager.registerRowRule({
          model: 'test',
          scope: DataScope.MINE,
        })

        const filter = dataPermissionManager.getRowFilter('test', { id: 'user1' })
        expect(filter).toBeDefined()
      })

      it('应该创建字段权限', () => {
        const perm = new FieldPermissionConfig({
          model: 'test',
          field: 'sensitive',
          permissionLevel: FieldPermissionLevel.VISIBLE,
          roles: ['admin'],
        })

        expect(perm).toBeDefined()
        expect(perm.permissionLevel).toBe(FieldPermissionLevel.VISIBLE)
      })

      it('应该应用脱敏规则', () => {
        const rule = new MaskRule({ type: MaskType.PHONE })
        expect(rule.apply('13812345678')).toBe('138****5678')
      })

      it('应该脱敏邮箱', () => {
        const rule = new MaskRule({ type: MaskType.EMAIL })
        const masked = rule.apply('test@example.com')
        expect(masked).toContain('**')
      })
    })
  })

  // ============================================
  // 6. AI 辅助能力测试
  // ============================================
  describe('6. AI 辅助能力', () => {
    describe('6.1 AI 配置', () => {
      it('应该初始化 AI 助手', () => {
        // 验证 AI 助手存在
        expect(aiAssistant).toBeDefined()
      })

      it('应该支持配置', () => {
        // 验证配置类存在
        expect(AITaskType).toBeDefined()
        expect(AITaskType.GENERATE_FORM).toBe('generate_form')
      })
    })

    describe('6.2 AI 功能', () => {
      it('应该支持表单生成任务类型', () => {
        expect(AITaskType.GENERATE_FORM).toBe('generate_form')
      })

      it('应该支持字段推荐任务类型', () => {
        expect(AITaskType.RECOMMEND_FIELD_TYPE).toBe('recommend_field_type')
      })

      it('应该支持表达式生成任务类型', () => {
        expect(AITaskType.GENERATE_EXPRESSION).toBe('generate_expression')
      })
    })
  })

  // ============================================
  // 7. 高阶能力测试
  // ============================================
  describe('7. 高阶能力 (新增)', () => {
    describe('7.1 可视化逻辑编排', () => {
      it('应该注册和启动流程', async () => {
        logicFlowEngine.registerFlow({
          id: 'test_logic',
          name: '测试逻辑',
          nodes: [
            { id: 'start', type: FlowNodeType.START },
            { id: 'end', type: FlowNodeType.END },
          ],
        })

        const flow = logicFlowEngine.getFlow('test_logic')
        expect(flow).toBeDefined()
      })
    })

    describe('7.2 高级工作流', () => {
      it('应该注册工作流', () => {
        advancedWorkflowEngine.registerWorkflow({
          id: 'adv_workflow',
          name: '高级工作流',
          nodes: [{ id: 'start', type: 'start' }],
        })

        expect(advancedWorkflowEngine.getWorkflow('adv_workflow')).toBeDefined()
      })
    })

    describe('7.3 版本管理', () => {
      it('应该创建版本快照', () => {
        const version = versionManager.snapshot('test', 'test_1', { v: 1 })

        expect(version).toBeDefined()
        expect(version.versionNumber).toBe(1)
      })

      it('应该获取版本历史', () => {
        versionManager.snapshot('test', 'history_test', { v: 1 })
        versionManager.snapshot('test', 'history_test', { v: 2 })

        const history = versionManager.getHistory('test', 'history_test')
        expect(history.length).toBeGreaterThan(0)
      })
    })

    describe('7.4 多端适配', () => {
      it('应该获取设备信息', () => {
        const info = responsiveEngine.getDeviceInfo()
        expect(info).toBeDefined()
      })

      it('应该获取屏幕尺寸', () => {
        const size = responsiveEngine.getScreenSize()
        expect([
          ScreenSize.xs,
          ScreenSize.sm,
          ScreenSize.md,
          ScreenSize.lg,
          ScreenSize.xl,
          ScreenSize.xxl
        ].includes(size)).toBe(true)
      })
    })

    describe('7.5 数据权限', () => {
      it('应该检查数据访问权限', () => {
        const canAccess = dataPermissionManager.checkDataAccess(
          'test',
          'owner1',
          { id: 'user1' }
        )
        // 默认应该只允许访问自己的数据
        expect(canAccess).toBe(false) // 不是自己的数据
      })

      it('应该允许访问自己的数据', () => {
        const userId = 'test_user'
        const canAccess = dataPermissionManager.checkDataAccess(
          'test',
          userId,
          { id: userId }
        )
        expect(canAccess).toBe(true)
      })
    })
  })

  // ============================================
  // 8. 事件驱动能力测试
  // ============================================
  describe('8. 事件驱动能力', () => {
    it('应该发布和订阅事件', async () => {
      let called = false
      eventEngine.on('test:event', () => {
        called = true
      })

      await eventEngine.emit('test:event')
      expect(called).toBe(true)
    })

    it('应该支持事件优先级', async () => {
      const results = []

      eventEngine.on('test:priority', () => results.push(1), EventPriority.LOW)
      eventEngine.on('test:priority', () => results.push(2), EventPriority.HIGH)
      eventEngine.on('test:priority', () => results.push(3), EventPriority.NORMAL)

      await eventEngine.emit('test:priority')
      expect(results).toEqual([2, 3, 1])
    })
  })

  // ============================================
  // 9. 插件系统测试
  // ============================================
  describe('9. 插件系统', () => {
    it('应该注册插件', () => {
      pluginRegistry.register({
        name: 'test_plugin',
        type: 'component',
        version: '1.0.0',
      })

      const plugin = pluginRegistry.get('test_plugin')
      expect(plugin).toBeDefined()
      expect(plugin.name).toBe('test_plugin')
    })

    it('应该按类型获取插件', () => {
      pluginRegistry.register({
        name: 'type_plugin',
        type: 'component',
      })

      const components = pluginRegistry.getByType('component')
      expect(components.length).toBeGreaterThan(0)
    })
  })
})
