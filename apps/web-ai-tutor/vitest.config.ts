import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@store': fileURLToPath(new URL('./src/store', import.meta.url)),
      '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
      '@api': fileURLToPath(new URL('./src/api', import.meta.url)),
      '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
      '@pages': fileURLToPath(new URL('./src/pages', import.meta.url)),
      '@components/ui': fileURLToPath(new URL('./src/components/ui', import.meta.url)),
      // 世界语言共享件（W3 · N2）：与 apps/portal 复用同一份画法原语与外壳。
      // 不加这个别名，@world-art/art.js 的几何单测解析不到（vite.config.js 里已有，两边要对齐）。
      '@world-art': path.resolve(__dirname, '../../packages/world-art/src')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/main.js',
        'src/App.vue',
        '**/*.d.ts',
        'dist/**',
        '**/*.config.*',
        '**/mock/**'
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50
      }
    },
    setupFiles: ['src/test/setup.ts'],
    deps: {
      inline: ['vue', 'pinia', '@vueuse/core', 'vue-router']
    }
  }
})