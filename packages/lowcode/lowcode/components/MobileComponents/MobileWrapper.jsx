/**
 * 移动端组件包装器
 * 为移动端优化的触摸交互和响应式布局
 *
 * @author GRI Team
 * @version 1.0
 */

import React, { useState, useEffect, useCallback } from 'react'

/**
 * 移动端设备检测 Hook
 */
export function useMobileDevice() {
  const [isMobile, setIsMobile] = useState(false)
  const [isTouch, setIsTouch] = useState(false)
  const [screenWidth, setScreenWidth] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const checkDevice = () => {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      )
      const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0

      setIsMobile(mobile || window.innerWidth < 768)
      setIsTouch(touch)
      setScreenWidth(window.innerWidth)
    }

    checkDevice()
    window.addEventListener('resize', checkDevice)
    return () => window.removeEventListener('resize', checkDevice)
  }, [])

  return { isMobile, isTouch, screenWidth }
}

/**
 * 移动端触摸优化 Hook
 */
export function useTouchOptimization() {
  const [touchProps, setTouchProps] = useState({})

  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0]
    setTouchProps({
      isTouching: true,
      startX: touch.clientX,
      startY: touch.clientY,
    })
  }, [])

  const handleTouchEnd = useCallback((e) => {
    setTouchProps((prev) => ({ ...prev, isTouching: false }))
  }, [])

  return {
    touchProps,
    handleTouchStart,
    handleTouchEnd,
  }
}

/**
 * 移动端容器组件
 */
export function MobileContainer({ children, className = '', style = {} }) {
  const { isMobile } = useMobileDevice()

  return (
    <div
      className={`mobile-container ${isMobile ? 'is-mobile' : ''} ${className}`}
      style={{
        maxWidth: isMobile ? '100%' : '480px',
        margin: '0 auto',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/**
 * 移动端触摸按钮组件
 */
export function MobileButton({ children, onClick, onTouch, className = '', style = {}, ...props }) {
  const [isActive, setIsActive] = useState(false)

  const handleTouchStart = (e) => {
    setIsActive(true)
    onTouch?.(e)
  }

  const handleTouchEnd = (e) => {
    setIsActive(false)
  }

  return (
    <button
      className={`mobile-button ${isActive ? 'active' : ''} ${className}`}
      style={{
        padding: '12px 24px',
        borderRadius: '8px',
        border: 'none',
        background: '#1677ff',
        color: '#fff',
        fontSize: '16px',
        WebkitTapHighlightColor: 'transparent',
        transform: isActive ? 'scale(0.98)' : 'scale(1)',
        transition: 'transform 0.1s',
        ...style,
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  )
}

/**
 * 移动端列表项组件
 */
export function MobileListItem({ children, onClick, className = '', style = {} }) {
  const [isActive, setIsActive] = useState(false)

  return (
    <div
      className={`mobile-list-item ${isActive ? 'active' : ''} ${className}`}
      style={{
        padding: '16px',
        borderBottom: '1px solid #f0f0f0',
        background: isActive ? '#f5f5f5' : '#fff',
        transition: 'background 0.2s',
        ...style,
      }}
      onTouchStart={() => setIsActive(true)}
      onTouchEnd={() => setIsActive(false)}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

/**
 * 移动端卡片组件
 */
export function MobileCard({ children, className = '', style = {} }) {
  return (
    <div
      className={`mobile-card ${className}`}
      style={{
        background: '#fff',
        borderRadius: '12px',
        padding: '16px',
        margin: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/**
 * 移动端导航栏组件
 */
export function MobileNavBar({ title, onBack, children, className = '', style = {} }) {
  return (
    <div
      className={`mobile-nav-bar ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: '#fff',
        borderBottom: '1px solid #f0f0f0',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        ...style,
      }}
    >
      {onBack && (
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '20px',
            padding: '8px',
            cursor: 'pointer',
          }}
        >
          ←
        </button>
      )}
      <span
        style={{
          flex: 1,
          textAlign: 'center',
          fontWeight: 600,
          fontSize: '18px',
        }}
      >
        {title}
      </span>
      {children}
    </div>
  )
}

/**
 * 移动端底部标签栏组件
 */
export function MobileTabBar({ tabs, activeTab, onChange, className = '', style = {} }) {
  return (
    <div
      className={`mobile-tab-bar ${className}`}
      style={{
        display: 'flex',
        borderTop: '1px solid #f0f0f0',
        background: '#fff',
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        ...style,
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`tab-item ${activeTab === tab.key ? 'active' : ''}`}
          onClick={() => onChange?.(tab.key)}
          style={{
            flex: 1,
            padding: '8px 0',
            background: 'none',
            border: 'none',
            fontSize: '12px',
            color: activeTab === tab.key ? '#1677ff' : '#999',
            borderBottom: activeTab === tab.key ? '2px solid #1677ff' : 'none',
          }}
        >
          {tab.icon && <span>{tab.icon}</span>}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * 移动端上拉加载组件
 */
export function MobilePullToRefresh({ onRefresh, children, className = '' }) {
  const [pulling, setPulling] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const startY = 0
  const currentY = 0

  const handleTouchStart = (e) => {
    startY = e.touches[0].clientY
  }

  const handleTouchMove = (e) => {
    currentY = e.touches[0].clientY
    const diff = currentY - startY

    if (diff > 0 && window.scrollY === 0) {
      setPulling(true)
    }
  }

  const handleTouchEnd = async () => {
    if (pulling) {
      setRefreshing(true)
      await onRefresh?.()
      setRefreshing(false)
    }
    setPulling(false)
  }

  return (
    <div
      className={`mobile-pull-refresh ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {pulling && <div className="pull-indicator">下拉刷新</div>}
      {refreshing && <div className="refreshing-indicator">刷新中...</div>}
      {children}
    </div>
  )
}

export default {
  useMobileDevice,
  useTouchOptimization,
  MobileContainer,
  MobileButton,
  MobileListItem,
  MobileCard,
  MobileNavBar,
  MobileTabBar,
  MobilePullToRefresh,
}
