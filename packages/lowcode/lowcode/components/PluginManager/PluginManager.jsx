import React, { useState, useEffect } from 'react'
import { Card, Table, Tag, Switch, Button, Space, Modal, Descriptions, Badge } from 'antd'
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RocketOutlined,
  SettingOutlined,
  PlusOutlined,
} from '@ant-design/icons'

// 内置插件列表（模拟）
const builtInPlugins = [
  {
    id: 'core-form',
    name: '核心表单组件',
    version: '1.0.0',
    description: '提供基础表单组件和验证功能',
    author: 'Awesome Lowcode',
    status: 'active',
    type: 'component',
    enabled: true,
  },
  {
    id: 'core-model',
    name: '数据模型引擎',
    version: '1.0.0',
    description: '数据模型定义和管理核心功能',
    author: 'Awesome Lowcode',
    status: 'active',
    type: 'engine',
    enabled: true,
  },
  {
    id: 'core-workflow',
    name: '工作流引擎',
    version: '1.0.0',
    description: '业务流程编排和执行引擎',
    author: 'Awesome Lowcode',
    status: 'active',
    type: 'engine',
    enabled: true,
  },
  {
    id: 'ai-assistant',
    name: 'AI 助手',
    version: '1.0.0',
    description: 'AI 驱动的智能助手功能',
    author: 'Awesome Lowcode',
    status: 'active',
    type: 'feature',
    enabled: true,
  },
  {
    id: 'git-version',
    name: 'Git 版本管理',
    version: '1.0.0',
    description: 'Git 版本控制集成功能',
    author: 'Awesome Lowcode',
    status: 'active',
    type: 'feature',
    enabled: true,
  },
  {
    id: 'collaboration',
    name: '实时协作',
    version: '1.0.0',
    description: '多人实时协同编辑功能',
    author: 'Awesome Lowcode',
    status: 'active',
    type: 'feature',
    enabled: true,
  },
  {
    id: 'analytics',
    name: '数据分析',
    version: '1.0.0',
    description: '用户行为分析和数据看板',
    author: 'Awesome Lowcode',
    status: 'active',
    type: 'feature',
    enabled: true,
  },
  {
    id: 'multi-platform',
    name: '多端发布',
    version: '1.0.0',
    description: '一键发布到多个平台',
    author: 'Awesome Lowcode',
    status: 'active',
    type: 'feature',
    enabled: true,
  },
]

// 插件类型标签
const typeLabels = {
  component: { text: '组件', color: 'blue' },
  engine: { text: '引擎', color: 'purple' },
  feature: { text: '功能', color: 'green' },
  extension: { text: '扩展', color: 'orange' },
}

function PluginManager() {
  const [plugins, setPlugins] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [selectedPlugin, setSelectedPlugin] = useState(null)
  const [detailVisible, setDetailVisible] = useState(false)

  useEffect(() => {
    loadPlugins()
  }, [])

  const loadPlugins = () => {
    setLoading(true)
    // 模拟加载插件
    setTimeout(() => {
      setPlugins(builtInPlugins)
      setLoading(false)
    }, 500)
  }

  const handleTogglePlugin = (checked, pluginId) => {
    setPlugins(plugins.map(p =>
      p.id === pluginId ? { ...p, enabled: checked } : p
    ))
  }

  const handleShowDetail = (plugin) => {
    setSelectedPlugin(plugin)
    setDetailVisible(true)
  }

  const columns = [
    {
      title: '插件名称',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
          <RocketOutlined style={{ color: '#1890ff' }} />
          <span>{text}</span>
          <Tag color={record.enabled ? 'success' : 'default'}>
            {record.enabled ? '已启用' : '已禁用'}
          </Tag>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type) => {
        const config = typeLabels[type] || { text: type, color: 'default' }
        return <Tag color={config.color}>{config.text}</Tag>
      },
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 100,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '作者',
      dataIndex: 'author',
      key: 'author',
      width: 120,
      render: (text) => <span style={{ color: '#666' }}>{text}</span>,
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_, record) => (
        <Switch
          checked={record.enabled}
          onChange={(checked) => handleTogglePlugin(checked, record.id)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button type="link" onClick={() => handleShowDetail(record)}>
          详情
        </Button>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>插件管理</h2>
        <Space>
          <Button type="primary" icon={<PlusOutlined />}>
            安装插件
          </Button>
          <Button onClick={loadPlugins}>刷新</Button>
        </Space>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={plugins}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* 插件详情对话框 */}
      {selectedPlugin && (
        <Modal
          title={
            <Space>
              <RocketOutlined style={{ color: '#1890ff' }} />
              {selectedPlugin.name}
            </Space>
          }
          open={detailVisible}
          onCancel={() => setDetailVisible(false)}
          footer={null}
          size={600}
        >
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="插件 ID">{selectedPlugin.id}</Descriptions.Item>
            <Descriptions.Item label="版本">{selectedPlugin.version}</Descriptions.Item>
            <Descriptions.Item label="类型">
              <Tag color={typeLabels[selectedPlugin.type]?.color}>
                {typeLabels[selectedPlugin.type]?.text}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="作者">{selectedPlugin.author}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Badge status={selectedPlugin.enabled ? 'success' : 'error'} />
              {selectedPlugin.enabled ? '已启用' : '已禁用'}
            </Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>
              {selectedPlugin.description}
            </Descriptions.Item>
          </Descriptions>

          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <Space>
              <Button
                onClick={() => {
                  handleTogglePlugin(!selectedPlugin.enabled, selectedPlugin.id)
                  setDetailVisible(false)
                }}
              >
                {selectedPlugin.enabled ? '禁用插件' : '启用插件'}
              </Button>
              <Button onClick={() => setDetailVisible(false)}>关闭</Button>
            </Space>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default PluginManager
