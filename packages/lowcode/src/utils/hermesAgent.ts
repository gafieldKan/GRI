/**
 * Hermes Agent 集成模块
 *
 * 使用方式：
 * 1. 创建 Hermes Agent 实例
 * 2. 调用 execute 方法执行任务
 * 3. 获取结果
 */

import { createClaudeAgent, ClaudeAgent } from './claudeAgent'

export interface HermesAgentConfig {
  name?: string
  autoExecute?: boolean // 是否自动执行任务
  verbose?: boolean // 是否输出详细日志
}

export interface HermesTask {
  id: string
  description: string
  priority?: 'high' | 'medium' | 'low'
  context?: Record<string, unknown>
}

export class HermesAgent {
  private claudeAgent: ClaudeAgent | null
  private config: Required<HermesAgentConfig>
  private taskQueue: HermesTask[] = []
  private isProcessing = false

  constructor(config: HermesAgentConfig = {}) {
    this.config = {
      name: config.name || 'Hermes',
      autoExecute: config.autoExecute ?? true,
      verbose: config.verbose ?? false,
    }

    this.claudeAgent = createClaudeAgent()
  }

  /**
   * 执行单个任务
   */
  async execute(description: string, context?: Record<string, unknown>): Promise<string> {
    if (!this.claudeAgent) {
      const errorMsg = 'Claude Agent 未初始化，请检查 API Key 配置'
      this.log(errorMsg)
      return errorMsg
    }

    this.log(`执行任务：${description}`)

    const result = await this.claudeAgent.executeTask(description, {
      additionalInfo: context ? JSON.stringify(context, null, 2) : undefined,
    })

    if (result.success) {
      this.log(`任务完成：${result.output?.slice(0, 200)}...`)
      return result.output || ''
    } else {
      const error = `任务失败：${result.error}`
      this.log(error)
      return error
    }
  }

  /**
   * 添加任务到队列
   */
  addTask(task: HermesTask): void {
    this.taskQueue.push(task)
    this.log(`任务已入队：${task.id} - ${task.description}`)

    if (this.config.autoExecute && !this.isProcessing) {
      this.processQueue()
    }
  }

  /**
   * 批量添加任务
   */
  addTasks(tasks: HermesTask[]): void {
    tasks.forEach((task) => this.addTask(task))
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(): { pending: number; processing: boolean } {
    return {
      pending: this.taskQueue.length,
      processing: this.isProcessing,
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.taskQueue.length === 0) {
      return
    }

    this.isProcessing = true

    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift()
      if (task) {
        await this.execute(task.description, task.context)
      }
    }

    this.isProcessing = false
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[${this.config.name}]: ${message}`)
    }
  }
}

/**
 * 创建并初始化 Hermes Agent
 */
export function createHermesAgent(config?: HermesAgentConfig): HermesAgent | null {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

  if (!apiKey) {
    console.warn('Hermes Agent: 未配置 API Key，功能将不可用')
    return null
  }

  return new HermesAgent(config)
}

export default HermesAgent
