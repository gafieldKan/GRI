/**
 * 数学公式渲染辅助工具 — 小程序版
 *
 * 小程序限制：
 * - node-canvas 不可用，无法客户端实时渲染 LaTeX
 * - 方案：将 LaTeX 公式提取并标记为服务端渲染，显示时用图片或保留文本
 * - 如需客户端渲染，可使用后端 API 将 LaTeX → SVG/图片
 *
 * 当前实现：标记公式区域，用于后续服务端渲染或手动替换
 */

/**
 * 渲染 LaTeX 公式（小程序版 — 标记为需要服务端渲染）
 * @param {string} text - 包含 LaTeX 公式的文本
 * @returns {string} 渲染后的文本（公式标记为 [math:...]）
 */
export function renderLatex(text) {
  if (!text) return ''

  // Mark display formulas: $$...$$ FIRST to avoid greediness conflicts
  let rendered = text.replace(/\$\$(.+?)\$\$/g, (match, formula) => {
    return `[math-display:${formula.trim()}]`
  })

  // Mark inline formulas: $...$
  rendered = rendered.replace(/\$(.+?)\$/g, (match, formula) => {
    return `[math:${formula.trim()}]`
  })

  return rendered
}

/**
 * 将文本中的 LaTeX 公式替换为 uni-app rich-text 兼容的占位符
 * @param {string} text
 * @returns {string} HTML safe string with formula markers
 */
export function toRichTextNodes(text) {
  if (!text) return ''

  // Replace display formulas FIRST to avoid inline regex greediness
  let html = text.replace(/\$\$(.+?)\$\$/g, (match, formula) => {
    const encoded = formula.trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    return `<p class="math-display" data-latex="${encoded}">${encoded}</p>`
  })

  html = html.replace(/\$(.+?)\$/g, (match, formula) => {
    const encoded = formula.trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    return `<span class="math-inline" data-latex="${encoded}">${encoded}</span>`
  })

  return html
}

/**
 * 检测文本中是否包含 LaTeX 公式
 * @param {string} text
 * @returns {boolean}
 */
export function hasLatex(text) {
  return /\$[^$]+\$/.test(text)
}

/**
 * 提取文本中的 LaTeX 公式
 * @param {string} text
 * @returns {string[]} 公式数组
 */
export function extractFormulas(text) {
  const formulas = []
  const regex = /\$(.+?)\$/g
  let match
  while ((match = regex.exec(text)) !== null) {
    formulas.push(match[1].trim())
  }
  return formulas
}

/**
 * 将纯文本中的基本数学表达式转为 LaTeX 标记
 * @param {string} text
 * @returns {string}
 */
export function autoLatexify(text) {
  if (!text) return ''
  let result = text
  result = result.replace(/(\w+\^[\d\w]+)/g, '$$$1$')
  return result
}

export default { renderLatex, toRichTextNodes, hasLatex, extractFormulas, autoLatexify }