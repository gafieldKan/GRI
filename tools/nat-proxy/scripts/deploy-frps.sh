#!/bin/bash
# frps 服务端一键部署脚本
# 适用于 Oracle Cloud 免费层 (Ubuntu 20.04/22.04)

set -e

# 配置参数
FRP_VERSION="0.61.1"
FRP_DIR="/opt/frp"
FRPS_CONFIG="$FRP_DIR/frps.ini"
SYSTEMD_SERVICE="/etc/systemd/system/frps.service"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否以 root 运行
if [ "$EUID" -ne 0 ]; then
    log_error "请使用 sudo 运行此脚本"
    exit 1
fi

log_info "开始部署 frps 服务端..."

# 生成随机 Token
TOKEN=$(openssl rand -hex 16)
log_info "生成随机 Token: $TOKEN"

# 下载 frp
log_info "下载 frp v${FRP_VERSION}..."
cd /tmp
wget -q "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_arm64.tar.gz"
tar -xzf "frp_${FRP_VERSION}_linux_arm64.tar.gz"
mkdir -p "$FRP_DIR"
mv "frp_${FRP_VERSION}_linux_arm64/"* "$FRP_DIR/"

# 配置 frps
log_info "配置 frps..."
cat > "$FRPS_CONFIG" << EOF
[common]
bind_port = 7000
bind_addr = 0.0.0.0
token = ${TOKEN}
dashboard_port = 7500
dashboard_user = admin
dashboard_pwd = ${TOKEN}
log_file = /var/log/frps.log
log_level = info
log_max_days = 7
tls_enable = true

# 端口范围限制（可选）
# max_ports_per_client = 10
# allow_ports = 8000-9000,10000,11000-12000
EOF

# 创建 systemd 服务
log_info "创建 systemd 服务..."
cat > "$SYSTEMD_SERVICE" << EOF
[Unit]
Description=frps - Fast Reverse Proxy Server
After=network.target

[Service]
Type=simple
User=root
ExecStart=${FRP_DIR}/frps -c ${FRPS_CONFIG}
Restart=on-failure
RestartSec=5s
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF

# 启动服务
log_info "启动 frps 服务..."
systemctl daemon-reload
systemctl enable frps
systemctl start frps

# 配置防火墙
if command -v ufw &> /dev/null; then
    log_info "配置 UFW 防火墙..."
    ufw allow 7000/tcp comment "frp client connection"
    ufw allow 7500/tcp comment "frps dashboard"
    ufw allow 8080/tcp comment "tunnel http"
    ufw allow 8443/tcp comment "tunnel https"
fi

# 获取服务器公网 IP
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "unknown")

log_info "=========================================="
log_info "frps 部署完成！"
log_info "=========================================="
log_info "服务器地址：${PUBLIC_IP}"
log_info "客户端端口：7000"
log_info "管理面板：http://${PUBLIC_IP}:7500"
log_info "管理员用户名：admin"
log_info "管理员密码：${TOKEN}"
log_info "Token: ${TOKEN}"
log_info "=========================================="
log_info "请保存以上信息，特别是 Token！"
log_info ""

# 创建客户端配置生成脚本
cat > /tmp/frpc_config.txt << EOF
# 将以下配置复制到本地 frpc.ini

[common]
server_addr = ${PUBLIC_IP}
server_port = 7000
token = ${TOKEN}
tls_enable = true

# 示例：Web 服务隧道
#[web]
#type = tcp
#local_ip = 127.0.0.1
#local_port = 80
#remote_port = 8080
EOF

log_info "客户端配置示例："
cat /tmp/frpc_config.txt

log_info ""
log_info "提示：运行以下命令启动 frpc 测试"
log_info "  frpc -c ./frpc.ini"
