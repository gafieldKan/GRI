/**
 * 调试工具 Hooks
 */

import { useEffect, useRef, useCallback } from 'react'
import { eventEngine } from '../../engine/EventEngine'

/**
 * 调试模式 Hook
 */
export const useDebugMode = (options = {}) => {
  const { enabled = true, trackEvents = true } = options

  useEffect(() => {
    if (enabled && trackEvents) {
      eventEngine.setDebugMode(true)
    }

    return () => {
      if (enabled) {
        eventEngine.setDebugMode(false)
      }
    }
  }, [enabled, trackEvents])

  return {
    isEnabled: enabled,
    setDebugMode: (mode) => {
      eventEngine.setDebugMode(mode)
    },
  }
}

/**
 * 事件追踪 Hook
 */
export const useEventTracker = (events = [], callback) => {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!events.length) return

    const handlers = []

    events.forEach((eventName) => {
      const handlerId = eventEngine.on(eventName, (..._args) => {
        callbackRef.current?.(eventName)
      })
      handlers.push({ event: eventName, id: handlerId })
    })

    return () => {
      handlers.forEach(({ event, id }) => {
        eventEngine.off(event, id)
      })
    }
  }, [events])
}

/**
 * 性能监控 Hook
 */
export const usePerformanceMonitor = (options = {}) => {
  const {
    trackRerenders = true,
    trackLongTasks = true,
    threshold = 50, // ms
  } = options

  const renderTimes = useRef([])
  const frameIds = useRef([])

  const trackRender = useCallback(
    (componentName) => {
      if (!trackRerenders) return

      const startTime = performance.now()
      const frameId = requestAnimationFrame(() => {
        const duration = performance.now() - startTime
        renderTimes.current.push({ componentName, duration, time: Date.now() })

        // 保留最近 100 次记录
        if (renderTimes.current.length > 100) {
          renderTimes.current.shift()
        }

        // 检测慢渲染
        if (duration > threshold) {
          console.warn(`[Performance] 慢渲染：${componentName} - ${duration.toFixed(2)}ms`)
        }
      })

      frameIds.current.push(frameId)
      return () => cancelAnimationFrame(frameId)
    },
    [trackRerenders, threshold]
  )

  // 监控长任务 (Long Tasks API)
  useEffect(() => {
    if (!trackLongTasks || !('PerformanceObserver' in window)) return

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > threshold) {
          console.warn(`[Performance] 长任务：${entry.duration.toFixed(2)}ms`, entry)
        }
      }
    })

    observer.observe({ entryTypes: ['longtask'] })

    return () => {
      observer.disconnect()
    }
  }, [trackLongTasks, threshold])

  // 清理
  useEffect(() => {
    return () => {
      // 使用函数式更新避免直接访问 ref
      requestAnimationFrame(() => {
        frameIds.current.forEach((id) => cancelAnimationFrame(id))
      })
    }
  }, [])

  return {
    trackRender,
    getRenderStats: () => {
      if (renderTimes.current.length === 0) return null

      const durations = renderTimes.current.map((r) => r.duration)
      return {
        count: durations.length,
        avg: durations.reduce((a, b) => a + b, 0) / durations.length,
        min: Math.min(...durations),
        max: Math.max(...durations),
        history: renderTimes.current.slice(-10),
      }
    },
  }
}

/**
 * 调试日志 Hook
 */
export const useDebugLog = (prefix = 'Debug', enabled = true) => {
  const log = useCallback(
    (...args) => {
      if (enabled) {
        console.log(`[${prefix}]`, ...args)
      }
    },
    [prefix, enabled]
  )

  const warn = useCallback(
    (...args) => {
      if (enabled) {
        console.warn(`[${prefix}]`, ...args)
      }
    },
    [prefix, enabled]
  )

  const error = useCallback(
    (...args) => {
      if (enabled) {
        console.error(`[${prefix}]`, ...args)
      }
    },
    [prefix, enabled]
  )

  return { log, warn, error }
}

export default {
  useDebugMode,
  useEventTracker,
  usePerformanceMonitor,
  useDebugLog,
}
