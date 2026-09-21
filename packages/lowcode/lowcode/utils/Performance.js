/**
 * 性能分析工具
 * 提供性能瓶颈定位、渲染时间追踪、内存使用监控
 */

// 性能指标收集器
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map()
    this.timers = new Map()
    this.observers = []
    this.enabled = false
    this.thresholds = {
      render: 16, // 16ms = 60fps
      task: 50,
      memory: 50 * 1024 * 1024, // 50MB
    }
  }

  /**
   * 启用性能监控
   */
  enable() {
    this.enabled = true
    this._initObservers()
    console.warn('[Performance] 性能监控已启用')
  }

  /**
   * 禁用性能监控
   */
  disable() {
    this.enabled = false
    this._disconnectObservers()
    console.warn('[Performance] 性能监控已禁用')
  }

  /**
   * 初始化性能观察器
   */
  _initObservers() {
    // 长任务观察
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            this._record('long-task', {
              duration: entry.duration,
              startTime: entry.startTime,
            })
          })
        })
        longTaskObserver.observe({ entryTypes: ['longtask'] })
        this.observers.push(longTaskObserver)
      } catch (e) {
        console.warn('[Performance] 长任务观察不支持')
      }
    }

    // 内存使用观察 (仅 Chrome)
    if (performance.memory) {
      this._monitorMemory()
    }
  }

  /**
   * 断开所有观察器
   */
  _disconnectObservers() {
    this.observers.forEach((obs) => obs.disconnect())
    this.observers = []
  }

  /**
   * 内存监控
   */
  _monitorMemory() {
    const checkMemory = () => {
      if (!performance.memory) return

      const used = performance.memory.usedJSHeapSize
      const limit = performance.memory.jsHeapSizeLimit

      if (used > this.thresholds.memory) {
        console.warn(`[Performance] 内存使用过高：${(used / 1024 / 1024).toFixed(2)}MB`)
      }

      this._record('memory', {
        used,
        limit,
        percent: Math.round((used / limit) * 100),
      })
    }

    checkMemory()
    const interval = setInterval(checkMemory, 5000)
    this.memoryInterval = interval
  }

  /**
   * 开始计时
   */
  startTimer(name) {
    this.timers.set(name, performance.now())
  }

  /**
   * 结束计时并记录
   */
  endTimer(name) {
    const startTime = this.timers.get(name)
    if (!startTime) {
      console.warn(`[Performance] 未找到计时器：${name}`)
      return null
    }

    const duration = performance.now() - startTime
    this.timers.delete(name)

    this._record('timer', { name, duration })

    if (duration > this.thresholds.render) {
      console.warn(`[Performance] 慢操作：${name} - ${duration.toFixed(2)}ms`)
    }

    return duration
  }

  /**
   * 包装函数进行性能分析
   */
  profile(fn, name) {
    return (...args) => {
      this.startTimer(name)
      const result = fn(...args)
      this.endTimer(name)
      return result
    }
  }

  /**
   * 异步函数包装
   */
  profileAsync(fn, name) {
    return async (...args) => {
      this.startTimer(name)
      try {
        const result = await fn(...args)
        this.endTimer(name)
        return result
      } catch (error) {
        this.endTimer(name)
        throw error
      }
    }
  }

  /**
   * 记录渲染时间
   */
  recordRender(componentName, duration) {
    this._record('render', { component: componentName, duration })

    if (duration > this.thresholds.render) {
      console.warn(`[Performance] 慢渲染：${componentName} - ${duration.toFixed(2)}ms`)
    }
  }

  /**
   * 记录指标
   */
  _record(type, data) {
    if (!this.enabled) return

    const key = `${type}:${Date.now()}`
    this.metrics.set(key, { type, data, timestamp: Date.now() })

    // 限制记录数量
    if (this.metrics.size > 1000) {
      const firstKey = this.metrics.keys().next().value
      this.metrics.delete(firstKey)
    }

    // 触发事件
    this.emit('metric', { type, data })
  }

  /**
   * 触发事件
   */
  emit(_event, _data) {
    // 简单的事件系统
  }

  /**
   * 获取性能报告
   */
  getReport() {
    const report = {
      timestamp: Date.now(),
      metrics: {},
      memory: performance.memory
        ? {
            used: performance.memory.usedJSHeapSize,
            limit: performance.memory.jsHeapSizeLimit,
          }
        : null,
      navigation: performance.getEntriesByType('navigation')?.[0]?.toJSON() || null,
      resources: performance.getEntriesByType('resource').map((r) => ({
        name: r.name,
        duration: r.duration,
        transferSize: r.transferSize,
      })),
    }

    // 统计指标
    const typeCount = {}
    this.metrics.forEach((metric) => {
      typeCount[metric.type] = (typeCount[metric.type] || 0) + 1
    })
    report.metrics = typeCount

    return report
  }

  /**
   * 设置阈值
   */
  setThresholds(thresholds) {
    this.thresholds = { ...this.thresholds, ...thresholds }
  }

  /**
   * 清空所有记录
   */
  clear() {
    this.metrics.clear()
    this.timers.clear()
  }
}

// 导出单例
export const performanceMonitor = new PerformanceMonitor()

// 快捷方法
export const startTimer = performanceMonitor.startTimer.bind(performanceMonitor)
export const endTimer = performanceMonitor.endTimer.bind(performanceMonitor)
export const profile = performanceMonitor.profile.bind(performanceMonitor)
export const profileAsync = performanceMonitor.profileAsync.bind(performanceMonitor)

// React 专用 Hook
export const useRenderMonitor = (componentName, enabled = true) => {
  React.useEffect(() => {
    if (!enabled || typeof PerformanceObserver === 'undefined') return

    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.entryType === 'paint') {
          performanceMonitor.recordRender(componentName, entry.duration)
        }
      })
    })

    try {
      observer.observe({ entryTypes: ['paint', 'measure'] })
    } catch (e) {
      // 不支持
    }

    return () => observer.disconnect()
  }, [componentName, enabled])
}

export default performanceMonitor
