/**
 * 多人协同编辑管理器
 * 支持实时协作、操作锁、冲突检测、即时同步
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 协作状态枚举
 */
export const CollaborationStatus = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  SYNCING: 'syncing',
  CONFLICT: 'conflict',
  ERROR: 'error',
}

/**
 * 锁状态枚举
 */
export const LockStatus = {
  UNLOCKED: 'unlocked',
  LOCKED: 'locked',
  PENDING: 'pending',
  EXPIRED: 'expired',
}

/**
 * 操作类型枚举
 */
export const OperationType = {
  INSERT: 'insert',
  UPDATE: 'update',
  DELETE: 'delete',
  MOVE: 'move',
}

/**
 * 协作用户类
 */
export class Collaborator {
  constructor(data = {}) {
    this.id = data.id || `user_${Date.now()}`
    this.name = data.name || '匿名用户'
    this.avatar = data.avatar || ''
    this.color = data.color || this.#generateColor()
    this.cursor = data.cursor || null
    this.selection = data.selection || null
    this.lastActivity = Date.now()
    this.isOnline = false
  }

  #generateColor() {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
    return colors[Math.floor(Math.random() * colors.length)]
  }
}

/**
 * 操作锁类
 */
export class OperationLock {
  constructor(resourceId, userId, ttl = 30000) {
    this.id = `lock_${resourceId}_${Date.now()}`
    this.resourceId = resourceId
    this.userId = userId
    this.createdAt = Date.now()
    this.expiresAt = this.createdAt + ttl
    this.ttl = ttl
    this.status = LockStatus.PENDING
  }

  isExpired() {
    return Date.now() >= this.expiresAt
  }

  getRemainingTime() {
    return Math.max(0, this.expiresAt - Date.now())
  }

  renew() {
    this.expiresAt = Date.now() + this.ttl
    this.status = LockStatus.LOCKED
  }

  release() {
    this.status = LockStatus.UNLOCKED
  }
}

/**
 * 协同操作类
 */
export class CollaborativeOperation {
  constructor(data = {}) {
    this.id = data.id || `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    this.type = data.type || OperationType.UPDATE
    this.userId = data.userId || ''
    this.user = data.user || null
    this.resourceId = data.resourceId || ''
    this.path = data.path || ''
    this.value = data.value || null
    this.previousValue = data.previousValue || null
    this.timestamp = data.timestamp || Date.now()
    this.version = data.version || 0
    this.status = 'pending'
  }
}

/**
 * 冲突解决策略枚举
 */
export const ConflictStrategy = {
  LAST_WRITE_WINS: 'last_write_wins',
  FIRST_WRITE_WINS: 'first_write_wins',
  MERGE: 'merge',
  MANUAL: 'manual',
}

/**
 * 协同编辑器主类
 */
class CollaborationManagerClass extends EventEmitter {
  constructor() {
    super()
    this.status = CollaborationStatus.DISCONNECTED
    this.currentUserId = ''
    this.currentUser = null
    this.collaborators = new Map()
    this.locks = new Map()
    this.operations = []
    this.version = 0
    this.document = null
    this.config = null
    this.heartbeatInterval = null
    this.ws = null
  }

  /**
   * 初始化协同编辑器
   */
  init(config = {}) {
    this.config = {
      // WebSocket 服务器地址
      wsUrl: config.wsUrl || 'ws://localhost:8080',
      // 房间/文档 ID
      roomId: config.roomId || 'default',
      // 冲突解决策略
      conflictStrategy: config.conflictStrategy || ConflictStrategy.LAST_WRITE_WINS,
      // 心跳间隔
      heartbeatInterval: config.heartbeatInterval || 30000,
      // 自动重连
      autoReconnect: config.autoReconnect || true,
      // 操作超时时间
      operationTimeout: config.operationTimeout || 5000,
      ...config,
    }

    this.currentUserId = config.userId || `user_${Date.now()}`
    this.currentUser = new Collaborator({
      id: this.currentUserId,
      name: config.userName || '当前用户',
      avatar: config.userAvatar,
    })

    this.emit('init', { config: this.config, user: this.currentUser })
    return this
  }

  /**
   * 连接到协同服务器
   */
  async connect() {
    if (this.status === CollaborationStatus.CONNECTED) {
      return
    }

    this.status = CollaborationStatus.CONNECTING
    this.emit('connecting')

    try {
      // 建立 WebSocket 连接
      await this.#connectWebSocket()

      // 加入房间
      this.#joinRoom()

      // 开始心跳
      this.#startHeartbeat()

      this.status = CollaborationStatus.CONNECTED
      this.emit('connected', { roomId: this.config.roomId })
    } catch (error) {
      this.status = CollaborationStatus.ERROR
      this.emit('error', { error })
      throw error
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    this.#stopHeartbeat()
    this.#disconnectWebSocket()
    this.status = CollaborationStatus.DISCONNECTED
    this.emit('disconnected')
  }

  /**
   * 获取资源锁
   */
  async acquireLock(resourceId, timeout = 5000) {
    const lock = new OperationLock(resourceId, this.currentUserId)

    // 检查是否已被其他用户锁定
    const existingLock = this.locks.get(resourceId)
    if (existingLock && !existingLock.isExpired() && existingLock.userId !== this.currentUserId) {
      this.emit('lock:conflict', { lock: existingLock, resourceId })
      return { success: false, lock: existingLock }
    }

    // 发送加锁请求
    this.emit('lock:request', { lock, resourceId })

    // 模拟加锁过程
    await this.#simulateDelay(100)

    lock.status = LockStatus.LOCKED
    this.locks.set(resourceId, lock)

    this.emit('lock:acquired', { lock, resourceId })
    return { success: true, lock }
  }

  /**
   * 释放资源锁
   */
  releaseLock(resourceId) {
    const lock = this.locks.get(resourceId)
    if (!lock) return

    lock.release()
    this.locks.delete(resourceId)
    this.emit('lock:released', { lock, resourceId })
  }

  /**
   * 续期锁
   */
  renewLock(resourceId) {
    const lock = this.locks.get(resourceId)
    if (!lock) return false

    if (lock.isExpired()) {
      lock.status = LockStatus.EXPIRED
      return false
    }

    lock.renew()
    this.emit('lock:renewed', { lock, resourceId })
    return true
  }

  /**
   * 执行协同操作
   */
  async executeOperation(operationData) {
    const operation = new CollaborativeOperation({
      ...operationData,
      userId: this.currentUserId,
      version: this.version,
    })

    // 冲突检测
    const hasConflict = await this.#detectConflict(operation)
    if (hasConflict) {
      const resolved = await this.#resolveConflict(operation)
      if (!resolved) {
        return { success: false, reason: 'conflict' }
      }
    }

    // 应用操作
    this.#applyOperation(operation)

    // 广播操作
    this.#broadcastOperation(operation)

    return { success: true, operation }
  }

  /**
   * 插入操作
   */
  async insert(path, value, resourceId = '') {
    return this.executeOperation({
      type: OperationType.INSERT,
      path,
      value,
      resourceId: resourceId || this.config.roomId,
    })
  }

  /**
   * 更新操作
   */
  async update(path, value, resourceId = '') {
    return this.executeOperation({
      type: OperationType.UPDATE,
      path,
      value,
      resourceId: resourceId || this.config.roomId,
    })
  }

  /**
   * 删除操作
   */
  async delete(path, previousValue, resourceId = '') {
    return this.executeOperation({
      type: OperationType.DELETE,
      path,
      previousValue,
      resourceId: resourceId || this.config.roomId,
    })
  }

  /**
   * 更新游标位置
   */
  updateCursor(position, selection = null) {
    if (!this.currentUser) return

    this.currentUser.cursor = position
    this.currentUser.selection = selection
    this.currentUser.lastActivity = Date.now()

    this.emit('cursor:update', {
      userId: this.currentUserId,
      cursor: position,
      selection,
    })
  }

  /**
   * 获取在线协作者
   */
  getOnlineCollaborators() {
    return Array.from(this.collaborators.values()).filter((c) => c.isOnline)
  }

  /**
   * 获取文档内容
   */
  getDocument() {
    return this.document
  }

  /**
   * 设置文档内容
   */
  setDocument(doc) {
    this.document = doc
    this.version = 0
    this.operations = []
  }

  // ==================== 私有方法 ====================

  async #connectWebSocket() {
    return new Promise((resolve, reject) => {
      if (typeof WebSocket === 'undefined') {
        // 浏览器环境外，使用模拟
        resolve()
        return
      }

      try {
        this.ws = new WebSocket(this.config.wsUrl)

        this.ws.onopen = () => resolve()
        this.ws.onmessage = (event) => this.#handleMessage(event)
        this.ws.onerror = (error) => reject(error)
        this.ws.onclose = () => {
          this.emit('disconnected')
          if (this.config.autoReconnect) {
            this.#reconnect()
          }
        }
      } catch (error) {
        resolve() // 模拟环境
      }
    })
  }

  #disconnectWebSocket() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  #joinRoom() {
    this.emit('room:join', { roomId: this.config.roomId, user: this.currentUser })
    // 模拟加入房间
    const welcomeUser = new Collaborator({
      id: 'system',
      name: '系统',
      isOnline: true,
    })
    this.collaborators.set('system', welcomeUser)
  }

  #startHeartbeat() {
    this.#stopHeartbeat()
    this.heartbeatInterval = setInterval(() => {
      this.#sendHeartbeat()
      this.#cleanupExpiredLocks()
    }, this.config.heartbeatInterval)
  }

  #stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  #sendHeartbeat() {
    this.emit('heartbeat', { userId: this.currentUserId, timestamp: Date.now() })
  }

  #cleanupExpiredLocks() {
    for (const [resourceId, lock] of this.locks.entries()) {
      if (lock.isExpired()) {
        this.locks.delete(resourceId)
        this.emit('lock:expired', { resourceId, lock })
      } else if (lock.userId === this.currentUserId) {
        // 续期自己的锁
        this.renewLock(resourceId)
      }
    }
  }

  async #detectConflict(operation) {
    // 简单版本冲突检测
    return operation.version !== this.version
  }

  async #resolveConflict(operation) {
    const { conflictStrategy } = this.config

    switch (conflictStrategy) {
      case ConflictStrategy.LAST_WRITE_WINS:
        // 最后写入获胜
        this.version = operation.version
        return true

      case ConflictStrategy.FIRST_WRITE_WINS:
        // 先写入获胜
        return operation.version === this.version

      case ConflictStrategy.MERGE:
        // 尝试合并
        return this.#mergeOperation(operation)

      case ConflictStrategy.MANUAL:
        // 手动解决
        this.status = CollaborationStatus.CONFLICT
        this.emit('conflict', { operation, strategy: 'manual' })
        return false

      default:
        return true
    }
  }

  #mergeOperation(operation) {
    // 简化版合并逻辑
    // 实际场景需要实现 OT 或 CRDT 算法
    return true
  }

  #applyOperation(operation) {
    this.version++
    this.operations.push(operation)
    this.emit('operation:apply', operation)
  }

  #broadcastOperation(operation) {
    this.emit('operation:broadcast', operation)

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(operation))
    }
  }

  #handleMessage(event) {
    try {
      const data = JSON.parse(event.data)
      this.emit('message', data)

      // 处理远程操作
      if (data.type === 'operation') {
        this.#applyRemoteOperation(data.operation)
      }

      // 处理用户状态
      if (data.type === 'cursor') {
        this.#updateRemoteCursor(data.userId, data.cursor, data.selection)
      }
    } catch (error) {
      this.emit('error', { error, data: event.data })
    }
  }

  #applyRemoteOperation(operation) {
    this.emit('remote:operation', operation)
  }

  #updateRemoteCursor(userId, cursor, selection) {
    let collaborator = this.collaborators.get(userId)
    if (!collaborator) {
      collaborator = new Collaborator({ id: userId })
      this.collaborators.set(userId, collaborator)
    }

    collaborator.cursor = cursor
    collaborator.selection = selection
    collaborator.lastActivity = Date.now()
    collaborator.isOnline = true

    this.emit('remote:cursor', { userId, cursor, selection })
  }

  async #reconnect() {
    this.emit('reconnecting')
    await this.#simulateDelay(1000)
    await this.connect()
  }

  async #simulateDelay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// 导出单例
export const collaborationManager = new CollaborationManagerClass()

// 导出工具函数
export function createCollaborationManager() {
  return new CollaborationManagerClass()
}

export default collaborationManager
