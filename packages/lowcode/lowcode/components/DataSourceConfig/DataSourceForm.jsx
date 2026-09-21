/**
 * 数据源配置表单组件
 * 用于可视化配置 REST、GraphQL、MySQL 等数据源
 */

import React, { useState, useCallback } from 'react'
import { dataSourceManager, DataSourceType } from '../../engine/DataSourceManager.js'

const DATA_SOURCE_TYPES = [
  { value: DataSourceType.REST, label: 'REST API', icon: '🌐' },
  { value: DataSourceType.GRAPHQL, label: 'GraphQL', icon: '◈' },
  { value: DataSourceType.MYSQL, label: 'MySQL', icon: '🐬' },
  { value: DataSourceType.POSTGRESQL, label: 'PostgreSQL', icon: '🐘' },
  { value: DataSourceType.MONGODB, label: 'MongoDB', icon: '🍃' },
]

const DataSourceForm = ({ dataSourceId, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    id: dataSourceId || '',
    name: '',
    type: DataSourceType.REST,
    description: '',
    baseURL: '',
    timeout: 30000,
    headers: {},
    endpoints: [],
  })

  const [errors, setErrors] = useState({})
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const handleChange = useCallback(
    (field, value) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
      // 清除错误
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: null }))
      }
    },
    [errors]
  )

  const validate = () => {
    const newErrors = {}

    if (!formData.name?.trim()) {
      newErrors.name = '请输入数据源名称'
    }

    if (!formData.baseURL?.trim() && formData.type === DataSourceType.REST) {
      newErrors.baseURL = '请输入基础 URL'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleTest = async () => {
    if (!validate()) return

    setIsTesting(true)
    setTestResult(null)

    try {
      // 注册临时数据源
      const tempId = `temp_${Date.now()}`
      dataSourceManager.register({
        id: tempId,
        name: formData.name,
        type: formData.type,
        config: {
          baseURL: formData.baseURL,
          headers: formData.headers,
        },
      })

      // 测试连接
      await dataSourceManager.connect(tempId)
      setTestResult({ success: true, message: '连接成功' })

      // 清理临时数据源
      await dataSourceManager.delete(tempId)
    } catch (error) {
      setTestResult({ success: false, message: error.message })
    } finally {
      setIsTesting(false)
    }
  }

  const handleSubmit = (e) => {
    e?.preventDefault()

    if (!validate()) return

    onSave?.({
      id: formData.id || `ds_${Date.now()}`,
      name: formData.name,
      type: formData.type,
      description: formData.description,
      config: {
        baseURL: formData.baseURL,
        timeout: formData.timeout,
        headers: formData.headers,
      },
      endpoints: formData.endpoints,
    })
  }

  return (
    <form className="data-source-form" onSubmit={handleSubmit}>
      <div className="form-header">
        <h3>{dataSourceId ? '编辑数据源' : '新建数据源'}</h3>
      </div>

      <div className="form-body">
        {/* 数据源名称 */}
        <div className="form-group">
          <label htmlFor="name">名称 *</label>
          <input
            id="name"
            type="text"
            className={errors.name ? 'error' : ''}
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="请输入数据源名称"
          />
          {errors.name && <span className="error-msg">{errors.name}</span>}
        </div>

        {/* 数据源类型 */}
        <div className="form-group">
          <label htmlFor="type">类型</label>
          <div className="type-selector">
            {DATA_SOURCE_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                className={`type-option ${formData.type === type.value ? 'active' : ''}`}
                onClick={() => handleChange('type', type.value)}
              >
                <span className="icon">{type.icon}</span>
                <span className="label">{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 描述 */}
        <div className="form-group">
          <label htmlFor="description">描述</label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="数据源描述（可选）"
            rows={3}
          />
        </div>

        {/* 基础 URL（REST 类型） */}
        {formData.type === DataSourceType.REST && (
          <div className="form-group">
            <label htmlFor="baseURL">基础 URL *</label>
            <input
              id="baseURL"
              type="url"
              className={errors.baseURL ? 'error' : ''}
              value={formData.baseURL}
              onChange={(e) => handleChange('baseURL', e.target.value)}
              placeholder="https://api.example.com"
            />
            {errors.baseURL && <span className="error-msg">{errors.baseURL}</span>}
          </div>
        )}

        {/* 超时设置 */}
        <div className="form-group">
          <label htmlFor="timeout">超时时间 (ms)</label>
          <input
            id="timeout"
            type="number"
            value={formData.timeout}
            onChange={(e) => handleChange('timeout', parseInt(e.target.value, 10))}
            placeholder="30000"
          />
        </div>

        {/* 请求头配置 */}
        <div className="form-group">
          <label>请求头配置</label>
          <HeaderConfig
            headers={formData.headers}
            onChange={(headers) => handleChange('headers', headers)}
          />
        </div>

        {/* 测试结果 */}
        {testResult && (
          <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
            {testResult.message}
          </div>
        )}
      </div>

      <div className="form-footer">
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="button" onClick={handleTest} disabled={isTesting}>
          {isTesting ? '测试中...' : '测试连接'}
        </button>
        <button type="submit" className="primary">
          保存
        </button>
      </div>
    </form>
  )
}

/**
 * 请求头配置子组件
 */
const HeaderConfig = ({ headers = {}, onChange }) => {
  const [items, setItems] = useState(
    Object.entries(headers).map(([key, value]) => ({ key, value }))
  )

  const handleAdd = () => {
    const newItems = [...items, { key: '', value: '' }]
    setItems(newItems)

    const newHeaders = {}
    newItems.forEach(({ key, value }) => {
      if (key) newHeaders[key] = value
    })
    onChange(newHeaders)
  }

  const handleRemove = (index) => {
    const newItems = items.filter((_, i) => i !== index)
    setItems(newItems)

    const newHeaders = {}
    newItems.forEach(({ key, value }) => {
      if (key) newHeaders[key] = value
    })
    onChange(newHeaders)
  }

  const handleChange = (index, field, value) => {
    const newItems = items.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    setItems(newItems)

    const newHeaders = {}
    newItems.forEach(({ key, value }) => {
      if (key) newHeaders[key] = value
    })
    onChange(newHeaders)
  }

  return (
    <div className="header-config">
      {items.map((item, index) => (
        <div key={index} className="header-item">
          <input
            type="text"
            placeholder="Header Name"
            value={item.key}
            onChange={(e) => handleChange(index, 'key', e.target.value)}
          />
          <input
            type="text"
            placeholder="Value"
            value={item.value}
            onChange={(e) => handleChange(index, 'value', e.target.value)}
          />
          <button type="button" onClick={() => handleRemove(index)}>
            删除
          </button>
        </div>
      ))}
      <button type="button" onClick={handleAdd} className="add-btn">
        + 添加请求头
      </button>
    </div>
  )
}

export default DataSourceForm
