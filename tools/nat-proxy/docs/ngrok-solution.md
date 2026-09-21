# ngrok 方案 - 快速内网穿透

## 方案概述

ngrok 是一个成熟的内网穿透工具，提供免费的云服务，无需自己搭建中转服务器。

### 优势
- ✅ 无需自备服务器
- ✅ 开箱即用，配置简单
- ✅ 自动 HTTPS 证书
- ✅ 支持 HTTP/HTTPS/TCP 隧道

### 限制（免费版）
- 每月 40GB 流量限制
- 单用户单隧道
- 随机子域名（每次重启变化）
- 需要注册账号

## 快速开始

### 步骤 1: 注册账号

1. 访问 https://ngrok.com/
2. 点击 "Sign Up" 注册账号
3. 验证邮箱

### 步骤 2: 安装 ngrok

```bash
# Linux
curl https://ngrok-agent.s3.amazonaws.com/ngrok.asc | \
  sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null && \
  echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | \
  sudo tee /etc/apt/sources.list.d/ngrok.list && \
  sudo apt update && sudo apt install ngrok

# macOS
brew install ngrok

# Windows
# 下载 https://ngrok.com/download
```

### 步骤 3: 绑定账号

登录 ngrok 控制台，获取 Authtoken，然后：

```bash
ngrok config add-authtoken <your_token>
```

### 步骤 4: 启动隧道

```bash
# HTTP 隧道（网站）
ngrok http 80

# 指定端口
ngrok http 3000

# TCP 隧道（数据库等）
ngrok tcp 3306

# 固定域名（付费功能）
ngrok http 80 --domain=your-domain.ngrok.io
```

---

## 在低代码平台中使用

### 方案 A: 命令行方式（推荐）

```bash
# 1. 安装 ngrok
# 2. 绑定账号
# 3. 启动隧道
ngrok http 8080
```

输出示例：
```
Session Status     online
Forwarding         https://abc123.ngrok.io -> http://localhost:8080
```

访问 `https://abc123.ngrok.io` 即可访问本地服务。

### 方案 B: 配置文件方式

创建 `~/.ngrok2/ngrok.yml`：

```yaml
version: 2
authtoken: YOUR_AUTHTOKEN

tunnels:
  web:
    proto: http
    addr: 80
    
  api:
    proto: http
    addr: 3000
    
  app:
    proto: http
    addr: 8080
```

一键启动所有隧道：
```bash
ngrok start --all
```

---

## GRI 点餐系统集成

### 快速启动脚本

GRI 点餐系统已内置 ngrok 启动脚本，在 `/home/ubantu/reactProject/GRI/` 目录下：

```bash
cd /home/ubantu/reactProject/GRI

# 启动 ngrok 隧道（默认端口 5173）
./start-ngrok.sh

# 或指定端口
./start-ngrok.sh --port 5173
```

### 在小程序中使用

1. 启动 Vite 开发服务器：
```bash
cd /home/ubantu/reactProject/GRI/gri-app
npm run dev
```

2. 启动 ngrok 后，记录输出的 Forwarding URL

3. 在微信小程序开发者工具中，修改 `app.js`：
```javascript
App({
  apiBaseUrl: 'https://xxxx-xxxx-xxxx.ngrok-free.dev'
})
```

### Vite 配置

如果遇到 403 错误，需要修改 `vite.config.js`：

```javascript
export default defineConfig({
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['*.ngrok-free.dev'],
  },
})
```

---

## 与低代码平台集成

### 方案 1: 在 FRP Manager 插件中扩展 ngrok 支持

```javascript
// lowcode-plugin/frp-manager/ngrok-controller.js

class NgrokController {
  constructor() {
    this.authtoken = '';
    this.tunnels = new Map();
  }

  // 设置 Authtoken
  setAuthtoken(token) {
    this.authtoken = token;
    return this.exec(['config', 'add-authtoken', token]);
  }

  // 启动 HTTP 隧道
  async startHttpTunnel(localPort, name = 'default') {
    const args = ['http', localPort.toString()];
    if (name) {
      args.push('--name', name);
    }
    
    const process = await this.exec(args);
    this.tunnels.set(name, process);
    
    // 解析 ngrok API 获取隧道信息
    const info = await this.getTunnelInfo(process.pid);
    return info;
  }

  // 停止隧道
  async stopTunnel(name) {
    const process = this.tunnels.get(name);
    if (process) {
      process.kill();
      this.tunnels.delete(name);
    }
  }

  // 获取隧道信息
  async getTunnelInfo(pid) {
    // ngrok 提供本地 API: http://127.0.0.1:4040/api/tunnels
    const response = await fetch('http://127.0.0.1:4040/api/tunnels');
    const data = await response.json();
    return data.tunnels.find(t => t.config.addr.includes(pid.toString())) || {};
  }

  // 执行 ngrok 命令
  async exec(args) {
    const { exec } = require('child_process');
    return new Promise((resolve, reject) => {
      const proc = exec(`ngrok ${args.join(' ')}`, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve(stdout);
      });
      return proc;
    });
  }
}

export default NgrokController;
```

---

## 与 Oracle Cloud 方案对比

| 特性 | ngrok 免费方案 | Oracle Cloud + frp |
|------|---------------|-------------------|
| 成本 | 免费（40GB/月） | 免费（永久） |
| 部署难度 | 极简 | 中等 |
| 流量限制 | 40GB/月 | 10TB/月 |
| 域名 | 随机子域名 | 固定 IP |
| 隧道数量 | 1 个 | 不限 |
| 稳定性 | 依赖 ngrok 服务 | 自主控制 |
| 适用场景 | 开发调试、临时使用 | 生产环境、长期使用 |

---

## 推荐方案

### 场景 1: 开发调试/临时演示
→ 使用 ngrok 免费方案

### 场景 2: 小程序/APP 后端（需要固定地址）
→ 使用 Oracle Cloud + frp

### 场景 3: 长期使用/多隧道
→ 使用 Oracle Cloud + frp

---

## 注意事项

1. **ngrok 免费域名会变化**：每次重启 ngrok，域名会重新分配
2. **流量限制**：40GB/月，超出后需要升级或等待下月
3. **网络延迟**：ngrok 服务器在海外，可能有延迟
4. **合规性**：企业使用请注意合规要求

如果你需要固定域名和更稳定的服务，建议还是申请 Oracle Cloud 免费套餐。
