# GRI 点餐系统部署指南

## 部署到 80 端口并使用 ngrok 穿透

### 步骤 1: 修改 Vite 配置

修改 `vite.config.js`：

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // 允许 ngrok 域名访问
    allowedHosts: ['*.ngrok-free.dev'],
  },
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' }
  },
})
```

### 步骤 2: 启动开发服务器

```bash
cd /home/ubantu/reactProject/GRI
npm run dev
```

### 步骤 3: 启动 ngrok 隧道

```bash
ngrok http 5173
```

### 步骤 4: 访问应用

ngrok 会输出类似信息：
```
Forwarding  https://xxxx-xxxx-xxxx.ngrok-free.dev -> http://localhost:5173
```

访问该 URL 即可访问你的应用。

## 注意事项

### 403 错误处理

如果出现 403 错误，是因为 Vite 的 `allowedHosts` 配置未包含当前 ngrok 域名。

解决方法：
1. 将 ngrok 域名添加到 `allowedHosts`
2. 或使用通配符：`allowedHosts: ['*.ngrok-free.dev']`

### 80 端口部署

如果必须使用 80 端口（需要 root 权限）：

```bash
# 方法 1: 使用 sudo
sudo npm run dev

# 方法 2: 使用 setcap 授权 node
sudo setcap 'cap_net_bind_service=+ep' /usr/bin/node
npm run dev
```

## 常用命令

```bash
# 查看 ngrok 隧道状态
curl http://127.0.0.1:4040/api/tunnels

# 获取当前隧道 URL
curl -s http://127.0.0.1:4040/api/tunnels | jq -r '.tunnels[0].public_url'

# 停止 ngrok
pkill ngrok

# 重新启动
ngrok http 5173
```
