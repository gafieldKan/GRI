/**
 * Payment API
 * 支付相关的后端接口调用 —— M5 已收敛到统一 /api（services/api），域名路径 /api/food/payments/*。
 *
 * 契约变更（重写标准）：
 *  - 路径：/api/payments/* → /api/food/payments/*
 *  - 响应：裸 body
 *  - 支付：process(dev mock 即时收单/真实网关 async 回执)；notify 为真实网关回调（需签名），前端 dev 不直调
 *  - 字段：paymentMethod → method；refundReason → reason
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  try {
    const raw = uni.getStorageSync('gri-auth')
    if (raw) {
      const auth = JSON.parse(raw)
      if (auth.token) {
        headers['Authorization'] = `Bearer ${auth.token}`
      }
    }
  } catch (e) { /* ignore */ }
  return headers
}

/**
 * 发起支付（订单为本人且 pending；dev mock 即时收单 → 返回 paid 支付单）
 * @param {Object} paymentData - { orderId, paymentMethod }
 * @returns {Promise<Payment>} 裸对象（confirmed=true 即已收单）
 */
export async function processPayment(paymentData) {
  try {
    const response = await fetch(`${API_BASE}/api/food/payments/process`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        orderId: paymentData.orderId,
        method: paymentData.paymentMethod
      })
    })
    const result = await response.json()
    if (!response.ok) {
      throw new Error(result?.message || `HTTP ${response.status}`)
    }
    return result
  } catch (err) {
    console.error('processPayment failed:', err)
    throw err
  }
}

/**
 * 支付通知回调（真实网关 POST /payments/notify，需签名；Nest 校验签名 + 幂等 + 金额锁库）
 * @param {Object} notifyData - { orderId, transactionId, amount, method?, signature? }
 * @returns {Promise<{ paid: boolean, orderId, paymentId }>}
 */
export async function paymentNotify(notifyData) {
  try {
    const response = await fetch(`${API_BASE}/api/food/payments/notify`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(notifyData)
    })
    const result = await response.json()
    if (!response.ok) {
      throw new Error(result?.message || `HTTP ${response.status}`)
    }
    return result
  } catch (err) {
    console.error('paymentNotify failed:', err)
    throw err
  }
}

/**
 * 申请退款（operator/merchant）
 * @param {Object} refundData - { orderId, refundReason: reason }
 * @returns {Promise<Payment>}
 */
export async function refundOrder(refundData) {
  try {
    const response = await fetch(`${API_BASE}/api/food/payments/refund`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        orderId: refundData.orderId,
        reason: refundData.refundReason
      })
    })
    const result = await response.json()
    if (!response.ok) {
      throw new Error(result?.message || `HTTP ${response.status}`)
    }
    return result
  } catch (err) {
    console.error('refundOrder failed:', err)
    throw err
  }
}