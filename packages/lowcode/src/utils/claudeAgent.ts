/**
 * Claude Agent 客户端
 * 用于调用 Claude API 完成各种任务
 */

import Anthropic from '@anthropic-ai/sdk'

export interface ClaudeAgentConfig {
  apiKey: string
  model?: string
  maxTokens?: number
}

export interface TaskResult {
  success: boolean
  output?: string
  error?: string
}

export class ClaudeAgent {
  private client: Anthropic
  private model: string
  private maxTokens: number

  constructor(config: ClaudeAgentConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true, // 注意：生产环境建议通过后端代理
    })
    this.model = config.model || 'claude-sonnet-4-6'
    this.maxTokens = config.maxTokens || 4096
  }

  /**
   * 执行任务 - 让 Claude 分析并完成指定任务
   * @param taskDescription 任务描述
   * @param context 上下文信息（可选）
   */
  async executeTask(
    taskDescription: string,
    context?: {
      codebase?: string
      files?: string[]
      additionalInfo?: string
    }
  ): Promise<TaskResult> {
    try {
      const prompt = this.buildPrompt(taskDescription, context)

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      })

      const output = response.content
        .filter((block) => 'text' in block)
        .map((block) => ('text' in block ? block.text : ''))
        .join('\n')

      return {
        success: true,
        output,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * 代码分析任务
   */
  async analyzeCode(code: string, question?: string): Promise<TaskResult> {
    const task = question
      ? `请分析以下代码并回答问题：${question}\n\n代码：\n${code}`
      : `请分析以下代码的结构、功能和潜在问题：\n${code}`

    return this.executeTask(task)
  }

  /**
   * 代码生成任务
   */
  async generateCode(description: string, language = 'typescript'): Promise<TaskResult> {
    const task = `请生成${language}代码，实现以下功能：${description}`
    return this.executeTask(task)
  }

  /**
   * Bug 修复任务
   */
  async fixBug(code: string, bugDescription: string): Promise<TaskResult> {
    const task = `以下代码存在问题：${bugDescription}\n\n请修复并说明修改原因：\n${code}`
    return this.executeTask(task)
  }

  private buildPrompt(
    taskDescription: string,
    context?: { codebase?: string; files?: string[]; additionalInfo?: string }
  ): string {
    let prompt = `请完成以下任务：\n\n${taskDescription}`

    if (context?.codebase) {
      prompt += `\n\n项目上下文：${context.codebase}`
    }

    if (context?.files?.length) {
      prompt += `\n\n相关文件：${context.files.join(', ')}`
    }

    if (context?.additionalInfo) {
      prompt += `\n\n补充信息：${context.additionalInfo}`
    }

    return prompt
  }
}

// 导出默认实例（需要配置 API KEY）
export function createClaudeAgent(apiKey?: string): ClaudeAgent | null {
  const key = apiKey || import.meta.env.VITE_ANTHROPIC_API_KEY

  if (!key) {
    console.warn('未配置 Anthropic API Key，请在环境变量中设置 VITE_ANTHROPIC_API_KEY')
    return null
  }

  return new ClaudeAgent({
    apiKey: key,
    model: import.meta.env.VITE_CLAUDE_MODEL || 'claude-sonnet-4-6',
    maxTokens: Number(import.meta.env.VITE_CLAUDE_MAX_TOKENS) || 4096,
  })
}

export default ClaudeAgent
