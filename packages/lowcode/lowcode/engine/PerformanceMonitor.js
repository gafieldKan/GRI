/**
 * 性能监控引擎
 * 页面性能分析、慢查询监控、性能瓶颈诊断
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 性能指标类型
 */
export const MetricType = {
  FCP: 'fcp', // First Contentful Paint
  LCP: 'lcp', // Largest Contentful Paint
  FID: 'fid', // First Input Delay
  CLS: 'cls', // Cumulative Layout Shift
  TTI: 'tti', // Time to Interactive
  TTFB: 'ttfb', // Time to First Byte
  RESOURCE: 'resource', // 资源加载
  API: 'api', // API 请求
}

/**
 * 性能阈值配置
 */
const THRESHOLDS = {
  fcp: { good: 1000, needsImprovement: 2500, poor: 2500 },
  lcp: { good: 2500, needsImprovement: 4000, poor: 4000 },
  fid: { good: 100, needsImprovement: 300, poor: 300 },
  cls: { good: 0.1, needsImprovement: 0.25, poor: 0.25 },
  tti: { good: 3000, needsImprovement: 5000, poor: 5000 },
  ttfb: { good: 800, needsImprovement: 1500, poor: 1500 },
  api: { good: 300, needsImprovement: 1000, poor: 1000 },
}

/**
 * 性能指标类
 */
export class PerformanceMetric {
  constructor(type, value, timestamp = Date.now()) {
    this.type = type
    this.value = value
    this.timestamp = timestamp
    this.rating = this.#calculateRating(value, type)
  }

  #calculateRating(value, type) {
    const thresholds = THRESHOLDS[type]
    if (!thresholds) return 'unknown'
    if (value <= thresholds.good) return 'good'
    if (value <= thresholds.needsImprovement) return 'needs-improvement'
    return 'poor'
  }

  toJSON() {
    return {
      type: this.type,
      value: this.value,
      timestamp: this.timestamp,
      rating: this.rating,
    }
  }
}

/**
 * 性能监控主类
 */
class PerformanceMonitorClass extends EventEmitter {
  constructor() {
    super()
    this.metrics = new Map()
    this.apiTimings = new Map()
    this.resourceTimings = new Map()
    this.observers = new Map()
    this.enabled = false
    this.reportUrl = ''
    this.reportInterval = 60000
    this.reportTimer = null
  }

  /**
   * 启动性能监控
   */
  start(options = {}) {
    if (typeof window === 'undefined') {
      console.warn('[PerformanceMonitor] 仅在浏览器环境中可用')
      return
    }

    this.enabled = true
    this.reportUrl = options.reportUrl || ''
    this.reportInterval = options.reportInterval || 60000

    // 监听核心 Web 指标
    this.#observeFCP()
    this.#observeLCP()
    this.#observeFID()
    this.#observeCLS()
    this.#observeTTI()

    // 监听资源加载
    this.#observeResources()

    // 启动定时报告
    this.#startReporting()

    this.emit('start')
  }

  /**
   * 停止监控
   */
  stop() {
    this.enabled = false
    this.#stopReporting()
    this.#disconnectObservers()
    this.emit('stop')
  }

  /**
   * 观察 FCP
   */
  #observeFCP() {
    if (typeof PerformanceObserver === 'undefined') return

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        entries.forEach((entry) => {
          if (entry.name === 'first-contentful-paint') {
            const metric = new PerformanceMetric(MetricType.FCP, entry.startTime)
            this.metrics.set('fcp', metric)
            this.emit('metric', metric)
          }
        })
      })
      observer.observe({ entryTypes: ['paint'] })
      this.observers.set('fcp', observer)
    } catch (e) {
      console.warn('[PerformanceMonitor] FCP 观察失败:', e)
    }
  }

  /**
   * 观察 LCP
   */
  #observeLCP() {
    if (typeof PerformanceObserver === 'undefined') return

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1]
        const metric = new PerformanceMetric(MetricType.LCP, lastEntry.startTime)
        this.metrics.set('lcp', metric)
        this.emit('metric', metric)
      })
      observer.observe({ entryTypes: ['largest-contentful-paint'] })
      this.observers.set('lcp', observer)
    } catch (e) {
      console.warn('[PerformanceMonitor] LCP 观察失败:', e)
    }
  }

  /**
   * 观察 FID
   */
  #observeFID() {
    if (typeof window === 'undefined') return

    const onFID = (event) => {
      const timing = event.timeStamp - event.entry.startTime
      const metric = new PerformanceMetric(MetricType.FID, timing)
      this.metrics.set('fid', metric)
      this.emit('metric', metric)
    }

    try {
      new PerformanceObserver((list) => {
        list.getEntries().forEach(onFID)
      }).observe({ entryTypes: ['first-input'] })
    } catch (e) {
      console.warn('[PerformanceMonitor] FID 观察失败:', e)
    }
  }

  /**
   * 观察 CLS
   */
  #observeCLS() {
    if (typeof PerformanceObserver === 'undefined') return

    try {
      let clsValue = 0
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value
          }
        })
        const metric = new PerformanceMetric(MetricType.CLS, clsValue)
        this.metrics.set('cls', metric)
        this.emit('metric', metric)
      })
      observer.observe({ entryTypes: ['layout-shift'] })
      this.observers.set('cls', observer)
    } catch (e) {
      console.warn('[PerformanceMonitor] CLS 观察失败:', e)
    }
  }

  /**
   * 观察 TTI
   */
  #observeTTI() {
    if (typeof window === 'undefined') return

    const start = performance.now()
    const checkTTI = () => {
      if (document.readyState === 'complete') {
        const tti = performance.now() - start
        const metric = new PerformanceMetric(MetricType.TTI, tti)
        this.metrics.set('tti', metric)
        this.emit('metric', metric)
      } else {
        requestAnimationFrame(checkTTI)
      }
    }
    checkTTI()
  }

  /**
   * 观察资源加载
   */
  #observeResources() {
    if (typeof PerformanceObserver === 'undefined') return

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        entries.forEach((entry) => {
          const timing = {
            name: entry.name,
            type: entry.initiatorType,
            duration: entry.duration,
            startTime: entry.startTime,
            transferSize: entry.transferSize,
            encodedBodySize: entry.encodedBodySize,
          }
          this.resourceTimings.set(entry.name, timing)
          this.emit('resource', timing)
        })
      })
      observer.observe({ entryTypes: ['resource'] })
      this.observers.set('resources', observer)
    } catch (e) {
      console.warn('[PerformanceMonitor] 资源观察失败:', e)
    }
  }

  /**
   * 断开所有观察者
   */
  #disconnectObservers() {
    this.observers.forEach((observer) => {
      observer.disconnect()
    })
    this.observers.clear()
  }

  /**
   * 开始定时报告
   */
  #startReporting() {
    if (this.reportTimer) {
      clearInterval(this.reportTimer)
    }
    this.reportTimer = setInterval(() => {
      this.#report()
    }, this.reportInterval)
  }

  /**
   * 停止定时报告
   */
  #stopReporting() {
    if (this.reportTimer) {
      clearInterval(this.reportTimer)
      this.reportTimer = null
    }
  }

  /**
   * 上报告性能数据
   */
  #report() {
    const report = this.getReport()
    this.emit('report', report)

    if (this.reportUrl) {
      this.#sendReport(report)
    }
  }

  /**
   * 发送报告到服务器
   */
  async #sendReport(report) {
    try {
      await navigator.sendBeacon(this.reportUrl, JSON.stringify(report))
    } catch (e) {
      console.warn('[PerformanceMonitor] 报告发送失败:', e)
    }
  }

  /**
   * 开始 API 计时
   */
  startApiTimer(apiId) {
    this.apiTimings.set(apiId, { start: performance.now() })
  }

  /**
   * 结束 API 计时
   */
  endApiTimer(apiId) {
    const timing = this.apiTimings.get(apiId)
    if (!timing) return

    const duration = performance.now() - timing.start
    const metric = new PerformanceMetric(MetricType.API, duration)
    this.emit('api', { id: apiId, duration, metric })
    this.apiTimings.delete(apiId)
    return duration
  }

  /**
   * 获取性能报告
   */
  getReport() {
    const metrics = {}
    this.metrics.forEach((metric, key) => {
      metrics[key] = metric.toJSON()
    })

    const slowResources = []
    this.resourceTimings.forEach((timing) => {
      if (timing.duration > 1000) {
        slowResources.push(timing)
      }
    })

    return {
      timestamp: Date.now(),
      metrics,
      slowResources: slowResources.slice(0, 10),
      url: typeof window !== 'undefined' ? window.location.href : '',
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    }
  }

  /**
   * 获取所有指标
   */
  getMetrics() {
    const result = {}
    this.metrics.forEach((metric, key) => {
      result[key] = metric.value
    })
    return result
  }

  /**
   * 清除数据
   */
  clear() {
    this.metrics.clear()
    this.apiTimings.clear()
    this.resourceTimings.clear()
  }
}

// 导出单例
export const performanceMonitor = new PerformanceMonitorClass()
export default performanceMonitor
