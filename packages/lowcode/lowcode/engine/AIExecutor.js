/**
 * AI 执行管理器
 * 统一管理多种 AI 执行引擎（LLM API / Claude Code CLI）
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'
import { claudeCodeAdapter } from './ClaudeCodeAdapter.js'
import { aiAssistant } from './AIAssistant.js'

/**
 * 执行引擎枚举
 */
export const AIEngine = {
  LLM_API: 'llm_api', // 云端 LLM API
  CLAUDE_CODE: 'claude_code', // Claude Code CLI
  LOCAL_LLM: 'local_llm', // 本地私有模型
}

/**
 * 执行任务类
 */
export class AITask {
  constructor(config = {}) {
    this.id = config.id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    this.type = config.type || 'general'
    this.prompt = config.prompt || ''
    this.context = config.context || {}
    this.engine = config.engine || AIEngine.LLM_API
    this.priority = config.priority || 0
    this.timeout = config.timeout || 60000
    this.retryCount = config.retryCount || 3
    this.status = 'pending' // pending, running, success, failed
    this.result = null
    this.error = null
    this.createdAt = Date.now()
    this.startedAt = null
    this.completedAt = null
  }
}

/**
 * AI 执行管理器主类
 */
class AIExecutorClass extends EventEmitter {
  constructor() {
    super()
    this.engine = null
    this.currentEngine = AIEngine.LLM_API
    this.tasks = new Map()
    this.queue = []
    this.processing = false
  }

  /**
   * 初始化执行器
   */
  async init(config = {}) {
    this.engine = config.engine || AIEngine.LLM_API

    // 初始化 Claude Code 适配器
    if (config.claudeCode) {
      try {
        await claudeCodeAdapter.init(config.claudeCode)
      } catch (error) {
        console.warn('Claude Code 初始化失败，使用备用方案:', error.message)
      }
    }

    // 初始化 LLM API
    if (config.llmApi) {
      try {
        aiAssistant.init(config.llmApi)
      } catch (error) {
        console.warn('LLM API 初始化失败，使用备用方案:', error.message)
      }
    }

    this.emit('init', { config })
    return this
  }

  /**
   * 设置执行引擎
   */
  setEngine(engine) {
    this.currentEngine = engine
    this.emit('engine:change', { engine })
  }

  /**
   * 执行 AI 任务
   */
  async execute(taskConfig) {
    const task = new AITask(taskConfig)
    this.tasks.set(task.id, task)

    // 加入队列
    this.queue.push(task)
    this.#processQueue()

    return task
  }

  /**
   * 处理队列
   */
  async #processQueue() {
    if (this.processing || this.queue.length === 0) return

    this.processing = true

    while (this.queue.length > 0) {
      const task = this.queue.shift()
      await this.#runTask(task)
    }

    this.processing = false
  }

  /**
   * 运行单个任务
   */
  async #runTask(task) {
    task.status = 'running'
    task.startedAt = Date.now()

    this.emit('task:start', { task })

    try {
      let result

      switch (this.currentEngine) {
        case AIEngine.CLAUDE_CODE:
          result = await claudeCodeAdapter.execute(task.prompt, { context: task.context })
          break

        case AIEngine.LOCAL_LLM:
          // TODO: 本地模型支持
          result = await aiAssistant.execute(task.prompt, task.context)
          break

        case AIEngine.LLM_API:
        default:
          result = await aiAssistant.execute(task.prompt, task.context)
          break
      }

      task.status = 'success'
      task.result = result
      task.completedAt = Date.now()

      this.emit('task:success', { task, result })
      return result
    } catch (error) {
      task.status = 'failed'
      task.error = error.message
      task.completedAt = Date.now()

      this.emit('task:error', { task, error })
      throw error
    }
  }

  /**
   * 生成应用结构
   */
  async generateApp(description, options = {}) {
    return this.execute({
      type: 'generate_app',
      prompt: `创建应用：${description}`,
      context: options,
      engine: this.currentEngine,
    })
  }

  /**
   * 生成表单
   */
  async generateForm(description, context = {}) {
    return this.execute({
      type: 'generate_form',
      prompt: `生成表单：${description}`,
      context,
      engine: this.currentEngine,
    })
  }

  /**
   * 生成业务逻辑
   */
  async generateLogic(description, context = {}) {
    return this.execute({
      type: 'generate_logic',
      prompt: `生成逻辑：${description}`,
      context,
      engine: this.currentEngine,
    })
  }

  /**
   * 诊断错误
   */
  async diagnoseError(errorLog, context = {}) {
    return this.execute({
      type: 'diagnose_error',
      prompt: `诊断错误：${errorLog}`,
      context,
      engine: this.currentEngine,
    })
  }

  /**
   * 获取任务状态
   */
  getTask(taskId) {
    return this.tasks.get(taskId)
  }

  /**
   * 获取队列状态
   */
  getQueueStatus() {
    return {
      pending: this.queue.length,
      processing: this.processing,
      total: this.tasks.size,
    }
  }

  /**
   * 取消任务
   */
  cancel(taskId) {
    const task = this.tasks.get(taskId)
    if (task && task.status === 'pending') {
      task.status = 'cancelled'
      this.queue = this.queue.filter((t) => t.id !== taskId)
      this.emit('task:cancel', { task })
      return true
    }
    return false
  }

  /**
   * 清空所有任务
   */
  clearAll() {
    this.tasks.clear()
    this.queue = []
    this.processing = false
    this.emit('clear')
  }
}

// 导出单例
export const aiExecutor = new AIExecutorClass()

// 导出工具函数
export function createAIExecutor(config) {
  const executor = new AIExecutorClass()
  if (config) {
    executor.init(config)
  }
  return executor
}

export default aiExecutor
