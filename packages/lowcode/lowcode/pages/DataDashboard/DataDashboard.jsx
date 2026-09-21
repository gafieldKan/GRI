/**
 * DataDashboard - ��据大��页面
 * 业务数据可视化、��售����、用户画像、商品分��等
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Layout, Card, Row, Col, Select, DatePicker, Space, Tabs, Spin, message, Card as AntCard, Grid } from 'antd'
import { Line, Bar, Pie, Radar, Gauge, Funnel } from '@ant-design/charts'
import { ReloadOutlined, DownloadOutlined, FilterOutlined } from '@ant-design/icons'

import moment from "moment"
const { Content } = Layout
const { RangePicker } = DatePicker
const { Option } = Select

export const DataDashboard = () => {
  const [dateRange, setDateRange] = useState([null, null])
  const [granularity, setGranularity] = useState('day')
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [salesTrend, setSalesTrend] = useState([])
  const [categoryData, setCategoryData] = useState([])
  const [userPortrait, setUserPortrait] = useState(null)
  const [topProducts, setTopProducts] = useState([])
  const [funnelData, setFunnelData] = useState([])
  const [activeTab, setActiveTab] = useState('overview')

  const fetchOverview = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (dateRange[0]) params.append('startDate', dateRange[0].format('YYYY-MM-DD'))
      if (dateRange[1]) params.append('endDate', dateRange[1].format('YYYY-MM-DD'))
      params.append('granularity', granularity)

      const response = await fetch(`/api/admin/dashboard/overview?${params}`)
      const result = await response.json()
      if (response.ok) setOverview(result.data)
    } catch (error) {
      console.error('获取概��数据失败:', error)
    }
  }, [dateRange, granularity])

  const fetchSalesTrend = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (dateRange[0]) params.append('startDate', dateRange[0].format('YYYY-MM-DD'))
      if (dateRange[1]) params.append('endDate', dateRange[1].format('YYYY-MM-DD'))
      params.append('granularity', granularity)

      const response = await fetch(`/api/admin/dashboard/sales-trend?${params}`)
      const result = await response.json()
      if (response.ok) setSalesTrend(result.data)
    } catch (error) {
      console.error('获取��售����失败:', error)
    }
  }, [dateRange, granularity])

  const fetchCategoryData = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (dateRange[0]) params.append('startDate', dateRange[0].format('YYYY-MM-DD'))
      if (dateRange[1]) params.append('endDate', dateRange[1].format('YYYY-MM-DD'))

      const response = await fetch(`/api/admin/dashboard/category?${params}`)
      const result = await response.json()
      if (response.ok) setCategoryData(result.data)
    } catch (error) {
      console.error('获取品类数据失败:', error)
    }
  }, [dateRange])

  const fetchUserPortrait = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (dateRange[0]) params.append('startDate', dateRange[0].format('YYYY-MM-DD'))
      if (dateRange[1]) params.append('endDate', dateRange[1].format('YYYY-MM-DD'))

      const response = await fetch(`/api/admin/dashboard/user-portrait?${params}`)
      const result = await response.json()
      if (response.ok) setUserPortrait(result.data)
    } catch (error) {
      console.error('获取用户画像失败:', error)
    }
  }, [dateRange])

  const fetchTopProducts = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (dateRange[0]) params.append('startDate', dateRange[0].format('YYYY-MM-DD'))
      if (dateRange[1]) params.append('endDate', dateRange[1].format('YYYY-MM-DD'))

      const response = await fetch(`/api/admin/dashboard/top-products?${params}`)
      const result = await response.json()
      if (response.ok) setTopProducts(result.data)
    } catch (error) {
      console.error('获取热��商品失败:', error)
    }
  }, [dateRange])

  const fetchFunnelData = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (dateRange[0]) params.append('startDate', dateRange[0].format('YYYY-MM-DD'))
      if (dateRange[1]) params.append('endDate', dateRange[1].format('YYYY-MM-DD'))

      const response = await fetch(`/api/admin/dashboard/funnel?${params}`)
      const result = await response.json()
      if (response.ok) setFunnelData(result.data)
    } catch (error) {
      console.error('获取��斗数据失败:', error)
    }
  }, [dateRange])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchOverview(),
        fetchSalesTrend(),
        fetchCategoryData(),
        fetchUserPortrait(),
        fetchTopProducts(),
        fetchFunnelData()
      ])
    } catch (error) {
      console.error('获取数据失败:', error)
      message.error('获取数据失败')
    } finally {
      setLoading(false)
    }
  }, [fetchOverview, fetchSalesTrend, fetchCategoryData, fetchUserPortrait, fetchTopProducts, fetchFunnelData])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleDateChange = (dates) => {
    setDateRange(dates)
  }

  const handleGranularityChange = (value) => {
    setGranularity(value)
  }

  const OverviewTab = () => (
    <>
      {overview && (
        <>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Card>
                <Statistic
                  title="总GMV"
                  value={overview.gmv ? `��${(overview.gmv / 10000).toFixed(1)}万` : '��0'}
                  valueStyle={{ color: '#1890ff', fontSize: 28 }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="��单量"
                  value={overview.orderCount || 0}
                  valueStyle={{ color: '#52c41a', fontSize: 28 }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="客单价"
                  value={overview.avgOrderValue ? `��${overview.avgOrderValue.toFixed(0)}` : '��0'}
                  valueStyle={{ color: '#722ed1', fontSize: 28 }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="复��率"
                  value={overview.repurchaseRate ? `${(overview.repurchaseRate * 100).toFixed(1)}%` : '0%'}
                  valueStyle={{ color: '#faad14', fontSize: 28 }}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={12}>
              <Card title="��售����" style={{ height: 400 }}>
                <Line
                  data={salesTrend}
                  xField="date"
                  yField="amount"
                  smooth={true}
                  lineStyle={{ stroke: '#1890ff', lineWidth: 2 }}
                  point={{ size: 4, shape: 'circle' }}
                  xAxis={{ label: { formatter: (v) => v } }}
                  yAxis={{ label: { formatter: (v) => `��${(v / 10000).toFixed(1)}万` } }}
                  tooltip={{ formatter: (v) => `��${(v / 10000).toFixed(1)}万` }}
                  height={350}
                  loading={loading}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card title="品类分布" style={{ height: 400 }}>
                <Pie
                  data={categoryData}
                  angleField="value"
                  colorField="category"
                  radius={0.8}
                  innerRadius={0.4}
                  label={{
                    type: 'inner',
                    formatter: (d) => `${d.category}: ${d.percent * 100}%`
                  }}
                  statistic={{
                    title: false,
                    content: {
                      style: { whiteSpace: 'pre-wrap', fontSize: 14 }
                    }
                  }}
                  height={350}
                  loading={loading}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Card title="热��商品 TOP 10" style={{ height: 400 }}>
                <Bar
                  data={topProducts}
                  xField="sales"
                  yField="name"
                  layout="horizontal"
                  barStyle={{ fill: '#1890ff', opacity: 0.8 }}
                  label={{ position: 'right', formatter: (v) => `${v}单` }}
                  xAxis={{ label: { formatter: (v) => `${v}单` } }}
                  yAxis={{ label: { autoRotate: false } }}
                  height={350}
                  loading={loading}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card title="用户画像雷达图" style={{ height: 400 }}>
                {userPortrait && (
                  <Radar
                    data={[
                      { name: '活��度', value: userPortrait.activity },
                      { name: '客单价', value: userPortrait.avgOrderValue / 100 },
                      { name: '复��率', value: userPortrait.repurchaseRate * 100 },
                      { name: '客单数', value: userPortrait.orderCount / 10 },
                      { name: '����深度', value: userPortrait.browseDepth },
                      { name: '转化率', value: userPortrait.conversionRate * 100 }
                    ]}
                    xField="name"
                    yField="value"
                    seriesField="name"
                    radius={0.8}
                    line={{ style: { lineWidth: 2 } }}
                    area={{ style: { opacity: 0.1 } }}
                    height={350}
                    loading={loading}
                  />
                )}
              </Card>
            </Col>
          </Row>
        </>
      )
  )

  const SalesTab = () => (
    <Card style={{ height: 'calc(100vh - 200px)' }}>
      <Space style={{ marginBottom: 16 }}>
        <Select value={granularity} onChange={handleGranularityChange} style={{ width: 120 }}>
          <Option value="hour">小时</Option>
          <Option value="day">天</Option>
          <Option value="week">周</Option>
          <Option value="month">月</Option>
        </Select>
        <RangePicker value={dateRange} onChange={handleDateChange} style={{ width: 300 }} />
        <Button icon={<ReloadOutlined />} onClick={fetchAll} loading={loading}>��新</Button>
      </Space>
      <Line
        data={salesTrend}
        xField="date"
        yField={['amount', 'orderCount']}
        smooth={true}
        lineStyle={{ lineWidth: 2 }}
        point={{ size: 4 }}
        xAxis={{ label: { formatter: (v) => v } }}
        yAxis={{ label: { formatter: (v) => `��${(v / 10000).toFixed(1)}万` } }}
        tooltip={{ shared: true }}
        height={500}
        loading={loading}
      />
    </Card>
  )

  const CategoryTab = () => (
    <Row gutter={16}>
      <Col span={12}>
        <Card title="品类��售占比" style={{ height: 500 }}>
          <Pie
            data={categoryData}
            angleField="value"
            colorField="category"
            radius={0.8}
            innerRadius={0.5}
            label={{
              type: 'spider',
              formatter: (d) => `${d.category}: ${d.percent * 100}%`
            }}
            height={450}
            loading={loading}
          />
        </Card>
      </Col>
      <Col span={12}>
        <Card title="品类��售排行" style={{ height: 500 }}>
          <Bar
            data={categoryData.sort((a, b) => b.value - a.value)}
            xField="value"
            yField="category"
            layout="horizontal"
            barStyle={{ fill: '#1890ff', opacity: 0.8 }}
            label={{ position: 'right', formatter: (v) => `��${(v / 10000).toFixed(1)}万` }}
            xAxis={{ label: { formatter: (v) => `��${(v / 10000).toFixed(1)}万` } }}
            height={450}
            loading={loading}
          />
        </Card>
      </Col>
    </Row>
  )

  const UserTab = () => (
    <Row gutter={16}>
      <Col span={12}>
        <Card title="用户画像雷达图" style={{ height: 500 }}>
          {userPortrait && (
            <Radar
              data={[
                { name: '活��度', value: userPortrait.activity },
                { name: '客单价', value: userPortrait.avgOrderValue / 100 },
                { name: '复��率', value: userPortrait.repurchaseRate * 100 },
                { name: '客单数', value: userPortrait.orderCount / 10 },
                { name: '����深度', value: userPortrait.browseDepth },
                { name: '转化率', value: userPortrait.conversionRate * 100 }
              ]}
              xField="name"
              yField="value"
              seriesField="name"
              radius={0.8}
              line={{ style: { lineWidth: 2 } }}
              area={{ style: { opacity: 0.1 } }}
              height={450}
              loading={loading}
            />
          )}
        </Card>
      </Col>
      <Col span={12}>
        <Card title="用户画像��情" style={{ height: 500 }}>
          {userPortrait && (
            <Grid columns={2}>
              <Statistic title="活��用户数" value={userPortrait.activeUsers} />
              <Statistic title="新增用户数" value={userPortrait.newUsers} />
              <Statistic title="流失用户数" value={userPortrait.churnedUsers} />
              <Statistic title="平均客单价" value={`��${userPortrait.avgOrderValue.toFixed(0)}`} />
              <Statistic title="人均下单次数" value={userPortrait.avgOrderCount.toFixed(1)} />
              <Statistic title="人均����深度" value={userPortrait.browseDepth.toFixed(1)} />
              <Statistic title="整体转化率" value={`${(userPortrait.conversionRate * 100).toFixed(1)}%`} />
              <Statistic title="复��率" value={`${(userPortrait.repurchaseRate * 100).toFixed(1)}%`} />
            </Grid>
          )}
        </Card>
      </Col>
    </Row>
  )

  const ProductTab = () => (
    <Row gutter={16}>
      <Col span={12}>
        <Card title="热��商品 TOP 20" style={{ height: 500 }}>
          <Bar
            data={topProducts}
            xField="sales"
            yField="name"
            layout="horizontal"
            barStyle={{ fill: '#1890ff', opacity: 0.8 }}
            label={{ position: 'right', formatter: (v) => `${v}单` }}
            xAxis={{ label: { formatter: (v) => `${v}单` } }}
            yAxis={{ label: { autoRotate: false } }}
            height={450}
            loading={loading}
          />
        </Card>
      </Col>
      <Col span={12}>
        <Card title="商品��斗分��" style={{ height: 500 }}>
          {funnelData.length > 0 && (
            <Funnel
              data={funnelData}
              xField="name"
              yField="value"
              label={{
                formatter: (d) => `${d.name}: ${d.value} (${d.percent * 100}%)`
              }}
              conversionTag={true}
              height={450}
              loading={loading}
            />
          )}
        </Card>
      </Col>
    </Row>
  )

  const tabs = [
    { key: 'overview', tab: '概��', component: OverviewTab },
    { key: 'sales', tab: '��售分��', component: SalesTab },
    { key: 'category', tab: '品类分��', component: CategoryTab },
    { key: 'user', tab: '用户画像', component: UserTab },
    { key: 'product', tab: '商品分��', component: ProductTab },
  ]

  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Content style={{ padding: 24 }}>
        <Row gutter={16} style={{ marginBottom: 16, alignItems: 'center' }}>
          <Col>
            <h2>数据大��</h2>
          </Col>
          <Col style={{ textAlign: 'right' }}>
            <Space>
              <Select
                value={granularity}
                onChange={handleGranularityChange}
                style={{ width: 120 }}
              >
                <Option value="hour">小时</Option>
                <Option value="day">天</Option>
                <Option value="week">周</Option>
                <Option value="month">月</Option>
              </Select>
              <RangePicker
                value={dateRange}
                onChange={handleDateChange}
                style={{ width: 300 }}
                placeholder={['开始日期', '结束日期']}
                ranges={{
                  '今日': [moment(), moment()],
                  '本周': [moment().startOf('week'), moment().endOf('week')],
                  '本月': [moment().startOf('month'), moment().endOf('month')],
                  '上月': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
                }}
              />
              <Button icon={<ReloadOutlined />} onClick={fetchAll} loading={loading}>��新</Button>
              <Button icon={<DownloadOutlined />} onClick={() => message.info('导出功能开发中')}>导出</Button>
            </Space>
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
      </Content>
    </Layout>
  )
}

export default DataDashboard