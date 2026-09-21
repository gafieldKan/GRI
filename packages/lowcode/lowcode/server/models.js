/**
 * Data Models Definition
 * Define your data models with fields, validations, and relationships
 */

// Example model schema
export const UserModel = {
  name: 'User',
  description: '用户模型',
  fields: [
    { name: 'username', type: 'string', required: true, unique: true },
    { name: 'email', type: 'email', required: true, unique: true },
    { name: 'password', type: 'string', required: true },
    { name: 'role', type: 'string', default: 'user' },
    { name: 'avatar', type: 'url', default: '' },
    { name: 'isActive', type: 'boolean', default: true },
  ],
  timestamps: true,
}

export const ProductModel = {
  name: 'Product',
  description: '产品模型',
  fields: [
    { name: 'name', type: 'string', required: true },
    { name: 'description', type: 'string' },
    { name: 'price', type: 'number', required: true },
    { name: 'stock', type: 'number', default: 0 },
    { name: 'category', type: 'string' },
    { name: 'images', type: 'array', default: [] },
    { name: 'isPublished', type: 'boolean', default: false },
  ],
  timestamps: true,
}

export const OrderModel = {
  name: 'Order',
  description: '订单模型',
  fields: [
    { name: 'orderNo', type: 'string', required: true, unique: true },
    { name: 'userId', type: 'string', required: true },
    { name: 'items', type: 'array', required: true },
    { name: 'total', type: 'number', required: true },
    { name: 'status', type: 'string', default: 'pending' },
    { name: 'address', type: 'object' },
    { name: 'remark', type: 'string' },
  ],
  timestamps: true,
}

// Model registry
export const models = {
  User: UserModel,
  Product: ProductModel,
  Order: OrderModel,
}

export default models
