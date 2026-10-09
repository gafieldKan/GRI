import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { fileURLToPath, URL } from 'node:url'

// mini-program-ai-tutor 采用「顶层活代码」布局（pages/、main.js、manifest.json 均在包根），
// 不同于 web/web-ai-tutor 的 src/ 布局。@dcloudio/vite-plugin-uni 的 initEnv 默认把
// UNI_INPUT_DIR 解析为 <cwd>/src，故须在 package.json 的 script 里以环境变量注入
// UNI_INPUT_DIR=.（此处写 process.env 无效——initEnv 早于 vite.config 加载）。

export default defineConfig({
  plugins: [
    uni()
  ],
  // mp-weixin 无「同源」概念，相对 URL 非法 —— 必须把后端 origin 在构建期烘焙成绝对地址。
  // 与 apps/web-ai-tutor/vite.config.js 同款 define：从 process.env 注入（默认空串 = 降级相对，
  // 仅 H5 场景有意义）。运行：VITE_API_BASE_URL=<origin> VITE_AUTH_BASE_URL=<origin>/auth uni -p mp-weixin
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL || ''),
    'import.meta.env.VITE_AUTH_BASE_URL': JSON.stringify(process.env.VITE_AUTH_BASE_URL || '')
  },
  server: {
    port: 5175,
    host: true
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      '@api': fileURLToPath(new URL('./api', import.meta.url)),
      '@store': fileURLToPath(new URL('./store', import.meta.url)),
      '@utils': fileURLToPath(new URL('./utils', import.meta.url)),
      '@components': fileURLToPath(new URL('./components', import.meta.url))
    }
  },
  ssr: {
    noExternal: ['@dcloudio/uni-app']
  },
  optimizeDeps: {
    exclude: ['@dcloudio/uni-app']
  },
  build: {
    ssr: false
  }
})