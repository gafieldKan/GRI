# GRI API（唯一业务后端 services/api）— monorepo 根上下文两段构建
#
# 与 backend/ai-tutor 同根因：package.json 有 file: 工作区依赖（@gri/jwt-verifier、@gri/ontology、
# @gri/ontology-engine），独立上下文 npm ci 必失败 → 根上下文 + 根 lockfile 的 workspace link 解析。
# 但本服务是 Nest + TS，需先编译，故与纯 JS 后端不同：两段构建 —— build 段装 devDeps 跑 `nest build`，
# runtime 段只装生产依赖 + COPY 编译产物。nest-cli assets 会把 migrate/*.sql 拷进 dist/migrate，容器 CMD 起前先跑迁移。

# ── build 段：装全部依赖（含 dev → @nestjs/cli/tsc），编译 dist ──
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
# file: 工作区链接目标（jwt-verifier / ontology / ontology-engine）
COPY packages ./packages
# 本服务源码
COPY services/api ./services/api

# 装本工作区全部依赖（dev 含 @nestjs/cli 供 nest build；--ignore-scripts 跳过根 prepare 连库迁移）
RUN npm ci --workspace=gri-api --ignore-scripts --include=dev

# 编译 TypeScript → dist/（assets 拷 migrate/*.sql 进 dist/migrate）
WORKDIR /app/services/api
RUN npx nest build

# ── runtime 段：只装生产依赖，COPY 编译产物 ──
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages ./packages
# workspace 定位依赖：npm 靠 services/api/package.json 认 workspace=gri-api（须在 npm ci 前就位）
COPY services/api/package.json ./services/api/package.json
# 编译产物（dist/ 含 migrate/*.sql assets）
COPY --from=build /app/services/api/dist ./services/api/dist
# Explorer 几何 API 的只读数据源（GeoService 运行时按需读取并缓存切片）
COPY scripts/reference-data/data/un-regions.geo.json scripts/reference-data/data/un-regions-maps.geo.json ./scripts/reference-data/data/
# 运行时文件清单仅依赖 package.json + dist；其余源码不需要

# 只装本工作区生产依赖；--ignore-scripts 跳过根 prepare
RUN npm ci --omit=dev --workspace=gri-api --ignore-scripts

WORKDIR /app/services/api
ENV NODE_ENV=production
EXPOSE 3002
# 先跑单库迁移（幂等），再起服务 —— 容器自举，无需外部手动 migrate
CMD ["sh", "-c", "node dist/migrate/run-migrations.js && node dist/main.js"]
