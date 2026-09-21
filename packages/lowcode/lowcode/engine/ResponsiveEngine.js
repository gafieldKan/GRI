/**
 * 响应式引擎
 * 支持多端适配、响应式布局配置、移动端优化
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 设备类型枚举
 */
export const DeviceType = {
  MOBILE: 'mobile',
  TABLET: 'tablet',
  DESKTOP: 'desktop',
  TV: 'tv',
}

/**
 * 屏幕尺寸枚举
 */
export const ScreenSize = {
  XS: 'xs', // < 576px
  SM: 'sm', // >= 576px
  MD: 'md', // >= 768px
  LG: 'lg', // >= 992px
  XL: 'xl', // >= 1200px
  XXL: 'xxl', // >= 1600px
}

/**
 * 方向枚举
 */
export const Orientation = {
  PORTRAIT: 'portrait',
  LANDSCAPE: 'landscape',
}

/**
 * 断点配置
 */
export const BREAKPOINTS = {
  xs: { min: 0, max: 575 },
  sm: { min: 576, max: 767 },
  md: { min: 768, max: 991 },
  lg: { min: 992, max: 1199 },
  xl: { min: 1200, max: 1599 },
  xxl: { min: 1600, max: Infinity },
}

/**
 * 设备信息类
 */
export class DeviceInfo {
  constructor() {
    this.type = this.getDeviceType()
    this.size = this.getScreenSize()
    this.orientation = this.getOrientation()
    this.pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio : 1
    this.touchSupport = typeof window !== 'undefined' && 'ontouchstart' in window
  }

  getDeviceType() {
    if (typeof window === 'undefined') return DeviceType.DESKTOP

    const ua = navigator.userAgent
    if (/mobile/i.test(ua)) {
      return DeviceType.MOBILE
    }
    if (/tablet/i.test(ua)) {
      return DeviceType.TABLET
    }
    if (/tv/i.test(ua)) {
      return DeviceType.TV
    }
    return DeviceType.DESKTOP
  }

  getScreenSize() {
    if (typeof window === 'undefined') return ScreenSize.LG

    const width = window.innerWidth
    if (width < BREAKPOINTS.sm.min) return ScreenSize.xs
    if (width < BREAKPOINTS.md.min) return ScreenSize.sm
    if (width < BREAKPOINTS.lg.min) return ScreenSize.md
    if (width < BREAKPOINTS.xl.min) return ScreenSize.lg
    if (width < BREAKPOINTS.xxl.min) return ScreenSize.xl
    return ScreenSize.xxl
  }

  getOrientation() {
    if (typeof window === 'undefined') return Orientation.LANDSCAPE
    return window.innerWidth > window.innerHeight ? Orientation.LANDSCAPE : Orientation.PORTRAIT
  }

  matches(size) {
    const breakpoint = BREAKPOINTS[size]
    if (!breakpoint) return false

    if (typeof window === 'undefined') return false
    const width = window.innerWidth

    return width >= breakpoint.min && width <= breakpoint.max
  }
}

/**
 * 响应式配置类
 */
export class ResponsiveConfig {
  constructor(config = {}) {
    this.base = config.base || {}
    this.xs = config.xs || {}
    this.sm = config.sm || {}
    this.md = config.md || {}
    this.lg = config.lg || {}
    this.xl = config.xl || {}
    this.xxl = config.xxl || {}
  }

  getStyles(currentSize = ScreenSize.LG) {
    const styles = { ...this.base }

    // 按断点合并样式
    if (currentSize === ScreenSize.xs) Object.assign(styles, this.xs)
    if (currentSize >= ScreenSize.sm) Object.assign(styles, this.sm)
    if (currentSize >= ScreenSize.md) Object.assign(styles, this.md)
    if (currentSize >= ScreenSize.lg) Object.assign(styles, this.lg)
    if (currentSize >= ScreenSize.xl) Object.assign(styles, this.xl)
    if (currentSize >= ScreenSize.xxl) Object.assign(styles, this.xxl)

    return styles
  }

  toJSON() {
    return {
      base: this.base,
      xs: this.xs,
      sm: this.sm,
      md: this.md,
      lg: this.lg,
      xl: this.xl,
      xxl: this.xxl,
    }
  }
}

/**
 * 栅格系统类
 */
export class GridSystem {
  constructor(columns = 12) {
    this.columns = columns
    this.gutter = 16
  }

  /**
   * 生成栅格类名
   */
  generateClasses(span, offset = 0) {
    return {
      col: true,
      [`col-${span}`]: span,
      [`offset-${offset}`]: offset,
    }
  }

  /**
   * 响应式栅格
   */
  generateResponsiveClasses(config) {
    const classes = { col: true }

    if (config.xs) classes[`col-xs-${config.xs}`] = true
    if (config.sm) classes[`col-sm-${config.sm}`] = true
    if (config.md) classes[`col-md-${config.md}`] = true
    if (config.lg) classes[`col-lg-${config.lg}`] = true
    if (config.xl) classes[`col-xl-${config.xl}`] = true
    if (config.xxl) classes[`col-xxl-${config.xxl}`] = true

    return classes
  }
}

/**
 * 响应式引擎主类
 */
class ResponsiveEngineClass extends EventEmitter {
  constructor() {
    super()
    this.deviceInfo = null
    this.listeners = new Map()
    this.currentSize = ScreenSize.lg

    if (typeof window !== 'undefined') {
      this.deviceInfo = new DeviceInfo()
      this.currentSize = this.deviceInfo.size
      this.#initResizeListener()
    }
  }

  #initResizeListener() {
    let resizeTimer
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        const newSize = this.deviceInfo.getScreenSize()
        if (newSize !== this.currentSize) {
          this.currentSize = newSize
          this.emit('resize', { size: newSize, device: this.deviceInfo })
        }
      }, 100)
    })
  }

  /**
   * 获取当前设备信息
   */
  getDeviceInfo() {
    if (typeof window === 'undefined') {
      return new DeviceInfo()
    }
    return this.deviceInfo || new DeviceInfo()
  }

  /**
   * 检查是否为移动设备
   */
  isMobile() {
    return this.getDeviceInfo().type === DeviceType.MOBILE
  }

  /**
   * 检查是否为平板设备
   */
  isTablet() {
    return this.getDeviceInfo().type === DeviceType.TABLET
  }

  /**
   * 检查是否为桌面设备
   */
  isDesktop() {
    return this.getDeviceInfo().type === DeviceType.DESKTOP
  }

  /**
   * 获取当前屏幕尺寸
   */
  getScreenSize() {
    return this.currentSize
  }

  /**
   * 检查是否匹配指定尺寸
   */
  matches(size) {
    return this.currentSize === size
  }

  /**
   * 检查是否大于等于指定尺寸
   */
  matchesUp(size) {
    const sizes = [
      ScreenSize.xs,
      ScreenSize.sm,
      ScreenSize.md,
      ScreenSize.lg,
      ScreenSize.xl,
      ScreenSize.xxl,
    ]
    const index = sizes.indexOf(size)
    const currentIndex = sizes.indexOf(this.currentSize)
    return currentIndex >= index
  }

  /**
   * 检查是否小于指定尺寸
   */
  matchesDown(size) {
    return !this.matchesUp(size)
  }

  /**
   * 生成响应式样式
   */
  generateResponsiveStyles(config) {
    const device = this.getDeviceInfo()
    const size = device.size

    const styles = { ...config.base }

    if (size === ScreenSize.xs && config.xs) Object.assign(styles, config.xs)
    if (this.matchesUp(ScreenSize.sm) && config.sm) Object.assign(styles, config.sm)
    if (this.matchesUp(ScreenSize.md) && config.md) Object.assign(styles, config.md)
    if (this.matchesUp(ScreenSize.lg) && config.lg) Object.assign(styles, config.lg)
    if (this.matchesUp(ScreenSize.xl) && config.xl) Object.assign(styles, config.xl)
    if (this.matchesUp(ScreenSize.xxl) && config.xxl) Object.assign(styles, config.xxl)

    return styles
  }

  /**
   * 生成栅格类名
   */
  generateGridClasses(config) {
    const grid = new GridSystem()
    return grid.generateResponsiveClasses(config)
  }

  /**
   * 监听尺寸变化
   */
  onResize(callback) {
    this.on('resize', callback)
    return () => this.off('resize', callback)
  }

  /**
   * 监听特定尺寸
   */
  onSizeChange(size, callback) {
    const handler = (data) => {
      if (data.size === size) {
        callback(data)
      }
    }
    this.on('resize', handler)
    return () => this.off('resize', handler)
  }

  /**
   * 事件监听
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event).add(callback)
  }

  /**
   * 移除事件监听
   */
  off(event, callback) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.delete(callback)
    }
  }

  /**
   * 触发事件
   */
  emit(event, data) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach((cb) => cb(data))
    }
  }

  /**
   * 获取 CSS 类名
   */
  getClass(size) {
    return `-${size}`
  }

  /**
   * 生成响应式类名
   */
  getClasses(config) {
    const classes = []
    const device = this.getDeviceInfo()

    if (config.base) classes.push(config.base)
    if (device.size === ScreenSize.xs && config.xs) classes.push(config.xs)
    if (this.matchesUp(ScreenSize.sm) && config.sm) classes.push(config.sm)
    if (this.matchesUp(ScreenSize.md) && config.md) classes.push(config.md)
    if (this.matchesUp(ScreenSize.lg) && config.lg) classes.push(config.lg)
    if (this.matchesUp(ScreenSize.xl) && config.xl) classes.push(config.xl)
    if (this.matchesUp(ScreenSize.xxl) && config.xxl) classes.push(config.xxl)

    return classes.join(' ')
  }
}

// React 相关导出在 React 环境中使用
// 此处不实现具体 HOC/Hook，由 React 适配器提供

// 导出单例
export const responsiveEngine = new ResponsiveEngineClass()
export default responsiveEngine
