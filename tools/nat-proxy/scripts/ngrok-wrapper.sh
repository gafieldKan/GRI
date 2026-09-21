#!/bin/bash
# ngrok 快速启动包装脚本
# 简化 ngrok 常用操作

set -e

NGROK_DIR="$HOME/.ngrok"
NGROK_CONFIG="$NGROK_DIR/config.yml"

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

# 检查 ngrok 是否安装
if ! command -v ngrok &> /dev/null; then
    log_error "ngrok 未安装"
    echo "请先运行：./scripts/install-ngrok.sh"
    exit 1
fi

# 检查 authtoken
if [ ! -f "$NGROK_CONFIG" ]; then
    log_error "ngrok 未配置"
    echo ""
    echo "请先运行以下命令配置 authtoken："
    echo "  ngrok config add-authtoken <your_token>"
    echo ""
    echo "获取 token: https://ngrok.com/get-started/your-authtoken"
    exit 1
fi

show_menu() {
    echo "=========================================="
    echo "  ngrok 快速启动"
    echo "=========================================="
    echo ""
    echo "请选择隧道类型："
    echo "  1) HTTP 隧道 (网站/Web 应用)"
    echo "  2) TCP 隧道 (数据库/自定义服务)"
    echo "  3) 查看运行中的隧道"
    echo "  4) 停止所有隧道"
    echo "  5) 查看帮助"
    echo "  0) 退出"
    echo ""
    read -p "请选择 [0-5]: " choice
}

start_http_tunnel() {
    echo ""
    read -p "请输入本地服务端口 (默认 80): " LOCAL_PORT
    LOCAL_PORT=${LOCAL_PORT:-80}

    read -p "是否需要固定子域名？(y/n, 需付费账号): " FIXED
    if [ "$FIXED" = "y" ] || [ "$FIXED" = "Y" ]; then
        read -p "输入子域名 (如 myapp.ngrok.app): " DOMAIN
        ngrok http "$LOCAL_PORT" --domain="$DOMAIN"
    else
        log_info "启动 HTTP 隧道，本地端口：$LOCAL_PORT"
        log_info "按 Ctrl+C 停止隧道"
        echo ""
        ngrok http "$LOCAL_PORT"
    fi
}

start_tcp_tunnel() {
    echo ""
    read -p "请输入本地服务端口 (默认 3306): " LOCAL_PORT
    LOCAL_PORT=${LOCAL_PORT:-3306}

    log_info "启动 TCP 隧道，本地端口：$LOCAL_PORT"
    ngrok tcp "$LOCAL_PORT"
}

show_status() {
    echo ""
    log_info "查看运行中的隧道..."
    # 检查 ngrok 进程
    if pgrep -x "ngrok" > /dev/null; then
        echo "ngrok 正在运行"
        pgrep -a ngrok
    else
        echo "ngrok 未运行"
    fi
}

stop_all() {
    echo ""
    log_info "停止所有 ngrok 隧道..."
    pkill -f "ngrok" || true
    log_info "已停止"
}

show_help() {
    echo ""
    echo "ngrok 常用命令："
    echo ""
    echo "  ngrok http 80           # 启动 HTTP 隧道"
    echo "  ngrok http 3000         # 启动 HTTP 隧道到 3000 端口"
    echo "  ngrok tcp 3306          # 启动 TCP 隧道"
    echo "  ngrok status            # 查看状态"
    echo "  ngrok config check      # 检查配置"
    echo "  ngrok api list          # 查看 API 隧道"
    echo ""
    echo "更多命令：ngrok --help"
    echo ""
}

# 主循环
while true; do
    show_menu
    case $choice in
        1)
            start_http_tunnel
            ;;
        2)
            start_tcp_tunnel
            ;;
        3)
            show_status
            ;;
        4)
            stop_all
            ;;
        5)
            show_help
            ;;
        0)
            log_info "退出"
            exit 0
            ;;
        *)
            log_error "无效选择"
            ;;
    esac
    echo ""
    read -p "按回车键继续..."
done
