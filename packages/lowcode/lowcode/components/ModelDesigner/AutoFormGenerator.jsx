import React, { useState } from 'react'
import { Card, Form, Input, InputNumber, DatePicker, Button, Space, Alert, Typography } from 'antd'
import useModelStore from '../../store/modelStore'

const { Text } = Typography

const AutoFormGenerator = () => {
  const { models, selectedModel } = useModelStore()
  const [formData, setFormData] = useState({})

  const modelData = models.find((m) => m.id === selectedModel)

  if (!modelData) {
    return (
      <div style={{ padding: 20 }}>
        <Alert
          message="请选择一个模型"
          description='在 " 模型设计" 标签页中选择一个数据模型以生成表单'
          type="info"
        />
      </div>
    )
  }

  const renderField = (field) => {
    const { type, name, required } = field

    const commonProps = {
      key: field.id || name,
      name: name,
      label: name,
      rules: [{ required: !!required, message: `请输入${name}` }],
    }

    switch (type) {
      case 'string':
      case 'email':
      case 'url':
      case 'phone':
        return (
          <Form.Item {...commonProps}>
            <Input placeholder={`请输入${name}`} />
          </Form.Item>
        )
      case 'number':
        return (
          <Form.Item {...commonProps}>
            <InputNumber style={{ width: '100%' }} placeholder={`请输入${name}`} />
          </Form.Item>
        )
      case 'boolean':
        return (
          <Form.Item {...commonProps} valuePropName="checked">
            <input type="checkbox" />
          </Form.Item>
        )
      case 'date':
        return (
          <Form.Item {...commonProps}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        )
      default:
        return (
          <Form.Item {...commonProps}>
            <Input placeholder={`请输入${name}`} />
          </Form.Item>
        )
    }
  }

  const handleSubmit = (_values) => {
    alert('表单已提交，请查看控制台输出')
  }

  const handleReset = () => {
    setFormData({})
  }

  return (
    <div className="auto-form-generator">
      <Card title={`自动生成表单：${modelData.name}`}>
        <Alert
          message="自动生成的表单"
          description="根据模型字段定义自动生成的表单，支持数据绑定和验证"
          type="success"
          style={{ marginBottom: 24 }}
        />
        <Form
          layout="vertical"
          onFinish={handleSubmit}
          onValuesChange={(changed, all) => setFormData(all)}
        >
          {modelData.fields && modelData.fields.length > 0 ? (
            modelData.fields.map((field) => renderField(field))
          ) : (
            <Alert message="暂无字段" description="请先在模型中添加字段" type="warning" />
          )}
          <Form.Item style={{ marginTop: 24 }}>
            <Space>
              <Button type="primary" htmlType="submit">
                提交
              </Button>
              <Button htmlType="button" onClick={handleReset}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>

        {Object.keys(formData).length > 0 && (
          <div style={{ marginTop: 24 }}>
            <Text strong>实时数据:</Text>
            <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 4, marginTop: 8 }}>
              {JSON.stringify(formData, null, 2)}
            </pre>
          </div>
        )}
      </Card>
    </div>
  )
}

export default AutoFormGenerator
