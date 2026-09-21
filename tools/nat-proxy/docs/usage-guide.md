# 使用指南

## 快速开始（5 分钟上手）

### 1. 准备服务器（1 分钟）

如果你已经有 Oracle 云服务器，跳过此步。

如果没有，参考 [Oracle Cloud 申请指南](./oracle-cloud-setup.md) 免费申请。

### 2. 部署 frps 服务端（1 分钟）

SSH 登录到你的 Oracle 云服务器，然后执行：

```bash
# 一键部署脚本
curl -o deploy-frps.sh https://raw.githubusercontent.com/your-repo/nat-proxy/main/scripts/deploy-frps.sh
chmod +x deploy-frps.sh
sudo ./deploy-frps.sh
```

部署完成后，记录输出的 Token 和服务器 IP。

### 3. 配置本地客户端（1 分钟）

在你的本地电脑上执行：

```bash
# 一键安装脚本
curl -o install-frpc.sh https://raw.githubusercontent.com/your-repo/nat-proxy/main/scripts/install-frpc.sh
chmod +x install-frpc.sh
./install-frpc.sh
```

按提示输入:
- 服务器 IP
- Token（从步骤 2 获取）
- 本地服务端口

### 4. 启动隧道（1 分钟）

```bash
# 启动 frpc 客户端
~/.frp/start.sh
```

### 5. 验证访问（1 分钟）

```bash
# 在本地启动一个测试服务
python3 -m http.server 80

# 从外部访问
curl http://你的服务器 IP:8080
```

---

## 典型使用场景

### 场景 1: 发布本地网站

```ini
# frpc.ini
[web]
type = tcp
local_ip = 127.0.0.1
local_port = 80
remote_port = 8080
```

访问方式：`http://服务器 IP:8080`

### 场景 2: 小程序/API 调试

```ini
# frpc.ini
[api]
type = tcp
local_ip = 127.0.0.1
local_port = 3000
remote_port = 8081
```

小程序请求地址：`http://服务器 IP:8081`

### 场景 3: HTTPS 站点

```ini
# frpc.ini
[https]
type = https
local_ip = 127.0.0.1
local_port = 443
remote_port = 8443
```

访问方式：`https://服务器 IP:8443`

### 场景 4: 多隧道并行

```ini
# frpc.ini
[web]
type = tcp
local_ip = 127.0.0.1
local_port = 80
remote_port = 8080

[api]
type = tcp
local_ip = 127.0.0.1
local_port = 3000
remote_port = 8081

[app]
type = tcp
local_ip = 127.0.0.1
local_port = 8082
remote_port = 8082
```

---

## 配置说明

### frpc.ini 配置项

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| server_addr | frps 服务器 IP | 必填 |
| server_port | frps 端口 | 7000 |
| token | 认证 Token | 必填 |
| tls_enable | 启用 TLS 加密 | true |
| type | 隧道类型 | tcp |
| local_ip | 本地服务地址 | 127.0.0.1 |
| local_port | 本地服务端口 | 必填 |
| remote_port | 远程暴露端口 | 必填 |

### 高级配置

```ini
[common]
# 连接超时
login_fail_exit = false
connect_timeout = 10

# 心跳配置
heartbeat_interval = 30
heartbeat_timeout = 90

# 代理池
pool_count = 5
```

---

## 故障排查

### 问题 1: frpc 启动失败

```bash
# 查看详细日志
frpc -c frpc.ini -v

# 检查网络连通性
ping 服务器 IP
telnet 服务器 IP 7000
```

### 问题 2: 隧道建立但无法访问

1. 确认本地服务正常运行
2. 检查 Oracle 云防火墙规则
3. 检查 frps 日志：`sudo journalctl -u frps`

### 问题 3: 连接频繁断开

1. 检查网络连接稳定性
2. 增加心跳间隔配置
3. 检查服务器资源使用情况

---

## 安全建议

1. **使用强 Token**: 使用随机生成的长字符串
2. **启用 TLS**: 加密传输数据
3. **限制端口**: 只开放必要的端口
4. **定期更新**: 保持 frp 版本最新
5. **监控日志**: 及时发现异常访问
