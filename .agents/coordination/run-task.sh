#!/usr/bin/env bash
# GRI 任务下达器：把「系统提示 + 共享上下文 + 任务卡」拼成提示词，非交互驱动 Claude/Codex。
# 用法： run-task.sh <codex|claude> <任务卡路径>
# 产出： .agents/coordination/logs/<task>-<agent>-<ts>.log
set -uo pipefail
ROOT=/home/ubantu/GRI
AGENT="${1:?usage: run-task.sh <codex|claude> <taskcard>}"
CARD="${2:?usage: run-task.sh <codex|claude> <taskcard>}"
CARD_ABS="$ROOT/$CARD"
[[ -f "$CARD_ABS" ]] || { echo "任务卡不存在: $CARD_ABS" >&2; exit 2; }

TASK_ID="$(basename "$CARD" .md)"
LOG_DIR="$ROOT/.agents/coordination/logs"
mkdir -p "$LOG_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/${TASK_ID}-${AGENT}-${TS}.log"

PROMPT="$(cat <<EOF
$(cat "$ROOT/.agents/coordination/PREAMBLE.md" 2>/dev/null || true)

## 项目全景（共享上下文）
$(cat "$ROOT/.agents/shared-context.md")

## 你的系统角色
$(cat "$ROOT/.agents/$AGENT/system-prompt.md")

## 本次任务卡（严格按此执行）
$(cat "$CARD_ABS")

## 执行要求
1. 直接在工作树 /home/ubantu/GRI 内产出可运行代码，不要只给方案。
2. 严守任务卡的「产出物清单」「验收标准」，逐条自检后再结束。
3. 所有产出文件路径以任务卡为准（卡内已含 p2- 前缀）。
4. 遇到无法自行决定的设计点，在最终消息用「❓ 需确认：」列出，其余一律自行推进。
5. 结束时输出：改动文件清单 + 自检结果（tsc/lint/test 命令与结果）+ 未决项。
EOF
)"

echo "=== 下达 $TASK_ID → $AGENT ===" | tee "$LOG"
echo "提示词字节数: $(printf '%s' "$PROMPT" | wc -c)" | tee -a "$LOG"
echo "日志: $LOG" | tee -a "$LOG"
echo "开始: $(date -Iseconds)" | tee -a "$LOG"

case "$AGENT" in
  codex)
    # < /dev/null：非交互后台运行时阻止 Codex 误从继承的 stdin 读输入（
    # 会打印 "Reading additional input from stdin..." 并空转/静默退出）。
    codex exec -C "$ROOT" --skip-git-repo-check \
      -c model_reasoning_effort="high" \
      "$PROMPT" < /dev/null 2>&1 | tee -a "$LOG"
    ;;
  claude)
    claude -p "$PROMPT" \
      --permission-mode bypassPermissions \
      < /dev/null \
      --add-dir "$ROOT" 2>&1 | tee -a "$LOG"
    ;;
  *) echo "未知 agent: $AGENT" >&2; exit 2;;
esac
RC="${PIPESTATUS[0]}"
echo "结束: $(date -Iseconds)  exit=$RC" | tee -a "$LOG"
exit "$RC"
