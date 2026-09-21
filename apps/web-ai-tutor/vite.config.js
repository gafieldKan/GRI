import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { fileURLToPath, URL } from 'node:url'
import path from 'path'

// 归一前端入口：把 uni-app 输入目录指向 src/（含 11 页 + Pinia + 错误处理），
// 避免顶层 stale 的 pages.json/main.js/App.vue 遮蔽 src/ 活源（与 apps/web 同规约）。
process.env.UNI_INPUT_DIR = path.resolve(__dirname, 'src')

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'
  return {
    // 生产构建落子路径（nginx /tutor/ 静态托付），dev 保持根 base 不回归。
    base: isProduction ? (process.env.UNI_BASE || '/tutor/') : '/',
    plugins: [
      uni()
    ],
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL || ''),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@store': fileURLToPath(new URL('./src/store', import.meta.url)),
        '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
        '@api': fileURLToPath(new URL('./src/api', import.meta.url)),
        '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
        '@pages': fileURLToPath(new URL('./src/pages', import.meta.url)),
        '@components/ui': fileURLToPath(new URL('./src/components/ui', import.meta.url)),
        '@styles': path.resolve(__dirname, '../../styles')
      }
    },
    build: {
      target: 'es2020',
      minify: isProduction ? 'terser' : false,
      cssCodeSplit: true,
      sourcemap: !isProduction,
      terserOptions: {
        compress: {
          drop_console: isProduction,
          drop_debugger: isProduction
        }
      },
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-vue': ['vue', 'pinia', 'vue-router'],
            'vendor-utils': ['axios', 'katex', 'dayjs']
          }
        }
      }
    },
    server: {
      port: 5173,
      open: false,
      host: true,
      fs: {
        // Allow serving files from the monorepo root (for shared styles)
        allow: [
          path.resolve(__dirname, '.'),
          path.resolve(__dirname, '../../styles'),
        ]
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3003',
          changeOrigin: true
        },
        '/auth': {
          target: 'http://localhost:3004',
          changeOrigin: true
        }
      }
    }
  }
})