import React from 'react'
import { Card, Avatar, List, Button } from 'antd'
import { UserOutlined, SettingOutlined, CreditCardOutlined } from '@ant-design/icons'

const ProfilePage = () => {
  const menuItems = [
    { title: '个人信息', icon: <UserOutlined /> },
    { title: '我的地址', icon: <SettingOutlined /> },
    { title: '支付设置', icon: <CreditCardOutlined /> },
  ]

  return (
    <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100%' }}>
      <h1 style={{ marginBottom: 24 }}>个人中心</h1>
      <Card style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Avatar size={80} icon={<UserOutlined />} />
          <h2 style={{ marginTop: 16 }}>张三</h2>
          <p style={{ color: '#666' }}>138****8888</p>
        </div>
        <List
          dataSource={menuItems}
          renderItem={(item) => (
            <List.Item
              style={{ cursor: 'pointer', padding: '12px 0' }}
              onClick={() => alert(`进入${item.title}`)}
            >
              <List.Item.Meta
                avatar={item.icon}
                title={item.title}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  )
}

export default ProfilePage
