/**
 * Order API
 * 订单相关的后端接口调用 —— M5 已收敛到统一 /api（services/api），域名路径 /api/food/*。
 *
 * 契约变更（重写标准）：
 *  - 路径：/api/orders/* → /api/food/orders/*（保留 Nest 域命名空间）
 *  - 响应：裸 body（Nest 无 {code,data} 信封）；消费方直接取数组 / 对象
 *  - 鉴权：身份一律取 JWT（req.auth.externalId），userId 参数不再需要；列表/详情均需 Authorization
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

/**
 * Get auth headers from persisted store (if available)
 * Avoids circular imports by reading from uni storage directly
 */
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
 * 获取订单列表（本人；Nest 从 JWT 取身份，仅 status 过滤生效）
 * @param {Object} params - { status? }
 * @returns {Promise<Order[]>} 裸数组
 */
export async function getOrders(params = {}) {
  try {
    const query = params?.status ? `?status=${encodeURIComponent(params.status)}` : ''
    const url = `${API_BASE}/api/food/orders${query}`
    const response = await fetch(url, { headers: getAuthHeaders() })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } catch (err) {
    console.error('getOrders failed:', err)
    throw err
  }
}

/**
 * 获取订单详情（本人或 operator/merchant）
 * @param {string} id - 订单 ID (UUID)
 * @returns {Promise<Order & { items: OrderItem[] }>} 裸对象
 */
export async function getOrderById(id) {
  try {
    const response = await fetch(`${API_BASE}/api/food/orders/${id}`, {
      headers: getAuthHeaders()
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } catch (err) {
    console.error('getOrderById failed:', err)
    throw err
  }
}

/**
 * 创建订单（身份取 JWT，restaurantId + items 必填）
 * @param {Object} orderData - { restaurantId, items: [{ dishId, quantity }] }
 * @returns {Promise<Order>} 裸对象
 */
export async function createOrder(orderData) {
  try {
    const response = await fetch(`${API_BASE}/api/food/orders`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        restaurantId: orderData.restaurantId,
        items: orderData.items.map((i) => ({ dishId: i.dishId || i.id, quantity: i.quantity }))
      })
    })
    const result = await response.json()
    if (!response.ok) {
      throw new Error(result?.message || `HTTP ${response.status}`)
    }
    return result
  } catch (err) {
    console.error('createOrder failed:', err)
    throw err
  }
}

/**
 * 确认订单（仅 pending/paid → confirmed）
 * @param {string} id - 订单 ID (UUID)
 * @returns {Promise<Order>}
 */
export async function confirmOrder(id) {
  try {
    const response = await fetch(`${API_BASE}/api/food/orders/${id}/confirm`, {
      method: 'POST',
      headers: getAuthHeaders()
    })
    const result = await response.json()
    if (!response.ok) {
      throw new Error(result?.message || `HTTP ${response.status}`)
    }
    return result
  } catch (err) {
    console.error('confirmOrder failed:', err)
    throw err
  }
}

/**
 * 取消订单（pending/paid/confirmed → cancelled）
 * @param {string} id - 订单 ID (UUID)
 * @param {string} [reason] - 取消原因（v1 未落库）
 * @returns {Promise<Order>}
 */
export async function cancelOrder(id, reason = '') {
  try {
    const response = await fetch(`${API_BASE}/api/food/orders/${id}/cancel`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason })
    })
    const result = await response.json()
    if (!response.ok) {
      throw new Error(result?.message || `HTTP ${response.status}`)
    }
    return result
  } catch (err) {
    console.error('cancelOrder failed:', err)
    throw err
  }
}

/**
 * 完成订单（confirmed/delivered → completed）
 * @param {string} id - 订单 ID (UUID)
 * @returns {Promise<Order>}
 */
export async function completeOrder(id) {
  try {
    const response = await fetch(`${API_BASE}/api/food/orders/${id}/complete`, {
      method: 'POST',
      headers: getAuthHeaders()
    })
    const result = await response.json()
    if (!response.ok) {
      throw new Error(result?.message || `HTTP ${response.status}`)
    }
    return result
  } catch (err) {
    console.error('completeOrder failed:', err)
    throw err
  }
}