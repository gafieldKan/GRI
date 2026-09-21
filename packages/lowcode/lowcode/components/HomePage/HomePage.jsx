/**
 * 首页组件
 * 展示平台简介、功能特性、数据统计、快速入口等
 */

import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Row, Col, Statistic, Timeline, Button, Space,
  Typography, Divider, List, Badge
} from 'antd'
import {
  RocketOutlined,
  FormOutlined,
  PartitionOutlined,
  ProjectOutlined,
  AppstoreOutlined,
  DashboardOutlined,
  TeamOutlined,
  CloudUploadOutlined,
  StarOutlined,
  ClockCircleOutlined,
  ArrowRightOutlined,
  BookOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'

const { Title, Paragraph, Text } = Typography

// 核心功能
const features = [
  { icon: <FormOutlined />, title: '表单设计器', description: '拖拽式表单设计，支持 50+ 组件类型', color: '#1890ff', path: '/designer/form' },
  { icon: <PartitionOutlined />, title: '模型设计器', description: '可视化数据模型定义，支持多种字段类型', color: '#52c41a', path: '/designer/model' },
  { icon: <ProjectOutlined />, title: '工作流设计', description: '业务流程可视化编排，支持复杂审批流', color: '#fa8c16', path: '/designer/workflow' },
  { icon: <AppstoreOutlined />, title: '应用市场', description: '丰富应用模板，一键安装使用', color: '#722ed1', path: '/app-market' },
  { icon: <DashboardOutlined />, title: '数据分析', description: '多维度数据分析，助力业务决策', color: '#13c2c2', path: '/analytics' },
  { icon: <TeamOutlined />, title: '协同办公', description: '实时多人协作，提升团队效率', color: '#eb2f96', path: '/collaborate/realtime' },
  { icon: <CloudUploadOutlined />, title: '多端发布', description: '一次设计，多端发布，覆盖全平台', color: '#fa541c', path: '/publish/multi-platform' },
  { icon: <StarOutlined />, title: 'AI 助手', description: 'AI 智能辅助，提升开发效率', color: '#fadb14', path: '/ai/assistant' },
]

// 快速入门步骤
const quickStartSteps = [
  { icon: <FormOutlined />, title: '创建表单', description: '使用拖拽式设计器快速创建表单', color: '#1890ff' },
  { icon: <PartitionOutlined />, title: '定义模型', description: '定义数据模型和字段属性', color: '#52c41a' },
  { icon: <ProjectOutlined />, title: '配置流程', description: '配置业务逻辑和工作流', color: '#fa8c16' },
  { icon: <CloudUploadOutlined />, title: '发布应用', description: '一键发布到多个平台', color: '#722ed1' },
]

// 最近更新
const recentUpdates = [
  { id: 1, title: '应用市场功能上线', description: '新增应用市场，支持应用模板浏览、安装和管理', date: '2026-05-24', type: 'feature' },
  { id: 2, title: '权限管理功能增强', description: '完善 RBAC 权限模型，支持字段级权限控制', date: '2026-05-24', type: 'feature' },
  { id: 3, title: '帮助中心上线', description: '新增帮助中心，提供文档、教程和常见问题解答', date: '2026-05-24', type: 'feature' },
  { id: 4, title: '菜单布局优化', description: '精简菜单结构，提升用户体验', date: '2026-05-24', type: 'improvement' },
]

// 示例应用
const sampleApps = [
  { name: 'GRI 点餐系统', icon: '🍽️', description: '餐饮行业点餐管理系统', path: '/app/gri-restaurant' },
  { name: '客户关系管理', icon: '🤝', description: '企业级 CRM 客户管理', path: '/app-market' },
  { name: '项目任务管理', icon: '📋', description: '敏捷项目管理工具', path: '/app-market' },
]

function HomePage() {
  const navigate = useNavigate()
  const stats = { apps: 6, forms: 24, models: 18, workflows: 12 }

  const navigateTo = (path) => {
    navigate(path)
  }

  return (
    <div style={{
      maxWidth: 1400,
      margin: '0 auto',
      padding: 24,
      background: '#f0f2f5',
      minHeight: 'calc(100vh - 64px)'
    }}>
      {/* 欢迎横幅 */}
      <Card
        style={{ marginBottom: 24, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}
        variant="borderless"
      >
        <Title level={2} style={{ color: 'white', marginBottom: 8 }}>
          <RocketOutlined style={{ marginRight: 12 }} />
          Awesome Lowcode 低代码平台
        </Title>
        <Paragraph style={{ color: 'rgba(255,255,255,0.9)', fontSize: 16, marginBottom: 16 }}>
          快速构建企业级应用的低代码开发平台，让开发更高效
        </Paragraph>
        <Space size={16}>
          <Button type="primary" size="large" onClick={() => navigateTo('/designer/form')} style={{ background: 'white', color: '#667eea', borderColor: 'white' }}>
            开始创建
          </Button>
          <Button size="large" onClick={() => navigateTo('/app-market')} style={{ color: 'white', borderColor: 'white' }}>
            浏览模板
          </Button>
          <Button size="large" onClick={() => navigateTo('/settings/help')} icon={<BookOutlined />} style={{ color: 'white', borderColor: 'white' }}>
            使用帮助
          </Button>
        </Space>
      </Card>

      {/* 数据统计 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="应用数量" value={stats.apps} suffix="个" prefix={<AppstoreOutlined style={{ color: '#1890ff' }} />} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="表单数量" value={stats.forms} suffix="个" prefix={<FormOutlined style={{ color: '#52c41a' }} />} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="数据模型" value={stats.models} suffix="个" prefix={<PartitionOutlined style={{ color: '#fa8c16' }} />} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="工作流" value={stats.workflows} suffix="个" prefix={<ProjectOutlined style={{ color: '#722ed1' }} />} /></Card>
        </Col>
      </Row>

      {/* 核心功能 */}
      <Title level={3} style={{ marginBottom: 16 }}>
        <DashboardOutlined style={{ marginRight: 8, color: '#1890ff' }} />
        核心功能
      </Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {features.map((feature, index) => (
          <Col xs={24} sm={12} md={8} lg={6} key={index}>
            <Card
              hoverable
              onClick={() => navigateTo(feature.path)}
              style={{ height: '100%', cursor: 'pointer' }}
            >
              <Card.Meta
                avatar={
                  <div style={{ fontSize: 24, color: feature.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {feature.icon}
                  </div>
                }
                title={feature.title}
                description={
                  <div>
                    <Text type="secondary">{feature.description}</Text>
                    <div style={{ marginTop: 8, color: feature.color }}>
                      立即体验 <ArrowRightOutlined />
                    </div>
                  </div>
                }
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* 示例应用 */}
      <Title level={3} style={{ marginBottom: 16 }}>
        <AppstoreOutlined style={{ marginRight: 8, color: '#722ed1' }} />
        示例应用
      </Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {sampleApps.map((app, index) => (
          <Col xs={24} sm={12} md={8} key={index}>
            <Card
              hoverable
              onClick={() => navigateTo(app.path)}
              style={{ height: '100%', cursor: 'pointer' }}
            >
              <Card.Meta
                avatar={<div style={{ fontSize: 32 }}>{app.icon}</div>}
                title={app.name}
                description={app.description}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={16}>
        {/* 快速入门 */}
        <Col xs={24} lg={12}>
          <Card title={<span><ClockCircleOutlined style={{ marginRight: 8, color: '#1890ff' }} />快速入门</span>} style={{ marginBottom: 24 }}>
 <Timeline
   items={quickStartSteps.map((step, index) => ({
     key: index,
     dot: <div style={{ fontSize: 16, color: step.color, display: 'inline-flex', alignItems: 'center' }}>{step.icon}</div>,
     children: (
       <>
         <Text strong style={{ display: 'block', marginBottom: 4 }}>{step.title}</Text>
         <Text type="secondary">{step.description}</Text>
       </>
     ),
   }))}
 />
            <Divider />
            <div style={{ textAlign: 'center' }}>
              <Button type="primary" icon={<RocketOutlined />} onClick={() => navigateTo('/designer/form')}>
                开始创建第一个应用
              </Button>
            </div>
          </Card>

          {/* 最近更新 */}
          <Card title={<span><StarOutlined style={{ marginRight: 8, color: '#faad14' }} />最近更新</span>}>
            <List
              dataSource={recentUpdates}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Badge count={item.type === 'feature' ? '新' : '优'} color={item.type === 'feature' ? '#52c41a' : '#1890ff'} />}
                    title={item.title}
                    description={
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>{item.description}</Text>
                        <div style={{ marginTop: 4 }}>
                          <Text style={{ fontSize: 11, color: '#999' }}><ClockCircleOutlined /> {item.date}</Text>
                        </div>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        {/* 学习资源 */}
        <Col xs={24} lg={12}>
          <Card title={<span><BookOutlined style={{ marginRight: 8, color: '#52c41a' }} />学习资源</span>} style={{ height: '100%' }}>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Card size="small" hoverable onClick={() => navigateTo('/settings/help')} style={{ textAlign: 'center', height: '100%', cursor: 'pointer' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📖</div>
                  <Text strong>使用文档</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>详细的使用说明</Text>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" hoverable onClick={() => navigateTo('/settings/help')} style={{ textAlign: 'center', height: '100%', cursor: 'pointer' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🎬</div>
                  <Text strong>视频教程</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>视频学习内容</Text>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" hoverable onClick={() => navigateTo('/settings/help')} style={{ textAlign: 'center', height: '100%', cursor: 'pointer' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>❓</div>
                  <Text strong>常见问题</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>FAQ 解答</Text>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" hoverable onClick={() => navigateTo('/settings/help')} style={{ textAlign: 'center', height: '100%', cursor: 'pointer' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🔧</div>
                  <Text strong>API 文档</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>开发者接口文档</Text>
                </Card>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default HomePage
