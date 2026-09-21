/**
 * MemberList - 组织成员列表组件
 * 展示和管理组织成员
 */

import React, { useState, useEffect } from 'react'
import { Table, Button, Avatar, Tag, Space, Modal, Form, Select, message, Popconfirm, Input } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, UsergroupAddOutlined } from '@ant-design/icons'

const { Option } = Select
const { Search } = Input

// 成员角色标签
const ROLE_LABELS = {
  owner: { text: '所有者', color: 'red' },
  legal: { text: '法人代表', color: 'red' },
  manager: { text: '管理员', color: 'orange' },
  supervisor: { text: '主管', color: 'blue' },
  member: { text: '成员', color: 'green' },
  employee: { text: '员工', color: 'default' },
  partner: { text: '合作伙伴', color: 'purple' },
  supplier: { text: '供应商', color: 'cyan' },
}

// 成员状态标签
const STATUS_LABELS = {
  active: { text: '活跃', color: 'green' },
  inactive: { text: '非活跃', color: 'default' },
  suspended: { text: '已暂停', color: 'orange' },
  resigned: { text: '已离职', color: 'red' },
  pending: { text: '待审核', color: 'yellow' },
}

/**
 * 用户搜索组件
 */
const UserSelector = ({ value, onChange, organizationId }) => {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')

  const searchUsers = async (keyword) => {
    setLoading(true)
    try {
      // TODO: 实现用户搜索 API
      // const response = await fetch(`/api/users/search?q=${keyword}`)
      // 模拟数据
      setUsers([
        { id: 'user-1', username: '张三', email: 'zhangsan@example.com' },
        { id: 'user-2', username: '李四', email: 'lisi@example.com' },
        { id: 'user-3', username: '王五', email: 'wangwu@example.com' },
      ])
    } catch (error) {
      message.error('搜索用户失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText) {
        searchUsers(searchText)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText])

  return (
    <Select
      value={value}
      onChange={onChange}
      showSearch
      onSearch={setSearchText}
      placeholder="搜索用户"
      filterOption={false}
      loading={loading}
      style={{ width: '100%' }}
    >
      {users.map((user) => (
        <Option key={user.id} value={user.id}>
          <Space>
            <Avatar>{user.username?.[0]?.toUpperCase()}</Avatar>
            <span>{user.username}</span>
            <span style={{ color: '#999' }}>({user.email})</span>
          </Space>
        </Option>
      ))}
    </Select>
  )
}

/**
 * 成员列表组件
 */
export const MemberList = ({ organizationId, editable = false, onMemberChange }) => {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [actionType, setActionType] = useState('add') // 'add' | 'edit'
  const [form] = Form.useForm()
  const [userId, setUserId] = useState(null)

  // 加载成员列表
  const loadMembers = async () => {
    if (!organizationId) return

    setLoading(true)
    try {
      const response = await fetch(`/api/organizations/${organizationId}/members`)
      const result = await response.json()
      if (result.data) {
        setMembers(result.data)
      }
    } catch (error) {
      message.error('加载成员列表失败：' + error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
  }, [organizationId])

  // 打开添加成员弹窗
  const handleAdd = () => {
    setActionType('add')
    form.resetFields()
    setUserId(null)
    setModalVisible(true)
  }

  // 打开编辑角色弹窗
  const handleEdit = (record) => {
    setActionType('edit')
    setSelectedMember(record)
    form.setFieldsValue({ role: record.role })
    setModalVisible(true)
  }

  // 处理保存
  const handleSave = async () => {
    try {
      const values = await form.validateFields()

      if (actionType === 'add') {
        if (!userId) {
          message.error('请选择用户')
          return
        }
        // 添加成员
        const response = await fetch(
          `/api/organizations/${organizationId}/members`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, ...values }),
          }
        )
        const result = await response.json()
        if (response.ok) {
          message.success('添加成功')
          loadMembers()
          onMemberChange?.(result.data)
        } else {
          message.error(result.error || '添加失败')
        }
      } else {
        // 更新角色
        const response = await fetch(
          `/api/organizations/${organizationId}/members/${selectedMember.id}/role`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
          }
        )
        const result = await response.json()
        if (response.ok) {
          message.success('更新成功')
          loadMembers()
          onMemberChange?.(result.data)
        } else {
          message.error(result.error || '更新失败')
        }
      }

      setModalVisible(false)
    } catch (error) {
      console.error('保存失败:', error)
    }
  }

  // 移除成员
  const handleRemove = async (record) => {
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/members/${record.userId}`,
        {
          method: 'DELETE',
        }
      )

      if (response.ok) {
        message.success('移除成功')
        loadMembers()
        onMemberChange?.()
      } else {
        const result = await response.json()
        message.error(result.error || '移除失败')
      }
    } catch (error) {
      message.error('移除失败：' + error.message)
    }
  }

  // 表格列定义
  const columns = [
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      render: (_, record) => (
        <Space>
          <Avatar src={record.avatar_url}>{record.username?.[0]?.toUpperCase()}</Avatar>
          <div>
            <div>{record.username}</div>
            {record.email && <div style={{ fontSize: 12, color: '#999' }}>{record.email}</div>}
          </div>
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role) => {
        const roleInfo = ROLE_LABELS[role] || { text: role, color: 'default' }
        return <Tag color={roleInfo.color}>{roleInfo.text}</Tag>
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const statusInfo = STATUS_LABELS[status] || { text: status, color: 'default' }
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
      },
    },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
    },
    {
      title: '职位',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '加入时间',
      dataIndex: 'joinedAt',
      key: 'joinedAt',
      render: (date) => date ? new Date(date).toLocaleDateString() : '-',
    },
  ]

  // 操作列
  if (editable) {
    columns.push({
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要移除该成员吗？"
            onConfirm={() => handleRemove(record)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
            >
              移除
            </Button>
          </Popconfirm>
        </Space>
      ),
    })
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>组织成员</h3>
        {editable && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
          >
            添加成员
          </Button>
        )}
        <Button onClick={loadMembers}>刷新</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={members}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 800 }}
      />

      {/* 添加/编辑成员弹窗 */}
      <Modal
        title={actionType === 'add' ? '添加成员' : '编辑角色'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          {actionType === 'add' ? (
            <>
              <Form.Item
                label="选择用户"
                rules={[{ required: true, message: '请选择用户' }]}
              >
                <UserSelector
                  value={userId}
                  onChange={setUserId}
                  organizationId={organizationId}
                />
              </Form.Item>
            </>
          ) : null}

          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select>
              <Option value="owner">所有者</Option>
              <Option value="manager">管理员</Option>
              <Option value="supervisor">主管</Option>
              <Option value="member">成员</Option>
              <Option value="employee">员工</Option>
            </Select>
          </Form.Item>

          {actionType === 'add' && (
            <>
              <Form.Item name="department" label="部门">
                <Input placeholder="请输入部门" />
              </Form.Item>
              <Form.Item name="title" label="职位">
                <Input placeholder="请输入职位" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  )
}

export default MemberList
