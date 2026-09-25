# NAT Proxy - 内网穿透工具

基于 frp/ngrok 的内网穿透工具，让你在无公网 IP 情况下也能发布网站。

## 特性

- **双方案支持**: frp (自建中转) 和 ngrok (云服务)
- **易部署**: 一键脚本部署 frps 服务端
- **简配置**: 本地 frpc/ngrok 配置工具
- **可视化**: 低代码平台集成管理界面
- **GRI 集成**: 内置 GRI 点餐系统穿透配置

## 快速开始

### 方案对比

| 特性 | ngrok 免费方案 | Oracle Cloud + frp |
|------|---------------|-------------------|
| 成本 | 免费 (40GB/月) | 免费 (永久) |
| 部署难度 | 极简 | 中等 |
| 流量限制 | 40GB/月 | 10TB/月 |
| 域名 | 随机子域名 | 固定 IP |
| 隧道数量 | 1 个 | 不限 |
| 适用场景 | 开发调试、临时演示 | 生产环境、长期使用 |

### 快速决策

- **想快速上手/临时使用** → 查看 [ngrok 方案](./docs/ngrok-solution.md)
- **长期使用/需要固定地址** → 查看 [frp 方案](./docs/deployment.md)
- **GRI 点餐系统部署** → 查看 [GRI 部署指南](../GRI/DEPLOYMENT.md)

---

## 架构说明

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│ 外网用户     │     │ Oracle 免费云    │     │ 本地电脑    │
│ 浏览器/小程序│────►│ frps (公网中转)  │◄────│ frpc 客户端 │
└─────────────┘     └──────────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │ 低代码平台   │
                    │ 管理界面    │
                    └─────────────┘
```

---

## 安装指南

### 方案 A: ngrok（推荐新手）

```bash
# 1. 安装 ngrok
./scripts/install-ngrok.sh

# 2. 配置 authtoken（从 ngrok.com 获取）
ngrok config add-authtoken <your_token>

# 3. 启动隧道
ngrok http 80
```

详细文档：[docs/ngrok-solution.md](./docs/ngrok-solution.md)

### 方案 B: frp + Oracle Cloud（长期使用）

1. 访问 https://www.oracle.com/cloud/free/ 注册账号
2. 创建 ARM 架构实例（4 核 24G）
3. 部署 frps 服务端

```bash
# SSH 登录到 Oracle 云服务器
ssh -i ~/.ssh/your_key ubuntu@your_server_ip

# 一键部署 frps
curl -o deploy-frps.sh https://raw.githubusercontent.com/your-repo/nat-proxy/main/scripts/deploy-frps.sh
chmod +x deploy-frps.sh
sudo ./deploy-frps.sh
```

4. 配置本地 frpc 客户端

```bash
./scripts/configure-frpc.sh --server-ip <IP> --token <TOKEN>
```

5. 启动隧道

```bash
./scripts/start-tunnel.sh
```

详细文档：[docs/deployment.md](./docs/deployment.md)

---

## GRI 点餐系统专用

如果是为 GRI 点餐系统配置穿透，直接使用内置脚本：

```bash
cd /home/ubantu/reactProject/GRI

# 方案 A: 使用 ngrok
./start-ngrok.sh

# 方案 B: 使用 FRP
./setup-frp.sh --server-ip <IP> --token <TOKEN>
```

详细文档：[../GRI/DEPLOYMENT.md](../GRI/DEPLOYMENT.md)

---

## 低代码平台集成

FRP Manager 插件已集成到低代码平台，提供：

- 隧道可视化管理
- 一键启停隧道
- 流量统计监控
- 隧道配置管理

### 使用方式

```javascript
// FRP Manager 已随低代码平台一并退役（本体驱动改造，2026-09）
// nat-proxy 本体（frps/frpc/ngrok 脚本 + 测试）不受影响
```

### API 接口

| 接口 | 说明 |
|------|------|
| GET /api/frp/status | 获取隧道状态 |
| POST /api/frp/tunnel | 创建隧道 |
| DELETE /api/frp/tunnel/:name | 删除隧道 |
| POST /api/frp/tunnel/:name/start | 启动隧道 |
| POST /api/frp/tunnel/:name/stop | 停止隧道 |
| GET /api/frp/stats | 获取流量统计 |

---

## 目录结构

```
nat-proxy/
├── README.md                 # 本文件
├── scripts/                  # 脚本目录
│   ├── deploy-frps.sh       # frps 服务端部署脚本
│   ├── configure-frpc.sh    # frpc 客户端配置脚本
│   ├── start-tunnel.sh      # 启动隧道脚本
│   ├── install-frpc.sh      # 安装 frpc 脚本
│   ├── install-ngrok.sh     # 安装 ngrok 脚本
│   └── ngrok-wrapper.sh     # ngrok 包装脚本
├── config/                   # 配置文件目录
│   ├── frps.ini.tpl         # frps 配置模板
│   └── frpc.ini.tpl         # frpc 配置模板
├── docs/                     # 文档目录
│   ├── deployment.md        # FRP 部署指南
│   ├── ngrok-solution.md    # ngrok 方案
│   ├── oracle-cloud-setup.md # Oracle Cloud 设置
│   └── usage-guide.md       # 使用指南
└── GRI/                      # GRI 点餐系统配置
    ├── DEPLOYMENT.md        # GRI 部署文档
    ├── setup-frp.sh         # FRP 配置脚本
    └── start-ngrok.sh       # ngrok 启动脚本
```

---

## 安全性

- **Token 认证机制**: 客户端与服务端使用统一 Token 验证
- **TLS 加密传输**: 支持 TLS 加密连接
- **端口访问控制**: 可配置允许的端口范围
- **IP 白名单**: 支持 IP 白名单限制

---

## 故障排查

### frpc 无法连接 frps

```bash
# 检查网络连通性
ping <服务器 IP>
telnet <服务器 IP> 7000

# 检查防火墙
sudo ufw status
sudo ufw allow 7000/tcp

# 查看日志
cat ~/.frp/frpc.log
```

### 隧道建立但无法访问

1. 确认本地服务正常运行
2. 检查远程端口是否被占用
3. 查看 frps/frpc 日志

### ngrok 连接失败

```bash
# 检查 ngrok 状态
ngrok config check

# 查看日志
cat ~/.ngrok2/ngrok.log
```

---

## 相关资源

- [frp GitHub](https://github.com/fatedier/frp)
- [ngrok 官网](https://ngrok.com)
- [Oracle Cloud 免费套餐](https://www.oracle.com/cloud/free/)

---

## 许可证

MIT License
