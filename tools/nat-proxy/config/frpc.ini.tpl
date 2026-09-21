# frpc 客户端配置模板
# 复制为 frpc.ini 并根据需要修改

[common]
# frps 服务器配置
server_addr = your_server_ip
server_port = 7000

# 认证 Token (需要与 frps 一致)
token = your_secret_token_here

# TLS 加密
tls_enable = true

# 日志配置
log_file = frpc.log
log_level = info
log_max_days = 7

# ============ 隧道配置 ============

# Web 服务隧道示例
[web]
type = tcp
local_ip = 127.0.0.1
local_port = 80
remote_port = 8080

# API 服务隧道示例
[api]
type = tcp
local_ip = 127.0.0.1
local_port = 3000
remote_port = 8081

# 数据库隧道示例 (谨慎使用)
#[db]
#type = tcp
#local_ip = 127.0.0.1
#local_port = 3306
#remote_port = 9000

# HTTPS 站点示例
#[https-site]
#type = https
#local_ip = 127.0.0.1
#local_port = 443
#remote_port = 8443
