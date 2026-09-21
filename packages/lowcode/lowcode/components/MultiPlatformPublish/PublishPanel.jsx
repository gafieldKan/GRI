import React, { useState } from 'react'
import {
  multiPlatformPublisher,
  PlatformType,
  PublishStatus,
} from '../../engine/MultiPlatformPublisher.js'
import './styles.css'

/**
 * 多端发布面板组件
 */
export function PublishPanel({ config: initialConfig, onClose, onPublishComplete }) {
  const [config, setConfig] = useState({
    appId: '',
    appName: '',
    version: '1.0.0',
    description: '',
    platforms: [PlatformType.H5],
  })

  const [isPublishing, setIsPublishing] = useState(false)
  const [currentPlatform, setCurrentPlatform] = useState('')
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState([])
  const [results, setResults] = useState([])

  const platformLabels = {
    [PlatformType.H5]: 'H5 网页',
    [PlatformType.WECHAT_MINI]: '微信小程序',
    [PlatformType.ALIPAY_MINI]: '支付宝小程序',
  }

  const handleConfigChange = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
  }

  const handlePlatformToggle = (platform) => {
    setConfig((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform],
    }))
  }

  const handlePublish = async () => {
    if (!config.appId.trim()) {
      alert('请输入应用 ID')
      return
    }

    if (config.platforms.length === 0) {
      alert('请至少选择一个发布平台')
      return
    }

    setIsPublishing(true)
    setProgress(0)
    setLogs([])
    setResults([])

    // 初始化发布配置
    multiPlatformPublisher.init({
      appId: config.appId,
      appName: config.appName,
      version: config.version,
      description: config.description,
      platforms: config.platforms,
    })

    // 监听构建事件
    multiPlatformPublisher.on('build:start', ({ platform, task }) => {
      setCurrentPlatform(platform)
      setLogs((prev) => [...prev, ...task.logs.map((l) => l.message)])
    })

    multiPlatformPublisher.on('build:complete', ({ platform, outputPath }) => {
      setLogs((prev) => [...prev, `${platform} 构建完成：${outputPath}`])
      setResults((prev) => [...prev, { platform, status: 'success', outputPath }])
    })

    multiPlatformPublisher.on('build:error', ({ platform, error }) => {
      setLogs((prev) => [...prev, `${platform} 构建失败：${error}`])
      setResults((prev) => [...prev, { platform, status: 'error', error }])
    })

    try {
      const publishResults = await multiPlatformPublisher.publishToAll()
      setResults(publishResults)
      setProgress(100)
      onPublishComplete?.(publishResults)
    } catch (error) {
      setLogs((prev) => [...prev, `发布失败：${error.message}`])
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <div className="publish-panel">
      <div className="publish-header">
        <h3>一键发布到多端</h3>
        <button className="close-btn" onClick={onClose}>
          ×
        </button>
      </div>

      {/* 配置表单 */}
      <div className="publish-section">
        <h4>应用配置</h4>
        <div className="form-group">
          <label>应用 ID *</label>
          <input
            type="text"
            value={config.appId}
            onChange={(e) => handleConfigChange('appId', e.target.value)}
            placeholder="例如：com.example.myapp"
          />
        </div>

        <div className="form-group">
          <label>应用名称</label>
          <input
            type="text"
            value={config.appName}
            onChange={(e) => handleConfigChange('appName', e.target.value)}
            placeholder="例如：我的应用"
          />
        </div>

        <div className="form-group">
          <label>版本号</label>
          <input
            type="text"
            value={config.version}
            onChange={(e) => handleConfigChange('version', e.target.value)}
            placeholder="例如：1.0.0"
          />
        </div>

        <div className="form-group">
          <label>描述</label>
          <textarea
            value={config.description}
            onChange={(e) => handleConfigChange('description', e.target.value)}
            placeholder="版本更新描述..."
            rows={2}
          />
        </div>
      </div>

      {/* 平台选择 */}
      <div className="publish-section">
        <h4>选择发布平台</h4>
        <div className="platform-list">
          {Object.entries(PlatformType).map(([key, value]) => (
            <label
              key={value}
              className={`platform-item ${config.platforms.includes(value) ? 'selected' : ''}`}
            >
              <input
                type="checkbox"
                checked={config.platforms.includes(value)}
                onChange={() => handlePlatformToggle(value)}
                disabled={isPublishing}
              />
              <span className="platform-label">{platformLabels[value]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 发布按钮 */}
      <div className="publish-actions">
        <button
          className="publish-btn"
          onClick={handlePublish}
          disabled={isPublishing || config.platforms.length === 0}
        >
          {isPublishing ? '发布中...' : '开始发布'}
        </button>
      </div>

      {/* 进度显示 */}
      {isPublishing && (
        <div className="publish-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-text">{progress}%</div>
          {currentPlatform && (
            <div className="current-platform">正在构建：{platformLabels[currentPlatform]}</div>
          )}
        </div>
      )}

      {/* 日志输出 */}
      {logs.length > 0 && (
        <div className="publish-logs">
          <h4>构建日志</h4>
          <div className="log-content">
            {logs.map((log, index) => (
              <div key={index} className="log-line">
                [{new Date().toLocaleTimeString()}] {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 发布结果 */}
      {results.length > 0 && !isPublishing && (
        <div className="publish-results">
          <h4>发布结果</h4>
          <div className="results-list">
            {results.map((result, index) => (
              <div
                key={index}
                className={`result-item ${result.status === 'success' ? 'success' : 'error'}`}
              >
                <span className="result-platform">{platformLabels[result.platform]}</span>
                <span className="result-status">
                  {result.status === 'success' ? '✓ 成功' : '✗ 失败'}
                </span>
                {result.outputPath && <span className="result-path">{result.outputPath}</span>}
                {result.error && <span className="result-error">{result.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default PublishPanel
