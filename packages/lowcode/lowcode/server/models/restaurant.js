/**
 * 餐厅模型定义
 * 基于低代码平台的数据模型规范
 */

export const restaurantModel = {
  name: 'Restaurant',
  singular: 'Restaurant',
  plural: 'Restaurants',

  fields: [
    {
      name: 'name',
      label: '餐厅名称',
      type: 'string',
      required: true,
      index: true,
    },
    {
      name: 'code',
      label: '餐厅编码',
      type: 'string',
      unique: true,
      required: true,
    },
    {
      name: 'organizationId',
      label: '所属组织',
      type: 'link',
      target: 'Organization',
      required: true,
    },
    {
      name: 'description',
      label: '餐厅描述',
      type: 'text',
    },
    {
      name: 'coverImage',
      label: '封面图片',
      type: 'image',
    },
    {
      name: 'images',
      label: '图片集',
      type: 'images',
    },
    {
      name: 'cuisine',
      label: '菜系',
      type: 'select',
      options: [
        { value: 'sichuan', label: '川菜' },
        { value: 'cantonese', label: '粤菜' },
        { value: 'shandong', label: '鲁菜' },
        { value: 'jiangsu', label: '苏菜' },
        { value: 'zhejiang', label: '浙菜' },
        { value: 'fujian', label: '闽菜' },
        { value: 'hunan', label: '湘菜' },
        { value: 'anhui', label: '徽菜' },
        { value: 'hotpot', label: '火锅' },
        { value: 'western', label: '西餐' },
        { value: 'japanese', label: '日料' },
        { value: 'korean', label: '韩餐' },
        { value: 'other', label: '其他' },
      ],
    },
    {
      name: 'priceRange',
      label: '人均消费',
      type: 'number',
      unit: '元',
    },
    {
      name: 'phone',
      label: '联系电话',
      type: 'string',
    },
    {
      name: 'address',
      label: '详细地址',
      type: 'string',
    },
    {
      name: 'location',
      label: '地理位置',
      type: 'geopoint',
    },
    {
      name: 'businessHours',
      label: '营业时间',
      type: 'json',
      schema: {
        openTime: 'string', // 例如："09:00"
        closeTime: 'string', // 例如："22:00"
        openDays: 'array', // 例如：[1,2,3,4,5,6,0]
      },
    },
    {
      name: 'deliveryRange',
      label: '配送范围',
      type: 'number',
      unit: '公里',
    },
    {
      name: 'deliveryFee',
      label: '配送费',
      type: 'number',
      unit: '元',
    },
    {
      name: 'minDeliveryAmount',
      label: '最低配送金额',
      type: 'number',
      unit: '元',
    },
    {
      name: 'status',
      label: '营业状态',
      type: 'select',
      options: [
        { value: 'open', label: '营业中' },
        { value: 'closed', label: '休息中' },
        { value: 'paused', label: '暂停营业' },
      ],
      default: 'open',
    },
    {
      name: 'rating',
      label: '评分',
      type: 'number',
      precision: 1,
      min: 0,
      max: 5,
    },
    {
      name: 'reviewCount',
      label: '评价数',
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
      name: 'features',
      label: '特色标签',
      type: 'array',
    },
    {
      name: 'metadata',
      label: '扩展信息',
      type: 'json',
    },
    {
      name: 'settings',
      label: '配置',
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
    { fields: ['organizationId'] },
    { fields: ['status'] },
    { fields: ['cuisine'] },
  ],

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
      // 生成唯一编码
      if (!data.code) {
        data.code = `REST_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`
      }
      return data
    },
    afterCreate: async (restaurant, context) => {
      // 创建默认菜单分类
      console.log(`餐厅创建成功：${restaurant.name}`)
    },
  },
}

export default restaurantModel
