import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { fileURLToPath, URL } from 'node:url'
import path from 'path'

// 组织/运营管理台 uni-app —— 镜像 web-ai-tutor 脚手架（端口 5176）。
process.env.UNI_INPUT_DIR = path.resolve(__dirname, 'src')

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'
  return {
    base: isProduction ? (process.env.UNI_BASE || '/portal/') : '/',
    plugins: [
      uni()
    ],
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL || ''),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@api': fileURLToPath(new URL('./src/api', import.meta.url)),
        '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
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
            'vendor-vue': ['vue', 'pinia'],
            'vendor-utils': ['axios']
          }
        }
      }
    },
    server: {
      port: 5176,
      open: false,
      host: true,
      fs: {
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