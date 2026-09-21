/**
 * 可视化逻辑编排引擎 (Logic Flow Engine)
 * 支持节点拖拽、流程编排、条件分支、变量处理
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 节点类型枚举
 */
export const FlowNodeType = {
  // 基础节点
  START: 'start',
  END: 'end',

  // 控制节点
  CONDITION: 'condition',
  BRANCH: 'branch',
  MERGE: 'merge',

  // 操作节点
  ACTION: 'action',
  SCRIPT: 'script',
  API_CALL: 'apiCall',
  DATA_OPERATION: 'dataOperation',

  // 业务节点
  APPROVAL: 'approval',
  NOTIFICATION: 'notification',
  SUB_FLOW: 'subFlow',

  // 循环节点
  LOOP: 'loop',
  LOOP_END: 'loopEnd',
}

/**
 * 节点形状枚举
 */
export const NodeShape = {
  RECTANGLE: 'rectangle',
  ROUNDED: 'rounded',
  DIAMOND: 'diamond',
  CIRCLE: 'circle',
}

/**
 * 流程执行状态
 */
export const FlowExecutionState = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ERROR: 'error',
  CANCELLED: 'cancelled',
}

/**
 * 流程节点类
 */
export class FlowNode {
  constructor(config = {}) {
    this.id = config.id || `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.type = config.type || FlowNodeType.ACTION
    this.name = config.name || '节点'
    this.description = config.description || ''
    this.position = config.position || { x: 0, y: 0 }
    this.config = config.config || {}
    this.inputs = config.inputs || []
    this.outputs = config.outputs || []
    this.variables = config.variables || {}
    this.retryConfig = config.retryConfig || { maxRetries: 0, retryInterval: 1000 }
    this.timeout = config.timeout || 30000
    this.enabled = config.enabled ?? true
  }

  /**
   * 执行节点逻辑
   */
  async execute(context) {
    const execContext = { ...context, node: this }

    try {
      this.emit('node:beforeExecute', execContext)

      const result = await this.executeLogic(execContext)

      this.emit('node:afterExecute', { ...execContext, result })
      return result
    } catch (error) {
      this.emit('node:error', { ...execContext, error })
      throw error
    }
  }

  async executeLogic(context) {
    switch (this.type) {
      case FlowNodeType.START:
        return this.handleStart(context)
      case FlowNodeType.END:
        return this.handleEnd(context)
      case FlowNodeType.CONDITION:
        return this.handleCondition(context)
      case FlowNodeType.BRANCH:
        return this.handleBranch(context)
      case FlowNodeType.SCRIPT:
        return this.handleScript(context)
      case FlowNodeType.API_CALL:
        return this.handleApiCall(context)
      case FlowNodeType.DATA_OPERATION:
        return this.handleDataOperation(context)
      case FlowNodeType.SUB_FLOW:
        return this.handleSubFlow(context)
      case FlowNodeType.LOOP:
        return this.handleLoop(context)
      default:
        return { status: 'completed', node: this.id }
    }
  }

  handleStart(context) {
    return { status: 'completed', node: this.id, type: 'start' }
  }

  handleEnd(context) {
    return { status: 'completed', node: this.id, type: 'end', output: context }
  }

  handleCondition(context) {
    const { conditions = [], branches = [] } = this.config
    const results = []

    for (const condition of conditions) {
      try {
        const result = this.evaluateCondition(condition, context)
        results.push({ condition: condition.id, result })

        if (result) {
          const branch = branches.find((b) => b.conditionId === condition.id)
          return {
            status: 'completed',
            node: this.id,
            type: 'condition',
            result: true,
            nextNode: branch?.nextNode,
            evaluatedCondition: condition.id,
          }
        }
      } catch (error) {
        return { status: 'error', node: this.id, error: error.message }
      }
    }

    return {
      status: 'completed',
      node: this.id,
      type: 'condition',
      result: false,
      nextNode: branches.find((b) => b.isDefault)?.nextNode,
    }
  }

  evaluateCondition(condition, context) {
    const { operator, field, value, valueType = 'static' } = condition

    let contextValue
    if (valueType === 'variable') {
      contextValue = this.getVariableValue(field, context)
    } else {
      contextValue = context[field]
    }

    switch (operator) {
      case 'equals':
        return contextValue === value
      case 'notEquals':
        return contextValue !== value
      case 'greaterThan':
        return Number(contextValue) > Number(value)
      case 'lessThan':
        return Number(contextValue) < Number(value)
      case 'contains':
        return String(contextValue).includes(String(value))
      case 'startsWith':
        return String(contextValue).startsWith(String(value))
      case 'endsWith':
        return String(contextValue).endsWith(String(value))
      case 'in':
        return Array.isArray(value) && value.includes(contextValue)
      case 'empty':
        return contextValue === null || contextValue === undefined || contextValue === ''
      case 'notEmpty':
        return contextValue !== null && contextValue !== undefined && contextValue !== ''
      default:
        return false
    }
  }

  handleBranch(context) {
    const { branchId } = this.config
    return {
      status: 'completed',
      node: this.id,
      type: 'branch',
      branchId,
    }
  }

  async handleScript(context) {
    const { script, scriptType = 'javascript' } = this.config

    try {
      let result
      if (scriptType === 'javascript') {
        // 使用 Function 构造器执行脚本（注意：需要沙箱隔离）
        const func = new Function('context', `return (async () => { ${script} })()`)
        result = await func(context)
      } else {
        result = this.executeCustomScript(script, scriptType, context)
      }

      return {
        status: 'completed',
        node: this.id,
        type: 'script',
        result,
      }
    } catch (error) {
      return { status: 'error', node: this.id, error: error.message }
    }
  }

  handleApiCall(context) {
    const { method = 'GET', url, headers = {}, body, transformData } = this.config

    return {
      status: 'completed',
      node: this.id,
      type: 'apiCall',
      method,
      url,
      request: { headers, body },
    }
  }

  handleDataOperation(context) {
    const { operation, model, data, filter, update } = this.config

    return {
      status: 'completed',
      node: this.id,
      type: 'dataOperation',
      operation,
      model,
    }
  }

  handleSubFlow(context) {
    const { subFlowId, params = {} } = this.config

    return {
      status: 'completed',
      node: this.id,
      type: 'subFlow',
      subFlowId,
      params,
    }
  }

  handleLoop(context) {
    const { loopType = 'foreach', source, variable, steps = [] } = this.config

    return {
      status: 'completed',
      node: this.id,
      type: 'loop',
      loopType,
      source,
      variable,
      steps,
    }
  }

  getVariableValue(path, context) {
    const parts = path.split('.')
    let value = context

    for (const part of parts) {
      if (value && value[part] !== undefined) {
        value = value[part]
      } else {
        return undefined
      }
    }

    return value
  }

  emit(event, data) {
    // 事件发射器占位符
  }
}

/**
 * 流程连接线类
 */
export class FlowEdge {
  constructor(config = {}) {
    this.id = config.id || `edge_${Date.now()}`
    this.sourceNodeId = config.sourceNodeId
    this.targetNodeId = config.targetNodeId
    this.sourceHandle = config.sourceHandle || 'output'
    this.targetHandle = config.targetHandle || 'input'
    this.label = config.label || ''
    this.condition = config.condition
    this.style = config.style || {}
  }
}

/**
 * 流程定义类
 */
export class FlowDefinition {
  constructor(config = {}) {
    this.id = config.id || `flow_${Date.now()}`
    this.name = config.name || '流程'
    this.description = config.description || ''
    this.version = config.version || '1.0.0'
    this.nodes = (config.nodes || []).map((n) => new FlowNode(n))
    this.edges = (config.edges || []).map((e) => new FlowEdge(e))
    this.variables = config.variables || {}
    this.triggers = config.triggers || []
    this.state = config.state || 'draft'
  }

  getStartNodes() {
    return this.nodes.filter((n) => n.type === FlowNodeType.START)
  }

  getNodeById(nodeId) {
    return this.nodes.find((n) => n.id === nodeId)
  }

  getOutgoingEdges(nodeId) {
    return this.edges.filter((e) => e.sourceNodeId === nodeId)
  }

  getIncomingEdges(nodeId) {
    return this.edges.filter((e) => e.targetNodeId === nodeId)
  }

  getNextNodes(nodeId) {
    const outgoingEdges = this.getOutgoingEdges(nodeId)
    return outgoingEdges.map((edge) => this.getNodeById(edge.targetNodeId)).filter(Boolean)
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      version: this.version,
      nodes: this.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        name: n.name,
        config: n.config,
        position: n.position,
      })),
      edges: this.edges.map((e) => ({
        id: e.id,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        condition: e.condition,
      })),
      variables: this.variables,
      triggers: this.triggers,
      state: this.state,
    }
  }
}

/**
 * 流程执行实例类
 */
export class FlowInstance {
  constructor(flow, context = {}) {
    this.id = `instance_${Date.now()}`
    this.flow = flow
    this.currentState = FlowExecutionState.PENDING
    this.currentNodeId = null
    this.context = { ...context }
    this.variableValues = new Map()
    this.executionHistory = []
    this.startTime = null
    this.endTime = null
    this.error = null
  }

  setVariable(name, value) {
    this.variableValues.set(name, value)
  }

  getVariable(name) {
    return this.variableValues.get(name)
  }

  addToHistory(entry) {
    this.executionHistory.push({
      ...entry,
      timestamp: Date.now(),
    })
  }
}

/**
 * 逻辑流引擎主类
 */
class LogicFlowEngineClass extends EventEmitter {
  constructor() {
    super()
    this.flows = new Map()
    this.instances = new Map()
    this.nodeRegistry = new Map()
    this.templates = new Map()
    this.executionQueue = []
    this.isExecuting = false
  }

  /**
   * 注册流程定义
   */
  registerFlow(flowConfig) {
    const flow = new FlowDefinition(flowConfig)
    this.flows.set(flow.id, flow)
    this.emit('flow:register', { flow })
    return flow
  }

  /**
   * 获取流程定义
   */
  getFlow(flowId) {
    return this.flows.get(flowId)
  }

  /**
   * 删除流程定义
   */
  deleteFlow(flowId) {
    const flow = this.flows.get(flowId)
    if (flow) {
      this.flows.delete(flowId)
      this.emit('flow:delete', { flowId })
    }
    return flow
  }

  /**
   * 启动流程实例
   */
  async startFlow(flowId, context = {}) {
    const flow = this.flows.get(flowId)
    if (!flow) {
      throw new Error(`流程不存在：${flowId}`)
    }

    const instance = new FlowInstance(flow, context)
    instance.currentState = FlowExecutionState.RUNNING
    instance.startTime = Date.now()

    this.instances.set(instance.id, instance)
    this.emit('instance:start', { instance })

    // 从起始节点开始执行
    const startNodes = flow.getStartNodes()
    if (startNodes.length > 0) {
      instance.currentNodeId = startNodes[0].id
      await this.executeNode(instance, startNodes[0])
    }

    return instance
  }

  /**
   * 执行节点
   */
  async executeNode(instance, node) {
    try {
      instance.addToHistory({
        nodeId: node.id,
        nodeType: node.type,
        action: 'execute',
      })

      const result = await node.execute({
        ...instance.context,
        instanceId: instance.id,
      })

      instance.addToHistory({
        nodeId: node.id,
        nodeType: node.type,
        action: 'completed',
        result,
      })

      // 根据结果决定下一个节点
      await this.transitionToNextNode(instance, node, result)

      return result
    } catch (error) {
      instance.currentState = FlowExecutionState.ERROR
      instance.error = error
      this.emit('instance:error', { instance, error })
      throw error
    }
  }

  /**
   * 转移到下一个节点
   */
  async transitionToNextNode(instance, currentNode, result) {
    const { flow } = instance
    const nextNodeId = result?.nextNode

    if (nextNodeId) {
      const nextNode = flow.getNodeById(nextNodeId)
      if (nextNode) {
        instance.currentNodeId = nextNodeId
        await this.executeNode(instance, nextNode)
        return
      }
    }

    // 如果没有指定下一节点，查找所有出边
    const outgoingEdges = flow.getOutgoingEdges(currentNode.id)
    if (outgoingEdges.length > 0) {
      for (const edge of outgoingEdges) {
        const nextNode = flow.getNodeById(edge.targetNodeId)
        if (nextNode) {
          instance.currentNodeId = nextNode.id
          await this.executeNode(instance, nextNode)
          break
        }
      }
    } else {
      // 没有出边，流程结束
      instance.currentState = FlowExecutionState.COMPLETED
      instance.endTime = Date.now()
      this.emit('instance:complete', { instance })
    }
  }

  /**
   * 暂停流程实例
   */
  pauseInstance(instanceId) {
    const instance = this.instances.get(instanceId)
    if (instance) {
      instance.currentState = FlowExecutionState.PAUSED
      this.emit('instance:pause', { instanceId })
    }
  }

  /**
   * 恢复流程实例
   */
  async resumeInstance(instanceId) {
    const instance = this.instances.get(instanceId)
    if (instance && instance.currentState === FlowExecutionState.PAUSED) {
      instance.currentState = FlowExecutionState.RUNNING
      const currentNode = instance.flow.getNodeById(instance.currentNodeId)
      if (currentNode) {
        await this.executeNode(instance, currentNode)
      }
    }
  }

  /**
   * 取消流程实例
   */
  cancelInstance(instanceId) {
    const instance = this.instances.get(instanceId)
    if (instance) {
      instance.currentState = FlowExecutionState.CANCELLED
      instance.endTime = Date.now()
      this.emit('instance:cancel', { instanceId })
    }
  }

  /**
   * 获取实例状态
   */
  getInstance(instanceId) {
    return this.instances.get(instanceId)
  }

  /**
   * 获取所有实例
   */
  getAllInstances() {
    return Array.from(this.instances.values())
  }

  /**
   * 注册节点模板
   */
  registerNodeTemplate(template) {
    this.templates.set(template.id, template)
    this.emit('template:register', { template })
  }

  /**
   * 获取节点模板
   */
  getNodeTemplate(templateId) {
    return this.templates.get(templateId)
  }

  /**
   * 获取所有模板
   */
  getAllTemplates() {
    return Array.from(this.templates.values())
  }

  /**
   * 验证流程定义
   */
  validateFlow(flow) {
    const errors = []
    const warnings = []

    // 检查起始节点
    const startNodes = flow.getStartNodes()
    if (startNodes.length === 0) {
      errors.push('流程必须包含至少一个起始节点')
    } else if (startNodes.length > 1) {
      warnings.push('流程包含多个起始节点')
    }

    // 检查孤立节点
    flow.nodes.forEach((node) => {
      const isIncoming = flow.getIncomingEdges(node.id).length > 0
      const isOutgoing = flow.getOutgoingEdges(node.id).length > 0
      const isStart = node.type === FlowNodeType.START

      if (!isStart && !isIncoming) {
        warnings.push(`节点 "${node.name}" 没有输入连接`)
      }
    })

    return { errors, warnings }
  }
}

// 导出单例
export const logicFlowEngine = new LogicFlowEngineClass()

export default logicFlowEngine
