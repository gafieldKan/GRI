/**
 * 权限管理界面组件
 * 基于 RBAC 模型，支持角色管理、权限分配、数据权限范围配置
 *
 * @author GRI Team
 * @version 1.0
 */

import React, { useState, useEffect } from 'react'
import {
  Table,
  Modal,
  Form,
  Input,
  Select,
  Button,
  Space,
  message,
  Popconfirm,
  Tag,
  Switch,
  Card,
  Row,
  Col,
  Badge,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SafetyOutlined,
  LockOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { DataScope, RoleTemplates } from '../../../lowcode/domain/organization/Role.js'

const { TextArea } = Input
const { Option } = Select

/**
 * 数据范围标签
 */
const DATA_SCOPE_LABELS = {
  [DataScope.SYSTEM]: '系统级（全部数据）',
  [DataScope.ORG]: '组织级（本组织及下级）',
  [DataScope.DEPT]: '部门级（本部门及下级）',
  [DataScope.SELF]: '仅本人',
}

/**
 * 角色类型标签
 */
const ROLE_TYPE_LABELS = {
  system: '系统角色',
  organization: '组织角色',
  functional: '功能角色',
}

/**
 * 权限管理组件
 */
const PermissionManager = ({ apiEndpoint = '/api/roles', onRoleChange, onPermissionChange }) => {
  // 角色列表
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(false)

  // 选中的角色
  const [selectedRole, setSelectedRole] = useState(null)
  const [currentRole, setCurrentRole] = useState(null)

  // 模态框状态
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)

  // 表单实例
  const [form] = Form.useForm()

  // 加载角色列表
  const loadRoles = async () => {
    setLoading(true)
    try {
      const res = await fetch(apiEndpoint)
      const data = await res.json()
      setRoles(data.data || data || getMockRoles())
    } catch (error) {
      message.error('加载角色失败：' + error.message)
      setRoles(getMockRoles())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRoles()
  }, [apiEndpoint])

  // 模拟角色数据
  const getMockRoles = () => {
    const templates = Object.values(RoleTemplates)
    return templates.map((t) => ({
      id: t.code.toLowerCase(),
      name: t.name,
      code: t.code,
      type: t.type,
      permissions: t.permissions || [],
      dataScope: t.dataScope,
      inheritable: t.inheritable,
    }))
  }

  // 创建角色
  const handleCreate = (values) => {
    const newRole = {
      id: `role_${Date.now()}`,
      name: values.name,
      code: values.code || `ROLE_${Date.now()}`,
      type: values.type,
      permissions: values.permissions || [],
      dataScope: values.dataScope,
      inheritable: values.inheritable,
    }

    setRoles([...roles, newRole])
    setCreateModalVisible(false)
    message.success('创建成功')
    onRoleChange?.(newRole)
  }

  // 更新角色
  const handleUpdate = (values) => {
    if (!currentRole) return

    const updatedRole = {
      ...currentRole,
      name: values.name,
      code: values.code,
      type: values.type,
      dataScope: values.dataScope,
      inheritable: values.inheritable,
    }

    setRoles(roles.map((r) => (r.id === currentRole.id ? updatedRole : r)))
    setEditModalVisible(false)
    message.success('更新成功')
    onRoleChange?.(updatedRole)
  }

  // 删除角色
  const handleDelete = (role) => {
    setRoles(roles.filter((r) => r.id !== role.id))
    message.success('删除成功')
  }

  // 添加权限
  const handleAddPermission = (permission) => {
    if (!currentRole) return

    const permStr =
      typeof permission === 'string'
        ? permission
        : `${permission.resource}:${permission.action}:${permission.dataScope}`

    const updatedRole = {
      ...currentRole,
      permissions: [...(currentRole.permissions || []), permStr],
    }

    setCurrentRole(updatedRole)
    form.setFieldsValue(updatedRole)
  }

  // 移除权限
  const handleRemovePermission = (permission) => {
    if (!currentRole) return

    const updatedRole = {
      ...currentRole,
      permissions: (currentRole.permissions || []).filter((p) => p !== permission),
    }

    setCurrentRole(updatedRole)
    form.setFieldsValue(updatedRole)
  }

  // 角色表格列
  const columns = [
    {
      title: '角色名称',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <Space>
          <SafetyOutlined style={{ color: '#1890ff' }} />
          {name}
        </Space>
      ),
    },
    {
      title: '角色代码',
      dataIndex: 'code',
      key: 'code',
      render: (code) => <Tag>{code}</Tag>,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type) => (
        <Tag color={type === 'system' ? 'red' : type === 'organization' ? 'blue' : 'green'}>
          {ROLE_TYPE_LABELS[type]}
        </Tag>
      ),
    },
    {
      title: '数据权限',
      dataIndex: 'dataScope',
      key: 'dataScope',
      render: (scope) => <Tag color="orange">{DATA_SCOPE_LABELS[scope] || scope}</Tag>,
    },
    {
      title: '可继承',
      dataIndex: 'inheritable',
      key: 'inheritable',
      render: (inheritable) =>
        inheritable ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <LockOutlined />,
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            onClick={() => {
              setCurrentRole(record)
              setEditModalVisible(true)
              form.setFieldsValue(record)
            }}
          >
            编辑
          </Button>
          {record.type !== 'system' && (
            <Popconfirm title="确认删除此角色？" onConfirm={() => handleDelete(record)}>
              <Button type="link" danger>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Card title="角色权限管理">
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setCurrentRole(null)
                form.resetFields()
                setCreateModalVisible(true)
              }}
            >
              新建角色
            </Button>
            <Button onClick={loadRoles}>刷新</Button>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={roles}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 20 }}
        />
      </Card>

      {/* 创建/编辑角色模态框 */}
      <Modal
        title={currentRole ? '编辑角色' : '新建角色'}
        open={createModalVisible || editModalVisible}
        onCancel={() => {
          setCreateModalVisible(false)
          setEditModalVisible(false)
          form.resetFields()
        }}
        footer={null}
        size={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={currentRole ? handleUpdate : handleCreate}
          initialValues={{
            type: 'organization',
            dataScope: DataScope.ORG,
            inheritable: true,
          }}
        >
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="例如：餐厅管理员" />
          </Form.Item>

          <Form.Item
            name="code"
            label="角色代码"
            rules={[{ required: true, message: '请输入角色代码' }]}
          >
            <Input placeholder="例如：RESTAURANT_ADMIN" />
          </Form.Item>

          <Form.Item
            name="type"
            label="角色类型"
            rules={[{ required: true, message: '请选择角色类型' }]}
          >
            <Select>
              <Option value="system">系统角色</Option>
              <Option value="organization">组织角色</Option>
              <Option value="functional">功能角色</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="dataScope"
            label="数据权限范围"
            rules={[{ required: true, message: '请选择数据权限范围' }]}
          >
            <Select>
              {Object.entries(DATA_SCOPE_LABELS).map(([key, label]) => (
                <Option key={key} value={key}>
                  {label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="inheritable" label="可继承" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
              <Button
                onClick={() => {
                  setCreateModalVisible(false)
                  setEditModalVisible(false)
                }}
              >
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 权限配置模态框 */}
      <Modal
        title="配置权限"
        open={!!selectedRole}
        onCancel={() => setSelectedRole(null)}
        footer={null}
        size={700}
      >
        {selectedRole && (
          <div>
            <h4>{selectedRole.name} - 权限配置</h4>

            <div style={{ marginTop: 16 }}>
              <h5>已拥有权限</h5>
              <Space wrap style={{ marginTop: 8 }}>
                {(selectedRole.permissions || []).map((perm, index) => (
                  <Tag
                    key={index}
                    color="blue"
                    closable
                    onClose={() => handleRemovePermission(perm)}
                  >
                    {perm}
                  </Tag>
                ))}
              </Space>
            </div>

            <div style={{ marginTop: 24 }}>
              <h5>添加权限</h5>
              <Form form={form} layout="vertical">
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item name="resource" label="资源">
                      <Select>
                        <Option value="restaurant">restaurant</Option>
                        <Option value="dish">dish</Option>
                        <Option value="order">order</Option>
                        <Option value="member">member</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="action" label="操作">
                      <Select>
                        <Option value="create">create</Option>
                        <Option value="read">read</Option>
                        <Option value="update">update</Option>
                        <Option value="delete">delete</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="scope" label="数据范围">
                      <Select>
                        {Object.entries(DATA_SCOPE_LABELS).map(([key, label]) => (
                          <Option key={key} value={key}>
                            {label}
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
                <Button
                  type="primary"
                  onClick={() => {
                    form.validateFields().then((values) => {
                      const permStr = `${values.resource}:${values.action}:${values.scope}`
                      handleAddPermission(permStr)
                    })
                  }}
                >
                  添加
                </Button>
              </Form>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default PermissionManager
