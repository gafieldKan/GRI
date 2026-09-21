/**
 * AI 辅助助手
 * 支持自然语言生成表单、智能字段推荐、公式生成等
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * AI 任务类型枚举
 */
export const AITaskType = {
  // 表单生成
  GENERATE_FORM: 'generate_form',
  GENERATE_FIELD: 'generate_field',
  GENERATE_MODEL: 'generate_model',

  // 智能推荐
  RECOMMEND_FIELD_TYPE: 'recommend_field_type',
  RECOMMEND_VALIDATION: 'recommend_validation',
  RECOMMEND_LAYOUT: 'recommend_layout',

  // 公式/表达式
  GENERATE_EXPRESSION: 'generate_expression',
  PARSE_EXPRESSION: 'parse_expression',

  // 流程辅助
  COMPLETE_FLOW: 'complete_flow',
  SUGGEST_FLOW: 'suggest_flow',

  // 数据填充
  GENERATE_DATA: 'generate_data',

  // 咨询帮助
  ASK_HELP: 'ask_help',
}

/**
 * AI 配置类
 */
export class AIConfig {
  constructor(config = {}) {
    // LLM 服务地址
    this.apiUrl = config.apiUrl || 'https://api.qwen.ai/v1'
    // API Key
    this.apiKey = config.apiKey || ''
    // 模型名称
    this.model = config.model || 'qwen-plus'
    // 温度
    this.temperature = config.temperature ?? 0.7
    // 最大 Token
    this.maxTokens = config.maxTokens || 2048
    // 超时时间
    this.timeout = config.timeout || 30000
    // 降级策略
    this.fallback = config.fallback ?? true
    // 缓存启用
    this.cache = config.cache ?? true
  }
}

/**
 * AI 助手主类
 */
class AIAssistantClass extends EventEmitter {
  constructor() {
    super()
    this.config = null
    this.cache = new Map()
    this.templates = new Map()
    this.enabled = true
  }

  /**
   * 初始化 AI 助手
   */
  init(config = {}) {
    this.config = new AIConfig(config)
    this.#loadTemplates()
    this.emit('init', { config: this.config })
    return this
  }

  /**
   * 启用/禁用 AI
   */
  setEnabled(enabled) {
    this.enabled = enabled
  }

  /**
   * 自然语言生成表单
   */
  async generateForm(description, options = {}) {
    if (!this.enabled) return null

    const prompt = `
你是一个低代码平台表单设计专家。
请根据用户的描述生成表单结构。

用户描述：${description}

要求：
1. 识别表单名称
2. 识别字段，每个字段包含：name, label, type, required
3. 字段类型从以下选择：text, number, date, select, radio, checkbox, textarea, phone, email, money
4. 输出 JSON 格式

示例输出：
{
  "name": "employee_leave_form",
  "label": "员工请假申请表",
  "fields": [
    { "name": "applicant", "label": "申请人", "type": "text", "required": true },
    { "name": "leave_type", "label": "请假类型", "type": "select", "required": true, "options": ["年假", "病假", "事假"] },
    { "name": "start_date", "label": "开始日期", "type": "date", "required": true },
    { "name": "end_date", "label": "结束日期", "type": "date", "required": true },
    { "name": "reason", "label": "请假事由", "type": "textarea", "required": false }
  ]
}
`

    return this.#callLLM(prompt, AITaskType.GENERATE_FORM, options)
  }

  /**
   * 智能字段推荐
   */
  async recommendField(fieldName, context = {}) {
    if (!this.enabled) return null

    const prompt = `
你是低代码平台字段设计专家。
根据字段名推荐字段类型和校验规则。

字段名：${fieldName}
${context.label ? `字段标签：${context.label}` : ''}
${context.description ? `字段描述：${context.description}` : ''}

请输出 JSON：
{
  "type": "text|number|date|select|...",
  "label": "字段标签",
  "required": true|false,
  "validation": { "pattern": "", "message": "" },
  "placeholder": "占位提示"
}
`

    return this.#callLLM(prompt, AITaskType.RECOMMEND_FIELD_TYPE, { context })
  }

  /**
   * 生成表达式/公式
   */
  async generateExpression(description, context = {}) {
    if (!this.enabled) return null

    const prompt = `
你是低代码平台公式专家。
将用户的自然语言描述转换为平台表达式。

用户描述：${description}
${context.fields ? `可用字段：${JSON.stringify(context.fields)}` : ''}

支持的函数：SUM, AVG, IF, AND, OR, CONCAT, DATE_DIFF, ...

输出 JSON：
{
  "expression": "\${field1} + \${field2}",
  "explanation": "计算说明"
}
`

    return this.#callLLM(prompt, AITaskType.GENERATE_EXPRESSION, { context })
  }

  /**
   * 批量生成测试数据
   */
  async generateData(schema, count = 10) {
    if (!this.enabled) return null

    const prompt = `
你是测试数据生成专家。
根据给定的 Schema 生成测试数据。

Schema:
${JSON.stringify(schema, null, 2)}

生成 ${count} 条数据，输出 JSON 数组格式。
`

    return this.#callLLM(prompt, AITaskType.GENERATE_DATA, { count })
  }

  /**
   * 流程补全建议
   */
  async suggestFlow(existingNodes) {
    if (!this.enabled) return null

    const prompt = `
你是工作流设计专家。
根据已有节点推荐后续流程。

已有节点：
${JSON.stringify(existingNodes, null, 2)}

请推荐后续流程节点，输出 JSON：
{
  "suggestions": [
    { "type": "approve", "label": "审批", "reason": "" },
    { "type": "notify", "label": "通知", "reason": "" }
  ]
}
`

    return this.#callLLM(prompt, AITaskType.SUGGEST_FLOW)
  }

  /**
   * 智能帮助问答
   */
  async askHelp(question, context = {}) {
    if (!this.enabled) return null

    const prompt = `
你是低代码平台使用助手。
回答用户关于平台使用的问题。

用户问题：${question}
${context.currentPage ? `当前页面：${context.currentPage}` : ''}

请给出简洁、实用的回答，包含操作步骤。
`

    return this.#callLLM(prompt, AITaskType.ASK_HELP, { context })
  }

  /**
   * 加载模板
   */
  #loadTemplates() {
    // 加载内置模板
    const templates = [
      {
        id: 'form_basic',
        name: '基础表单',
        template: {
          name: 'form',
          label: '表单',
          fields: [],
        },
      },
    ]
    templates.forEach((t) => this.templates.set(t.id, t))
  }

  /**
   * 调用 LLM
   */
  async #callLLM(prompt, taskType, options = {}) {
    const cacheKey = this.#generateCacheKey(prompt, options)

    // 检查缓存
    if (this.config.cache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)
      if (Date.now() - cached.time < 3600000) {
        // 1 小时缓存
        return cached.data
      }
    }

    try {
      this.emit('llm:start', { taskType, prompt })

      // 调用 LLM
      const response = await fetch(`${this.config.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的低代码平台 AI 助手，擅长结构化输出 JSON。',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
        }),
      })

      if (!response.ok) {
        throw new Error(`LLM 调用失败：${response.status}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || ''

      // 解析 JSON
      let result
      try {
        result = JSON.parse(content)
      } catch {
        // 尝试提取 JSON
        const match = content.match(/\{[\s\S]*\}/)
        result = match ? JSON.parse(match[0]) : { raw: content }
      }

      // 缓存结果
      if (this.config.cache) {
        this.cache.set(cacheKey, { data: result, time: Date.now() })
      }

      this.emit('llm:success', { taskType, result })
      return result
    } catch (error) {
      this.emit('llm:error', { taskType, error })

      // 降级处理
      if (this.config.fallback) {
        return this.#fallbackHandler(taskType, options)
      }

      throw error
    }
  }

  /**
   * 降级处理
   */
  #fallbackHandler(taskType, options) {
    console.warn('[AI] 降级处理:', taskType)

    switch (taskType) {
      case AITaskType.GENERATE_FORM:
        return {
          name: 'form',
          label: '表单',
          fields: [],
        }
      case AITaskType.RECOMMEND_FIELD_TYPE:
        return {
          type: 'text',
          label: '字段',
          required: false,
        }
      default:
        return null
    }
  }

  #generateCacheKey(prompt, options) {
    return `ai_${prompt.substring(0, 50)}_${JSON.stringify(options)}`
  }

  /**
   * 清空缓存
   */
  clearCache() {
    this.cache.clear()
  }

  /**
   * 获取使用统计
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      templates: this.templates.size,
      enabled: this.enabled,
    }
  }
}

// 导出单例
export const aiAssistant = new AIAssistantClass()

// 导出工具函数
export function createAIAssistant(config) {
  const instance = new AIAssistantClass()
  instance.init(config)
  return instance
}

export default aiAssistant
