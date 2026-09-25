# NAT Proxy 文档索引

## 快速开始

### 方案选择

| 需求 | 推荐方案 | 文档链接 |
|------|---------|---------|
| 快速上手/临时使用 | ngrok | [ngrok 方案](./ngrok-solution.md) |
| 长期使用/固定地址 | Oracle Cloud + frp | [frp 方案](./deployment.md) |
| 详细使用指南 | - | [使用指南](./usage-guide.md) |

## 文档列表

1. **[ngrok 方案](./ngrok-solution.md)** - ngrok 快速内网穿透方案
2. **[frp 部署指南](./deployment.md)** - Oracle Cloud + frp 详细部署步骤
3. **[Oracle Cloud 申请指南](./oracle-cloud-setup.md)** - Oracle 免费云注册教程
4. **[使用指南](./usage-guide.md)** - 完整使用手册

## 方案对比

### ngrok 方案
- ✅ 5 分钟上手
- ✅ 无需服务器
- ⚠️ 免费版 40GB/月流量
- ⚠️ 域名随机变化

### frp 方案
- ✅ 10TB/月流量（Oracle 免费层）
- ✅ 固定 IP 地址
- ✅ 可搭建多个隧道
- ⚠️ 需要申请云服务器

## 脚本工具

| 脚本 | 说明 |
|------|------|
| `scripts/install-ngrok.sh` | ngrok 一键安装 |
| `scripts/ngrok-wrapper.sh` | ngrok 快速启动 |
| `scripts/deploy-frps.sh` | frps 服务端部署 |
| `scripts/configure-frpc.sh` | frpc 客户端配置 |
| `scripts/install-frpc.sh` | frpc 一键安装 |
| `scripts/start-tunnel.sh` | 启动隧道 |
