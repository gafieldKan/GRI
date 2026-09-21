import React, { useState, useEffect } from 'react'
import { profiler } from '../../engine/Profiler.js'
import './styles.css'

/**
 * 性能分析面板组件
 */
export function ProfilerPanel({ onClose }) {
  const [metrics, setMetrics] = useState([])
  const [memory, setMemory] = useState(null)
  const [pagePerf, setPagePerf] = useState(null)

  useEffect(() => {
    // 监听性能指标
    const handleMetric = ({ metric }) => {
      setMetrics((prev) => [metric, ...prev].slice(50))
    }

    profiler.on('metric', handleMetric)

    // 获取内存
    const mem = profiler.getMemoryUsage()
    if (mem) setMemory(mem)

    // 获取页面性能
    const perf = profiler.getPagePerformance()
    if (perf) setPagePerf(perf)

    return () => {
      profiler.off('metric', handleMetric)
    }
  }, [])

  const stats = {
    fcp: profiler.getStats('first-contentful-paint'),
    lcp: profiler.getStats('largest-contentful-paint'),
  }

  return (
    <div className="profiler-panel">
      <div className="profiler-header">
        <h3>性能分析</h3>
        <button className="close-btn" onClick={onClose}>
          ×
        </button>
      </div>

      {/* 内存使用 */}
      <div className="profiler-section">
        <h4>内存使用</h4>
        {memory ? (
          <div className="memory-stats">
            <div className="memory-stat">
              <span className="stat-label">JS 堆大小</span>
              <span className="stat-value">{(memory.jsHeapSize / 1024 / 1024).toFixed(2)} MB</span>
            </div>
            <div className="memory-stat">
              <span className="stat-label">已用堆大小</span>
              <span className="stat-value">
                {(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB
              </span>
            </div>
            <div className="memory-stat">
              <span className="stat-label">堆限制</span>
              <span className="stat-value">
                {(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB
              </span>
            </div>
          </div>
        ) : (
          <div className="empty-message">内存数据不可用</div>
        )}
      </div>

      {/* 页面性能 */}
      <div className="profiler-section">
        <h4>页面性能</h4>
        {pagePerf ? (
          <div className="perf-stats">
            <div className="perf-stat">
              <span className="stat-label">TTFB</span>
              <span className="stat-value">{pagePerf.ttfb} ms</span>
            </div>
            <div className="perf-stat">
              <span className="stat-label">FCP</span>
              <span className="stat-value">{pagePerf.fcp} ms</span>
            </div>
            <div className="perf-stat">
              <span className="stat-label">LCP</span>
              <span className="stat-value">{pagePerf.lcp} ms</span>
            </div>
            <div className="perf-stat">
              <span className="stat-label">DOM Ready</span>
              <span className="stat-value">{pagePerf.domContentLoaded} ms</span>
            </div>
            <div className="perf-stat">
              <span className="stat-label">Load Complete</span>
              <span className="stat-value">{pagePerf.loadComplete} ms</span>
            </div>
          </div>
        ) : (
          <div className="empty-message">性能数据不可用</div>
        )}
      </div>

      {/* 统计信息 */}
      <div className="profiler-section">
        <h4>统计信息</h4>
        <div className="stats-table">
          {Object.entries(stats).map(
            ([name, stat]) =>
              stat && (
                <div key={name} className="stats-row">
                  <span className="stats-name">{name}</span>
                  <span className="stats-avg">{stat.avg} ms</span>
                  <span className="stats-min">{stat.min} ms</span>
                  <span className="stats-max">{stat.max} ms</span>
                  <span className="stats-count">{stat.count} 次</span>
                </div>
              )
          )}
        </div>
      </div>

      {/* 最近指标 */}
      <div className="profiler-section">
        <h4>最近指标</h4>
        <div className="metrics-list">
          {metrics.length > 0 ? (
            metrics.slice(0, 20).map((metric, i) => (
              <div key={i} className="metric-item">
                <span className="metric-name">{metric.name}</span>
                <span className="metric-value">
                  {metric.value} {metric.unit}
                </span>
              </div>
            ))
          ) : (
            <div className="empty-message">暂无指标</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProfilerPanel
