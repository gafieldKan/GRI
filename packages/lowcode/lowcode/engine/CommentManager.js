/**
 * 评论与批注管理器
 * 支持页面/组件/模型的评论、批注、回复功能
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 评论类型枚举
 */
export const CommentType = {
  GENERAL: 'general', // 普通评论
  INLINE: 'inline', // 行内批注
  THREAD: 'thread', // 主题评论
  REPLY: 'reply', // 回复
  ANNOTATION: 'annotation', // 注释
}

/**
 * 评论状态枚举
 */
export const CommentStatus = {
  ACTIVE: 'active',
  RESOLVED: 'resolved',
  ARCHIVED: 'archived',
  DELETED: 'deleted',
}

/**
 * 评论类
 */
export class Comment {
  constructor(config = {}) {
    this.id = config.id || `cmt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    this.type = config.type || CommentType.GENERAL
    this.status = config.status || CommentStatus.ACTIVE
    this.resourceType = config.resourceType || 'page'
    this.resourceId = config.resourceId || ''
    this.content = config.content || ''
    this.parentId = config.parentId || null
    this.threadId = config.threadId || null
    this.author = config.author || null
    this.authorId = config.authorId || ''
    this.authorName = config.authorName || '匿名用户'
    this.authorAvatar = config.authorAvatar || ''
    this.selection = config.selection || null // 选中的文本范围
    this.position = config.position || null // 位置信息（行号/列号）
    this.attachments = config.attachments || []
    this.reactions = config.reactions || {}
    this.mentions = config.mentions || []
    this.tags = config.tags || []
    this.createdAt = config.createdAt || Date.now()
    this.updatedAt = config.updatedAt || null
    this.resolvedAt = config.resolvedAt || null
    this.resolvedBy = config.resolvedBy || null
    this.replyCount = 0
    this.likeCount = 0
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      status: this.status,
      resourceType: this.resourceType,
      resourceId: this.resourceId,
      content: this.content,
      parentId: this.parentId,
      threadId: this.threadId,
      author: this.author,
      authorId: this.authorId,
      authorName: this.authorName,
      authorAvatar: this.authorAvatar,
      selection: this.selection,
      position: this.position,
      attachments: this.attachments,
      reactions: this.reactions,
      mentions: this.mentions,
      tags: this.tags,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      resolvedAt: this.resolvedAt,
      resolvedBy: this.resolvedBy,
      replyCount: this.replyCount,
      likeCount: this.likeCount,
    }
  }
}

/**
 * 评论管理器主类
 */
class CommentManagerClass extends EventEmitter {
  constructor() {
    super()
    this.comments = new Map()
    this.threads = new Map()
    this.currentUser = null
    this.enabled = true
  }

  /**
   * 初始化评论管理器
   */
  init(config = {}) {
    this.currentUser = config.currentUser || null
    this.enabled = config.enabled ?? true
    this.emit('init', { config })
    return this
  }

  /**
   * 创建评论
   */
  create(content, options = {}) {
    if (!this.enabled) return null

    const comment = new Comment({
      content,
      authorId: this.currentUser?.id,
      authorName: this.currentUser?.name,
      authorAvatar: this.currentUser?.avatar,
      ...options,
    })

    // 设置线程 ID
    if (comment.type === CommentType.THREAD) {
      comment.threadId = comment.id
    } else if (options.parentId) {
      const parent = this.comments.get(options.parentId)
      if (parent) {
        comment.threadId = parent.threadId || parent.id
      }
    }

    this.comments.set(comment.id, comment)

    // 添加到线程
    if (comment.threadId) {
      this.#addToThread(comment.threadId, comment)
    }

    this.emit('comment:create', { comment })
    return comment
  }

  /**
   * 更新评论
   */
  update(commentId, updates) {
    const comment = this.comments.get(commentId)
    if (!comment) return false

    if (updates.content !== undefined) {
      comment.content = updates.content
    }
    if (updates.status !== undefined) {
      comment.status = updates.status
      if (updates.status === CommentStatus.RESOLVED) {
        comment.resolvedAt = Date.now()
        comment.resolvedBy = this.currentUser?.id
      }
    }

    comment.updatedAt = Date.now()
    this.emit('comment:update', { commentId, comment })
    return true
  }

  /**
   * 删除评论
   */
  delete(commentId) {
    const comment = this.comments.get(commentId)
    if (!comment) return false

    comment.status = CommentStatus.DELETED
    comment.updatedAt = Date.now()
    this.emit('comment:delete', { commentId, comment })
    return true
  }

  /**
   * 添加回复
   */
  reply(parentId, content) {
    return this.create(content, {
      parentId,
      type: CommentType.REPLY,
    })
  }

  /**
   * 点赞/反应
   */
  react(commentId, reaction) {
    const comment = this.comments.get(commentId)
    if (!comment) return

    const currentCount = comment.reactions[reaction] || 0
    comment.reactions[reaction] = currentCount + 1
    this.emit('comment:react', { commentId, reaction })
  }

  /**
   * 获取评论
   */
  get(commentId) {
    return this.comments.get(commentId)
  }

  /**
   * 获取资源的所有评论
   */
  getByResource(resourceType, resourceId) {
    return Array.from(this.comments.values())
      .filter(
        (c) =>
          c.resourceType === resourceType &&
          c.resourceId === resourceId &&
          c.status !== CommentStatus.DELETED
      )
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  /**
   * 获取线程
   */
  getThread(threadId) {
    return this.threads.get(threadId) || []
  }

  /**
   * 获取回复
   */
  getReplies(parentId) {
    return Array.from(this.comments.values())
      .filter((c) => c.parentId === parentId && c.status !== CommentStatus.DELETED)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  /**
   * 解析评论（标记为已解决）
   */
  resolve(commentId) {
    return this.update(commentId, { status: CommentStatus.RESOLVED })
  }

  /**
   * 批量获取评论
   */
  getMany(commentIds) {
    return commentIds.map((id) => this.comments.get(id)).filter(Boolean)
  }

  /**
   * 设置当前用户
   */
  setCurrentUser(user) {
    this.currentUser = user
  }

  /**
   * 导出评论数据
   */
  export(resourceType, resourceId) {
    const comments = this.getByResource(resourceType, resourceId)
    return comments.map((c) => c.toJSON())
  }

  /**
   * 导入评论数据
   */
  import(commentsData) {
    commentsData.forEach((data) => {
      const comment = new Comment(data)
      this.comments.set(comment.id, comment)
      if (comment.threadId) {
        this.#addToThread(comment.threadId, comment)
      }
    })
  }

  /**
   * 清空
   */
  clear() {
    this.comments.clear()
    this.threads.clear()
  }

  // ==================== 私有方法 ====================

  #addToThread(threadId, comment) {
    if (!this.threads.has(threadId)) {
      this.threads.set(threadId, [])
    }
    const thread = this.threads.get(threadId)
    thread.push(comment)
  }
}

// 导出单例
export const commentManager = new CommentManagerClass()

// 导出工具函数
export function createCommentManager() {
  return new CommentManagerClass()
}

export default commentManager
