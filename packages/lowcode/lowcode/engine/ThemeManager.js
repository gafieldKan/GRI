/**
 * 主题定制管理器
 * 实现 Design Token 系统、主题配置中心
 *
 * @author GRI Team
 * Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 默认主题
 */
const DEFAULT_THEME = {
  id: 'default',
  name: '默认主题',
  tokens: {
    // 颜色
    colors: {
      primary: '#1677ff',
      success: '#52c41a',
      warning: '#faad14',
      error: '#ff4d4f',
      info: '#1677ff',
      text: {
        primary: '#000000e0',
        secondary: '#000000a6',
        tertiary: '#00000073',
        quaternary: '#00000040',
      },
      bg: {
        layout: '#ffffff',
        container: '#f5f5f5',
        disabled: '#f5f5f5',
      },
      border: {
        primary: '#d9d9d9',
        secondary: '#f0f0f0',
      },
    },
    // 圆角
    borderRadius: {
      xs: '2px',
      sm: '4px',
      md: '6px',
      lg: '8px',
      xl: '12px',
    },
    // 间距
    spacing: {
      xs: '4px',
      sm: '8px',
      md: '12px',
      lg: '16px',
      xl: '24px',
      xxl: '32px',
    },
    // 字体
    typography: {
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: {
        xs: '12px',
        sm: '14px',
        md: '16px',
        lg: '18px',
        xl: '20px',
        xxl: '24px',
      },
      fontWeight: {
        normal: '400',
        medium: '500',
        bold: '600',
      },
      lineHeight: {
        sm: '1.5',
        md: '1.5715',
        lg: '1.6',
      },
    },
    // 阴影
    shadows: {
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
      md: '0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
      lg: '0 6px 16px -8px rgba(0, 0, 0, 0.08), 0 9px 28px 0 rgba(0, 0, 0, 0.05), 0 12px 48px 16px rgba(0, 0, 0, 0.03)',
    },
    // 尺寸
    size: {
      xs: '4px',
      sm: '8px',
      md: '12px',
      lg: '16px',
      xl: '24px',
      xxl: '32px',
      xxxl: '48px',
    },
    // 动效
    motion: {
      duration: {
        fast: '0.1s',
        normal: '0.2s',
        slow: '0.3s',
      },
      easing: 'cubic-bezier(0.99, 0, 0.2, 1)',
    },
  },
  components: {},
}

/**
 * 预设主题
 */
const PRESET_THEMES = {
  dark: {
    id: 'dark',
    name: '深色模式',
    tokens: {
      colors: {
        primary: '#177ddc',
        success: '#49aa19',
        warning: '#d89614',
        error: '#a61d1d',
        info: '#177ddc',
        text: {
          primary: '#ffffffe6',
          secondary: '#ffffffa6',
          tertiary: '#ffffff73',
          quaternary: '#ffffff40',
        },
        bg: {
          layout: '#141414',
          container: '#1f1f1f',
          disabled: '#1f1f1f',
        },
        border: {
          primary: '#424242',
          secondary: '#303030',
        },
      },
    },
  },
  compact: {
    id: 'compact',
    name: '紧凑模式',
    tokens: {
      spacing: {
        xs: '2px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        xxl: '20px',
      },
      borderRadius: {
        xs: '1px',
        sm: '2px',
        md: '4px',
        lg: '4px',
        xl: '6px',
      },
    },
  },
}

/**
 * 主题类
 */
export class Theme {
  constructor(config = {}) {
    this.id = config.id || `theme_${Date.now()}`
    this.name = config.name || '自定义主题'
    this.description = config.description || ''
    this.tokens = config.tokens || {}
    this.components = config.components || {}
    this.parent = config.parent || null
    this.isDark = config.isDark || false
    this.isPreset = config.isPreset || false
    this.createdAt = config.createdAt || Date.now()
    this.updatedAt = config.updatedAt || Date.now()
  }

  /**
   * 合并 token
   */
  mergeTokens(tokens) {
    this.tokens = this.deepMerge(this.tokens, tokens)
    this.updatedAt = Date.now()
  }

  /**
   * 深度合并对象
   */
  deepMerge(target, source) {
    const result = { ...target }
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key])
      } else {
        result[key] = source[key]
      }
    }
    return result
  }

  /**
   * 获取 token 值
   */
  getToken(path, defaultValue) {
    const parts = path.split('.')
    let value = this.tokens

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part]
      } else {
        return defaultValue || null
      }
    }

    return value
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      tokens: this.tokens,
      components: this.components,
      parent: this.parent,
      isDark: this.isDark,
      isPreset: this.isPreset,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}

/**
 * CSS 变量生成器
 */
class CssVarGenerator {
  static generate(theme) {
    const cssVars = []
    const prefix = 'lowcode'

    // 生成颜色变量
    if (theme.tokens.colors) {
      cssVars.push(...this.generateColorVars(theme.tokens.colors, prefix))
    }

    // 生成圆角变量
    if (theme.tokens.borderRadius) {
      cssVars.push(...this.generateSizeVars(theme.tokens.borderRadius, 'border-radius', prefix))
    }

    // 生成间距变量
    if (theme.tokens.spacing) {
      cssVars.push(...this.generateSizeVars(theme.tokens.spacing, 'spacing', prefix))
    }

    return cssVars
  }

  static generateColorVars(colors, prefix) {
    const vars = []

    if (colors.primary) vars.push(`--${prefix}-primary: ${colors.primary}`)
    if (colors.success) vars.push(`--${prefix}-success: ${colors.success}`)
    if (colors.warning) vars.push(`--${prefix}-warning: ${colors.warning}`)
    if (colors.error) vars.push(`--${prefix}-error: ${colors.error}`)

    return vars.map((v) => `  ${v};`).join('\n')
  }

  static generateSizeVars(sizes, prefix) {
    const vars = []

    for (const [key, value] of Object.entries(sizes)) {
      vars.push(`--${prefix}-${key}: ${value}`)
    }

    return vars.map((v) => `  ${v};`).join('\n')
  }

  /**
   * 应用主题到页面
   */
  static apply(theme) {
    const styleId = 'lowcode-theme-styles'
    let styleEl = document.getElementById(styleId)

    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }

    const cssContent = this.generateCss(theme)
    styleEl.textContent = cssContent
  }

  /**
   * 生成完整 CSS
   */
  static generateCss(theme) {
    const vars = []
    const tokens = theme.tokens || {}

    // 颜色变量
    if (tokens.colors) {
      const { colors } = tokens
      if (colors.primary) vars.push(`--ant-primary: ${colors.primary}`)
      if (colors.success) vars.push(`--ant-success: ${colors.success}`)
      if (colors.warning) vars.push(`--ant-warning: ${colors.warning}`)
      if (colors.error) vars.push(`--ant-error: ${colors.error}`)
    }

    // 圆角变量
    if (tokens.borderRadius) {
      const { borderRadius } = tokens
      if (borderRadius.sm) vars.push(`--ant-border-radius: ${borderRadius.sm}`)
    }

    return `:root {\n${vars.map((v) => `  ${v};`).join('\n')}\n}`
  }
}

/**
 * 主题管理器主类
 */
class ThemeManagerClass extends EventEmitter {
  constructor() {
    super()
    this.themes = new Map()
    this.currentThemeId = 'default'

    // 初始化默认主题
    const defaultTheme = new Theme(DEFAULT_THEME)
    defaultTheme.isPreset = true
    this.themes.set('default', defaultTheme)

    // 初始化预设主题
    for (const [id, config] of Object.entries(PRESET_THEMES)) {
      const theme = new Theme(config)
      theme.isPreset = true
      theme.isDark = id === 'dark'
      this.themes.set(id, theme)
    }
  }

  /**
   * 注册主题
   */
  register(config) {
    const theme = new Theme(config)
    this.themes.set(theme.id, theme)
    this.emit('theme:register', { theme })
    return theme
  }

  /**
   * 获取主题
   */
  get(id) {
    return this.themes.get(id)
  }

  /**
   * 获取所有主题
   */
  getAll() {
    return Array.from(this.themes.values())
  }

  /**
   * 获取预设主题
   */
  getPresetThemes() {
    return this.getAll().filter((t) => t.isPreset)
  }

  /**
   * 获取自定义主题
   */
  getCustomThemes() {
    return this.getAll().filter((t) => !t.isPreset)
  }

  /**
   * 设置当前主题
   */
  setTheme(id) {
    const theme = this.themes.get(id)
    if (!theme) {
      throw new Error(`主题不存在：${id}`)
    }

    const oldTheme = this.currentThemeId
    this.currentThemeId = id
    this.emit('theme:change', { theme, oldTheme })

    // 应用到页面
    if (typeof document !== 'undefined') {
      CssVarGenerator.apply(theme)
    }

    return theme
  }

  /**
   * 获取当前主题
   */
  getCurrentTheme() {
    return this.themes.get(this.currentThemeId)
  }

  /**
   * 获取当前主题 ID
   */
  getCurrentThemeId() {
    return this.currentThemeId
  }

  /**
   * 删除主题
   */
  delete(id) {
    if (this.themes.get(id)?.isPreset) {
      throw new Error('不能删除预设主题')
    }

    const deleted = this.themes.delete(id)
    if (deleted) {
      this.emit('theme:delete', { id })
    }
    return deleted
  }

  /**
   * 更新主题
   */
  update(id, updates) {
    const theme = this.themes.get(id)
    if (!theme) {
      throw new Error(`主题不存在：${id}`)
    }

    if (updates.tokens) {
      theme.mergeTokens(updates.tokens)
    }

    if (updates.name) theme.name = updates.name
    if (updates.description) theme.description = updates.description

    theme.updatedAt = Date.now()
    this.emit('theme:update', { theme })
    return theme
  }

  /**
   * 导出主题
   */
  export(id) {
    const theme = this.themes.get(id)
    if (!theme) {
      return null
    }
    return JSON.stringify(theme.toJSON(), null, 2)
  }

  /**
   * 导入主题
   */
  import(jsonString) {
    try {
      const data = JSON.parse(jsonString)
      const theme = new Theme(data)
      this.themes.set(theme.id, theme)
      this.emit('theme:import', { theme })
      return theme
    } catch (error) {
      throw new Error(`导入主题失败：${error.message}`)
    }
  }

  /**
   * 切换深色模式
   */
  toggleDark() {
    const current = this.getCurrentTheme()
    const isDark = !current?.isDark

    if (isDark) {
      this.setTheme('dark')
    } else {
      this.setTheme('default')
    }

    return isDark
  }
}

// 导出单例
export const themeManager = new ThemeManagerClass()
export { CssVarGenerator, DEFAULT_THEME, PRESET_THEMES }
export default themeManager
