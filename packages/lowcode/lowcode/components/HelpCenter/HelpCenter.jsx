/**
 * 帮助中心组件
 * 提供使用文档、新手教程、常见问题 FAQ、API 文档等功能
 */

import React, { useState } from 'react'
import {
  Card, Tabs, List, Typography, Input, Tag, Space, Button, Collapse,
  Row, Col, Timeline, Divider, Empty, message
} from 'antd'
import {
  BookOutlined,
  VideoCameraOutlined,
  QuestionCircleOutlined,
  ApiOutlined,
  SearchOutlined,
  StarOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  CodeOutlined,
} from '@ant-design/icons'

const { TabPane } = Tabs
const { Title, Text, Paragraph, Link } = Typography
const { Panel } = Collapse
const { Search } = Input

// 文档分类
const docCategories = [
  { key: 'all', name: '全部文档', icon: <FileTextOutlined /> },
  { key: 'quickstart', name: '快速开始', icon: <ClockCircleOutlined /> },
  { key: 'guide', name: '使用指南', icon: <BookOutlined /> },
  { key: 'tutorial', name: '教程', icon: <VideoCameraOutlined /> },
  { key: 'api', name: 'API 文档', icon: <ApiOutlined /> },
]

// 文档数据
const documents = [
  {
    id: 'doc-001',
    title: '5 分钟快速入门',
    category: 'quickstart',
    description: '快速了解低代码平台的核心功能，5 分钟上手',
    readTime: '5 分钟',
    views: 1280,
    rating: 4.8,
    content: `
# 5 分钟快速入门

欢迎使用 Awesome Lowcode 低代码平台！本指南将帮助您在 5 分钟内了解平台的核心功能。

## 第一步：创建您的第一个表单
1. 点击顶部菜单「设计」>「表单设计器」
2. 从左侧组件库拖拽输入框、按钮到画布
3. 在右侧属性面板修改组件属性
4. 点击「保存」按钮

## 第二步：定义数据模型
1. 点击顶部菜单「设计」>「模型设计器」
2. 点击「新建模型」
3. 添加字段并设置类型和验证规则
4. 保存模型

## 第三步：配置工作流
1. 点击顶部菜单「设计」>「工作流设计器」
2. 拖拽节点并配置流程
3. 保存并发布

## 下一步
- 查看「使用指南」了解更多功能
- 参考「API 文档」进行集成开发
- 查看「教程」学习进阶用法
    `.trim(),
  },
  {
    id: 'doc-002',
    title: '表单设计器使用指南',
    category: 'guide',
    description: '详细讲解表单设计器的各项功能和使用技巧',
    readTime: '15 分钟',
    views: 956,
    rating: 4.7,
    content: `
# 表单设计器使用指南

表单设计器是低代码平台的核心功能之一，支持拖拽式页面构建。

## 组件库
- **基础组件**：输入框、文本域、数字、日期、下拉框等
- **高级组件**：表格、卡片、图表、富文本等
- **布局组件**：栅格、卡片、分组等

## 属性配置
每个组件都有丰富的属性配置：
- **基础属性**：标题、字段名、默认值等
- **验证规则**：必填、格式、长度限制等
- **样式配置**：宽度、高度、字体等

## 数据绑定
支持表达式绑定，可连接到数据源或引用其他组件的值。
    `.trim(),
  },
  {
    id: 'doc-003',
    title: '模型设计器详解',
    category: 'guide',
    description: '学习如何定义和管理数据模型',
    readTime: '20 分钟',
    views: 756,
    rating: 4.6,
  },
  {
    id: 'doc-004',
    title: '工作流设计教程',
    category: 'tutorial',
    description: '从零开始设计业务流程',
    readTime: '25 分钟',
    views: 654,
    rating: 4.9,
  },
  {
    id: 'doc-005',
    title: 'API 参考文档',
    category: 'api',
    description: '完整的 API 接口文档和调用示例',
    readTime: '参考',
    views: 2100,
    rating: 4.8,
  },
  {
    id: 'doc-006',
    title: '权限管理配置',
    category: 'guide',
    description: '配置用户、角色和权限',
    readTime: '18 分钟',
    views: 890,
    rating: 4.7,
  },
]

// FAQ 数据
const faqData = [
  {
    category: '入门问题',
    items: [
      {
        q: '什么是低代码开发平台？',
        a: '低代码开发平台是一种允许开发者通过可视化界面、拖拽组件和少量代码快速构建应用程序的开发环境。它大大降低了开发门槛，提高了开发效率。',
      },
      {
        q: '如何开始使用？',
        a: '注册账号登录后，建议先查看「5 分钟快速入门」文档，然后从创建简单的表单开始体验。平台提供丰富的模板，您也可以基于模板快速开始。',
      },
      {
        q: '需要编程基础吗？',
        a: '基础功能无需编程基础，通过可视化拖拽即可完成。但如果您有 JavaScript 基础，可以更好地使用自定义代码功能。',
      },
    ],
  },
  {
    category: '功能使用',
    items: [
      {
        q: '如何保存我的工作？',
        a: '在设计器中点击「保存」按钮即可保存当前工作。系统也会自动保存草稿，防止意外丢失。',
      },
      {
        q: '可以导出代码吗？',
        a: '支持导出 React 组件代码和 JSON Schema。在顶部菜单选择「导出」>「导出代码」即可。',
      },
      {
        q: '如何与他人协作？',
        a: '使用「协同编辑」功能，可以邀请协作者实时协作编辑。在右上角点击「分享」按钮，生成协作者链接即可。',
      },
    ],
  },
  {
    category: '权限相关',
    items: [
      {
        q: '如何设置数据权限？',
        a: '在「设置」>「权限管理」中，可以为不同角色配置数据访问范围，包括：全部数据、本部门数据、仅本人数据等。',
      },
      {
        q: '支持哪些权限类型？',
        a: '支持模型权限、字段权限、操作权限、菜单权限和数据权限。可以为不同角色配置不同级别的访问控制。',
      },
    ],
  },
  {
    category: '部署发布',
    items: [
      {
        q: '如何发布应用？',
        a: '在「发布」>「多端发布」中，选择目标平台（Web、小程序等），配置发布参数后点击「发布」按钮即可。',
      },
      {
        q: '支持私有化部署吗？',
        a: '支持。企业版提供私有化部署方案，支持 Docker 容器化部署和 Kubernetes 集群部署。',
      },
    ],
  },
]

// 视频教程数据
const videoTutorials = [
  {
    id: 'video-001',
    title: '平台介绍与快速入门',
    duration: '10:25',
    views: 3200,
    thumbnail: '🎬',
    category: '入门',
  },
  {
    id: 'video-002',
    title: '表单设计器详解',
    duration: '25:30',
    views: 2100,
    thumbnail: '📝',
    category: '表单',
  },
  {
    id: 'video-003',
    title: '数据模型设计',
    duration: '18:45',
    views: 1800,
    thumbnail: '🗄️',
    category: '模型',
  },
  {
    id: 'video-004',
    title: '工作流编排实战',
    duration: '32:10',
    views: 1500,
    thumbnail: '🔄',
    category: '工作流',
  },
  {
    id: 'video-005',
    title: '权限配置完整教程',
    duration: '22:15',
    views: 1200,
    thumbnail: '🔐',
    category: '权限',
  },
]

function HelpCenter() {
  const [activeTab, setActiveTab] = useState('docs')
  const [searchText, setSearchText] = useState('')
  const [selectedDoc, setSelectedDoc] = useState(null)

  const filteredDocs = documents.filter(doc => {
    const matchSearch = searchText === '' ||
      doc.title.toLowerCase().includes(searchText.toLowerCase()) ||
      doc.description.toLowerCase().includes(searchText.toLowerCase())
    return matchSearch
  })

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* 头部 */}
      <Card style={{ marginBottom: 24, textAlign: 'center' }}>
        <Title level={2}>
          <BookOutlined style={{ marginRight: 8 }} />
          帮助中心
        </Title>
        <Paragraph style={{ fontSize: 16, color: '#666' }}>
          查找使用文档、教程和常见问题的答案
        </Paragraph>
        <div style={{ marginTop: 16 }}>
          <Search
            placeholder="搜索文档、教程或问题"
            allowClear
            style={{ maxWidth: 500, width: '100%' }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            prefix={<SearchOutlined />}
          />
        </div>
      </Card>

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        {/* 文档标签页 */}
        <TabPane
          tab={
            <span>
              <FileTextOutlined /> 使用文档
            </span>
          }
          key="docs"
        >
          <Row gutter={16}>
            <Col span={6}>
              <Card title="文档分类" size="small">
                <List
                  dataSource={docCategories}
                  renderItem={item => (
                    <List.Item
                      style={{
                        cursor: 'pointer',
                        padding: '8px 12px',
                        borderRadius: 4,
                      }}
                    >
                      <List.Item.Meta
                        avatar={item.icon}
                        title={item.name}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            </Col>

            <Col span={18}>
              <Card title="热门文档">
                <List
                  dataSource={filteredDocs}
                  renderItem={doc => (
                    <List.Item
                      actions={[
                        <Button
                          key="view"
                          type="link"
                          onClick={() => setSelectedDoc(doc)}
                        >
                          查看
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space>
                            <FileTextOutlined />
                            {doc.title}
                            <Tag color="blue">{doc.category}</Tag>
                          </Space>
                        }
                        description={
                          <Space split={<span>|</span>}>
                            <Text type="secondary">{doc.description}</Text>
                            <Tag icon={<ClockCircleOutlined />}>{doc.readTime}</Tag>
                            <Tag icon={<StarOutlined />}>{doc.rating}</Tag>
                            <Tag icon={<VideoCameraOutlined />}>{doc.views}</Tag>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
          </Row>
        </TabPane>

        {/* 教程标签页 */}
        <TabPane
          tab={
            <span>
              <VideoCameraOutlined /> 视频教程
            </span>
          }
          key="videos"
        >
          <Card title="视频教程">
            <Row gutter={[16, 16]}>
              {videoTutorials.map(video => (
                <Col key={video.id} xs={24} sm={12} lg={8}>
                  <Card
                    hoverable
                    cover={
                      <div
                        style={{
                          height: 150,
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 64,
                        }}
                      >
                        {video.thumbnail}
                      </div>
                    }
                  >
                    <Card.Meta
                      title={video.title}
                      description={
                        <Space>
                          <Tag icon={<ClockCircleOutlined />}>{video.duration}</Tag>
                          <Tag icon={<VideoCameraOutlined />}>{video.views} 播放</Tag>
                        </Space>
                      }
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        </TabPane>

        {/* FAQ 标签页 */}
        <TabPane
          tab={
            <span>
              <QuestionCircleOutlined /> 常见问题
            </span>
          }
          key="faq"
        >
          <Card title="常见问题解答">
            {faqData.map((category, index) => (
              <div key={index} style={{ marginBottom: 24 }}>
                <Title level={4}>{category.category}</Title>
                <Collapse>
                  {category.items.map((item, idx) => (
                    <Panel
                      key={idx}
                      header={
                        <Space>
                          <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                          {item.q}
                        </Space>
                      }
                    >
                      <p style={{ paddingLeft: 24, color: '#666' }}>{item.a}</p>
                    </Panel>
                  ))}
                </Collapse>
              </div>
            ))}
          </Card>
        </TabPane>

        {/* API 文档标签页 */}
        <TabPane
          tab={
            <span>
              <ApiOutlined /> API 文档
            </span>
          }
          key="api"
        >
          <Card title="API 参考文档">
            <div style={{ marginBottom: 24 }}>
              <Paragraph>
                低代码平台提供完整的 RESTful API，支持对模型、表单、工作流等资源的增删改查操作。
              </Paragraph>
              <Divider />
              <Title level={4}>基础信息</Title>
              <List
                dataSource={[
                  { label: 'API 版本', value: 'v1.0' },
                  { label: '基础地址', value: '/api/v1' },
                  { label: '认证方式', value: 'Bearer Token' },
                  { label: '数据格式', value: 'JSON' },
                ]}
                renderItem={item => (
                  <List.Item>
                    <Text strong>{item.label}: </Text>
                    <Text code>{item.value}</Text>
                  </List.Item>
                )}
              />
            </div>

            <Divider />

            <Title level={4}>快速链接</Title>
            <Row gutter={16}>
              <Col span={8}>
                <Card size="small" hoverable>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <ApiOutlined style={{ fontSize: 24, color: '#1890ff' }} />
                    <Text strong>API 快速入门</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      了解如何调用 API
                    </Text>
                  </Space>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" hoverable>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <BookOutlined style={{ fontSize: 24, color: '#52c41a' }} />
                    <Text strong>完整参考</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      查看所有接口文档
                    </Text>
                  </Space>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" hoverable>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <CodeOutlined style={{ fontSize: 24, color: '#fa8c16' }} />
                    <Text strong>SDK 下载</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      JavaScript/Python/Go
                    </Text>
                  </Space>
                </Card>
              </Col>
            </Row>
          </Card>
        </TabPane>
      </Tabs>

      {/* 文档详情弹窗 */}
      {selectedDoc && (
        <Modal
          title={selectedDoc.title}
          open={true}
          onCancel={() => setSelectedDoc(null)}
          footer={[
            <Button key="close" onClick={() => setSelectedDoc(null)}>
              关闭
            </Button>,
          ]}
          size={800}
        >
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {selectedDoc.content || '文档内容加载中...'}
          </div>
        </Modal>
      )}
    </div>
  )
}

// 导入 Modal 组件
export default HelpCenter
