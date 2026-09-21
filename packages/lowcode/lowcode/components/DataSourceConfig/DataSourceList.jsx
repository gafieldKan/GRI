/**
 * 数据源列表组件
 * 显示和管理已配置的数据源列表
 */

import React, { useState, useEffect, useCallback } from 'react'
import { dataSourceManager, DataSourceType } from '../../engine/DataSourceManager.js'

const DATA_SOURCE_ICONS = {
  [DataSourceType.REST]: '🌐',
  [DataSourceType.GRAPHQL]: '◈',
  [DataSourceType.MYSQL]: '🐬',
  [DataSourceType.POSTGRESQL]: '🐘',
  [DataSourceType.MONGODB]: '🍃',
}

const DataSourceList = ({ onSelect, onEdit, onDelete }) => {
  const [dataSources, setDataSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [connectingId, setConnectingId] = useState(null)

  const loadDataSources = useCallback(() => {
    const sources = dataSourceManager.getAll()
    setDataSources(sources)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadDataSources()
  }, [loadDataSources])

  const handleSelect = (dataSource) => {
    setSelectedId(dataSource.id)
    onSelect?.(dataSource)
  }

  const handleEdit = (dataSource) => {
    onEdit?.(dataSource)
  }

  const handleDelete = async (dataSource) => {
    if (window.confirm(`确定要删除数据源 "${dataSource.name}" 吗？`)) {
      await dataSourceManager.delete(dataSource.id)
      loadDataSources()
      onDelete?.(dataSource)
    }
  }

  const handleTestConnection = async (dataSource, e) => {
    e?.stopPropagation()
    setConnectingId(dataSource.id)

    try {
      await dataSourceManager.connect(dataSource.id)
      alert('连接成功')
    } catch (error) {
      alert(`连接失败：${error.message}`)
    } finally {
      setConnectingId(null)
    }
  }

  const getTypeLabel = (type) => {
    const labels = {
      [DataSourceType.REST]: 'REST API',
      [DataSourceType.GRAPHQL]: 'GraphQL',
      [DataSourceType.MYSQL]: 'MySQL',
      [DataSourceType.POSTGRESQL]: 'PostgreSQL',
      [DataSourceType.MONGODB]: 'MongoDB',
    }
    return labels[type] || type
  }

  if (loading) {
    return <div className="data-source-list loading">加载中...</div>
  }

  if (dataSources.length === 0) {
    return (
      <div className="data-source-list empty">
        <p>暂无数据源</p>
        <p>点击"新建数据源"按钮添加</p>
      </div>
    )
  }

  return (
    <div className="data-source-list">
      <div className="data-source-list__header">
        <h4>数据源列表 ({dataSources.length})</h4>
      </div>

      <ul className="data-source-list__items">
        {dataSources.map((dataSource) => (
          <li
            key={dataSource.id}
            className={`data-source-list__item ${selectedId === dataSource.id ? 'selected' : ''}`}
            onClick={() => handleSelect(dataSource)}
          >
            <div className="data-source-list__item-header">
              <span className="icon">{DATA_SOURCE_ICONS[dataSource.type] || '📦'}</span>
              <div className="info">
                <span className="name">{dataSource.name}</span>
                <span className="type">{getTypeLabel(dataSource.type)}</span>
              </div>
              <span className={`status status--${dataSource.state}`}>{dataSource.state}</span>
            </div>

            <div className="data-source-list__item-actions">
              <button
                type="button"
                className="action-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  handleTestConnection(dataSource, e)
                }}
                disabled={connectingId === dataSource.id}
              >
                {connectingId === dataSource.id ? '连接中...' : '测试'}
              </button>
              <button
                type="button"
                className="action-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  handleEdit(dataSource)
                }}
              >
                编辑
              </button>
              <button
                type="button"
                className="action-btn danger"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(dataSource)
                }}
              >
                删除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default DataSourceList
