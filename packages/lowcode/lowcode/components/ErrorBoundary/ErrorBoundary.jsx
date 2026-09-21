import React from 'react'
import './styles.css'

/**
 * 错误边界组件
 * 捕获子组件树中的 JavaScript 错误，显示回退 UI
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    console.error('[ErrorBoundary] Error:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      const { fallback, showDetails } = this.props
      const { error } = this.state

      if (fallback) {
        return typeof fallback === 'function'
          ? fallback({ error, onReset: this.handleReset })
          : fallback
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary-icon">⚠️</div>
          <h3 className="error-boundary-title">组件加载失败</h3>
          <p className="error-boundary-description">抱歉，该组件出现错误，请刷新页面或联系管理员</p>
          {showDetails && error && (
            <div className="error-boundary-details">
              <div className="error-message">{error?.toString()}</div>
            </div>
          )}
          <div className="error-boundary-actions">
            <button className="retry-btn" onClick={this.handleReset}>
              重试
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * 错误降级组件 - 简单版本
 */
export function ErrorFallback({ error, onReset }) {
  return (
    <div className="error-fallback">
      <span className="error-icon">⚠️</span>
      <span className="error-text">{error?.message || '加载失败'}</span>
      <button onClick={onReset}>重试</button>
    </div>
  )
}

/**
 * 带错误边界的容器 HOC
 */
export function withErrorBoundary(WrappedComponent, fallback) {
  return function WithErrorBoundary(props) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    )
  }
}

export default ErrorBoundary
