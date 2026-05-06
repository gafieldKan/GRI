import React, { useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Empty, Table, InputNumber, message } from 'antd'
import { MinusOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { CartContext } from '../../store/CartContext'

const CartPage = () => {
  const navigate = useNavigate()
  const { items, updateQuantity, removeItem, getTotalPrice } =
    useContext(CartContext)

  const columns = [
    {
      title: '商品',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '单价',
      dataIndex: 'price',
      key: 'price',
      render: (price) => `¥${price}`,
    },
    {
      title: '数量',
      key: 'quantity',
      render: (_, record) => (
        <div>
          <Button
            icon={<MinusOutlined />}
            size="small"
            onClick={() => updateQuantity(record.id, record.quantity - 1)}
          />
          <span style={{ padding: '0 12px' }}>{record.quantity}</span>
          <Button
            icon={<PlusOutlined />}
            size="small"
            onClick={() => updateQuantity(record.id, record.quantity + 1)}
          />
        </div>
      ),
    },
    {
      title: '小计',
      key: 'subtotal',
      render: (_, record) => `¥${(record.price * record.quantity).toFixed(2)}`,
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Button
          danger
          icon={<DeleteOutlined />}
          size="small"
          onClick={() => removeItem(record.id)}
        >
          删除
        </Button>
      ),
    },
  ]

  const total = getTotalPrice()

  return (
    <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100%' }}>
      <h1 style={{ marginBottom: 24 }}>购物车</h1>
      {items.length === 0 ? (
        <Card>
          <Empty description="购物车为空" />
          <Button type="primary" onClick={() => navigate('/')}>
            去逛逛
          </Button>
        </Card>
      ) : (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Table
              columns={columns}
              dataSource={items}
              rowKey="id"
              pagination={false}
            />
          </Card>
          <Card>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <span style={{ fontSize: 16 }}>
                  共 {items.length} 件商品，总计：
                </span>
                <span
                  style={{
                    fontSize: 24,
                    color: '#ff4d4f',
                    fontWeight: 'bold',
                  }}
                >
                  ¥{total.toFixed(2)}
                </span>
              </div>
              <Button
                type="primary"
                size="large"
                onClick={() => navigate('/order/confirm')}
              >
                去结算
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

export default CartPage
