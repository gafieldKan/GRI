#!/usr/bin/env bash
# size-report.sh —— 项目体检（纯只读，不改任何东西）
# 用途：瘦身改造的度量基线与定期体检。输出工作区 / docker / git / 文档 关键体积。
# 用法：bash scripts/size-report.sh
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

hr() { printf '─%.0s' {1..58}; echo; }
kb() { du -sh "$1" 2>/dev/null | awk '{print $1}'; }

echo "GRI 项目体检 · $(date '+%Y-%m-%d %H:%M:%S %z')"
hr

echo "▍工作区总览"
printf '  %-28s %s\n' "repo total (incl node_modules)" "$(du -sh . 2>/dev/null | awk '{print $1}')"
printf '  %-28s %s\n' ".git" "$(kb .git)"
printf '  %-28s %s\n' "node_modules (all)" "$(du -sch $(find . -maxdepth 4 -name node_modules -type d 2>/dev/null) 2>/dev/null | tail -1 | awk '{print $1}')"
printf '  %-28s %s\n' "apps/" "$(kb apps)"
printf '  %-28s %s\n' "services/" "$(kb services)"
printf '  %-28s %s\n' "packages/ (core)" "$(kb packages)"
printf '  %-28s %s\n' "scripts/" "$(kb scripts)"
printf '  %-28s %s (files: %s)\n' "docs/" "$(kb docs)" "$(find docs -type f 2>/dev/null | wc -l)"
printf '  %-28s %s (files: %s)\n' ".agents/" "$(kb .agents)" "$(find .agents -type f 2>/dev/null | wc -l)"
hr

echo "▍大对象 Top（>1M，排除 node_modules/.git）"
find . -type f -size +1M -not -path '*/node_modules/*' -not -path './.git/*' 2>/dev/null \
  | xargs -r du -h 2>/dev/null | sort -rh | head -12 | sed 's/^/  /'
hr

echo "▍git 追踪"
printf '  %-28s %s\n' "tracked files" "$(git ls-files 2>/dev/null | wc -l)"
printf '  %-28s %s\n' "tracked dist/build/node_modules" "$(git ls-files 2>/dev/null | grep -cE '(^|/)(node_modules|dist|build)/')"
printf '  %-28s %s\n' "working tree" "$(git status --porcelain 2>/dev/null | wc -l) changed"
hr

echo "▍Docker"
if command -v docker >/dev/null 2>&1; then
  printf '  %-28s %s\n' "images total" "$(docker images -q 2>/dev/null | wc -l)"
  printf '  %-28s %s\n' "dangling images" "$(docker images -f dangling=true -q 2>/dev/null | wc -l)"
  docker system df 2>/dev/null | sed 's/^/  /'
else
  echo "  (docker 不可用)"
fi
hr
echo "完。本脚本只读，未做任何改动。"
