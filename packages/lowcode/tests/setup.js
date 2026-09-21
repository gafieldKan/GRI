/**
 * Vitest 测试配置文件
 * 用于配置测试环境
 */

import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/react'

// 每次测试后清理 React Testing Library
afterEach(() => {
  cleanup()
})

// 全局 mock console.error 避免测试输出过多警告
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0]?.message === 'string' &&
      args[0].message.includes('Warning:')
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})
