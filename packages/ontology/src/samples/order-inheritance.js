/**
 * 示例本体：订单基类 + 三个子类（批發 / 助农 / 点餐）单表继承样板
 *
 * 对应方案 §5.1.1 / §6.2 / §6.3：
 *  - abstract 基类 Order：公共字段 + 抽象 Action 契约（confirm / cancel）
 *  - 三个子类 extends Order：差异化字段进 variantFields（→ JSONB extra）
 *  - discriminator：order_type 判别列（catering / wholesale / farm）
 *  - transition：各自状态机（点餐 7 态 / 批发 10 态 / 助农 5 态起点）
 *
 * 这是「订单基类 + 三子类单表继承」的语义真源声明，后续引擎/生成器/迁移都消费它。
 */

export const orderOntology = {
  schemaVersion: '0.1.0',
  name: 'gri-orders',
  description: '订单基类 + 批发/助农/点餐三子类单表继承样板（§5.1.1）',

  interfaces: [
    {
      name: 'Confirmable',
      description: '可确认契约',
      actions: ['confirm'],
    },
  ],

  objects: [
    // —— 支撑对象：用户（Link 端点） ——
    {
      name: 'User',
      description: '下单用户（Link 端点）',
      fields: [
        { name: 'id', type: 'uuid', required: true, unique: true },
        { name: 'name', type: 'string' },
      ],
    },

    // —— 抽象基类 ——
    {
      name: 'Order',
      description: '订单抽象基类',
      abstract: true,
      fields: [
        { name: 'id', type: 'uuid', required: true, unique: true },
        { name: 'orderNo', type: 'string', required: true, unique: true },
        { name: 'status', type: 'string', required: true },
        { name: 'totalAmount', type: 'number', required: true },
        { name: 'createdAt', type: 'datetime', required: true, dbDefault: 'CURRENT_TIMESTAMP' },
        { name: 'updatedAt', type: 'datetime', required: true, dbDefault: 'CURRENT_TIMESTAMP' },
      ],
      actions: [
        { name: 'confirm', abstract: true, description: '确认订单（子类各自实现语义）' },
        { name: 'cancel', abstract: true, description: '取消订单' },
      ],
    },

    // —— 点餐子类 ——
    {
      name: 'CateringOrder',
      extends: 'Order',
      implements: ['Confirmable'],
      discriminator: { field: 'order_type', value: 'catering' },
      variantFields: [
        { name: 'restaurantId', type: 'uuid', description: '餐厅 ID' },
        { name: 'dishItems', type: 'json', description: '菜品明细' },
        { name: 'deliveryAddress', type: 'json', description: '配送地址' },
      ],
      actions: [
        { name: 'confirm', description: '用户确认下单（点餐语义）' },
        { name: 'cancel', description: '取消订单' },
      ],
      stateMachine: {
        field: 'status',
        initial: 'pending',
        states: ['pending', 'confirmed', 'preparing', 'ready', 'delivering', 'completed', 'cancelled'],
        transitions: {
          pending: ['confirmed', 'cancelled'],
          confirmed: ['preparing', 'cancelled'],
          preparing: ['ready', 'cancelled'],
          ready: ['delivering', 'cancelled'],
          delivering: ['completed', 'cancelled'],
          completed: [],
          cancelled: [],
        },
      },
    },

    // —— 助农子类 ——
    {
      name: 'FarmOrder',
      extends: 'Order',
      implements: ['Confirmable'],
      discriminator: { field: 'order_type', value: 'farm' },
      variantFields: [
        { name: 'farmerId', type: 'uuid' },
        { name: 'cooperativeId', type: 'uuid' },
        { name: 'cropType', type: 'string' },
        { name: 'quantity', type: 'number' },
        { name: 'unit', type: 'string' },
        { name: 'price', type: 'number' },
      ],
      actions: [
        { name: 'confirm', description: '确认采摘（助农语义）' },
        { name: 'cancel', description: '取消订单' },
      ],
      stateMachine: {
        field: 'status',
        initial: 'pending_pick',
        states: ['pending_pick', 'picked', 'in_transit', 'delivered', 'cancelled'],
        transitions: {
          pending_pick: ['picked', 'cancelled'],
          picked: ['in_transit'],
          in_transit: ['delivered'],
          delivered: [],
          cancelled: [],
        },
      },
    },

    // —— 批发子类 ——
    {
      name: 'WholesaleOrder',
      extends: 'Order',
      implements: ['Confirmable'],
      discriminator: { field: 'order_type', value: 'wholesale' },
      variantFields: [
        { name: 'buyerOrgId', type: 'uuid' },
        { name: 'sellerOrgId', type: 'uuid' },
        { name: 'tradeTerm', type: 'enum', values: ['EXW', 'FOB', 'CIF', 'CPT', 'DDP'] },
        { name: 'settlementMethod', type: 'enum', values: ['t_t', 'l_c', 'd_p', 'o_a', 'cod'] },
        { name: 'currencyCode', type: 'string' },
      ],
      actions: [
        { name: 'confirm', description: '双方确认（批发语义）' },
        { name: 'cancel', description: '取消订单' },
      ],
      stateMachine: {
        field: 'status',
        initial: 'pending_confirm',
        states: [
          'pending_confirm', 'confirmed', 'pending_payment', 'paid', 'allocating',
          'ready_to_ship', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded',
        ],
        transitions: {
          pending_confirm: ['confirmed', 'cancelled'],
          confirmed: ['pending_payment', 'cancelled'],
          pending_payment: ['paid', 'cancelled'],
          paid: ['allocating'],
          allocating: ['ready_to_ship'],
          ready_to_ship: ['shipped'],
          shipped: ['delivered'],
          delivered: ['completed'],
          completed: [],
          cancelled: [],
          refunded: [],
        },
      },
    },
  ],

  links: [
    { name: 'orderToUser', source: 'Order', target: 'User', cardinality: 'many', foreignKey: 'userId' },
  ],
}