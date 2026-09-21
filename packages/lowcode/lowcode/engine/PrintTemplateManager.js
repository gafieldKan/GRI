/**
 * 打印模板管理器
 * 支持打印模板设计、预览、打印功能
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 纸张尺寸枚举
 */
export const PaperSize = {
  A4: 'a4',
  A3: 'a3',
  A5: 'a5',
  LETTER: 'letter',
  LEGAL: 'legal',
  CUSTOM: 'custom',
}

/**
 * 打印方向枚举
 */
export const PrintOrientation = {
  PORTRAIT: 'portrait',
  LANDSCAPE: 'landscape',
}

/**
 * 打印模板类
 */
export class PrintTemplate {
  constructor(config = {}) {
    this.id = config.id || `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    this.name = config.name || '未命名模板'
    this.description = config.description || ''
    this.paperSize = config.paperSize || PaperSize.A4
    this.paperWidth = config.paperWidth || 210 // mm
    this.paperHeight = config.paperHeight || 297 // mm
    this.orientation = config.orientation || PrintOrientation.PORTRAIT
    this.margins = config.margins || { top: 10, right: 10, bottom: 10, left: 10 }
    this.header = config.header || null
    this.footer = config.footer || null
    this.body = config.body || null
    this.styles = config.styles || {}
    this.dataMapping = config.dataMapping || {}
    this.variables = config.variables || []
    this.createdAt = config.createdAt || Date.now()
    this.updatedAt = config.updatedAt || Date.now()
  }
}

/**
 * 打印模板管理器主类
 */
class PrintTemplateManagerClass extends EventEmitter {
  constructor() {
    super()
    this.templates = new Map()
    this.currentTemplate = null
  }

  /**
   * 初始化
   */
  init(config = {}) {
    this.emit('init', { config })
    return this
  }

  /**
   * 创建打印模板
   */
  create(config) {
    const template = new PrintTemplate(config)
    this.templates.set(template.id, template)
    this.emit('template:create', { template })
    return template
  }

  /**
   * 获取模板
   */
  get(templateId) {
    return this.templates.get(templateId)
  }

  /**
   * 更新模板
   */
  update(templateId, updates) {
    const template = this.templates.get(templateId)
    if (!template) return false

    Object.assign(template, updates, { updatedAt: Date.now() })
    this.emit('template:update', { template })
    return true
  }

  /**
   * 删除模板
   */
  delete(templateId) {
    const template = this.templates.get(templateId)
    if (template) {
      this.templates.delete(templateId)
      this.emit('template:delete', { templateId })
      return true
    }
    return false
  }

  /**
   * 设置当前模板
   */
  setCurrent(templateId) {
    const template = this.templates.get(templateId)
    if (template) {
      this.currentTemplate = template
      this.emit('template:setCurrent', { template })
      return true
    }
    return false
  }

  /**
   * 预览打印
   */
  async preview(templateId, data = {}) {
    const template = this.templates.get(templateId)
    if (!template) throw new Error('模板不存在')

    return {
      template,
      data,
      html: this.#generateHTML(template, data),
    }
  }

  /**
   * 执行打印
   */
  async print(templateId, data = {}, options = {}) {
    const template = this.templates.get(templateId)
    if (!template) throw new Error('模板不存在')

    this.emit('print:start', { template, data })

    // 生成打印内容
    const html = this.#generateHTML(template, data)

    // 打开打印窗口
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      throw new Error('无法打开打印窗口')
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${template.name}</title>
        <style>
          @page {
            size: ${template.paperSize} ${template.orientation};
            margin: ${template.margins.top}mm ${template.margins.right}mm ${template.margins.bottom}mm ${template.margins.left}mm;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
          }
          .print-header { ${this.#objectToCSS(template.styles.header || {})} }
          .print-body { ${this.#objectToCSS(template.styles.body || {})} }
          .print-footer { ${this.#objectToCSS(template.styles.footer || {})} }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        ${html}
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() {
              window.close();
            };
          };
        </script>
      </html>
    `)

    printWindow.document.close()

    this.emit('print:complete', { template, data })
    return { success: true }
  }

  /**
   * 导出为 PDF
   */
  async exportToPDF(templateId, data = {}) {
    const template = this.templates.get(templateId)
    if (!template) throw new Error('模板不存在')

    // 提示用户使用浏览器打印为 PDF
    const result = await this.print(templateId, data, { toPDF: true })
    return result
  }

  /**
   * 获取所有模板
   */
  getAllTemplates() {
    return Array.from(this.templates.values())
  }

  /**
   * 导入模板
   */
  import(jsonString) {
    try {
      const config = JSON.parse(jsonString)
      const template = new PrintTemplate(config)
      this.templates.set(template.id, template)
      this.emit('template:import', { template })
      return template
    } catch (error) {
      throw new Error('导入模板失败：' + error.message)
    }
  }

  /**
   * 导出模板
   */
  export(templateId) {
    const template = this.templates.get(templateId)
    if (!template) return null
    return JSON.stringify(template, null, 2)
  }

  // ==================== 私有方法 ====================

  #generateHTML(template, data) {
    const header = template.header ? this.#renderTemplate(template.header, data) : ''
    const body = template.body ? this.#renderTemplate(template.body, data) : ''
    const footer = template.footer ? this.#renderTemplate(template.footer, data) : ''

    return `
      <div class="print-container">
        ${header ? `<div class="print-header">${header}</div>` : ''}
        <div class="print-body">${body}</div>
        ${footer ? `<div class="print-footer">${footer}</div>` : ''}
      </div>
    `
  }

  #renderTemplate(template, data) {
    if (!template) return ''
    let content = typeof template === 'string' ? template : JSON.stringify(template)

    // 替换变量 {{variable}}
    for (const [key, value] of Object.entries(data)) {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
    }

    return content
  }

  #objectToCSS(obj) {
    return Object.entries(obj)
      .map(([key, value]) => `${key}: ${value};`)
      .join(' ')
  }
}

// 导出单例
export const printTemplateManager = new PrintTemplateManagerClass()

// 导出工具函数
export function createPrintTemplateManager() {
  return new PrintTemplateManagerClass()
}

export default printTemplateManager
