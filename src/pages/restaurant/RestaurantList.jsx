import React from 'react'
import { Link } from 'react-router-dom'
import { Card, Row, Col, Tag } from 'antd'

const restaurants = [
  {
    id: 1,
    name: '麦当劳',
    image: '🍔',
    rating: 4.8,
    deliveryTime: '30 分钟',
    deliveryFee: '¥9',
    tags: ['快餐', '汉堡'],
  },
  {
    id: 2,
    name: '肯德基',
    image: '🍗',
    rating: 4.7,
    deliveryTime: '35 分钟',
    deliveryFee: '¥8',
    tags: ['快餐', '炸鸡'],
  },
  {
    id: 3,
    name: '星巴克',
    image: '☕',
    rating: 4.9,
    deliveryTime: '25 分钟',
    deliveryFee: '¥12',
    tags: ['咖啡', '饮品'],
  },
  {
    id: 4,
    name: '海底捞火锅',
    image: '🍲',
    rating: 4.9,
    deliveryTime: '50 分钟',
    deliveryFee: '¥15',
    tags: ['火锅', '川菜'],
  },
  {
    id: 5,
    name: '必胜客',
    image: '🍕',
    rating: 4.6,
    deliveryTime: '40 分钟',
    deliveryFee: '¥10',
    tags: ['披萨', '意面'],
  },
  {
    id: 6,
    name: '喜茶',
    image: '🧋',
    rating: 4.8,
    deliveryTime: '20 分钟',
    deliveryFee: '¥6',
    tags: ['奶茶', '饮品'],
  },
]

const RestaurantList = () => {
  return (
    <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100%' }}>
      <h1 style={{ marginBottom: 24 }}>商家列表</h1>
      <Row gutter={[16, 16]}>
        {restaurants.map((restaurant) => (
          <Col key={restaurant.id} xs={24} sm={12} md={8} lg={6}>
            <Link to={`/restaurants/${restaurant.id}/menu`}>
              <Card
                hoverable
                cover={
                  <div
                    style={{
                      height: 160,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#fff5f0',
                      fontSize: 64,
                    }}
                  >
                    {restaurant.image}
                  </div>
                }
              >
                <Card.Meta
                  title={restaurant.name}
                  description={
                    <>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        {restaurant.tags.map((tag) => (
                          <Tag key={tag} color="orange">
                            {tag}
                          </Tag>
                        ))}
                      </div>
                      <div style={{ color: '#666' }}>
                        <span>评分：{restaurant.rating}</span>
                        <span style={{ marginLeft: 12 }}>
                          {restaurant.deliveryTime}
                        </span>
                        <span style={{ marginLeft: 12 }}>
                          配送费：{restaurant.deliveryFee}
                        </span>
                      </div>
                    </>
                  }
                />
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </div>
  )
}

export default RestaurantList
