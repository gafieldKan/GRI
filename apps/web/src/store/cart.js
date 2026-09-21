import { defineStore } from 'pinia'

export const useCartStore = defineStore('cart', {
  state: () => ({
    items: [],
  }),

  getters: {
    // 购物车商品数量
    itemCount(state) {
      return state.items.reduce((total, item) => total + item.quantity, 0)
    },

    // 购物车总价
    totalPrice(state) {
      return state.items.reduce((total, item) => total + item.price * item.quantity, 0)
    },

    // 检查商品是否在购物车中
    isInCart: (state) => (itemId) => {
      return state.items.some(item => item.id === itemId)
    }
  },

  actions: {
    // 添加商品
    addItem(item) {
      const existingItem = this.items.find(i => i.id === item.id)
      if (existingItem) {
        existingItem.quantity += (item.quantity || 1)
      } else {
        this.items.push({
          ...item,
          quantity: item.quantity || 1
        })
      }
    },

    // 移除商品
    removeItem(itemId) {
      const index = this.items.findIndex(i => i.id === itemId)
      if (index !== -1) {
        this.items.splice(index, 1)
      }
    },

    // 更新数量
    updateQuantity(itemId, quantity) {
      const item = this.items.find(i => i.id === itemId)
      if (item) {
        item.quantity = quantity
      }
    },

    // 清空购物车
    clearCart() {
      this.items = []
    },

    // 从本地存储恢复
    restoreFromStorage() {
      try {
        const saved = uni.getStorageSync('cart')
        if (saved) {
          this.items = JSON.parse(saved)
        }
      } catch (e) {
        console.error('恢复购物车失败', e)
      }
    },

    // 保存到本地存储
    saveToStorage() {
      try {
        uni.setStorageSync('cart', JSON.stringify(this.items))
      } catch (e) {
        console.error('保存购物车失败', e)
      }
    }
  },

  // 持久化配置
  persist: {
    key: 'cart',
    storage: {
      getItem: (key) => {
        try {
          return uni.getStorageSync(key)
        } catch (e) {
          return null
        }
      },
      setItem: (key, value) => {
        try {
          uni.setStorageSync(key, value)
        } catch (e) {
          console.error('保存失败', e)
        }
      }
    }
  }
})
