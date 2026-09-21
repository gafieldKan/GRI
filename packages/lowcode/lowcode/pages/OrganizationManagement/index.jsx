/**
 * OrganizationManagement - 组织管理页面
 * 提供组织架构的完整管理功能
 */

import React, { useState, useCallback } from 'react'
import { Card, Row, Col, Tree, Button, Space, Input, Modal, Form, Select, message, Divider } from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  HomeOutlined,
  TeamOutlined,
  FolderOutlined,
  SearchOutlined,
  ShopOutlined,
} from '@ant-design/icons'
import { OrganizationTree } from '../../components/OrganizationTree/OrganizationTree'
import { MemberList } from '../../components/OrganizationMemberList/MemberList'

const { DirectoryTree } = Tree
const { Option } = Select
const { TextArea } = Input

// 组织类型选项
const ORG_TYPE_OPTIONS = [
  { value: 'company', label: '公司' },
  { value: 'branch', label: '分公司' },
  { value: 'department', label: '部门' },
  { value: 'team', label: '团队' },
  { value: 'store', label: '门店' },
]

// 组织类型图标
const ORG_TYPE_ICONS = {
  company: <HomeOutlined />,
  branch: <FolderOutlined />,
  department: <TeamOutlined />,
  team: <TeamOutlined />,
  store: <ShopOutlined />,
}

/**
 * 组织管理页面组件
 */
export const OrganizationManagement = () => {
  const [selectedOrg, setSelectedOrg] = useState(null)
  const [treeData, setTreeData] = useState([])
  const [modalVisible, setModalVisible] = useState(false)
  const [editingOrg, setEditingOrg] = useState(null)
  const [form] = Form.useForm()
  const [refreshKey, setRefreshKey] = useState(0)

  // 处理组织选择
  const handleSelectOrg = (org) => {
    setSelectedOrg(org)
  }

  // 打开创建/编辑弹窗
  const handleEdit = (org = null) => {
    setEditingOrg(org)
    if (org) {
      form.setFieldsValue(org)
    } else {
      form.resetFields()
    }
    setModalVisible(true)
  }

  // 处理保存
  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      const url = editingOrg?.id
        ? `/api/organizations/${editingOrg.id}`
        : '/api/organizations'
      const method = editingOrg?.id ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      const result = await response.json()
      if (response.ok) {
        message.success(editingOrg?.id ? '更新成功' : '创建成功')
        setModalVisible(false)
        setRefreshKey(prev => prev + 1)
      } else {
        message.error(result.error || '操作失败')
      }
    } catch (error) {
      console.error('保存失败:', error)
    }
  }

  // 处理删除
  const handleDelete = async () => {
    if (!selectedOrg) return

    Modal.confirm({
      title: '确认删除',
      content: `确定要删除组织 "${selectedOrg.name}" 吗？此操作不可恢复。`,
      onOk: async () => {
        try {
          const response = await fetch(`/api/organizations/${selectedOrg.id}`, {
            method: 'DELETE',
          })

          if (response.ok) {
            message.success('删除成功')
            setSelectedOrg(null)
            setRefreshKey(prev => prev + 1)
          } else {
            const result = await response.json()
            message.error(result.error || '删除失败')
          }
        } catch (error) {
          message.error('删除失败')
        }
      },
    })
  }

  return (
    <div style={{ padding: 24 }}>
      <Card title="组织管理" style={{ height: '100%' }}>
        <Row gutter={16} style={{ height: 'calc(100vh - 200px)' }}>
          {/* 左侧：组织树 */}
          <Col span={12}>
            <Space style={{ marginBottom: 16 }}>
              <h2>组织架构</h2>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => handleEdit()}
              >
                新建组织
              </Button>
            </Space>

            <OrganizationTree
              key={refreshKey}
              onSelect={handleSelectOrg}
              editable
            />
          </Col>

          {/* 右侧：组织详情和成员列表 */}
          <Col span={12}>
            {selectedOrg ? (
              <>
                <Card
                  title={
                    <Space>
                      {ORG_TYPE_ICONS[selectedOrg.type] || <HomeOutlined />}
                      {selectedOrg.name}
                    </Space>
                  }
                  extra={
                    <Space>
                      <Button
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(selectedOrg)}
                      >
                        编辑
                      </Button>
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        onClick={handleDelete}
                      >
                        删除
                      </Button>
                    </Space>
                  }
                  style={{ marginBottom: 16 }}
                >
                  <div>
                    <p><strong>组织类型:</strong> {ORG_TYPE_OPTIONS.find(t => t.value === selectedOrg.type)?.label || selectedOrg.type}</p>
                    <p><strong>组织代码:</strong> {selectedOrg.code || '-'}</p>
                    <p><strong>描述:</strong> {selectedOrg.description || '-'}</p>
                  </div>
                </Card>

                <MemberList
                  key={selectedOrg.id}
                  organizationId={selectedOrg.id}
                  editable
                />
              </>
            ) : (
              <Card>
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <p style={{ color: '#999' }}>请选择一个组织查看详情</p>
                </div>
              </Card>
            )}
          </Col>
        </Row>
      </Card>

      {/* 创建/编辑组织弹窗 */}
      <Modal
        title={editingOrg?.id ? '编辑组织' : '新建组织'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="组织名称"
            rules={[{ required: true, message: '请输入组织名称' }]}
          >
            <Input placeholder="请输入组织名称" />
          </Form.Item>

          <Form.Item
            name="code"
            label="组织代码"
            rules={[{ required: true, message: '请输入组织代码' }]}
          >
            <Input placeholder="请输入组织代码" />
          </Form.Item>

          <Form.Item
            name="type"
            label="组织类型"
            rules={[{ required: true, message: '请选择组织类型' }]}
          >
            <Select>
              {ORG_TYPE_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="parentId" label="父级组织">
            <Select allowClear placeholder="选择父级组织">
              {/* TODO: 从树中获取父级选项 */}
            </Select>
          </Form.Item>

          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="请输入组织描述" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default OrganizationManagement
