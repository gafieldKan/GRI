import React from 'react'
import './styles.css'

/**
 * 骨架屏组件
 * 用于数据加载时的占位显示
 */
export function Skeleton({ width, height, circle = false, rows = 1, className = '', style = {} }) {
  const skeletonClass = `skeleton ${circle ? 'skeleton-circle' : 'skeleton-rect'} ${className}`

  return (
    <div className={skeletonClass} style={{ width, height, ...style }}>
      {rows > 1 ? (
        Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton-line" />)
      ) : (
        <div className="skeleton-line" />
      )}
    </div>
  )
}

/**
 * 文本骨架屏
 */
export function SkeletonText({ rows = 1, width, className = '' }) {
  return (
    <div className={`skeleton-text ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton-text-line"
          style={i === rows - 1 ? { width: width || '60%' } : {}}
        />
      ))}
    </div>
  )
}

/**
 * 头像骨架屏
 */
export function SkeletonAvatar({ size = 40, className = '' }) {
  return <div className={`skeleton-avatar ${className}`} style={{ width: size, height: size }} />
}

/**
 * 卡片骨架屏
 */
export function SkeletonCard({ className = '' }) {
  return (
    <div className={`skeleton-card ${className}`}>
      <div className="skeleton-card-image" />
      <div className="skeleton-card-content">
        <div className="skeleton-card-title" />
        <div className="skeleton-card-description" />
        <div className="skeleton-card-description short" />
      </div>
    </div>
  )
}

/**
 * 表格骨架屏
 */
export function SkeletonTable({ rows = 5, columns = 4, className = '' }) {
  return (
    <div className={`skeleton-table ${className}`}>
      <div className="skeleton-table-header">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="skeleton-table-col-header" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-table-row">
          {Array.from({ length: columns }).map((_, j) => (
            <div key={j} className="skeleton-table-cell" />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * 列表骨架屏
 */
export function SkeletonList({ rows = 5, avatar = false, className = '' }) {
  return (
    <div className={`skeleton-list ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-list-item">
          {avatar && <SkeletonAvatar size={40} />}
          <div className="skeleton-list-content">
            <SkeletonText rows={2} width="40%" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default Skeleton
