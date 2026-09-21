# frps 服务端配置模板
# 复制为 frps.ini 并根据需要修改

[common]
# 绑定地址和端口
bind_port = 7000
bind_addr = 0.0.0.0

# 认证 Token (请修改为随机生成的安全 Token)
token = your_secret_token_here

# Dashboard 配置
dashboard_port = 7500
dashboard_user = admin
dashboard_pwd = your_admin_password

# TLS 加密
tls_enable = true
tls_cert_file = server.crt
tls_key_file = server.key

# 日志配置
log_file = /var/log/frps.log
log_level = info
log_max_days = 7

# 可选：端口限制
# max_ports_per_client = 10
# allow_ports = 8000-9000,10000,11000-12000

# 可选：子域名支持 (需要配置域名)
# subdomain_host = example.com
