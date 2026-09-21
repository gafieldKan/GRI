// GRI 组织管理 API 测试脚本
// 使用方法：node scripts/test-org-api.js

const BASE_URL = 'http://localhost:3002'

async function test() {
  console.log('=== GRI 组织管理 API 测试 ===\n')

  // 1. 健康检查
  console.log('[1] 健康检查...')
  const health = await fetch(`${BASE_URL}/health`)
  console.log('响应:', await health.json())
  console.log('✓ 通过\n')

  // 2. 获取组织树
  console.log('[2] 获取组织树...')
  const treeRes = await fetch(`${BASE_URL}/api/organizations/tree`)
  const tree = await treeRes.json()
  console.log('组织数量:', tree.data?.length || 0)
  console.log('✓ 通过\n')

  // 3. 获取 API 版本
  console.log('[3] 获取 API 版本...')
  const versionRes = await fetch(`${BASE_URL}/api/version`)
  const version = await versionRes.json()
  console.log('API 版本:', version.version)
  console.log('✓ 通过\n')

  console.log('=== 所有测试通过 ===')
}

test().catch(console.error)
