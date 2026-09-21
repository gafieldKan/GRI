#!/bin/bash
# frpc 客户端一键安装脚本
# 自动下载并配置 frpc，无需手动操作

set -e

FRP_VERSION="0.61.1"
FRP_DIR="$HOME/.frp"

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

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo "=========================================="
echo "  NAT Proxy - frpc 客户端一键安装"
echo "=========================================="
echo ""

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
log_info "下载 frp v${FRP_VERSION}..."
mkdir -p "$FRP_DIR"
cd /tmp

DOWNLOAD_URL="https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_${FRP_OS}_${FRP_ARCH}.tar.gz"

if command -v wget &> /dev/null; then
    wget -q "$DOWNLOAD_URL"
elif command -v curl &> /dev/null; then
    curl -sL "$DOWNLOAD_URL" -o "frp_${FRP_VERSION}_${FRP_OS}_${FRP_ARCH}.tar.gz"
else
    log_error "未找到 wget 或 curl，请先安装"
    exit 1
fi

tar -xzf "frp_${FRP_VERSION}_${FRP_OS}_${FRP_ARCH}.tar.gz"
mv "frp_${FRP_VERSION}_${FRP_OS}_${FRP_ARCH}/frpc" "$FRP_DIR/"
chmod +x "$FRP_DIR/frpc"

log_info "frpc 已安装至：$FRP_DIR/frpc"

# 交互式配置
echo ""
echo "=========================================="
echo "  配置 frpc 客户端"
echo "=========================================="
echo ""

read -p "请输入 frps 服务器公网 IP: " SERVER_IP
if [ -z "$SERVER_IP" ]; then
    log_error "服务器 IP 不能为空"
    exit 1
fi

read -p "请输入 Token: " TOKEN
if [ -z "$TOKEN" ]; then
    log_error "Token 不能为空"
    exit 1
fi

read -p "本地服务端口 (默认 80): " LOCAL_PORT
LOCAL_PORT=${LOCAL_PORT:-80}

read -p "远程暴露端口 (默认 8080): " REMOTE_PORT
REMOTE_PORT=${REMOTE_PORT:-8080}

read -p "协议类型 (tcp/http, 默认 tcp): " PROTOCOL
PROTOCOL=${PROTOCOL:-tcp}

# 生成配置
FRPC_CONFIG="$FRP_DIR/frpc.ini"
cat > "$FRPC_CONFIG" << EOF
[common]
server_addr = ${SERVER_IP}
server_port = 7000
token = ${TOKEN}
tls_enable = true
log_file = ${FRP_DIR}/frpc.log
log_level = info
log_max_days = 7

[tunnel]
type = ${PROTOCOL}
local_ip = 127.0.0.1
local_port = ${LOCAL_PORT}
remote_port = ${REMOTE_PORT}
EOF

log_info "配置已保存至：$FRPC_CONFIG"

# 创建启动脚本
cat > "$FRP_DIR/start.sh" << EOF
#!/bin/bash
exec $FRP_DIR/frpc -c $FRPC_CONFIG
EOF
chmod +x "$FRP_DIR/start.sh"

# 配置开机自启 (Linux)
if [ "$FRP_OS" = "linux" ]; then
    if command -v systemctl &> /dev/null; then
        echo ""
        read -p "是否配置开机自启？(y/n): " AUTO_START
        if [ "$AUTO_START" = "y" ] || [ "$AUTO_START" = "Y" ]; then
            FRPC_SERVICE="$HOME/.config/systemd/user/frpc.service"
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
            log_info "已配置开机自启"
            log_info "运行 'systemctl --user start frpc' 启动服务"
        fi
    fi
fi

echo ""
echo "=========================================="
log_info "安装完成！"
echo "=========================================="
echo ""
echo "启动服务:"
echo "  $FRP_DIR/start.sh"
echo ""
echo "或运行:"
echo "  $FRP_DIR/frpc -c $FRPC_CONFIG"
echo ""
echo "查看状态:"
echo "  systemctl --user status frpc"
echo ""
