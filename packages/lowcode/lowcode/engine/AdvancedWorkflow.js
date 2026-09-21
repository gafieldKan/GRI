/**
 * 高级工作流引擎
 * 支持会签、或签、票签、子流程、超时处理、撤回/转办
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 审批类型枚举
 */
export const ApprovalType = {
  SINGLE: 'single',
  COUNTERSIGN: 'countersign',
  OR_SIGN: 'orSign',
  VOTE: 'vote',
}

/**
 * 节点处理类型
 */
export const HandleType = {
  APPROVE: 'approve',
  REJECT: 'reject',
  TRANSFER: 'transfer',
  DELEGATE: 'delegate',
  WITHDRAW: 'withdraw',
}

/**
 * 超时处理策略
 */
export const TimeoutAction = {
  AUTO_APPROVE: 'auto_approve',
  AUTO_REJECT: 'auto_reject',
  ESCALATE: 'escalate',
  NOTIFY: 'notify',
  NONE: 'none',
}

/**
 * 流程实例状态
 */
export const WorkflowInstanceState = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  TERMINATED: 'terminated',
  CANCELLED: 'cancelled',
}

/**
 * 任务状态
 */
export const TaskState = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  TRANSFERRED: 'transferred',
  DELEGATED: 'delegated',
  WITHDRAWN: 'withdrawn',
  CANCELLED: 'cancelled',
}

/**
 * 会签配置类
 */
export class CountersignConfig {
  constructor(config = {}) {
    this.type = config.type || 'all'
    this.percentage = config.percentage || 100
    this.minCount = config.minCount || 1
    this.vetoEnabled = config.vetoEnabled || false
  }

  isApproved(results) {
    const total = results.length
    const approved = results.filter((r) => r === true || r === 'approve').length
    const rejected = results.filter((r) => r === false || r === 'reject').length

    if (this.vetoEnabled && rejected > 0) return true
    if (this.type === 'all') return approved === total && rejected === 0
    if (this.type === 'percentage') return (approved / total) * 100 >= this.percentage
    if (this.type === 'number') return approved >= this.minCount
    return approved === total
  }
}

/**
 * 任务实例类
 */
export class TaskInstance {
  constructor(config = {}) {
    this.id = config.id || `task_${Date.now()}`
    this.workflowInstanceId = config.workflowInstanceId
    this.nodeId = config.nodeId
    this.nodeName = config.nodeName
    this.nodeType = config.nodeType
    this.assignee = config.assignee
    this.candidateUsers = config.candidateUsers || []
    this.candidateRoles = config.candidateRoles || []
    this.state = TaskState.PENDING
    this.approvalType = config.approvalType || ApprovalType.SINGLE
    this.countersignConfig = config.countersignConfig
    this.variables = config.variables || {}
    this.comments = config.comments || []
    this.operations = []
    this.createdAt = config.createdAt || Date.now()
    this.dueAt = config.dueAt || null
    this.startedAt = null
    this.completedAt = null
    this.priority = config.priority || 'normal'
    this.parentTaskId = config.parentTaskId || null
  }

  addOperation(operation) {
    this.operations.push({
      type: operation.type,
      operator: operation.operator,
      comment: operation.comment,
      timestamp: Date.now(),
      ...operation,
    })
  }

  addComment(comment, user) {
    this.comments.push({ content: comment, user, timestamp: Date.now() })
  }
}

/**
 * 工作流实例类
 */
export class WorkflowInstance {
  constructor(config = {}) {
    this.id = config.id || `wf_inst_${Date.now()}`
    this.workflowId = config.workflowId
    this.workflowName = config.workflowName
    this.state = WorkflowInstanceState.PENDING
    this.businessKey = config.businessKey
    this.starter = config.starter
    this.variables = config.variables || {}
    this.tasks = new Map()
    this.taskResults = new Map()
    this.currentNodeIds = []
    this.history = []
    this.parentInstanceId = config.parentInstanceId || null
    this.subInstanceIds = []
    this.createdAt = config.createdAt || Date.now()
    this.startedAt = null
    this.completedAt = null
  }

  addTask(task) {
    this.tasks.set(task.id, task)
  }

  getTask(taskId) {
    return this.tasks.get(taskId)
  }

  getTasksByNode(nodeId) {
    return Array.from(this.tasks.values()).filter((t) => t.nodeId === nodeId)
  }

  recordTaskResult(nodeId, result) {
    if (!this.taskResults.has(nodeId)) {
      this.taskResults.set(nodeId, [])
    }
    this.taskResults.get(nodeId).push(result)
  }

  getNodeTaskResults(nodeId) {
    return this.taskResults.get(nodeId) || []
  }

  addToHistory(entry) {
    this.history.push({ timestamp: Date.now(), ...entry })
  }
}

/**
 * 高级工作流引擎主类
 */
class AdvancedWorkflowEngineClass extends EventEmitter {
  constructor() {
    super()
    this.instances = new Map()
    this.taskQueue = []
    this.timeoutTimers = new Map()
    this.nodeHandlers = new Map()
    this.workflows = new Map()
    this.subInstanceCache = new Map()
    this.#registerNodeHandlers()
  }

  #registerNodeHandlers() {
    this.nodeHandlers.set('approval', {
      execute: async (instance, node, context) => this.handleApprovalNode(instance, node, context),
    })
    this.nodeHandlers.set('condition', {
      execute: async (instance, node, context) => this.handleConditionNode(instance, node, context),
    })
    this.nodeHandlers.set('subflow', {
      execute: async (instance, node, context) => this.handleSubflowNode(instance, node, context),
    })
    this.nodeHandlers.set('script', {
      execute: async (instance, node, context) => this.handleScriptNode(instance, node, context),
    })
  }

  registerWorkflow(workflow) {
    this.workflows.set(workflow.id, workflow)
    this.emit('workflow:register', { workflow })
    return workflow
  }

  getWorkflow(workflowId) {
    return this.workflows.get(workflowId)
  }

  async startWorkflow(workflowId, context = {}) {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) throw new Error(`工作流不存在：${workflowId}`)

    const instance = new WorkflowInstance({
      workflowId,
      workflowName: workflow.name,
      businessKey: context.businessKey,
      starter: context.starter || 'system',
      variables: context.variables || {},
    })

    instance.state = WorkflowInstanceState.RUNNING
    instance.startedAt = Date.now()
    this.instances.set(instance.id, instance)
    this.emit('workflow:start', { instance })

    const startNodes = workflow.nodes?.filter((n) => n.type === 'start') || []
    if (startNodes.length > 0) {
      await this.executeNode(instance, startNodes[0], context)
    }

    return instance
  }

  async executeNode(instance, node, context) {
    const handler = this.nodeHandlers.get(node.type)
    instance.addToHistory({ nodeId: node.id, nodeType: node.type, action: 'execute' })

    if (handler?.execute) {
      try {
        const result = await handler.execute.call(this, instance, node, context)
        instance.addToHistory({ nodeId: node.id, nodeType: node.type, action: 'completed', result })
        return result
      } catch (error) {
        instance.addToHistory({
          nodeId: node.id,
          nodeType: node.type,
          action: 'error',
          error: error.message,
        })
        this.emit('workflow:error', { instance, node, error })
        throw error
      }
    }
    return { status: 'completed', node: node.id }
  }

  async handleApprovalNode(instance, node, context) {
    const {
      approvalType = ApprovalType.SINGLE,
      assignee,
      candidateUsers = [],
      candidateRoles = [],
    } = node.config || {}
    const task = new TaskInstance({
      workflowInstanceId: instance.id,
      nodeId: node.id,
      nodeName: node.name,
      nodeType: 'approval',
      assignee: typeof assignee === 'string' ? assignee : assignee?.id,
      candidateUsers,
      candidateRoles,
      approvalType,
    })
    instance.addTask(task)
    this.emit('task:created', { task, instance })
    return { status: 'waiting', node: node.id, taskId: task.id }
  }

  async handleConditionNode(instance, node, context) {
    const { conditions = [], branches = [] } = node.config || {}
    for (const condition of conditions) {
      try {
        const result = this.evaluateCondition(condition, context)
        if (result) {
          const branch = branches.find((b) => b.conditionId === condition.id)
          return { status: 'completed', node: node.id, nextNode: branch?.nextNode, result: true }
        }
      } catch (error) {
        return { status: 'error', node: node.id, error: error.message }
      }
    }
    const defaultBranch = branches.find((b) => b.isDefault)
    return { status: 'completed', node: node.id, nextNode: defaultBranch?.nextNode, result: false }
  }

  async handleSubflowNode(instance, node, context) {
    const { subFlowId, params = {}, syncMode = true } = node.config || {}
    const subInstance = await this.startWorkflow(subFlowId, {
      ...context,
      variables: { ...params, parentInstanceId: instance.id },
    })
    instance.subInstanceIds.push(subInstance.id)
    this.subInstanceCache.set(subInstance.id, { parentInstanceId: instance.id, nodeId: node.id })
    return syncMode
      ? { status: 'waiting', node: node.id, subInstanceId: subInstance.id }
      : { status: 'completed', node: node.id, subInstanceId: subInstance.id }
  }

  async handleScriptNode(instance, node, context) {
    const { script, scriptType = 'javascript' } = node.config || {}
    try {
      const result =
        scriptType === 'javascript'
          ? await new Function('context', `(async () => { ${script} })()`)(context)
          : { raw: script }
      return { status: 'completed', node: node.id, result }
    } catch (error) {
      return { status: 'error', node: node.id, error: error.message }
    }
  }

  evaluateCondition(condition, context) {
    const { operator, field, value, valueType = 'static' } = condition
    let contextValue =
      valueType === 'variable' ? this.getVariableValue(field, context) : context[field]
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
        return !contextValue
      case 'notEmpty':
        return !!contextValue
      default:
        return false
    }
  }

  getVariableValue(path, context) {
    return path.split('.').reduce((obj, key) => obj?.[key], context)
  }

  async approveTask(instanceId, taskId, userId, comment = '') {
    const instance = this.instances.get(instanceId)
    if (!instance) throw new Error(`实例不存在：${instanceId}`)
    const task = instance.getTask(taskId)
    if (!task) throw new Error(`任务不存在：${taskId}`)

    task.state = TaskState.COMPLETED
    task.addOperation({ type: HandleType.APPROVE, operator: userId, comment })
    instance.recordTaskResult(task.nodeId, 'approve')

    const workflow = this.workflows.get(instance.workflowId)
    const node = workflow?.nodes?.find((n) => n.id === task.nodeId)
    const nodeResults = instance.getNodeTaskResults(task.nodeId)

    if (node?.config?.approvalType === ApprovalType.COUNTERSIGN) {
      const config = new CountersignConfig(node.config.countersignConfig)
      if (config.isApproved(nodeResults)) {
        return { status: 'completed', nextNode: this.getNextNode(workflow, task.nodeId) }
      }
    }
    return { status: 'waiting' }
  }

  getNextNode(workflow, nodeId) {
    const edges = workflow?.edges?.filter((e) => e.sourceNodeId === nodeId) || []
    return edges.length > 0 ? workflow.nodes?.find((n) => n.id === edges[0].targetNodeId) : null
  }

  async withdrawTask(instanceId, taskId, userId) {
    const instance = this.instances.get(instanceId)
    if (!instance) throw new Error(`实例不存在：${instanceId}`)
    const task = instance.getTask(taskId)
    if (!task) throw new Error(`任务不存在：${taskId}`)
    task.state = TaskState.WITHDRAWN
    task.addOperation({ type: HandleType.WITHDRAW, operator: userId, comment: '撤回' })
    this.emit('task:withdrawn', { instance, task })
    return { status: 'withdrawn' }
  }

  async transferTask(instanceId, taskId, userId, toUserId) {
    const instance = this.instances.get(instanceId)
    if (!instance) throw new Error(`实例不存在：${instanceId}`)
    const task = instance.getTask(taskId)
    if (!task) throw new Error(`任务不存在：${taskId}`)
    task.state = TaskState.TRANSFERRED
    task.assignee = toUserId
    task.addOperation({ type: HandleType.TRANSFER, operator: userId, toUserId })
    this.emit('task:transferred', { instance, task })
    return { status: 'transferred', assignee: toUserId }
  }

  getInstance(instanceId) {
    return this.instances.get(instanceId)
  }

  getAllInstances() {
    return Array.from(this.instances.values())
  }

  cancelInstance(instanceId) {
    const instance = this.instances.get(instanceId)
    if (instance) {
      instance.state = WorkflowInstanceState.CANCELLED
      instance.completedAt = Date.now()
      this.emit('workflow:cancel', { instanceId })
    }
    return instance
  }
}

// 导出单例
export const advancedWorkflowEngine = new AdvancedWorkflowEngineClass()
export default advancedWorkflowEngine
