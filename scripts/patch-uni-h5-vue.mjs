#!/usr/bin/env node
/**
 * 修复 @dcloudio/uni-h5-vue 的 initSlots 缺陷（H5 生产构建 tabBar 页面不渲染）。
 *
 * 现象：登录成功后 uni.switchTab/reLaunch 到 tabBar 页面（如首页）时 URL 已变、tabBar 已出现，
 *      但页面内容不切换（表现为「点登录按钮没有反应」）。dev 正常，仅生产构建复现。
 *
 * 根因：该发行的 vue.runtime.*.js 中 initSlots 无 __DEV__ 守卫地执行
 *          def(children, "_", type);            // def 默认 writable:false
 *      把 slots 对象上的插槽稳定标记 `_` 定义成只读；随后组件更新走 updateSlots 的
 *      非 optimized 分支 `extend(slots, children)`（即 Object.assign）时写 `_` 抛
 *          TypeError: Cannot assign to read only property '_' of object '#<Object>'
 *      该异常中断组件更新并把渲染 effect 的依赖清空（deps→0），RouterView 永久失去响应，
 *      于是页面停在登录页。上游 Vue 中此行有 `if (__DEV__)` 守卫，此 alpha 发行丢失了守卫。
 *
 * 修法：把 `_` 定义改为可写（def 的第四参 writable=true），一行且语义等价——`_` 本就应该
 *      在后续 updateSlots 中被重新赋值。
 *
 * 由根 package.json 的 postinstall 调用，幂等；找不到包或已修复时静默跳过，绝不阻断安装。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

function resolveDist() {
  try {
    return join(dirname(require.resolve('@dcloudio/uni-h5-vue/package.json')), 'dist')
  } catch {
    return null
  }
}

const dist = resolveDist()
if (!dist) {
  console.log('[patch-uni-h5-vue] @dcloudio/uni-h5-vue not found, skip')
  process.exit(0)
}

// esm：Vite 构建实际使用；cjs：Node/SSR 面。两者都修，保持一致。
const targets = ['vue.runtime.esm.js', 'vue.runtime.cjs.js']
// `(shared.)?def(children, "_", type)` —— 只在尚未带 writable 参数时命中。
const BUGGY = /((?:shared\.)?def\(children,\s*"_",\s*type)\);/g

let patched = 0
for (const name of targets) {
  const file = join(dist, name)
  if (!existsSync(file)) continue
  const src = readFileSync(file, 'utf8')
  if (!BUGGY.test(src)) continue
  BUGGY.lastIndex = 0
  const out = src.replace(BUGGY, '$1, true);')
  writeFileSync(file, out)
  patched++
  console.log(`[patch-uni-h5-vue] patched ${name}`)
}

if (patched === 0) {
  console.log('[patch-uni-h5-vue] already fixed or pattern absent, skip')
}
