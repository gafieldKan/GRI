/**
 * 逻辑编排引擎
 * 支持可视化业务逻辑编排，包括条件/循环/变量/动作
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'
import { expressionEngine } from './ExpressionEngine.js'

/**
 * 节点类型枚举
 */
export const LogicNodeType = {
  TRIGGER: 'trigger', // 触发器
  ACTION: 'action', // 执行动作
  CONDITION: 'condition', // 条件判断
  LOOP: 'loop', // 循环
  VARIABLE: 'variable', // 变量操作
  DELAY: 'delay', // 延迟
  PARALLEL: 'parallel', // 并行执行
  SCRIPT: 'script', // 脚本执行
}

/**
 * 节点状态枚举
 */
export const LogicNodeState = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
  ERROR: 'error',
}

/**
 * 逻辑节点类
 */
export class LogicNode {
  constructor(config = {}) {
    this.id = config.id || `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    this.name = config.name || '节点'
    this.type = config.type || LogicNodeType.ACTION
    this.description = config.description || ''
    this.config = config.config || {}
    this.state = LogicNodeState.PENDING
    this.position = config.position || { x: 0, y: 0 }
    this.children = []
    this.metadata = config.metadata || {}
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      description: this.description,
      config: this.config,
      state: this.state,
      position: this.position,
      children: this.children.map((c) => c.toJSON()),
      metadata: this.metadata,
    }
  }
}

/**
 * 逻辑边类
 */
export class LogicEdge {
  constructor(config = {}) {
    this.id = config.id || `edge_${Date.now()}`
    this.source = config.source || ''
    this.target = config.target || ''
    this.condition = config.condition || null
    this.label = config.label || ''
    this.metadata = config.metadata || {}
  }

  toJSON() {
    return {
      id: this.id,
      source: this.source,
      target: this.target,
      condition: this.condition,
      label: this.label,
      metadata: this.metadata,
    }
  }
}

/**
 * 逻辑流程图类
 */
export class LogicFlow {
  constructor(config = {}) {
    this.id = config.id || `flow_${Date.now()}`
    this.name = config.name || '逻辑流'
    this.description = config.description || ''
    this.nodes = (config.nodes || []).map((n) => new LogicNode(n))
    this.edges = (config.edges || []).map((e) => new LogicEdge(e))
    this.variables = config.variables || {}
    this.triggers = config.triggers || []
    this.state = 'draft'
    this.createdAt = config.createdAt || Date.now()
    this.updatedAt = config.updatedAt || Date.now()
  }

  /**
   * 获取起始节点
   */
  getStartNodes() {
    return this.nodes.filter((n) => n.type === LogicNodeType.TRIGGER)
  }

  /**
   * 获取节点
   */
  getNode(nodeId) {
    return this.nodes.find((n) => n.id === nodeId)
  }

  /**
   * 获取下一批节点
   */
  getNextNodes(currentId) {
    const edges = this.edges.filter((e) => e.source === currentId)
    return edges.map((e) => this.nodes.find((n) => n.id === e.target)).filter(Boolean)
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      nodes: this.nodes.map((n) => n.toJSON()),
      edges: this.edges.map((e) => e.toJSON()),
      variables: this.variables,
      triggers: this.triggers,
      state: this.state,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}

/**
 * 节点执行器
 */
class NodeExecutor {
  constructor(engine) {
    this.engine = engine
  }

  /**
   * 执行节点
   */
  async execute(node, context) {
    const executor = this.getExecutor(node.type)
    if (!executor) {
      throw new Error(`未知的节点类型：${node.type}`)
    }

    return executor.call(this, node, context)
  }

  getExecutor(type) {
    const executors = {
      [LogicNodeType.TRIGGER]: this.executeTrigger.bind(this),
      [LogicNodeType.ACTION]: this.executeAction.bind(this),
      [LogicNodeType.CONDITION]: this.executeCondition.bind(this),
      [LogicNodeType.LOOP]: this.executeLoop.bind(this),
      [LogicNodeType.VARIABLE]: this.executeVariable.bind(this),
      [LogicNodeType.DELAY]: this.executeDelay.bind(this),
      [LogicNodeType.SCRIPT]: this.executeScript.bind(this),
    }
    return executors[type]
  }

  async executeTrigger(node, context) {
    // 触发器节点，通常作为入口
    context.history.push({
      nodeId: node.id,
      nodeName: node.name,
      type: 'trigger',
      timestamp: Date.now(),
    })
    return { status: 'completed', node: node.id }
  }

  async executeAction(node, context) {
    const { actionType, actionConfig } = node.config
    const result = await this.engine.executeAction(actionType, actionConfig, context)

    context.history.push({
      nodeId: node.id,
      nodeName: node.name,
      type: 'action',
      result,
      timestamp: Date.now(),
    })

    return { status: 'completed', node: node.id, result }
  }

  async executeCondition(node, context) {
    const { condition, branches = [] } = node.config

    // 计算条件
    const result = expressionEngine.safeEvaluate(condition, context.data, false)

    // 查找匹配的分支
    const matchedBranch = branches.find((b) => {
      if (b.value === 'true') return result
      if (b.value === 'false') return !result
      return b.value === result
    })

    context.history.push({
      nodeId: node.id,
      nodeName: node.name,
      type: 'condition',
      result,
      nextNode: matchedBranch?.to,
      timestamp: Date.now(),
    })

    return {
      status: 'completed',
      node: node.id,
      result,
      nextNode: matchedBranch?.to,
    }
  }

  async executeLoop(node, context) {
    const { source, actionType, condition } = node.config

    // 获取循环源数据
    const sourceData = expressionEngine.safeEvaluate(source, context.data, [])

    if (!Array.isArray(sourceData) || sourceData.length === 0) {
      return { status: 'completed', node: node.id, iterations: 0 }
    }

    const results = []
    for (let i = 0; i < sourceData.length; i++) {
      const item = sourceData[i]
      const loopContext = { ...context, data: { ...context.data, item, index: i } }

      if (actionType) {
        await this.engine.executeAction(actionType, { item, index: i }, loopContext)
      }

      results.push(item)

      // 检查中断条件
      if (condition) {
        const shouldContinue = expressionEngine.safeEvaluate(
          condition,
          { ...context.data, item, index: i },
          true
        )
        if (!shouldContinue) break
      }
    }

    context.history.push({
      nodeId: node.id,
      nodeName: node.name,
      type: 'loop',
      iterations: results.length,
      timestamp: Date.now(),
    })

    return { status: 'completed', node: node.id, iterations: results.length, results }
  }

  async executeVariable(node, context) {
    const { operation, name, value } = node.config

    switch (operation) {
      case 'set':
        context.data[name] = expressionEngine.safeEvaluate(value, context.data, value)
        break
      case 'delete':
        delete context.data[name]
        break
      case 'append':
        if (!context.data[name]) context.data[name] = []
        if (Array.isArray(context.data[name])) {
          context.data[name].push(value)
        }
        break
      default:
        context.data[name] = expressionEngine.safeEvaluate(value, context.data, value)
    }

    context.history.push({
      nodeId: node.id,
      nodeName: node.name,
      type: 'variable',
      operation,
      name,
      timestamp: Date.now(),
    })

    return { status: 'completed', node: node.id }
  }

  async executeDelay(node, context) {
    const { duration = 1000 } = node.config

    return new Promise((resolve) => {
      setTimeout(() => {
        context.history.push({
          nodeId: node.id,
          nodeName: node.name,
          type: 'delay',
          duration,
          timestamp: Date.now(),
        })
        resolve({ status: 'completed', node: node.id, duration })
      }, duration)
    })
  }

  async executeScript(node, context) {
    const { script } = node.config

    try {
      // 使用表达式引擎执行脚本
      const result = expressionEngine.safeEvaluate(script, context.data, null)

      context.history.push({
        nodeId: node.id,
        nodeName: node.name,
        type: 'script',
        result,
        timestamp: Date.now(),
      })

      return { status: 'completed', node: node.id, result }
    } catch (error) {
      context.history.push({
        nodeId: node.id,
        nodeName: node.name,
        type: 'script',
        error: error.message,
        timestamp: Date.now(),
      })

      throw error
    }
  }
}

/**
 * 逻辑编排引擎主类
 */
class LogicEngineClass extends EventEmitter {
  constructor() {
    super()
    this.flows = new Map()
    this.executions = new Map()
    this.actions = new Map()
    this.executor = new NodeExecutor(this)

    this.#registerBuiltInActions()
  }

  #registerBuiltInActions() {
    // 注册内置动作
    this.registerAction('log', async (config, context) => {
      console.log('[LogicEngine]', config.message || config)
      return { logged: true }
    })

    this.registerAction('http', async (config, context) => {
      const { url, method = 'GET', headers = {}, body } = config
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
      })
      return response.json()
    })

    this.registerAction('notification', async (config, context) => {
      const { message, type = 'info' } = config
      if (typeof window !== 'undefined') {
        if (type === 'error') {
          console.error(message)
        } else {
          console.log(`[Notification] ${message}`)
        }
      }
      return { notified: true }
    })
  }

  /**
   * 注册逻辑流
   */
  registerFlow(config) {
    const flow = new LogicFlow(config)
    this.flows.set(flow.id, flow)
    this.emit('flow:register', { flow })
    return flow
  }

  /**
   * 获取逻辑流
   */
  getFlow(flowId) {
    return this.flows.get(flowId)
  }

  /**
   * 删除逻辑流
   */
  deleteFlow(flowId) {
    return this.flows.delete(flowId)
  }

  /**
   * 执行逻辑流
   */
  async executeFlow(flowId, initialData = {}) {
    const flow = this.flows.get(flowId)
    if (!flow) {
      throw new Error(`逻辑流不存在：${flowId}`)
    }

    const executionId = `exec_${Date.now()}`
    const context = {
      data: { ...initialData },
      history: [],
      executionId,
      flowId,
    }

    this.executions.set(executionId, {
      id: executionId,
      flowId,
      status: 'running',
      context,
      startedAt: Date.now(),
    })

    this.emit('flow:start', { executionId, flowId })

    try {
      // 从触发器节点开始执行
      const startNodes = flow.getStartNodes()
      const results = []

      for (const node of startNodes) {
        const result = await this.executeNode(flow, node.id, context)
        results.push(result)
      }

      this.executions.get(executionId).status = 'completed'
      this.executions.get(executionId).completedAt = Date.now()

      this.emit('flow:complete', { executionId, flowId, results })
      return { executionId, results, context }
    } catch (error) {
      const execution = this.executions.get(executionId)
      if (execution) {
        execution.status = 'error'
        execution.error = error.message
      }
      this.emit('flow:error', { executionId, flowId, error })
      throw error
    }
  }

  /**
   * 执行节点
   */
  async executeNode(flow, nodeId, context) {
    const node = flow.getNode(nodeId)
    if (!node) {
      throw new Error(`节点不存在：${nodeId}`)
    }

    node.state = LogicNodeState.RUNNING
    this.emit('node:start', { flow: flow.id, node: nodeId })

    try {
      const result = await this.executor.execute(node, context)
      node.state = LogicNodeState.COMPLETED

      // 继续执行下一批节点
      const nextNodes = flow.getNextNodes(nodeId)
      const nextResults = []

      for (const nextNode of nextNodes) {
        if (nextNode) {
          const nextResult = await this.executeNode(flow, nextNode.id, context)
          nextResults.push(nextResult)
        }
      }

      this.emit('node:complete', { flow: flow.id, node: nodeId, result })
      return { ...result, children: nextResults }
    } catch (error) {
      node.state = LogicNodeState.ERROR
      this.emit('node:error', { flow: flow.id, node: nodeId, error })
      throw error
    }
  }

  /**
   * 注册动作
   */
  registerAction(name, handler) {
    this.actions.set(name, handler)
    this.emit('action:register', { name })
  }

  /**
   * 执行动作
   */
  async executeAction(type, config, context) {
    const handler = this.actions.get(type)
    if (!handler) {
      throw new Error(`动作未注册：${type}`)
    }
    return handler(config, context)
  }

  /**
   * 获取执行历史
   */
  getExecution(executionId) {
    return this.executions.get(executionId)
  }

  /**
   * 获取所有执行记录
   */
  getAllExecutions() {
    return Array.from(this.executions.values())
  }

  /**
   * 清空执行记录
   */
  clearExecutions() {
    this.executions.clear()
  }
}

// 导出单例
export const logicEngine = new LogicEngineClass()
export default logicEngine
