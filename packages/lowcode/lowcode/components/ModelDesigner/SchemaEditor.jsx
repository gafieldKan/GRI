import React, { useState } from 'react'
import { Card, Form, Input, Table, Button, Tag, Modal, Space } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import useModelStore from '../../store/modelStore'

const SchemaEditor = () => {
  const { models, addModel, selectModel, selectedModel, addField, updateField, deleteField } =
    useModelStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modelName, setModelName] = useState('')
  const [modelDescription, setModelDescription] = useState('')

  const handleAddModel = () => {
    if (!modelName.trim()) return
    addModel({ name: modelName, description: modelDescription })
    setModelName('')
    setModelDescription('')
    setIsModalOpen(false)
  }

  const fieldColumns = [
    {
      title: '字段名',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type) => <Tag color="blue">{type}</Tag>,
    },
    {
      title: '默认值',
      dataIndex: 'default',
      key: 'default',
    },
    {
      title: '属性',
      key: 'flags',
      render: (_, record) => (
        <Space size={4}>
          {record.required && <Tag color="red">必填</Tag>}
          {record.unique && <Tag color="green">唯一</Tag>}
          {record.index && <Tag color="purple">索引</Tag>}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleEditField(record)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => deleteField(selectedModel, record.id)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const handleEditField = (field) => {
    const name = prompt('字段名:', field.name || '')
    const type = prompt('类型:', field.type || 'string')
    if (name && selectedModel) {
      updateField(selectedModel, field.id, { name, type })
    }
  }

  const selectedModelData = models.find((m) => m.id === selectedModel)

  return (
    <div className="schema-editor">
      <div className="schema-list" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2>数据模型</h2>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
            新建模型
          </Button>
        </div>
        <Space wrap>
          {models.map((model) => (
            <Card
              key={model.id}
              hoverable
              style={{
                width: 200,
                cursor: 'pointer',
                border: selectedModel === model.id ? '2px solid #1890ff' : undefined,
              }}
              onClick={() => selectModel(model.id)}
              title={model.name}
              size="small"
            >
              <Tag color="blue">{model.fields?.length || 0} 个字段</Tag>
            </Card>
          ))}
          {models.length === 0 && (
            <div style={{ padding: 20, color: '#999' }}>
              暂无模型，请点击 &quot;新建模型&quot; 创建
            </div>
          )}
        </Space>
      </div>

      {selectedModelData && (
        <div className="model-detail">
          <Card title={`模型：${selectedModelData.name}`} size="small">
            <div style={{ marginBottom: 16 }}>
              <Space>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    const name = prompt('字段名:')
                    if (name) {
                      addField(selectedModelData.id, {
                        name,
                        type: 'string',
                        default: '',
                      })
                    }
                  }}
                >
                  添加字段
                </Button>
                <Button
                  onClick={() => {
                    const schema = JSON.stringify(
                      {
                        id: selectedModelData.id,
                        name: selectedModelData.name,
                        fields: selectedModelData.fields,
                      },
                      null,
                      2
                    )
                    navigator.clipboard.writeText(schema)
                    alert('Schema 已复制到剪贴板')
                  }}
                >
                  导出 Schema
                </Button>
              </Space>
            </div>
            <Table
              columns={fieldColumns}
              dataSource={selectedModelData.fields || []}
              rowKey="id"
              pagination={false}
            />
          </Card>
        </div>
      )}

      <Modal
        title="新建模型"
        open={isModalOpen}
        onOk={handleAddModel}
        onCancel={() => setIsModalOpen(false)}
        okText="创建"
        cancelText="取消"
      >
        <Form layout="vertical">
          <Form.Item label="模型名称" required>
            <Input
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="例如：User, Product, Order"
            />
          </Form.Item>
          <Form.Item label="描述">
            <Input.TextArea
              value={modelDescription}
              onChange={(e) => setModelDescription(e.target.value)}
              placeholder="模型描述..."
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default SchemaEditor
