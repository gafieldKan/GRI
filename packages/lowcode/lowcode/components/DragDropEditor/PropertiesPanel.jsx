import React from 'react'
import { Form, Input, Switch, Tag, Empty, Divider } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import useEditorStore from '../../store/editorStore'
import './styles.css'

const PropertiesPanel = () => {
  const { components, selectedComponent, updateComponent } = useEditorStore()
  const selected = components.find((c) => c.id === selectedComponent)

  if (!selected) {
    return (
      <div className="properties-panel">
        <h4 className="panel-title">属性面板</h4>
        <div className="empty-state">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择一个组件以编辑属性" />
        </div>
      </div>
    )
  }

  const handlePropChange = (key, value) => {
    updateComponent(selected.id, {
      props: { ...selected.props, [key]: value },
    })
  }

  return (
    <div className="properties-panel">
      <h4 className="panel-title">属性面板</h4>
      <div className="selected-info">
        <div className="info-row">
          <span className="info-label">组件类型:</span>
          <Tag color="blue">{selected.type}</Tag>
        </div>
        <div className="info-row">
          <span className="info-label">组件名称:</span>
          <span className="info-value">{selected.label}</span>
        </div>
        <div className="info-row">
          <span className="info-label">组件 ID:</span>
          <code className="component-id">{selected.id}</code>
        </div>
      </div>

      <Divider className="properties-divider" />

      <Form layout="vertical" size="small">
        <Form.Item label="文本内容">
          <Input
            value={selected.props?.text || ''}
            onChange={(e) => handlePropChange('text', e.target.value)}
            placeholder="请输入文本内容"
          />
        </Form.Item>

        <Form.Item label="占位符">
          <Input
            value={selected.props?.placeholder || ''}
            onChange={(e) => handlePropChange('placeholder', e.target.value)}
            placeholder="请输入占位符"
          />
        </Form.Item>

        <Form.Item label="是否必填" valuePropName="checked">
          <Switch
            checked={selected.props?.required || false}
            onChange={(checked) => handlePropChange('required', checked)}
          />
        </Form.Item>

        <Form.Item label="按钮类型">
          <Input
            value={selected.props?.buttonType || 'primary'}
            onChange={(e) => handlePropChange('buttonType', e.target.value)}
            placeholder="例如：primary, default, danger"
          />
        </Form.Item>
      </Form>

      <div className="property-tips">
        <InfoCircleOutlined /> 修改上方属性将自动保存到组件
      </div>
    </div>
  )
}

export default PropertiesPanel
