#!/bin/bash
# frpc 客户端配置脚本
# 适用于 Linux/macOS/WSL

set -e

# 配置参数
FRP_VERSION="0.61.1"
FRP_DIR="$HOME/.frp"
FRPC_CONFIG="$FRP_DIR/frpc.ini"
FRPC_SERVICE="$HOME/.config/systemd/user/frpc.service"

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

# 解析参数
SERVER_IP=""
TOKEN=""
LOCAL_PORT="80"
REMOTE_PORT="8080"
PROTOCOL="tcp"

while [[ $# -gt 0 ]]; do
    case $1 in
        --server-ip)
            SERVER_IP="$2"
            shift 2
            ;;
        --token)
            TOKEN="$2"
            shift 2
            ;;
        --local-port)
            LOCAL_PORT="$2"
            shift 2
            ;;
        --remote-port)
            REMOTE_PORT="$2"
            shift 2
            ;;
        --protocol)
            PROTOCOL="$2"
            shift 2
            ;;
        --help)
            echo "用法：$0 --server-ip <IP> --token <TOKEN> [选项]"
            echo ""
            echo "必需参数:"
            echo "  --server-ip    frps 服务器公网 IP"
            echo "  --token        认证 Token"
            echo ""
            echo "可选参数:"
            echo "  --local-port   本地服务端口 (默认：80)"
            echo "  --remote-port  远程暴露端口 (默认：8080)"
            echo "  --protocol     协议类型 (默认：tcp)"
            exit 0
            ;;
        *)
            log_error "未知参数：$1"
            exit 1
            ;;
    esac
done

# 验证必需参数
if [ -z "$SERVER_IP" ] || [ -z "$TOKEN" ]; then
    log_error "缺少必需参数 --server-ip 和 --token"
    echo "使用 --help 查看用法"
    exit 1
fi

log_info "开始配置 frpc 客户端..."

# 检测系统架构
ARCH=$(uname -m)
case $ARCH in
    x86_64)
        FRP_ARCH="amd64"
        ;;
    aarch64|arm64)
        FRP_ARCH="arm64"
        ;;
    *)
        log_error "不支持的架构：$ARCH"
        exit 1
        ;;
esac

# 检测操作系统
OS=$(uname -s)
case $OS in
    Linux)
        FRP_OS="linux"
        ;;
    Darwin)
        FRP_OS="darwin"
        ;;
    *)
        log_error "不支持的操作系统：$OS"
        exit 1
        ;;
esac

log_info "检测到系统：${FRP_OS}_${FRP_ARCH}"

# 下载 frp
if [ ! -f "$FRP_DIR/frpc" ]; then
    log_info "下载 frp v${FRP_VERSION}..."
    mkdir -p "$FRP_DIR"
    cd /tmp
    wget -q "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_${FRP_OS}_${FRP_ARCH}.tar.gz"
    tar -xzf "frp_${FRP_VERSION}_${FRP_OS}_${FRP_ARCH}.tar.gz"
    mv "frp_${FRP_VERSION}_${FRP_OS}_${FRP_ARCH}/frpc" "$FRP_DIR/"
    chmod +x "$FRP_DIR/frpc"
fi

# 生成配置
log_info "生成配置文件..."
cat > "$FRPC_CONFIG" << EOF
[common]
server_addr = ${SERVER_IP}
server_port = 7000
token = ${TOKEN}
tls_enable = true
log_file = ${FRP_DIR}/frpc.log
log_level = info
log_max_days = 7

# 默认隧道配置
[tunnel]
type = ${PROTOCOL}
local_ip = 127.0.0.1
local_port = ${LOCAL_PORT}
remote_port = ${REMOTE_PORT}
EOF

log_info "配置文件已保存至：$FRPC_CONFIG"

# 创建启动脚本
cat > "$FRP_DIR/start-tunnel.sh" << EOF
#!/bin/bash
$FRP_DIR/frpc -c $FRPC_CONFIG
EOF
chmod +x "$FRP_DIR/start-tunnel.sh"

# 尝试配置开机自启（Linux only）
if [ "$OS" = "Linux" ]; then
    if command -v systemctl &> /dev/null; then
        log_info "配置 systemd 服务..."

        mkdir -p ~/.config/systemd/user/
        cat > "$FRPC_SERVICE" << SEOF
[Unit]
Description=frpc - Fast Reverse Proxy Client
After=network.target

[Service]
Type=simple
ExecStart=$FRP_DIR/frpc -c $FRPC_CONFIG
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=default.target
SEOF

        systemctl --user daemon-reload
        systemctl --user enable frpc
        log_info "已配置开机自启，运行 'systemctl --user start frpc' 启动服务"
    fi
fi

log_info "=========================================="
log_info "frpc 配置完成！"
log_info "=========================================="
log_info "服务器：${SERVER_IP}:7000"
log_info "本地端口：${LOCAL_PORT}"
log_info "远程端口：${REMOTE_PORT}"
log_info ""
log_info "启动隧道："
log_info "  $FRP_DIR/start-tunnel.sh"
log_info ""
log_info "或手动运行："
log_info "  $FRP_DIR/frpc -c $FRPC_CONFIG"
