/**
 * Webhook 管理器
 * 支持事件触发的 Webhook 回调机制
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * Webhook 状态枚举
 */
export const WebhookStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ERROR: 'error',
}

/**
 * Webhook 配置类
 */
export class WebhookConfig {
  constructor(config = {}) {
    this.id = config.id || `webhook_${Date.now()}`
    this.name = config.name || '未命名 Webhook'
    this.url = config.url || ''
    this.events = config.events || []
    this.status = config.status || WebhookStatus.ACTIVE
    this.secret = config.secret || ''
    this.headers = config.headers || {}
    this.retryCount = config.retryCount || 3
    this.retryDelay = config.retryDelay || 1000
    this.timeout = config.timeout || 5000
    this.createdAt = config.createdAt || Date.now()
    this.updatedAt = config.updatedAt || Date.now()
    this.lastTriggered = null
    this.successCount = 0
    this.failureCount = 0
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      url: this.url,
      events: this.events,
      status: this.status,
      headers: this.headers,
      retryCount: this.retryCount,
      retryDelay: this.retryDelay,
      timeout: this.timeout,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastTriggered: this.lastTriggered,
      successCount: this.successCount,
      failureCount: this.failureCount,
    }
  }
}

/**
 * Webhook 执行记录类
 */
export class WebhookLog {
  constructor(config = {}) {
    this.id = config.id || `log_${Date.now()}`
    this.webhookId = config.webhookId
    this.event = config.event
    this.payload = config.payload
    this.status = config.status || 'pending'
    this.response = config.response
    this.error = config.error
    this.attempt = config.attempt || 1
    this.timestamp = config.timestamp || Date.now()
    this.duration = config.duration || 0
  }

  toJSON() {
    return {
      id: this.id,
      webhookId: this.webhookId,
      event: this.event,
      payload: this.payload,
      status: this.status,
      response: this.response,
      error: this.error,
      attempt: this.attempt,
      timestamp: this.timestamp,
      duration: this.duration,
    }
  }
}

/**
 * Webhook 管理器主类
 */
class WebhookManagerClass extends EventEmitter {
  constructor() {
    super()
    this.webhooks = new Map()
    this.eventHandlers = new Map()
    this.logs = []
    this.maxLogs = 1000
  }

  /**
   * 注册 Webhook
   */
  register(config) {
    const webhook = new WebhookConfig(config)
    this.webhooks.set(webhook.id, webhook)

    // 为每个事件注册处理器
    webhook.events.forEach((event) => {
      if (!this.eventHandlers.has(event)) {
        this.eventHandlers.set(event, new Set())
      }
      this.eventHandlers.get(event).add(webhook.id)
    })

    this.emit('webhook:register', { webhook })
    return webhook
  }

  /**
   * 获取 Webhook
   */
  get(id) {
    return this.webhooks.get(id)
  }

  /**
   * 获取所有 Webhook
   */
  getAll() {
    return Array.from(this.webhooks.values())
  }

  /**
   * 按事件获取 Webhook
   */
  getByEvent(event) {
    const webhookIds = this.eventHandlers.get(event)
    if (!webhookIds) return []

    return Array.from(webhookIds)
      .map((id) => this.webhooks.get(id))
      .filter((wh) => wh.status === WebhookStatus.ACTIVE)
  }

  /**
   * 更新 Webhook
   */
  update(id, updates) {
    const webhook = this.webhooks.get(id)
    if (!webhook) {
      throw new Error(`Webhook 不存在：${id}`)
    }

    // 如果事件列表变化，重新注册事件
    if (updates.events) {
      // 移除旧事件
      webhook.events.forEach((event) => {
        const handlers = this.eventHandlers.get(event)
        if (handlers) {
          handlers.delete(id)
        }
      })

      // 添加新事件
      webhook.events = updates.events
      webhook.events.forEach((event) => {
        if (!this.eventHandlers.has(event)) {
          this.eventHandlers.set(event, new Set())
        }
        this.eventHandlers.get(event).add(id)
      })
    }

    Object.assign(webhook, updates)
    webhook.updatedAt = Date.now()

    this.emit('webhook:update', { webhook })
    return webhook
  }

  /**
   * 删除 Webhook
   */
  delete(id) {
    const webhook = this.webhooks.get(id)
    if (!webhook) return false

    // 从事件处理器中移除
    webhook.events.forEach((event) => {
      const handlers = this.eventHandlers.get(event)
      if (handlers) {
        handlers.delete(id)
      }
    })

    this.webhooks.delete(id)
    this.emit('webhook:delete', { id })
    return true
  }

  /**
   * 触发 Webhook
   */
  async trigger(event, payload = {}) {
    const webhooks = this.getByEvent(event)
    if (webhooks.length === 0) return []

    const results = await Promise.all(
      webhooks.map((webhook) => this.#executeWebhook(webhook, event, payload))
    )

    this.emit('trigger', { event, payload, results })
    return results
  }

  /**
   * 执行单个 Webhook
   */
  async #executeWebhook(webhook, event, payload) {
    const log = new WebhookLog({
      webhookId: webhook.id,
      event,
      payload,
      status: 'pending',
    })

    webhook.lastTriggered = Date.now()

    try {
      const signature = this.#generateSignature(webhook.secret, payload)

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
          ...webhook.headers,
        },
        body: JSON.stringify({
          id: log.id,
          event,
          payload,
          timestamp: log.timestamp,
        }),
        signal: AbortSignal.timeout(webhook.timeout),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const responseData = await response.json()

      log.status = 'success'
      webhook.successCount++

      this.emit('webhook:success', { webhook, event, response: responseData })

      return { success: true, response: responseData }
    } catch (error) {
      log.error = error.message
      log.status = 'error'
      webhook.failureCount++

      this.emit('webhook:error', { webhook, event, error })

      // 重试逻辑
      if (webhook.retryCount > 0) {
        return this.#retryWebhook(webhook, event, payload, log)
      }

      return { success: false, error: error.message }
    } finally {
      this.#addLog(log)
    }
  }

  /**
   * 重试 Webhook
   */
  async #retryWebhook(webhook, event, payload, log, attempt = 1) {
    if (attempt > webhook.retryCount) {
      return { success: false, error: 'Max retries exceeded' }
    }

    const delay = webhook.retryDelay * attempt
    await new Promise((resolve) => setTimeout(resolve, delay))

    log.attempt = attempt + 1
    return this.#executeWebhook(webhook, event, payload)
  }

  /**
   * 生成签名
   */
  #generateSignature(secret, payload) {
    if (!secret) return ''

    // 简单签名（实际使用应使用 crypto 模块）
    const data = JSON.stringify(payload)
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return `sha256=${hash.toString(16)}`
  }

  /**
   * 添加日志
   */
  #addLog(log) {
    this.logs.push(log)

    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }
  }

  /**
   * 获取执行日志
   */
  getLogs(webhookId, limit = 100) {
    let logs = this.logs
    if (webhookId) {
      logs = logs.filter((log) => log.webhookId === webhookId)
    }
    return logs.slice(-limit).map((log) => log.toJSON())
  }

  /**
   * 清除日志
   */
  clearLogs() {
    this.logs = []
  }

  /**
   * 测试 Webhook
   */
  async test(webhookId) {
    const webhook = this.webhooks.get(webhookId)
    if (!webhook) {
      throw new Error(`Webhook 不存在：${webhookId}`)
    }

    const testPayload = {
      event: 'webhook:test',
      payload: { test: true, timestamp: Date.now() },
      webhookId,
    }

    return this.#executeWebhook(webhook, 'webhook:test', testPayload.payload)
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const stats = {
      total: this.webhooks.size,
      active: 0,
      inactive: 0,
      totalSuccess: 0,
      totalFailure: 0,
      byEvent: {},
    }

    this.webhooks.forEach((webhook) => {
      if (webhook.status === WebhookStatus.ACTIVE) {
        stats.active++
      } else {
        stats.inactive++
      }

      stats.totalSuccess += webhook.successCount
      stats.totalFailure += webhook.failureCount

      webhook.events.forEach((event) => {
        if (!stats.byEvent[event]) {
          stats.byEvent[event] = 0
        }
        stats.byEvent[event]++
      })
    })

    return stats
  }
}

// 导出单例
export const webhookManager = new WebhookManagerClass()
export default webhookManager
