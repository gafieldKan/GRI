/**
 * 权限管理组件
 * 支持角色管理、用户组管理、数据权限配置等功能
 */

import React, { useState, useEffect } from 'react'
import {
  Card, Table, Tag, Space, Button, Modal, Form, Input, Select,
  Tree, Checkbox, Switch, Tabs, Row, Col, List, Typography, message,
  Popconfirm, Divider
} from 'antd'
import {
  SafetyOutlined,
  TeamOutlined,
  UserOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SettingOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { permissionManager, PermissionLevel, DataScope, Role } from '../../core/PermissionManager.js'

const { TabPane } = Tabs
const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select

// 操作类型标签
const operationLabels = {
  read: { text: '读取', color: 'blue' },
  write: { text: '写入', color: 'green' },
  create: { text: '创建', color: 'purple' },
  delete: { text: '删除', color: 'red' },
  update: { text: '更新', color: 'orange' },
  submit: { text: '提交', color: 'cyan' },
  approve: { text: '审批', color: 'gold' },
  export: { text: '导出', color: 'lime' },
  import: { text: '导入', color: 'magenta' },
  full: { text: '完全', color: 'red' },
}

// 数据范围标签
const dataScopeLabels = {
  all: '全部数据',
  mine: '仅本人数据',
  dept: '本部门数据',
  dept_and_sub: '本部门及子部门数据',
  custom: '自定义范围',
}

// 预设模型列表
const presetModels = [
  { key: 'user', name: '用户' },
  { key: 'role', name: '角色' },
  { key: 'dept', name: '部门' },
  { key: 'menu', name: '菜单' },
  { key: 'dict', name: '字典' },
  { key: 'config', name: '配置' },
]

function PermissionManager() {
  const [activeTab, setActiveTab] = useState('roles')
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(false)
  const [roleModalVisible, setRoleModalVisible] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadRoles()
  }, [])

  const loadRoles = () => {
    setLoading(true)
    setTimeout(() => {
      const allRoles = permissionManager.getAllRoles ? permissionManager.getAllRoles() : []
      setRoles(allRoles.length > 0 ? allRoles : [
        { id: 'admin', name: '管理员', description: '系统管理员，拥有所有权限', permissions: ['*'], dataScope: 'all' },
        { id: 'editor', name: '编辑者', description: '内容编辑人员', permissions: ['model:*:read', 'model:*:write'], dataScope: 'dept' },
        { id: 'user', name: '普通用户', description: '系统普通用户', permissions: ['model:*:read'], dataScope: 'mine' },
        { id: 'guest', name: '访客', description: '未登录用户', permissions: [], dataScope: 'mine' },
      ])
      setLoading(false)
    }, 300)
  }

  const handleSaveRole = (values) => {
    try {
      if (editingRole) {
        // 更新角色
        message.success('角色更新成功')
      } else {
        // 新建角色
        message.success('角色创建成功')
      }
      setRoleModalVisible(false)
      setEditingRole(null)
      form.resetFields()
      loadRoles()
    } catch (error) {
      message.error(`保存失败：${error.message}`)
    }
  }

  const handleEditRole = (role) => {
    setEditingRole(role)
    setRoleModalVisible(true)
    form.setFieldsValue({
      name: role.name,
      description: role.description,
      dataScope: role.dataScope || 'mine',
    })
  }

  const handleDeleteRole = (roleId) => {
    if (['admin', 'user', 'guest'].includes(roleId)) {
      message.error('系统内置角色无法删除')
      return
    }
    message.success('角色删除成功')
    loadRoles()
  }

  const columns = [
    {
      title: '角色名称',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
          <SafetyOutlined style={{ color: '#1890ff' }} />
          <Text strong>{text}</Text>
          {['admin', 'system'].includes(record.id) && (
            <Tag color="red">内置</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '数据范围',
      dataIndex: 'dataScope',
      key: 'dataScope',
      width: 150,
      render: (scope) => (
        <Tag color="blue">{dataScopeLabels[scope] || scope}</Tag>
      ),
    },
    {
      title: '权限数量',
      key: 'permissions',
      width: 100,
      render: (_, record) => (
        <Text>{record.permissions?.length || 0} 个权限</Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditRole(record)}
          >
            编辑
          </Button>
          {!['admin', 'system'].includes(record.id) && (
            <Popconfirm
              title="确定删除此角色？"
              onConfirm={() => handleDeleteRole(record.id)}
            >
              <Button type="link" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane
          tab={
            <span>
              <SafetyOutlined /> 角色管理
            </span>
          }
          key="roles"
        >
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <Text type="secondary">管理系统角色，配置角色权限和数据范围</Text>
              </div>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingRole(null)
                  setRoleModalVisible(true)
                  form.resetFields()
                }}
              >
                新建角色
              </Button>
            </div>

            <Table
              columns={columns}
              dataSource={roles}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </TabPane>

        <TabPane
          tab={
            <span>
              <TeamOutlined /> 用户组管理
            </span>
          }
          key="groups"
        >
          <UserGroupTab />
        </TabPane>

        <TabPane
          tab={
            <span>
              <UserOutlined /> 用户权限
            </span>
          }
          key="user-permission"
        >
          <UserPermissionTab />
        </TabPane>

        <TabPane
          tab={
            <span>
              <SettingOutlined /> 权限配置
            </span>
          }
          key="settings"
        >
          <PermissionSettingsTab />
        </TabPane>
      </Tabs>

      {/* 角色编辑对话框 */}
      <Modal
        title={editingRole ? '编辑角色' : '新建角色'}
        open={roleModalVisible}
        onCancel={() => {
          setRoleModalVisible(false)
          setEditingRole(null)
          form.resetFields()
        }}
        footer={null}
        size={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveRole}
          initialValues={{
            dataScope: 'mine',
            permissions: [],
          }}
        >
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="例如：部门管理员" />
          </Form.Item>

          <Form.Item
            name="description"
            label="角色描述"
            rules={[{ required: true, message: '请输入角色描述' }]}
          >
            <TextArea rows={3} placeholder="描述此角色的职责和用途" />
          </Form.Item>

          <Form.Item
            name="dataScope"
            label="数据权限范围"
            rules={[{ required: true, message: '请选择数据权限范围' }]}
          >
            <Select>
              {Object.entries(dataScopeLabels).map(([key, label]) => (
                <Option key={key} value={key}>
                  {label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
              <Button
                onClick={() => {
                  setRoleModalVisible(false)
                  setEditingRole(null)
                  form.resetFields()
                }}
              >
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// 用户组管理标签页
function UserGroupTab() {
  const [groups, setGroups] = useState([
    { id: '1', name: '管理层', description: '公司管理层', userCount: 5 },
    { id: '2', name: '技术部', description: '技术研发团队', userCount: 28 },
    { id: '3', name: '销售部', description: '销售业务团队', userCount: 15 },
  ])

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Text type="secondary">用户组分用于批量管理用户权限</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />}>
          新建用户组
        </Button>
      </div>

      <Table
        columns={[
          { title: '用户组名称', dataIndex: 'name', key: 'name' },
          { title: '描述', dataIndex: 'description', key: 'description' },
          {
            title: '用户数',
            dataIndex: 'userCount',
            key: 'userCount',
            render: (count) => <Tag color="blue">{count} 人</Tag>,
          },
          {
            title: '操作',
            key: 'action',
            render: () => (
              <Space>
                <Button type="link">查看</Button>
                <Button type="link">编辑</Button>
              </Space>
            ),
          },
        ]}
        dataSource={groups}
        rowKey="id"
        pagination={false}
      />
    </Card>
  )
}

// 用户权限标签页
function UserPermissionTab() {
  const [users] = useState([
    { id: '1', name: '张三', email: 'zhangsan@example.com', role: 'admin' },
    { id: '2', name: '李四', email: 'lisi@example.com', role: 'editor' },
    { id: '3', name: '王五', email: 'wangwu@example.com', role: 'user' },
  ])

  return (
    <Card>
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">为用户分配角色和权限</Text>
      </div>

      <Table
        columns={[
          { title: '用户名', dataIndex: 'name', key: 'name' },
          { title: '邮箱', dataIndex: 'email', key: 'email' },
          {
            title: '当前角色',
            dataIndex: 'role',
            key: 'role',
            render: (role) => <Tag color="blue">{role}</Tag>,
          },
          {
            title: '操作',
            key: 'action',
            render: (_, record) => (
              <Space>
                <Button type="link" icon={<EditOutlined />}>
                  分配角色
                </Button>
                <Button type="link">查看权限</Button>
              </Space>
            ),
          },
        ]}
        dataSource={users}
        rowKey="id"
        pagination={false}
      />
    </Card>
  )
}

// 权限配置标签页
function PermissionSettingsTab() {
  const [selectedModel, setSelectedModel] = useState(null)
  const [permissionConfig, setPermissionConfig] = useState({
    read: true,
    write: false,
    create: false,
    delete: false,
    export: false,
    import: false,
  })

  const handlePermissionChange = (operation, checked) => {
    setPermissionConfig(prev => ({
      ...prev,
      [operation]: checked,
    }))
  }

  return (
    <Row gutter={16}>
      <Col span={8}>
        <Card title="数据模型" size="small">
          <List
            dataSource={presetModels}
            renderItem={(item) => (
              <List.Item
                style={{
                  cursor: 'pointer',
                  backgroundColor: selectedModel === item.key ? '#e6f7ff' : 'transparent',
                  padding: '8px 12px',
                  borderRadius: 4,
                }}
                onClick={() => setSelectedModel(item.key)}
              >
                <List.Item.Meta title={item.name} description={item.key} />
              </List.Item>
            )}
          />
        </Card>
      </Col>

      <Col span={16}>
        <Card title="操作权限配置" size="small">
          {selectedModel ? (
            <>
              <Text>当前模型：<Tag color="blue">{selectedModel}</Tag></Text>
              <Divider />
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {Object.entries(operationLabels).map(([key, { text, color }]) => (
                  <div key={key}>
                    <Text>{text}</Text>
                    <Switch
                      checked={permissionConfig[key]}
                      onChange={(checked) => handlePermissionChange(key, checked)}
                      checkedChildren="允许"
                      unCheckedChildren="禁止"
                    />
                  </div>
                ))}
              </Space>
              <Divider />
              <Button type="primary" onClick={() => message.success('权限配置已保存')}>
                保存配置
              </Button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <SafetyOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
              <p style={{ marginTop: 16, color: '#999' }}>请选择要配置的数据模型</p>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  )
}

export default PermissionManager
