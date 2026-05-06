import React, { useState } from 'react'
import { Card, Table, Tag, Button, Modal } from 'antd'
import { EyeOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

const mockOrders = [
  {
    id: 'ORD001',
    restaurant: '麦当劳',
    items: '巨无霸套餐 x2, 可乐 x1',
    total: 72,
    status: 'completed',
    time: '2024-01-15 12:30',
  },
  {
    id: 'ORD002',
    restaurant: '星巴克',
    items: '美式咖啡 x1, 蛋糕 x1',
    total: 53,
    status: 'processing',
    time: '2024-01-15 14:20',
  },
  {
    id: 'ORD003',
    restaurant: '海底捞火锅',
    items: '鸳鸯锅 x1, 肥牛拼盘 x2',
    total: 224,
    status: 'pending',
    time: '2024-01-15 18:00',
  },
]

const statusMap = {
  pending: { color: 'orange', text: '待处理' },
  processing: { color: 'blue', text: '制作中' },
  completed: { color: 'green', text: '已完成' },
  cancelled: { color: 'red', text: '已取消' },
}

const OrderListPage = () => {
  const navigate = useNavigate()
  const [selectedOrder, setSelectedOrder] = useState(null)

  const columns = [
    {
      title: '订单号',
      dataIndex: 'id',
      key: 'id',
    },
    {
      title: '商家',
      dataIndex: 'restaurant',
      key: 'restaurant',
    },
    {
      title: '商品',
      dataIndex: 'items',
      key: 'items',
    },
    {
      title: '订单金额',
      dataIndex: 'total',
      key: 'total',
      render: (total) => `¥${total.toFixed(2)}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={statusMap[status]?.color}>
          {statusMap[status]?.text}
        </Tag>
      ),
    },
    {
      title: '下单时间',
      dataIndex: 'time',
      key: 'time',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Button
          icon={<EyeOutlined />}
          onClick={() => setSelectedOrder(record)}
        >
          详情
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100%' }}>
      <h1 style={{ marginBottom: 24 }}>我的订单</h1>
      <Card>
        <Table
          columns={columns}
          dataSource={mockOrders}
          rowKey="id"
          pagination={{ pageSize: 5 }}
        />
      </Card>
      <Modal
        title="订单详情"
        open={!!selectedOrder}
        onCancel={() => setSelectedOrder(null)}
        footer={null}
      >
        {selectedOrder && (
          <div>
            <p>
              <strong>订单号:</strong> {selectedOrder.id}
            </p>
            <p>
              <strong>商家:</strong> {selectedOrder.restaurant}
            </p>
            <p>
              <strong>商品:</strong> {selectedOrder.items}
            </p>
            <p>
              <strong>金额:</strong> ¥{selectedOrder.total.toFixed(2)}
            </p>
            <p>
              <strong>状态:</strong> {statusMap[selectedOrder.status]?.text}
            </p>
            <p>
              <strong>时间:</strong> {selectedOrder.time}
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default OrderListPage
