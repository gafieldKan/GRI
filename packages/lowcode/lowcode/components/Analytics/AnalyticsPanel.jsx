import React, { useState, useEffect } from 'react'
import { analyticsManager, EventType } from '../../engine/AnalyticsManager.js'
import './styles.css'

/**
 * 用户行为分析面板
 */
export function AnalyticsPanel({ onClose }) {
  const [sessionInfo, setSessionInfo] = useState(null)
  const [events, setEvents] = useState([])
  const [userPath, setUserPath] = useState([])
  const [heatmapData, setHeatmapData] = useState(null)

  useEffect(() => {
    loadAnalyticsData()

    // 监听新事件
    const handleEvent = (event) => {
      setEvents((prev) => [event, ...prev].slice(0, 100))
    }

    analyticsManager.on('event', handleEvent)
    return () => {
      analyticsManager.off('event', handleEvent)
    }
  }, [])

  const loadAnalyticsData = () => {
    const info = analyticsManager.getSessionInfo()
    setSessionInfo(info)
    setUserPath(analyticsManager.getUserPath())
    setHeatmapData(analyticsManager.getHeatmapData())
  }

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  const getEventIcon = (type) => {
    switch (type) {
      case EventType.PAGE_VIEW:
        return '📄'
      case EventType.CLICK:
        return '🖱️'
      case EventType.SCROLL:
        return '📜'
      case EventType.SUBMIT:
        return '✅'
      default:
        return '📊'
    }
  }

  return (
    <div className="analytics-panel">
      <div className="analytics-header">
        <h3>用户行为分析</h3>
        <button className="close-btn" onClick={onClose}>
          ×
        </button>
      </div>

      {/* 会话摘要 */}
      <div className="analytics-section">
        <h4>会话摘要</h4>
        {sessionInfo ? (
          <div className="session-summary">
            <div className="summary-item">
              <span className="label">会话 ID:</span>
              <span className="value">{sessionInfo.sessionId}</span>
            </div>
            <div className="summary-item">
              <span className="label">用户 ID:</span>
              <span className="value">{sessionInfo.userId}</span>
            </div>
            <div className="summary-item">
              <span className="label">会话时长:</span>
              <span className="value">{formatDuration(sessionInfo.duration)}</span>
            </div>
            <div className="summary-item">
              <span className="label">页面浏览:</span>
              <span className="value">{sessionInfo.pageViews}</span>
            </div>
            <div className="summary-item">
              <span className="label">事件数量:</span>
              <span className="value">{sessionInfo.events}</span>
            </div>
          </div>
        ) : (
          <div className="empty-message">暂无会话数据</div>
        )}
      </div>

      {/* 用户路径 */}
      <div className="analytics-section">
        <h4>用户路径</h4>
        <div className="user-path">
          {userPath.length > 0 ? (
            userPath.map((item, index) => (
              <div key={index} className="path-item">
                <span className="path-time">{formatTime(item.timestamp)}</span>
                <span className="path-value">{item.path}</span>
              </div>
            ))
          ) : (
            <div className="empty-message">暂无路径数据</div>
          )}
        </div>
      </div>

      {/* 热力图数据 */}
      <div className="analytics-section">
        <h4>热力图数据</h4>
        {heatmapData && (heatmapData.clicks?.length > 0 || heatmapData.scrolls?.length > 0) ? (
          <div className="heatmap-summary">
            <div className="heatmap-stat">
              <span className="stat-value">{heatmapData.clicks?.length || 0}</span>
              <span className="stat-label">点击</span>
            </div>
            <div className="heatmap-stat">
              <span className="stat-value">{heatmapData.scrolls?.length || 0}</span>
              <span className="stat-label">滚动</span>
            </div>
          </div>
        ) : (
          <div className="empty-message">暂无热力图数据</div>
        )}
      </div>

      {/* 事件列表 */}
      <div className="analytics-section">
        <h4>事件列表</h4>
        <div className="event-list">
          {events.length > 0 ? (
            events.map((event, index) => (
              <div key={index} className="event-item">
                <span className="event-icon">{getEventIcon(event.type)}</span>
                <div className="event-content">
                  <div className="event-header">
                    <span className="event-type">{event.type}</span>
                    <span className="event-time">{formatTime(event.timestamp)}</span>
                  </div>
                  {event.elementSelector && (
                    <div className="event-element">{event.elementSelector}</div>
                  )}
                  {event.properties && (
                    <pre className="event-properties">
                      {JSON.stringify(event.properties, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-message">暂无事件</div>
          )}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="analytics-actions">
        <button className="btn-export" onClick={() => console.log('Export events')}>
          导出事件
        </button>
        <button className="btn-clear" onClick={() => setEvents([])}>
          清空事件
        </button>
      </div>
    </div>
  )
}

export default AnalyticsPanel
