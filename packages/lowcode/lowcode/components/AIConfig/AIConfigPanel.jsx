import React, { useState, useEffect } from 'react'
import { aiExecutor, AIEngine } from '../../engine/AIExecutor.js'
import { claudeCodeAdapter } from '../../engine/ClaudeCodeAdapter.js'
import './styles.css'

/**
 * AI 执行引擎配置面板
 */
export function AIConfigPanel({ onClose, onConfigChange }) {
  const [config, setConfig] = useState({
    engine: AIEngine.LLM_API,
    claudeCode: {
      cliPath: 'claude',
      workDir: '',
      sandbox: true,
      model: 'claude-sonnet-4-6',
      timeout: 300,
    },
    llmApi: {
      apiUrl: '/api/ai',
      apiKey: '',
      model: 'qwen-plus',
    },
  })

  const [status, setStatus] = useState({ claudeCodeReady: false, llmApiReady: false })
  const [testResult, setTestResult] = useState(null)

  // 检查状态的函数
  const checkStatus = () => {
    // 检查 Claude Code
    try {
      const ccStatus = claudeCodeAdapter.getStatus()
      setStatus((prev) => ({ ...prev, claudeCodeReady: ccStatus.ready }))
    } catch {
      setStatus((prev) => ({ ...prev, claudeCodeReady: false }))
    }
    // 检查 LLM API - TODO: 实现 API 检查
  }

  // 使用 useCallbackVersion 来避免在 effect 中调用 setState
  useEffect(() => {
    // 只在初始化时检查一次状态
    checkStatus()
  }, [])

  const handleSave = async () => {
    try {
      await aiExecutor.init(config)
      onConfigChange?.(config)
    } catch (error) {
      alert('配置失败：' + error.message)
    }
  }

  const handleTest = async () => {
    setTestResult({ testing: true })

    try {
      const result = await aiExecutor.execute({
        type: 'test',
        prompt: '你好，请回复"测试成功"即可',
        timeout: 30000,
      })

      setTestResult({
        success: true,
        output: result.result?.output || '测试通过',
        duration: result.result?.duration,
      })
    } catch (error) {
      setTestResult({
        success: false,
        error: error.message,
      })
    }
  }

  return (
    <div className="ai-config-panel">
      <div className="config-header">
        <h3>AI 执行引擎配置</h3>
        <button className="close-btn" onClick={onClose}>
          ×
        </button>
      </div>

      {/* 引擎选择 */}
      <div className="config-section">
        <h4>执行引擎</h4>
        <div className="engine-options">
          <label
            className={`engine-option ${config.engine === AIEngine.LLM_API ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name="engine"
              value={AIEngine.LLM_API}
              checked={config.engine === AIEngine.LLM_API}
              onChange={(e) => setConfig((prev) => ({ ...prev, engine: e.target.value }))}
            />
            <div className="option-content">
              <div className="option-name">云端 LLM API</div>
              <div className="option-desc">使用云端大模型 API（如 Qwen、DeepSeek 等）</div>
              <div className={`option-status ${status.llmApiReady ? 'ready' : 'not-ready'}`}>
                {status.llmApiReady ? '就绪' : '未配置'}
              </div>
            </div>
          </label>

          <label
            className={`engine-option ${config.engine === AIEngine.CLAUDE_CODE ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name="engine"
              value={AIEngine.CLAUDE_CODE}
              checked={config.engine === AIEngine.CLAUDE_CODE}
              onChange={(e) => setConfig((prev) => ({ ...prev, engine: e.target.value }))}
            />
            <div className="option-content">
              <div className="option-name">Claude Code CLI</div>
              <div className="option-desc">本地 Claude Code CLI，数据不出内网</div>
              <div className={`option-status ${status.claudeCodeReady ? 'ready' : 'not-ready'}`}>
                {status.claudeCodeReady ? '就绪' : '未配置'}
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Claude Code 配置 */}
      {config.engine === AIEngine.CLAUDE_CODE && (
        <div className="config-section">
          <h4>Claude Code 配置</h4>
          <div className="form-group">
            <label>CLI 路径</label>
            <input
              type="text"
              value={config.claudeCode.cliPath}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  claudeCode: { ...prev.claudeCode, cliPath: e.target.value },
                }))
              }
              placeholder="claude"
            />
          </div>

          <div className="form-group">
            <label>工作目录</label>
            <input
              type="text"
              value={config.claudeCode.workDir}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  claudeCode: { ...prev.claudeCode, workDir: e.target.value },
                }))
              }
              placeholder="留空使用当前目录"
            />
          </div>

          <div className="form-group">
            <label>模型</label>
            <select
              value={config.claudeCode.model}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  claudeCode: { ...prev.claudeCode, model: e.target.value },
                }))
              }
            >
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
              <option value="claude-opus-4-7">Claude Opus 4.7</option>
            </select>
          </div>

          <div className="form-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={config.claudeCode.sandbox}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    claudeCode: { ...prev.claudeCode, sandbox: e.target.checked },
                  }))
                }
              />
              启用沙箱模式（限制文件访问范围）
            </label>
          </div>
        </div>
      )}

      {/* 测试 */}
      <div className="config-section">
        <h4>测试连接</h4>
        <button className="test-btn" onClick={handleTest} disabled={testResult?.testing}>
          {testResult?.testing ? '测试中...' : '发送测试请求'}
        </button>

        {testResult && (
          <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
            {testResult.testing ? (
              <span>测试执行中...</span>
            ) : testResult.success ? (
              <span>✓ 测试通过 - {testResult.duration}ms</span>
            ) : (
              <span>✗ 测试失败：{testResult.error}</span>
            )}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="config-actions">
        <button className="save-btn" onClick={handleSave}>
          保存配置
        </button>
      </div>
    </div>
  )
}

export default AIConfigPanel
