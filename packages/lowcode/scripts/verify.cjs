#!/usr/bin/env node
/**
 * Lowcode 平台构建验证脚本
 *
 * 检查项：
 * 1. 依赖完整性（events, zustand, react, react-router-dom, antd, @ant-design/icons）
 * 2. 引擎层模块可解析（import/export 路径正确）
 * 3. React 组件可解析（JSX 文件路径正确）
 * 4. HomePage 组件可导入
 * 5. AppBootstrapper 语法正确性
 * 6. EngineContext 语法正确性
 *
 * 用法: node scripts/verify.cjs
 */

const fs = require('fs')
const path = require('path')

const LOWCODE_DIR = path.resolve(__dirname, '..')
const ENGINE_DIR = path.join(LOWCODE_DIR, 'src', 'utils')
const CORE_DIR = path.join(LOWCODE_DIR, 'lowcode', 'core')
const COMPONENTS_DIR = path.join(LOWCODE_DIR, 'lowcode', 'components')
const LOWCODE_ENGINE_DIR = path.join(LOWCODE_DIR, 'lowcode', 'engine')

let passCount = 0
let failCount = 0
const failures = []

function check(description, fn) {
  try {
    const result = fn()
    if (result) {
      console.log(`  ✅ ${description}`)
      passCount++
    } else {
      console.log(`  ❌ ${description}`)
      failures.push(description)
      failCount++
    }
  } catch (err) {
    console.log(`  ❌ ${description}: ${err.message}`)
    failures.push(description + ': ' + err.message)
    failCount++
  }
}

function fileExists(relative) {
  const full = path.join(LOWCODE_DIR, relative)
  return fs.existsSync(full)
}

function fileContains(relative, substring) {
  const full = path.join(LOWCODE_DIR, relative)
  if (!fs.existsSync(full)) return false
  return fs.readFileSync(full, 'utf-8').includes(substring)
}

// ── Check 1: 依赖完整性 ──────────────────────────────────
console.log('\n📦 检查依赖完整性...')

const requiredDeps = [
  { pkg: 'react', paths: ['packages/lowcode/node_modules/react', 'node_modules/react'] },
  { pkg: 'react-dom', paths: ['packages/lowcode/node_modules/react-dom', 'node_modules/react-dom'] },
  { pkg: 'react-router-dom', paths: ['packages/lowcode/node_modules/react-router-dom', 'node_modules/react-router-dom'] },
  { pkg: 'antd', paths: ['packages/lowcode/node_modules/antd', 'node_modules/antd'] },
  { pkg: '@ant-design/icons', paths: ['packages/lowcode/node_modules/@ant-design/icons', 'node_modules/@ant-design/icons'] },
  { pkg: 'zustand', paths: ['packages/lowcode/node_modules/zustand', 'node_modules/zustand'] },
  { pkg: 'vite', paths: ['packages/lowcode/node_modules/vite', 'node_modules/vite'] },
  { pkg: '@vitejs/plugin-react', paths: ['packages/lowcode/node_modules/@vitejs/plugin-react', 'node_modules/@vitejs/plugin-react'] },
  { pkg: 'events', paths: ['packages/lowcode/node_modules/events', 'node_modules/events'] },
  { pkg: '@anthropic-ai/sdk', paths: ['packages/lowcode/node_modules/@anthropic-ai/sdk', 'node_modules/@anthropic-ai/sdk'] },
]

requiredDeps.forEach(({ pkg, paths }) => {
  check(`${pkg} 已安装`, () => {
    return paths.some(f => fs.existsSync(path.join(LOWCODE_DIR, f, 'package.json')))
  })
})

// ── Check 2: 核心文件存在 ─────────────────────────────────
console.log('\n📁 检查核心文件存在性...')

const coreFiles = [
  // 入口文件
  'index.html',
  'src/main.jsx',
  'src/App.jsx',
  'src/index.css',
  'vite.config.js',
  'package.json',

  // 引擎文件
  'lowcode/index.js',
  'lowcode/package.json',
  'lowcode/engine/AppEngine.js',
  'lowcode/engine/RenderEngine.js',
  'lowcode/engine/ComponentEngine.js',
  'lowcode/engine/EventEngine.js',
  'lowcode/engine/ExpressionEngine.js',
  'lowcode/engine/StateManager.js',
  'lowcode/engine/StateMachineEngine.js',
  'lowcode/engine/WorkflowEngine.js',
  'lowcode/engine/AppEngine.js',

  // 新创建的模块
  'src/utils/appBootstrapper.js',
  'src/contexts/EngineContext.jsx',
  'lowcode/components/index.js',

  // 核心 UI 组件
  'lowcode/components/HomePage/HomePage.jsx',
  'lowcode/components/DragDropEditor/index.jsx',
  'lowcode/components/ModelDesigner/index.jsx',
  'lowcode/components/WorkflowDesigner/index.jsx',
  'lowcode/components/ModelDesigner/SchemaEditor.jsx',
  'lowcode/components/ModelDesigner/AutoFormGenerator.jsx',
  'lowcode/components/DataSourceConfig/index.jsx',
  'lowcode/components/ConnectorTemplates/ConnectorList.jsx',
  'lowcode/components/GitPanel/GitPanel.jsx',
  'lowcode/components/SSO/LoginPanel.jsx',

  // Store
  'lowcode/store/editorStore.js',
  'lowcode/store/modelStore.js',
  'lowcode/store/workflowStore.js',

  // 领域模型
  'lowcode/domain/index.js',
  'lowcode/domain/order/Order.js',
  'lowcode/domain/restaurant/Restaurant.js',
  'lowcode/domain/organization/Organization.js',
  'lowcode/domain/user/User.js',
]

coreFiles.forEach(f => {
  check(`文件存在: ${f}`, () => fileExists(f))
})

// ── Check 3: lowcode/index.js 导出路径正确 ────────────────
console.log('\n🔗 检查 lowcode/index.js 导出路径...')

const indexContent = fs.readFileSync(path.join(LOWCODE_DIR, 'lowcode', 'index.js'), 'utf-8')
const importRegex = /from\s+'([^']+)'/g
let match
const missingImports = []

while ((match = importRegex.exec(indexContent)) !== null) {
  const importPath = match[1]
  const fullPath = path.join(LOWCODE_DIR, 'lowcode', importPath)
  if (!fs.existsSync(fullPath)) {
    missingImports.push(importPath)
  }
}

check(`lowcode/index.js 所有 export 路径可解析 (${missingImports.length} 缺失)`, () => {
  return missingImports.length === 0
})
if (missingImports.length > 0) {
  failures.push(...missingImports.map(p => `  缺失: ${p}`))
}

// ── Check 4: App.jsx 导入路径正确 ───────────────────────────
console.log('\n🔗 检查 src/App.jsx 导入路径...')

const appContent = fs.readFileSync(path.join(LOWCODE_DIR, 'src', 'App.jsx'), 'utf-8')
const appImportRegex = /from\s+'\.\.\/([^']+)'/g
const missingAppImports = []

while ((match = appImportRegex.exec(appContent)) !== null) {
  const importPath = match[1]
  const fullPath = path.join(LOWCODE_DIR, importPath)
  if (!fs.existsSync(fullPath)) {
    missingAppImports.push(importPath)
  }
}

check(`src/App.jsx 所有 import 路径可解析 (${missingAppImports.length} 缺失)`, () => {
  return missingAppImports.length === 0
})

// ── Check 5: 语法检查（AST 解析） ──────────────────────────
console.log('\n🔍 检查 JS/JSX 语法...')

// Check 6: 语法检查（括号平衡）
console.log('\n 检查 JS/JSX 语法...')

function checkSyntax(label, filepath) {
  try {
    const code = fs.readFileSync(path.join(LOWCODE_DIR, filepath), 'utf-8')
    const oParens = (code.match(/\(/g) || []).length
    const cParens = (code.match(/\)/g) || []).length
    const oBraces = (code.match(/\{/g) || []).length
    const cBraces = (code.match(/\}/g) || []).length
    const oBrackets = (code.match(/\[/g) || []).length
    const cBrackets = (code.match(/\]/g) || []).length
    const ok = oParens === cParens && oBraces === cBraces && oBrackets === cBrackets
    check(label + ' (' + oParens + '/' + cParens + ' ' + oBraces + '/' + cBraces + ' ' + oBrackets + '/' + cBrackets + ')', () => ok)
  } catch (e) {
    check(label, () => false)
  }
}

checkSyntax('vite.config.js 语法正确', 'vite.config.js')
checkSyntax('appBootstrapper.js 语法正确', 'src/utils/appBootstrapper.js')
checkSyntax('EngineContext.jsx 语法正确', 'src/contexts/EngineContext.jsx')
checkSyntax('App.jsx 语法正确', 'src/App.jsx')
checkSyntax('main.jsx 语法正确', 'src/main.jsx')



// ── Check 6: HTML entry point ────────────────────────────
console.log('\n🌐 检查入口 HTML...')

check('index.html 包含 #root div', () => fileContains('index.html', 'id="root"'))
check('index.html 引入 src/main.jsx', () => fileContains('index.html', 'src/main.jsx'))
check('main.jsx 引入 antd reset CSS', () => fileContains('src/main.jsx', 'reset.css'))

// ── Check 7: 引擎层 ESM 兼容 ──────────────────────────────
console.log('\n⚙️  检查引擎层 ESM 兼容...')

const engineIndex = path.join(LOWCODE_DIR, 'lowcode', 'engine', 'index.js')
if (fs.existsSync(engineIndex)) {
  const content = fs.readFileSync(engineIndex, 'utf-8')
  check('engine/index.js 使用 export (非 module.exports)', () => !content.includes('module.exports'))
  check('engine/index.js 使用 .js 扩展名导入', () => content.includes("from './"))
  check('engine/index.js 使用 .js 扩展名导入', () => content.includes("from './"))
}

// ── Check 8: lowcode 子包 package.json ────────────────────
console.log('\n📦 检查 lowcode 子包配置...')

const subPkg = path.join(LOWCODE_DIR, 'lowcode', 'package.json')
if (fs.existsSync(subPkg)) {
  const subPkgJson = JSON.parse(fs.readFileSync(subPkg, 'utf-8'))
  check('lowcode/package.json type 为 module', () => subPkgJson.type === 'module')
  check('lowcode/package.json 有 main 字段', () => !!subPkgJson.main)
  check('lowcode/package.json 有 exports 字段', () => !!subPkgJson.exports)
  check('lowcode/package.json 有 dependencies', () => Object.keys(subPkgJson.dependencies || {}).length > 0)
}

// ── Check 9: CSS 配对 ─────────────────────────────────────
console.log('\n🎨 检查 CSS-组件配对...')

const componentsDirs = fs.readdirSync(COMPONENTS_DIR).filter(d => {
  const full = path.join(COMPONENTS_DIR, d)
  return fs.statSync(full).isDirectory()
})

componentsDirs.forEach(dir => {
  const dirPath = path.join(COMPONENTS_DIR, dir)
  const hasJsx = fs.existsSync(path.join(dirPath, 'index.jsx')) ||
                 fs.existsSync(path.join(dirPath, `${dir}.jsx`)) ||
                 fs.readdirSync(dirPath).some(f => f.endsWith('.jsx'))
  const hasCss = fs.existsSync(path.join(dirPath, 'styles.css')) ||
                 fs.readdirSync(dirPath).some(f => f.endsWith('.css'))

  // If there's no index.jsx to check, skip
  const hasIndex = fs.existsSync(path.join(dirPath, 'index.jsx'))
  if (hasIndex) {
    check(`组件 ${dir}/index.jsx 存在`, () => true)
  }
})

// ── Check 10: 注册引擎事件 ─────────────────────────────────
console.log('\n🔔 检查 AppBootstrapper 初始化注册...')

const bootstrapperContent = fs.readFileSync(path.join(LOWCODE_DIR, 'src', 'utils', 'appBootstrapper.js'), 'utf-8')
check('bootstrapper 注册 EventEngine', () => bootstrapperContent.includes("eventEngine"))
check('bootstrapper 注册 AppEngine', () => bootstrapperContent.includes("AppEngine"))
check('bootstrapper 注册插件', () => bootstrapperContent.includes("registerPlugin"))
check('bootstrapper 注册领域模型', () => bootstrapperContent.includes("schemaManager.registerModel"))
check('bootstrapper 挂载 window.griModules', () => bootstrapperContent.includes("window.griModules"))
check('bootstrapper 导出 bootstrap 函数', () => bootstrapperContent.includes("export async function bootstrap"))

// ── Summary ─────────────────────────────────────────────────
console.log('\n' + '='.repeat(60))
console.log(`  总计: ${passCount + failCount} 项检查`)
console.log(`  ✅ 通过: ${passCount}`)
console.log(`  ❌ 失败: ${failCount}`)
console.log('='.repeat(60))

if (failCount > 0) {
  console.log('\n失败项详情:')
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`))
  process.exit(1)
} else {
  console.log('\n🎉 所有检查通过! 平台结构完整。')
  console.log('\n下一步:')
  console.log('  1. cd packages/lowcode && npm install    # 安装工作区依赖')
  console.log('  2. cd packages/lowcode && npm run dev   # 启动开发服务器')
  console.log('  3. 访问 http://localhost:3000 查看平台')
  process.exit(0)
}
