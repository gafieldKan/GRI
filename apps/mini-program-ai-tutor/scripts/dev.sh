#!/usr/bin/env bash
# dev.sh —— 以指定的后端 origin 启动微信小程序（mp-weixin）监听构建。
#
# 用法:
#   ./scripts/dev.sh https://localhost                 # 仅微信开发者工具（本机；nginx 若跑 prod conf 则为自签 HTTPS）
#   ./scripts/dev.sh https://xxxx.ngrok-free.dev       # 真机预览（ngrok 免费穿透 → nginx:80）
#
# 说明:
#   - mp-weixin 无同源相对，URL 必须在构建期烘焙为绝对地址；
#     VITE_API_BASE_URL=<origin>、VITE_AUTH_BASE_URL=<origin>/auth（nginx 保留 /auth 前缀转发 auth-center）。
#   - UNI_INPUT_DIR=. 是顶层活代码布局的硬要求（见 vite.config.js 顶部注释），不可省。
#   - 产物输出到 dist/dev/mp-weixin，用微信开发者工具导入该目录。
set -euo pipefail
cd "$(dirname "$0")/.."

ORIGIN="${1:?用法: ./scripts/dev.sh <origin>  例: http://localhost 或 https://xxx.ngrok-free.dev}"

export VITE_API_BASE_URL="$ORIGIN"
export VITE_AUTH_BASE_URL="$ORIGIN/auth"

echo "[mini] 后端 origin = $ORIGIN"
echo "[mini] API base      = $VITE_API_BASE_URL"
echo "[mini] AUTH base     = $VITE_AUTH_BASE_URL"

# 经 package.json 的 dev:weixin 起（该脚本已含 UNI_INPUT_DIR=.；走 npm 才会把根 node_modules/.bin
# 里的 `uni` 加进 PATH —— 裸 `uni` 在脚本里会 command not found，monorepo 下 uni 被提升到根）。
exec npm run dev:weixin
