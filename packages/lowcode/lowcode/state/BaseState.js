/**
 * 状态管理抽象
 * 提供统一的状态管理接口，支持全局状态、本地状态、持久化等
 *
 * @author GRI Team
 * @version 1.0
 */

/**
 * 状态基类
 */
export class BaseState {
  constructor(initialState = {}, options = {}) {
    if (new.target === BaseState) {
      throw new Error('BaseState 是抽象类，不能直接实例化')
    }

    this._state = { ...initialState }
    this._listeners = new Set()
    this._options = {
      persist: options.persist || false,
      persistKey: options.persistKey || this.constructor.name,
      ...options,
    }

    // 从持久化恢复状态
    if (this._options.persist) {
      this._restoreState()
    }
  }

  /**
   * 获取状态
   */
  getState() {
    return { ...this._state }
  }

  /**
   * 获取状态的某个值
   */
  get(key) {
    return this._state[key]
  }

  /**
   * 设置状态
   */
  setState(updater, shouldPersist = true) {
    const newState = typeof updater === 'function' ? updater(this._state) : updater

    this._state = {
      ...this._state,
      ...newState,
    }

    // 持久化
    if (this._options.persist && shouldPersist) {
      this._saveState()
    }

    // 通知监听者
    this._notify()
  }

  /**
   * 订阅状态变化
   */
  subscribe(listener) {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  /**
   * 通知所有监听者
   */
  _notify() {
    this._listeners.forEach((listener) => {
      listener(this._state)
    })
  }

  /**
   * 保存状态到持久化存储
   */
  _saveState() {
    if (typeof window === 'undefined') return

    try {
      const serialized = JSON.stringify(this._state)
      localStorage.setItem(this._options.persistKey, serialized)
    } catch (error) {
      console.error('保存状态失败:', error)
    }
  }

  /**
   * 从持久化存储恢复状态
   */
  _restoreState() {
    if (typeof window === 'undefined') return

    try {
      const serialized = localStorage.getItem(this._options.persistKey)
      if (serialized) {
        const parsed = JSON.parse(serialized)
        this._state = { ...this._state, ...parsed }
      }
    } catch (error) {
      console.error('恢复状态失败:', error)
    }
  }

  /**
   * 清空状态
   */
  clear() {
    this._state = {}
    if (this._options.persist) {
      localStorage.removeItem(this._options.persistKey)
    }
    this._notify()
  }
}

/**
 * 购物车状态
 */
export class CartState extends BaseState {
  constructor() {
    super(
      {
        items: [],
        totalQuantity: 0,
        totalAmount: 0,
        restaurantId: null,
      },
      { persist: true, persistKey: 'gri_cart' }
    )
  }

  addItem(item) {
    const existingIndex = this._state.items.findIndex(
      (i) =>
        i.dishId === item.dishId &&
        JSON.stringify(i.specifications) === JSON.stringify(item.specifications)
    )

    if (existingIndex > -1) {
      // 更新数量
      const newItem = {
        ...this._state.items[existingIndex],
        quantity: this._state.items[existingIndex].quantity + (item.quantity || 1),
      }
      const newItems = [...this._state.items]
      newItems[existingIndex] = newItem
      this._updateItems(newItems)
    } else {
      // 添加新项
      const newItems = [...this._state.items, { ...item, quantity: item.quantity || 1 }]
      this._updateItems(newItems)
    }
  }

  removeItem(dishId, specs = {}) {
    const newItems = this._state.items.filter(
      (item) =>
        !(item.dishId === dishId && JSON.stringify(item.specifications) === JSON.stringify(specs))
    )
    this._updateItems(newItems)
  }

  updateQuantity(dishId, quantity, specs = {}) {
    if (quantity <= 0) {
      this.removeItem(dishId, specs)
      return
    }

    const newItems = this._state.items.map((item) => {
      if (item.dishId === dishId && JSON.stringify(item.specifications) === JSON.stringify(specs)) {
        return { ...item, quantity }
      }
      return item
    })
    this._updateItems(newItems)
  }

  clearCart() {
    this.setState({ items: [], totalQuantity: 0, totalAmount: 0, restaurantId: null })
  }

  _updateItems(items) {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const restaurantId = items.length > 0 ? items[0].restaurantId : null

    this.setState({
      items,
      totalQuantity,
      totalAmount,
      restaurantId,
    })
  }
}

/**
 * 订单状态
 */
export class OrderState extends BaseState {
  constructor() {
    super(
      {
        currentOrder: null,
        orders: [],
        loading: false,
        error: null,
      },
      { persist: true, persistKey: 'gri_order' }
    )
  }

  setCurrentOrder(order) {
    this.setState({ currentOrder: order })
  }

  addOrder(order) {
    this.setState({ orders: [order, ...this._state.orders] })
  }

  updateOrder(id, data) {
    const newOrders = this._state.orders.map((order) =>
      order.id === id ? { ...order, ...data } : order
    )
    this.setState({ orders: newOrders })
  }

  setLoading(loading) {
    this.setState({ loading })
  }

  setError(error) {
    this.setState({ error })
  }

  clearCurrentOrder() {
    this.setState({ currentOrder: null })
  }
}

/**
 * 用户状态
 */
export class UserState extends BaseState {
  constructor() {
    super(
      {
        currentUser: null,
        token: null,
        loading: false,
        error: null,
      },
      { persist: true, persistKey: 'gri_user' }
    )
  }

  setCurrentUser(user) {
    this.setState({ currentUser: user })
  }

  setToken(token) {
    this.setState({ token })
  }

  setLoading(loading) {
    this.setState({ loading })
  }

  setError(error) {
    this.setState({ error })
  }

  logout() {
    this.clear()
  }
}

export default BaseState
