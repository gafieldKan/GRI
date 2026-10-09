#!/usr/bin/env bash
# =============================================================================
# Task-1 端到端鉴权闭环验证脚本（单后端收敛版）
# -----------------------------------------------------------------------------
# 验证目标（对应任务 AC#1–#4）：
#   1. 登录取 token：POST {AUTH_BASE}/login {identifier,password} → accessToken
#   2. 公开读白名单：无 token 访问 /food/restaurants → 200（游客可匿名）
#   3. 受保护端点（带 token）：/identity/me → 200，且 externalId == public.users.id
#   4. 业务真源：/tuition/* 经 req.auth.externalId 解析学生（不再硬编码 student_001）
#   5. 无 token 访问受保护端点 → 401
#   6. 错误 token → 401
#
# 用法：
#   AUTH_BASE=http://localhost:3004/auth \
#   API_BASE=http://localhost:3002/api \
#   TEST_IDENTIFIER=testuser TEST_PASSWORD=test1234 \
#   bash task-1-e2e-verification.sh
#
# 端口说明：
#   - `npm run dev:api`（本地直跑）：API_BASE=http://localhost:3002/api
#   - docker compose：宿主映射 3008→容器 3002，故 API_BASE=http://localhost:3008/api
#   - 经 nginx 统一入口：API_BASE=http://localhost/api ，AUTH_BASE=http://localhost/auth
# =============================================================================
set -uo pipefail

AUTH_BASE="${AUTH_BASE:-http://localhost:3004/auth}"
API_BASE="${API_BASE:-http://localhost:3002/api}"
TEST_IDENTIFIER="${TEST_IDENTIFIER:-testuser}"
TEST_PASSWORD="${TEST_PASSWORD:-test1234}"

PASS=0; FAIL=0
g() { printf '\033[32m%s\033[0m\n' "$1"; }
r() { printf '\033[31m%s\033[0m\n' "$1"; }
b() { printf '\033[34m%s\033[0m\n' "$1"; }

# http_code METHOD URL [bearer]
http_code() {
  local method="$1" url="$2" bearer="${3:-}"
  if [ -n "$bearer" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$method" "$url" -H "Authorization: Bearer $bearer"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$method" "$url"
  fi
}
check() { # desc expected actual
  if [ "$2" = "$3" ]; then g "  ✓ $1（$3）"; PASS=$((PASS+1));
  else r "  ✗ $1（期望 $2，实得 $3）"; FAIL=$((FAIL+1)); fi
}

b "\n========================================"
b " Task-1 端到端鉴权闭环验证"
b "========================================"
b " AUTH_BASE = $AUTH_BASE"
b " API_BASE  = $API_BASE\n"

# --- 1. 登录 auth-center 拿 access_token --------------------------------------
b "[1] 登录 auth-center 取 token …"
LOGIN_JSON="$(curl -s -X POST "$AUTH_BASE/login" \
  -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"$TEST_IDENTIFIER\",\"password\":\"$TEST_PASSWORD\"}")"
ACCESS_TOKEN="$(printf '%s' "$LOGIN_JSON" | sed -n 's/.*"accessToken"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
if [ -n "$ACCESS_TOKEN" ]; then g "  ✓ 取得 accessToken（${#ACCESS_TOKEN} chars）"; PASS=$((PASS+1));
else r "  ✗ 登录失败，响应：$LOGIN_JSON"; FAIL=$((FAIL+1)); fi

# --- 2. 公开读白名单：游客匿名 200 -------------------------------------------
b "[2] 公开读白名单（无 token）…"
check "GET /food/restaurants 游客可读" 200 "$(http_code GET "$API_BASE/food/restaurants")"

# --- 3. 受保护端点（带 token）→ 200 ------------------------------------------
b "[3] 受保护端点（带 token）…"
check "GET /identity/me 已登录 200" 200 "$(http_code GET "$API_BASE/identity/me" "$ACCESS_TOKEN")"

# --- 4. 业务真源 externalId（不再硬编码 student_001）--------------------------
b "[4] 身份真源 externalId …"
ME_JSON="$(curl -s "$API_BASE/identity/me" -H "Authorization: Bearer $ACCESS_TOKEN")"
EXTERNAL_ID="$(printf '%s' "$ME_JSON" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
if [ -n "$EXTERNAL_ID" ]; then
  g "  ✓ /identity/me 返回 externalId=$EXTERNAL_ID（= public.users.id）"; PASS=$((PASS+1))
  # 用该 externalId 命中一个按学生取的业务端点（越权校验依赖 externalId）
  check "GET /tuition/practice/stats/{externalId} 200" 200 \
    "$(http_code GET "$API_BASE/tuition/practice/stats/$EXTERNAL_ID" "$ACCESS_TOKEN")"
else
  r "  ✗ 未能从 /identity/me 解析 externalId，响应：$ME_JSON"; FAIL=$((FAIL+1))
fi
# 断言以 externalId 为准（非硬编码 student_001）：越权访问他人/占位 id 应 403/404
CROSS_CODE="$(http_code GET "$API_BASE/tuition/practice/stats/student_001" "$ACCESS_TOKEN")"
if [ "$CROSS_CODE" = "403" ] || [ "$CROSS_CODE" = "404" ]; then
  g "  ✓ 越权访问 student_001 被拒（$CROSS_CODE，证明真源=externalId 而非硬编码）"; PASS=$((PASS+1))
else
  r "  ✗ 越权访问 student_001 未被拒（实得 $CROSS_CODE，期望 403/404）"; FAIL=$((FAIL+1))
fi

# --- 5. 无 token 访问受保护端点 → 401 ----------------------------------------
b "[5] 无 token 访问受保护端点 → 401 …"
check "GET /identity/me 无 token 401" 401 "$(http_code GET "$API_BASE/identity/me")"

# --- 6. 错误 token → 401 ------------------------------------------------------
b "[6] 错误 token → 401 …"
check "GET /identity/me 坏 token 401" 401 "$(http_code GET "$API_BASE/identity/me" "not.a.valid.token")"

# --- 汇总 ---------------------------------------------------------------------
b "\n========================================"
if [ "$FAIL" -eq 0 ]; then g " 全绿：PASS=$PASS FAIL=$FAIL"; b "========================================"; exit 0
else r " 存在失败：PASS=$PASS FAIL=$FAIL"; b "========================================"; exit 1; fi
