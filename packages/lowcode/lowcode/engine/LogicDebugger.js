/**
 * 逻辑调试器
 * 为逻辑编排器提供调试与断点功能
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 断点状态枚举
 */
export const BreakpointStatus = {
  ACTIVE: 'active',
  HIT: 'hit',
  DISABLED: 'disabled',
}

/**
 * 执行状态枚举
 */
export const ExecutionStatus = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  ERROR: 'error',
}

/**
 * 断点类
 */
export class Breakpoint {
  constructor(config = {}) {
    this.id = config.id || `bp_${Date.now()}`
    this.nodeId = config.nodeId
    this.flowId = config.flowId
    this.condition = config.condition || null
    this.hitCount = 0
    this.status = BreakpointStatus.ACTIVE
    this.createdAt = config.createdAt || Date.now()
  }

  toJSON() {
    return {
      id: this.id,
      nodeId: this.nodeId,
      flowId: this.flowId,
      condition: this.condition,
      hitCount: this.hitCount,
      status: this.status,
      createdAt: this.createdAt,
    }
  }
}

/**
 * 执行上下文类
 */
export class ExecutionContext {
  constructor(config = {}) {
    this.executionId = config.executionId || `exec_${Date.now()}`
    this.flowId = config.flowId
    this.variables = config.variables || {}
    this.currentNodeId = null
    this.history = []
    this.startTime = Date.now()
    this.status = ExecutionStatus.IDLE
  }

  setVariable(name, value) {
    this.variables[name] = value
  }

  getVariable(name) {
    return this.variables[name]
  }

  addToHistory(action, data) {
    this.history.push({
      action,
      data,
      timestamp: Date.now(),
    })
  }

  toJSON() {
    return {
      executionId: this.executionId,
      flowId: this.flowId,
      variables: this.variables,
      currentNodeId: this.currentNodeId,
      history: this.history,
      startTime: this.startTime,
      status: this.status,
    }
  }
}

/**
 * 逻辑调试器主类
 */
class LogicDebuggerClass extends EventEmitter {
  constructor() {
    super()
    this.breakpoints = new Map()
    this.executions = new Map()
    this.currentExecution = null
    this.status = ExecutionStatus.IDLE
    this.stepMode = false
    this.stepOver = false
    this.pauseOnNext = false
  }

  /**
   * 添加断点
   */
  addBreakpoint(nodeId, flowId, options = {}) {
    const breakpoint = new Breakpoint({
      nodeId,
      flowId,
      condition: options.condition,
    })

    this.breakpoints.set(breakpoint.id, breakpoint)
    this.emit('breakpoint:add', breakpoint)

    return breakpoint
  }

  /**
   * 移除断点
   */
  removeBreakpoint(breakpointId) {
    const breakpoint = this.breakpoints.get(breakpointId)
    if (breakpoint) {
      this.breakpoints.delete(breakpointId)
      this.emit('breakpoint:remove', breakpoint)
    }
    return breakpoint
  }

  /**
   * 切换断点状态
   */
  toggleBreakpoint(breakpointId) {
    const breakpoint = this.breakpoints.get(breakpointId)
    if (breakpoint) {
      breakpoint.status =
        breakpoint.status === BreakpointStatus.ACTIVE
          ? BreakpointStatus.DISABLED
          : BreakpointStatus.ACTIVE
      this.emit('breakpoint:toggle', breakpoint)
    }
  }

  /**
   * 获取所有断点
   */
  getBreakpoints() {
    return Array.from(this.breakpoints.values())
  }

  /**
   * 清除所有断点
   */
  clearBreakpoints() {
    this.breakpoints.clear()
    this.emit('breakpoint:clear')
  }

  /**
   * 开始调试
   */
  startDebug(flowId, initialData = {}) {
    if (this.status === ExecutionStatus.RUNNING) {
      throw new Error('已有流程在运行中')
    }

    const context = new ExecutionContext({
      flowId,
      variables: initialData,
    })

    this.currentExecution = context
    this.executions.set(context.executionId, context)
    this.status = ExecutionStatus.RUNNING
    this.stepMode = false
    this.pauseOnNext = false

    this.emit('start', { flowId, context })
    return context
  }

  /**
   * 检查断点
   */
  async checkBreakpoint(nodeId, flowId, context) {
    // 检查是否需要暂停
    if (this.pauseOnNext) {
      this.pauseOnNext = false
      await this.#pauseExecution('step')
      return
    }

    // 检查节点断点
    for (const breakpoint of this.breakpoints.values()) {
      if (
        breakpoint.status === BreakpointStatus.ACTIVE &&
        breakpoint.nodeId === nodeId &&
        breakpoint.flowId === flowId
      ) {
        breakpoint.hitCount++
        breakpoint.status = BreakpointStatus.HIT

        // 检查条件
        if (breakpoint.condition) {
          try {
            const result = new Function('context', `return ${breakpoint.condition}`)(context)
            if (result) {
              await this.#pauseExecution('breakpoint', breakpoint)
            }
          } catch (e) {
            console.warn('断点条件执行失败:', e)
          }
        } else {
          await this.#pauseExecution('breakpoint', breakpoint)
        }

        this.emit('breakpoint:hit', { breakpoint, context })
        break
      }
    }
  }

  /**
   * 暂停执行
   */
  async #pauseExecution(reason, data) {
    this.status = ExecutionStatus.PAUSED
    this.emit('pause', { reason, data, context: this.currentExecution })

    // 等待继续
    return new Promise((resolve) => {
      this.once('resume', () => {
        this.status = ExecutionStatus.RUNNING
        resolve()
      })
    })
  }

  /**
   * 继续执行
   */
  resume() {
    if (this.status === ExecutionStatus.PAUSED) {
      this.stepMode = false
      this.emit('resume')
    }
  }

  /**
   * 单步跳过
   */
  stepOver() {
    if (this.status === ExecutionStatus.PAUSED) {
      this.stepMode = false
      this.pauseOnNext = true
      this.emit('resume')
    }
  }

  /**
   * 单步进入
   */
  stepInto() {
    if (this.status === ExecutionStatus.PAUSED) {
      this.stepMode = true
      this.emit('resume')
    }
  }

  /**
   * 单步跳出
   */
  stepOut() {
    if (this.status === ExecutionStatus.PAUSED) {
      // TODO: 实现跳出逻辑
      this.emit('resume')
    }
  }

  /**
   * 停止调试
   */
  stop() {
    if (this.currentExecution) {
      this.currentExecution.status = ExecutionStatus.STOPPED
      this.emit('stop', this.currentExecution)
    }
    this.status = ExecutionStatus.IDLE
    this.currentExecution = null
    this.stepMode = false
    this.pauseOnNext = false
  }

  /**
   * 获取当前执行上下文
   */
  getCurrentContext() {
    return this.currentExecution
  }

  /**
   * 获取变量值
   */
  getVariable(name) {
    return this.currentExecution?.variables[name]
  }

  /**
   * 设置变量值
   */
  setVariable(name, value) {
    if (this.currentExecution) {
      this.currentExecution.variables[name] = value
      this.emit('variable:change', { name, value })
    }
  }

  /**
   * 获取执行历史
   */
  getHistory() {
    return this.currentExecution?.history || []
  }

  /**
   * 获取所有执行记录
   */
  getExecutions() {
    return Array.from(this.executions.values())
  }

  /**
   * 清除执行记录
   */
  clearExecutions() {
    this.executions.clear()
  }
}

/**
 * 调试工具类 - 用于在逻辑引擎中调用
 */
export class DebugUtils {
  constructor(debuggerInstance) {
    this.debugger = debuggerInstance
  }

  /**
   * 检查是否应该暂停
   */
  async shouldPause(nodeId, flowId, context) {
    await this.debugger.checkBreakpoint(nodeId, flowId, context)
  }

  /**
   * 记录执行日志
   */
  log(message, data) {
    this.debugger.emit('log', { message, data, timestamp: Date.now() })
  }
}

// 导出单例
export const logicDebugger = new LogicDebuggerClass()
export default logicDebugger
