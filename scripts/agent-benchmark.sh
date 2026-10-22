#!/usr/bin/env bash
# scripts/agent-benchmark.sh —— AI 底座对标体检（只读，不写不改）
# 用途：对照 OpenClaw / Hermes 最新实现，输出 GRI agent 底座的 14 维度对标骨架。
# 依据：docs/AGENT_BENCHMARK_PROTOCOL.md
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

OC="${OPENCLAW_DIR:-$HOME/.npm-global/lib/node_modules/openclaw}"
echo "GRI AI 底座对标 · $(date '+%F %T %z')"
echo "════════════════════════════════════════════════════════════"

echo "▍对标源"
if [ -f "$OC/package.json" ]; then
  v=$(python3 -c "import json;print(json.load(open('$OC/package.json')).get('version'))" 2>/dev/null)
  echo "  OpenClaw 本地版本      : ${v:-未知}  ($OC)"
  echo "  OpenClaw docs          : $([ -d "$OC/docs" ] && echo '✓' || echo '✗')   dist: $([ -d "$OC/dist" ] && echo '✓' || echo '✗')"
else
  echo "  OpenClaw               : ✗ 未找到（设 OPENCLAW_DIR）"
fi
echo "  OpenClaw npm 最新      : $(timeout 12 npm view openclaw version 2>/dev/null || echo '(离线)')"
HR="${GRI_REFS:-$HOME/refs}/hermes-agent"
if [ -d "$HR/.git" ]; then
  echo "  Hermes 源码            : ✓ $(git -C "$HR" rev-parse --short HEAD) ($(git -C "$HR" log -1 --format=%ci))
                             $HR ($(du -sh "$HR" 2>/dev/null | awk '{print $1}'))"
else
  echo "  Hermes 源码            : ✗ 未取（跑 bash scripts/fetch-references.sh）"
fi

echo
echo "▍GRI 底座导出面（packages/agent-core/src/index.js）"
grep -oE "^export \{[^}]*\}|^export .*from" packages/agent-core/src/index.js 2>/dev/null | head -5 \
  || echo "  (读不到 index.js)"

echo
echo "▍15 维度对标骨架（有=✓ / 弱=~ / 无=✗ —— 待人工判定）"
cat <<'TABLE'
   1 推理环            GRI:AgentCore.run            OC:agent-runtime
   2 工具契约          GRI:makeTool                 OC:defineToolPlugin(+outputSchema/optional)
   3 技能 Skills       GRI:parseSkillMarkdown       OC:SKILL.md(+预览)
   4 插件清单          GRI:—                        OC:openclaw.plugin.json
   5 能力注册          GRI:—                        OC:api.register*(16类)
   6 契约与强制        GRI:—                        OC:OpenClawPluginApi+契约测试
   7 钩子 Hooks        GRI:—                        OC:5类hook
   8 记忆 Memory       GRI:MemoryStore              OC:memory-lancedb/wiki
   9 MCP               GRI:McpClient/Pool           OC:MCP桥
  10 ACP               GRI:AcpAdapter               OC:SDK harness
  11 模型路由          GRI:ModelRouter              OC:provider catalog
  12 沙箱/信任边界     GRI:未定义                   OC:in-process非沙箱(明示)
  13 多模态            GRI:multimodalModel          OC:16类能力含
  14 观测/审计         GRI:agent.tool_runs          OC:doctor/plugins inspect
  15 外部agent后端     GRI:—                        OC:registerCliBackend / Hermes:delegate_tool
TABLE

echo
echo "▍GRI 底座违约扫描（应全部为 0 或已归位）"
echo "  business LlmService 残留: $(grep -rl 'LlmService' services/api/src --include=*.ts 2>/dev/null | grep -v spec | wc -l) 文件"
echo "  底座含业务词(学科/学生/课程): $(grep -rlE '学科|学生|课程|知识点' packages/agent-core/src 2>/dev/null | wc -l) 文件"
echo "════════════════════════════════════════════════════════════"
echo "结论请记入 docs/benchmarks/AGENT_BENCHMARK_$(date '+%Y-%m').md"
