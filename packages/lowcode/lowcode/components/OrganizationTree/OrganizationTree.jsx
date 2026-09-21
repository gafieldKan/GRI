/**
 * OrganizationTree - 组织树组件
 * 展示和编辑组织架构树
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Tree, Button, Input, Modal, Form, Select, Space, message, InputNumber } from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderOutlined,
  HomeOutlined,
  TeamOutlined,
  ShopOutlined,
} from '@ant-design/icons'

const { DirectoryTree } = Tree
const { Option } = Select
const { TextArea } = Input

// 组织类型图标映射
const ORG_TYPE_ICONS = {
  company: <HomeOutlined />,
  branch: <FolderOutlined />,
  department: <TeamOutlined />,
  team: <TeamOutlined />,
  store: <ShopOutlined />,
}

// 组织类型标签
const ORG_TYPE_LABELS = {
  company: '公司',
  branch: '分公司',
  department: '部门',
  team: '团队',
  store: '门店',
}

/**
 * 递归获取所有子节点 ID
 */
const getAllChildIds = (nodes, parentId) => {
  const childIds = []
  nodes.forEach(node => {
    if (node.parentId === parentId) {
      childIds.push(node.id)
      childIds.push(...getAllChildIds(nodes, node.id))
    }
  })
  return childIds
}

/**
 * 组织树组件
 */
export const OrganizationTree = ({
  value,
  onChange,
  onSelect,
  editable = false,
  selectable = true,
  multiple = false,
  rootId,
  className,
  style,
}) => {
  const [treeData, setTreeData] = useState([])
  const [flatData, setFlatData] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState([])
  const [expandedKeys, setExpandedKeys] = useState([])
  const [modalVisible, setModalVisible] = useState(false)
  const [editingOrg, setEditingOrg] = useState(null)
  const [form] = Form.useForm()
  const [parentOrgId, setParentOrgId] = useState(null)

  // 加载组织树
  const loadTree = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/organizations/tree${rootId ? `?rootId=${rootId}` : ''}`)
      const result = await response.json()
      if (result.data) {
        setTreeData(transformToTreeData(result.data))
        setFlatData(result.data)
      }
    } catch (error) {
      message.error('加载组织树失败：' + error.message)
    } finally {
      setLoading(false)
    }
  }, [rootId])

  useEffect(() => {
    loadTree()
  }, [loadTree])

  // 将扁平数据转换为树形结构
  const transformToTreeData = (data) => {
    const map = new Map()
    const root = []

    data.forEach((item) => {
      map.set(item.id, { ...item, children: [] })
    })

    data.forEach((item) => {
      const node = map.get(item.id)
      if (item.parentId) {
        const parent = map.get(item.parentId)
        if (parent) {
          parent.children.push(node)
        }
      } else {
        root.push(node)
      }
    })

    return root
  }

  // 处理节点选择
  const handleSelect = (keys) => {
    setSelectedKeys(keys)
    if (onSelect && keys.length > 0) {
      // 找到选中的组织并传递
      const findOrg = (nodes) => {
        for (const node of nodes) {
          if (node.id === keys[0]) return node
          if (node.children) {
            const found = findOrg(node.children)
            if (found) return found
          }
        }
        return null
      }
      const org = findOrg(treeData)
      if (org) onSelect(org)
    }
  }

  // 处理节点展开
  const handleExpand = (keys) => {
    setExpandedKeys(keys)
  }

  // 打开创建/编辑弹窗
  const handleEdit = (record) => {
    setEditingOrg(record)
    form.resetFields()
    if (record?.id) {
      form.setFieldsValue({
        ...record,
        shortName: record.shortName,
      })
      setParentOrgId(record.parentId || null)
    } else {
      setParentOrgId(null)
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

      // 如果是创建且选择了父组织，添加 parentId
      const saveData = {
        ...values,
        parentId: parentOrgId || null,
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveData),
      })

      const result = await response.json()
      if (response.ok) {
        message.success(editingOrg?.id ? '更新成功' : '创建成功')
        setModalVisible(false)
        loadTree()
        onChange?.(result.data)
      } else {
        message.error(result.error || '操作失败')
      }
    } catch (error) {
      console.error('保存失败:', error)
      message.error('保存失败：' + error.message)
    }
  }

  // 处理删除
  const handleDelete = async () => {
    if (!editingOrg?.id) return

    Modal.confirm({
      title: '确认删除',
      content: `确定要删除组织 "${editingOrg.name}" 吗？此操作不可恢复。`,
      onOk: async () => {
        try {
          const response = await fetch(`/api/organizations/${editingOrg.id}`, {
            method: 'DELETE',
          })
          if (response.ok) {
            message.success('删除成功')
            setModalVisible(false)
            loadTree()
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

  // 渲染树节点标题
  const renderTitle = (node) => {
    return (
      <Space>
        {ORG_TYPE_ICONS[node.type] || <HomeOutlined />}
        <span>{node.name}</span>
        {node.code && <span style={{ color: '#999' }}>({node.code})</span>}
      </Space>
    )
  }

  // 将数据转换为 Tree 组件所需格式
  const makeTreeNodes = (nodes) => {
    return nodes.map((node) => ({
      title: renderTitle(node),
      key: node.id,
      id: node.id,
      ...node,
      icon: ORG_TYPE_ICONS[node.type] || <HomeOutlined />,
      children: node.children ? makeTreeNodes(node.children) : [],
    }))
  }

  const treeNodes = makeTreeNodes(treeData)

  // 获取可选的父组织列表（排除当前节点及其子节点）
  const getParentOptions = () => {
    const currentId = editingOrg?.id
    if (!currentId) return flatData

    // 获取当前组织及其所有后代
    const excludeIds = new Set([currentId])
    const getAllDescendants = (id) => {
      flatData
        .filter(item => item.parentId === id)
        .forEach(child => {
          excludeIds.add(child.id)
          getAllDescendants(child.id)
        })
    }
    getAllDescendants(currentId)

    return flatData.filter(item => !excludeIds.has(item.id))
  }

  return (
    <div className={className} style={style}>
      <Space style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>组织架构</h3>
        {editable && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleEdit({})}
          >
            新建组织
          </Button>
        )}
        <Button onClick={loadTree}>刷新</Button>
      </Space>

      <DirectoryTree
        selectable={selectable}
        multiple={multiple}
        selectedKeys={selectedKeys}
        expandedKeys={expandedKeys}
        onSelect={handleSelect}
        onExpand={handleExpand}
        treeData={treeNodes}
        loading={loading}
        style={{ background: '#fff', padding: 16 }}
      />

      {/* 创建/编辑组织弹窗 */}
      <Modal
        title={editingOrg?.id ? '编辑组织' : '新建组织'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
        size={600}
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
            name="shortName"
            label="组织简称"
          >
            <Input placeholder="请输入组织简称" />
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
              <Option value="company">公司</Option>
              <Option value="branch">分公司</Option>
              <Option value="department">部门</Option>
              <Option value="team">团队</Option>
              <Option value="store">门店</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="parentId"
            label="父级组织"
          >
            <Select
              allowClear
              placeholder="选择父级组织（留空表示顶级组织）"
              value={parentOrgId}
              onChange={setParentOrgId}
            >
              {getParentOptions().map((org) => (
                <Option key={org.id} value={org.id} disabled={org.id === editingOrg?.id}>
                  {org.name} ({org.code})
                </Option>
              ))}
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

export default OrganizationTree
