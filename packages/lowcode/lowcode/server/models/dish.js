/**
 * 菜品模型定义
 * 支持多级分类、规格、口味等配置
 */

export const dishModel = {
  name: 'Dish',
  singular: 'Dish',
  plural: 'Dishes',

  fields: [
    {
      name: 'name',
      label: '菜品名称',
      type: 'string',
      required: true,
      index: true,
    },
    {
      name: 'code',
      label: '菜品编码',
      type: 'string',
      unique: true,
    },
    {
      name: 'restaurantId',
      label: '所属餐厅',
      type: 'link',
      target: 'Restaurant',
      required: true,
      index: true,
    },
    {
      name: 'categoryId',
      label: '所属分类',
      type: 'link',
      target: 'DishCategory',
      index: true,
    },
    {
      name: 'description',
      label: '菜品描述',
      type: 'text',
    },
    {
      name: 'images',
      label: '图片',
      type: 'images',
    },
    {
      name: 'price',
      label: '售价',
      type: 'number',
      required: true,
      unit: '元',
      precision: 2,
    },
    {
      name: 'originalPrice',
      label: '原价',
      type: 'number',
      unit: '元',
      precision: 2,
    },
    {
      name: 'costPrice',
      label: '成本价',
      type: 'number',
      unit: '元',
      precision: 2,
      permission: 'internal', // 内部字段，不对前端展示
    },
    {
      name: 'unit',
      label: '单位',
      type: 'select',
      options: [
        { value: 'portion', label: '份' },
        { value: 'bowl', label: '碗' },
        { value: 'plate', label: '盘' },
        { value: 'pot', label: '锅' },
        { value: 'piece', label: '件' },
      ],
      default: 'portion',
    },
    {
      name: 'status',
      label: '状态',
      type: 'select',
      options: [
        { value: 'onsale', label: '在售' },
        { value: 'soldout', label: '售罄' },
        { value: 'offline', label: '下架' },
      ],
      default: 'onsale',
    },
    {
      name: 'isRecommended',
      label: '是否推荐',
      type: 'boolean',
      default: false,
    },
    {
      name: 'isSignature',
      label: '是否招牌菜',
      type: 'boolean',
      default: false,
    },
    {
      name: 'spicyLevel',
      label: '辣度',
      type: 'select',
      options: [
        { value: 0, label: '不辣' },
        { value: 1, label: '微辣' },
        { value: 2, label: '中辣' },
        { value: 3, label: '特辣' },
      ],
    },
    {
      name: 'tags',
      label: '标签',
      type: 'array',
      options: [
        { value: 'hot', label: '热门' },
        { value: 'new', label: '新品' },
        { value: 'discount', label: '折扣' },
        { value: 'vegetarian', label: '素食' },
        { value: 'halal', label: '清真' },
      ],
    },
    {
      name: 'ingredients',
      label: '主要食材',
      type: 'array',
    },
    {
      name: 'allergens',
      label: '过敏原',
      type: 'array',
      options: [
        { value: 'peanuts', label: '花生' },
        { value: 'seafood', label: '海鲜' },
        { value: 'milk', label: '牛奶' },
        { value: 'egg', label: '鸡蛋' },
        { value: 'soy', label: '大豆' },
        { value: 'wheat', label: '小麦' },
      ],
    },
    {
      name: 'nutrition',
      label: '营养成分',
      type: 'json',
      schema: {
        calories: 'number', // 卡路里
        protein: 'number', // 蛋白质 (g)
        fat: 'number', // 脂肪 (g)
        carbohydrate: 'number', // 碳水化合物 (g)
      },
    },
    {
      name: 'specifications',
      label: '规格',
      type: 'array',
      schema: {
        name: 'string', // 规格名称，如"大份"
        price: 'number', // 规格价
        stock: 'number', // 库存
      },
    },
    {
      name: 'flavors',
      label: '可选口味',
      type: 'array',
      options: [
        { value: 'original', label: '原味' },
        { value: 'spicy', label: '麻辣' },
        { value: 'garlic', label: '蒜香' },
        { value: 'sweet', label: '糖醋' },
      ],
    },
    {
      name: 'preparationTime',
      label: '制作时间',
      type: 'number',
      unit: '分钟',
    },
    {
      name: 'sortOrder',
      label: '排序',
      type: 'number',
      default: 0,
    },
    {
      name: 'monthlyOrders',
      label: '月销量',
      type: 'number',
      default: 0,
    },
    {
      name: 'metadata',
      label: '扩展信息',
      type: 'json',
    },
    {
      name: 'createdBy',
      label: '创建人',
      type: 'link',
      target: 'User',
    },
    {
      name: 'updatedBy',
      label: '更新人',
      type: 'link',
      target: 'User',
    },
    {
      name: 'createdAt',
      label: '创建时间',
      type: 'datetime',
      auto: true,
    },
    {
      name: 'updatedAt',
      label: '更新时间',
      type: 'datetime',
      autoUpdate: true,
    },
  ],

  // 索引定义
  indexes: [
    { fields: ['code'], unique: true },
    { fields: ['restaurantId'] },
    { fields: ['categoryId'] },
    { fields: ['status'] },
    { fields: ['isRecommended'] },
    { fields: ['isSignature'] },
  ],

  // 虚拟字段（计算字段）
  virtualFields: {
    discount: {
      type: 'computed',
      compute: (doc) => {
        if (!doc.originalPrice || !doc.price) return 0
        return Math.round((doc.price / doc.originalPrice) * 10)
      },
    },
    hasOptions: {
      type: 'computed',
      compute: (doc) => {
        return !!(doc.specifications && doc.specifications.length > 0)
      },
    },
  },

  // 权限配置
  permissions: {
    create: ['admin', 'restaurant_manager'],
    read: ['public'],
    update: ['admin', 'restaurant_manager'],
    delete: ['admin'],
  },

  // 生命周期钩子
  hooks: {
    beforeCreate: (data) => {
      if (!data.code) {
        data.code = `DISH_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`
      }
      return data
    },
  },
}

/**
 * 菜品分类模型
 */
export const dishCategoryModel = {
  name: 'DishCategory',
  singular: 'DishCategory',
  plural: 'DishCategories',

  fields: [
    {
      name: 'name',
      label: '分类名称',
      type: 'string',
      required: true,
    },
    {
      name: 'restaurantId',
      label: '所属餐厅',
      type: 'link',
      target: 'Restaurant',
      required: true,
      index: true,
    },
    {
      name: 'parentId',
      label: '父分类',
      type: 'link',
      target: 'DishCategory',
      index: true,
    },
    {
      name: 'icon',
      label: '图标',
      type: 'image',
    },
    {
      name: 'color',
      label: '颜色',
      type: 'string',
    },
    {
      name: 'sortOrder',
      label: '排序',
      type: 'number',
      default: 0,
    },
    {
      name: 'status',
      label: '状态',
      type: 'select',
      options: [
        { value: 'active', label: '启用' },
        { value: 'inactive', label: '禁用' },
      ],
      default: 'active',
    },
    {
      name: 'createdAt',
      label: '创建时间',
      type: 'datetime',
      auto: true,
    },
    {
      name: 'updatedAt',
      label: '更新时间',
      type: 'datetime',
      autoUpdate: true,
    },
  ],

  indexes: [{ fields: ['restaurantId'] }, { fields: ['parentId'] }],
}

export default dishModel
