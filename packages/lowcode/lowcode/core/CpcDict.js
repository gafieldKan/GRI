/**
 * GRI 产品分类字典
 * 基于 UN CPC Ver.2.1 (产品总分类)
 *
 * 来源：联合国统计司
 * https://unstats.un.org/unsd/classifications/Family/Detail/1387
 */

/**
 * CPC 门类 (Section) - 10 个
 * 一位数字代码 (0-9)
 */
export const CPC_SECTIONS = [
  { code: '0', name: '可膨胀货物；食品和饮料', nameEn: 'Expandable goods; Food and beverages' },
  { code: '1', name: '农业和矿业产品', nameEn: 'Agricultural and mining products' },
  { code: '2', name: '制成品', nameEn: 'Manufactured products' },
  { code: '3', name: '电力、燃气和水', nameEn: 'Electricity, gas and water' },
  { code: '4', name: '建筑产品', nameEn: 'Construction products' },
  { code: '5', name: '分销服务', nameEn: 'Distribution services' },
  { code: '6', name: '住宿、餐饮和饮料服务', nameEn: 'Accommodation, food and beverage services' },
  { code: '7', name: '运输服务', nameEn: 'Transport services' },
  { code: '8', name: '商业服务', nameEn: 'Business services' },
  { code: '9', name: '社区、社会和公共服务', nameEn: 'Community, social and personal services' },
]

/**
 * 餐饮相关 CPC 分类 (Section 6)
 */
export const CPC_HOSPITALITY = {
  // 631 - 住宿服务
  631: {
    code: '631',
    name: '旅馆和其他住宿服务',
    nameEn: 'Hotel and other accommodation services',
    classes: [
      {
        code: '63110',
        name: '旅馆和汽车旅馆住宿服务',
        nameEn: 'Hotel and motel accommodation services',
      },
      { code: '63120', name: '度假村住宿服务', nameEn: 'Resort accommodation services' },
      {
        code: '63130',
        name: '旅游营地、房车营地服务',
        nameEn: 'Camping site and caravan park services',
      },
      {
        code: '63190',
        name: '其他短期住宿服务',
        nameEn: 'Other short-term accommodation services',
      },
    ],
  },
  // 633 - 餐饮服务
  633: {
    code: '633',
    name: '食品和饮料服务',
    nameEn: 'Food and beverage services',
    classes: [
      {
        code: '63341',
        name: '餐馆和类似设施服务',
        nameEn: 'Restaurant and similar food serving services',
      },
      { code: '63342', name: '快餐服务', nameEn: 'Fast food serving services' },
      { code: '63343', name: '流动食品摊服务', nameEn: 'Mobile food serving services' },
      { code: '63344', name: '活动餐饮服务', nameEn: 'Event catering services' },
      { code: '63350', name: '酒吧和饮料服务', nameEn: 'Bar and beverage serving services' },
    ],
  },
}

/**
 * 农业相关 CPC 分类 (Section 0-1)
 */
export const CPC_AGRICULTURE = {
  '011': {
    code: '011',
    name: '园艺产品',
    nameEn: 'Garden products',
    classes: [
      { code: '01111', name: '小麦', nameEn: 'Wheat' },
      { code: '01112', name: '玉米', nameEn: 'Maize' },
      { code: '01113', name: '大米', nameEn: 'Rice' },
      { code: '01119', name: '其他谷物', nameEn: 'Other cereals' },
    ],
  },
  '012': {
    code: '012',
    name: '活体动物和动物产品',
    nameEn: 'Live animals and animal products',
    classes: [
      { code: '01210', name: '牛', nameEn: 'Cattle' },
      { code: '01220', name: '猪', nameEn: 'Pigs' },
      { code: '01230', name: '家禽', nameEn: 'Poultry' },
      { code: '01290', name: '其他动物', nameEn: 'Other animals' },
    ],
  },
}

/**
 * CPC 分类管理器
 */
class CpcDictClass {
  constructor() {
    this.sections = new Map()
    this.hospitality = new Map()
    this.agriculture = new Map()

    // 初始化
    this._initSections()
    this._initHospitality()
    this._initAgriculture()
  }

  /**
   * 初始化门类
   */
  _initSections() {
    CPC_SECTIONS.forEach((section) => {
      this.sections.set(section.code, section)
    })
  }

  /**
   * 初始化餐饮分类
   */
  _initHospitality() {
    Object.values(CPC_HOSPITALITY).forEach((category) => {
      this.hospitality.set(category.code, category)
    })
  }

  /**
   * 初始化农业分类
   */
  _initAgriculture() {
    Object.values(CPC_AGRICULTURE).forEach((category) => {
      this.agriculture.set(category.code, category)
    })
  }

  /**
   * 获取所有门类
   */
  getSections() {
    return Array.from(this.sections.values())
  }

  /**
   * 获取餐饮分类
   */
  getHospitality() {
    return Array.from(this.hospitality.values())
  }

  /**
   * 获取农业分类
   */
  getAgriculture() {
    return Array.from(this.agriculture.values())
  }

  /**
   * 根据代码获取分类
   */
  getCategory(code) {
    return this.hospitality.get(code) || this.agriculture.get(code)
  }

  /**
   * 获取小类列表
   */
  getClasses(categoryCode) {
    const category = this.getCategory(categoryCode)
    if (category && category.classes) {
      return category.classes
    }
    return []
  }

  /**
   * 判断是否为餐饮服务
   */
  isFoodService(code) {
    return code.startsWith('633')
  }

  /**
   * 判断是否为住宿服务
   */
  isAccommodation(code) {
    return code.startsWith('631')
  }
}

// 导出单例
export const cpcDict = new CpcDictClass()
export default cpcDict
