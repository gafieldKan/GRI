#!/usr/bin/env bash
# scripts/fetch-references.sh —— 取/更新对标参考源（OpenClaw / Hermes）
# 只读仓库之外，落在 ~/refs/（不进 git，避免 359M 入库）。
# 依据：docs/AGENT_BENCHMARK_PROTOCOL.md
set -uo pipefail

REF="${GRI_REFS:-$HOME/refs}"
mkdir -p "$REF"

echo "GRI 对标参考源 fetch · $(date '+%F %T %z')"
echo "落位：$REF"
echo "════════════════════════════════════════════════════════════"

# ── Hermes（Python，MIT）────────────────────────────────────
H="$REF/hermes-agent"
if [ -d "$H/.git" ]; then
  echo "▍Hermes 已存在 → 增量更新"
  git -C "$H" fetch --depth 1 origin main 2>&1 | tail -2
  git -C "$H" reset --hard origin/main 2>&1 | tail -1
else
  echo "▍Hermes 浅克隆（depth 1，仅 main）"
  timeout 300 git clone --depth 1 --single-branch --branch main \
    https://github.com/NousResearch/hermes-agent "$H" 2>&1 | tail -3
fi
if [ -d "$H/.git" ]; then
  echo "  commit : $(git -C "$H" rev-parse --short HEAD)  ($(git -C "$H" log -1 --format=%ci))"
  echo "  size   : $(du -sh "$H" 2>/dev/null | awk '{print $1}')"
else
  echo "  ✗ 克隆失败"
fi

echo
# ── OpenClaw（npm 全局安装，权威文档）──────────────────────
OC="${OPENCLAW_DIR:-$HOME/.npm-global/lib/node_modules/openclaw}"
if [ -f "$OC/package.json" ]; then
  v=$(python3 -c "import json;print(json.load(open('$OC/package.json')).get('version'))" 2>/dev/null)
  echo "▍OpenClaw 本地 v$v（npm 分发包：docs 权威 + dist 打包源）"
  echo "  npm 最新: $(timeout 15 npm view openclaw version 2>/dev/null || echo '(离线)')"
  echo "  升级方式: 由操作者用 openclaw update / npm 全局升级（本脚本不改动安装）"
else
  echo "▍OpenClaw ✗ 未找到（设 OPENCLAW_DIR）"
fi

echo "════════════════════════════════════════════════════════════"
echo "完成。对标请跑：bash scripts/agent-benchmark.sh"
