/**
 * 工作流画布组件
 * 可视化工作流编排 - 基于节点和连线
 */

import React, { useState, useRef } from 'react'
import { Button, Select, Tag } from 'antd'
import { DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons'
import './FlowCanvas.css'

// 节点类型
const NODE_TYPES = {
  TRIGGER: 'trigger', // 触发器节点
  ACTION: 'action', // 操作节点
  CONDITION: 'condition', // 条件节点
  END: 'end', // 结束节点
}

// 触发器类型
const TRIGGER_TYPES = [
  { value: 'manual', label: '手动触发' },
  { value: 'schedule', label: '定时触发' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'data_change', label: '数据变更' },
  { value: 'data_create', label: '创建数据' },
  { value: 'data_delete', label: '删除数据' },
]

// 操作类型
const ACTION_TYPES = [
  { value: 'create_data', label: '创建数据' },
  { value: 'update_data', label: '更新数据' },
  { value: 'delete_data', label: '删除数据' },
  { value: 'send_email', label: '发送邮件' },
  { value: 'send_sms', label: '发送短信' },
  { value: 'http_request', label: 'HTTP 请求' },
  { value: 'run_script', label: '执行脚本' },
  { value: 'notify', label: '通知用户' },
  { value: 'approve', label: '审批流程' },
  { value: 'condition', label: '条件判断' },
  { value: 'delay', label: '延时等待' },
  { value: 'loop', label: '循环操作' },
]

/**
 * 流程节点组件
 */
const FlowNode = ({ node, isSelected, onSelect, onDelete, _onUpdate, readOnly = false }) => {
  const getNodeStyle = () => {
    const baseStyle = {
      padding: '12px 16px',
      borderRadius: '8px',
      cursor: readOnly ? 'default' : 'pointer',
      border: isSelected ? '2px solid #1890ff' : '1px solid #d9d9d9',
      background: node.enabled !== false ? '#fff' : '#f5f5f5',
    }

    switch (node.type) {
      case NODE_TYPES.TRIGGER:
        return { ...baseStyle, background: '#e6f7ff', borderColor: '#1890ff' }
      case NODE_TYPES.ACTION:
        return { ...baseStyle, background: '#f6ffed', borderColor: '#52c41a' }
      case NODE_TYPES.CONDITION:
        return { ...baseStyle, background: '#fff7e6', borderColor: '#fa8c16' }
      case NODE_TYPES.END:
        return { ...baseStyle, background: '#f0f0f0', borderColor: '#999' }
      default:
        return baseStyle
    }
  }

  const getIcon = () => {
    switch (node.type) {
      case NODE_TYPES.TRIGGER:
        return '🔔'
      case NODE_TYPES.ACTION:
        return '⚡'
      case NODE_TYPES.CONDITION:
        return '❓'
      case NODE_TYPES.END:
        return '🏁'
      default:
        return '📍'
    }
  }

  return (
    <div
      className="flow-node"
      style={getNodeStyle()}
      onClick={() => !readOnly && onSelect?.(node.id)}
    >
      <div className="flow-node-header">
        <span className="flow-node-icon">{getIcon()}</span>
        <span className="flow-node-title">{node.name || node.label}</span>
        {!readOnly && (
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              onDelete?.(node.id)
            }}
          />
        )}
      </div>
      {node.description && <div className="flow-node-desc">{node.description}</div>}
      {node.type === NODE_TYPES.TRIGGER && (
        <Tag color="blue">
          {TRIGGER_TYPES.find((t) => t.value === node.triggerType)?.label || node.triggerType}
        </Tag>
      )}
      {node.type === NODE_TYPES.ACTION && (
        <Tag color="green">
          {ACTION_TYPES.find((t) => t.value === node.actionType)?.label || node.actionType}
        </Tag>
      )}
    </div>
  )
}

/**
 * 流程画布组件
 */
const FlowCanvas = ({ _workflow, nodes = [], _edges, onNodesChange, readOnly = false }) => {
  const [selectedNode, setSelectedNode] = useState(null)
  const canvasRef = useRef(null)

  const handleDrop = (e) => {
    e.preventDefault()
    if (readOnly) return

    const nodeType = e.dataTransfer.getData('nodeType')

    if (nodeType) {
      const newNode = {
        id: `node_${Date.now()}`,
        type: nodeType,
        name: `新${TRIGGER_TYPES.find((t) => t.value === nodeType)?.label || '节点'}`,
        triggerType: nodeType,
        actionType: nodeType,
        x: e.clientX - 200,
        y: e.clientY - 100,
      }
      onNodesChange?.([...nodes, newNode])
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const addNode = (type, _data = {}) => {
    if (readOnly) return

    const newNode = {
      id: `node_${Date.now()}`,
      type,
      name: `新${type === NODE_TYPES.TRIGGER ? '触发器' : '操作'}`,
    }

    onNodesChange?.([...nodes, newNode])
  }

  const deleteNode = (nodeId) => {
    if (readOnly) return
    onNodesChange?.(nodes.filter((n) => n.id !== nodeId))
    if (selectedNode === nodeId) {
      setSelectedNode(null)
    }
  }

  const updateNode = (nodeId, updates) => {
    onNodesChange?.(nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)))
  }

  return (
    <div className="flow-canvas-container">
      <div className="flow-toolbar">
        <span className="flow-toolbar-title">工作流编排</span>
        <div className="flow-toolbar-actions">
          <Select
            placeholder="添加触发器"
            style={{ width: 150 }}
            onChange={(value) => addNode(NODE_TYPES.TRIGGER, { triggerType: value })}
            disabled={readOnly}
            options={TRIGGER_TYPES}
          />
          <Select
            placeholder="添加操作"
            style={{ width: 120 }}
            onChange={(value) => addNode(NODE_TYPES.ACTION, { actionType: value })}
            disabled={readOnly}
            options={ACTION_TYPES}
          />
          {!readOnly && (
            <>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => console.warn('运行工作流')}
              >
                运行
              </Button>
            </>
          )}
        </div>
      </div>

      <div ref={canvasRef} className="flow-canvas" onDrop={handleDrop} onDragOver={handleDragOver}>
        {nodes.length === 0 ? (
          <div className="flow-empty">
            <p>暂无节点</p>
            <p style={{ color: '#999', fontSize: 14 }}>从上方添加触发器或操作</p>
          </div>
        ) : (
          <div className="flow-nodes">
            {nodes.map((node) => (
              <FlowNode
                key={node.id}
                node={node}
                isSelected={selectedNode === node.id}
                onSelect={setSelectedNode}
                onDelete={deleteNode}
                onUpdate={updateNode}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default FlowCanvas
