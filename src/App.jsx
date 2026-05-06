import React from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { Layout, Menu, Badge } from 'antd'
import {
  HomeOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  FileTextOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { CartProvider, CartContext } from './store/CartContext.jsx'
import RestaurantList from './pages/restaurant/RestaurantList'
import MenuPage from './pages/restaurant/MenuPage'
import CartPage from './pages/restaurant/CartPage'
import OrderConfirmPage from './pages/restaurant/OrderConfirmPage'
import OrderListPage from './pages/restaurant/OrderListPage'
import OrderDetailPage from './pages/restaurant/OrderDetailPage'
import ProfilePage from './pages/restaurant/ProfilePage'

const { Header, Content } = Layout

function AppContent() {
  const location = useLocation()
  const { getItemCount } = React.useContext(CartContext)
  const itemCount = getItemCount()

  const menuItems = [
    {
      key: '/',
      icon: <HomeOutlined />,
      label: <Link to="/">首页</Link>,
    },
    {
      key: '/restaurants',
      icon: <ShopOutlined />,
      label: <Link to="/restaurants">商家列表</Link>,
    },
    {
      key: '/cart',
      icon: <ShoppingCartOutlined />,
      label: <Badge count={itemCount} size="small">购物车</Badge>,
    },
    {
      key: '/orders',
      icon: <FileTextOutlined />,
      label: <Link to="/orders">我的订单</Link>,
    },
    {
      key: '/profile',
      icon: <UserOutlined />,
      label: <Link to="/profile">个人中心</Link>,
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ color: 'white', fontSize: 20, fontWeight: 'bold', marginRight: 24 }}>
          🍔 GRI 点餐系统
        </div>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={menuItems}
          style={{ flex: 1 }}
        />
      </Header>
      <Content style={{ padding: 24 }}>
        <Routes>
          <Route path="/" element={<RestaurantList />} />
          <Route path="/restaurants" element={<RestaurantList />} />
          <Route path="/restaurants/:id/menu" element={<MenuPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/order/confirm" element={<OrderConfirmPage />} />
          <Route path="/orders" element={<OrderListPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </Content>
    </Layout>
  )
}

function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <AppContent />
      </CartProvider>
    </BrowserRouter>
  )
}

export default App
