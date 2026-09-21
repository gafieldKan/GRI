import React, { useState } from 'react'
import {
  Card,
  Button,
  List,
  Tag,
  Switch,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Typography,
  Divider,
} from 'antd'
import {
  PlusOutlined,
  PlayCircleOutlined,
  SettingOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import useWorkflowStore, { triggerTypes, actionTypes } from '../../store/workflowStore'
import './styles.css'

const { Text } = Typography
const { Option } = Select

const WorkflowDesigner = () => {
  const {
    workflows,
    selectedWorkflow,
    selectWorkflow,
    addWorkflow,
    deleteWorkflow,
    updateWorkflow,
    addAction,
  } = useWorkflowStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [workflowName, setWorkflowName] = useState('')
  const [workflowDesc, setWorkflowDesc] = useState('')

  const handleAddWorkflow = () => {
    if (!workflowName.trim()) return
    addWorkflow({ name: workflowName, description: workflowDesc })
    setWorkflowName('')
    setWorkflowDesc('')
    setIsModalOpen(false)
  }

  const selectedWorkflowData = workflows.find((w) => w.id === selectedWorkflow)

  const getTriggerLabel = (type) => {
    const trigger = triggerTypes.find((t) => t.type === type)
    return trigger ? (
      <Tag icon={<span>{trigger.icon}</span>} color="blue">
        {trigger.label}
      </Tag>
    ) : (
      type
    )
  }

  const getActionLabel = (type) => {
    const action = actionTypes.find((a) => a.type === type)
    return action ? (
      <Tag icon={<span>{action.icon}</span>} color="green">
        {action.label}
      </Tag>
    ) : (
      type
    )
  }

  return (
    <div className="workflow-designer">
      <div className="workflow-header">
        <h1>🔄 工作流设计器</h1>
        <p style={{ color: '#666', marginTop: 8 }}>可视化工作流编排，自动化业务流程</p>
      </div>

      <div className="workflow-content">
        {/* Left: Workflow List */}
        <div className="workflow-list-panel">
          <Card
            title="工作流列表"
            size="small"
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                size="small"
                onClick={() => setIsModalOpen(true)}
              >
                新建
              </Button>
            }
          >
            <List
              dataSource={workflows}
              renderItem={(workflow) => (
                <List.Item
                  className={`workflow-item ${selectedWorkflow === workflow.id ? 'selected' : ''}`}
                  onClick={() => selectWorkflow(workflow.id)}
                >
                  <div className="workflow-item-content">
                    <div className="workflow-item-title">{workflow.name}</div>
                    <div className="workflow-item-desc">{workflow.description}</div>
                    <div className="workflow-item-meta">
                      <Tag color={workflow.enabled ? 'green' : 'default'}>
                        {workflow.enabled ? '已启用' : '已禁用'}
                      </Tag>
                      <Tag color="blue">{workflow.actions?.length || 0} 个操作</Tag>
                    </div>
                  </div>
                </List.Item>
              )}
              emptyText={
                <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>暂无工作流</div>
              }
            />
          </Card>
        </div>

        {/* Center: Workflow Canvas */}
        <div className="workflow-canvas-panel">
          {selectedWorkflowData ? (
            <Card
              title={
                <div className="workflow-card-header">
                  <span>{selectedWorkflowData.name}</span>
                  <Space>
                    <Button
                      size="small"
                      icon={<PlayCircleOutlined />}
                      onClick={() => alert('工作流执行中...')}
                    >
                      运行
                    </Button>
                    <Button size="small" icon={<SettingOutlined />} onClick={() => {}}>
                      设置
                    </Button>
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => deleteWorkflow(selectedWorkflowData.id)}
                    >
                      删除
                    </Button>
                  </Space>
                </div>
              }
              size="small"
              className="workflow-canvas-card"
            >
              {/* Trigger Section */}
              <div className="workflow-section">
                <div className="section-title">
                  <span className="section-icon">🎯</span> 触发器
                </div>
                <div className="trigger-config">
                  <div className="trigger-item">
                    {getTriggerLabel(selectedWorkflowData.trigger?.type || 'manual')}
                    <Button type="link" size="small" onClick={() => {}}>
                      配置
                    </Button>
                  </div>
                </div>
              </div>

              <Divider />

              {/* Actions Section */}
              <div className="workflow-section">
                <div className="section-title">
                  <span className="section-icon">⚡</span> 操作
                </div>
                <div className="actions-list">
                  {selectedWorkflowData.actions && selectedWorkflowData.actions.length > 0 ? (
                    selectedWorkflowData.actions.map((action, index) => (
                      <div key={action.id} className="action-item">
                        <div className="action-index">{index + 1}</div>
                        <div className="action-content">
                          {getActionLabel(action.type)}
                          {action.config?.name && <Text>{action.config.name}</Text>}
                        </div>
                        <div className="action-buttons">
                          <Button type="link" size="small" onClick={() => {}}>
                            编辑
                          </Button>
                          <Button
                            type="link"
                            size="small"
                            danger
                            onClick={() => deleteAction(selectedWorkflowData.id, action.id)}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>
                      暂无操作，请添加
                    </div>
                  )}
                </div>

                {/* Add Action Button */}
                <div className="add-action-section">
                  <ActionSelector
                    onAddAction={(actionType) => {
                      addAction(selectedWorkflowData.id, {
                        type: actionType,
                        config: {},
                      })
                    }}
                  />
                </div>
              </div>
            </Card>
          ) : (
            <Card size="small" className="empty-canvas">
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                <p style={{ color: '#999' }}>请选择或创建一个工作流</p>
              </div>
            </Card>
          )}
        </div>

        {/* Right: Properties Panel */}
        <div className="workflow-properties-panel">
          <Card title="工作流信息" size="small">
            {selectedWorkflowData ? (
              <div>
                <div className="property-item">
                  <Text strong>名称:</Text>
                  <Input
                    value={selectedWorkflowData.name}
                    onChange={(e) =>
                      updateWorkflow(selectedWorkflowData.id, { name: e.target.value })
                    }
                    size="small"
                  />
                </div>
                <div className="property-item">
                  <Text strong>描述:</Text>
                  <Input.TextArea
                    value={selectedWorkflowData.description}
                    onChange={(e) =>
                      updateWorkflow(selectedWorkflowData.id, { description: e.target.value })
                    }
                    size="small"
                    rows={3}
                  />
                </div>
                <div className="property-item">
                  <Text strong>状态:</Text>
                  <Switch
                    checked={selectedWorkflowData.enabled}
                    onChange={(checked) =>
                      updateWorkflow(selectedWorkflowData.id, { enabled: checked })
                    }
                  />
                </div>
                <div className="property-item">
                  <Text strong>创建时间:</Text>
                  <Text>{new Date(selectedWorkflowData.createdAt || 0).toLocaleString()}</Text>
                </div>
              </div>
            ) : (
              <div style={{ color: '#999' }}>请选择工作流</div>
            )}
          </Card>
        </div>
      </div>

      {/* New Workflow Modal */}
      <Modal
        title="新建工作流"
        open={isModalOpen}
        onOk={handleAddWorkflow}
        onCancel={() => setIsModalOpen(false)}
        okText="创建"
        cancelText="取消"
      >
        <Form layout="vertical">
          <Form.Item label="工作流名称" required>
            <Input
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              placeholder="例如：订单处理流程、用户注册流程"
            />
          </Form.Item>
          <Form.Item label="描述">
            <Input.TextArea
              value={workflowDesc}
              onChange={(e) => setWorkflowDesc(e.target.value)}
              placeholder="工作流描述..."
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// Action Selector Component
const ActionSelector = ({ onAddAction }) => {
  const [selected, setSelected] = useState(null)

  return (
    <div className="action-selector">
      <Select
        placeholder="添加操作"
        style={{ width: '100%' }}
        onChange={setSelected}
        value={selected}
        onBlur={() => {
          if (selected) {
            onAddAction(selected)
            setSelected(null)
          }
        }}
      >
        {actionTypes.map((action) => (
          <Option key={action.type} value={action.type}>
            {action.icon} {action.label}
          </Option>
        ))}
      </Select>
    </div>
  )
}

export default WorkflowDesigner
