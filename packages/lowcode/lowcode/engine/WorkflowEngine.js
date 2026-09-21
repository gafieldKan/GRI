/**
 * 工作流引擎
 * 提供工作流定义、执行和状态管理
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 工作流节点类型
 */
export const NodeType = {
  START: 'start',
  END: 'end',
  APPROVAL: 'approval',
  CONDITION: 'condition',
  SCRIPT: 'script',
  NOTIFICATION: 'notification',
}

/**
 * 工作流状态
 */
export const WorkflowState = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
}

/**
 * 工作流实例状态
 */
export const InstanceState = {
  PENDING: 'pending',
  RUNNING: 'running',
  WAITING: 'waiting',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ERROR: 'error',
}

/**
 * 工作流节点类
 */
export class WorkflowNode {
  constructor(config) {
    this.id = config.id || ''
    this.name = config.name || ''
    this.type = config.type || 'start'
    this.config = config.config || {}
    this.assignee = config.assignee || null
    this.actions = config.actions || []
  }

  /**
   * 执行节点
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 执行结果
   */
  async execute(context) {
    switch (this.type) {
      case 'start':
        return this.handleStart(context)
      case 'approval':
        return this.handleApproval(context)
      case 'condition':
        return this.handleCondition(context)
      case 'script':
        return this.handleScript(context)
      case 'notification':
        return this.handleNotification(context)
      case 'end':
        return this.handleEnd(context)
      default:
        throw new Error(`未知的节点类型：${this.type}`)
    }
  }

  handleStart(context) {
    return { status: 'completed', node: this.id }
  }

  handleApproval(context) {
    return { status: 'waiting', node: this.id, assignee: this.assignee }
  }

  handleCondition(context) {
    const { condition, branches } = this.config
    try {
      const result = eval(condition)
      const nextNode = branches.find((b) => b.value === result)
      return { status: 'completed', node: this.id, nextNode: nextNode?.to }
    } catch (error) {
      return { status: 'error', node: this.id, error: error.message }
    }
  }

  handleScript(context) {
    const { script } = this.config
    try {
      const result = script(context)
      return { status: 'completed', node: this.id, result }
    } catch (error) {
      return { status: 'error', node: this.id, error: error.message }
    }
  }

  handleNotification(context) {
    const { message, recipients } = this.config
    console.log(`[Notification] ${message}`, { recipients, context })
    return { status: 'completed', node: this.id }
  }

  handleEnd(context) {
    return { status: 'completed', node: this.id, output: context }
  }
}

/**
 * 工作流类
 */
export class Workflow {
  constructor(config) {
    this.id = config.id || ''
    this.name = config.name || ''
    this.description = config.description || ''
    this.nodes = (config.nodes || []).map((n) => new WorkflowNode(n))
    this.transitions = config.transitions || []
    this.state = config.state || WorkflowState.DRAFT
    this.variables = config.variables || {}
  }

  /**
   * 获取起始节点
   */
  getStartNode() {
    return this.nodes.find((n) => n.type === 'start')
  }

  /**
   * 获取下一节点
   * @param {string} currentNodeId - 当前节点 ID
   * @returns {WorkflowNode|null}
   */
  getNextNode(currentNodeId) {
    const transition = this.transitions.find((t) => t.from === currentNodeId)
    if (!transition) return null

    const nextNode = this.nodes.find((n) => n.id === transition.to)
    return nextNode || null
  }

  /**
   * 序列化工作流
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      nodes: this.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        config: n.config,
        assignee: n.assignee,
        actions: n.actions,
      })),
      transitions: this.transitions,
      state: this.state,
      variables: this.variables,
    }
  }
}

/**
 * 工作流引擎类
 */
class WorkflowEngineClass extends EventEmitter {
  constructor() {
    super()
    this.workflows = new Map()
    this.instances = new Map()
    this.templates = {}
    this.#initTemplates()
  }

  /**
   * 初始化内置模板
   */
  #initTemplates() {
    // 简单审批流
    this.templates.simpleApproval = {
      id: 'simple_approval',
      name: '简单审批流程',
      nodes: [
        { id: 'start', name: '开始', type: 'start' },
        { id: 'approval', name: '审批', type: 'approval', assignee: 'manager' },
        { id: 'end', name: '结束', type: 'end' },
      ],
      transitions: [
        { from: 'start', to: 'approval' },
        { from: 'approval', to: 'end', condition: 'approved === true' },
      ],
    }

    // 多级审批流
    this.templates.multiLevelApproval = {
      id: 'multi_level_approval',
      name: '多级审批流程',
      nodes: [
        { id: 'start', name: '开始', type: 'start' },
        { id: 'dept_approval', name: '部门审批', type: 'approval', assignee: 'dept_manager' },
        { id: 'final_approval', name: '最终审批', type: 'approval', assignee: 'final_approver' },
        { id: 'end', name: '结束', type: 'end' },
      ],
      transitions: [
        { from: 'start', to: 'dept_approval' },
        { from: 'dept_approval', to: 'final_approval', condition: 'approved === true' },
        { from: 'final_approval', to: 'end', condition: 'approved === true' },
      ],
    }
  }

  /**
   * 注册工作流
   * @param {Object} config - 工作流配置
   * @returns {Workflow}
   */
  registerWorkflow(config) {
    const workflow = new Workflow(config)
    this.workflows.set(workflow.id, workflow)
    this.emit('workflow:register', { workflow })
    return workflow
  }

  /**
   * 获取工作流
   * @param {string} id - 工作流 ID
   * @returns {Workflow|undefined}
   */
  getWorkflow(id) {
    return this.workflows.get(id)
  }

  /**
   * 启动工作流实例
   * @param {string} workflowId - 工作流 ID
   * @param {Object} context - 上下文
   * @returns {Object} 实例信息
   */
  async startInstance(workflowId, context = {}) {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) {
      throw new Error(`工作流不存在：${workflowId}`)
    }

    const instanceId = `wf_${Date.now()}`
    const startNode = workflow.getStartNode()

    this.instances.set(instanceId, {
      id: instanceId,
      workflowId,
      currentState: InstanceState.RUNNING,
      currentNode: startNode?.id || null,
      context,
      history: [],
      createdAt: Date.now(),
    })

    this.emit('instance:start', { instanceId, workflowId, context })

    // 执行第一个节点
    if (startNode) {
      return this.executeNode(instanceId, startNode.id, context)
    }

    return { instanceId, status: 'completed' }
  }

  /**
   * 执行节点
   * @param {string} instanceId - 实例 ID
   * @param {string} nodeId - 节点 ID
   * @param {Object} context - 上下文
   * @returns {Promise<Object>}
   */
  async executeNode(instanceId, nodeId, context = {}) {
    const instance = this.instances.get(instanceId)
    if (!instance) {
      throw new Error(`实例不存在：${instanceId}`)
    }

    const workflow = this.workflows.get(instance.workflowId)
    if (!workflow) {
      throw new Error(`工作流不存在：${instance.workflowId}`)
    }

    const node = workflow.nodes.find((n) => n.id === nodeId)
    if (!node) {
      throw new Error(`节点不存在：${nodeId}`)
    }

    try {
      const result = await node.execute({ ...context, ...instance.context })

      // 记录历史
      instance.history.push({
        nodeId,
        nodeName: node.name,
        nodeType: node.type,
        result,
        timestamp: Date.now(),
      })

      // 查找下一节点
      const transition = workflow.transitions.find((t) => t.from === nodeId)
      if (transition && transition.to) {
        instance.currentNode = transition.to
        instance.context = { ...instance.context, ...context }

        // 如果是结束节点，更新实例状态
        const nextNode = workflow.nodes.find((n) => n.id === transition.to)
        if (nextNode?.type === 'end') {
          instance.currentState = InstanceState.COMPLETED
          this.emit('instance:complete', { instanceId, result })
        }

        return {
          status: result.status,
          instanceId,
          currentNode: nodeId,
          nextNode: transition.to,
          result,
        }
      }

      return {
        status: result.status,
        instanceId,
        currentNode: nodeId,
        result,
      }
    } catch (error) {
      instance.currentState = InstanceState.ERROR
      this.emit('instance:error', { instanceId, error })
      throw error
    }
  }

  /**
   * 获取实例状态
   * @param {string} instanceId - 实例 ID
   * @returns {Object|undefined}
   */
  getInstance(instanceId) {
    return this.instances.get(instanceId)
  }

  /**
   * 取消实例
   * @param {string} instanceId - 实例 ID
   * @returns {boolean}
   */
  cancelInstance(instanceId) {
    const instance = this.instances.get(instanceId)
    if (!instance) {
      return false
    }

    instance.currentState = InstanceState.CANCELLED
    this.emit('instance:cancel', { instanceId })
    return true
  }

  /**
   * 获取所有工作流
   * @returns {Array}
   */
  getAllWorkflows() {
    return Array.from(this.workflows.values())
  }

  /**
   * 获取所有实例
   * @returns {Array}
   */
  getAllInstances() {
    return Array.from(this.instances.values())
  }

  /**
   * 获取内置模板
   * @returns {Object}
   */
  getTemplates() {
    return { ...this.templates }
  }
}

// 导出单例
export const workflowEngine = new WorkflowEngineClass()

export default workflowEngine
