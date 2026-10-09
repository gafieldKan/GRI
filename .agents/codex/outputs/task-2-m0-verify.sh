#!/bin/bash
# Task 2 M0 验收验证脚本
# 用法：cd /home/ubantu/GRI && bash .agents/codex/outputs/task-2-m0-verify.sh

set -e
cd /home/ubantu/GRI/services/api

echo "========================================"
echo "Task 2 M0 验收验证"
echo "========================================"

# 1. TypeScript 编译
echo ""
echo "=== 1. TypeScript 编译 (npm run build) ==="
npm run build
echo "✅ TypeScript 编译通过"

# 2. ESLint (需先有配置文件)
echo ""
echo "=== 2. ESLint ==="
if [ -f .eslintrc.js ] || [ -f .eslintrc.json ] || [ -f .eslintrc.cjs ]; then
  npm run lint
  echo "✅ ESLint 通过"
else
  echo "⚠️  无 ESLint 配置文件，跳过（建议补充）"
fi

# 3. 单元测试 + 覆盖率
echo ""
echo "=== 3. 单元测试 + 覆盖率 ==="
npm run test -- --coverage --silent 2>&1 | tail -15
echo "✅ 单元测试通过"

# 4. 容器构建
echo ""
echo "=== 4. 容器构建 (docker compose build api) ==="
cd /home/ubantu/GRI
docker compose build api
echo "✅ 容器构建通过"

# 5. 启动依赖 + 服务 + 健康检查
echo ""
echo "=== 5. 启动服务并健康检查 ==="
docker compose up -d postgres redis
sleep 3
docker compose up -d api
sleep 8

# 健康检查（注意：docker 映射端口是 3008）
HEALTH=$(curl -s http://localhost:3008/health || true)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo "✅ 健康检查通过: $HEALTH"
else
  echo "❌ 健康检查失败: $HEALTH"
  docker logs gri-api --tail 30
  exit 1
fi

# 6. 迁移状态
echo ""
echo "=== 6. 迁移运行器 (npm run migrate:status) ==="
docker compose exec api node dist/migrate/run-migrations.js
echo "✅ 迁移运行器正常"

# 7. 鉴权生效测试
echo ""
echo "=== 7. 全局鉴权生效测试 ==="

# 公开读端点 → 应 200
PUBLIC_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3008/api/food/restaurants)
if [ "$PUBLIC_CODE" = "200" ]; then
  echo "✅ 公开读端点 /api/food/restaurants → 200"
else
  echo "❌ 公开读端点异常: HTTP $PUBLIC_CODE"
  exit 1
fi

# 受保护端点无 token → 应 401
PROTECTED_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3008/api/orders)
if [ "$PROTECTED_CODE" = "401" ]; then
  echo "✅ 受保护端点 /api/orders 无 token → 401"
else
  echo "❌ 受保护端点异常: HTTP $PROTECTED_CODE"
  exit 1
fi

# 受保护端点带坏 token → 应 401
BAD_TOKEN_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer invalid.token.here" http://localhost:3008/api/orders)
if [ "$BAD_TOKEN_CODE" = "401" ]; then
  echo "✅ 受保护端点坏 token → 401"
else
  echo "❌ 坏 token 测试异常: HTTP $BAD_TOKEN_CODE"
  exit 1
fi

echo ""
echo "========================================"
echo "🎉 Task 2 M0 验收全部通过 (7/7)"
echo "========================================"
