import React, { useState, useEffect, useRef } from 'react'
import { codeInjector, InjectPoint, CodeType } from '../../engine/CodeInjector.js'
import './styles.css'

/**
 * 自定义代码编辑器组件
 */
export function CodeEditor({ value = '', onChange, onSave, initialPoint = InjectPoint.APP_INIT }) {
  const [code, setCode] = useState(value)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [injectPoint, setInjectPoint] = useState(initialPoint)
  const [codeType, setCodeType] = useState(CodeType.JAVASCRIPT)
  const [enabled, setEnabled] = useState(true)
  const [priority, setPriority] = useState(0)
  const [isAsync, setIsAsync] = useState(false)
  const [errors, setErrors] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [output, setOutput] = useState('')
  const editorRef = useRef(null)

  // 代码变化时更新
  useEffect(() => {
    setCode(value)
  }, [value])

  // 自动保存
  useEffect(() => {
    const saved = localStorage.getItem('code_draft')
    if (saved) {
      setCode(saved)
    }
  }, [])

  const handleSave = () => {
    const injectedCode = codeInjector.register({
      name: name || '未命名代码',
      description,
      injectPoint,
      codeType,
      code,
      enabled,
      priority: Number(priority),
      async: isAsync,
    })

    onSave?.(injectedCode)
    localStorage.removeItem('code_draft')
  }

  const handleRun = async () => {
    setIsRunning(true)
    setErrors([])
    setOutput('')

    try {
      // 保存草稿
      localStorage.setItem('code_draft', code)

      // 执行代码
      const result = await codeInjector.executeAt(injectPoint, {
        console: {
          log: (...args) => setOutput((prev) => prev + args.join(' ') + '\n'),
          warn: (...args) => setOutput(prev + '[WARN] ' + args.join(' ') + '\n'),
          error: (...args) => setOutput(prev + '[ERROR] ' + args.join(' ') + '\n'),
        },
      })

      setOutput((prev) => prev + '\n=== 执行完成 ===\n' + JSON.stringify(result, null, 2))
    } catch (error) {
      setErrors([error.message])
      setOutput((prev) => prev + '\n=== 执行错误 ===\n' + error.message)
    } finally {
      setIsRunning(false)
    }
  }

  const handleClear = () => {
    setCode('')
    setOutput('')
    setErrors([])
    localStorage.removeItem('code_draft')
  }

  const injectPoints = Object.entries(InjectPoint).map(([key, value]) => ({
    key: value,
    label: key.toLowerCase(),
  }))

  const codeTypes = Object.entries(CodeType).map(([key, value]) => ({
    key: value,
    label: key,
  }))

  return (
    <div className="code-editor">
      <div className="editor-header">
        <h3>自定义代码注入</h3>
        <div className="header-actions">
          <button onClick={handleSave} className="btn-save">
            保存
          </button>
          <button onClick={handleRun} disabled={isRunning} className="btn-run">
            {isRunning ? '运行中...' : '运行'}
          </button>
          <button onClick={handleClear} className="btn-clear">
            清空
          </button>
        </div>
      </div>

      <div className="editor-config">
        <div className="form-group">
          <label>名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="代码片段名称"
          />
        </div>

        <div className="form-group">
          <label>描述</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="代码功能描述"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>注入点</label>
            <select value={injectPoint} onChange={(e) => setInjectPoint(e.target.value)}>
              {injectPoints.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>代码类型</label>
            <select value={codeType} onChange={(e) => setCodeType(e.target.value)}>
              {codeTypes.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>优先级</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              min="0"
              max="100"
            />
          </div>

          <div className="form-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              启用
            </label>
          </div>

          <div className="form-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={isAsync}
                onChange={(e) => setIsAsync(e.target.checked)}
              />
              异步执行
            </label>
          </div>
        </div>
      </div>

      <div className="editor-body">
        <div className="editor-main">
          <label>代码</label>
          <textarea
            ref={editorRef}
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              onChange?.(e.target.value)
            }}
            placeholder="// 在这里输入 JavaScript 代码
// 可用的上下文对象：
// - console: 安全的控制台输出
// - Math, Date, JSON: 内置对象
// - 自定义上下文...

console.log('Hello, World!')
return { success: true }"
            spellCheck={false}
            className="code-input"
          />
        </div>

        <div className="editor-output">
          <label>输出 / 错误</label>
          <div className="output-content">
            {errors.length > 0 && (
              <div className="output-errors">
                {errors.map((error, i) => (
                  <div key={i} className="error-line">
                    {error}
                  </div>
                ))}
              </div>
            )}
            <pre className="output-code">{output || '// 运行结果将显示在这里'}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CodeEditor
