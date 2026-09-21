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