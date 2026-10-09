#!/usr/bin/env bash
# Wave 1：Codex 串行执行（共用工作树，必须串行）
# 2026-10-09 更新：T1 已完成提交（08bcb33）；T11 已作废（VOID，目标早已实现/与架构冲突）；
#                 故本波仅剩 T4（已按代码实况重写卡）。
set -uo pipefail
ROOT=/home/ubantu/GRI
cd "$ROOT"
CHAIN=(
  "codex .agents/codex/tasks/p2-task-4-food-review-coupon-merchant.md"
)
for step in "${CHAIN[@]}"; do
  set -- $step
  echo "############ WAVE1 STEP: $2 ($1) $(date -Iseconds) ############"
  bash .agents/coordination/run-task.sh "$1" "$2"
  rc=$?
  echo "############ STEP DONE rc=$rc: $2 ############"
done
echo "############ WAVE1 COMPLETE $(date -Iseconds) ############"
