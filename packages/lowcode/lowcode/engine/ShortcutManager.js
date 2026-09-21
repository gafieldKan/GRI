/**
 * 全局快捷键管理器
 * 支持自定义快捷键绑定、组合键、快捷键冲突解决
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 快捷键配置类
 */
export class ShortcutConfig {
  constructor(config = {}) {
    this.key = config.key || '' // 如 'Ctrl+S', 'Cmd+K'
    this.handler = config.handler || null
    this.description = config.description || ''
    this.scope = config.scope || 'global' // global, editor, form
    this.preventDefault = config.preventDefault ?? true
    this.enabled = config.enabled ?? true
  }
}

/**
 * 快捷键管理器主类
 */
class ShortcutManagerClass extends EventEmitter {
  constructor() {
    super()
    this.shortcuts = new Map()
    this.activeScope = 'global'
    this.scopes = ['global']
    this.history = []
    this.historyIndex = -1
    this.maxHistory = 50
  }

  /**
   * 初始化快捷键管理器
   */
  init(config = {}) {
    // 注册默认快捷键
    this.registerDefaults()

    // 监听键盘事件
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.#handleKeyDown.bind(this))
    }

    this.emit('init', { config })
    return this
  }

  /**
   * 注册默认快捷键
   */
  registerDefaults() {
    // 保存 Ctrl+S
    this.register({
      key: 'Ctrl+S',
      handler: () => this.emit('save'),
      description: '保存',
      scope: 'global',
    })

    // 撤销 Ctrl+Z
    this.register({
      key: 'Ctrl+Z',
      handler: () => this.emit('undo'),
      description: '撤销',
      scope: 'global',
    })

    // 重做 Ctrl+Y / Ctrl+Shift+Z
    this.register({
      key: 'Ctrl+Y',
      handler: () => this.emit('redo'),
      description: '重做',
      scope: 'global',
    })

    // 搜索 Ctrl+F
    this.register({
      key: 'Ctrl+F',
      handler: () => this.emit('search'),
      description: '搜索',
      scope: 'global',
    })

    // 新建 Ctrl+N
    this.register({
      key: 'Ctrl+N',
      handler: () => this.emit('new'),
      description: '新建',
      scope: 'global',
    })

    // 打开 Ctrl+O
    this.register({
      key: 'Ctrl+O',
      handler: () => this.emit('open'),
      description: '打开',
      scope: 'global',
    })

    // 复制 Ctrl+C
    this.register({
      key: 'Ctrl+C',
      handler: () => this.emit('copy'),
      description: '复制',
      scope: 'global',
    })

    // 粘贴 Ctrl+V
    this.register({
      key: 'Ctrl+V',
      handler: () => this.emit('paste'),
      description: '粘贴',
      scope: 'global',
    })

    // 剪切 Ctrl+X
    this.register({
      key: 'Ctrl+X',
      handler: () => this.emit('cut'),
      description: '剪切',
      scope: 'global',
    })

    // 删除 Delete/Backspace
    this.register({
      key: 'Delete',
      handler: () => this.emit('delete'),
      description: '删除',
      scope: 'editor',
    })

    // 撤销 Mac Cmd+Z
    this.register({
      key: 'Cmd+Z',
      handler: () => this.emit('undo'),
      description: '撤销 (Mac)',
      scope: 'global',
    })

    // 重做 Mac Cmd+Shift+Z
    this.register({
      key: 'Cmd+Shift+Z',
      handler: () => this.emit('redo'),
      description: '重做 (Mac)',
      scope: 'global',
    })

    // 帮助 F1
    this.register({
      key: 'F1',
      handler: () => this.emit('help'),
      description: '帮助',
      scope: 'global',
    })

    // 全屏 F11
    this.register({
      key: 'F11',
      handler: () => this.emit('fullscreen'),
      description: '全屏',
      scope: 'global',
    })
  }

  /**
   * 注册快捷键
   */
  register(config) {
    const shortcut = new ShortcutConfig(config)
    const id = this.#generateId(shortcut.key, shortcut.scope)
    this.shortcuts.set(id, shortcut)
    this.emit('shortcut:register', { shortcut })
    return shortcut
  }

  /**
   * 注销快捷键
   */
  unregister(key, scope = 'global') {
    const id = this.#generateId(key, scope)
    if (this.shortcuts.has(id)) {
      const shortcut = this.shortcuts.get(id)
      shortcut.enabled = false
      this.shortcuts.set(id, shortcut)
      this.emit('shortcut:unregister', { shortcut })
      return true
    }
    return false
  }

  /**
   * 设置作用域
   */
  setScope(scope) {
    if (!this.scopes.includes(scope)) {
      this.scopes.push(scope)
    }
    this.activeScope = scope
    this.emit('scope:change', { scope })
  }

  /**
   * 获取当前作用域
   */
  getScope() {
    return this.activeScope
  }

  /**
   * 获取所有快捷键
   */
  getAllShortcuts() {
    return Array.from(this.shortcuts.values())
  }

  /**
   * 获取指定作用域的快捷键
   */
  getByScope(scope) {
    return this.getAllShortcuts().filter((s) => s.scope === scope)
  }

  /**
   * 执行快捷键
   */
  execute(key, event) {
    const shortcut = this.#findShortcut(key, this.activeScope)
    if (shortcut && shortcut.enabled) {
      shortcut.handler?.(event)
      return true
    }
    return false
  }

  /**
   * 添加到历史记录
   */
  addToHistory(action) {
    // 如果当前不在历史末尾，截断后面的历史
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1)
    }

    this.history.push(action)

    // 限制历史长度
    if (this.history.length > this.maxHistory) {
      this.history.shift()
    } else {
      this.historyIndex++
    }

    this.emit('history:add', { action, index: this.historyIndex })
  }

  /**
   * 撤销
   */
  undo() {
    if (this.historyIndex >= 0) {
      const action = this.history[this.historyIndex]
      action.onUndo?.()
      this.historyIndex--
      this.emit('history:undo', { action })
      return true
    }
    return false
  }

  /**
   * 重做
   */
  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++
      const action = this.history[this.historyIndex]
      action.onRedo?.()
      this.emit('history:redo', { action })
      return true
    }
    return false
  }

  /**
   * 清空历史
   */
  clearHistory() {
    this.history = []
    this.historyIndex = -1
    this.emit('history:clear')
  }

  /**
   * 获取历史状态
   */
  getHistoryState() {
    return {
      canUndo: this.historyIndex >= 0,
      canRedo: this.historyIndex < this.history.length - 1,
      currentIndex: this.historyIndex,
      totalLength: this.history.length,
    }
  }

  // ==================== 私有方法 ====================

  #handleKeyDown(event) {
    const key = this.#normalizeKey(event)

    // 如果在输入框中，不处理全局快捷键
    if (this.#isInputTarget(event.target)) {
      return
    }

    // 查找并执行快捷键
    if (this.execute(key, event)) {
      event.preventDefault()
    }
  }

  #normalizeKey(event) {
    const keys = []

    if (event.ctrlKey || event.metaKey) {
      keys.push(event.ctrlKey ? 'Ctrl' : 'Cmd')
    }
    if (event.shiftKey) {
      keys.push('Shift')
    }
    if (event.altKey) {
      keys.push('Alt')
    }

    const key = event.key.toUpperCase()
    keys.push(key)

    return keys.join('+')
  }

  #findShortcut(key, scope) {
    // 优先查找当前作用域
    const scoped = this.#getShortcutByKey(key, scope)
    if (scoped) return scoped

    // 回退到全局作用域
    if (scope !== 'global') {
      return this.#getShortcutByKey(key, 'global')
    }

    return null
  }

  #getShortcutByKey(key, scope) {
    for (const shortcut of this.shortcuts.values()) {
      if (shortcut.key === key && shortcut.scope === scope) {
        return shortcut
      }
    }
    return null
  }

  #generateId(key, scope) {
    return `${scope}:${key.toLowerCase()}`
  }

  #isInputTarget(target) {
    const tagName = target.tagName.toLowerCase()
    const isInput =
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      target.isContentEditable

    return isInput
  }
}

// 导出单例
export const shortcutManager = new ShortcutManagerClass()

// 导出工具函数
export function createShortcutManager() {
  return new ShortcutManagerClass()
}

export default shortcutManager
