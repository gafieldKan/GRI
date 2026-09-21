#!/usr/bin/env bash
# prod-run.sh —— 一键生产部署：构建前端静态产物 → 证书 → 起 prod overlay 栈。
#
# 前置：curl已装、docker compose v2；.env.prod 由 .env.example 复制并填真实密钥。
# 用法：bash scripts/prod-run.sh            # 构建+起栈
#       bash scripts/prod-run.sh config     # 只校验 overlay（config render）不启动
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.prod}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file "$ENV_FILE")

if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE —— 先： cp .env.example $ENV_FILE 并填入真实密钥" >&2
  exit 1
fi

if [[ "${1:-}" == "config" ]]; then
  "${COMPOSE[@]}" config >/dev/null
  echo "[prod] overlay 渲染校验通过"
  exit 0
fi

echo "[prod] 构建前端静态产物（dist/build/h5）..."
npm run build:all-h5

bash scripts/gen-ssl.sh

echo "[prod] 起 prod 栈（api/auth-center 真镜像 + nginx 静态前端 + TLS）..."
"${COMPOSE[@]}" up -d --build

# 健康等待：nginx 只依赖 api/auth-center 的 started，等业务就绪再报
echo "[prod] 等待 API 就绪..."
for i in $(seq 1 40); do
  if curl -skf https://localhost/health >/dev/null 2>&1; then
    echo "[prod] https://localhost/health OK"
    break
  fi
  sleep 3
  [[ "$i" == 40 ]] && echo "[prod] 超时未就绪 —— docker compose -f ... -f docker-compose.prod.yml logs -f api" >&2 && exit 1
done

echo "[prod] 完成。访问：https://localhost/ → /food/ · /tutor/ · /portal/"
echo "[prod] 收敛验证：curl -sk https://localhost/ 任一业务；curl :3004 :3008 :5434 :6379 应拒连"