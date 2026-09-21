/**
 * 性能分析器
 * 监控页面渲染耗时、接口响应时间、内存占用等性能指标
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 性能指标类
 */
export class PerformanceMetric {
  constructor(name, value, unit = 'ms') {
    this.id = `metric_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    this.name = name
    this.value = value
    this.unit = unit
    this.timestamp = Date.now()
    this.tags = {}
  }
}

/**
 * 性能分析器主类
 */
class ProfilerClass extends EventEmitter {
  constructor() {
    super()
    this.metrics = new Map()
    this.timers = new Map()
    this.enabled = false
    this.history = []
    this.maxHistory = 100
  }

  /**
   * 初始化性能分析器
   */
  init(config = {}) {
    this.enabled = config.enabled ?? true

    if (this.enabled && typeof window !== 'undefined') {
      this.#initPerformanceObserver()
      this.#initMemoryObserver()
    }

    this.emit('init', { config })
    return this
  }

  /**
   * 开始计时
   */
  startTimer(name) {
    if (!this.enabled) return
    this.timers.set(name, Date.now())
  }

  /**
   * 结束计时并记录
   */
  endTimer(name) {
    if (!this.enabled) return null

    const startTime = this.timers.get(name)
    if (!startTime) return null

    const duration = Date.now() - startTime
    this.recordMetric(name, duration, 'ms')
    this.timers.delete(name)
    return duration
  }

  /**
   * 记录性能指标
   */
  recordMetric(name, value, unit = 'ms', tags = {}) {
    const metric = new PerformanceMetric(name, value, unit)
    metric.tags = tags
    this.metrics.set(metric.id, metric)

    // 添加到历史
    this.history.push({ name, value, unit, timestamp: Date.now(), tags })
    if (this.history.length > this.maxHistory) {
      this.history.shift()
    }

    this.emit('metric', { metric })
    return metric
  }

  /**
   * 获取性能指标
   */
  getMetrics(filter = {}) {
    const metrics = Array.from(this.metrics.values())

    if (filter.name) {
      return metrics.filter((m) => m.name === filter.name)
    }

    return metrics
  }

  /**
   * 获取历史数据
   */
  getHistory(options = {}) {
    const { name, startTime, endTime } = options
    let history = [...this.history]

    if (name) {
      history = history.filter((h) => h.name === name)
    }
    if (startTime) {
      history = history.filter((h) => h.timestamp >= startTime)
    }
    if (endTime) {
      history = history.filter((h) => h.timestamp <= endTime)
    }

    return history
  }

  /**
   * 获取统计信息
   */
  getStats(name) {
    const history = this.getHistory({ name })
    if (history.length === 0) return null

    const values = history.map((h) => h.value)
    const sum = values.reduce((a, b) => a + b, 0)
    const avg = sum / values.length
    const min = Math.min(...values)
    const max = Math.max(...values)

    return {
      name,
      count: values.length,
      avg: Math.round(avg * 100) / 100,
      min,
      max,
      sum,
    }
  }

  /**
   * 清除数据
   */
  clear() {
    this.metrics.clear()
    this.timers.clear()
    this.history = []
    this.emit('clear')
  }

  /**
   * 获取内存使用情况
   */
  getMemoryUsage() {
    if (typeof performance === 'undefined') return null

    const memory = performance.memory || {}
    return {
      jsHeapSize: memory.jsHeapSize || 0,
      usedJSHeapSize: memory.usedJSHeapSize || 0,
      jsHeapSizeLimit: memory.jsHeapSizeLimit || 0,
    }
  }

  /**
   * 获取页面性能指标
   */
  getPagePerformance() {
    if (typeof performance === 'undefined') return null

    const timing = performance.timing || {}
    const navigation = performance.getEntriesByType?.('navigation')?.[0]

    return {
      // 首字节时间 (TTFB)
      ttfb: navigation?.responseStart || 0,
      // 首次内容绘制 (FCP)
      fcp: this.#getMetric('first-contentful-paint'),
      // 最大内容绘制 (LCP)
      lcp: this.#getMetric('largest-contentful-paint'),
      // 首次输入延迟 (FID)
      fid: this.#getMetric('first-input-delay'),
      // 累积布局偏移 (CLS)
      cls: this.#getMetric('cumulative-layout-shift'),
      // DOM 加载完成
      domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
      // 页面完全加载
      loadComplete: timing.loadEventEnd - timing.navigationStart,
    }
  }

  // ==================== 私有方法 ====================

  #initPerformanceObserver() {
    if (typeof PerformanceObserver === 'undefined') return

    try {
      // 观察 FCP
      new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          this.recordMetric('first-contentful-paint', entry.startTime, 'ms', {
            type: 'paint',
          })
        })
      }).observe({ type: 'paint', buffered: true })

      // 观察 LCP
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1]
        this.recordMetric('largest-contentful-paint', lastEntry.startTime, 'ms', {
          type: 'largest-contentful-paint',
        })
      }).observe({ type: 'largest-contentful-paint', buffered: true })

      // 观察长任务
      new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.duration > 50) {
            this.recordMetric('long-task', entry.duration, 'ms', {
              name: entry.name,
            })
          }
        })
      }).observe({ type: 'longtask', buffered: true })
    } catch (error) {
      console.warn('性能观察器初始化失败:', error)
    }
  }

  #initMemoryObserver() {
    if (typeof performance === 'undefined') return

    // 定期采集内存数据
    setInterval(() => {
      const memory = this.getMemoryUsage()
      if (memory) {
        this.recordMetric('memory', memory.usedJSHeapSize, 'bytes', {
          type: 'memory',
        })
      }
    }, 10000)
  }

  #getMetric(name) {
    const entries = performance.getEntriesByName?.(name)
    return entries?.[0]?.startTime || 0
  }
}

// 导出单例
export const profiler = new ProfilerClass()

// 导出工具函数
export function createProfiler() {
  return new ProfilerClass()
}

export default profiler
