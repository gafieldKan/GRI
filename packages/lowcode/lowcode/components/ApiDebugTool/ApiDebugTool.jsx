import React, { useState } from 'react'
import { apiConnector, ApiType, AuthType, HttpMethod } from '../../engine/ApiConnector.js'
import './styles.css'

/**
 * API 调试工具组件
 * 支持手动构建请求、发送、查看响应
 */
export function ApiDebugTool({ onSaveResult }) {
  const [method, setMethod] = useState('GET')
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState('{\n  "Content-Type": "application/json"\n}')
  const [body, setBody] = useState('')
  const [response, setResponse] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])
  const [activeTab, setActiveTab] = useState('request')
  const [authType, setAuthType] = useState('none')
  const [authConfig, setAuthConfig] = useState({})

  const sendRequest = async () => {
    if (!url.trim()) {
      setError('请输入 URL')
      return
    }

    setLoading(true)
    setError(null)
    setResponse(null)

    const startTime = Date.now()
    let parsedHeaders = {}
    let parsedBody = null

    try {
      parsedHeaders = JSON.parse(headers || '{}')
    } catch (e) {
      setError('请求头格式错误，请使用有效的 JSON 格式')
      setLoading(false)
      return
    }

    if (body.trim()) {
      try {
        parsedBody = JSON.parse(body)
      } catch (e) {
        setError('请求体格式错误，请使用有效的 JSON 格式')
        setLoading(false)
        return
      }
    }

    // 构建认证头
    if (authType !== 'none') {
      switch (authType) {
        case 'basic':
          const credentials = btoa(`${authConfig.username || ''}:${authConfig.password || ''}`)
          parsedHeaders['Authorization'] = `Basic ${credentials}`
          break
        case 'bearer':
          parsedHeaders['Authorization'] = `Bearer ${authConfig.token || ''}`
          break
        case 'apikey':
          if (authConfig.key && authConfig.value) {
            parsedHeaders[authConfig.key] = authConfig.value
          }
          break
        default:
          break
      }
    }

    const options = {
      method,
      headers: parsedHeaders,
    }

    if (body.trim()) {
      options.body = JSON.stringify(parsedBody)
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const responseData = await res.json()
      const endTime = Date.now()

      const result = {
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        data: responseData,
        time: endTime - startTime,
        timestamp: new Date().toISOString(),
      }

      setResponse(result)

      // 添加到历史
      const historyItem = {
        method,
        url,
        status: res.status,
        time: result.time,
        timestamp: result.timestamp,
      }
      setHistory((prev) => [historyItem, ...prev].slice(0, 20))

      if (onSaveResult) {
        onSaveResult(result)
      }
    } catch (err) {
      setError(err.message || '请求失败')
      const endTime = Date.now()

      // 错误也添加到历史
      const historyItem = {
        method,
        url,
        status: 'Error',
        time: endTime - startTime,
        timestamp: new Date().toISOString(),
        error: err.message,
      }
      setHistory((prev) => [historyItem, ...prev].slice(0, 20))
    } finally {
      setLoading(false)
    }
  }

  const loadFromHistory = (item) => {
    setMethod(item.method)
    setUrl(item.url)
  }

  return (
    <div className="api-debug-tool">
      <div className="api-debug-header">
        <h3>API 调试工具</h3>
      </div>

      {/* 请求配置区 */}
      <div className="api-request-section">
        <div className="api-request-bar">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="api-method-select"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>

          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="请输入 API URL"
            className="api-url-input"
          />

          <button onClick={sendRequest} disabled={loading} className="api-send-btn">
            {loading ? '发送中...' : '发送'}
          </button>
        </div>

        {/* 认证配置 */}
        <div className="api-auth-section">
          <details>
            <summary>认证设置</summary>
            <div className="api-auth-content">
              <select value={authType} onChange={(e) => setAuthType(e.target.value)}>
                <option value="none">无认证</option>
                <option value="basic">Basic Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="apikey">API Key</option>
              </select>

              {authType === 'basic' && (
                <div className="api-auth-inputs">
                  <input
                    type="text"
                    placeholder="用户名"
                    onChange={(e) => setAuthConfig({ ...authConfig, username: e.target.value })}
                  />
                  <input
                    type="password"
                    placeholder="密码"
                    onChange={(e) => setAuthConfig({ ...authConfig, password: e.target.value })}
                  />
                </div>
              )}

              {authType === 'bearer' && (
                <input
                  type="text"
                  placeholder="Bearer Token"
                  onChange={(e) => setAuthConfig({ ...authConfig, token: e.target.value })}
                />
              )}

              {authType === 'apikey' && (
                <div className="api-auth-inputs">
                  <input
                    type="text"
                    placeholder="Key 名称"
                    onChange={(e) => setAuthConfig({ ...authConfig, key: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="Key 值"
                    onChange={(e) => setAuthConfig({ ...authConfig, value: e.target.value })}
                  />
                </div>
              )}
            </div>
          </details>
        </div>

        {/* 标签页 */}
        <div className="api-tabs">
          <button
            className={activeTab === 'headers' ? 'active' : ''}
            onClick={() => setActiveTab('headers')}
          >
            Headers
          </button>
          {method !== 'GET' && (
            <button
              className={activeTab === 'body' ? 'active' : ''}
              onClick={() => setActiveTab('body')}
            >
              Body
            </button>
          )}
        </div>

        {/* Headers 编辑 */}
        {activeTab === 'headers' && (
          <div className="api-editor">
            <label>请求头 (JSON):</label>
            <textarea
              value={headers}
              onChange={(e) => setHeaders(e.target.value)}
              placeholder='{\n  "Content-Type": "application/json"\n}'
              rows={6}
            />
          </div>
        )}

        {/* Body 编辑 */}
        {activeTab === 'body' && method !== 'GET' && (
          <div className="api-editor">
            <label>请求体 (JSON):</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder='{
  "key": "value"
}'
              rows={8}
            />
          </div>
        )}
      </div>

      {/* 响应区 */}
      {(response || error) && (
        <div className="api-response-section">
          <h4>响应</h4>

          {error ? (
            <div className="api-response-error">
              <span className="error-badge">错误</span>
              <pre>{error}</pre>
            </div>
          ) : response ? (
            <div className="api-response-content">
              <div className="api-response-meta">
                <span
                  className={`status-badge status-${response.status >= 200 && response.status < 300 ? 'success' : 'error'}`}
                >
                  {response.status} {response.statusText}
                </span>
                <span className="time-badge">{response.time}ms</span>
                <span className="size-badge">{JSON.stringify(response.data).length} bytes</span>
              </div>

              <div className="api-tabs">
                <button
                  className={activeTab === 'response-body' ? 'active' : ''}
                  onClick={() => setActiveTab('response-body')}
                >
                  Body
                </button>
                <button
                  className={activeTab === 'response-headers' ? 'active' : ''}
                  onClick={() => setActiveTab('response-headers')}
                >
                  Headers
                </button>
              </div>

              {activeTab === 'response-body' && (
                <pre className="api-response-body">{JSON.stringify(response.data, null, 2)}</pre>
              )}

              {activeTab === 'response-headers' && (
                <pre className="api-response-headers">
                  {Object.entries(response.headers || {}).map(([key, value]) => (
                    <div key={key}>
                      <span className="header-name">{key}:</span> {value}
                    </div>
                  ))}
                </pre>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* 历史区 */}
      {history.length > 0 && (
        <div className="api-history-section">
          <h4>历史记录</h4>
          <div className="api-history-list">
            {history.map((item, index) => (
              <div key={index} className="api-history-item" onClick={() => loadFromHistory(item)}>
                <span className={`method-badge method-${item.method}`}>{item.method}</span>
                <span className="url-text" title={item.url}>
                  {item.url.length > 50 ? item.url.substring(0, 50) + '...' : item.url}
                </span>
                <span
                  className={`status-badge status-${item.status === 'Error' ? 'error' : item.status >= 200 && item.status < 300 ? 'success' : 'error'}`}
                >
                  {item.status}
                </span>
                <span className="time-text">{item.time}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ApiDebugTool
