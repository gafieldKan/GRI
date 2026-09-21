#!/usr/bin/env bash
# gen-ssl.sh —— 生成/复用自签 TLS 证书（生产 overlay 的 ./ssl 挂载点）。
#
# 仅用于开发/内网自签。生产换正式证书：`certbot --nginx -d <域名>`（Let's Encrypt）
# 或放置机构签发的 server.crt/server.key 到同一 ./ssl/ —— nginx 挂载点不变，热生效。
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p ssl
if [[ -f ssl/server.crt && -f ssl/server.key ]]; then
  echo "[gen-ssl] 复用既有证书 => ssl/server.crt|server.key"
  exit 0
fi

openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout ssl/server.key -out ssl/server.crt \
  -subj "/CN=GRI-dev" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:0.0.0.0" >/dev/null 2>&1

chmod 644 ssl/server.crt
chmod 600 ssl/server.key
echo "[gen-ssl] 已生成自签证书 => ssl/server.crt|server.key"