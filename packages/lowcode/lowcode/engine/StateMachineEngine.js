/**
 * 状态机引擎
 * 支持订单状态流转、审批流等工作流场景
 * 基于状态模式实现
 *
 * 增强特性：
 * - 动态配置状态图
 * - 状态转换拦截器
 * - 与 Repository 集成实现自动持久化
 */

import { EventEmitter } from 'events'

/**
 * 状态机类
 */
export class StateMachine {
  constructor(config) {
    this.id = config.id
    this.name = config.name
    this.states = config.states || {}
    this.transitions = config.transitions || []
    this.currentState = config.initial
    this.context = config.context || {}
    this.timeouts = config.timeouts || {}
    this.timeoutTimers = new Map()
    this.interceptors = {
      beforeTransition: [],
      afterTransition: [],
    }

    // 状态变更回调
    this.onStateChange = config.onStateChange || (() => {})
    this.onEnter = config.onEnter || {}
    this.onExit = config.onExit || {}
  }

  /**
   * 添加状态转换拦截器
   * @param {'beforeTransition' | 'afterTransition'} type - 拦截器类型
   * @param {Function} callback - 拦截器回调
   */
  addInterceptor(type, callback) {
    if (type === 'beforeTransition' || type === 'afterTransition') {
      this.interceptors[type].push(callback)
    }
  }

  /**
   * 移除拦截器
   * @param {'beforeTransition' | 'afterTransition'} type - 拦截器类型
   * @param {Function} callback - 要移除的回调
   */
  removeInterceptor(type, callback) {
    if (type === 'beforeTransition' || type === 'afterTransition') {
      this.interceptors[type] = this.interceptors[type].filter((cb) => cb !== callback)
    }
  }

  /**
   * 获取当前状态
   */
  getState() {
    return this.currentState
  }

  /**
   * 获取所有状态定义
   */
  getStates() {
    return Object.keys(this.states)
  }

  /**
   * 检查是否可以转换到目标状态
   */
  canTransitionTo(targetState) {
    const allowedTransitions = this.states[this.currentState]?.transitions || []
    return allowedTransitions.includes(targetState)
  }

  /**
   * 执行状态转换
   * @param {string} targetState - 目标状态
   * @param {Object} context - 上下文
   * @param {Object} options - 可选项 { skipInterceptors, skipValidation }
   * @returns {Promise<Object>} 状态转换结果
   */
  async transition(targetState, context = {}, options = {}) {
    const currentState = this.currentState
    const { skipInterceptors = false, skipValidation = false } = options

    // 检查是否允许转换
    if (!skipValidation && !this.canTransitionTo(targetState)) {
      throw new Error(`不允许的状态转换：${currentState} -> ${targetState}`)
    }

    // 执行 beforeTransition 拦截器
    if (!skipInterceptors) {
      for (const interceptor of this.interceptors.beforeTransition) {
        const shouldContinue = await interceptor({
          from: currentState,
          to: targetState,
          context: this.context,
          stateMachine: this,
        })
        if (shouldContinue === false) {
          throw new Error(`状态转换被拦截器阻止：${currentState} -> ${targetState}`)
        }
      }
    }

    // 检查状态配置中的条件（如果配置了条件函数）
    if (!skipValidation && this.states[targetState]?.condition) {
      const conditionFn = this.states[targetState].condition
      const conditionResult = conditionFn({ ...this.context, ...context })
      if (!conditionResult) {
        throw new Error(`状态 ${targetState} 的转换条件不满足`)
      }
    }

    // 执行退出前钩子
    if (this.onExit[currentState]) {
      await this.onExit[currentState](this.context, context)
    }

    // 更新状态
    this.currentState = targetState
    this.context = { ...this.context, ...context }

    // 执行进入后钩子
    if (this.onEnter[targetState]) {
      await this.onEnter[targetState](this.context, context)
    }

    // 状态变更回调
    this.onStateChange(currentState, targetState, this.context)

    // 设置超时监听
    this.setupTimeout(targetState)

    const result = {
      from: currentState,
      to: targetState,
      context: this.context,
    }

    // 执行 afterTransition 拦截器
    if (!skipInterceptors) {
      for (const interceptor of this.interceptors.afterTransition) {
        await interceptor(result)
      }
    }

    return result
  }

  /**
   * 设置状态超时
   */
  setupTimeout(state) {
    // 清除之前的定时器
    if (this.timeoutTimers.has(state)) {
      clearTimeout(this.timeoutTimers.get(state))
    }

    const timeoutConfig = this.timeouts[state]
    if (timeoutConfig) {
      const { timeout, onTimeout, nextState } = timeoutConfig
      if (timeout && nextState) {
        this.timeoutTimers.set(
          state,
          setTimeout(() => {
            onTimeout?.(this.context)
            this.transition(nextState)
          }, timeout)
        )
      }
    }
  }

  /**
   * 重置状态机
   */
  reset() {
    this.currentState = Object.keys(this.states)[0]
    this.context = {}
    this.timeoutTimers.forEach((timer) => clearTimeout(timer))
    this.timeoutTimers.clear()
  }

  /**
   * 获取状态图信息
   */
  getDiagram() {
    return {
      id: this.id,
      name: this.name,
      states: Object.keys(this.states),
      transitions: this.transitions,
      currentState: this.currentState,
    }
  }
}

/**
 * 状态机引擎管理类
 *
 * 支持:
 * - 动态注册状态机类型
 * - 状态持久化 (通过 Repository)
 * - 条件转换
 */
class StateMachineEngineClass extends EventEmitter {
  constructor() {
    super()
    this.machines = new Map()
    this.registeredTypes = new Map()
    this.repository = null // 用于持久化的 Repository
  }

  /**
   * 设置持久化 Repository
   * @param {Object} repository - Repository 实例
   */
  setRepository(repository) {
    this.repository = repository
  }

  /**
   * 注册状态机类型
   * @param {string} type - 类型名称
   * @param {Object} config - 配置
   */
  registerType(type, config) {
    this.registeredTypes.set(type, {
      name: config.name,
      description: config.description,
      states: config.states,
      transitions: config.transitions,
      timeouts: config.timeouts,
      persist: config.persist ?? false, // 是否持久化状态
      entityModel: config.entityModel, // 关联的实体模型
    })
  }

  /**
   * 创建状态机实例
   * @param {string} type - 类型
   * @param {Object} initialContext - 初始上下文
   * @param {Object} options - 可选项
   * @returns {StateMachine}
   */
  create(type, initialContext = {}, options = {}) {
    const typeConfig = this.registeredTypes.get(type)
    if (!typeConfig) {
      throw new Error(`未注册的状态机类型：${type}`)
    }

    const machine = new StateMachine({
      id: options.id || `${type}_${Date.now()}`,
      name: typeConfig.name,
      states: typeConfig.states,
      transitions: typeConfig.transitions,
      initial: options.initialState || Object.keys(typeConfig.states)[0],
      context: initialContext,
      timeouts: typeConfig.timeouts,
      onStateChange: (from, to, context) => {
        this.emit('stateChange', {
          machineId: machine.id,
          type,
          from,
          to,
          context,
        })

        // 如果配置了持久化，自动保存状态
        if (typeConfig.persist && this.repository && context.entityId) {
          this.repository.updateState(context.entityId, to).catch((err) => {
            console.error('状态持久化失败:', err)
          })
        }
      },
    })

    this.machines.set(machine.id, machine)
    return machine
  }

  /**
   * 获取状态机实例
   */
  getMachine(machineId) {
    return this.machines.get(machineId)
  }

  /**
   * 删除状态机
   */
  deleteMachine(machineId) {
    const machine = this.machines.get(machineId)
    if (machine) {
      machine.reset()
      this.machines.delete(machineId)
      return true
    }
    return false
  }

  /**
   * 触发事件
   */
  trigger(machineId, event, context = {}) {
    const machine = this.machines.get(machineId)
    if (!machine) {
      throw new Error(`状态机不存在：${machineId}`)
    }

    const currentState = machine.getState()
    const stateConfig = machine.states[currentState]

    // 查找匹配的事件
    const eventConfig = stateConfig.events?.[event]
    if (!eventConfig) {
      throw new Error(`状态 ${currentState} 下事件 ${event} 不存在`)
    }

    // 执行转换
    return machine.transition(eventConfig.target, context)
  }

  /**
   * 从配置动态创建状态机
   * @param {Object} config - 状态机配置
   * @returns {StateMachine}
   */
  createFromConfig(config) {
    const machine = new StateMachine({
      id: config.id || `sm_${Date.now()}`,
      name: config.name || '状态机',
      states: config.states,
      transitions: config.transitions || [],
      initial: config.initialState || Object.keys(config.states)[0],
      context: config.context || {},
      timeouts: config.timeouts || {},
      onStateChange: (from, to, context) => {
        this.emit('stateChange', {
          machineId: machine.id,
          from,
          to,
          context,
        })
      },
    })

    this.machines.set(machine.id, machine)
    return machine
  }

  /**
   * 获取所有状态机类型
   */
  getRegisteredTypes() {
    return Array.from(this.registeredTypes.entries())
  }

  /**
   * 获取所有状态机实例
   */
  getAllMachines() {
    return Array.from(this.machines.values())
  }
}

// 导出单例
export const stateMachineEngine = new StateMachineEngineClass()
export default stateMachineEngine

/**
 * 预定义的状态机配置
 */
export const OrderStateMachine = {
  name: '订单状态机',
  description: '用于订单状态流转管理',
  states: {
    pending_payment: {
      name: '待支付',
      transitions: ['paid', 'cancelled'],
    },
    paid: {
      name: '已支付',
      transitions: ['confirmed', 'cancelled', 'refunded'],
    },
    confirmed: {
      name: '已确认',
      transitions: ['cooking', 'cancelled'],
    },
    cooking: {
      name: '制作中',
      transitions: ['ready', 'cancelled'],
    },
    ready: {
      name: '待配送',
      transitions: ['delivering', 'cancelled'],
    },
    delivering: {
      name: '配送中',
      transitions: ['completed', 'cancelled'],
    },
    completed: {
      name: '已完成',
      transitions: ['refunded'],
    },
    cancelled: {
      name: '已取消',
      transitions: [],
    },
    refunded: {
      name: '已退款',
      transitions: [],
    },
  },
  timeouts: {
    pending_payment: {
      timeout: 900000, // 15 分钟
      nextState: 'cancelled',
      onTimeout: (context) => {
        console.log('订单超时未支付，自动取消:', context.orderId)
      },
    },
  },
}

/**
 * 审批流状态机配置
 */
export const ApprovalStateMachine = {
  name: '审批状态机',
  description: '用于多级审批流程',
  states: {
    draft: {
      name: '草稿',
      transitions: ['submitted'],
    },
    pending_approval: {
      name: '待审批',
      transitions: ['approved', 'rejected', 'returned'],
    },
    approved: {
      name: '已通过',
      transitions: [],
    },
    rejected: {
      name: '已拒绝',
      transitions: ['resubmitted'],
    },
    returned: {
      name: '已退回',
      transitions: ['resubmitted'],
    },
    resubmitted: {
      name: '重新提交',
      transitions: ['pending_approval'],
    },
  },
}
