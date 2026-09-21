import React, { useState, useEffect } from 'react'
import {
  collaborationManager,
  CollaborationStatus,
  LockStatus,
} from '../../engine/CollaborationManager.js'
import './styles.css'

/**
 * 协同编辑面板组件
 */
export function CollaborationPanel({ onClose }) {
  const [status, setStatus] = useState(CollaborationStatus.DISCONNECTED)
  const [collaborators, setCollaborators] = useState([])
  const [locks, setLocks] = useState([])
  const [operations, setOperations] = useState([])
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    // 监听连接状态
    collaborationManager.on('connected', () => {
      setStatus(CollaborationStatus.CONNECTED)
      setIsConnected(true)
    })

    collaborationManager.on('disconnected', () => {
      setStatus(CollaborationStatus.DISCONNECTED)
      setIsConnected(false)
    })

    // 监听协作者变化
    collaborationManager.on('collaborator:join', () => updateCollaborators())
    collaborationManager.on('collaborator:leave', () => updateCollaborators())

    // 监听锁变化
    collaborationManager.on('lock:acquired', updateLocks)
    collaborationManager.on('lock:released', updateLocks)

    // 监听操作
    collaborationManager.on('operation:apply', (op) => {
      setOperations((prev) => [op, ...prev].slice(50))
    })

    // 初始加载
    updateCollaborators()
    updateLocks()

    return () => {
      collaborationManager.removeAllListeners()
    }
  }, [])

  const updateCollaborators = () => {
    const list = collaborationManager.getOnlineCollaborators()
    setCollaborators(list)
  }

  const updateLocks = () => {
    // 简化实现
  }

  const handleConnect = async () => {
    try {
      await collaborationManager.connect()
    } catch (error) {
      console.error('连接失败:', error)
    }
  }

  const handleDisconnect = () => {
    collaborationManager.disconnect()
  }

  const getStatusColor = (status) => {
    const colors = {
      [CollaborationStatus.DISCONNECTED]: '#9ca3af',
      [CollaborationStatus.CONNECTING]: '#f59e0b',
      [CollaborationStatus.CONNECTED]: '#10b981',
      [CollaborationStatus.SYNCING]: '#3b82f6',
      [CollaborationStatus.CONFLICT]: '#ef4444',
      [CollaborationStatus.ERROR]: '#dc2626',
    }
    return colors[status] || '#9ca3af'
  }

  const getStatusText = (status) => {
    const texts = {
      [CollaborationStatus.DISCONNECTED]: '未连接',
      [CollaborationStatus.CONNECTING]: '连接中...',
      [CollaborationStatus.CONNECTED]: '已连接',
      [CollaborationStatus.SYNCING]: '同步中',
      [CollaborationStatus.CONFLICT]: '冲突',
      [CollaborationStatus.ERROR]: '错误',
    }
    return texts[status] || status
  }

  return (
    <div className="collaboration-panel">
      <div className="collaboration-header">
        <h3>协同编辑</h3>
        <button className="close-btn" onClick={onClose}>
          ×
        </button>
      </div>

      {/* 连接状态 */}
      <div className="collaboration-section">
        <div className="status-bar">
          <span className="status-indicator" style={{ background: getStatusColor(status) }} />
          <span className="status-text">{getStatusText(status)}</span>
        </div>

        <div className="connection-actions">
          {!isConnected ? (
            <button className="connect-btn" onClick={handleConnect}>
              连接服务器
            </button>
          ) : (
            <button className="disconnect-btn" onClick={handleDisconnect}>
              断开连接
            </button>
          )}
        </div>
      </div>

      {/* 在线协作者 */}
      <div className="collaboration-section">
        <h4>在线协作者 ({collaborators.length})</h4>
        <div className="collaborator-list">
          {collaborators.length > 0 ? (
            collaborators.map((collab) => (
              <div key={collab.id} className="collaborator-item">
                <div className="collaborator-avatar" style={{ background: collab.color }}>
                  {collab.name?.charAt(0) || 'U'}
                </div>
                <div className="collaborator-info">
                  <span className="collaborator-name">{collab.name}</span>
                  <span className="collaborator-status">{collab.isOnline ? '在线' : '离线'}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-message">暂无在线协作者</div>
          )}
        </div>
      </div>

      {/* 资源锁 */}
      <div className="collaboration-section">
        <h4>资源锁</h4>
        <div className="lock-list">
          {locks.length > 0 ? (
            locks.map((lock) => (
              <div
                key={lock.id}
                className={`lock-item ${lock.status === LockStatus.LOCKED ? 'locked' : ''}`}
              >
                <span className="lock-resource">{lock.resourceId}</span>
                <span className="lock-user">{lock.userId}</span>
                <span className="lock-status">
                  {lock.status === LockStatus.LOCKED ? '锁定中' : '已释放'}
                </span>
              </div>
            ))
          ) : (
            <div className="empty-message">暂无资源锁</div>
          )}
        </div>
      </div>

      {/* 操作历史 */}
      <div className="collaboration-section">
        <h4>操作历史</h4>
        <div className="operation-list">
          {operations.length > 0 ? (
            operations.slice(0, 20).map((op, index) => (
              <div key={index} className="operation-item">
                <span className={`operation-type operation-type-${op.type}`}>{op.type}</span>
                <span className="operation-path">{op.path}</span>
                <span className="operation-time">
                  {new Date(op.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))
          ) : (
            <div className="empty-message">暂无操作</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CollaborationPanel
