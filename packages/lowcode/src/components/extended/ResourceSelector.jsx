import React, { useState, useEffect } from 'react'
import { Select, Space, Avatar, Tag, Row, Col, Card } from 'antd'
import { ShopOutlined, HomeOutlined, ToolOutlined, FieldOutlined } from '@ant-design/icons'

const { Option } = Select

/**
 * 资源选择器组件
 * 支持餐厅、厨房、设备、场地等资源选择
 *
 * @param {Object} props
 * @param {Function} props.onChange - 选择变化回调
 * @param {String} props.value - 选中值
 * @param {String} props.resourceType - 资源类型：restaurant|kitchen|equipment|场地
 * @param {String} props.placeholder - 占位文本
 * @param {Boolean} props.showImage - 是否显示图片
 * @param {Array} props.data - 资源数据
 * @param {String} props.apiEndpoint - API 地址
 */
const ResourceSelector = ({
  onChange,
  value,
  resourceType = 'restaurant',
  placeholder = '请选择资源',
  showImage = true,
  data,
  apiEndpoint,
}) => {
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (data) {
      setResources(data)
    } else if (apiEndpoint) {
      loadResources()
    } else {
      setResources(getMockResources(resourceType))
    }
  }, [resourceType])

  const loadResources = async () => {
    setLoading(true)
    try {
      const res = await fetch(apiEndpoint)
      if (!res.ok) throw new Error('加载失败')
      const result = await res.json()
      setResources(result.data || result)
    } catch (error) {
      console.error('资源加载失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const getMockResources = (type) => {
    const mockData = {
      restaurant: [
        {
          id: 'rest_001',
          name: '朝阳路店',
          type: 'restaurant',
          image: 'https://via.placeholder.com/50',
          address: '北京市朝阳区朝阳路店',
          status: 'open',
          rating: 4.8,
        },
        {
          id: 'rest_002',
          name: '三里屯店',
          type: 'restaurant',
          image: 'https://via.placeholder.com/50',
          address: '北京市朝阳区三里屯路',
          status: 'open',
          rating: 4.9,
        },
      ],
      kitchen: [
        {
          id: 'kitchen_001',
          name: '一号厨房',
          type: 'kitchen',
          status: 'available',
          capacity: 10,
        },
        {
          id: 'kitchen_002',
          name: '二号厨房',
          type: 'kitchen',
          status: 'occupied',
          capacity: 8,
        },
      ],
      equipment: [
        {
          id: 'equip_001',
          name: '烤箱 A 台',
          type: 'equipment',
          status: 'available',
        },
        {
          id: 'equip_002',
          name: '冰箱 B 台',
          type: 'equipment',
          status: 'in_use',
        },
      ],
      venue: [
        {
          id: 'venue_001',
          name: '包间 A',
          type: 'venue',
          capacity: 8,
          status: 'available',
        },
        {
          id: 'venue_002',
          name: '包间 B',
          type: 'venue',
          capacity: 12,
          status: 'available',
        },
      ],
    }
    return mockData[type] || []
  }

  const getTypeIcon = (type) => {
    switch (type) {
      case 'restaurant':
        return <ShopOutlined />
      case 'kitchen':
        return <HomeOutlined />
      case 'equipment':
        return <ToolOutlined />
      case 'venue':
      case 'farm':
        return <FieldOutlined />
      default:
        return <ShopOutlined />
    }
  }

  const getStatusColor = (status) => {
    const colorMap = {
      open: 'green',
      available: 'green',
      occupied: 'orange',
      in_use: 'orange',
      closed: 'red',
      maintenance: 'gray',
    }
    return colorMap[status] || 'default'
  }

  const getStatusText = (status) => {
    const textMap = {
      open: '营业中',
      available: '可用',
      occupied: '使用中',
      in_use: '使用中',
      closed: '已关闭',
      maintenance: '维护中',
    }
    return textMap[status] || status
  }

  const handleChange = (selectedValue) => {
    onChange?.(selectedValue)
  }

  return (
    <Select
      style={{ width: '100%' }}
      value={value}
      onChange={handleChange}
      placeholder={loading ? '加载中...' : placeholder}
      loading={loading}
      dropdownRender={(menu) => (
        <div>
          {showImage ? (
            <div style={styles.resourceList}>
              {resources.map((resource) => (
                <Card
                  key={resource.id}
                  size="small"
                  hoverable
                  style={{
                    ...styles.resourceCard,
                    border: value === resource.id ? '2px solid #1890ff' : '1px solid #f0f0f0',
                  }}
                  onClick={() => handleChange(resource.id)}
                >
                  <Space>
                    <Avatar
                      icon={getTypeIcon(resource.type || resourceType)}
                      style={{ backgroundColor: '#1890ff' }}
                    />
                    <div>
                      <div style={styles.resourceName}>{resource.name}</div>
                      {resource.address && (
                        <div style={styles.resourceAddress}>{resource.address}</div>
                      )}
                      <Space style={{ marginTop: 4 }}>
                        <Tag color={getStatusColor(resource.status)}>
                          {getStatusText(resource.status)}
                        </Tag>
                        {resource.rating && <Tag color="gold">评分：{resource.rating}</Tag>}
                        {resource.capacity && <Tag>容量：{resource.capacity}人</Tag>}
                      </Space>
                    </div>
                  </Space>
                </Card>
              ))}
            </div>
          ) : (
            menu
          )}
        </div>
      )}
    >
      {resources.map((resource) => (
        <Option key={resource.id} value={resource.id}>
          <Space>
            {getTypeIcon(resource.type || resourceType)}
            <span>{resource.name}</span>
            <Tag color={getStatusColor(resource.status)}>{getStatusText(resource.status)}</Tag>
          </Space>
        </Option>
      ))}
    </Select>
  )
}

const styles = {
  resourceList: {
    padding: 8,
    maxHeight: 400,
    overflowY: 'auto',
  },
  resourceCard: {
    marginBottom: 8,
    cursor: 'pointer',
    transition: 'all 0.3s',
  },
  resourceName: {
    fontWeight: 500,
    fontSize: 14,
  },
  resourceAddress: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
}

export default ResourceSelector
