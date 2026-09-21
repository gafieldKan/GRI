/**
 * 开发者调试工具面板
 * 用于查看应用状态、事件历史、插件信息等
 */

import React, { useState, useEffect } from 'react'
import { Drawer, Tabs, Card, Tag, Space, Button, Table, Typography, Badge } from 'antd'
import {
  DashboardOutlined,
  LockOutlined,
  DatabaseOutlined,
  ClearOutlined,
  ReloadOutlined,
  AppstoreOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'

// PluginOutlined 在部分版本中可能不存在，使用 AppstoreOutlined 代替
const PluginOutlined = AppstoreOutlined
// EventOutlined 在部分版本中可能不存在，使用 ClockCircleOutlined 代替
const EventOutlined = ClockCircleOutlined
import { eventEngine } from '../../engine/EventEngine'
import { pluginRegistry } from '../../core/PluginRegistry'
import { permissionManager } from '../../core/PermissionManager'
import { schemaManager } from '../../core/SchemaManager'
// pluginMarket import removed - unused
import './DebugPanel.css'

const { Text, Paragraph } = Typography

// 状态面板
const StatusPanel = () => {
  const [appInfo, setAppInfo] = useState({
    plugins: 0,
    events: 0,
    models: 0,
  })

  useEffect(() => {
    // 使用 setTimeout 避免在 effect 中同步调用 setState
    const timer = setTimeout(() => {
      setAppInfo({
        plugins: pluginRegistry.getAll()?.length || 0,
        events: eventEngine.eventHistory?.size || 0,
        models: schemaManager.getAll()?.length || 0,
      })
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="debug-status">
      <Card size="small" className="status-card">
        <div className="status-item">
          <PluginOutlined className="status-icon" />
          <div>
            <div className="status-value">{appInfo.plugins}</div>
            <div className="status-label">已注册插件</div>
          </div>
        </div>
        <div className="status-item">
          <EventOutlined className="status-icon" />
          <div>
            <div className="status-value">{appInfo.events}</div>
            <div className="status-label">事件数量</div>
          </div>
        </div>
        <div className="status-item">
          <DatabaseOutlined className="status-icon" />
          <div>
            <div className="status-value">{appInfo.models}</div>
            <div className="status-label">数据模型</div>
          </div>
        </div>
      </Card>
    </div>
  )
}

// 插件面板
const PluginPanel = () => {
  const [plugins, setPlugins] = useState(() => pluginRegistry.getAll() || [])

  const refreshPlugins = useCallback(() => {
    setPlugins(pluginRegistry.getAll() || [])
  }, [])

  const columns = [
    {
      title: '插件名称',
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
      title: '版本',
      dataIndex: 'config',
      key: 'version',
      render: (config) => <span>{config?.version || '1.0.0'}</span>,
    },
    {
      title: '状态',
      key: 'state',
      render: (_, record) => (
        <Badge
          status={record.loaded ? 'success' : 'default'}
          text={record.loaded ? '已加载' : '未加载'}
        />
      ),
    },
  ]

  return (
    <div className="debug-panel">
      <div className="panel-header">
        <Text strong>已注册的插件</Text>
        <Button icon={<ReloadOutlined />} size="small" onClick={refreshPlugins}>
          刷新
        </Button>
      </div>
      <Table columns={columns} dataSource={plugins} rowKey="name" size="small" pagination={false} />
    </div>
  )
}

// 事件面板
const EventPanel = () => {
  const [events, setEvents] = useState([])

  const refreshEvents = useCallback(() => {
    const history = []
    eventEngine.eventHistory?.forEach((value, key) => {
      value.forEach((item) => {
        history.push({
          event: key,
          timestamp: item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '-',
          args: JSON.stringify(item.args || item) || '[]',
        })
      })
    })
    setEvents(history.slice(-20).reverse())
  }, [])

  const columns = [
    {
      title: '事件名称',
      dataIndex: 'event',
      key: 'event',
      render: (text) => <Text code>{text}</Text>,
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
    },
    {
      title: '参数',
      dataIndex: 'args',
      key: 'args',
      ellipsis: true,
    },
  ]

  return (
    <div className="debug-panel">
      <div className="panel-header">
        <Text strong>事件历史</Text>
        <Space>
          <Button icon={<ReloadOutlined />} size="small" onClick={refreshEvents}>
            刷新
          </Button>
          <Button icon={<ClearOutlined />} size="small" onClick={() => eventEngine.clearHistory()}>
            清空
          </Button>
        </Space>
      </div>
      <Table
        columns={columns}
        dataSource={events}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ y: 400 }}
      />
    </div>
  )
}

// 权限面板
const PermissionPanel = () => {
  const [roles, setRoles] = useState([])

  useEffect(() => {
    const roleList = []
    permissionManager.roles?.forEach((role, key) => {
      roleList.push({ key, ...role })
    })
    // 使用 setTimeout 避免在 effect 中同步调用 setState
    const timer = setTimeout(() => {
      setRoles(roleList)
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  const columns = [
    {
      title: '角色 ID',
      dataIndex: 'key',
      key: 'key',
    },
    {
      title: '角色名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '权限',
      dataIndex: 'permissions',
      key: 'permissions',
      render: (perms) => perms?.map((p, i) => <Tag key={i}>{p}</Tag>) || '-',
    },
  ]

  return (
    <div className="debug-panel">
      <div className="panel-header">
        <Text strong>角色列表</Text>
      </div>
      <Table columns={columns} dataSource={roles} rowKey="key" size="small" pagination={false} />
    </div>
  )
}

// 模型面板
const ModelPanel = () => {
  const [models, setModels] = useState(() => schemaManager.getAll() || [])

  const refreshModels = useCallback(() => {
    setModels(schemaManager.getAll() || [])
  }, [])

  return (
    <div className="debug-panel">
      <div className="panel-header">
        <Text strong>数据模型</Text>
        <Button icon={<ReloadOutlined />} size="small" onClick={refreshModels}>
          刷新
        </Button>
      </div>
      {models.map((model) => (
        <Card key={model.id} size="small" className="model-card">
          <div className="model-header">
            <Text strong>{model.name}</Text>
            <Tag>{model.fields?.length || 0} 个字段</Tag>
          </div>
          <Paragraph className="model-desc" ellipsis={{ rows: 2 }}>
            {model.description || '无描述'}
          </Paragraph>
        </Card>
      ))}
    </div>
  )
}

// 主调试面板组件
const DebugPanel = ({ visible, onClose }) => {
  const [activeTab, setActiveTab] = useState('status')

  const tabs = [
    {
      key: 'status',
      label: '状态',
      icon: <DashboardOutlined />,
      children: <StatusPanel />,
    },
    {
      key: 'plugins',
      label: '插件',
      icon: <PluginOutlined />,
      children: <PluginPanel />,
    },
    {
      key: 'events',
      label: '事件',
      icon: <EventOutlined />,
      children: <EventPanel />,
    },
    {
      key: 'permissions',
      label: '权限',
      icon: <LockOutlined />,
      children: <PermissionPanel />,
    },
    {
      key: 'models',
      label: '模型',
      icon: <DatabaseOutlined />,
      children: <ModelPanel />,
    },
  ]

  return (
    <Drawer
      title="开发者工具"
      placement="right"
      size={600}
      open={visible}
      onClose={onClose}
      className="debug-drawer"
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabs} size="small" />
    </Drawer>
  )
}

export default DebugPanel
