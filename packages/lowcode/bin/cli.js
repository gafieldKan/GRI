#!/usr/bin/env node

/**
 * Awesome Lowcode CLI 工具
 * 用于创建项目、生成代码等
 */

const { program } = require('commander')
const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

const packageJson = require('../package.json')

// 命令行配置
program
  .name('awesome-lowcode')
  .description('低代码开发平台命令行工具')
  .version(packageJson.version)

// 创建项目
program
  .command('create <name>')
  .description('创建新的低代码项目')
  .option('-t, --template <template>', '项目模板', 'default')
  .action((name, options) => {
    console.log(`创建项目：${name}`)
    console.log(`使用模板：${options.template}`)

    const targetDir = path.join(process.cwd(), name)

    // 创建目录结构
    const dirs = [
      'src',
      'src/pages',
      'src/components',
      'src/hooks',
      'src/utils',
      'lowcode',
      'lowcode/core',
      'lowcode/engine',
      'lowcode/components',
      'lowcode/plugins',
      'public',
    ]

    dirs.forEach(dir => {
      const dirPath = path.join(targetDir, dir)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
        console.log(`  创建目录：${dir}`)
      }
    })

    // 创建 package.json
    const pkgJson = {
      name,
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
        lint: 'eslint . --ext .js,.jsx',
      },
      dependencies: {
        react: '^19.0.0',
        'react-dom': '^19.0.0',
        antd: '^6.0.0',
        zustand: '^5.0.0',
      },
      devDependencies: {
        vite: '^8.0.0',
        '@vitejs/plugin-react': '^6.0.0',
        eslint: '^9.0.0',
        prettier: '^3.0.0',
      },
    }

    fs.writeFileSync(
      path.join(targetDir, 'package.json'),
      JSON.stringify(pkgJson, null, 2)
    )
    console.log('  创建 package.json')

    // 创建 vite.config.js
    fs.writeFileSync(
      path.join(targetDir, 'vite.config.js'),
      `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`
    )
    console.log('  创建 vite.config.js')

    // 创建 index.html
    fs.writeFileSync(
      path.join(targetDir, 'index.html'),
      `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`
    )
    console.log('  创建 index.html')

    // 创建 src/main.jsx
    fs.writeFileSync(
      path.join(targetDir, 'src', 'main.jsx'),
      `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
`
    )
    console.log('  创建 src/main.jsx')

    // 创建 src/App.jsx
    fs.writeFileSync(
      path.join(targetDir, 'src', 'App.jsx'),
      `import React from 'react'

function App() {
  return (
    <div>
      <h1>${name}</h1>
      <p>欢迎使用 Awesome Lowcode 低代码开发平台</p>
    </div>
  )
}

export default App
`
    )
    console.log('  创建 src/App.jsx')

    // 创建 src/index.css
    fs.writeFileSync(
      path.join(targetDir, 'src', 'index.css'),
      `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
`
    )
    console.log('  创建 src/index.css')

    // 创建 README.md
    fs.writeFileSync(
      path.join(targetDir, 'README.md'),
      `# ${name}

使用 Awesome Lowcode 创建的低代码项目。

## 快速开始

\`\`\`bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
\`\`\`
`
    )
    console.log('  创建 README.md')

    console.log(`\n项目创建成功！\n运行以下命令开始开发：\n  cd ${name}\n  npm install\n  npm run dev\n`)
  })

// 创建插件
program
  .command('plugin:create <name>')
  .description('创建新的插件')
  .option('-t, --type <type>', '插件类型', 'component')
  .option('-d, --dir <dir>', '输出目录', 'lowcode/plugins')
  .action((name, options) => {
    const targetDir = path.join(process.cwd(), options.dir, name)

    if (fs.existsSync(targetDir)) {
      console.error(`插件目录已存在：${targetDir}`)
      process.exit(1)
    }

    fs.mkdirSync(targetDir, { recursive: true })

    // 创建插件模板
    const pluginTemplate = `/**
 * ${name} 插件
 * 类型：${options.type}
 */

import { registerPlugin, PluginType } from '../../core/PluginRegistry'

registerPlugin({
  name: '${name}',
  type: PluginType.${options.type.toUpperCase()},
  version: '1.0.0',
  description: '${name} 插件',

  async init() {
    console.log('[${name}] 初始化完成')
  },

  async onLoad(context) {
    console.log('[${name}] 加载:', context)
  },

  async onSave(data) {
    console.log('[${name}] 保存:', data)
  },

  async onDestroy() {
    console.log('[${name}] 销毁')
  },
})

export default ${name.replace(/-/g, '').replace(/\\b\\w/g, l => l.toUpperCase())}
`

    fs.writeFileSync(path.join(targetDir, 'index.js'), pluginTemplate)
    console.log(`创建插件：${name}`)
    console.log(`位置：${targetDir}`)
  })

// 创建组件
program
  .command('component:create <name>')
  .description('创建新的组件')
  .option('-t, --type <type>', '组件类型', 'basic')
  .action((name, options) => {
    const componentName = name.charAt(0).toUpperCase() + name.slice(1)
    const targetDir = path.join(process.cwd(), 'src', 'components', componentName)

    if (fs.existsSync(targetDir)) {
      console.error(`组件目录已存在：${targetDir}`)
      process.exit(1)
    }

    fs.mkdirSync(targetDir, { recursive: true })

    // 创建组件模板
    const componentTemplate = `import React from 'react'
import './${componentName}.css'

const ${componentName} = ({ value, onChange, ...props }) => {
  return (
    <div className="${name.toLowerCase().replace(/-/g, '')}">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        {...props}
      />
    </div>
  )
}

export default ${componentName}
`

    const cssTemplate = `.${name.toLowerCase().replace(/-/g, '')} {
  padding: 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
}
`

    const indexTemplate = `export { default } from './${componentName}'
`

    fs.writeFileSync(path.join(targetDir, `${componentName}.jsx`), componentTemplate)
    fs.writeFileSync(path.join(targetDir, `${componentName}.css`), cssTemplate)
    fs.writeFileSync(path.join(targetDir, 'index.js'), indexTemplate)

    console.log(`创建组件：${componentName}`)
    console.log(`位置：${targetDir}`)
  })

// 生成页面
program
  .command('page:create <name>')
  .description('创建新的页面')
  .action((name) => {
    const pageName = name.charAt(0).toUpperCase() + name.slice(1)
    const targetDir = path.join(process.cwd(), 'src', 'pages', pageName)

    if (fs.existsSync(targetDir)) {
      console.error(`页面已存在：${targetDir}`)
      process.exit(1)
    }

    fs.mkdirSync(targetDir, { recursive: true })

    const pageTemplate = `import React from 'react'
import './${pageName}.css'

const ${pageName} = () => {
  return (
    <div className="${name.toLowerCase().replace(/-/g, '')}-page">
      <h1>${pageName}</h1>
    </div>
  )
}

export default ${pageName}
`

    const cssTemplate = `.${name.toLowerCase().replace(/-/g, '')}-page {
  padding: 24px;
}
`

    fs.writeFileSync(path.join(targetDir, `${pageName}.jsx`), pageTemplate)
    fs.writeFileSync(path.join(targetDir, `${pageName}.css`), cssTemplate)

    console.log(`创建页面：${pageName}`)
    console.log(`位置：${targetDir}`)
  })

// 列出可用模板
program
  .command('templates')
  .description('列出可用的项目模板')
  .action(() => {
    console.log('可用模板:')
    console.log('  default - 默认模板')
    console.log('  minimal - 最小化模板')
    console.log('  full - 完整功能模板')
  })

// 信息
program
  .command('info')
  .description('显示环境信息')
  .action(() => {
    console.log('环境信息:')
    console.log(`  Node.js: ${process.version}`)
    console.log(`  Platform: ${process.platform}`)
    console.log(`  Arch: ${process.arch}`)
    console.log(`  CLI Version: ${packageJson.version}`)
  })

// 解析命令行
program.parse(process.argv)

// 如果没有提供命令，显示帮助
if (!process.argv.slice(2).length) {
  program.outputHelp()
}
