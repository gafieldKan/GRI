import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * 无障碍访问 Hook
 * 提供键盘导航、ARIA 属性、焦点管理等功能
 */

/**
 * 键盘导航 Hook
 */
export function useKeyboardNavigation(options = {}) {
  const {
    enabled = true,
    onSelect,
    onEnter,
    onEscape,
    onArrowUp,
    onArrowDown,
    onArrowLeft,
    onArrowRight,
  } = options

  const handleKeyDown = useCallback(
    (event) => {
      if (!enabled) return

      switch (event.key) {
        case 'Enter':
        case ' ':
          onEnter?.(event)
          break
        case 'Escape':
          onEscape?.(event)
          break
        case 'ArrowUp':
          event.preventDefault()
          onArrowUp?.(event)
          break
        case 'ArrowDown':
          event.preventDefault()
          onArrowDown?.(event)
          break
        case 'ArrowLeft':
          event.preventDefault()
          onArrowLeft?.(event)
          break
        case 'ArrowRight':
          event.preventDefault()
          onArrowRight?.(event)
          break
        default:
          break
      }
    },
    [enabled, onEnter, onEscape, onArrowUp, onArrowDown, onArrowLeft, onArrowRight]
  )

  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown, enabled])

  return { handleKeyDown }
}

/**
 * 焦点管理 Hook
 */
export function useFocusTrap(enabled = true) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!enabled || !containerRef.current) return

    const container = containerRef.current
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    const handleTabKey = (event) => {
      if (event.key !== 'Tab') return

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus()
          event.preventDefault()
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus()
          event.preventDefault()
        }
      }
    }

    container.addEventListener('keydown', handleTabKey)
    firstElement?.focus()

    return () => {
      container.removeEventListener('keydown', handleTabKey)
    }
  }, [enabled])

  return containerRef
}

/**
 * 屏幕阅读器通知 Hook
 */
export function useLiveRegion() {
  const [message, setMessage] = useState('')

  const speak = useCallback((newMessage, priority = 'polite') => {
    setMessage('')
    setTimeout(() => {
      setMessage(newMessage)
    }, 100)
    return () => setMessage('')
  }, [])

  const LiveRegion = () => (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  )

  return { speak, message, LiveRegion }
}

/**
 * 生成 ARIA 属性
 */
export function useAriaProps(props = {}) {
  const { label, labelledBy, description, describedBy, busy = false, live = 'polite' } = props

  return {
    'aria-label': label,
    'aria-labelledby': labelledBy,
    'aria-describedby': description || describedBy,
    'aria-busy': busy,
    'aria-live': live,
  }
}

/**
 * 可访问性组件包装器
 */
export function withAccessibility(WrappedComponent, options = {}) {
  return function AccessibleComponent(props) {
    const { label, description, role = 'region' } = options
    const ariaProps = useAriaProps({ label, description })

    return (
      <div role={role} {...ariaProps}>
        <WrappedComponent {...props} />
      </div>
    )
  }
}

export default useKeyboardNavigation
