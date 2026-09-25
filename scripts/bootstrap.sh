#!/bin/bash

# GRI Monorepo Bootstrap Script
# 用于初始化开发环境

set -e

echo "🚀 GRI Monorepo Bootstrap"
echo "========================="

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js"
    exit 1
fi

echo "✅ Node.js: $(node --version)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装"
    exit 1
fi

echo "✅ npm: $(npm --version)"

# 安装根目录依赖
echo ""
echo "📦 安装根目录依赖..."
npm install

# 检查各子项目
echo ""
echo "📋 检查子项目依赖..."

# Web 端
if [ -d "apps/web" ]; then
    echo "  - apps/web: 待安装"
fi

# 小程序
if [ -d "apps/mini-program" ]; then
    echo "  - apps/mini-program: 待安装"
fi

# 后端
if [ -d "services/backend" ]; then
    echo "  - services/backend: 待安装"
fi

echo ""
echo "✅ Bootstrap 完成!"
echo ""
echo "下一步:"
echo "  1. 配置环境变量：复制 .env.example 到 .env 并填写配置"
echo "  2. 安装后端依赖：cd services/backend && npm install"
echo "  3. 安装前端依赖：cd apps/web && npm install"
echo "  4. 启动开发服务：npm run dev"
