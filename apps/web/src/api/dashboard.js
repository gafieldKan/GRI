/**
 * Dashboard API
 * 数据大屏统计接口 —— M5 dashboard 子切片已收敛：走统一网关 /api（→ services/api）。
 * 响应为「裸 body」（M5 放映契约），无 {code,data} 信封；聚合查询在 Nest StrategicDashboardService。
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

async function get(path) {
  const response = await fetch(`${API_BASE}${path}`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return await response.json()
}

/** 概览数据 */
export async function getDashboardOverview() {
  return get('/api/dashboard/stats/overview')
}

/** 订单趋势（最近 7 天） */
export async function getOrdersTrend() {
  return get('/api/dashboard/stats/orders-trend')
}

/** 商家订单分布 */
export async function getRegionDistribution() {
  return get('/api/dashboard/stats/region-distribution')
}

/** 热销商品 TOP10 */
export async function getTopProducts() {
  return get('/api/dashboard/stats/top-products')
}

/** 用户增长 */
export async function getUserFunnel() {
  return get('/api/dashboard/stats/user-funnel')
}