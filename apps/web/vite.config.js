import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import path from 'path'

// 归一前端入口：把 uni-app 输入目录指向 src/（含 login 的 12 页 + Pinia），
// 避免顶层 stale 的 pages.json/main.js/App.vue 遮蔽 src/ 活源（"登录页不见"根因）。
process.env.UNI_INPUT_DIR = path.resolve(__dirname, 'src')

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'
  return {
    // 生产构建落子路径（nginx /food/ 静态托付），dev 保持根 base 不回归。
    base: isProduction ? (process.env.UNI_BASE || '/food/') : '/',
    plugins: [uni()],
    resolve: {
      alias: {
        '@styles': path.resolve(__dirname, '../../styles'),
      },
    },
    server: {
      port: 5173,
      host: true,
      fs: {
        // Allow serving files from the monorepo root (for shared styles)
        allow: [
          path.resolve(__dirname, '.'),
          path.resolve(__dirname, '../../styles'),
        ]
      }
    },
    define: {
      __UNI_FEATURE_TABBAR__: 'true',
      __UNI_FEATURE_TABBAR_MIDBUTTON__: 'false',
      __UNI_FEATURE_PAGES__: 'true',
      __UNI_FEATURE_NAVIGATIONBAR__: 'true'
    },
    build: {
      ssr: false
    }
  }
})