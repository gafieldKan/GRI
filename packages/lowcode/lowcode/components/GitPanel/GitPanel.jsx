import React, { useState, useEffect } from 'react'
import { gitManager, GitCommit } from '../../engine/GitManager.js'
import './styles.css'

/**
 * Git 面板组件
 * 显示 Git 状态、提交历史、分支等
 */
export function GitPanel({ onCommit, onCheckout, onCreateBranch }) {
  const [status, setStatus] = useState(null)
  const [branches, setBranches] = useState([])
  const [commits, setCommits] = useState([])
  const [commitMessage, setCommitMessage] = useState('')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [view, setView] = useState('status') // status, log, branch

  useEffect(() => {
    loadGitData()
  }, [])

  const loadGitData = async () => {
    const gitStatus = await gitManager.getStatus()
    setStatus(gitStatus)
    setBranches(gitManager.getBranches())
    setCommits(gitManager.getHistory({ limit: 20 }))
  }

  const handleCommit = async () => {
    if (!commitMessage.trim()) return

    try {
      await gitManager.commit(commitMessage, selectedFiles)
      setCommitMessage('')
      setSelectedFiles([])
      await loadGitData()
      onCommit?.()
    } catch (error) {
      alert(error.message)
    }
  }

  const handleCheckout = async (branch) => {
    try {
      await gitManager.checkout(branch)
      await loadGitData()
      onCheckout?.(branch)
    } catch (error) {
      alert(error.message)
    }
  }

  const handleCreateBranch = async () => {
    const name = prompt('请输入分支名称:')
    if (!name) return

    try {
      await gitManager.createBranch(name)
      await loadGitData()
      onCreateBranch?.(name)
    } catch (error) {
      alert(error.message)
    }
  }

  const toggleFile = (file) => {
    setSelectedFiles((prev) =>
      prev.includes(file) ? prev.filter((f) => f !== file) : [...prev, file]
    )
  }

  return (
    <div className="git-panel">
      <div className="git-header">
        <h3>版本管理</h3>
        <div className="git-tabs">
          <button className={view === 'status' ? 'active' : ''} onClick={() => setView('status')}>
            状态
          </button>
          <button className={view === 'log' ? 'active' : ''} onClick={() => setView('log')}>
            历史
          </button>
          <button className={view === 'branch' ? 'active' : ''} onClick={() => setView('branch')}>
            分支
          </button>
        </div>
      </div>

      {view === 'status' && (
        <div className="git-status">
          <div className="git-info">
            <span className="branch-name">{status?.currentBranch || 'main'}</span>
            <span className="git-status-indicator">
              {status?.staged?.length > 0 ? '有更改' : '工作区干净'}
            </span>
          </div>

          {/* 提交区域 */}
          <div className="commit-section">
            <h4>暂存的更改</h4>
            <div className="file-list">
              {status?.staged?.length > 0 ? (
                status.staged.map((file, index) => (
                  <label key={index} className="file-item">
                    <input
                      type="checkbox"
                      checked={selectedFiles.includes(file)}
                      onChange={() => toggleFile(file)}
                    />
                    <span className="file-name">{file}</span>
                  </label>
                ))
              ) : (
                <div className="empty-message">没有暂存的更改</div>
              )}
            </div>

            <textarea
              className="commit-message"
              placeholder="输入提交信息..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              rows={3}
            />

            <button
              className="commit-btn"
              onClick={handleCommit}
              disabled={!commitMessage.trim() || selectedFiles.length === 0}
            >
              提交
            </button>
          </div>

          {/* 未暂存的更改 */}
          <div className="unstaged-section">
            <h4>未暂存的更改</h4>
            <div className="file-list">
              {status?.unstaged?.length > 0 ? (
                status.unstaged.map((file, index) => (
                  <div key={index} className="file-item unstaged">
                    <span className="file-name">{file}</span>
                    <button className="stage-btn" onClick={() => gitManager.add(file)}>
                      暂存
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty-message">没有未暂存的更改</div>
              )}
            </div>
          </div>
        </div>
      )}

      {view === 'log' && (
        <div className="git-log">
          <h4>提交历史</h4>
          <div className="commit-list">
            {commits.length > 0 ? (
              commits.map((commit, index) => (
                <div key={index} className="commit-item">
                  <div className="commit-hash">{commit.shortHash}</div>
                  <div className="commit-message">{commit.message}</div>
                  <div className="commit-meta">
                    <span className="commit-author">{commit.author}</span>
                    <span className="commit-time">
                      {new Date(commit.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-message">暂无提交记录</div>
            )}
          </div>
        </div>
      )}

      {view === 'branch' && (
        <div className="git-branches">
          <div className="branch-header">
            <h4>分支</h4>
            <button className="create-branch-btn" onClick={handleCreateBranch}>
              + 新建分支
            </button>
          </div>

          <div className="branch-list">
            {branches.map((branch, index) => (
              <div key={index} className={`branch-item ${branch.isCurrent ? 'current' : ''}`}>
                <span className="branch-name">{branch.name}</span>
                {branch.isCurrent && <span className="current-badge">当前</span>}
                {!branch.isCurrent && (
                  <button className="checkout-btn" onClick={() => handleCheckout(branch.name)}>
                    切换
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default GitPanel
