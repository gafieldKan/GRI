import React, { useState } from 'react'
import { ssoManager, AuthProtocol, LoginStatus } from '../../engine/SSOManager.js'
import './styles.css'

/**
 * SSO 登录面板组件
 */
export function LoginPanel({ config, onLoginSuccess, onLoginError, onClose }) {
  const [loginMethod, setLoginMethod] = useState(AuthProtocol.OAUTH2)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      await ssoManager.login({
        protocol: loginMethod,
        username,
        password,
      })
      onLoginSuccess?.()
    } catch (err) {
      setError(err.message)
      onLoginError?.(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOAuthLogin = () => {
    ssoManager.login().catch((err) => {
      setError(err.message)
      onLoginError?.(err)
    })
  }

  const getMethodLabel = (method) => {
    const labels = {
      [AuthProtocol.OAUTH2]: 'OAuth2',
      [AuthProtocol.OAUTH2_PKCE]: 'OAuth2 (PKCE)',
      [AuthProtocol.OIDC]: 'OpenID Connect',
      [AuthProtocol.SAML]: 'SAML',
      [AuthProtocol.LDAP]: 'LDAP',
      [AuthProtocol.CAS]: 'CAS',
    }
    return labels[method] || method
  }

  return (
    <div className="sso-login-panel">
      <div className="sso-header">
        <h3>单点登录</h3>
        {onClose && (
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        )}
      </div>

      {/* 认证方式选择 */}
      <div className="sso-section">
        <h4>选择认证方式</h4>
        <div className="method-list">
          {Object.values(AuthProtocol).map((method) => (
            <button
              key={method}
              className={`method-item ${loginMethod === method ? 'selected' : ''}`}
              onClick={() => setLoginMethod(method)}
            >
              {getMethodLabel(method)}
            </button>
          ))}
        </div>
      </div>

      {/* OAuth/SAML 快捷登录 */}
      {(loginMethod === AuthProtocol.OAUTH2 ||
        loginMethod === AuthProtocol.OAUTH2_PKCE ||
        loginMethod === AuthProtocol.OIDC ||
        loginMethod === AuthProtocol.SAML ||
        loginMethod === AuthProtocol.CAS) && (
        <div className="sso-section">
          <button className="oauth-login-btn" onClick={handleOAuthLogin} disabled={isLoading}>
            {isLoading ? '登录中...' : `使用 ${getMethodLabel(loginMethod)} 登录`}
          </button>
        </div>
      )}

      {/* LDAP 登录表单 */}
      {loginMethod === AuthProtocol.LDAP && (
        <form className="sso-section" onSubmit={handleLogin}>
          <h4>LDAP 登录</h4>
          <div className="form-group">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              required
            />
          </div>

          <div className="form-group">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="login-btn" disabled={isLoading}>
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>
      )}

      {/* 状态说明 */}
      <div className="sso-status">
        <div className="status-item">
          <span className="status-label">当前状态:</span>
          <span className={`status-value status-${ssoManager.status}`}>{ssoManager.status}</span>
        </div>
      </div>
    </div>
  )
}

export default LoginPanel
