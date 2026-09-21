/**
 * AdminDashboard - 运营后台主页面
 * ��含商家����、数据统计、系统��控等功能
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Layout, Card, Row, Col, Table, Button, Tag, Select, DatePicker, Space, Tabs, Statistic, Spin, message, Modal, Form, Input, NumberInput } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, SearchOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons'

const { Content } = Layout
const { RangePicker } = DatePicker
const { Option } = Select

const MERCHANT_STATUS = {
  pending: { text: '待����', color: 'orange' },
  approved: { text: '已通过', color: 'green' },
  rejected: { text: '已��绝', color: 'red' },
  suspended: { text: '已��停', color: 'volcano' }
}

const MERCHANT_TYPE = {
  restaurant: '����',
  retail: '零售',
  service: '服务',
  wholesale: '批发'
}

export const AdminDashboard = () => {
  const [merchants, setMerchants] = useState([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [filters, setFilters] = useState({ status: '', keyword: '', dateRange: [] })
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, revenue: 0 })
  const [modalVisible, setModalVisible] = useState(false)
  const [editingMerchant, setEditingMerchant] = useState(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailData, setDetailData] = useState(null)
  const [form] = Form.useForm()

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/dashboard/stats')
      const result = await response.json()
      if (response.ok) setStats(result.data)
    } catch (error) {
      console.error('获取统计数据失败:', error)
    }
  }, [])

  const fetchMerchants = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: pagination.current,
        pageSize: pagination.pageSize,
        ...filters
      })
      if (filters.dateRange && filters.dateRange.length === 2) {
        params.append('startDate', filters.dateRange[0].format('YYYY-MM-DD'))
        params.append('endDate', filters.dateRange[1].format('YYYY-MM-DD'))
      }
      if (filters.status) params.append('status', filters.status)
      if (filters.keyword) params.append('keyword', filters.keyword)

      const response = await fetch(`/api/admin/merchants?${params}`)
      const result = await response.json()
      if (response.ok) {
        setMerchants(result.data)
        setPagination(prev => ({ ...prev, total: result.total }))
      } else {
        message.error(result.error || '获取列表失败')
      }
    } catch (error) {
      console.error('获取商家列表失败:', error)
      message.error('获取列表失败')
    } finally {
      setLoading(false)
    }
  }, [pagination.current, pagination.pageSize, filters])

  useEffect(() => {
    fetchStats()
    fetchMerchants()
  }, [fetchStats, fetchMerchants])

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }))
    fetchMerchants()
  }

  const handleReset = () => {
    setFilters({ status: '', keyword: '', dateRange: [] })
    setPagination(prev => ({ ...prev, current: 1 }))
    fetchMerchants()
  }

  const handleTableChange = (pagination, filters, sorter) => {
    setPagination(prev => ({ ...prev, current: pagination.current, pageSize: pagination.pageSize }))
  }

  const handleApprove = async (id) => {
    try {
      const response = await fetch(`/api/admin/merchants/${id}/approve`, { method: 'POST' })
      const result = await response.json()
      if (response.ok) {
        message.success('����通过')
        fetchMerchants()
      } else {
        message.error(result.error || '操作失败')
      }
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleReject = async (id) => {
    Modal.confirm({
      title: '确认��绝',
      content: '确定要��绝该商家入��申请吗？',
      onOk: async () => {
        try {
          const response = await fetch(`/api/admin/merchants/${id}/reject`, { method: 'POST' })
          const result = await response.json()
          if (response.ok) {
            message.success('已��绝')
            fetchMerchants()
          } else {
            message.error(result.error || '操作失败')
          }
        } catch (error) {
          message.error('操作失败')
        }
      }
    })
  }

  const handleSuspend = async (id, suspend) => {
    try {
      const response = await fetch(`/api/admin/merchants/${id}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspended: suspend })
      })
      const result = await response.json()
      if (response.ok) {
        message.success(suspend ? '已��停' : '已��复')
        fetchMerchants()
      } else {
        message.error(result.error || '操作失败')
      }
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleViewDetail = async (merchant) => {
    setDetailData(merchant)
    setDetailVisible(true)
  }

  const handleEdit = (merchant) => {
    setEditingMerchant(merchant)
    form.setFieldsValue(merchant)
    setModalVisible(true)
  }

  const handleSave = async (values) => {
    try {
      const url = editingMerchant?.id ? `/api/admin/merchants/${editingMerchant.id}` : '/api/admin/merchants'
      const method = editingMerchant?.id ? 'PUT' : 'POST'
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      })
      const result = await response.json()
      if (response.ok) {
        message.success(editingMerchant?.id ? '更新成功' : '创建成功')
        setModalVisible(false)
        form.resetFields()
        fetchMerchants()
      } else {
        message.error(result.error || '操作失败')
      }
    } catch (error) {
      message.error('操作失败')
    }
  }

  const columns = [
    { title: '商家名称', dataIndex: 'name', key: 'name', width: 180 },
    { title: '联系人', dataIndex: 'contactName', key: 'contactName', width: 120 },
    { title: '联系电话', dataIndex: 'contactPhone', key: 'contactPhone', width: 130 },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type) => <Tag color="blue">{MERCHANT_TYPE[type] || type}</Tag>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const config = MERCHANT_STATUS[status] || { text: status, color: 'default' }
        return <Tag color={config.color}>{config.text}</Tag>
      }
    },
    { title: '注册时间', dataIndex: 'createdAt', key: 'createdAt', width: 160 },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => handleViewDetail(record)}>
            ��情
          </Button>
          {record.status === 'pending' && (
            <>
              <Button size="small" type="primary" onClick={() => handleApprove(record.id)}>
                <CheckOutlined /> 通过
              </Button>
              <Button size="small" danger onClick={() => handleReject(record.id)}>
                <CloseOutlined /> ��绝
              </Button>
            </>
          }
          {record.status === 'approved' && (
            <Button size="small" danger onClick={() => handleSuspend(record.id, true)}>
              ���停
            </Button>
          )}
          {record.status === 'suspended' && (
            <Button size="small" type="primary" onClick={() => handleSuspend(record.id, false)}>
              ���复
            </Button>
          )}
          <Button size="small" onClick={() => handleEdit(record)}>编辑</Button>
        </Space>
      )
    }
  ]

  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Content style={{ padding: 24 }}>
        {/* 统计卡片 */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="商家总数"
                value={stats.total || 0}
                prefix={<span style={{ color: '#1890ff' }}>����</span>}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="待����"
                value={stats.pending || 0}
                prefix={<span style={{ color: '#faad14' }}>���</span>}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="已通过"
                value={stats.approved || 0}
                prefix={<span style={{ color: '#52c41a' }}>���</span>}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="本月交易��"
                value={stats.revenue ? `��${(stats.revenue / 10000).toFixed(1)}万` : '��0'}
                prefix={<span style={{ color: '#722ed1' }}>����</span>}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>
        </Row>

        {/* ��选和表格 */}
        <Card>
          <Form form={form} layout="inline" onFinish={handleSearch} style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="keyword" label="关��词">
                  <Input placeholder="商家名称/联系人/电话" allowClear />
                </Form.Item>
              </Col>
              <Col span={5}>
                <Form.Item name="status" label="状态">
                  <Select allowClear placeholder="全部状态">
                    <Option value="pending">待����</Option>
                    <Option value="approved">已通过</Option>
                    <Option value="rejected">已��绝</Option>
                    <Option value="suspended">已��停</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={7}>
                <Form.Item name="dateRange" label="注册时间">
                  <RangePicker allowClear style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item>
                  <Space>
                    <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>���索</Button>
                    <Button onClick={handleReset} icon={<ReloadOutlined />}>重置</Button>
                  </Space>
                </Form.Item>
              </Col>
            </Row>
          </Form>

          <Table
            columns={columns}
            dataSource={merchants}
            loading={loading}
            pagination={false}
            onChange={handleTableChange}
            rowKey="id"
            bordered
          />
        </Card>

        {/* ��情���� */}
        <Modal
          title="商家��情"
          open={detailVisible}
          onCancel={() => setDetailVisible(false)}
          width={800}
        >
          {detailData && (
            <div style={{ padding: 16 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <strong>商家名称:</strong> {detailData.name}
                </Col>
                <Col span={12}>
                  <strong>商家类型:</strong> {MERCHANT_TYPE[detailData.type] || detailData.type}
                </Col>
                <Col span={12}>
                  <strong>联系人:</strong> {detailData.contactName}
                </Col>
                <Col span={12}>
                  <strong>联系电话:</strong> {detailData.contactPhone}
                </Col>
                <Col span={12}>
                  <strong>����:</strong> {detailData.email || '-'}
                </Col>
                <Col span={12}>
                  <strong>地��:</strong> {detailData.address || '-'}
                </Col>
                <Col span={12}>
                  <strong>营业��照:</strong> {detailData.licenseNumber || '-'}
                </Col>
                <Col span={12}>
                  <strong>状态:</strong> <Tag color={MERCHANT_STATUS[detailData.status]?.color}>{MERCHANT_STATUS[detailData.status]?.text}</Tag>
                </Col>
                <Col span={24}>
                  <strong>����地��:</strong> {detailData.detailAddress || '-'}
                </Col>
                <Col span={24}>
                  <strong>经营范��:</strong> {detailData.businessScope || '-'}
                </Col>
              </Row>
            </div>
          )}
        </Modal>

        {/* 编辑/新建���� */}
        <Modal
          title={editingMerchant ? '编辑商家' : '新建商家'}
          open={modalVisible}
          onOk={() => form.validateFields().then(handleSave)}
          onCancel={() => { setModalVisible(false); form.resetFields(); setEditingMerchant(null); }}
          width={600}
        >
          <Form form={form} layout="vertical">
            <Form.Item name="name" label="商家名称" rules={[{ required: true, message: '请输入商家名称' }]}>
              <Input placeholder="请输入商家名称" />
            </Form.Item>
            <Form.Item name="type" label="商家类型" rules={[{ required: true, message: '请选择商家类型' }]}>
              <Select placeholder="请选择商家类型">
                {Object.entries(MERCHANT_TYPE).map(([key, value]) => (
                  <Option key={key} value={key}>{value}</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="contactName" label="联系人" rules={[{ required: true, message: '请输入联系人' }]}>
              <Input placeholder="请输入联系人��名" />
            </Form.Item>
            <Form.Item name="contactPhone" label="联系电话" rules={[{ required: true, message: '请输入联系电话' }]}>
              <Input placeholder="请输入联系电话" />
            </Form.Item>
            <Form.Item name="email" label="����">
              <Input placeholder="请输入����" />
            </Form.Item>
            <Form.Item name="address" label="����地��" rules={[{ required: true, message: '请输入����地��' }]}>
              <Input.TextArea rows={2} placeholder="请输入����地��" />
            </Form.Item>
            <Form.Item name="licenseNumber" label="营业��照号" rules={[{ required: true, message: '请输入营业��照号' }]}>
              <Input placeholder="请输入营业��照号" />
            </Form.Item>
            <Form.Item name="businessScope" label="经营范��">
              <Input.TextArea rows={2} placeholder="请输入经营范��" />
            </Form.Item>
          </Form>
        </Modal>
      </Content>
    </Layout>
  )
}

export default AdminDashboard