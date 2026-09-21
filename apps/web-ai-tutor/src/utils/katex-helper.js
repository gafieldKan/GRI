// KaTeX LaTeX 渲染辅助工具
import katex from 'katex'

export function renderLatex(text) {
  if (!text) return ''
  try {
    let html = text.replace(/\$\$(.*?)\$\$/gs, (match, formula) => {
      try {
        return katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })
      } catch (e) { return match }
    })
    html = html.replace(/\$(.*?)\$/g, (match, formula) => {
      try {
        return katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false })
      } catch (e) { return match }
    })
    return html
  } catch (e) { return text }
}

export function renderLatexFormula(formula, displayMode = false) {
  try {
    return katex.renderToString(formula, { displayMode, throwOnError: false })
  } catch (e) { return formula }
}
