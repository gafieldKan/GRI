/**
 * 用户行为分析管理器
 * 支持用户行为埋点、路径分析、停留时间统计、热力图数据
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 事件类型枚举
 */
export const EventType = {
  PAGE_VIEW: 'page_view',
  CLICK: 'click',
  SCROLL: 'scroll',
  INPUT: 'input',
  SUBMIT: 'submit',
  CUSTOM: 'custom',
}

/**
 * 行为事件类
 */
export class AnalyticsEvent {
  constructor(event = {}) {
    this.id = event.id || this.#generateId()
    this.type = event.type || EventType.CUSTOM
    this.timestamp = event.timestamp || Date.now()
    this.pageUrl = event.pageUrl || window.location?.href || ''
    this.pageTitle = event.pageTitle || document?.title || ''
    this.userId = event.userId || ''
    this.sessionId = event.sessionId || ''
    this.elementId = event.elementId || ''
    this.elementSelector = event.elementSelector || ''
    this.elementText = event.elementText || ''
    this.properties = event.properties || {}
    this.metadata = event.metadata || {}
  }

  #generateId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }
}

/**
 * 用户会话类
 */
export class UserSession {
  constructor(userId = '') {
    this.id = this.#generateSessionId()
    this.userId = userId
    this.startTime = Date.now()
    this.lastActivity = Date.now()
    this.pageViews = []
    this.events = []
    this.path = []
  }

  #generateSessionId() {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  getDuration() {
    return Date.now() - this.startTime
  }

  addPageView(url, title) {
    this.pageViews.push({ url, title, timestamp: Date.now() })
    this.lastActivity = Date.now()
  }

  addEvent(event) {
    this.events.push(event)
    this.lastActivity = Date.now()
  }

  addToPath(path) {
    this.path.push({ path, timestamp: Date.now() })
  }
}

/**
 * 热力图数据类
 */
export class HeatmapData {
  constructor() {
    this.clicks = []
    this.scrolls = []
    this.moves = []
  }

  addClick(x, y, element) {
    this.clicks.push({ x, y, element, timestamp: Date.now() })
  }

  addScroll(scrollPercent, element) {
    this.scrolls.push({ scrollPercent, element, timestamp: Date.now() })
  }
}

/**
 * 分析管理器主类
 */
class AnalyticsManagerClass extends EventEmitter {
  constructor() {
    super()
    this.enabled = false
    this.userId = ''
    this.session = null
    this.heatmapData = new HeatmapData()
    this.eventQueue = []
    this.batchSize = 10
    this.flushInterval = 30000 // 30 秒
    this.storageKey = 'analytics_events'
    this.config = {}
  }

  /**
   * 初始化分析管理器
   */
  init(config = {}) {
    this.config = {
      enabled: true,
      autoTrackPageView: true,
      autoTrackClick: true,
      autoTrackScroll: true,
      batching: true,
      flushInterval: 30000,
      storageKey: 'analytics_events',
      onEvent: null,
      onBatch: null,
      ...config,
    }

    this.enabled = this.config.enabled
    this.storageKey = this.config.storageKey

    // 生成/获取用户 ID
    this.userId = this.#getOrGenerateUserId()

    // 创建会话
    this.session = new UserSession(this.userId)

    // 自动追踪页面浏览
    if (this.config.autoTrackPageView) {
      this.trackPageView()
    }

    // 绑定全局事件
    this.#bindGlobalEvents()

    // 定期刷新事件
    if (this.config.batching) {
      setInterval(() => this.flushEvents(), this.config.flushInterval)
    }

    this.emit('init', { userId: this.userId, sessionId: this.session.id })
    return this
  }

  /**
   * 追踪页面浏览
   */
  trackPageView(url = '', title = '') {
    if (!this.enabled) return

    const pageUrl = url || window.location?.href || ''
    const pageTitle = title || document?.title || ''

    const event = new AnalyticsEvent({
      type: EventType.PAGE_VIEW,
      pageUrl,
      pageTitle,
      userId: this.userId,
      sessionId: this.session?.id || null,
    })

    this.session.addPageView(pageUrl, pageTitle)
    this.session.addToPath(pageUrl)
    this.#processEvent(event)
  }

  /**
   * 追踪点击事件
   */
  trackClick(element, extraProps = {}) {
    if (!this.enabled) return

    const event = new AnalyticsEvent({
      type: EventType.CLICK,
      userId: this.userId,
      sessionId: this.session?.id || null,
      elementId: element.id || '',
      elementSelector: this.#getElementSelector(element),
      elementText: element.innerText?.substring(0, 100) || '',
      properties: {
        tagName: element.tagName,
        className: element.className,
        ...extraProps,
      },
    })

    this.session.addEvent(event)
    this.#processEvent(event)

    // 添加到热力图
    const rect = element.getBoundingClientRect()
    this.heatmapData.addClick(rect.x, rect.y, event.elementSelector)
  }

  /**
   * 追踪滚动事件
   */
  trackScroll(scrollPercent = 0) {
    if (!this.enabled) return

    const event = new AnalyticsEvent({
      type: EventType.SCROLL,
      userId: this.userId,
      sessionId: this.session?.id || null,
      properties: {
        scrollPercent,
        scrollY: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
      },
    })

    this.session.addEvent(event)
    this.heatmapData.addScroll(scrollPercent, window.location.pathname)
  }

  /**
   * 追踪表单提交
   */
  trackSubmit(form, formData = {}) {
    if (!this.enabled) return

    const event = new AnalyticsEvent({
      type: EventType.SUBMIT,
      userId: this.userId,
      sessionId: this.session?.id || null,
      elementId: form.id || '',
      elementSelector: this.#getElementSelector(form),
      properties: {
        formId: form.id,
        formData,
      },
    })

    this.session.addEvent(event)
    this.#processEvent(event)
  }

  /**
   * 追踪自定义事件
   */
  track(eventName, properties = {}) {
    if (!this.enabled) return

    const event = new AnalyticsEvent({
      type: EventType.CUSTOM,
      userId: this.userId,
      sessionId: this.session?.id || null,
      properties: {
        eventName,
        ...properties,
      },
    })

    this.session.addEvent(event)
    this.#processEvent(event)
  }

  /**
   * 设置用户 ID
   */
  setUserId(userId) {
    this.userId = userId
    this.session.userId = userId
    localStorage.setItem('analytics_user_id', userId)
  }

  /**
   * 获取会话信息
   */
  getSessionInfo() {
    return {
      sessionId: this.session?.id || null,
      userId: this.userId,
      duration: this.session?.getDuration() || 0,
      pageViews: this.session?.pageViews?.length || 0,
      events: this.session?.events?.length || 0,
      path: this.session?.path || null,
    }
  }

  /**
   * 获取热力图数据
   */
  getHeatmapData() {
    return { ...this.heatmapData }
  }

  /**
   * 清空热力图数据
   */
  clearHeatmapData() {
    this.heatmapData = new HeatmapData()
  }

  /**
   * 刷新事件队列
   */
  async flushEvents() {
    if (this.eventQueue.length === 0) return

    const events = [...this.eventQueue]
    this.eventQueue = []

    if (this.config.onBatch) {
      await this.config.onBatch(events)
    }

    this.emit('batch', events)
  }

  /**
   * 获取用户行为路径
   */
  getUserPath() {
    return this.session?.path || []
  }

  /**
   * 获取停留时间
   */
  getTimeOnPage(url = '') {
    if (!this.session) return 0;
  const pageViews = this.session.pageViews.filter((pv) => pv.url === url)
    if (pageViews.length === 0) return 0

    const firstView = pageViews[0]
    return Date.now() - firstView.timestamp
  }

  // ==================== 私有方法 ====================

  #getOrGenerateUserId() {
    if (typeof localStorage === 'undefined') return ''

    let userId = localStorage.getItem('analytics_user_id')
    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      localStorage.setItem('analytics_user_id', userId)
    }
    return userId
  }

  #getElementSelector(element) {
    if (element.id) return `#${element.id}`
    if (element.className) return `${element.tagName}.${element.className.split(' ')[0]}`
    return element.tagName
  }

  #bindGlobalEvents() {
    if (typeof window === 'undefined') return

    // 点击事件代理
    if (this.config.autoTrackClick) {
      document.addEventListener(
        'click',
        (e) => {
          this.trackClick(e.target)
        },
        true
      )
    }

    // 滚动事件（防抖）
    if (this.config.autoTrackScroll) {
      let scrollTimeout
      window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout)
        scrollTimeout = setTimeout(() => {
          const scrollPercent = Math.round(
            (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
          )
          this.trackScroll(scrollPercent)
        }, 500)
      })
    }
  }

  #processEvent(event) {
    this.eventQueue.push(event)

    // 触发单个事件回调
    if (this.config.onEvent) {
      this.config.onEvent(event)
    }

    this.emit('event', event)

    // 批量提交
    if (this.eventQueue.length >= this.batchSize) {
      this.flushEvents()
    }
  }
}

// 导出单例
export const analyticsManager = new AnalyticsManagerClass()

// 导出工具函数
export function createAnalyticsManager() {
  return new AnalyticsManagerClass()
}

// 默认导出
export default analyticsManager
