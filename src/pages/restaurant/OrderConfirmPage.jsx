import React, { useContext, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Form, Input, Radio, message } from 'antd'
import { CartContext } from '../../store/CartContext'

const { TextArea } = Input

const OrderConfirmPage = () => {
  const navigate = useNavigate()
  const { items, getTotalPrice, clearCart } = useContext(CartContext)
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  const total = getTotalPrice()
  const deliveryFee = total > 0 ? 9 : 0
  const finalTotal = total + deliveryFee

  const handleSubmit = () => {
    setLoading(true)
    // 模拟提交订单
    setTimeout(() => {
      setLoading(false)
      clearCart()
      message.success('订单提交成功！')
      navigate('/orders')
    }, 1000)
  }

  return (
    <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100%' }}>
      <h1 style={{ marginBottom: 24 }}>确认订单</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <Card>
          <h3>配送信息</h3>
          <Form form={form} layout="vertical">
            <Form.Item
              name="address"
              label="配送地址"
              rules={[{ required: true, message: '请输入配送地址' }]}
            >
              <TextArea rows={2} placeholder="请输入详细配送地址" />
            </Form.Item>
            <Form.Item
              name="contact"
              label="联系人"
              rules={[{ required: true, message: '请输入联系人' }]}
            >
              <Input placeholder="请输入联系人姓名" />
            </Form.Item>
            <Form.Item
              name="phone"
              label="联系电话"
              rules={[{ required: true, message: '请输入联系电话' }]}
            >
              <Input placeholder="请输入联系电话" />
            </Form.Item>
          </Form>
        </Card>
        <Card>
          <h3>订单明细</h3>
          <div style={{ marginBottom: 16 }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <span>
                  {item.name} x {item.quantity}
                </span>
                <span>¥{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div
            style={{
              borderTop: '1px solid #eee',
              paddingTop: 16,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>商品总额:</span>
              <span>¥{total.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>配送费:</span>
              <span>¥{deliveryFee.toFixed(2)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 18,
                fontWeight: 'bold',
                color: '#ff4d4f',
              }}
            >
              <span>应付总额:</span>
              <span>¥{finalTotal.toFixed(2)}</span>
            </div>
          </div>
          <Button
            type="primary"
            size="large"
            style={{ width: '100%' }}
            loading={loading}
            onClick={handleSubmit}
          >
            提交订单
          </Button>
        </Card>
      </div>
    </div>
  )
}

export default OrderConfirmPage
