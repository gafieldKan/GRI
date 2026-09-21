import React, { useState } from 'react'
import {
  ConnectorTemplates,
  getAllTemplates,
  getTemplateCategories,
  getTemplatesByCategory,
} from '../../engine/ConnectorTemplates.js'
import { apiConnector } from '../../engine/ApiConnector.js'
import './styles.css'

/**
 * 连接器模板列表组件
 * 展示所有预置的第三方服务连接器
 */
export function ConnectorList({ onSelectTemplate }) {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [showDetails, setShowDetails] = useState(false)

  const categories = getTemplateCategories()
  const allTemplates = getAllTemplates()

  const filteredTemplates = allTemplates.filter((template) => {
    const matchesCategory =
      selectedCategory === 'all' ||
      (selectedCategory === 'enterprise' &&
        ['dingtalk', 'wecom', 'feishu', 'slack'].includes(template.id)) ||
      (selectedCategory === 'cloud' && ['aliyun', 'tencentcloud', 'sap'].includes(template.id)) ||
      (selectedCategory === 'crm' && ['salesforce'].includes(template.id)) ||
      (selectedCategory === 'productivity' && ['google', 'microsoft365'].includes(template.id)) ||
      (selectedCategory === 'payment' && ['wechat_pay', 'alipay'].includes(template.id)) ||
      (selectedCategory === 'map' && ['amap', 'baidu_map'].includes(template.id))
    const matchesSearch =
      template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const handleUseTemplate = (template) => {
    if (onSelectTemplate) {
      onSelectTemplate(template)
    }
  }

  return (
    <div className="connector-list">
      <div className="connector-header">
        <h3>第三方服务连接器</h3>
        <p className="connector-description">预置常用第三方服务平台连接器，开箱即用</p>
      </div>

      {/* 搜索框 */}
      <div className="connector-search">
        <input
          type="text"
          placeholder="搜索连接器..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      {/* 分类标签 */}
      <div className="connector-categories">
        <button
          className={selectedCategory === 'all' ? 'active' : ''}
          onClick={() => setSelectedCategory('all')}
        >
          全部
        </button>
        {Object.entries(categories).map(([key, name]) => (
          <button
            key={key}
            className={selectedCategory === key ? 'active' : ''}
            onClick={() => setSelectedCategory(key)}
          >
            {name}
          </button>
        ))}
      </div>

      {/* 连接器卡片 */}
      <div className="connector-grid">
        {filteredTemplates.map((template) => (
          <div key={template.id} className="connector-card">
            <div className="connector-card-header">
              <h4>{template.name}</h4>
              <span className="connector-type">{template.type}</span>
            </div>

            <p className="connector-card-description">{template.description}</p>

            <div className="connector-card-endpoints">
              <span className="endpoint-count">{template.endpoints?.length || 0} 个端点</span>
            </div>

            <div className="connector-card-actions">
              <button
                className="btn-preview"
                onClick={() => {
                  setSelectedTemplate(template)
                  setShowDetails(true)
                }}
              >
                查看详情
              </button>
              <button className="btn-use" onClick={() => handleUseTemplate(template)}>
                使用此模板
              </button>
            </div>

            {template.docUrl && (
              <a
                href={template.docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="connector-doc-link"
              >
                官方文档
              </a>
            )}
          </div>
        ))}
      </div>

      {/* 详情弹窗 */}
      {showDetails && selectedTemplate && (
        <div className="modal-overlay" onClick={() => setShowDetails(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {selectedTemplate.name} - {selectedTemplate.description}
              </h3>
              <button className="modal-close" onClick={() => setShowDetails(false)}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="detail-section">
                <h4>基本信息</h4>
                <div className="detail-row">
                  <span className="label">连接器 ID:</span>
                  <span className="value">{selectedTemplate.id}</span>
                </div>
                <div className="detail-row">
                  <span className="label">基础 URL:</span>
                  <code className="code-value">{selectedTemplate.baseUrl}</code>
                </div>
                <div className="detail-row">
                  <span className="label">认证方式:</span>
                  <span className="value">{selectedTemplate.auth?.type || '无'}</span>
                </div>
              </div>

              <div className="detail-section">
                <h4>可用端点 ({selectedTemplate.endpoints?.length || 0})</h4>
                <div className="endpoints-list">
                  {selectedTemplate.endpoints?.map((endpoint, index) => (
                    <div key={index} className="endpoint-item">
                      <span className={`method-badge method-${endpoint.method?.toLowerCase()}`}>
                        {endpoint.method}
                      </span>
                      <span className="endpoint-name">{endpoint.name}</span>
                      <code className="endpoint-path">{endpoint.path}</code>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn-use-primary"
                onClick={() => {
                  handleUseTemplate(selectedTemplate)
                  setShowDetails(false)
                }}
              >
                使用此模板
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConnectorList
