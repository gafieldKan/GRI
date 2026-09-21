import React, { useState } from 'react'
import { Card, Row, Col, Tag, Input, Select, Space, Button, Modal, message } from 'antd'
import {
  SearchOutlined,
  FileTextOutlined,
  DashboardOutlined,
  FormOutlined,
  ShopOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
} from '@ant-design/icons'

const { Search } = Input
const { Option } = Select

// 预设模板数据
const templateData = [
  {
    id: 'tmpl-001',
    name: '企业信息管理系统',
    description: '完整的企业信息管理解决方案，包含员工管理、部门管理、考勤管理等功能',
    category: 'ERP',
    industry: '通用',
    views: 1280,
    downloads: 356,
    rating: 4.8,
    image: '🏢',
    tags: ['企业管理', 'CRM', '多人协作'],
    tables: ['员工表', '部门表', '考勤表', '项目表'],
  },
  {
    id: 'tmpl-002',
    name: '餐饮点餐系统',
    description: '适用于餐厅的点餐系统，支持扫码点餐、订单管理、库存管理等功能',
    category: '餐饮',
    industry: '餐饮酒店',
    views: 2560,
    downloads: 892,
    rating: 4.9,
    image: '🍽️',
    tags: ['点餐', '订单管理', '库存'],
    tables: ['菜单表', '订单表', '桌台表', '会员表'],
  },
  {
    id: 'tmpl-003',
    name: '项目任务管理',
    description: '敏捷项目管理模板，支持任务分配、进度跟踪、团队协作',
    category: '项目管理',
    industry: '通用',
    views: 1890,
    downloads: 654,
    rating: 4.7,
    image: '📋',
    tags: ['项目管理', '任务分配', '进度跟踪'],
    tables: ['项目表', '任务表', '成员表', '日志表'],
  },
  {
    id: 'tmpl-004',
    name: '客户关系管理 (CRM)',
    description: '完整的客户管理解决方案，包含客户信息、跟进记录、销售机会等功能',
    category: 'CRM',
    industry: '销售',
    views: 3200,
    downloads: 1024,
    rating: 4.9,
    image: '🤝',
    tags: ['客户管理', '销售', '跟进'],
    tables: ['客户表', '联系人表', '跟进记录', '销售机会'],
  },
  {
    id: 'tmpl-005',
    name: '库存管理系统',
    description: '简单易用的库存管理模板，支持入库、出库、盘点等操作',
    category: '仓储',
    industry: '物流',
    views: 1560,
    downloads: 478,
    rating: 4.6,
    image: '📦',
    tags: ['库存', '出入库', '盘点'],
    tables: ['商品表', '仓库表', '入库单', '出库单'],
  },
  {
    id: 'tmpl-006',
    name: '人事管理系统',
    description: '完整的人事管理解决方案，包含招聘、入职、考勤、绩效等功能',
    category: 'HR',
    industry: '通用',
    views: 2100,
    downloads: 756,
    rating: 4.8,
    image: '👥',
    tags: ['人事', '考勤', '绩效'],
    tables: ['员工表', '考勤表', '绩效表', '薪资表'],
  },
]

const categories = ['全部', 'ERP', 'CRM', '项目管理', '餐饮', '仓储', 'HR']

function TemplateMarket() {
  const [searchText, setSearchText] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('全部')
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [detailVisible, setDetailVisible] = useState(false)

  const filteredTemplates = templateData.filter(template => {
    const matchSearch = template.name.toLowerCase().includes(searchText.toLowerCase()) ||
      template.description.toLowerCase().includes(searchText.toLowerCase())
    const matchCategory = selectedCategory === '全部' || template.category === selectedCategory
    return matchSearch && matchCategory
  })

  const handleShowDetail = (template) => {
    setSelectedTemplate(template)
    setDetailVisible(true)
  }

  const handleUseTemplate = (template) => {
    message.success(`正在应用模板：${template.name}`)
    setDetailVisible(false)
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 16 }}>模板市场</h2>
        <p style={{ color: '#666' }}>
          从预设模板快速开始，支持一键应用到当前项目
        </p>
      </div>

      {/* 筛选区 */}
      <Card style={{ marginBottom: 24 }}>
        <Space size="large">
          <div>
            <span style={{ marginRight: 8 }}>分类:</span>
            <Select
              value={selectedCategory}
              onChange={setSelectedCategory}
              style={{ width: 150 }}
            >
              {categories.map(cat => (
                <Option key={cat} value={cat}>{cat}</Option>
              ))}
            </Select>
          </div>
          <div>
            <Search
              placeholder="搜索模板名称或描述"
              allowClear
              style={{ width: 300 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </Space>
      </Card>

      {/* 模板列表 */}
      <Row gutter={[16, 16]}>
        {filteredTemplates.map(template => (
          <Col key={template.id} xs={24} sm={12} lg={8}>
            <Card
              hoverable
              cover={
                <div style={{
                  height: 120,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 48
                }}>
                  {template.image}
                </div>
              }
              actions={[
                <span key="views" style={{ color: '#666' }}>
                  <DashboardOutlined /> {template.views}
                </span>,
                <span key="downloads" style={{ color: '#666' }}>
                  <DownloadOutlined /> {template.downloads}
                </span>,
                <span key="rating" style={{ color: '#faad14' }}>
                  <CheckCircleOutlined /> {template.rating}
                </span>,
              ]}
            >
              <Card.Meta
                title={template.name}
                description={
                  <div>
                    <p style={{
                      color: '#666',
                      fontSize: 13,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      height: 36
                    }}>
                      {template.description}
                    </p>
                    <div style={{ marginTop: 8 }}>
                      {template.tags.map(tag => (
                        <Tag key={tag} color="blue" style={{ fontSize: 11 }}>
                          {tag}
                        </Tag>
                      ))}
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <Button
                        type="primary"
                        block
                        onClick={() => handleShowDetail(template)}
                      >
                        查看详情
                      </Button>
                    </div>
                  </div>
                }
              />
            </Card>
          </Col>
        ))}
      </Row>

      {filteredTemplates.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <FileTextOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
          <p style={{ marginTop: 16, color: '#999' }}>暂无匹配的模板</p>
        </div>
      )}

      {/* 模板详情对话框 */}
      {selectedTemplate && (
        <Modal
          title={
            <div>
              <span style={{ fontSize: 24, marginRight: 8 }}>{selectedTemplate.image}</span>
              {selectedTemplate.name}
            </div>
          }
          open={detailVisible}
          onCancel={() => setDetailVisible(false)}
          footer={[
            <Button key="cancel" onClick={() => setDetailVisible(false)}>
              取消
            </Button>,
            <Button
              key="use"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => handleUseTemplate(selectedTemplate)}
            >
              使用此模板
            </Button>,
          ]}
          size={700}
        >
          <div style={{ marginBottom: 16 }}>
            <h4>模板描述</h4>
            <p style={{ color: '#666' }}>{selectedTemplate.description}</p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <h4>包含数据表</h4>
            <Space wrap>
              {selectedTemplate.tables.map(table => (
                <Tag key={table} icon={<FileTextOutlined />} color="green">
                  {table}
                </Tag>
              ))}
            </Space>
          </div>

          <div style={{ marginBottom: 16 }}>
            <h4>适用行业</h4>
            <Tag color="blue">{selectedTemplate.industry}</Tag>
          </div>

          <div>
            <h4>统计信息</h4>
            <Space>
              <Tag><DashboardOutlined /> 浏览 {selectedTemplate.views}</Tag>
              <Tag><DownloadOutlined /> 下载 {selectedTemplate.downloads}</Tag>
              <Tag><CheckCircleOutlined /> 评分 {selectedTemplate.rating}</Tag>
            </Space>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default TemplateMarket
