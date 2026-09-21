#!/bin/bash
# ngrok 一键安装脚本
# 适用于 Linux/macOS

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "=========================================="
echo "  NAT Proxy - ngrok 一键安装"
echo "=========================================="
echo ""

# 检测系统
OS=$(uname -s)
ARCH=$(uname -m)

log_info "检测到系统：$OS ($ARCH)"

# 下载 ngrok
case $OS in
    Linux)
        if [ "$ARCH" = "x86_64" ]; then
            DOWNLOAD_URL="https://bin.equinox.io/c/bNyj1mQVYKc/ngrok-v3-stable-linux-amd64.tgz"
        elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
            DOWNLOAD_URL="https://bin.equinox.io/c/bNyj1mQVYKc/ngrok-v3-stable-linux-arm64.tgz"
        else
            log_error "不支持的架构：$ARCH"
            exit 1
        fi
        ;;
    Darwin)
        if [ "$ARCH" = "x86_64" ]; then
            DOWNLOAD_URL="https://bin.equinox.io/c/bNyj1mQVYKc/ngrok-v3-stable-darwin-amd64.tgz"
        else
            DOWNLOAD_URL="https://bin.equinox.io/c/bNyj1mQVYKc/ngrok-v3-stable-darwin-arm64.tgz"
        fi
        ;;
    *)
        log_error "不支持的操作系统：$OS"
        exit 1
        ;;
esac

# 安装
log_info "下载 ngrok..."
INSTALL_DIR="$HOME/.ngrok"
mkdir -p "$INSTALL_DIR"
cd /tmp

if command -v wget &> /dev/null; then
    wget -q "$DOWNLOAD_URL" -O ngrok.tgz
elif command -v curl &> /dev/null; then
    curl -sL "$DOWNLOAD_URL" -o ngrok.tgz
else
    log_error "未找到 wget 或 curl"
    exit 1
fi

tar -xzf ngrok.tgz
mv ngrok "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/ngrok"

# 创建软链接
if [ -w "/usr/local/bin" ]; then
    ln -sf "$INSTALL_DIR/ngrok" /usr/local/bin/ngrok
else
    ln -sf "$INSTALL_DIR/ngrok" "$HOME/.local/bin/ngrok"
    log_info "已将 ngrok 添加到 $HOME/.local/bin"
    log_info "请将以下行添加到你的 shell 配置文件 (.bashrc/.zshrc):"
    log_info '  export PATH="$HOME/.local/bin:$PATH"'
fi

log_info "ngrok 已安装完成"
echo ""
echo "=========================================="
echo "  配置 ngrok"
echo "=========================================="
echo ""
echo "请按以下步骤配置 ngrok："
echo ""
echo "1. 访问 https://ngrok.com/signup 注册账号"
echo ""
echo "2. 登录后在 https://ngrok.com/get-started/your-authtoken 获取 Authtoken"
echo ""
echo "3. 运行以下命令绑定账号："
echo "   ngrok config add-authtoken <your_token>"
echo ""
echo "4. 启动隧道："
echo "   ngrok http 80        # 本地 80 端口"
echo "   ngrok http 3000      # 本地 3000 端口"
echo "   ngrok tcp 3306       # TCP 隧道"
echo ""
echo "查看状态："
echo "   ngrok status"
echo ""
echo "查看帮助："
echo "   ngrok --help"
echo ""
