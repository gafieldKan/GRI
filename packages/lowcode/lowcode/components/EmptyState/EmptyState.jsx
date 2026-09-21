import React from 'react'
import './styles.css'

/**
 * 空状态引导组件
 * 用于无数据、无权限、搜索结果为空等场景
 */
export function EmptyState({
  type = 'default',
  title,
  description,
  icon,
  actions,
  image,
  className = '',
  style = {},
}) {
  const configs = {
    default: {
      icon: '📦',
      title: '暂无内容',
      description: '这里还什么都没有',
    },
    nodata: {
      icon: '📭',
      title: '暂无数据',
      description: '暂无相关数据，创建一个新的吧',
    },
    noresult: {
      icon: '🔍',
      title: '未找到结果',
      description: '尝试更换搜索关键词',
    },
    nopermission: {
      icon: '🔒',
      title: '无权限',
      description: '您没有权限查看此内容',
    },
    offline: {
      icon: '📡',
      title: '离线状态',
      description: '网络连接已断开',
    },
    error: {
      icon: '⚠️',
      title: '出现错误',
      description: '请稍后重试',
    },
  }

  const config = configs[type] || configs.default
  const displayIcon = icon || config.icon
  const displayTitle = title || config.title
  const displayDescription = description || config.description

  return (
    <div className={`empty-state ${className}`} style={style}>
      {image ? (
        <img src={image} alt="empty" className="empty-image" />
      ) : (
        <div className="empty-icon">{displayIcon}</div>
      )}
      <h3 className="empty-title">{displayTitle}</h3>
      {displayDescription && <p className="empty-description">{displayDescription}</p>}
      {actions && actions.length > 0 && (
        <div className="empty-actions">
          {actions.map((action, index) => (
            <button
              key={index}
              className={`empty-action ${action.primary ? 'primary' : ''}`}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 无数据状态组件
 */
export function NoData({ onCreate, createLabel = '去创建', onRefresh }) {
  return (
    <EmptyState
      type="nodata"
      actions={[
        onCreate && { label: createLabel, onClick: onCreate, primary: true },
        onRefresh && { label: '刷新', onClick: onRefresh },
      ].filter(Boolean)}
    />
  )
}

/**
 * 无权限状态组件
 */
export function NoPermission({ onApply, applyLabel = '申请权限' }) {
  return (
    <EmptyState
      type="nopermission"
      actions={[onApply && { label: applyLabel, onClick: onApply, primary: true }].filter(Boolean)}
    />
  )
}

/**
 * 搜索结果为空组件
 */
export function NoResult({ onClear, clearLabel = '清除搜索' }) {
  return (
    <EmptyState
      type="noresult"
      actions={[onClear && { label: clearLabel, onClick: onClear, primary: true }].filter(Boolean)}
    />
  )
}

export default EmptyState
