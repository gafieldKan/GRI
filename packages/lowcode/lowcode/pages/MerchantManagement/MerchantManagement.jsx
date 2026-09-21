/**
 * MerchantManagement - ��家管理页面
 * ��家信息维��、资质����、结算管理、合同管理等
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Layout, Card, Row, Col, Table, Button, Tag, Select, DatePicker, Space, Tabs, Form, Input, Modal, message, Divider, Descriptions, Alert } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, DownloadOutlined, EyeOutlined, FileTextOutlined, BankOutlined, SafetyOutlined, IdcardOutlined } from '@ant-design/icons'

const { Content } = Layout
const { RangePicker } = DatePicker
const { Option } = Select
const { TextArea } = Input

const MERCHANT_STATUS = {
  pending: { text: '待����', color: 'orange' },
  approved: { text: '已通过', color: 'green' },
  rejected: { text: '已��绝', color: 'red' },
  suspended: { text: '已��停', color: 'volcano' },
  expired: { text: '已过期', color: 'grey' }
}

const SETTLEMENT_STATUS = {
  pending: { text: '待结算', color: 'orange' },
  processing: { text: '处理中', color: 'blue' },
  completed: { text: '已完成', color: 'green' },
  failed: { text: '失败', color: 'red' }
}

const CONTRACT_STATUS = {
  draft: { text: '草��', color: 'grey' },
  pending_sign: { text: '待��署', color: 'orange' },
  signed: { text: '已��署', color: 'green' },
  expired: { text: '已过期', color: 'red' },
  terminated: { text: '已终止', color: 'red' }
}

export const MerchantManagement = () => {
  const [activeTab, setActiveTab] = useState('info')
  const [merchants, setMerchants] = useState([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [filters, setFilters] = useState({ status: '', keyword: '', dateRange: [] })
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailData, setDetailData] = useState(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingMerchant, setEditingMerchant] = useState(null)
  const [form] = Form.useForm()
  const [settlements, setSettlements] = useState([])
  const [settlementPagination, setSettlementPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [contracts, setContracts] = useState([])
  const [contractPagination, setContractPagination] = useState({ current: 1, pageSize: 10, total: 0 })

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
    fetchMerchants()
  }, [fetchMerchants])

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }))
    // fetchMerchants called via useEffect
  }

  const handleReset = () => {
    setFilters({ status: '', keyword: '', dateRange: [] })
    setPagination(prev => ({ ...prev, current: 1 }))
  }

  const handleTableChange = (pagination) => {
    setPagination(prev => ({ ...prev, current: pagination.current, pageSize: pagination.pageSize }))
  }

  // 信息维�� Tab
  const InfoTab = () => {
    const handleViewDetail = (merchant) => {
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
      { title: '类型', dataIndex: 'type', key: 'type', width: 100, render: (type) => <Tag color="blue">{type}</Tag> },
      { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (status) => {
        const config = { pending: { text: '待����', color: 'orange' }, approved: { text: '已通过', color: 'green' }, rejected: { text: '已��绝', color: 'red' }, suspended: { text: '已��停', color: 'volcano' }, expired: { text: '已过期', color: 'grey' } }
        const c = config[status] || { text: status, color: 'default' }
        return <Tag color={c.color}>{c.text}</Tag>
      }},
      { title: '注册时间', dataIndex: 'createdAt', key: 'createdAt', width: 160 },
      {
        title: '操作',
        key: 'action',
        width: 200,
        fixed: 'right',
        render: (_, record) => (
          <Space>
            <Button size="small" onClick={() => handleViewDetail(record)} icon={<EyeOutlined />}>��情</Button>
            <Button size="small" onClick={() => handleEdit(record)} icon={<EditOutlined />}>编辑</Button>
            <Button size="small" danger onClick={() => message.info('删除功能开发中')} icon={<DeleteOutlined />}>删除</Button>
          </Space>
        )
      }
    ]

    return (
      <div>
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
      </div>
    )
  }

  // 资质���� Tab
  const QualificationTab = () => {
    const [qualificationVisible, setQualificationVisible] = useState(false)
    const [qualificationData, setQualificationData] = useState(null)

    const handleViewQualification = (merchant) => {
      setQualificationData(merchant)
      setQualificationVisible(true)
    }

    const handleApprove = async (id, type) => {
      try {
        const response = await fetch(`/api/admin/merchants/${id}/qualification/${type}/approve`, { method: 'POST' })
        const result = await response.json()
        if (response.ok) {
          message.success('����通过')
        } else {
          message.error(result.error || '操作失败')
        }
      } catch (error) {
        message.error('操作失败')
      }
    }

    const handleReject = async (id, type) => {
      Modal.confirm({
        title: '确认��绝',
        content: '确定要��绝该资质����吗？',
        onOk: async () => {
          try {
            const response = await fetch(`/api/admin/merchants/${id}/qualification/${type}/reject`, { method: 'POST' })
            const result = await response.json()
            if (response.ok) {
              message.success('已��绝')
            } else {
              message.error(result.error || '操作失败')
            }
          } catch (error) {
            message.error('操作失败')
          }
        }
      })
    }

    const qualificationColumns = [
      { title: '商家名称', dataIndex: 'name', key: 'name', width: 150 },
      { title: '营业��照', dataIndex: 'licenseStatus', key: 'licenseStatus', width: 100, render: (status) => <Tag color={status === 'approved' ? 'green' : status === 'pending' ? 'orange' : 'red'}>{status === 'approved' ? '已通过' : status === 'pending' ? '待����' : '已��绝'}</Tag> },
      { title: '法人身份证', dataIndex: 'idCardStatus', key: 'idCardStatus', width: 100, render: (status) => <Tag color={status === 'approved' ? 'green' : status === 'pending' ? 'orange' : 'red'}>{status === 'approved' ? '已通过' : status === 'pending' ? '待����' : '已��绝'}</Tag> },
      { title: '银行开户许可', dataIndex: 'bankStatus', key: 'bankStatus', width: 100, render: (status) => <Tag color={status === 'approved' ? 'green' : status === 'pending' ? 'orange' : 'red'}>{status === 'approved' ? '已通过' : status === 'pending' ? '待����' : '已��绝'}</Tag> },
      { title: '食品经营许可', dataIndex: 'foodLicenseStatus', key: 'foodLicenseStatus', width: 100, render: (status) => <Tag color={status === 'approved' ? 'green' : status === 'pending' ? 'orange' : 'red'}>{status === 'approved' ? '已通过' : status === 'pending' ? '待����' : '已��绝'}</Tag> },
      { title: '状态', dataIndex: 'overallStatus', key: 'overallStatus', width: 100, render: (status) => <Tag color={status === 'approved' ? 'green' : status === 'pending' ? 'orange' : 'red'}>{status === 'approved' ? '全部通过' : status === 'pending' ? '����中' : '有��绝项'}</Tag> },
      { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 160 },
      {
        title: '操作',
        key: 'action',
        width: 200,
        render: (_, record) => (
          <Space direction="vertical">
            <Button size="small" onClick={() => message.info('查看资质��情开发中')}>查看��情</Button>
            {record.licenseStatus === 'pending' && (
              <>
                <Button size="small" type="primary" onClick={() => handleApprove(record.id, 'license')}>������照</Button>
                <Button size="small" danger onClick={() => handleReject(record.id, 'license')}>��绝��照</Button>
              </>
            )}
            {record.idCardStatus === 'pending' && (
              <>
                <Button size="small" type="primary" onClick={() => handleApprove(record.id, 'idcard')}>����身份证</Button>
                <Button size="small" danger onClick={() => handleReject(record.id, 'idcard')}>��绝身份证</Button>
              </>
            )}
          </Space>
        )
      }
    ]

    return (
      <div>
        <Table
          columns={qualificationColumns}
          dataSource={merchants.filter(m => m.overallStatus !== 'approved' || m.licenseStatus === 'pending')}
          loading={loading}
          pagination={false}
          rowKey="id"
          bordered
        />
      </div>
    )
  }

  // 结算管理 Tab
  const SettlementTab = () => {
    const [settlements, setSettlements] = useState([])
    const [settlementLoading, setSettlementLoading] = useState(false)
    const [settlementPagination, setSettlementPagination] = useState({ current: 1, pageSize: 10, total: 0 })
    const [settlementFilters, setSettlementFilters] = useState({ status: '', dateRange: [] })
    const [detailVisible, setDetailVisible] = useState(false)
    const [detailData, setDetailData] = useState(null)

    const fetchSettlements = useCallback(async () => {
      setSettlementLoading(true)
      try {
        const params = new URLSearchParams({
          page: settlementPagination.current,
          pageSize: settlementPagination.pageSize,
          ...settlementFilters
        })
        if (settlementFilters.dateRange && settlementFilters.dateRange.length === 2) {
          params.append('startDate', settlementFilters.dateRange[0].format('YYYY-MM-DD'))
          params.append('endDate', settlementFilters.dateRange[1].format('YYYY-MM-DD'))
        }
        if (settlementFilters.status) params.append('status', settlementFilters.status)

        const response = await fetch(`/api/admin/settlements?${params}`)
        const result = await response.json()
        if (response.ok) {
          setSettlements(result.data)
          setSettlementPagination(prev => ({ ...prev, total: result.total }))
        }
      } catch (error) {
        console.error('获取结算列表失败:', error)
      } finally {
        setSettlementLoading(false)
      }
    }, [settlementPagination.current, settlementPagination.pageSize, settlementFilters])

    useEffect(() => {
      fetchSettlements()
    }, [fetchSettlements])

    const handleSettlementSearch = () => {
      setSettlementPagination(prev => ({ ...prev, current: 1 }))
      fetchSettlements()
    }

    const handleSettlementReset = () => {
      setSettlementFilters({ status: '', dateRange: [] })
      setSettlementPagination(prev => ({ ...prev, current: 1 }))
      fetchSettlements()
    }

    const handleTableChange = (pagination) => {
      setSettlementPagination(prev => ({ ...prev, current: pagination.current, pageSize: pagination.pageSize }))
    }

    const handleViewDetail = (settlement) => {
      setDetailData(settlement)
      setDetailVisible(true)
    }

    const handleProcessSettlement = async (id) => {
      try {
        const response = await fetch(`/api/admin/settlements/${id}/process`, { method: 'POST' })
        const result = await response.json()
        if (response.ok) {
          message.success('处理成功')
          fetchSettlements()
        } else {
          message.error(result.error || '操作失败')
        }
      } catch (error) {
        message.error('操作失败')
      }
    }

    const settlementColumns = [
      { title: '结算单号', dataIndex: 'settlementNo', key: 'settlementNo', width: 180 },
      { title: '商家名称', dataIndex: 'merchantName', key: 'merchantName', width: 150 },
      { title: '结算周期', dataIndex: 'period', key: 'period', width: 120 },
      { title: '交易金��', dataIndex: 'totalAmount', key: 'totalAmount', width: 120, render: (v) => `��${(v / 100).toFixed(2)}` },
      { title: '手续费', dataIndex: 'fee', key: 'fee', width: 100, render: (v) => `��${(v / 100).toFixed(2)}` },
      { title: '实结金��', dataIndex: 'netAmount', key: 'netAmount', width: 120, render: (v) => `��${(v / 100).toFixed(2)}` },
      { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (status) => {
        const config = { pending: { text: '待结算', color: 'orange' }, processing: { text: '处理中', color: 'blue' }, completed: { text: '已完成', color: 'green' }, failed: { text: '失败', color: 'red' } }
        const c = config[status] || { text: status, color: 'default' }
        return <Tag color={c.color}>{c.text}</Tag>
      }},
      { title: '发起时间', dataIndex: 'createdAt', key: 'createdAt', width: 160 },
      { title: '完成时间', dataIndex: 'completedAt', key: 'completedAt', width: 160 },
      {
        title: '操作',
        key: 'action',
        width: 150,
        render: (_, record) => (
          <Space direction="vertical">
            <Button size="small" onClick={() => handleViewDetail(record)}>��情</Button>
            {record.status === 'pending' && (
              <Button size="small" type="primary" onClick={() => handleProcessSettlement(record.id)}>处理结算</Button>
            )}
          </Space>
        )
      }
    ]

    return (
      <div>
        <Card style={{ marginBottom: 16 }}>
          <Form layout="inline" onFinish={handleSettlementSearch} style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={5}>
                <Form.Item name="status" label="状态">
                  <Select allowClear placeholder="全部状态">
                    <Option value="pending">待结算</Option>
                    <Option value="processing">处理中</Option>
                    <Option value="completed">已完成</Option>
                    <Option value="failed">失败</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={7}>
                <Form.Item name="dateRange" label="结算时间">
                  <RangePicker allowClear style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item>
                  <Space>
                    <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>���索</Button>
                    <Button onClick={handleSettlementReset} icon={<ReloadOutlined />}>重置</Button>
                  </Space>
                </Form.Item>
              </Col>
            </Row>
          </Form>

          <Table
            columns={settlementColumns}
            dataSource={settlements}
            loading={settlementLoading}
            pagination={false}
            onChange={handleTableChange}
            rowKey="id"
            bordered
          />
        </Card>
      </div>
    )
  }

  // 合同管理 Tab
  const ContractTab = () => {
    const [contracts, setContracts] = useState([])
    const [contractLoading, setContractLoading] = useState(false)
    const [contractPagination, setContractPagination] = useState({ current: 1, pageSize: 10, total: 0 })
    const [contractFilters, setContractFilters] = useState({ status: '', dateRange: [] })
    const [contractDetailVisible, setContractDetailVisible] = useState(false)
    const [contractDetailData, setContractDetailData] = useState(null)
    const [contractModalVisible, setContractModalVisible] = useState(false)
    const [editingContract, setEditingContract] = useState(null)
    const [contractForm] = Form.useForm()

    const fetchContracts = useCallback(async () => {
      setContractLoading(true)
      try {
        const params = new URLSearchParams({
          page: contractPagination.current,
          pageSize: contractPagination.pageSize,
          ...contractFilters
        })
        if (contractFilters.dateRange && contractFilters.dateRange.length === 2) {
          params.append('startDate', contractFilters.dateRange[0].format('YYYY-MM-DD'))
          params.append('endDate', contractFilters.dateRange[1].format('YYYY-MM-DD'))
        }
        if (contractFilters.status) params.append('status', contractFilters.status)

        const response = await fetch(`/api/admin/contracts?${params}`)
        const result = await response.json()
        if (response.ok) {
          setContracts(result.data)
          setContractPagination(prev => ({ ...prev, total: result.total }))
        }
      } catch (error) {
        console.error('获取合同列表失败:', error)
      } finally {
        setContractLoading(false)
      }
    }, [contractPagination.current, contractPagination.pageSize, contractFilters])

    useEffect(() => {
      fetchContracts()
    }, [fetchContracts])

    const handleContractSearch = () => {
      setContractPagination(prev => ({ ...prev, current: 1 }))
      fetchContracts()
    }

    const handleContractReset = () => {
      setContractFilters({ status: '', dateRange: [] })
      setContractPagination(prev => ({ ...prev, current: 1 }))
      fetchContracts()
    }

    const handleContractTableChange = (pagination) => {
      setContractPagination(prev => ({ ...prev, current: pagination.current, pageSize: pagination.pageSize }))
    }

    const handleViewContract = (contract) => {
      setContractDetailData(contract)
      setContractDetailVisible(true)
    }

    const handleCreateContract = () => {
      setEditingContract(null)
      contractForm.resetFields()
      setContractModalVisible(true)
    }

    const handleEditContract = (contract) => {
      setEditingContract(contract)
      contractForm.setFieldsValue(contract)
      setContractModalVisible(true)
    }

    const handleSaveContract = async (values) => {
      try {
        const url = editingContract?.id ? `/api/admin/contracts/${editingContract.id}` : '/api/admin/contracts'
        const method = editingContract?.id ? 'PUT' : 'POST'
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values)
        })
        const result = await response.json()
        if (response.ok) {
          message.success(editingContract?.id ? '更新成功' : '创建成功')
          setContractModalVisible(false)
          contractForm.resetFields()
          fetchContracts()
        } else {
          message.error(result.error || '操作失败')
        }
      } catch (error) {
        message.error('操作失败')
      }
    }

    const handleSendToSign = async (id) => {
      try {
        const response = await fetch(`/api/admin/contracts/${id}/send-to-sign`, { method: 'POST' })
        const result = await response.json()
        if (response.ok) {
          message.success('已发送��署��请')
          fetchContracts()
        } else {
          message.error(result.error || '操作失败')
        }
      } catch (error) {
        message.error('操作失败')
      }
    }

    const contractColumns = [
      { title: '合同编号', dataIndex: 'contractNo', key: 'contractNo', width: 150 },
      { title: '商家名称', dataIndex: 'merchantName', key: 'merchantName', width: 150 },
      { title: '合同类型', dataIndex: 'type', key: 'type', width: 100 },
      { title: '��署方', dataIndex: 'signerName', key: 'signerName', width: 120 },
      { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (status) => {
        const config = { draft: { text: '草��', color: 'grey' }, pending_sign: { text: '待��署', color: 'orange' }, signed: { text: '已��署', color: 'green' }, expired: { text: '已过期', color: 'red' }, terminated: { text: '已终止', color: 'red' } }
        const c = config[status] || { text: status, color: 'default' }
        return <Tag color={c.color}>{c.text}</Tag>
      }},
      { title: '生效日期', dataIndex: 'effectiveDate', key: 'effectiveDate', width: 120 },
      { title: '到期日期', dataIndex: 'expireDate', key: 'expireDate', width: 120 },
      { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 160 },
      {
        title: '操作',
        key: 'action',
        width: 200,
        render: (_, record) => (
          <Space direction="vertical">
            <Button size="small" onClick={() => handleViewContract(record)}>��情</Button>
            <Button size="small" onClick={() => handleEditContract(record)}>编辑</Button>
            {record.status === 'draft' && (
              <Button size="small" type="primary" onClick={() => handleSendToSign(record.id)}>发送��署</Button>
            )}
            {record.status === 'pending_sign' && (
              <Button size="small" type="primary" onClick={() => handleSendToSign(record.id)}>重新发送</Button>
            )}
          </Space>
        )
      }
    ]

    return (
      <div>
        <Card style={{ marginBottom: 16 }}>
          <Space style={{ marginBottom: 16 }}>
            <Button type="primary" onClick={handleCreateContract} icon={<PlusOutlined />}>新建合同</Button>
            <Form layout="inline" onFinish={handleContractSearch} style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={5}>
                  <Form.Item name="status" label="状态">
                    <Select allowClear placeholder="全部状态">
                      <Option value="draft">草��</Option>
                      <Option value="pending_sign">待��署</Option>
                      <Option value="signed">已��署</Option>
                      <Option value="expired">已过期</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={7}>
                  <Form.Item name="dateRange" label="创建时间">
                    <RangePicker allowClear style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item>
                    <Space>
                      <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>���索</Button>
                      <Button onClick={handleContractReset} icon={<ReloadOutlined />}>重置</Button>
                    </Space>
                  </Form.Item>
                </Col>
              </Row>
            </Form>

            <Table
              columns={contractColumns}
              dataSource={contracts}
              loading={contractLoading}
              pagination={false}
              onChange={handleContractTableChange}
              rowKey="id"
              bordered
            />
          </Form>
        </Card>

        {/* 合同��情���� */}
        <Modal
          title="合同��情"
          open={contractDetailVisible}
          onCancel={() => setContractDetailVisible(false)}
          width={800}
        >
          {contractDetailData && (
            <Descriptions column={2} title="合同��情">
              <Descriptions.Item label="合同编号">{contractDetailData.contractNo}</Descriptions.Item>
              <Descriptions.Item label="商家名称">{contractDetailData.merchantName}</Descriptions.Item>
              <Descriptions.Item label="合同类型">{contractDetailData.type}</Descriptions.Item>
              <Descriptions.Item label="��署方">{contractDetailData.signerName}</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={CONTRACT_STATUS[contractDetailData.status]?.color}>{CONTRACT_STATUS[contractDetailData.status]?.text}</Tag></Descriptions.Item>
              <Descriptions.Item label="生效日期">{contractDetailData.effectiveDate}</Descriptions.Item>
              <Descriptions.Item label="到期日期">{contractDetailData.expireDate}</Descriptions.Item>
              <Descriptions.Item label="合同金��">��{(contractDetailData.amount / 100).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="结算周期">{contractDetailData.settlementCycle}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{contractDetailData.createdAt}</Descriptions.Item>
            </Descriptions>
          )}
        </Modal>

        {/* 合同编辑/新建���� */}
        <Modal
          title={editingContract ? '编辑合同' : '新建合同'}
          open={contractModalVisible}
          onOk={() => contractForm.validateFields().then(handleSaveContract)}
          onCancel={() => { setContractModalVisible(false); contractForm.resetFields(); setEditingContract(null); }}
          width={600}
        >
          <Form form={contractForm} layout="vertical">
            <Form.Item name="contractNo" label="合同编号" rules={[{ required: true, message: '请输入合同编号' }]}>
              <Input placeholder="请输入合同编号" />
            </Form.Item>
            <Form.Item name="merchantId" label="商家" rules={[{ required: true, message: '请选择商家' }]}>
              <Select placeholder="请选择商家" allowClear>
                {merchants.map(m => <Option key={m.id} value={m.id}>{m.name}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="type" label="合同类型" rules={[{ required: true, message: '请选择合同类型' }]}>
              <Select placeholder="请选择合同类型">
                <Option value="service">服务��议</Option>
                <Option value="cooperation">合作��议</Option>
                <Option value="settlement">结算��议</Option>
              </Select>
            </Form.Item>
            <Form.Item name="amount" label="合同金��(分)" rules={[{ required: true, message: '请输入合同金��' }]}>
              <NumberInput placeholder="请输入合同金��(分)" />
            </Form.Item>
            <Form.Item name="settlementCycle" label="结算周期" rules={[{ required: true, message: '请选择结算周期' }]}>
              <Select placeholder="请选择结算周期">
                <Option value="daily">日结</Option>
                <Option value="weekly">周结</Option>
                <Option value="monthly">月结</Option>
              </Select>
            </Form.Item>
            <Form.Item name="effectiveDate" label="生效日期" rules={[{ required: true, message: '请选择生效日期' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="expireDate" label="到期日期" rules={[{ required: true, message: '请选择到期日期' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="content" label="合同内容">
              <TextArea rows={4} placeholder="请输入合同内容" />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    )
  }

  const tabs = [
    { key: 'info', tab: '信息维��', component: InfoTab },
    { key: 'qualification', tab: '资质����', component: QualificationTab },
    { key: 'settlement', tab: '结算管理', component: SettlementTab },
    { key: 'contract', tab: '合同管理', component: ContractTab },
  ]

  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Content style={{ padding: 24 }}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col>
            <h2>商家管理</h2>
          </Col>
        </Row>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          type="card"
        >
          {tabs.map(tab => (
            <Tabs.TabPane key={tab.key} tab={tab.tab}>
              <tab.component />
            </Tabs.TabPane>
          ))}
        </Tabs>

        {/* ��家��情���� */}
        <Modal
          title="商家��情"
          open={detailVisible}
          onCancel={() => setDetailVisible(false)}
          width={800}
        >
          {detailData && (
            <Descriptions column={2} title="商家��情">
              <Descriptions.Item label="商家名称">{detailData.name}</Descriptions.Item>
              <Descriptions.Item label="商家类型">{detailData.type}</Descriptions.Item>
              <Descriptions.Item label="联系人">{detailData.contactName}</Descriptions.Item>
              <Descriptions.Item label="联系电话">{detailData.contactPhone}</Descriptions.Item>
              <Descriptions.Item label="����">{detailData.email}</Descriptions.Item>
              <Descriptions.Item label="地��">{detailData.address}</Descriptions.Item>
              <Descriptions.Item label="营业��照号">{detailData.licenseNumber}</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={MERCHANT_STATUS[detailData.status]?.color}>{MERCHANT_STATUS[detailData.status]?.text}</Tag></Descriptions.Item>
              <Descriptions.Item label="����地��">{detailData.detailAddress}</Descriptions.Item>
              <Descriptions.Item label="经营范��">{detailData.businessScope}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{detailData.createdAt}</Descriptions.Item>
            </Descriptions>
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
                <Option value="restaurant">����</Option>
                <Option value="retail">零售</Option>
                <Option value="service">服务</Option>
                <Option value="wholesale">批发</Option>
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
            <Form.Item name="address" label="地��" rules={[{ required: true, message: '请输入地��' }]}>
              <Input.TextArea rows={2} placeholder="请输入地��" />
            </Form.Item>
            <Form.Item name="licenseNumber" label="营业��照号" rules={[{ required: true, message: '请输入营业��照号' }]}>
              <Input placeholder="请输入营业��照号" />
            </Form.Item>
            <Form.Item name="businessScope" label="经营范��">
              <Input.TextArea rows={2} placeholder="请输入经营范��" />
            </Form.Item>
          </Form>
        </Modal>

        {/* 结算��情���� */}
        <Modal
          title="结算��情"
          open={detailVisible}
          onCancel={() => setDetailVisible(false)}
          width={800}
        >
          {detailData && detailData.settlementNo && (
            <Descriptions column={2} title="结算��情">
              <Descriptions.Item label="结算单号">{detailData.settlementNo}</Descriptions.Item>
              <Descriptions.Item label="商家名称">{detailData.merchantName}</Descriptions.Item>
              <Descriptions.Item label="结算周期">{detailData.period}</Descriptions.Item>
              <Descriptions.Item label="交易金��">��{(detailData.totalAmount / 100).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="手续费">��{(detailData.fee / 100).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="实结金��">��{(detailData.netAmount / 100).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={SETTLEMENT_STATUS[detailData.status]?.color}>{SETTLEMENT_STATUS[detailData.status]?.text}</Tag></Descriptions.Item>
              <Descriptions.Item label="发起时间">{detailData.createdAt}</Descriptions.Item>
              <Descriptions.Item label="完成时间">{detailData.completedAt || '-'}</Descriptions.Item>
            </Descriptions>
          )}
        </Modal>
      </Content>
    </Layout>
  )
}

export default MerchantManagement