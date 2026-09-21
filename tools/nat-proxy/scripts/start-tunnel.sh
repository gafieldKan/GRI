#!/bin/bash
# 快速启动隧道脚本

set -e

FRP_DIR="$HOME/.frp"
FRPC_CONFIG="$FRP_DIR/frpc.ini"

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

# 检查配置
if [ ! -f "$FRPC_CONFIG" ]; then
    log_error "未找到配置文件"
    echo "请先运行配置脚本："
    echo "  ./scripts/configure-frpc.sh --server-ip <IP> --token <TOKEN>"
    exit 1
fi

# 检查 frpc
if [ ! -f "$FRP_DIR/frpc" ]; then
    log_error "未找到 frpc 可执行文件"
    exit 1
fi

# 检查是否已运行
if pgrep -x "frpc" > /dev/null; then
    log_info "frpc 已在运行中"
    echo "进程信息:"
    pgrep -a frpc
    echo ""
    echo "停止服务：pkill frpc"
    echo "重启服务：pkill frpc && $FRP_DIR/frpc -c $FRPC_CONFIG"
    exit 0
fi

# 启动 frpc
log_info "启动 frpc..."
log_info "配置文件：$FRPC_CONFIG"
echo ""
echo "启动隧道服务..."
echo "按 Ctrl+C 停止服务"
echo ""

# 前台运行
$FRP_DIR/frpc -c "$FRPC_CONFIG"
