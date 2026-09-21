import React, { useState, useRef, useCallback } from 'react'
import './MobileRefresh.css'

/**
 * 移动端上拉刷新组件
 * 支持下拉刷新和上拉加载更多
 */
export function MobilePullRefresh({
  onRefresh,
  onLoadMore,
  children,
  className = '',
  refreshThreshold = 80,
  hasMore = true,
  loading = false,
}) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const startY = useRef(0)
  const containerRef = useRef(null)

  const handleTouchStart = useCallback((e) => {
    startY.current = e.touches[0].clientY
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (containerRef.current) {
      const currentY = e.touches[0].clientY
      const diff = currentY - startY.current
      const scrollTop = containerRef.current.scrollTop

      // 只有在顶部时才允许下拉刷新
      if (diff > 0 && scrollTop === 0) {
        setPullDistance(Math.min(diff, 120))
      }
    }
  }, [])

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance > refreshThreshold) {
      setIsRefreshing(true)
      try {
        await onRefresh?.()
      } finally {
        setIsRefreshing(false)
      }
    }
    setPullDistance(0)
  }, [pullDistance, refreshThreshold, onRefresh])

  const handleScroll = useCallback(
    async (e) => {
      const { scrollTop, scrollHeight, clientHeight } = e.target
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50

      if (isNearBottom && hasMore && !isLoadingMore && !loading) {
        setIsLoadingMore(true)
        try {
          await onLoadMore?.()
        } finally {
          setIsLoadingMore(false)
        }
      }
    },
    [hasMore, isLoadingMore, loading, onLoadMore]
  )

  return (
    <div
      ref={containerRef}
      className={`mobile-pull-refresh ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onScroll={handleScroll}
    >
      {/* 下拉刷新指示器 */}
      <div className="refresh-indicator" style={{ height: pullDistance }}>
        {pullDistance > 0 && (
          <div className="refresh-content">
            {pullDistance > refreshThreshold ? '释放刷新' : '下拉刷新'}
            {isRefreshing && <span className="loading-spinner" />}
          </div>
        )}
      </div>

      {/* 内容区域 */}
      <div
        className="refresh-content-wrapper"
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : 'none',
          transition: pullDistance > 0 ? 'transform 0.2s' : 'none',
        }}
      >
        {children}
      </div>

      {/* 上拉加载更多指示器 */}
      {(isLoadingMore || loading) && hasMore && (
        <div className="load-more-indicator">
          <span className="loading-spinner" />
          <span>加载中...</span>
        </div>
      )}

      {!hasMore && (
        <div className="no-more-indicator">
          <span>没有更多了</span>
        </div>
      )}
    </div>
  )
}

/**
 * 移动端弹窗组件
 */
export function MobileModal({
  visible,
  title,
  children,
  onOk,
  onCancel,
  okText = '确认',
  cancelText = '取消',
  showCancel = true,
  className = '',
}) {
  if (!visible) return null

  return (
    <div className="mobile-modal-overlay">
      <div className={`mobile-modal ${className}`}>
        {title && <div className="mobile-modal-title">{title}</div>}
        <div className="mobile-modal-content">{children}</div>
        <div className="mobile-modal-footer">
          {showCancel && (
            <button className="mobile-modal-btn cancel" onClick={onCancel}>
              {cancelText}
            </button>
          )}
          <button className="mobile-modal-btn ok" onClick={onOk}>
            {okText}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 移动端 ActionSheet 组件
 */
export function MobileActionSheet({
  visible,
  title,
  actions = [],
  onCancel,
  onSelect,
  className = '',
}) {
  if (!visible) return null

  return (
    <div className="mobile-action-sheet-overlay" onClick={onCancel}>
      <div className={`mobile-action-sheet ${className}`} onClick={(e) => e.stopPropagation()}>
        {title && <div className="action-sheet-title">{title}</div>}
        {actions.map((action, index) => (
          <button
            key={index}
            className="action-sheet-item"
            onClick={() => onSelect?.(action)}
            style={{ color: action.color || '#333' }}
          >
            {action.label}
          </button>
        ))}
        <button className="action-sheet-cancel" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}

/**
 * 移动端 Toast 提示
 */
export function MobileToast({ visible, message, type = 'text', duration = 2000, onClose }) {
  const [isVisible, setIsVisible] = useState(visible)

  React.useEffect(() => {
    if (visible) {
      setIsVisible(true)
      const timer = setTimeout(() => {
        setIsVisible(false)
        onClose?.()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [visible, duration, onClose])

  if (!isVisible) return null

  return (
    <div className={`mobile-toast ${type}`}>
      {type === 'success' && <span className="toast-icon">✓</span>}
      {type === 'error' && <span className="toast-icon">✗</span>}
      {type === 'loading' && <span className="toast-icon loading-spinner" />}
      <span className="toast-message">{message}</span>
    </div>
  )
}

export default {
  MobilePullRefresh,
  MobileModal,
  MobileActionSheet,
  MobileToast,
}
