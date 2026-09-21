# GRI Auth Center（NestJS）构建镜像
# 多阶段：build 阶段编译 TS → runtime 阶段只跑 dist

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# 持久 JWT 密钥引导：ensure-keys.mjs（首启生成/复用）+ entrypoint（注入 file 路径）
COPY docker/entrypoint.sh ./entrypoint.sh
COPY scripts/ ./scripts/
RUN chmod +x /app/entrypoint.sh
EXPOSE 3004
# entrypoint 先确保持久密钥，再起服务（token 跨重启有效）
CMD ["sh", "/app/entrypoint.sh", "node", "dist/main.js"]