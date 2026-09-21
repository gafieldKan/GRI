import React, { useState, useEffect } from 'react'
import { TreeSelect, Spin, message } from 'antd'
import {
  HomeOutlined,
  BuildOutlined,
  TeamOutlined,
  ShopOutlined,
  FieldOutlined,
} from '@ant-design/icons'

/**
 * 组织树图标映射
 */
const getIconByType = (type) => {
  const iconMap = {
    company: <HomeOutlined />,
    branch: <BuildOutlined />,
    department: <TeamOutlined />,
    store: <ShopOutlined />,
    farm: <FieldOutlined />,
  }
  return iconMap[type] || <HomeOutlined />
}

/**
 * 组织选择器组件
 * 支持层级化组织架构选择
 *
 * @param {Object} props
 * @param {Function} props.onChange - 选择变化回调
 * @param {String} props.value - 选中值
 * @param {Boolean} props.multiple - 是否多选
 * @param {String} props.placeholder - 占位文本
 * @param {Boolean} props.showSearch - 是否显示搜索
 * @param {Array} props.organizationData - 组织数据 (外部传入)
 * @param {String} props.apiEndpoint - 组织数据 API 地址
 */
const OrganizationSelector = ({
  onChange,
  value,
  multiple = false,
  placeholder = '请选择组织',
  showSearch = true,
  organizationData,
  apiEndpoint = '/api/organizations',
}) => {
  const [treeData, setTreeData] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (organizationData) {
      setTreeData(transformData(organizationData))
    } else {
      loadOrganizations()
    }
  }, [])

  // 加载组织数据
  const loadOrganizations = async () => {
    setLoading(true)
    try {
      const res = await fetch(apiEndpoint)
      if (!res.ok) throw new Error('加载失败')
      const data = await res.json()
      setTreeData(transformData(data.data || data))
    } catch (error) {
      message.error('组织数据加载失败：' + error.message)
      // 使用模拟数据
      setTreeData(getMockData())
    } finally {
      setLoading(false)
    }
  }

  // 转换数据格式为 TreeSelect 所需格式
  const transformData = (data) => {
    if (!data) return []

    const buildTree = (items, parentId = null) => {
      return items
        .filter((item) => item.parentId === parentId)
        .map((item) => ({
          value: item.id,
          title: (
            <span>
              {getIconByType(item.type)} {item.name}
              {item.shortName ? `(${item.shortName})` : ''}
            </span>
          ),
          icon: getIconByType(item.type),
          children: buildTree(items, item.id),
          isLeaf: !item.children?.length && !hasChildren(items, item.id),
        }))
    }

    return buildTree(data)
  }

  // 判断是否有子节点
  const hasChildren = (items, parentId) => {
    return items.some((item) => item.parentId === parentId)
  }

  // 获取模拟数据
  const getMockData = () => [
    {
      id: 'org_root',
      name: '餐饮集团',
      shortName: '集团',
      type: 'company',
      parentId: null,
      children: [
        {
          id: 'org_operation',
          name: '运营中心',
          type: 'department',
          parentId: 'org_root',
        },
        {
          id: 'org_bj_branch',
          name: '北京分公司',
          type: 'branch',
          parentId: 'org_root',
          children: [
            {
              id: 'org_cyd_store',
              name: '朝阳路店',
              type: 'store',
              parentId: 'org_bj_branch',
            },
            {
              id: 'org_slt_store',
              name: '三里屯店',
              type: 'store',
              parentId: 'org_bj_branch',
            },
          ],
        },
        {
          id: 'org_sh_branch',
          name: '上海分公司',
          type: 'branch',
          parentId: 'org_root',
        },
        {
          id: 'org_farm_001',
          name: '阳光农场',
          type: 'farm',
          parentId: 'org_root',
        },
      ],
    },
  ]

  const handleChange = (selectedValue) => {
    onChange?.(selectedValue)
  }

  return (
    <Spin spinning={loading}>
      <TreeSelect
        style={{ width: '100%' }}
        value={value}
        onChange={handleChange}
        treeData={treeData}
        placeholder={placeholder}
        multiple={multiple}
        showSearch={showSearch}
        treeDefaultExpandAll
        dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
        allowClear
        treeIcon
      />
    </Spin>
  )
}

export default OrganizationSelector
