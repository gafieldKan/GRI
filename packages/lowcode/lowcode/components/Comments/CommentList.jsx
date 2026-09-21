import React, { useState, useEffect } from 'react'
import { commentManager, CommentType, CommentStatus } from '../../engine/CommentManager.js'
import './styles.css'

/**
 * 评论列表组件
 */
export function CommentList({ resourceType, resourceId, currentUser, onCommentAction }) {
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [replyContents, setReplyContents] = useState({})
  const [replyingTo, setReplyingTo] = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (resourceType && resourceId) {
      loadComments()
    }

    const handleUpdate = () => loadComments()
    commentManager.on('comment:create', handleUpdate)
    commentManager.on('comment:update', handleUpdate)
    commentManager.on('comment:delete', handleUpdate)

    return () => {
      commentManager.off('comment:create', handleUpdate)
      commentManager.off('comment:update', handleUpdate)
      commentManager.off('comment:delete', handleUpdate)
    }
  }, [resourceType, resourceId])

  useEffect(() => {
    if (currentUser) {
      commentManager.setCurrentUser(currentUser)
    }
  }, [currentUser])

  const loadComments = () => {
    if (!resourceType || !resourceId) return
    const list = commentManager.getByResource(resourceType, resourceId)
    setComments(list)
  }

  const handleAddComment = () => {
    if (!newComment.trim()) return
    commentManager.create(newComment, { resourceType, resourceId, type: CommentType.GENERAL })
    setNewComment('')
    onCommentAction?.('create')
  }

  const handleReply = (parentId) => {
    const content = replyContents[parentId] || ''
    if (!content.trim()) return
    commentManager.reply(parentId, content)
    setReplyingTo(null)
    setReplyContents((prev) => ({ ...prev, [parentId]: '' }))
    onCommentAction?.('reply')
  }

  const handleResolve = (commentId) => {
    commentManager.resolve(commentId)
    onCommentAction?.('resolve')
  }

  const handleDelete = (commentId) => {
    if (window.confirm('确定要删除此评论吗？')) {
      commentManager.delete(commentId)
      onCommentAction?.('delete')
    }
  }

  const filteredComments = comments
    .filter((c) => {
      if (filter === 'all') return true
      if (filter === 'active') return c.status === CommentStatus.ACTIVE
      if (filter === 'resolved') return c.status === CommentStatus.RESOLVED
      return true
    })
    .filter((c) => !c.parentId)

  const getReplies = (parentId) =>
    comments.filter((c) => c.parentId === parentId).sort((a, b) => a.createdAt - b.createdAt)

  return (
    <div className="comment-list">
      <div className="comment-header">
        <h4>评论与批注</h4>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">全部评论</option>
          <option value="active">未解决</option>
          <option value="resolved">已解决</option>
        </select>
      </div>

      <div className="comment-input">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="发表评论..."
          rows={3}
        />
        <button onClick={handleAddComment} disabled={!newComment.trim()}>
          发表
        </button>
      </div>

      <div className="comments-container">
        {filteredComments.length === 0 && <div className="empty-message">暂无评论</div>}

        {filteredComments.map((comment) => (
          <div
            key={comment.id}
            className={`comment-item ${comment.status === CommentStatus.RESOLVED ? 'resolved' : ''}`}
          >
            <div className="comment-avatar">{comment.authorName?.[0]?.toUpperCase() || 'U'}</div>
            <div className="comment-body">
              <div className="comment-meta">
                <span className="comment-author">{comment.authorName}</span>
                <span className="comment-time">{new Date(comment.createdAt).toLocaleString()}</span>
                {comment.status === CommentStatus.RESOLVED && (
                  <span className="resolved-badge">已解决</span>
                )}
              </div>
              <div className="comment-content">{comment.content}</div>
              <div className="comment-actions">
                <button onClick={() => setReplyingTo(comment.id)}>回复</button>
                {comment.status === CommentStatus.ACTIVE && (
                  <button onClick={() => handleResolve(comment.id)}>标记为解决</button>
                )}
                <button onClick={() => handleDelete(comment.id)}>删除</button>
              </div>

              {replyingTo === comment.id && (
                <div className="reply-input">
                  <input
                    type="text"
                    value={replyContents[comment.id] || ''}
                    onChange={(e) =>
                      setReplyContents((prev) => ({ ...prev, [comment.id]: e.target.value }))
                    }
                    placeholder="写回复..."
                  />
                  <button onClick={() => handleReply(comment.id)}>发送</button>
                  <button onClick={() => setReplyingTo(null)}>取消</button>
                </div>
              )}

              {/* 回复列表 */}
              {getReplies(comment.id).map((reply) => (
                <div key={reply.id} className="reply-item">
                  <span className="reply-author">{reply.authorName}: </span>
                  <span className="reply-content">{reply.content}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CommentList
