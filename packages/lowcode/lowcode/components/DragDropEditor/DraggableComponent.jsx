import React from 'react'
import { HolderOutlined, DeleteOutlined, CopyOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import { Button, Tag, Space } from 'antd'

const DraggableComponent = ({
  component,
  index,
  total,
  isSelected,
  onSelect,
  onRemove,
  onDuplicate,
  onMove,
  previewMode,
}) => {
  const { type, props, label } = component

  const renderComponent = () => {

    switch (type) {
      case 'Input':
        return <input placeholder="请输入" className="component-input" disabled={previewMode} />
      case 'TextArea':
        return <textarea placeholder="请输入多行文本" className="component-textarea" rows={4} disabled={previewMode} />
      case 'NumberInput':
        return <input type="number" placeholder="请输入数字" className="component-input" disabled={previewMode} />
      case 'Password':
        return <input type="password" placeholder="请输入密码" className="component-input" disabled={previewMode} />
      case 'Button':
        return <button className="component-button">{props?.text || '按钮'}</button>
      case 'Select':
        return (
          <select className="component-select" disabled={previewMode}>
            <option>请选择</option>
            <option>选项 1</option>
            <option>选项 2</option>
            <option>选项 3</option>
          </select>
        )
      case 'Radio':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="component-radio">
              <input type="radio" name="radio-demo" disabled={previewMode} /> 选项 1
            </label>
            <label className="component-radio">
              <input type="radio" name="radio-demo" disabled={previewMode} /> 选项 2
            </label>
          </div>
        )
      case 'Checkbox':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="component-checkbox">
              <input type="checkbox" disabled={previewMode} /> 复选框 1
            </label>
            <label className="component-checkbox">
              <input type="checkbox" disabled={previewMode} /> 复选框 2
            </label>
          </div>
        )
      case 'Switch':
        return (
          <div className="component-switch">
            <input type="checkbox" disabled={previewMode} /> 开关
          </div>
        )
      case 'Slider':
        return (
          <div style={{ width: '100%' }}>
            <input type="range" style={{ width: '100%' }} disabled={previewMode} />
          </div>
        )
      case 'Text':
        return <p className="component-text">{props?.text || '这是一段文本'}</p>
      case 'Title':
        return <h1 className="component-title">{props?.text || '标题文本'}</h1>
      case 'Paragraph':
        return <p className="component-paragraph">{props?.text || '段落内容'}</p>
      case 'Image':
        return (
          <div className="component-image">
            <span>🖼️ 图片占位</span>
          </div>
        )
      case 'Avatar':
        return <div className="component-avatar">{label?.charAt(0)}</div>
      case 'Table':
        return (
          <table className="component-table">
            <thead>
              <tr>
                <th>列 1</th>
                <th>列 2</th>
                <th>列 3</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>数据 1</td>
                <td>数据 2</td>
                <td>数据 3</td>
              </tr>
              <tr>
                <td>数据 4</td>
                <td>数据 5</td>
                <td>数据 6</td>
              </tr>
            </tbody>
          </table>
        )
      case 'List':
        return (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li style={{ padding: 12, borderBottom: '1px solid #e8e8e8' }}>列表项 1</li>
            <li style={{ padding: 12, borderBottom: '1px solid #e8e8e8' }}>列表项 2</li>
            <li style={{ padding: 12 }}>列表项 3</li>
          </ul>
        )
      case 'Card':
        return (
          <div className="component-card">
            <h4>卡片标题</h4>
            <p>卡片内容描述</p>
          </div>
        )
      case 'Divider':
        return <hr className="component-divider" />
      case 'Progress':
        return (
          <div className="component-progress">
            <div className="component-progress-bar" style={{ width: '60%' }} />
          </div>
        )
      case 'Alert':
        return (
          <div style={{ padding: 12, background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 4, color: '#0050b3' }}>
            ⚠️ 这是一条提示信息
          </div>
        )
      case 'Tag':
        return (
          <Space>
            <Tag color="blue">标签 1</Tag>
            <Tag color="green">标签 2</Tag>
            <Tag color="orange">标签 3</Tag>
          </Space>
        )
      case 'Statistic':
        return (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 32, fontWeight: 600, color: '#667eea' }}>1,234</div>
            <div style={{ color: '#999', marginTop: 8 }}>统计数值</div>
          </div>
        )
      case 'Descriptions':
        return (
          <div style={{ border: '1px solid #e8e8e8', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <span style={{ color: '#999' }}>名称:</span>
              <span>示例值</span>
              <span style={{ color: '#999' }}>类型:</span>
              <span>示例类型</span>
            </div>
          </div>
        )
      default:
        return <div>{label}</div>
    }
  }

  const handleDelete = (e) => {
    e.stopPropagation()
    onRemove && onRemove()
  }

  const handleDuplicate = (e) => {
    e.stopPropagation()
    onDuplicate && onDuplicate()
  }

  const handleMoveUp = (e) => {
    e.stopPropagation()
    onMove && onMove('up')
  }

  const handleMoveDown = (e) => {
    e.stopPropagation()
    onMove && onMove('down')
  }

  return (
    <div
      className={`draggable-component ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      {!previewMode && (
        <>
          <div className="component-header">
            <div className="component-info">
              <span className="component-index">#{index + 1}</span>
              <Tag className="component-type-tag" color="blue">
                {component.type}
              </Tag>
              <span className="component-label-text">{label}</span>
            </div>
            <div className="component-actions">
              <Button
                type="text"
                size="small"
                icon={<ArrowUpOutlined />}
                onClick={handleMoveUp}
                disabled={index === 0}
                title="上移"
              />
              <Button
                type="text"
                size="small"
                icon={<ArrowDownOutlined />}
                onClick={handleMoveDown}
                disabled={index === total - 1}
                title="下移"
              />
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={handleDuplicate}
                title="复制"
              />
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={handleDelete}
                title="删除"
              />
            </div>
          </div>
        </>
      )}
      <div className="component-preview">{renderComponent()}</div>
    </div>
  )
}

export default DraggableComponent
