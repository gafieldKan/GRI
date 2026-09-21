/**
 * Restaurant API
 * 从后端获取商家数据 —— M5 已收敛到统一 /api（services/api），域名路径 /api/food/restaurants/*。
 * 公开读（游客可见）；响应裸 body（数组/对象）。
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export async function getRestaurants(params = {}) {
  try {
    const query = new URLSearchParams(params).toString()
    const url = `${API_BASE}/api/food/restaurants${query ? '?' + query : ''}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } catch (err) {
    console.error('getRestaurants failed:', err)
    throw err
  }
}

export async function getRestaurantById(id) {
  try {
    const response = await fetch(`${API_BASE}/api/food/restaurants/${id}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } catch (err) {
    console.error('getRestaurantById failed:', err)
    throw err
  }
}

/** 获取某餐厅在售菜品（Nest 独立于餐厅详情的公开读端点） */
export async function getDishes(restaurantId) {
  try {
    const response = await fetch(`${API_BASE}/api/food/restaurants/${restaurantId}/dishes`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } catch (err) {
    console.error('getDishes failed:', err)
    throw err
  }
}