/**
 * 可视化逻辑编排器
 * 基于节点和连线的流程图编辑器
 *
 * @author GRI Team
 * @version 1.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { logicEngine, LogicNodeType, LogicNodeState } from '../../engine/LogicEngine.js'

// 节点类型配置
const NODE_TYPES = {
  [LogicNodeType.TRIGGER]: {
    label: '触发器',
    color: '#1677ff',
    icon: '⚡',
    description: '流程开始触发',
  },
  [LogicNodeType.ACTION]: {
    label: '执行动作',
    color: '#52c41a',
    icon: '🔧',
    description: '执行一个动作',
  },
  [LogicNodeType.CONDITION]: {
    label: '条件判断',
    color: '#faad14',
    icon: '❓',
    description: '条件分支判断',
  },
  [LogicNodeType.LOOP]: {
    label: '循环',
    color: '#722ed1',
    icon: '🔄',
    description: '循环执行',
  },
  [LogicNodeType.VARIABLE]: {
    label: '变量操作',
    color: '#13c2c2',
    icon: '📝',
    description: '设置/获取变量',
  },
  [LogicNodeType.DELAY]: {
    label: '延迟',
    color: '#eb2f96',
    icon: '⏱',
    description: '延迟执行',
  },
  [LogicNodeType.SCRIPT]: {
    label: '脚本',
    color: '#f5222d',
    icon: '📜',
    description: '执行自定义脚本',
  },
}

// 动作类型配置
const ACTION_TYPES = [
  { value: 'log', label: '日志输出', icon: '📋' },
  { value: 'http', label: 'HTTP 请求', icon: '🌐' },
  { value: 'notification', label: '发送通知', icon: '📢' },
  { value: 'approval', label: '审批', icon: '✅' },
  { value: 'approve', label: '自动通过', icon: '✔' },
  { value: 'reject', label: '拒绝', icon: '✖' },
]

/**
 * 逻辑流编辑器组件
 */
const LogicFlowEditor = ({ flowId, value, onChange, readOnly = false }) => {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [selectedNode, setSelectedNode] = useState(null)
  const [draggingNode, setDraggingNode] = useState(null)
  const [showPanel, setShowPanel] = useState(false)
  const containerRef = useRef(null)

  // 初始化流程
  useEffect(() => {
    if (flowId) {
      const flow = logicEngine.getFlow(flowId)
      if (flow) {
        setNodes(flow.nodes || [])
        setEdges(flow.edges || [])
      }
    }
  }, [flowId])

  // 添加节点
  const handleAddNode = (type) => {
    const newNode = {
      id: `node_\${++nodeIdRef.current}`,
      name: NODE_TYPES[type]?.label || '节点',
      type,
      config: {},
      position: { x: 100, y: 100 },
    }
    setNodes([...nodes, newNode])
    setSelectedNode(newNode)
    setShowPanel(true)
  }

  // 删除节点
  const handleDeleteNode = (nodeId) => {
    setNodes(nodes.filter((n) => n.id !== nodeId))
    setEdges(edges.filter((e) => e.source !== nodeId && e.target !== nodeId))
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null)
      setShowPanel(false)
    }
  }

  // 更新节点
  const handleUpdateNode = (nodeId, updates) => {
    setNodes(nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)))
  }

  // 添加连线
  const handleAddEdge = (sourceId, targetId) => {
    const newEdge = {
      id: `edge_${Date.now()}`,
      source: sourceId,
      target: targetId,
    }
    setEdges([...edges, newEdge])
  }

  // 保存流程
  const handleSave = () => {
    const flow = logicEngine.registerFlow({
      id: flowId || `flow_${Date.now()}`,
      name: '逻辑流',
      nodes,
      edges,
    })
    onChange?.(flow)
  }

  return (
    <div className="logic-flow-editor" ref={containerRef}>
      {/* 工具栏 */}
      <div className="flow-toolbar">
        <div className="toolbar-section">
          <span className="section-title">添加节点</span>
          <div className="node-types">
            {Object.entries(NODE_TYPES).map(([type, config]) => (
              <button
                key={type}
                className="node-type-btn"
                onClick={() => handleAddNode(type)}
                disabled={readOnly}
                title={config.description}
              >
                <span className="icon">{config.icon}</span>
                <span className="label">{config.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-section">
          <button onClick={handleSave} className="save-btn">
            💾 保存
          </button>
        </div>
      </div>

      {/* 画布区域 */}
      <div className="flow-canvas">
        <svg className="edges-layer">
          {edges.map((edge) => {
            const source = nodes.find((n) => n.id === edge.source)
            const target = nodes.find((n) => n.id === edge.target)
            if (!source || !target) return null

            return (
              <line
                key={edge.id}
                x1={(source.position?.x || 0) + 200}
                y1={(source.position?.y || 0) + 50}
                x2={target.position?.x || 0}
                y2={target.position?.y || 0}
                stroke="#999"
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
              />
            )
          })}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#999" />
            </marker>
          </defs>
        </svg>

        {/* 节点列表 */}
        <div className="nodes-layer">
          {nodes.map((node) => (
            <div
              key={node.id}
              className={`flow-node ${selectedNode?.id === node.id ? 'selected' : ''}`}
              style={{
                left: node.position?.x || 0,
                top: node.position?.y || 0,
              }}
              onClick={() => {
                setSelectedNode(node)
                setShowPanel(true)
              }}
            >
              <div className="node-header">
                <span className="node-icon">{NODE_TYPES[node.type]?.icon || '📦'}</span>
                <span className="node-name">{node.name}</span>
              </div>
              <div className="node-body">
                <span className="node-type-label">{NODE_TYPES[node.type]?.label || node.type}</span>
              </div>
              {!readOnly && (
                <button
                  className="delete-node-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteNode(node.id)
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 属性面板 */}
      {showPanel && selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onUpdate={(updates) => handleUpdateNode(selectedNode.id, updates)}
          onClose={() => setShowPanel(false)}
        />
      )}
    </div>
  )
}

/**
 * 节点配置面板
 */
const NodeConfigPanel = ({ node, onUpdate, onClose }) => {
  const [config, setConfig] = useState(node.config || {})

  const handleChange = (key, value) => {
    const newConfig = { ...config, [key]: value }
    setConfig(newConfig)
    onUpdate({ config: newConfig })
  }

  return (
    <div className="node-config-panel">
      <div className="panel-header">
        <h4>{node.name} - 配置</h4>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="panel-body">
        {/* 节点名称 */}
        <div className="config-group">
          <label>节点名称</label>
          <input
            type="text"
            value={node.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
        </div>

        {/* 条件节点配置 */}
        {node.type === LogicNodeType.CONDITION && (
          <div className="config-group">
            <label>条件表达式</label>
            <textarea
              value={config.condition || ''}
              onChange={(e) => handleChange('condition', e.target.value)}
              placeholder="例如：${ amount > 1000 }"
              rows={3}
            />
            <small>支持 $ 语法和表达式</small>
          </div>
        )}

        {/* 动作节点配置 */}
        {node.type === LogicNodeType.ACTION && (
          <>
            <div className="config-group">
              <label>动作类型</label>
              <select
                value={config.actionType || ''}
                onChange={(e) => handleChange('actionType', e.target.value)}
              >
                <option value="">请选择动作</option>
                {ACTION_TYPES.map((action) => (
                  <option key={action.value} value={action.value}>
                    {action.icon} {action.label}
                  </option>
                ))}
              </select>
            </div>

            {config.actionType === 'http' && (
              <div className="config-group">
                <label>HTTP 配置</label>
                <input
                  type="text"
                  placeholder="URL"
                  value={config.url || ''}
                  onChange={(e) => handleChange('url', e.target.value)}
                />
                <select
                  value={config.method || 'GET'}
                  onChange={(e) => handleChange('method', e.target.value)}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
            )}
          </>
        )}

        {/* 变量节点配置 */}
        {node.type === LogicNodeType.VARIABLE && (
          <div className="config-group">
            <label>操作类型</label>
            <select
              value={config.operation || 'set'}
              onChange={(e) => handleChange('operation', e.target.value)}
            >
              <option value="set">设置变量</option>
              <option value="delete">删除变量</option>
              <option value="append">追加到数组</option>
            </select>
            <input
              type="text"
              placeholder="变量名"
              value={config.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
            />
            <input
              type="text"
              placeholder="值（支持表达式）"
              value={config.value || ''}
              onChange={(e) => handleChange('value', e.target.value)}
            />
          </div>
        )}

        {/* 延迟节点配置 */}
        {node.type === LogicNodeType.DELAY && (
          <div className="config-group">
            <label>延迟时间 (ms)</label>
            <input
              type="number"
              value={config.duration || 1000}
              onChange={(e) => handleChange('duration', parseInt(e.target.value, 10))}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default LogicFlowEditor
