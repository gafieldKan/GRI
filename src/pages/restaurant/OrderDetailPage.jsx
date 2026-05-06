import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Button, Descriptions, Tag } from 'antd'

const statusMap = {
  pending: { color: 'orange', text: '待处理' },
  processing: { color: 'blue', text: '制作中' },
  completed: { color: 'green', text: '已完成' },
  cancelled: { color: 'red', text: '已取消' },
}

const OrderDetailPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()

  // 模拟订单详情
  const order = {
    id: `ORD${id}`,
    restaurant: '麦当劳',
    items: '巨无霸套餐 x2, 可乐 x1',
    total: 72,
    status: 'completed',
    time: '2024-01-15 12:30',
    address: '北京市朝阳区 xxx 街道 xxx 号',
    contact: '张三',
    phone: '138****8888',
  }

  return (
    <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100%' }}>
      <div style={{ marginBottom: 16 }}>
        <Button onClick={() => navigate('/orders')}>返回订单列表</Button>
      </div>
      <Card title={`订单详情 - ${order.id}`} style={{ maxWidth: 800 }}>
        <Descriptions column={1} bordered>
          <Descriptions.Item label="商家">{order.restaurant}</Descriptions.Item>
          <Descriptions.Item label="商品">{order.items}</Descriptions.Item>
          <Descriptions.Item label="订单金额">
            ¥{order.total.toFixed(2)}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={statusMap[order.status]?.color}>
              {statusMap[order.status]?.text}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="下单时间">
            {order.time}
          </Descriptions.Item>
          <Descriptions.Item label="配送地址">
            {order.address}
          </Descriptions.Item>
          <Descriptions.Item label="联系人">
            {order.contact}
          </Descriptions.Item>
          <Descriptions.Item label="联系电话">
            {order.phone}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  )
}

export default OrderDetailPage
