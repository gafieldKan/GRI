/**
 * 页面路由管理器
 * 实现页面树管理、路由配置、菜单自动生成
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 页面类型枚举
 */
export const PageType = {
  PAGE: 'page',
  FOLDER: 'folder',
  LINK: 'link',
  IFRAME: 'iframe',
}

/**
 * 页面状态枚举
 */
export const PageState = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
}

/**
 * 页面配置类
 */
export class PageConfig {
  constructor(config = {}) {
    this.id = config.id || this.#generateId()
    this.name = config.name || ''
    this.title = config.title || ''
    this.description = config.description || ''
    this.icon = config.icon || ''
    this.path = config.path || ''
    this.component = config.component || ''
    this.parentId = config.parentId || null
    this.type = config.type || PageType.PAGE
    this.state = config.state || PageState.DRAFT
    this.permission = config.permission || null
    this.visible = config.visible ?? true
    this.hidden = config.hidden || false
    this.sort = config.sort || 0
    this.props = config.props || {}
    this.meta = config.meta || {}
    this.children = []
    this.createdAt = config.createdAt || Date.now()
    this.updatedAt = config.updatedAt || Date.now()
  }

  #generateId() {
    return `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  addChild(childConfig) {
    const child = new PageConfig({ ...childConfig, parentId: this.id })
    this.children.push(child)
    return child
  }

  removeChild(childId) {
    const index = this.children.findIndex((c) => c.id === childId)
    if (index > -1) {
      this.children.splice(index, 1)
      return true
    }
    return false
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      title: this.title,
      path: this.path,
      component: this.component,
      parentId: this.parentId,
      type: this.type,
      state: this.state,
      permission: this.permission,
      visible: this.visible,
      hidden: this.hidden,
      sort: this.sort,
      props: this.props,
      meta: this.meta,
      children: this.children.map((c) => c.toJSON()),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}

/**
 * 路由解析器
 */
class RouteParser {
  static parseParams(pattern, path) {
    const params = {}
    const patternParts = pattern.split('/')
    const pathParts = path.split('/')

    if (patternParts.length !== pathParts.length) {
      return null
    }

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i]
      const pathPart = pathParts[i]

      if (patternPart.startsWith(':')) {
        params[patternPart.slice(1)] = decodeURIComponent(pathPart)
      } else if (patternPart !== pathPart) {
        return null
      }
    }

    return params
  }

  static match(pattern, path) {
    if (pattern === path) return {}
    return this.parseParams(pattern, path)
  }

  static generate(pattern, params = {}) {
    let path = pattern
    for (const [key, value] of Object.entries(params)) {
      path = path.replace(`:${key}`, encodeURIComponent(value))
    }
    return path
  }
}

/**
 * 菜单项类
 */
export class MenuItem {
  constructor(config = {}) {
    this.id = config.id || ''
    this.name = config.name || ''
    this.title = config.title || ''
    this.icon = config.icon || ''
    this.path = config.path || ''
    this.children = config.children || []
    this.visible = config.visible ?? true
    this.sort = config.sort || 0
    this.permission = config.permission
    this.meta = config.meta || {}
  }
}

/**
 * 路由管理器主类
 */
class RouteManagerClass extends EventEmitter {
  constructor() {
    super()
    this.pages = new Map()
    this.pageIndex = new Map()
    this.routes = []
    this.basePath = ''
  }

  /**
   * 注册页面
   */
  register(config) {
    const page = new PageConfig(config)
    this.pages.set(page.id, page)
    this.pageIndex.set(page.path, page)

    if (page.parentId) {
      const parent = this.pages.get(page.parentId)
      if (parent) {
        parent.addChild(config)
      }
    }

    this.emit('page:register', { page })
    return page
  }

  /**
   * 批量注册页面
   */
  registerAll(pages) {
    pages.forEach((config) => this.register(config))
    return this
  }

  /**
   * 获取页面
   */
  get(id) {
    return this.pages.get(id)
  }

  /**
   * 通过路径获取页面
   */
  getByPath(path) {
    return this.pageIndex.get(path) || null
  }

  /**
   * 获取所有页面
   */
  getAll() {
    return Array.from(this.pages.values())
  }

  /**
   * 获取根页面列表
   */
  getRootPages() {
    return this.getAll().filter((p) => !p.parentId)
  }

  /**
   * 删除页面
   */
  delete(id) {
    const page = this.pages.get(id)
    if (page) {
      this.pageIndex.delete(page.path)
      this.pages.delete(id)
      this.emit('page:delete', { id })
      return true
    }
    return false
  }

  /**
   * 更新页面
   */
  update(id, updates) {
    const page = this.pages.get(id)
    if (!page) {
      throw new Error(`页面不存在：${id}`)
    }

    Object.assign(page, updates)
    page.updatedAt = Date.now()
    this.emit('page:update', { id, page })
    return page
  }

  /**
   * 获取页面树
   */
  getPageTree(parentId = null) {
    const pages = this.getAll()
    const tree = []

    pages
      .filter((p) => p.parentId === parentId)
      .forEach((page) => {
        const node = { ...page.toJSON() }
        node.children = this.getPageTree(page.id)
        tree.push(node)
      })

    return tree
  }

  /**
   * 生成菜单（带权限过滤）
   */
  generateMenu(userId = null, userRoles = []) {
    const pages = this.getRootPages()
    return this.buildMenuItems(pages, userId, userRoles)
  }

  /**
   * 构建菜单项
   */
  buildMenuItems(pages, userId, userRoles) {
    const items = []

    pages
      .filter((p) => p.visible && !p.hidden)
      .filter((p) => this.checkPermission(p, userId, userRoles))
      .sort((a, b) => a.sort - b.sort)
      .forEach((page) => {
        const item = new MenuItem({
          id: page.id,
          name: page.name,
          title: page.title,
          icon: page.icon,
          path: page.path,
          meta: page.meta,
          children:
            page.children.length > 0 ? this.buildMenuItems(page.children, userId, userRoles) : [],
        })
        items.push(item)
      })

    return items
  }

  /**
   * 检查权限
   */
  checkPermission(page, userId, userRoles) {
    if (!page.permission) return true
    if (!userId || !userRoles) return !page.permission

    // 实际权限检查逻辑，可接入 permissionManager
    return true
  }

  /**
   * 匹配路由
   */
  matchRoute(path) {
    for (const page of this.pages.values()) {
      const params = RouteParser.match(page.path, path)
      if (params !== null) {
        return { page, params }
      }
    }
    return null
  }

  /**
   * 生成路由配置
   */
  generateRoutes() {
    const routes = []

    for (const page of this.pages.values()) {
      routes.push({
        path: page.path,
        component: page.component,
        props: page.props,
        meta: page.meta,
        children: page.children.length > 0 ? this.generateRoutesFromPages(page.children) : [],
      })
    }

    return routes
  }

  generateRoutesFromPages(pages) {
    return pages.map((page) => ({
      path: page.path,
      component: page.component,
      props: page.props,
      meta: page.meta,
    }))
  }

  /**
   * 导出为 JSON
   */
  exportJSON() {
    return JSON.stringify(this.getPageTree(), null, 2)
  }

  /**
   * 从 JSON 导入
   */
  importJSON(jsonString) {
    try {
      const pages = JSON.parse(jsonString)
      pages.forEach((config) => this.register(config))
      return true
    } catch (error) {
      throw new Error(`导入页面失败：${error.message}`)
    }
  }

  /**
   * 清空所有页面
   */
  clear() {
    this.pages.clear()
    this.pageIndex.clear()
    this.emit('clear')
  }
}

// 导出单例
export const routeManager = new RouteManagerClass()
export default routeManager
