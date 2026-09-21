/**
 * 国际化管理器测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { i18nManager, t } from '../I18nManager.js'

describe('I18nManager', () => {
  beforeEach(() => {
    // 重置到默认语言
    i18nManager.setLocale('zh-CN')
  })

  describe('基础翻译', () => {
    it('应该翻译基础键值', () => {
      expect(i18nManager.t('common.save')).toBe('保存')
      expect(i18nManager.t('common.cancel')).toBe('取消')
    })

    it('应该使用快捷函数翻译', () => {
      expect(t('common.save')).toBe('保存')
    })

    it('应该返回键值当翻译不存在时', () => {
      expect(i18nManager.t('nonexistent.key')).toBe('nonexistent.key')
    })
  })

  describe('语言切换', () => {
    it('应该切换当前语言', () => {
      i18nManager.setLocale('en-US')
      expect(i18nManager.getLocale()).toBe('en-US')
    })

    it('应该根据语言返回翻译', () => {
      i18nManager.setLocale('en-US')
      expect(i18nManager.t('common.save')).toBe('Save')
      expect(i18nManager.t('common.cancel')).toBe('Cancel')
    })

    it('应该回退到默认语言当翻译不存在', () => {
      i18nManager.setLocale('en-US')
      expect(i18nManager.t('common.save')).toBe('Save')
    })
  })

  describe('参数替换', () => {
    it('应该替换参数', () => {
      i18nManager.addTranslation('zh-CN', 'order.total', '共 {count} 条，总计 {total} 元')
      expect(i18nManager.t('order.total', { count: 5, total: 100 })).toBe('共 5 条，总计 100 元')
    })

    it('应该处理多个相同参数', () => {
      i18nManager.addTranslation('zh-CN', 'greeting', '你好，{name}！欢迎 {name}。')
      expect(i18nManager.t('greeting', { name: 'John' })).toBe('你好，John！欢迎 John。')
    })
  })

  describe('语言包管理', () => {
    it('应该注册新语言包', () => {
      i18nManager.registerPack('ja-JP', '日本語', {
        'common.save': '保存する',
        'common.cancel': 'キャンセル',
      })

      i18nManager.setLocale('ja-JP')
      expect(i18nManager.t('common.save')).toBe('保存する')
    })

    it('应该批量添加翻译', () => {
      i18nManager.addTranslations('zh-CN', {
        'custom.key1': '值 1',
        'custom.key2': '值 2',
      })

      expect(i18nManager.t('custom.key1')).toBe('值 1')
      expect(i18nManager.t('custom.key2')).toBe('值 2')
    })

    it('应该获取所有翻译键', () => {
      const keys = i18nManager.getAllKeys()
      expect(keys.length).toBeGreaterThan(0)
      expect(keys).toContain('common.save')
    })
  })

  describe('获取支持的语言', () => {
    it('应该返回支持的语言列表', () => {
      const locales = i18nManager.getSupportedLocales()
      expect(locales).toBeDefined()
      expect(Array.isArray(locales)).toBe(true)
      expect(locales.length).toBeGreaterThan(0)
    })

    it('应该包含中文和英文', () => {
      const locales = i18nManager.getSupportedLocales()
      const codes = locales.map((l) => l.code)
      expect(codes).toContain('zh-CN')
      expect(codes).toContain('en-US')
    })
  })

  describe('导出导入', () => {
    it('应该导出语言包', () => {
      const exported = i18nManager.exportPack('zh-CN')
      expect(exported).toBeDefined()
      expect(typeof exported).toBe('string')

      const parsed = JSON.parse(exported)
      expect(parsed.code).toBe('zh-CN')
      expect(parsed.translations).toBeDefined()
    })

    it('应该导入语言包', () => {
      const json = JSON.stringify({
        code: 'de-DE',
        name: 'Deutsch',
        translations: {
          'common.save': 'Speichern',
          'common.cancel': 'Abbrechen',
        },
      })

      const pack = i18nManager.importPack(json)
      expect(pack).toBeDefined()
      expect(pack.code).toBe('de-DE')

      i18nManager.setLocale('de-DE')
      expect(i18nManager.t('common.save')).toBe('Speichern')
    })
  })

  describe('创建翻译器', () => {
    it('应该创建命名空间翻译函数', () => {
      const translate = i18nManager.createTranslator('common')
      expect(translate('save')).toBe('保存')
      expect(translate('cancel')).toBe('取消')
    })
  })

  describe('事件监听', () => {
    it('应该触发语言切换事件', () => {
      let eventFired = false
      i18nManager.on('locale:change', () => {
        eventFired = true
      })

      i18nManager.setLocale('en-US')
      expect(eventFired).toBe(true)
    })
  })
})
