/**
 * 消息通知管理器
 * 支持站内信、邮件、短信等多种通知方式
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 通知类型枚举
 */
export const NotificationType = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
}

/**
 * 通知渠道枚举
 */
export const NotificationChannel = {
  IN_APP: 'in_app', // 站内信
  EMAIL: 'email', // 邮件
  SMS: 'sms', // 短信
  PUSH: 'push', // 推送
  WEBHOOK: 'webhook', // Webhook
}

/**
 * 通知优先级枚举
 */
export const NotificationPriority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
}

/**
 * 通知类
 */
export class Notification {
  constructor(config = {}) {
    this.id = config.id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    this.type = config.type || NotificationType.INFO
    this.title = config.title || ''
    this.message = config.message || ''
    this.content = config.content || ''
    this.channels = config.channels || [NotificationChannel.IN_APP]
    this.recipients = config.recipients || []
    this.priority = config.priority || NotificationPriority.NORMAL
    this.data = config.data || {}
    this.actions = config.actions || []
    this.read = false
    this.readAt = null
    this.clickedAt = null
    this.createdAt = config.createdAt || Date.now()
    this.expiresAt = config.expiresAt || null
    this.delivered = false
    this.deliveredAt = null
  }
}

/**
 * 消息通知管理器主类
 */
class NotificationManagerClass extends EventEmitter {
  constructor() {
    super()
    this.notifications = new Map()
    this.unreadCount = 0
    this.currentUser = null
    this.config = {}
  }

  /**
   * 初始化
   */
  init(config = {}) {
    this.config = {
      // 自动显示通知
      autoShow: config.autoShow ?? true,
      // 通知停留时间
      duration: config.duration ?? 5000,
      // 最大通知数
      maxNotifications: config.maxNotifications ?? 10,
      // 邮件配置
      email: config.email || {},
      // 短信配置
      sms: config.sms || {},
      // Webhook 配置
      webhook: config.webhook || {},
      ...config,
    }

    // 从存储加载未读数
    this.#loadUnreadCount()

    this.emit('init', { config })
    return this
  }

  /**
   * 发送通知
   */
  async send(config) {
    const notification = new Notification(config)

    this.notifications.set(notification.id, notification)
    this.emit('notification:send', { notification })

    const results = []

    // 发送到各个渠道
    for (const channel of notification.channels) {
      try {
        let result
        switch (channel) {
          case NotificationChannel.IN_APP:
            result = await this.#sendInApp(notification)
            break
          case NotificationChannel.EMAIL:
            result = await this.#sendEmail(notification)
            break
          case NotificationChannel.SMS:
            result = await this.#sendSMS(notification)
            break
          case NotificationChannel.PUSH:
            result = await this.#sendPush(notification)
            break
          case NotificationChannel.WEBHOOK:
            result = await this.#sendWebhook(notification)
            break
          default:
            throw new Error(`未知渠道：${channel}`)
        }
        results.push({ channel, success: true, result })
      } catch (error) {
        results.push({ channel, success: false, error: error.message })
      }
    }

    notification.delivered = results.every((r) => r.success)
    notification.deliveredAt = Date.now()

    this.emit('notification:delivered', { notification, results })
    return { notification, results }
  }

  /**
   * 标记为已读
   */
  markAsRead(notificationId) {
    const notification = this.notifications.get(notificationId)
    if (notification && !notification.read) {
      notification.read = true
      notification.readAt = Date.now()
      this.unreadCount = Math.max(0, this.unreadCount - 1)
      this.#saveUnreadCount()
      this.emit('notification:read', { notificationId })
    }
  }

  /**
   * 全部标记为已读
   */
  markAllAsRead() {
    for (const notification of this.notifications.values()) {
      if (!notification.read) {
        notification.read = true
        notification.readAt = Date.now()
      }
    }
    this.unreadCount = 0
    this.#saveUnreadCount()
    this.emit('notification:readAll')
  }

  /**
   * 获取通知
   */
  get(notificationId) {
    return this.notifications.get(notificationId)
  }

  /**
   * 获取所有通知
   */
  getAll(options = {}) {
    const { type, read, limit } = options
    let notifications = Array.from(this.notifications.values())

    if (type) {
      notifications = notifications.filter((n) => n.type === type)
    }
    if (read !== undefined) {
      notifications = notifications.filter((n) => n.read === read)
    }
    if (limit) {
      notifications = notifications.slice(0, limit)
    }

    return notifications.sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * 获取未读通知
   */
  getUnread() {
    return this.getAll({ read: false })
  }

  /**
   * 获取未读数
   */
  getUnreadCount() {
    return this.unreadCount
  }

  /**
   * 设置当前用户
   */
  setCurrentUser(user) {
    this.currentUser = user
  }

  /**
   * 清除通知
   */
  clear(notificationId) {
    const notification = this.notifications.get(notificationId)
    if (notification) {
      this.notifications.delete(notificationId)
      this.emit('notification:clear', { notificationId })
      return true
    }
    return false
  }

  /**
   * 清空所有通知
   */
  clearAll() {
    this.notifications.clear()
    this.unreadCount = 0
    this.#saveUnreadCount()
    this.emit('notification:clearAll')
  }

  // ==================== 私有方法 ====================

  async #sendInApp(notification) {
    // 增加未读数
    this.unreadCount++
    this.#saveUnreadCount()

    // 显示 Toast 通知
    this.emit('notification:show', { notification })

    return { success: true }
  }

  async #sendEmail(notification) {
    const { email } = this.config

    // 调用邮件发送 API
    const response = await fetch('/api/notification/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: notification.recipients,
        subject: notification.title,
        body: notification.message,
        ...email,
      }),
    })

    if (!response.ok) {
      throw new Error('邮件发送失败')
    }

    return response.json()
  }

  async #sendSMS(notification) {
    const { sms } = this.config

    // 调用短信发送 API
    const response = await fetch('/api/notification/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: notification.recipients,
        message: notification.message,
        ...sms,
      }),
    })

    if (!response.ok) {
      throw new Error('短信发送失败')
    }

    return response.json()
  }

  async #sendPush(notification) {
    // 推送通知（需要 Service Worker 支持）
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const registration = await navigator.serviceWorker.ready
      await registration.pushManager.getSubscription()
      // 需要后端支持
    }

    return { success: true }
  }

  async #sendWebhook(notification) {
    const { webhook } = this.config

    if (!webhook.url) {
      return { success: false, error: 'Webhook URL 未配置' }
    }

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
      }),
    })

    return { success: response.ok }
  }

  #loadUnreadCount() {
    if (typeof localStorage === 'undefined') return
    const count = localStorage.getItem('notification_unread_count')
    this.unreadCount = count ? parseInt(count, 10) : 0
  }

  #saveUnreadCount() {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem('notification_unread_count', this.unreadCount)
  }
}

// 导出单例
export const notificationManager = new NotificationManagerClass()

// 导出工具函数
export function createNotificationManager() {
  return new NotificationManagerClass()
}

export default notificationManager
