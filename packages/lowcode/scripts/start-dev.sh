#!/bin/bash
# Awesome Lowcode 开发服务器启动脚本
# 用法：./scripts/start-dev.sh [端口]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PORT=${1:-5173}

echo "======================================"
echo "  Awesome Lowcode 开发服务器"
echo "======================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误：未找到 Node.js，请先安装 Node.js v18+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -c2-)
echo "✓ Node.js 版本：v$NODE_VERSION"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo "❌ 错误：未找到 npm"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo "✓ npm 版本：v$NPM_VERSION"

# 检查 node_modules
if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    echo "⚠️  未找到 node_modules，开始安装依赖..."
    cd "$PROJECT_ROOT"
    npm install
fi

# 启动开发服务器
echo ""
echo "启动开发服务器..."
echo "访问地址：http://localhost:$PORT"
echo ""
cd "$PROJECT_ROOT"
npm run dev -- --port $PORT
