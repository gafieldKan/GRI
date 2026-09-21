# 部署指南

本指南将帮助你从零开始部署内网穿透服务。

## 目录

1. [准备 Oracle 免费云服务器](#准备-oracle 免费云服务器)
2. [部署 frps 服务端](#部署-frps 服务端)
3. [配置本地客户端](#配置本地客户端)
4. [验证连接](#验证连接)

---

## 准备 Oracle 免费云服务器

### 步骤 1: 注册账号

1. 访问 [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/)
2. 点击 "Start for free"
3. 填写注册信息
4. 需要 Visa/MasterCard 信用卡验证（不会扣款）

### 步骤 2: 创建实例

1. 登录 Oracle Cloud 控制台
2. 进入 "Compute" -> "Instances"
3. 点击 "Create instance"
4. 选择配置:
   - Image: Ubuntu 22.04
   - Shape: VM.Standard.A1.Flex (ARM, 4 核 24G)
   - SSH 密钥：创建或上传密钥对
5. 等待实例创建完成

### 步骤 3: 配置网络安全

1. 进入 "Networking" -> "Virtual Cloud Networks"
2. 找到你的 VCN，点击 "Security Lists"
3. 添加入站规则:
   ```
   端口 7000 - frp 客户端连接
   端口 7500 - frps 管理面板
   端口 8080 - 隧道服务 HTTP
   端口 8443 - 隧道服务 HTTPS
   ```

---

## 部署 frps 服务端

### 方法 1: 使用一键脚本（推荐）

```bash
# SSH 登录到 Oracle 云服务器
ssh -i ~/.ssh/your_key ubuntu@your_server_ip

# 下载部署脚本
wget https://raw.githubusercontent.com/your-repo/nat-proxy/main/scripts/deploy-frps.sh

# 执行部署
chmod +x deploy-frps.sh
sudo ./deploy-frps.sh
```

### 方法 2: 手动部署

```bash
# 1. 下载 frp
wget https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_linux_arm64.tar.gz
tar -xzf frp_0.61.1_linux_arm64.tar.gz
cd frp_0.61.1_linux_arm64

# 2. 移动到系统目录
sudo mkdir -p /opt/frp
sudo mv frps /opt/frp/
sudo mv frps.ini /opt/frp/

# 3. 配置 frps
sudo nano /opt/frp/frps.ini

# 4. 创建 systemd 服务
sudo nano /etc/systemd/system/frps.service

# 5. 启动服务
sudo systemctl daemon-reload
sudo systemctl enable frps
sudo systemctl start frps
```

---

## 配置本地客户端

### 方法 1: 使用一键脚本（推荐）

```bash
# 下载安装脚本
wget https://raw.githubusercontent.com/your-repo/nat-proxy/main/scripts/install-frpc.sh

# 执行安装
chmod +x install-frpc.sh
./install-frpc.sh
```

### 方法 2: 手动配置

```bash
# 1. 下载 frp
# Linux/macOS
wget https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_linux_amd64.tar.gz
# Windows
# 下载 https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_windows_amd64.zip

# 2. 解压
tar -xzf frp_0.61.1_linux_amd64.tar.gz

# 3. 配置 frpc
cp frpc.ini.template frpc.ini
nano frpc.ini

# 修改以下内容：
# server_addr = 你的 Oracle 云服务器公网 IP
# server_port = 7000
# token = 你的 Token
```

---

## 验证连接

### 检查 frps 状态

```bash
# 在 Oracle 云服务器上
systemctl status frps

# 应该看到 active (running)
```

### 检查 frpc 状态

```bash
# 在本地电脑上
./frpc -c ./frpc.ini

# 应该看到类似输出：
# 2024/01/01 12:00:00 [I] [service.go:192] login to server success
# 2024/01/01 12:00:00 [I] [proxy.go:100] [web] start proxy success
```

### 测试访问

```bash
# 在本地启动 Web 服务（如果有）
python3 -m http.server 80

# 从外部访问
curl http://your_oracle_ip:8080
```

---

## 故障排查

### frpc 无法连接 frps

1. 检查网络连接
   ```bash
   ping your_oracle_ip
   telnet your_oracle_ip 7000
   ```

2. 检查防火墙
   ```bash
   # Oracle 云服务器
   sudo ufw status
   sudo ufw allow 7000/tcp
   ```

3. 检查 Token 是否一致

### 隧道建立但无法访问

1. 检查本地服务是否运行
2. 检查远程端口是否被占用
3. 查看 frps/frpc 日志

---

## 开机自启

### Linux (systemctl)

```bash
# frpc 服务已配置为开机自启
systemctl --user enable frpc
systemctl --user start frpc
```

### macOS (launchd)

```xml
<!-- ~/Library/LaunchAgents/com.frp.frpc.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.frp.frpc</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/frpc</string>
        <string>-c</string>
        <string>/usr/local/etc/frpc.ini</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

### Windows

使用 [NSSM](https://nssm.cc/) 或 WinFsp 将 frpc 配置为 Windows 服务。
