/**
 * RTL (Right-to-Left) 语言支持管理器
 * 支持阿拉伯语、希伯来语等从右到左的语言
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * RTL 语言列表
 */
export const RTL_LOCALES = [
  { code: 'ar', name: '阿拉伯语', nativeName: 'العربية', direction: 'rtl' },
  { code: 'ar-SA', name: '阿拉伯语 (沙特)', nativeName: 'العربية (السعودية)', direction: 'rtl' },
  { code: 'ar-EG', name: '阿拉伯语 (埃及)', nativeName: 'العربية (مصر)', direction: 'rtl' },
  { code: 'ar-AE', name: '阿拉伯语 (阿联酋)', nativeName: 'العربية (الإمارات)', direction: 'rtl' },
  { code: 'he', name: '希伯来语', nativeName: 'עברית', direction: 'rtl' },
  { code: 'he-IL', name: '希伯来语 (以色列)', nativeName: 'עברית (ישראל)', direction: 'rtl' },
  { code: 'fa', name: '波斯语', nativeName: 'فارسی', direction: 'rtl' },
  { code: 'fa-IR', name: '波斯语 (伊朗)', nativeName: 'فارسی (ایران)', direction: 'rtl' },
  { code: 'ur', name: '乌尔都语', nativeName: 'اردو', direction: 'rtl' },
  { code: 'ur-PK', name: '乌尔都语 (巴基斯坦)', nativeName: 'اردو (پاکستان)', direction: 'rtl' },
]

/**
 * LTR 语言列表（默认）
 */
export const LTR_LOCALES = [
  { code: 'zh-CN', name: '简体中文', direction: 'ltr' },
  { code: 'zh-TW', name: '繁体中文', direction: 'ltr' },
  { code: 'en-US', name: 'English (US)', direction: 'ltr' },
  { code: 'en-GB', name: 'English (UK)', direction: 'ltr' },
  { code: 'ja-JP', name: '日本語', direction: 'ltr' },
  { code: 'ko-KR', name: '한국어', direction: 'ltr' },
  { code: 'de-DE', name: 'Deutsch', direction: 'ltr' },
  { code: 'fr-FR', name: 'Français', direction: 'ltr' },
  { code: 'es-ES', name: 'Español', direction: 'ltr' },
  { code: 'it-IT', name: 'Italiano', direction: 'ltr' },
  { code: 'pt-BR', name: 'Português (Brasil)', direction: 'ltr' },
  { code: 'ru-RU', name: 'Русский', direction: 'ltr' },
  { code: 'th-TH', name: 'ไทย', direction: 'ltr' },
  { code: 'vi-VN', name: 'Tiếng Việt', direction: 'ltr' },
]

/**
 * RTL 相关的 CSS 属性映射
 */
export const RTL_CSS_MAP = {
  // 边距
  'margin-left': 'margin-right',
  'margin-right': 'margin-left',
  // 内边距
  'padding-left': 'padding-right',
  'padding-right': 'padding-left',
  // 边框
  'border-left': 'border-right',
  'border-right': 'border-left',
  // 定位
  left: 'right',
  right: 'left',
  // 文本
  'text-align: left': 'text-align: right',
  'text-align: right': 'text-align: left',
  // 浮动
  'float: left': 'float: right',
  'float: right': 'float: left',
}

/**
 * 获取所有支持的语言（包含 RTL 和 LTR）
 */
export function getAllLocales() {
  return [...RTL_LOCALES, ...LTR_LOCALES]
}

/**
 * 判断是否为 RTL 语言
 */
export function isRtlLocale(locale) {
  if (!locale) return false
  const code = locale.toLowerCase()
  return RTL_LOCALES.some(
    (rtl) => rtl.code.toLowerCase() === code || rtl.code.split('-')[0] === code.split('-')[0]
  )
}

/**
 * 获取语言方向
 */
export function getLocaleDirection(locale) {
  return isRtlLocale(locale) ? 'rtl' : 'ltr'
}

/**
 * RTL 管理器类
 */
class RtlManagerClass extends EventEmitter {
  constructor() {
    super()
    this.currentDirection = 'ltr'
    this.enabled = false
    this.autoDetect = false
  }

  /**
   * 初始化 RTL 支持
   */
  init(options = {}) {
    this.enabled = options.enabled ?? true
    this.autoDetect = options.autoDetect ?? false

    // 自动检测浏览器语言
    if (this.autoDetect) {
      this.detectFromBrowser()
    }

    return this
  }

  /**
   * 设置当前语言方向
   */
  setDirection(direction) {
    if (direction !== 'ltr' && direction !== 'rtl') {
      console.warn('Invalid direction. Use "ltr" or "rtl"')
      return
    }

    this.currentDirection = direction
    this.applyDirectionToDocument(direction)
    this.emit('direction:change', direction)

    // 保存到 localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('rtl-direction', direction)
    }
  }

  /**
   * 根据 locale 设置方向
   */
  setLocale(locale) {
    const direction = getLocaleDirection(locale)
    this.setDirection(direction)
    return direction
  }

  /**
   * 应用方向到文档
   */
  applyDirectionToDocument(direction) {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = direction
      document.documentElement.lang = direction === 'rtl' ? 'ar' : 'en'
      document.body.classList.toggle('rtl', direction === 'rtl')
      document.body.classList.toggle('ltr', direction === 'ltr')
    }
  }

  /**
   * 从浏览器检测语言
   */
  detectFromBrowser() {
    if (typeof navigator !== 'undefined') {
      const browserLang = navigator.language || navigator.userLanguage
      const direction = getLocaleDirection(browserLang)
      this.setDirection(direction)
    }
  }

  /**
   * 从 localStorage 恢复方向
   */
  restoreFromStorage() {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('rtl-direction')
      if (saved) {
        this.setDirection(saved)
        return saved
      }
    }
    return null
  }

  /**
   * 切换方向
   */
  toggle() {
    const newDirection = this.currentDirection === 'ltr' ? 'rtl' : 'ltr'
    this.setDirection(newDirection)
    return newDirection
  }

  /**
   * 获取当前方向
   */
  getDirection() {
    // 尝试从 localStorage 恢复
    if (!this.direction && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('rtl-direction')
      if (saved) {
        this.currentDirection = saved
      }
    }
    return this.currentDirection
  }

  /**
   * 判断是否为 RTL 模式
   */
  isRtl() {
    return this.currentDirection === 'rtl'
  }

  /**
   * 获取 RTL 相关的 CSS 类名
   */
  getRtlClass(className) {
    return this.isRtl() ? `${className}-rtl` : className
  }

  /**
   * 获取 RTL 相关的样式
   */
  getRtlStyle(styles) {
    if (!this.isRtl()) return styles

    const rtlStyles = {}
    for (const [key, value] of Object.entries(styles)) {
      const mappedKey = this.#mapCssProperty(key)
      rtlStyles[mappedKey] = value
    }
    return rtlStyles
  }

  /**
   * 映射 CSS 属性名
   */
  #mapCssProperty(property) {
    const mapping = {
      marginLeft: 'marginRight',
      marginRight: 'marginLeft',
      paddingLeft: 'paddingRight',
      paddingRight: 'paddingLeft',
      borderLeft: 'borderRight',
      borderRight: 'borderLeft',
      left: 'right',
      right: 'left',
      textAlign: 'textAlign',
      float: 'float',
    }

    return mapping[property] || property
  }

  /**
   * 获取 RTL 状态下的对齐方式
   */
  getTextAlign(align) {
    if (align === 'left') return this.isRtl() ? 'right' : 'left'
    if (align === 'right') return this.isRtl() ? 'left' : 'right'
    return align
  }

  /**
   * 反转水平位置值
   */
  flipHorizontal(value, max) {
    if (!this.isRtl()) return value
    return max - value
  }

  /**
   * 获取水平镜像值
   */
  getMirroredValue(value, isHorizontal = true) {
    if (!isHorizontal || !this.isRtl()) return value
    return -value
  }

  /**
   * 应用 RTL 转换到元素
   */
  applyToElement(element) {
    if (!element) return

    const direction = this.isRtl() ? 'rtl' : 'ltr'
    element.style.direction = direction
    element.style.textAlign = this.getTextAlign(element.style.textAlign || 'left')
  }

  /**
   * 获取所有 RTL 语言
   */
  getRtlLanguages() {
    return RTL_LOCALES
  }

  /**
   * 检查是否支持 RTL
   */
  hasRtlSupport() {
    return true
  }
}

// 导出单例
export const rtlManager = new RtlManagerClass()

// 导出工具函数
export function isRtl(locale) {
  return isRtlLocale(locale)
}

export function getDirection(locale) {
  return getLocaleDirection(locale)
}

// 默认导出
export default rtlManager
