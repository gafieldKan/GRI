import { createStore } from 'zustand'

const createCartStore = () =>
  createStore((set, get) => ({
    items: [],
    addItem: (item) => {
      const currentItems = get().items
      const existingItem = currentItems.find((i) => i.id === item.id)
      if (existingItem) {
        set({
          items: currentItems.map((i) =>
            i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        })
      } else {
        set({ items: [...currentItems, { ...item, quantity: 1 }] })
      }
    },
    removeItem: (itemId) => {
      set({ items: get().items.filter((i) => i.id !== itemId) })
    },
    updateQuantity: (itemId, quantity) => {
      if (quantity <= 0) {
        get().removeItem(itemId)
      } else {
        set({
          items: get().items.map((i) =>
            i.id === itemId ? { ...i, quantity } : i
          ),
        })
      }
    },
    clearCart: () => set({ items: [] }),
    getTotalPrice: () => {
      return get().items.reduce((total, item) => total + item.price * item.quantity, 0)
    },
    getItemCount: () => {
      return get().items.reduce((count, item) => count + item.quantity, 0)
    },
  }))

export default createCartStore
