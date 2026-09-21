import React, { useState, useEffect, useRef } from 'react'
import { aiAssistant, AITaskType } from '../../engine/AIAssistant.js'
import './styles.css'

/**
 * AI 辅助面板组件
 */
export function AIPanel({ onClose, onInsert }) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [mode, setMode] = useState('chat') // chat, form, expression
  const [enabled, setEnabled] = useState(true)
  const inputRef = useRef(null)

  useEffect(() => {
    // 初始化 AI 助手
    aiAssistant.init({
      apiUrl: '/api/ai',
      apiKey: 'demo-key',
      model: 'qwen-plus',
    })

    // 监听 AI 事件
    const handleSuccess = ({ result }) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          content: JSON.stringify(result, null, 2),
          data: result,
        },
      ])
      setIsLoading(false)
    }

    const handleError = ({ error }) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: `AI 响应失败：${error.message}`,
        },
      ])
      setIsLoading(false)
    }

    aiAssistant.on('llm:success', handleSuccess)
    aiAssistant.on('llm:error', handleError)

    return () => {
      aiAssistant.off('llm:success', handleSuccess)
      aiAssistant.off('llm:error', handleError)
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    // 添加用户消息
    setMessages((prev) => [...prev, { role: 'user', content: input }])
    setIsLoading(true)

    // 根据模式调用不同 AI 功能
    try {
      let result
      switch (mode) {
        case 'form':
          result = await aiAssistant.generateForm(input)
          break
        case 'expression':
          result = await aiAssistant.generateExpression(input)
          break
        default:
          result = await aiAssistant.askHelp(input)
      }

      if (result) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'ai',
            content: JSON.stringify(result, null, 2),
            data: result,
          },
        ])
        onInsert?.(result)
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: `错误：${error.message}`,
        },
      ])
    } finally {
      setIsLoading(false)
      setInput('')
    }
  }

  const quickActions = [
    { label: '生成表单', mode: 'form', placeholder: '描述你需要的表单，例如：员工请假申请表' },
    {
      label: '生成表达式',
      mode: 'expression',
      placeholder: '描述计算公式，例如：计算本月累计金额',
    },
    { label: '智能问答', mode: 'chat', placeholder: '有任何问题都可以问我...' },
  ]

  return (
    <div className="ai-panel">
      <div className="ai-header">
        <h3>AI 助手</h3>
        <div className="ai-header-actions">
          <label className="ai-enable-toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked)
                aiAssistant.setEnabled(e.target.checked)
              }}
            />
            启用
          </label>
        </div>
      </div>

      {/* 模式选择 */}
      <div className="ai-modes">
        {quickActions.map((action) => (
          <button
            key={action.mode}
            className={`ai-mode-btn ${mode === action.mode ? 'active' : ''}`}
            onClick={() => {
              setMode(action.mode)
              inputRef.current?.focus()
            }}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* 消息列表 */}
      <div className="ai-messages">
        {messages.length === 0 ? (
          <div className="ai-empty">
            <p>👋 你好，我是你的 AI 助手</p>
            <p>我可以帮你：</p>
            <ul>
              <li>根据描述生成表单</li>
              <li>推荐字段类型和校验规则</li>
              <li>生成计算公式</li>
              <li>解答使用问题</li>
            </ul>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`ai-message ${msg.role}`}>
              {msg.role === 'ai' || msg.role === 'system' ? (
                <pre className="ai-message-content">{msg.content}</pre>
              ) : (
                <span>{msg.content}</span>
              )}
              {msg.data && (
                <div className="ai-message-actions">
                  <button className="ai-insert-btn" onClick={() => onInsert?.(msg.data)}>
                    插入
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        {isLoading && (
          <div className="ai-message ai-loading">
            <span>AI 思考中...</span>
          </div>
        )}
      </div>

      {/* 输入框 */}
      <form className="ai-input-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={quickActions.find((a) => a.mode === mode)?.placeholder || '输入...'}
          disabled={!enabled || isLoading}
          className="ai-input"
        />
        <button
          type="submit"
          disabled={!enabled || isLoading || !input.trim()}
          className="ai-submit-btn"
        >
          {isLoading ? '...' : '发送'}
        </button>
      </form>
    </div>
  )
}

export default AIPanel
