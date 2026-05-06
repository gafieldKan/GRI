import React, { useContext } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Button, message, Divider } from 'antd'
import { ShoppingCartOutlined, HomeOutlined } from '@ant-design/icons'
import { CartContext } from '../../store/CartContext'

const menus = {
  1: [
    { id: 1, name: '巨无霸套餐', price: 32, image: '🍔', description: '经典汉堡套餐' },
    { id: 2, name: '麦辣鸡翅', price: 15, image: '🍗', description: '香辣可口' },
    { id: 3, name: '薯条', price: 12, image: '🍟', description: '金黄酥脆' },
    { id: 4, name: '可乐', price: 8, image: '🥤', description: '冰爽解渴' },
  ],
  2: [
    { id: 5, name: '原味鸡', price: 18, image: '🍗', description: '经典美味' },
    { id: 6, name: '香辣鸡腿堡', price: 22, image: '🍔', description: '香辣过瘾' },
    { id: 7, name: '蛋挞', price: 8, image: '🥧', description: '香甜嫩滑' },
  ],
  3: [
    { id: 8, name: '美式咖啡', price: 25, image: '☕', description: '香醇浓郁' },
    { id: 9, name: '拿铁', price: 30, image: '🥛', description: '丝滑顺口' },
    { id: 10, name: '蛋糕', price: 28, image: '🍰', description: '细腻绵密' },
  ],
  4: [
    { id: 11, name: '鸳鸯锅', price: 88, image: '🍲', description: '麻辣 + 清汤' },
    { id: 12, name: '肥牛拼盘', price: 68, image: '🥩', description: '新鲜肥牛' },
    { id: 13, name: '虾滑', price: 38, image: '🍤', description: 'Q 弹爽口' },
  ],
  5: [
    { id: 14, name: '超级至尊披萨', price: 128, image: '🍕', description: '12 寸大披萨' },
    { id: 15, name: '意式肉酱面', price: 48, image: '🍝', description: '经典意面' },
    { id: 16, name: '鸡翅', price: 32, image: '🍗', description: '外酥里嫩' },
  ],
  6: [
    { id: 17, name: '芝士奶盖茶', price: 22, image: '🧋', description: '香浓奶盖' },
    { id: 18, name: '水果茶', price: 20, image: '🍹', description: '清新果香' },
    { id: 19, name: '波波奶茶', price: 18, image: '🥤', description: 'Q 弹珍珠' },
  ],
}

const MenuPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addItem } = useContext(CartContext)
  const menuItems = menus[id] || []

  const handleAddToCart = (item) => {
    addItem(item)
    message.success(`已添加 ${item.name} 到购物车`)
  }

  return (
    <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100%' }}>
      <div style={{ marginBottom: 16 }}>
        <Button icon={<HomeOutlined />} onClick={() => navigate('/')}>
          返回商家列表
        </Button>
      </div>
      <h1 style={{ marginBottom: 24 }}>菜单</h1>
      <Card grid={{ gutter: 16, xs: 2, sm: 2, md: 3, lg: 4 }}>
        {menuItems.map((item) => (
          <Card.Grid
            key={item.id}
            style={{ width: '100%', textAlign: 'center' }}
            hoverable
          >
            <div style={{ fontSize: 48, marginBottom: 8 }}>{item.image}</div>
            <h3 style={{ margin: '8px 0' }}>{item.name}</h3>
            <p style={{ color: '#666', fontSize: 14 }}>{item.description}</p>
            <div style={{ color: '#ff4d4f', fontWeight: 'bold', fontSize: 18 }}>
              ¥{item.price}
            </div>
            <Button
              type="primary"
              style={{ marginTop: 12 }}
              icon={<ShoppingCartOutlined />}
              onClick={() => handleAddToCart(item)}
            >
              加入购物车
            </Button>
          </Card.Grid>
        ))}
      </Card>
    </div>
  )
}

export default MenuPage
