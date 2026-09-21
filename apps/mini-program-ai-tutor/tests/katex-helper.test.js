/**
 * Mini-Program Katex Helper 测试
 * 验证小程序版数学公式处理工具
 */
import { describe, it, expect } from 'vitest'
import { hasLatex, extractFormulas, autoLatexify, renderLatex, toRichTextNodes } from '../utils/katex-helper.js'

describe('katex-helper (MP)', () => {
  describe('hasLatex', () => {
    it('should detect inline formula $...$', () => {
      expect(hasLatex('勾股定理 $a^2 + b^2 = c^2$ 是核心')).toBe(true)
    })

    it('should return false for plain text', () => {
      expect(hasLatex('普通文字没有公式')).toBe(false)
    })

    it('should detect display formula $$...$$', () => {
      expect(hasLatex('公式：$$a+b=c$$')).toBe(true)
    })
  })

  describe('extractFormulas', () => {
    it('should extract single inline formula', () => {
      const formulas = extractFormulas('答案是 $5$ 厘米')
      expect(formulas).toEqual(['5'])
    })

    it('should extract multiple formulas', () => {
      const formulas = extractFormulas('$x^2 + y^2 = z^2$ 和 $a^2 + b^2 = c^2$')
      expect(formulas).toHaveLength(2)
    })

    it('should return empty array for no formulas', () => {
      expect(extractFormulas('纯文本')).toEqual([])
    })
  })

  describe('renderLatex', () => {
    it('should mark inline formulas with [math:] tags', () => {
      const result = renderLatex('测试 $x^2$ 公式')
      expect(result).toBe('测试 [math:x^2] 公式')
    })

    it('should mark display formulas with [math-display:] tags', () => {
      const result = renderLatex('$$a+b=c$$')
      expect(result).toBe('[math-display:a+b=c]')
    })

    it('should return empty string for null', () => {
      expect(renderLatex(null)).toBe('')
      expect(renderLatex('')).toBe('')
    })
  })

  describe('toRichTextNodes', () => {
    it('should wrap inline formulas in styled spans', () => {
      const result = toRichTextNodes('勾股定理：$a^2 + b^2 = c^2$')
      expect(result).toContain('<span class="math-inline" data-latex="a^2 + b^2 = c^2">')
    })

    it('should wrap display formulas in styled paragraphs', () => {
      const result = toRichTextNodes('$$x = \\frac{-b}{2a}$$')
      expect(result).toContain('<p class="math-display" data-latex="x = \\frac{-b}{2a}">')
    })

    it('should escape HTML entities in formula text', () => {
      const result = toRichTextNodes('比较 $a < b$ 的大小')
      expect(result).toContain('&lt;')
    })

    it('should return empty string for falsy input', () => {
      expect(toRichTextNodes('')).toBe('')
    })
  })

  describe('autoLatexify', () => {
    it('should wrap exponent expressions in $ delimiters', () => {
      const result = autoLatexify('a^2 + b^2')
      expect(result).toContain('$')
    })

    it('should handle empty input', () => {
      expect(autoLatexify('')).toBe('')
      expect(autoLatexify(null)).toBe('')
    })
  })
})