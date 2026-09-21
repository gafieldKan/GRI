import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './lowcode'),
      // 使用 events polyfill 替代 Node.js 核心模块
      events: 'events',
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
    // 排除 Node.js 专用模块
    exclude: ['child_process', 'fs', 'path', 'os', 'crypto'],
  },
})
