#!/usr/bin/env bash
# ============================================================================
# P2-T3 验收入口（稳定别名）。
#
# 本文件不重复实现逻辑，只作为「契约化入口」转发到统一端到端脚本：
#   .agents/claude/outputs/p2-task-3-e2e-identity-lifecycle.sh
# 从而任何验证方只需调用本入口即可获得标准输出行：
#   PASS=<n> FAIL=<m> VERIFY_EXIT=<0|1>
#
# 用法： bash .agents/claude/outputs/p2-task-3-verify.sh
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
UNIFIED="$ROOT_DIR/.agents/claude/outputs/p2-task-3-e2e-identity-lifecycle.sh"

if [ ! -f "$UNIFIED" ]; then
  echo "PASS=0 FAIL=1 VERIFY_EXIT=1"
  echo "❌ 统一脚本缺失: $UNIFIED" >&2
  exit 1
fi

exec bash "$UNIFIED" "$@"
