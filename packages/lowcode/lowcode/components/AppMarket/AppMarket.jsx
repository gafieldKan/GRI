/**
 * 应用市场组件
 * 支持应用模板的浏览、搜索、筛选、安装、详情查看
 */

import React, { useState, useEffect } from 'react'
import { Card, Row, Col, Tag, Input, Select, Space, Button, Modal, message, Tabs, Statistic, Badge } from 'antd'
import {
  SearchOutlined,
  AppstoreOutlined,
  DashboardOutlined,
  DownloadOutlined,
  StarOutlined,
  CheckCircleOutlined,
  HomeOutlined,
  RocketOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { appMarketManager, Application, AppStatus } from '../../engine/AppMarketManager.js'

const { Search } = Input
const { Option } = Select
const { TabPane } = Tabs

// 分类映射
const categoryLabels = {
  all: '全部应用',
  enterprise: '企业管理',
  crm: '客户关系',
  erp: '资源计划',
  project: '项目管理',
  hr: '人力资源',
  finance: '财务管理',
  retail: '零售餐饮',
  education: '教育培训',
  medical: '医疗健康',
  custom: '自定义',
}

// 获取图标
const getCategoryIcon = (category) => {
  const icons = {
    crm: '🤝',
    erp: '🏭',
    project: '📋',
    hr: '👥',
    finance: '💰',
    retail: '🍽️',
    education: '📚',
    medical: '🏥',
    custom: '📦',
  }
  return icons[category] || '📦'
}

function AppMarket() {
  const [activeTab, setActiveTab] = useState('market')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [apps, setApps] = useState([])
  const [installedApps, setInstalledApps] = useState([])
  const [selectedApp, setSelectedApp] = useState(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ total: 0, installed: 0 })

  useEffect(() => {
    loadApps()
  }, [])

  useEffect(() => {
    // 监听安装/卸载事件
    const handleAppChange = () => {
      loadApps()
    }
    appMarketManager.on('app:install', handleAppChange)
    appMarketManager.on('app:uninstall', handleAppChange)
    return () => {
      appMarketManager.off('app:install', handleAppChange)
      appMarketManager.off('app:uninstall', handleAppChange)
    }
  }, [])

  const loadApps = () => {
    setLoading(true)
    setTimeout(() => {
      const allApps = appMarketManager.getAll()
      const installed = appMarketManager.getInstalled()
      setApps(allApps)
      setInstalledApps(installed)
      setStats(appMarketManager.getStats())
      setLoading(false)
    }, 300)
  }

  const handleInstall = (app) => {
    try {
      appMarketManager.install(app.id)
      message.success(`已安装应用：${app.name}`)
      loadApps()
    } catch (error) {
      message.error(`安装失败：${error.message}`)
    }
  }

  const handleUninstall = (appId) => {
    try {
      appMarketManager.uninstall(appId)
      message.success('已卸载应用')
      loadApps()
    } catch (error) {
      message.error(`卸载失败：${error.message}`)
    }
  }

  const handleShowDetail = (app) => {
    setSelectedApp(app)
    setDetailVisible(true)
  }

  const filteredApps = apps.filter(app => {
    const matchSearch = searchText === '' ||
      app.name.toLowerCase().includes(searchText.toLowerCase()) ||
      app.description.toLowerCase().includes(searchText.toLowerCase()) ||
      app.tags.some(tag => tag.toLowerCase().includes(searchText.toLowerCase()))
    const matchCategory = selectedCategory === 'all' || app.category === selectedCategory
    return matchSearch && matchCategory
  })

  const marketApps = filteredApps.filter(app => !appMarketManager.isInstalled(app.id))
  const installedAppsList = filteredApps.filter(app => appMarketManager.isInstalled(app.id))

  return (
    <div>
      {/* 头部统计 */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic title="应用总数" value={stats.total} suffix="个" />
          </Col>
          <Col span={6}>
            <Statistic title="已安装" value={stats.installed} suffix="个" />
          </Col>
          <Col span={6}>
            <Statistic title="市场中" value={stats.total - stats.installed} suffix="个" />
          </Col>
          <Col span={6}>
            <Statistic title="分类数" value={Object.keys(categoryLabels).length - 1} suffix="类" />
          </Col>
        </Row>
      </Card>

      {/* 标签页切换 */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'market',
            label: (
              <span>
                <AppstoreOutlined /> 应用市场
              </span>
            ),
            children: (
              <div>
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
                        {Object.entries(categoryLabels).map(([key, label]) => (
                          <Option key={key} value={key}>
                            {getCategoryIcon(key)} {label}
                          </Option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Search
                        placeholder="搜索应用名称、描述或标签"
                        allowClear
                        style={{ width: 300 }}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                      />
                    </div>
                  </Space>
                </Card>

                {/* 应用列表 */}
                <Row gutter={[16, 16]}>
                  {marketApps.map(app => (
                    <Col key={app.id} xs={24} sm={12} lg={8} xl={6}>
                      <AppCard
                        app={app}
                        onShowDetail={() => handleShowDetail(app)}
                        onInstall={() => handleInstall(app)}
                      />
                    </Col>
                  ))}
                </Row>

                {marketApps.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <AppstoreOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
                    <p style={{ marginTop: 16, color: '#999' }}>暂无匹配的应用</p>
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'installed',
            label: (
              <span>
                <CheckCircleOutlined /> 已安装 ({installedApps.length})
              </span>
            ),
            children: (
              <div>
                <Row gutter={[16, 16]}>
                  {installedApps.map(app => (
                    <Col key={app.id} xs={24} sm={12} lg={8} xl={6}>
                      <AppCard
                        app={app}
                        onShowDetail={() => handleShowDetail(app)}
                        onUninstall={() => handleUninstall(app.id)}
                        installed
                      />
                    </Col>
                  ))}
                </Row>

                {installedApps.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <CheckCircleOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
                    <p style={{ marginTop: 16, color: '#999' }}>暂无已安装的应用</p>
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />

      {/* 应用详情对话框 */}
      {selectedApp && (
        <AppDetailModal
          app={selectedApp}
          open={detailVisible}
          onClose={() => setDetailVisible(false)}
          onInstall={() => handleInstall(selectedApp)}
          onUninstall={() => handleUninstall(selectedApp.id)}
          isInstalled={appMarketManager.isInstalled(selectedApp.id)}
        />
      )}
    </div>
  )
}

// 应用卡片组件
function AppCard({ app, onShowDetail, onInstall, onUninstall, installed = false }) {
  return (
    <Card
      hoverable
      cover={
        <div
          style={{
            height: 150,
            background: `linear-gradient(135deg, ${getGradientColor(app.category)} 0%, ${getGradientColor2(app.category)} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 64,
          }}
        >
          {app.icon}
        </div>
      }
      actions={[
        installed ? (
          <span
            key="action"
            style={{ color: '#52c41a', cursor: 'pointer' }}
            onClick={onUninstall}
          >
            <SwapOutlined /> 卸载
          </span>
        ) : (
          <span
            key="action"
            style={{ color: '#1890ff', cursor: 'pointer' }}
            onClick={onInstall}
          >
            <DownloadOutlined /> 安装
          </span>
        ),
      ]}
    >
      <Card.Meta
        title={
          <Space>
            {app.name}
            {installed && <Badge status="success" text="已安装" />}
          </Space>
        }
        description={
          <div>
            <p
              style={{
                color: '#666',
                fontSize: 13,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                height: 36,
              }}
            >
              {app.description}
            </p>
            <div style={{ marginTop: 8 }}>
              {app.tags.slice(0, 3).map(tag => (
                <Tag key={tag} color="blue" style={{ fontSize: 11 }}>
                  {tag}
                </Tag>
              ))}
            </div>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <span style={{ color: '#faad14' }}>
                  <StarOutlined /> {app.rating}
                </span>
                <span style={{ color: '#666' }}>
                  <DownloadOutlined /> {app.downloads}
                </span>
              </Space>
              <Button type="link" onClick={onShowDetail}>
                详情
              </Button>
            </div>
          </div>
        }
      />
    </Card>
  )
}

// 应用详情弹窗
function AppDetailModal({ app, visible, onClose, onInstall, onUninstall, isInstalled }) {
  return (
    <Modal
      title={
        <div>
          <span style={{ fontSize: 24, marginRight: 8 }}>{app.icon}</span>
          {app.name}
        </div>
      }
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
        isInstalled ? (
          <Button
            key="uninstall"
            danger
            icon={<SwapOutlined />}
            onClick={() => {
              onUninstall()
              onClose()
            }}
          >
            卸载应用
          </Button>
        ) : (
          <Button
            key="install"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => {
              onInstall()
              onClose()
            }}
          >
            安装应用
          </Button>
        ),
      ]}
      size={700}
    >
      <div style={{ marginBottom: 16 }}>
        <h4>应用描述</h4>
        <p style={{ color: '#666' }}>{app.description}</p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <h4>包含页面</h4>
        <Space wrap>
          {app.pages?.map((page, index) => (
            <Tag key={index} icon={<HomeOutlined />} color="blue">
              {page.name}
            </Tag>
          ))}
        </Space>
      </div>

      <div style={{ marginBottom: 16 }}>
        <h4>数据模型</h4>
        <Space wrap>
          {app.models?.map((model, index) => (
            <Tag key={index} icon={<AppstoreOutlined />} color="green">
              {model}
            </Tag>
          ))}
        </Space>
      </div>

      <div style={{ marginBottom: 16 }}>
        <h4>工作流</h4>
        <Space wrap>
          {app.workflows?.map((workflow, index) => (
            <Tag key={index} icon={<RocketOutlined />} color="purple">
              {workflow}
            </Tag>
          ))}
        </Space>
      </div>

      <div style={{ marginBottom: 16 }}>
        <h4>标签</h4>
        <Space wrap>
          {app.tags.map(tag => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </Space>
      </div>

      <div>
        <h4>统计信息</h4>
        <Space>
          <Tag>
            <DashboardOutlined /> 浏览 {app.downloads * 3}
          </Tag>
          <Tag>
            <DownloadOutlined /> 下载 {app.downloads}
          </Tag>
          <Tag>
            <StarOutlined /> 评分 {app.rating}
          </Tag>
          <Tag>大小 {app.size}MB</Tag>
        </Space>
      </div>
    </Modal>
  )
}

// 辅助函数：获取渐变色
function getGradientColor(category) {
  const colors = {
    crm: '#667eea',
    erp: '#764ba2',
    project: '#f093fb',
    hr: '#f5576c',
    finance: '#4facfe',
    retail: '#43e97b',
    education: '#5efce8',
    medical: '#736ffe',
    custom: '#a8edea',
  }
  return colors[category] || '#667eea'
}

function getGradientColor2(category) {
  const colors = {
    crm: '#764ba2',
    erp: '#f093fb',
    project: '#f5576c',
    hr: '#4facfe',
    finance: '#43e97b',
    retail: '#5efce8',
    education: '#736ffe',
    medical: '#a8edea',
    custom: '#fed6e3',
  }
  return colors[category] || '#764ba2'
}

export default AppMarket
