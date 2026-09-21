import React, { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import { ConfigProvider, Layout, Menu, Spin, Drawer, Button as AntButton } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import {
  HomeOutlined, RocketOutlined, FormOutlined, PartitionOutlined, ProjectOutlined,
  DatabaseOutlined, LinkOutlined, FileOutlined, BarChartOutlined, TeamOutlined,
  SyncOutlined, MessageOutlined, BellOutlined, MobileOutlined, GithubOutlined,
  DeploymentUnitOutlined, StarOutlined, RobotOutlined, SettingOutlined, SafetyOutlined,
  KeyOutlined, BookOutlined, AppstoreOutlined, DashboardOutlined, ExperimentOutlined,
  ShopOutlined, MenuFoldOutlined,
} from '@ant-design/icons'
import { useEngine } from './contexts/EngineContext.jsx'

// 核心组件导入
import DragDropEditor from '../lowcode/components/DragDropEditor'
import ModelDesigner from '../lowcode/components/ModelDesigner'
import WorkflowDesigner from '../lowcode/components/WorkflowDesigner'
import ApiDebugTool from '../lowcode/components/ApiDebugTool/ApiDebugTool.jsx'
import ConnectorList from '../lowcode/components/ConnectorTemplates/ConnectorList.jsx'
import DataSourceConfig from '../lowcode/components/DataSourceConfig'
import GitPanel from '../lowcode/components/GitPanel/GitPanel.jsx'
import CodeEditor from '../lowcode/components/CodeEditor/CodeEditor.jsx'
import LogicFlowEditor from '../lowcode/components/LogicFlowEditor/LogicFlowEditor.jsx'
import AnalyticsPanel from '../lowcode/components/Analytics/AnalyticsPanel.jsx'
import PublishPanel from '../lowcode/components/MultiPlatformPublish/PublishPanel.jsx'
import LoginPanel from '../lowcode/components/SSO/LoginPanel.jsx'
import CollaborationPanel from '../lowcode/components/Collaboration/CollaborationPanel.jsx'
import CommentList from '../lowcode/components/Comments/CommentList.jsx'
import AIConfigPanel from '../lowcode/components/AIConfig/AIConfigPanel.jsx'
import AIPanel from '../lowcode/components/AIAssistant/AIPanel.jsx'
import ProfilerPanel from '../lowcode/components/Profiler/ProfilerPanel.jsx'
import PluginManager from '../lowcode/components/PluginManager/PluginManager.jsx'
import TemplateMarket from '../lowcode/components/TemplateMarket/TemplateMarket.jsx'
import AppMarket from '../lowcode/components/AppMarket/AppMarket.jsx'
import PermissionManager from '../lowcode/components/PermissionManager/PermissionManager.jsx'
import HelpCenter from '../lowcode/components/HelpCenter/HelpCenter.jsx'
import HomePage from '../lowcode/components/HomePage/HomePage.jsx'
import OrganizationManagement from '../lowcode/pages/OrganizationManagement/index.jsx'

const { Header, Content } = Layout

// 带关闭按钮的页面容器
function PageContainer({ title, children, onClose, showClose = true }) {
  const handleClose = onClose || (() => window.history.back())

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">{title}</h2>
        {showClose && (
          <button
            onClick={handleClose}
            className="page-close-btn"
            title="关闭页面"
          />
        )}
      </div>
      <div className="page-content" style={{ height: 'calc(100vh - 120px)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

// 设计页面 - 表单设计器
function FormDesignerPage() {
  return (
    <PageContainer title="表单设计器" showClose={false}>
      <DragDropEditor />
    </PageContainer>
  )
}
function ModelDesignerPage() {
  return (
    <PageContainer title="模型设计器" showClose={false}>
      <p style={{ color: '#666', marginBottom: 24 }}>数据模型设计工具</p>
      <ModelDesigner />
    </PageContainer>
  )
}
function WorkflowDesignerPage() {
  return (
    <PageContainer title="工作流设计器" showClose={false}>
      <p style={{ color: '#666', marginBottom: 24 }}>业务流程编排工具</p>
      <WorkflowDesigner />
    </PageContainer>
  )
}
function LogicFlowPage() {
  return (
    <PageContainer title="逻辑流编排" showClose={false}>
      <LogicFlowEditor />
    </PageContainer>
  )
}

// 数据页面
function DataSourcesPage() {
  return <PageContainer title="数据源管理"><DataSourceConfig /></PageContainer>
}
function ConnectorsPage() {
  return <PageContainer title="API 连接器"><ConnectorList /></PageContainer>
}
function TemplatesPage() {
  return <PageContainer title="模板库"><TemplateMarket /></PageContainer>
}

// 分析页面
function AnalyticsPage() {
  return <PageContainer title="数据分析"><AnalyticsPanel /></PageContainer>
}
function ProfilerPage() {
  return <PageContainer title="性能监控"><ProfilerPanel /></PageContainer>
}

// 协同页面
function CollaboratePage() {
  return <PageContainer title="实时协作"><CollaborationPanel /></PageContainer>
}
function CommentsPage() {
  return <PageContainer title="评论批注"><CommentList /></PageContainer>
}
function NotificationsPage() {
  return (
    <PageContainer title="消息通知">
      <div style={{ padding: 20, background: '#f5f5f5', borderRadius: 8, textAlign: 'center' }}>
        消息通知功能开发中...
      </div>
    </PageContainer>
  )
}

// 发布页面
function PublishPage() {
  return <PageContainer title="多端发布"><PublishPanel /></PageContainer>
}
function GitVersionPage() {
  return <PageContainer title="版本管理"><GitPanel /></PageContainer>
}
function DeployPage() {
  return <PageContainer title="部署配置"><PublishPanel /></PageContainer>
}

// AI 页面
function AIAssistantPage() {
  return <PageContainer title="AI 助手"><AIPanel /></PageContainer>
}
function AIConfigPage() {
  return <PageContainer title="AI 配置"><AIConfigPanel /></PageContainer>
}
function AIGeneratePage() {
  return (
    <PageContainer title="智能生成">
      <div style={{ padding: 20, background: '#f5f5f5', borderRadius: 8, textAlign: 'center' }}>
        AI 智能生成开发中...
      </div>
    </PageContainer>
  )
}

// 设置页面
function SSOPage() {
  return <PageContainer title="单点登录 (SSO)"><LoginPanel /></PageContainer>
}
function PermissionPage() {
  return <PageContainer title="权限管理"><PermissionManager /></PageContainer>
}
function SystemConfigPage() {
  return (
    <PageContainer title="系统配置">
      <div style={{ padding: 20, background: '#f5f5f5', borderRadius: 8, textAlign: 'center' }}>
        系统配置功能开发中...
      </div>
    </PageContainer>
  )
}
function HelpCenterPage() {
  return <PageContainer title="帮助中心"><HelpCenter /></PageContainer>
}
function OrganizationManagementPage() {
  return <PageContainer title="组织管理"><OrganizationManagement /></PageContainer>
}
function PluginManagerPage() {
  return <PageContainer title="插件管理"><PluginManager /></PageContainer>
}
function TemplateMarketPage() {
  return <PageContainer title="模板市场"><TemplateMarket /></PageContainer>
}
function AppMarketPage() {
  return <PageContainer title="应用市场"><AppMarket /></PageContainer>
}

// GRI 应用
function GriAppPage() {
  return (
    <div style={{ padding: 24 }}>
      <h2>GRI 点餐系统</h2>
      <p style={{ color: '#666' }}>基于低代码平台构建的餐饮行业应用</p>
    </div>
  )
}
function GriRestaurantPlaceholder() {
  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <h1>GRI 点餐系统</h1>
      <p style={{ color: '#666', marginTop: 16 }}>
        GRI 点餐系统是一个独立的 UniApp 应用
      </p>
    </div>
  )
}
function GriAppLayout({ children }) {
  return <Layout className="app-layout">{children}</Layout>
}

// 页面组件映射
const pages = {
  '/designer/form': FormDesignerPage,
  '/designer/model': ModelDesignerPage,
  '/designer/workflow': WorkflowDesignerPage,
  '/logic-flow': LogicFlowPage,
  '/data/sources': DataSourcesPage,
  '/data/connectors': ConnectorsPage,
  '/data/templates': TemplatesPage,
  '/analytics': AnalyticsPage,
  '/profiler': ProfilerPage,
  '/collaborate/realtime': CollaboratePage,
  '/comments': CommentsPage,
  '/collaborate/notifications': NotificationsPage,
  '/publish/multi-platform': PublishPage,
  '/git-version': GitVersionPage,
  '/deploy': DeployPage,
  '/ai/assistant': AIAssistantPage,
  '/ai/config': AIConfigPage,
  '/ai/generate': AIGeneratePage,
  '/settings/sso': SSOPage,
  '/settings/permission': PermissionPage,
  '/settings/system': SystemConfigPage,
  '/data/templates': TemplateMarketPage,
  '/settings/plugin': PluginManagerPage,
  '/settings/help': HelpCenterPage,
  '/gri-app': GriAppPage,
  '/app/gri-restaurant': GriRestaurantPlaceholder,
  '/admin/organizations': OrganizationManagementPage,
  '/app-market': AppMarketPage,
}

// 主布局组件
function MainLayout({ children, currentPath }) {
  const [menuItems, setMenuItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // 检测屏幕尺寸
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => { loadMenuConfig() }, [])

  const loadMenuConfig = async () => {
    setLoading(true)
    try {
      setMenuItems([
        { key: 'home', icon: <HomeOutlined />, label: '首页', path: '/' },
        {
          key: 'design',
          icon: <RocketOutlined />,
          label: '设计中心',
          children: [
            { key: '/designer/form', label: '表单设计器', path: '/designer/form', icon: <FormOutlined /> },
            { key: '/designer/model', label: '模型设计器', path: '/designer/model', icon: <PartitionOutlined /> },
            { key: '/designer/workflow', label: '工作流设计器', path: '/designer/workflow', icon: <ProjectOutlined /> },
            { key: '/logic-flow', label: '逻辑流编排', path: '/logic-flow', icon: <ProjectOutlined /> },
          ],
        },
        {
          key: 'data',
          icon: <DatabaseOutlined />,
          label: '数据管理',
          children: [
            { key: '/data/sources', label: '数据源管理', path: '/data/sources', icon: <DatabaseOutlined /> },
            { key: '/data/connectors', label: 'API 连接器', path: '/data/connectors', icon: <LinkOutlined /> },
            { key: '/data/templates', label: '模板库', path: '/data/templates', icon: <FileOutlined /> },
          ],
        },
        {
          key: 'apps',
          icon: <AppstoreOutlined />,
          label: '应用中心',
          children: [
            { key: '/app-market', label: '应用市场', path: '/app-market', icon: <AppstoreOutlined /> },
            { key: '/app/gri-restaurant', label: 'GRI 点餐系统', path: '/app/gri-restaurant', icon: <ShopOutlined /> },
            { key: '/ai/assistant', label: 'AI 助手', path: '/ai/assistant', icon: <RobotOutlined /> },
            { key: '/ai/generate', label: 'AI 生成', path: '/ai/generate', icon: <RobotOutlined /> },
          ],
        },
        {
          key: 'analytics',
          icon: <BarChartOutlined />,
          label: '分析洞察',
          children: [
            { key: '/analytics', label: '数据分析', path: '/analytics', icon: <DashboardOutlined /> },
            { key: '/profiler', label: '性能监控', path: '/profiler', icon: <ExperimentOutlined /> },
          ],
        },
        {
          key: 'collaborate',
          icon: <TeamOutlined />,
          label: '协同办公',
          children: [
            { key: '/collaborate/realtime', label: '实时协作', path: '/collaborate/realtime', icon: <SyncOutlined /> },
            { key: '/comments', label: '评论批注', path: '/comments', icon: <MessageOutlined /> },
            { key: '/collaborate/notifications', label: '消息通知', path: '/collaborate/notifications', icon: <BellOutlined /> },
          ],
        },
        {
          key: 'publish',
          icon: <DeploymentUnitOutlined />,
          label: '发布部署',
          children: [
            { key: '/publish/multi-platform', label: '多端发布', path: '/publish/multi-platform', icon: <MobileOutlined /> },
            { key: '/git-version', label: '版本管理', path: '/git-version', icon: <GithubOutlined /> },
            { key: '/deploy', label: '部署配置', path: '/deploy', icon: <DeploymentUnitOutlined /> },
          ],
        },
        {
          key: 'settings',
          icon: <SettingOutlined />,
          label: '系统设置',
          children: [
            { key: '/settings/sso', label: '单点登录', path: '/settings/sso', icon: <SafetyOutlined /> },
            { key: '/settings/permission', label: '权限管理', path: '/settings/permission', icon: <KeyOutlined /> },
            { key: '/settings/plugin', label: '插件管理', path: '/settings/plugin', icon: <AppstoreOutlined /> },
            { key: '/settings/system', label: '系统配置', path: '/settings/system', icon: <SettingOutlined /> },
            { key: '/settings/help', label: '帮助中心', path: '/settings/help', icon: <BookOutlined /> },
            { key: '/admin/organizations', label: '组织管理', path: '/admin/organizations', icon: <TeamOutlined /> },
            { key: '/ai/config', label: 'AI 配置', path: '/ai/config', icon: <RobotOutlined /> },
          ],
        },
      ])
    } catch (error) {
      console.error('加载菜单失败:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout className="app-layout" style={{ minHeight: '100vh' }}>
      <Header className="app-header" style={{ display: 'flex', alignItems: 'center', padding: '0 16px' }}>
        {isMobile && (
          <AntButton
            type="text"
            icon={<MenuFoldOutlined />}
            onClick={() => setMobileOpen(true)}
            style={{ color: 'white', marginRight: 16, fontSize: 20 }}
          />
        )}
        <div className="app-logo" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ marginRight: 8 }}>🚀</span>
          Awesome Lowcode
        </div>
        {loading ? (
          <Spin size="small" style={{ marginLeft: 16 }} />
        ) : (
          !isMobile && (
            <Menu
              theme="dark"
              mode="horizontal"
              selectedKeys={[currentPath]}
              items={menuItems}
              onClick={({ key, keyPath }) => {
                const path = keyPath ? keyPath.find(item => item.startsWith('/')) : key
                if (path) window.location.href = path
              }}
              style={{ flex: 1, marginLeft: 24, minWidth: 0 }}
            />
          )
        )}
      </Header>
      <Drawer
        title="菜单导航"
        placement="left"
        onClose={() => setMobileOpen(false)}
        open={mobileOpen}
        size={280}
      >
        <Menu
          mode="vertical"
          selectedKeys={[currentPath]}
          items={menuItems}
          onClick={({ key }) => {
            setMobileOpen(false)
            const path = key.startsWith('/') ? key : null
            if (path) window.location.href = path
          }}
        />
      </Drawer>
      <Content className="app-content">{children}</Content>
    </Layout>
  )
}

// App 主组件
function App() {
  const { eventEngine, isReady } = useEngine()
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname)

  // 导航时发射引擎事件
  const navigateWithEvent = useCallback((path) => {
    eventEngine?.emit('navigation', { from: currentPath, to: path })
    window.location.href = path
  }, [eventEngine, currentPath])

  useEffect(() => {
    const handlePathChange = () => setCurrentPath(window.location.pathname)
    window.addEventListener('popstate', handlePathChange)
    return () => window.removeEventListener('popstate', handlePathChange)
  }, [])

  const renderPage = () => {
    const PageComponent = pages[currentPath] || (() => <div>404</div>)
    return <MainLayout currentPath={currentPath}><PageComponent /></MainLayout>
  }

  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainLayout currentPath={currentPath}><HomePage /></MainLayout>} />
          <Route path="/designer/form" element={<MainLayout currentPath={currentPath}><FormDesignerPage /></MainLayout>} />
          <Route path="/designer/model" element={<MainLayout currentPath={currentPath}><ModelDesignerPage /></MainLayout>} />
          <Route path="/designer/workflow" element={<MainLayout currentPath={currentPath}><WorkflowDesignerPage /></MainLayout>} />
          <Route path="/logic-flow" element={<MainLayout currentPath={currentPath}><LogicFlowPage /></MainLayout>} />
          <Route path="/data/sources" element={<MainLayout currentPath={currentPath}><DataSourcesPage /></MainLayout>} />
          <Route path="/data/connectors" element={<MainLayout currentPath={currentPath}><ConnectorsPage /></MainLayout>} />
          <Route path="/data/templates" element={<MainLayout currentPath={currentPath}><TemplatesPage /></MainLayout>} />
          <Route path="/analytics" element={<MainLayout currentPath={currentPath}><AnalyticsPage /></MainLayout>} />
          <Route path="/profiler" element={<MainLayout currentPath={currentPath}><ProfilerPage /></MainLayout>} />
          <Route path="/collaborate/realtime" element={<MainLayout currentPath={currentPath}><CollaboratePage /></MainLayout>} />
          <Route path="/comments" element={<MainLayout currentPath={currentPath}><CommentsPage /></MainLayout>} />
          <Route path="/collaborate/notifications" element={<MainLayout currentPath={currentPath}><NotificationsPage /></MainLayout>} />
          <Route path="/publish/multi-platform" element={<MainLayout currentPath={currentPath}><PublishPage /></MainLayout>} />
          <Route path="/git-version" element={<MainLayout currentPath={currentPath}><GitVersionPage /></MainLayout>} />
          <Route path="/deploy" element={<MainLayout currentPath={currentPath}><DeployPage /></MainLayout>} />
          <Route path="/ai/assistant" element={<MainLayout currentPath={currentPath}><AIAssistantPage /></MainLayout>} />
          <Route path="/ai/config" element={<MainLayout currentPath={currentPath}><AIConfigPage /></MainLayout>} />
          <Route path="/ai/generate" element={<MainLayout currentPath={currentPath}><AIGeneratePage /></MainLayout>} />
          <Route path="/settings/sso" element={<MainLayout currentPath={currentPath}><SSOPage /></MainLayout>} />
          <Route path="/settings/permission" element={<MainLayout currentPath={currentPath}><PermissionPage /></MainLayout>} />
          <Route path="/settings/system" element={<MainLayout currentPath={currentPath}><SystemConfigPage /></MainLayout>} />
          <Route path="/settings/plugin" element={<MainLayout currentPath={currentPath}><PluginManagerPage /></MainLayout>} />
          <Route path="/app-market" element={<MainLayout currentPath={currentPath}><AppMarketPage /></MainLayout>} />
          <Route path="/settings/help" element={<MainLayout currentPath={currentPath}><HelpCenterPage /></MainLayout>} />
          <Route path="/gri-app" element={<MainLayout currentPath={currentPath}><GriAppPage /></MainLayout>} />
          <Route path="/app/gri-restaurant/*" element={<GriAppLayout><GriRestaurantPlaceholder /></GriAppLayout>} />
          <Route path="/admin/organizations" element={<MainLayout currentPath={currentPath}><OrganizationManagementPage /></MainLayout>} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  )
}

export default App
