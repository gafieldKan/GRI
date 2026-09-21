/**
 * AppBootstrapper — 引擎初始化入口
 *
 * 职责：
 * 1. 初始化 AppEngine（状态管理、模块注册、插件加载）
 * 2. 注册事件监听器连接引擎 → UI
 * 3. 注册 GRI 行业模型到引擎
 */

import { defaultAppConfig, AppState } from '@/engine/AppEngine.js'
import appEngine from '@/engine/AppEngine.js'
import { eventEngine } from '@/engine/EventEngine.js'
import { registerPlugin, pluginRegistry } from '@/core/PluginRegistry.js'
import { defaultRoles, Role, Operations, PermissionLevel, DataScope } from '@/core/PermissionManager.js'
import { schemaManager } from '@/core/SchemaManager.js'

// 单例 guard
let bootstrapped = false

/**
 * 注册内置插件
 */
function registerBuiltinPlugins() {
  // 1. 输入校验插件
  registerPlugin({
    name: 'input-validator',
    type: 'validator',
    description: '实时输入校验',
    version: '1.0.0',
    install(ctx) {
      ctx.on('component:validate', (component) => {
        const rules = component.props?.validationRules
        if (!rules) return { valid: true }

        const errors = []
        for (const rule of rules) {
          const value = component.props?.value
          if (rule.required && !value) {
            errors.push(rule.message || '此字段为必填')
          }
          if (rule.pattern && value && !new RegExp(rule.pattern).test(value)) {
            errors.push(rule.message || '格式不正确')
          }
        }
        return { valid: errors.length === 0, errors }
      })
    },
  })

  // 2. 数据持久化插件
  registerPlugin({
    name: 'auto-persist',
    type: 'storage',
    description: '表单自动持久化到 localStorage',
    version: '1.0.0',
    install(ctx) {
      ctx.on('component:change', ({ componentId, value }) => {
        try {
          const saved = JSON.parse(localStorage.getItem('form-data') || '{}')
          saved[componentId] = value
          localStorage.setItem('form-data', JSON.stringify(saved))
        } catch (e) {
          // silently ignore
        }
      })
    },
  })

  // 3. 性能监控插件
  registerPlugin({
    name: 'perf-monitor',
    type: 'observer',
    description: '监控组件渲染性能',
    version: '1.0.0',
    install(ctx) {
      const componentTimings = new Map()

      ctx.on('component:render:start', (id) => {
        componentTimings.set(id, performance.now())
      })

      ctx.on('component:render:end', (id) => {
        const start = componentTimings.get(id)
        if (start) {
          const duration = performance.now() - start
          if (duration > 100) {
            console.warn(`[PerfMonitor] 组件 ${id} 渲染耗时 ${duration.toFixed(2)}ms`)
          }
          componentTimings.delete(id)
        }
      })
    },
  })

  // 4. 审计日志插件
  registerPlugin({
    name: 'audit-logger',
    type: 'observer',
    description: '记录用户操作审计日志',
    version: '1.0.0',
    install(ctx) {
      const logs = []

      ctx.on('operation', (event) => {
        logs.push({
          timestamp: new Date().toISOString(),
          user: event.user || 'anonymous',
          action: event.action,
          target: event.target,
          result: event.result,
        })
        if (logs.length > 500) logs.shift()
      })

      return {
        getLogs: (filters) => {
          let result = [...logs]
          if (filters?.action) result = result.filter(l => l.action === filters.action)
          if (filters?.since) result = result.filter(l => new Date(l.timestamp) > new Date(filters.since))
          return result
        },
      }
    },
  })
}

/**
 * 注册 GRI 行业模型到 schemaManager
 */
function registerGRISchemas() {
  schemaManager.registerModel({
    name: 'Restaurant',
    fields: [
      { name: 'name', type: 'string', required: true, label: '餐厅名称' },
      { name: 'address', type: 'string', required: true, label: '地址' },
      { name: 'phone', type: 'string', label: '电话' },
      { name: 'businessHours', type: 'object', label: '营业时间' },
    ],
  })

  schemaManager.registerModel({
    name: 'Dish',
    fields: [
      { name: 'name', type: 'string', required: true, label: '菜品名称' },
      { name: 'price', type: 'number', required: true, label: '价格' },
      { name: 'category', type: 'string', required: true, label: '分类' },
      { name: 'description', type: 'string', label: '描述' },
      { name: 'image', type: 'string', label: '图片' },
    ],
  })

  schemaManager.registerModel({
    name: 'Order',
    fields: [
      { name: 'id', type: 'string', required: true, label: '订单号' },
      { name: 'restaurantId', type: 'string', required: true, label: '餐厅ID' },
      { name: 'items', type: 'array', label: '菜品列表' },
      { name: 'totalAmount', type: 'number', required: true, label: '总金额' },
      { name: 'status', type: 'string', label: '状态' },
      { name: 'createdAt', type: 'date', label: '创建时间' },
    ],
  })

  schemaManager.registerModel({
    name: 'Organization',
    fields: [
      { name: 'name', type: 'string', required: true, label: '组织名称' },
      { name: 'type', type: 'string', required: true, label: '类型' },
      { name: 'parentId', type: 'string', label: '上级组织' },
      { name: 'members', type: 'array', label: '成员' },
    ],
  })
}

/**
 * 初始化应用引擎
 */
export async function bootstrap() {
  if (bootstrapped) {
    return appEngine
  }

  // ── 阶段 1: 初始化引擎单例 ──────────────────────────
  const appConfig = {
    ...defaultAppConfig,
    name: 'Awesome Lowcode',
    description: '企业级低代码开发平台',
    routes: [
      { path: '/', name: '首页', type: 'page' },
      { path: '/designer/form', name: '表单设计器', type: 'page' },
      { path: '/designer/model', name: '模型设计器', type: 'page' },
      { path: '/designer/workflow', name: '工作流设计器', type: 'page' },
      { path: '/logic-flow', name: '逻辑流编排', type: 'page' },
      { path: '/data/sources', name: '数据源管理', type: 'page' },
      { path: '/data/connectors', name: 'API 连接器', type: 'page' },
      { path: '/app-market', name: '应用市场', type: 'page' },
      { path: '/analytics', name: '数据分析', type: 'page' },
      { path: '/collaborate/realtime', name: '实时协作', type: 'page' },
      { path: '/publish/multi-platform', name: '多端发布', type: 'page' },
      { path: '/ai/assistant', name: 'AI 助手', type: 'page' },
      { path: '/admin/organizations', name: '组织管理', type: 'page' },
    ],
    theme: { primaryColor: '#1890ff', layout: 'side' },
    settings: {
      enableCache: true,
      enableLog: true,
      debugMode: import.meta.env?.MODE === 'development',
    },
  }

  try {
    await appEngine.init(appConfig)
    console.log('[Lowcode] 引擎初始化完成')
  } catch (err) {
    console.error('[Lowcode] 引擎初始化失败:', err)
    throw err
  }

  // ── 阶段 2: 注册领域模型 Schema ────────────────────
  try { registerGRISchemas() }
  catch (e) { console.warn('[Lowcode] 模型 Schema 注册跳过:', e.message) }

  // ── 阶段 3: 注册内置插件 ────────────────────────────
  try { registerBuiltinPlugins() }
  catch (e) { console.warn('[Lowcode] 插件注册跳过:', e.message) }

  // ── 阶段 4: 连接事件桥接 ────────────────────────────
  try {
    eventEngine.on('navigation', ({ from, to }) => {
      console.log(`[Router] ${from} → ${to}`)
    })
    eventEngine.on('component:change', ({ componentId, value }) => {
      appEngine.emit('state:update', { componentId, value })
    })
  } catch (e) { console.warn('[Lowcode] 事件桥接跳过:', e.message) }

  // ── 阶段 5: 挂载到全局（开发环境） ──────────────────
  if (import.meta.env?.MODE === 'development') {
    window.griModules = {
      appEngine,
      eventEngine,
      pluginRegistry,
      schemaManager,
      defaultRoles,
      Operations,
      PermissionLevel,
      DataScope,
    }
    console.log('[Lowcode] 挂载到 window.griModules')
  }

  bootstrapped = true
  console.log('[Lowcode] 平台初始化成功')

  return appEngine
}

/**
 * 获取引擎实例
 */
export function getEngine() {
  return appEngine
}
