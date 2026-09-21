/**
 * 国际化管理器
 * 支持多语言包管理、翻译管理、运行时切换
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 默认支持的语言列表
 */
export const DEFAULT_LOCALES = [
  { code: 'zh-CN', name: '简体中文', icon: '🇨🇳' },
  { code: 'en-US', name: 'English', icon: '🇺🇸' },
  { code: 'zh-TW', name: '繁體中文', icon: '🇹🇼' },
  { code: 'ja-JP', name: '日本語', icon: '🇯🇵' },
  { code: 'ko-KR', name: '한국어', icon: '🇰🇷' },
]

/**
 * 语言包类
 */
export class LocalePack {
  constructor(code, name, translations = {}) {
    this.code = code
    this.name = name
    this.translations = translations
    this.createdAt = Date.now()
    this.updatedAt = Date.now()
  }

  get(key, defaultValue = '') {
    return this.translations[key] || defaultValue || key
  }

  set(key, value) {
    this.translations[key] = value
    this.updatedAt = Date.now()
  }

  has(key) {
    return key in this.translations
  }

  merge(translations) {
    this.translations = { ...this.translations, ...translations }
    this.updatedAt = Date.now()
  }

  toJSON() {
    return {
      code: this.code,
      name: this.name,
      translations: this.translations,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}

/**
 * 翻译函数
 */
function createTranslateFn(manager, key) {
  return (params = {}) => {
    return manager.t(key, params)
  }
}

/**
 * 国际化管理器主类
 */
class I18nManagerClass extends EventEmitter {
  constructor() {
    super()
    this.packs = new Map()
    this.currentLocale = 'zh-CN'
    this.fallbackLocale = 'zh-CN'
    this.supportedLocales = [...DEFAULT_LOCALES]
    this.translations = new Map()
    this.missingKeys = new Set()

    // 初始化默认语言包
    this.#initDefaultPacks()
  }

  #initDefaultPacks() {
    // 中文包
    const zhCN = new LocalePack('zh-CN', '简体中文')
    zhCN.merge({
      // 通用
      'common.save': '保存',
      'common.cancel': '取消',
      'common.delete': '删除',
      'common.edit': '编辑',
      'common.add': '添加',
      'common.search': '搜索',
      'common.loading': '加载中...',
      'common.noData': '暂无数据',
      'common.confirm': '确认',
      'common.close': '关闭',
      'common.yes': '是',
      'common.no': '否',
      'common.success': '成功',
      'common.failed': '失败',
      'common.error': '错误',
      'common.createTime': '创建时间',
      'common.updateTime': '更新时间',
      'common.actions': '操作',
      'common.detail': '详情',
      'common.back': '返回',
      'common.next': '下一步',
      'common.prev': '上一步',
      'common.submit': '提交',
      'common.reset': '重置',
      'common.refresh': '刷新',
      'common.view': '查看',
      'common.export': '导出',
      'common.import': '导入',
      'common.download': '下载',
      'common.upload': '上传',
      'common.total': '共',
      'common.item': '条',
      'common.page': '页',
      'common.pageSize': '每页',

      // 低代码平台专用
      'lowcode.component': '组件',
      'lowcode.component.input': '输入框',
      'lowcode.component.button': '按钮',
      'lowcode.component.table': '表格',
      'lowcode.component.form': '表单',
      'lowcode.component.card': '卡片',
      'lowcode.component.modal': '弹窗',
      'lowcode.component.select': '选择器',
      'lowcode.component.datePicker': '日期选择器',
      'lowcode.component.upload': '上传',
      'lowcode.editor': '编辑器',
      'lowcode.editor.drag': '拖拽组件到此处',
      'lowcode.editor.props': '属性配置',
      'lowcode.editor.events': '事件配置',
      'lowcode.editor.dataSource': '数据源',
      'lowcode.schema': 'Schema',
      'lowcode.schema.export': '导出 Schema',
      'lowcode.schema.import': '导入 Schema',
      'lowcode.schema.validate': '验证 Schema',
      'lowcode.model': '数据模型',
      'lowcode.model.create': '创建模型',
      'lowcode.model.edit': '编辑模型',
      'lowcode.model.delete': '删除模型',
      'lowcode.model.field': '字段',
      'lowcode.model.field.create': '创建字段',
      'lowcode.model.field.type': '字段类型',
      'lowcode.model.field.required': '必填',
      'lowcode.workflow': '工作流',
      'lowcode.workflow.create': '创建工作流',
      'lowcode.workflow.run': '运行工作流',
      'lowcode.workflow.log': '运行日志',
      'lowcode.datasource': '数据源',
      'lowcode.datasource.create': '创建数据源',
      'lowcode.datasource.test': '测试连接',
      'lowcode.theme': '主题',
      'lowcode.theme.light': '浅色模式',
      'lowcode.theme.dark': '深色模式',
      'lowcode.theme.compact': '紧凑模式',
      'lowcode.i18n': '国际化',
      'lowcode.i18n.add': '添加语言',
      'lowcode.i18n.edit': '编辑翻译',
      'lowcode.version': '版本',
      'lowcode.version.history': '历史记录',
      'lowcode.version.restore': '恢复版本',
      'lowcode.version.compare': '版本对比',

      // 表单验证
      'validation.required': '此项为必填项',
      'validation.email': '请输入有效的邮箱地址',
      'validation.phone': '请输入有效的手机号',
      'validation.number': '请输入有效的数字',
      'validation.minLength': '长度不能少于 {min} 个字符',
      'validation.maxLength': '长度不能多于 {max} 个字符',
      'validation.pattern': '格式不正确',

      // 权限管理
      'permission.role': '角色',
      'permission.role.admin': '管理员',
      'permission.role.user': '普通用户',
      'permission.role.guest': '访客',
      'permission.create': '创建权限',
      'permission.edit': '编辑权限',
      'permission.delete': '删除权限',
    })

    // 英文包
    const enUS = new LocalePack('en-US', 'English')
    enUS.merge({
      // Common
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.delete': 'Delete',
      'common.edit': 'Edit',
      'common.add': 'Add',
      'common.search': 'Search',
      'common.loading': 'Loading...',
      'common.noData': 'No Data',
      'common.confirm': 'Confirm',
      'common.close': 'Close',
      'common.yes': 'Yes',
      'common.no': 'No',
      'common.success': 'Success',
      'common.failed': 'Failed',
      'common.error': 'Error',
      'common.createTime': 'Created At',
      'common.updateTime': 'Updated At',
      'common.actions': 'Actions',
      'common.detail': 'Detail',
      'common.back': 'Back',
      'common.next': 'Next',
      'common.prev': 'Previous',
      'common.submit': 'Submit',
      'common.reset': 'Reset',
      'common.refresh': 'Refresh',
      'common.view': 'View',
      'common.export': 'Export',
      'common.import': 'Import',
      'common.download': 'Download',
      'common.upload': 'Upload',
      'common.total': 'Total',
      'common.item': 'Item',
      'common.page': 'Page',
      'common.pageSize': 'Per Page',

      // LowCode Platform
      'lowcode.component': 'Component',
      'lowcode.component.input': 'Input',
      'lowcode.component.button': 'Button',
      'lowcode.component.table': 'Table',
      'lowcode.component.form': 'Form',
      'lowcode.component.card': 'Card',
      'lowcode.component.modal': 'Modal',
      'lowcode.component.select': 'Select',
      'lowcode.component.datePicker': 'Date Picker',
      'lowcode.component.upload': 'Upload',
      'lowcode.editor': 'Editor',
      'lowcode.editor.drag': 'Drag components here',
      'lowcode.editor.props': 'Properties',
      'lowcode.editor.events': 'Events',
      'lowcode.editor.dataSource': 'Data Source',
      'lowcode.schema': 'Schema',
      'lowcode.schema.export': 'Export Schema',
      'lowcode.schema.import': 'Import Schema',
      'lowcode.schema.validate': 'Validate Schema',
      'lowcode.model': 'Model',
      'lowcode.model.create': 'Create Model',
      'lowcode.model.edit': 'Edit Model',
      'lowcode.model.delete': 'Delete Model',
      'lowcode.model.field': 'Field',
      'lowcode.model.field.create': 'Create Field',
      'lowcode.model.field.type': 'Field Type',
      'lowcode.model.field.required': 'Required',
      'lowcode.workflow': 'Workflow',
      'lowcode.workflow.create': 'Create Workflow',
      'lowcode.workflow.run': 'Run Workflow',
      'lowcode.workflow.log': 'Execution Log',
      'lowcode.datasource': 'Data Source',
      'lowcode.datasource.create': 'Create Data Source',
      'lowcode.datasource.test': 'Test Connection',
      'lowcode.theme': 'Theme',
      'lowcode.theme.light': 'Light Mode',
      'lowcode.theme.dark': 'Dark Mode',
      'lowcode.theme.compact': 'Compact Mode',
      'lowcode.i18n': 'Internationalization',
      'lowcode.i18n.add': 'Add Language',
      'lowcode.i18n.edit': 'Edit Translation',
      'lowcode.version': 'Version',
      'lowcode.version.history': 'History',
      'lowcode.version.restore': 'Restore Version',
      'lowcode.version.compare': 'Compare Versions',

      // Validation
      'validation.required': 'This field is required',
      'validation.email': 'Please enter a valid email address',
      'validation.phone': 'Please enter a valid phone number',
      'validation.number': 'Please enter a valid number',
      'validation.minLength': 'Length must be at least {min} characters',
      'validation.maxLength': 'Length must be no more than {max} characters',
      'validation.pattern': 'Invalid format',

      // Permission
      'permission.role': 'Role',
      'permission.role.admin': 'Administrator',
      'permission.role.user': 'User',
      'permission.role.guest': 'Guest',
      'permission.create': 'Create Permission',
      'permission.edit': 'Edit Permission',
      'permission.delete': 'Delete Permission',
    })

    this.packs.set('zh-CN', zhCN)
    this.packs.set('en-US', enUS)
  }

  /**
   * 设置当前语言
   */
  setLocale(locale) {
    if (!this.packs.has(locale)) {
      console.warn(`语言包不存在：${locale}，使用默认语言`)
      locale = this.fallbackLocale
    }

    const oldLocale = this.currentLocale
    this.currentLocale = locale
    this.emit('locale:change', { locale, oldLocale })
    return this
  }

  /**
   * 获取当前语言
   */
  getLocale() {
    return this.currentLocale
  }

  /**
   * 获取所有支持的语言
   */
  getSupportedLocales() {
    return this.supportedLocales
  }

  /**
   * 注册语言包
   */
  registerPack(locale, name, translations = {}) {
    const pack = new LocalePack(locale, name, translations)
    this.packs.set(locale, pack)
    this.emit('pack:register', { locale, pack })
    return pack
  }

  /**
   * 获取语言包
   */
  getPack(locale) {
    return this.packs.get(locale)
  }

  /**
   * 翻译文本
   */
  t(key, params = {}) {
    const pack = this.packs.get(this.currentLocale)
    let text = pack ? pack.get(key) : key

    // 如果当前语言没有，尝试使用回退语言
    if (!text || text === key) {
      const fallbackPack = this.packs.get(this.fallbackLocale)
      if (fallbackPack) {
        text = fallbackPack.get(key)
      }
    }

    // 记录缺失的翻译
    if (!text || text === key) {
      this.missingKeys.add(key)
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[i18n] 缺失翻译：${key}`)
      }
    }

    // 参数替换
    if (text && params) {
      for (const [param, value] of Object.entries(params)) {
        text = text.replace(`{${param}}`, String(value))
      }
    }

    return text || key
  }

  /**
   * 翻译文本（带命名空间）
   */
  ns(namespace, key, params = {}) {
    return this.t(`${namespace}.${key}`, params)
  }

  /**
   * 创建翻译函数
   */
  createTranslator(namespace) {
    return (key, params = {}) => {
      const fullKey = namespace ? `${namespace}.${key}` : key
      return this.t(fullKey, params)
    }
  }

  /**
   * 添加或更新翻译
   */
  addTranslation(locale, key, value) {
    let pack = this.packs.get(locale)
    if (!pack) {
      pack = new LocalePack(locale, locale)
      this.packs.set(locale, pack)
    }
    pack.set(key, value)
    this.emit('translation:update', { locale, key, value })
  }

  /**
   * 批量添加翻译
   */
  addTranslations(locale, translations) {
    let pack = this.packs.get(locale)
    if (!pack) {
      pack = new LocalePack(locale, locale)
      this.packs.set(locale, pack)
    }
    pack.merge(translations)
    this.emit('translations:update', { locale, translations })
  }

  /**
   * 导出语言包
   */
  exportPack(locale) {
    const pack = this.packs.get(locale)
    if (!pack) {
      return null
    }
    return JSON.stringify(pack.toJSON(), null, 2)
  }

  /**
   * 导入语言包
   */
  importPack(jsonString) {
    try {
      const data = JSON.parse(jsonString)
      const pack = new LocalePack(data.code, data.name, data.translations)
      this.packs.set(pack.code, pack)
      this.emit('pack:import', { pack })
      return pack
    } catch (error) {
      throw new Error(`导入语言包失败：${error.message}`)
    }
  }

  /**
   * 获取缺失的翻译键
   */
  getMissingKeys() {
    return Array.from(this.missingKeys)
  }

  /**
   * 清除缺失记录
   */
  clearMissingKeys() {
    this.missingKeys.clear()
  }

  /**
   * 获取所有翻译键
   */
  getAllKeys() {
    const keys = new Set()
    for (const pack of this.packs.values()) {
      Object.keys(pack.translations).forEach((key) => keys.add(key))
    }
    return Array.from(keys)
  }

  /**
   * 清空所有语言包
   */
  clear() {
    this.packs.clear()
    this.missingKeys.clear()
    this.#initDefaultPacks()
    this.emit('clear')
  }
}

// 导出单例和工具函数
export const i18nManager = new I18nManagerClass()

/**
 * 快捷翻译函数
 */
export function t(key, params = {}) {
  return i18nManager.t(key, params)
}

export default i18nManager
