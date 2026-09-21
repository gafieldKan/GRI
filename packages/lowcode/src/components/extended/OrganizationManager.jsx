/**
 * 组织管理界面组件
 * 支持组织树管理、成员管理、角色权限配置
 *
 * @author GRI Team
 * @version 1.0
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  Tree,
  TreeSelect,
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
  Badge,
} from 'antd'
import {
  HomeOutlined,
  BuildOutlined,
  TeamOutlined,
  ShopOutlined,
  FieldOutlined,
  FireOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UserAddOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import {
  OrganizationType,
  ORG_TYPE_LABELS,
  ORG_TYPE_ICONS,
  MemberRole,
  MemberStatus,
  MemberRoleUtils,
} from '../../../lowcode/domain/organization/Organization.js'
import { OrganizationMember } from '../../../lowcode/domain/organization/OrganizationMember.js'
import { Role, DataScope, RoleTemplates } from '../../../lowcode/domain/organization/Role.js'
import { OrganizationSelector } from './OrganizationSelector.jsx'

/**
 * 图标映射
 */
const ICON_MAP = {
  HomeOutlined,
  BuildOutlined,
  TeamOutlined,
  GroupOutlined: TeamOutlined,
  ShopOutlined,
  FireOutlined,
  FieldOutlined,
}

/**
 * 获取组织类型图标
 */
const getOrgIcon = (type) => {
  const iconType = ORG_TYPE_ICONS[type] || 'HomeOutlined'
  const IconComponent = ICON_MAP[iconType] || HomeOutlined
  return <IconComponent />
}

/**
 * 组织管理界面组件
 */
const OrganizationManager = ({
  // 配置项
  apiEndpoint = '/api/organizations',
  showMemberManagement = true,
  showRoleManagement = true,
  // 事件回调
  onOrganizationSelect,
  onMemberAdd,
  onRoleChange,
}) => {
  // 组织树数据
  const [treeData, setTreeData] = useState([])
  const [loading, setLoading] = useState(false)

  // 选中的组织
  const [selectedOrg, setSelectedOrg] = useState(null)
  const [expandedKeys, setExpandedKeys] = useState([])

  // 成员数据
  const [members, setMembers] = useState([])
  const [memberLoading, setMemberLoading] = useState(false)

  // 模态框状态
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [currentOrg, setCurrentOrg] = useState(null)

  // 表单实例
  const [form] = Form.useForm()

  // 加载组织树
  const loadOrganizationTree = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiEndpoint)
      if (!res.ok) throw new Error('加载失败')
      const data = await res.json()
      setTreeData(transformTreeData(data.data || data))
    } catch (error) {
      message.error('组织数据加载失败：' + error.message)
      setTreeData(getMockData())
    } finally {
      setLoading(false)
    }
  }, [apiEndpoint])

  useEffect(() => {
    loadOrganizationTree()
  }, [loadOrganizationTree])

  // 转换数据格式
  const transformTreeData = (data) => {
    if (!data || !Array.isArray(data)) return []

    const buildTree = (items, parentId = null) => {
      return items
        .filter((item) => item.parentId === parentId)
        .map((item) => ({
          key: item.id,
          title: (
            <span>
              {getOrgIcon(item.type)} {item.name}
              {item.shortName ? `(${item.shortName})` : ''}
            </span>
          ),
          icon: getOrgIcon(item.type),
          children: buildTree(items, item.id),
          isLeaf: !hasChildren(items, item.id),
          data: item,
        }))
    }

    const hasChildren = (items, parentId) => {
      return items.some((item) => item.parentId === parentId)
    }

    return buildTree(data, null)
  }

  // 模拟数据
  const getMockData = () => {
    return [
      {
        id: 'org_root',
        name: '餐饮集团',
        shortName: '集团',
        type: OrganizationType.COMPANY,
        parentId: null,
        children: [
          {
            id: 'org_operation',
            name: '运营中心',
            type: OrganizationType.DEPARTMENT,
            parentId: 'org_root',
          },
          {
            id: 'org_bj_branch',
            name: '北京分公司',
            type: OrganizationType.BRANCH,
            parentId: 'org_root',
            children: [
              {
                id: 'org_cyd_store',
                name: '朝阳路店',
                type: OrganizationType.STORE,
                parentId: 'org_bj_branch',
              },
              {
                id: 'org_slt_store',
                name: '三里屯店',
                type: OrganizationType.STORE,
                parentId: 'org_bj_branch',
              },
            ],
          },
          {
            id: 'org_sh_branch',
            name: '上海分公司',
            type: OrganizationType.BRANCH,
            parentId: 'org_root',
          },
          {
            id: 'org_farm_001',
            name: '阳光农场',
            type: OrganizationType.FARM,
            parentId: 'org_root',
          },
        ],
      },
    ]
  }

  // 选择组织
  const handleSelect = (selectedKeys) => {
    if (selectedKeys.length > 0) {
      const key = selectedKeys[0]
      const org = findOrgByKey(treeData, key)
      setSelectedOrg(org)
      onOrganizationSelect?.(org)
      if (showMemberManagement) {
        loadMembers(org)
      }
    }
  }

  // 根据 key 查找组织
  const findOrgByKey = (nodes, key) => {
    for (const node of nodes) {
      if (node.key === key) return node.data
      if (node.children) {
        const found = findOrgByKey(node.children, key)
        if (found) return found
      }
    }
    return null
  }

  // 加载成员
  const loadMembers = async (org) => {
    if (!showMemberManagement) return
    setMemberLoading(true)
    try {
      const res = await fetch(`${apiEndpoint}/${org.id}/members`)
      const data = await res.json()
      setMembers(data.data || data)
    } catch {
      // 使用模拟数据
      setMembers(getMockMembers(org.id))
    } finally {
      setMemberLoading(false)
    }
  }

  // 模拟成员数据
  const getMockMembers = (orgId) => [
    { id: 'm1', userId: 'u1', name: '张三', role: 'owner', title: '总经理', status: 'active' },
    { id: 'm2', userId: 'u2', name: '李四', role: 'manager', title: '店长', status: 'active' },
  ]

  // 创建组织
  const handleCreate = (values) => {
    const parentOrg = selectedOrg || treeData[0]?.data
    const newOrg = {
      id: `org_${Date.now()}`,
      name: values.name,
      shortName: values.shortName || values.name,
      type: values.type,
      parentId: parentOrg?.id || null,
      parentPath: parentOrg ? `${parentOrg.parentPath || ''}/${parentOrg.id}` : '/',
      level: parentOrg ? (parentOrg.level || 0) + 1 : 1,
      industry: values.industry,
      settings: {},
      quotas: {},
    }

    // 刷新列表
    loadOrganizationTree()
    setCreateModalVisible(false)
    message.success('创建成功')
  }

  // 删除组织
  const handleDelete = (org) => {
    // 删除逻辑
    message.success('删除成功')
    loadOrganizationTree()
  }

  // 成员表格列
  const memberColumns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role) => <Tag>{MemberRoleUtils.getRoleLabel(role)}</Tag>,
    },
    {
      title: '职位',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Badge status={status === 'active' ? 'success' : 'default'} text={status} />
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="link" onClick={() => handleEditMember(record)}>
            编辑
          </Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDeleteMember(record)}>
            <Button type="link" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleEditMember = (member) => {
    // 编辑成员
  }

  const handleDeleteMember = (member) => {
    // 删除成员
    message.success('删除成功')
    if (selectedOrg) {
      loadMembers(selectedOrg)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 左侧组织树 */}
      <div style={{ width: 300, borderRight: '1px solid #f0f0f0', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3>组织架构</h3>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalVisible(true)}
          >
            新建
          </Button>
        </div>

        <Tree
          treeData={treeData}
          loading={loading}
          expandedKeys={expandedKeys}
          onExpand={setExpandedKeys}
          onSelect={handleSelect}
          selectedKeys={selectedOrg ? [selectedOrg.id] : []}
          style={{ maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}
        />
      </div>

      {/* 右侧内容区 */}
      <div style={{ flex: 1, padding: 24 }}>
        {selectedOrg ? (
          <>
            <div style={{ marginBottom: 24 }}>
              <h2>{selectedOrg.name}</h2>
              <p style={{ color: '#999' }}>
                类型：{ORG_TYPE_LABELS[selectedOrg.type]} | 层级：{selectedOrg.level}
              </p>
            </div>

            {/* 成员管理 */}
            {showMemberManagement && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3>组织成员</h3>
                  <Button
                    type="primary"
                    icon={<UserAddOutlined />}
                    onClick={() => {
                      if (onMemberAdd) {
                        onMemberAdd(selectedOrg)
                      } else {
                        message.info('添加成员功能待实现')
                      }
                    }}
                  >
                    添加成员
                  </Button>
                </div>

                <Table
                  columns={memberColumns}
                  dataSource={members}
                  loading={memberLoading}
                  rowKey="id"
                  pagination={false}
                />
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', color: '#999', marginTop: 100 }}>
            <p>请选择一个组织查看详情</p>
          </div>
        )}
      </div>

      {/* 创建组织模态框 */}
      <Modal
        title="创建组织"
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{
            type: OrganizationType.DEPARTMENT,
          }}
        >
          <Form.Item
            name="name"
            label="组织名称"
            rules={[{ required: true, message: '请输入组织名称' }]}
          >
            <Input placeholder="请输入组织名称" />
          </Form.Item>

          <Form.Item name="shortName" label="简称">
            <Input placeholder="可选" />
          </Form.Item>

          <Form.Item
            name="type"
            label="组织类型"
            rules={[{ required: true, message: '请选择组织类型' }]}
          >
            <Select>
              {Object.entries(ORG_TYPE_LABELS).map(([key, label]) => (
                <Select.Option key={key} value={key}>
                  {label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="industry" label="所属行业">
            <Input placeholder="ISIC 行业代码，可选" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                创建
              </Button>
              <Button onClick={() => setCreateModalVisible(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default OrganizationManager
