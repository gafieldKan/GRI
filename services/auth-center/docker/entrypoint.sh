#!/bin/sh
# entrypoint.sh —— auth-center 容器入口：先确保持久 JWT 密钥，再起服务。
#
# 规则：
#   - 若环境已注入 JWT_PRIVATE_KEY（生产 k8s secret / compose 注入多行 PEM）→ 直接用注入密钥，
#     config.ts 的 readKey 优先 env 值，本脚本不做任何覆盖。
#   - 否则把密钥固化到持久卷 AUTH_KEYS_DIR（默认 /run/keys，compose 挂 named volume `jwtkeys`）：
#     首次生成、之后复用，保证容器/进程重启后已签发 token 仍有效（修临时密钥缺陷）。
set -e

if [ -z "$JWT_PRIVATE_KEY" ]; then
  node /app/scripts/ensure-keys.mjs
  export JWT_PRIVATE_KEY_FILE=/run/keys/jwt-private.pem
  export JWT_PUBLIC_KEY_FILE=/run/keys/jwt-public.pem
fi

exec "$@"