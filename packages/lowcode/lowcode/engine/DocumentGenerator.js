/**
 * 文档生成管理器
 * 支持生成 PDF、Word 等格式文档
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 文档类型枚举
 */
export const DocumentType = {
  PDF: 'pdf',
  WORD: 'word',
  EXCEL: 'excel',
  HTML: 'html',
  TEXT: 'text',
}

/**
 * 文档生成管理器主类
 */
class DocumentGeneratorClass extends EventEmitter {
  constructor() {
    super()
    this.templates = new Map()
  }

  /**
   * 初始化
   */
  init(config = {}) {
    this.emit('init', { config })
    return this
  }

  /**
   * 生成 PDF 文档
   */
  async generatePDF(config) {
    const { content, filename = 'document.pdf', options = {} } = config

    this.emit('generate:start', { type: DocumentType.PDF, config })

    // 创建 PDF Blob
    const blob = await this.#createPDFBlob(content, options)

    // 下载
    this.#downloadBlob(blob, filename)

    this.emit('generate:complete', { type: DocumentType.PDF, filename })
    return { success: true, type: DocumentType.PDF, filename }
  }

  /**
   * 生成 Word 文档
   */
  async generateWord(config) {
    const { content, filename = 'document.docx', options = {} } = config

    this.emit('generate:start', { type: DocumentType.WORD, config })

    // 创建 Word HTML 格式（兼容 Word）
    const blob = await this.#createWordBlob(content, options)

    // 下载
    this.#downloadBlob(blob, filename)

    this.emit('generate:complete', { type: DocumentType.WORD, filename })
    return { success: true, type: DocumentType.WORD, filename }
  }

  /**
   * 生成 Excel 文档
   */
  async generateExcel(config) {
    const { data, filename = 'document.xlsx', options = {} } = config

    this.emit('generate:start', { type: DocumentType.EXCEL, config })

    // 创建 CSV/Excel 格式
    const blob = await this.#createExcelBlob(data, options)

    // 下载
    this.#downloadBlob(blob, filename)

    this.emit('generate:complete', { type: DocumentType.EXCEL, filename })
    return { success: true, type: DocumentType.EXCEL, filename }
  }

  /**
   * 生成 HTML 文档
   */
  async generateHTML(config) {
    const { content, filename = 'document.html', options = {} } = config

    this.emit('generate:start', { type: DocumentType.HTML, config })

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${options.title || '文档'}</title>
  <style>${options.styles || ''}</style>
</head>
<body>
  ${content}
</body>
</html>
`

    const blob = new Blob([html], { type: 'text/html' })
    this.#downloadBlob(blob, filename)

    this.emit('generate:complete', { type: DocumentType.HTML, filename })
    return { success: true, type: DocumentType.HTML, filename }
  }

  /**
   * 批量生成文档
   */
  async generateBatch(configs) {
    const results = []
    for (const config of configs) {
      try {
        const result = await this.generate(config)
        results.push(result)
      } catch (error) {
        results.push({ success: false, error: error.message })
      }
    }
    return results
  }

  // ==================== 私有方法 ====================

  async #createPDFBlob(content, options) {
    // 使用浏览器打印功能生成 PDF
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @media print {
      body { margin: 0; }
    }
    ${options.styles || ''}
  </style>
</head>
<body>
  ${content}
</body>
</html>`

    return new Blob([html], { type: 'text/html' })
  }

  async #createWordBlob(content, options) {
    const html = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <!--[if gte mso 9]>
  <xml>
    <o:WordDocument>
      <o:View>Normal</o:View>
      <o:Zoom>100</o:Zoom>
    </o:WordDocument>
  </xml>
  <![endif]-->
  <style>${options.styles || ''}</style>
</head>
<body>
  ${content}
</body>
</html>`

    return new Blob([html], { type: 'application/msword' })
  }

  async #createExcelBlob(data, options) {
    // 创建 CSV 格式
    if (Array.isArray(data)) {
      const csv = data.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')
      return new Blob([csv], { type: 'text/csv' })
    }
    return new Blob([JSON.stringify(data)], { type: 'application/json' })
  }

  #downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}

// 导出单例
export const documentGenerator = new DocumentGeneratorClass()

// 导出工具函数
export function createDocumentGenerator() {
  return new DocumentGeneratorClass()
}

export default documentGenerator
