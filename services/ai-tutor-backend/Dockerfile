# GRI AI Tutor Backend（智学慧眼）— monorepo 根上下文构建
#
# 此前一直无法构建（缺口 2）的根因：独立 Dockerfile 在单服务上下文（仅 services/ai-tutor-backend）
# 里跑 `npm ci`，而 package.json 声明了工作区依赖 `@gri/jwt-verifier: file:../../packages/jwt-verifier`：
#   - ① 独立 package-lock.json 过期，缺失该依赖 → npm ci 报 "Missing: @gri/jwt-verifier from lock file"；
#   - ② 即便锁里有，该 file: 路径在构建上下文之外，npm 无法解析。
# 解法：以 monorepo 根（compose 的 build.context: .）为上下文，用根 package-lock.json 的 workspace
# link（node_modules/@gri/jwt-verifier → packages/jwt-verifier，link:true）解析文件依赖；
# 并用 --workspace 精确安装本服务的生产依赖，保持镜像小而明确（一次性拷根 manifest + 锁 + 链接目标）。

FROM node:20-alpine

WORKDIR /app

# 根 manifest + 锁文件（依赖唯一真源，保证可复现 & workspace link 可解析）
COPY package.json package-lock.json ./
# file: 链接目标 —— 只拷本服务实际依赖的包，其余工作区源码不拷入，镜像保持干净
COPY packages/jwt-verifier ./packages/jwt-verifier
# 本服务源码（运行时直接跑，无编译步骤）
COPY services/ai-tutor-backend ./services/ai-tutor-backend

# 只装本工作区生产依赖。
#   --ignore-scripts：跳过根 package.json 的 prepare（会连库跑迁移）——容器构建期既无 DB、
#                     也不应在构建期执行迁移；本依赖树全为纯 JS，无 postinstall 等脚本被牺牲。
RUN npm ci --omit=dev --workspace=smart-lens-ai-backend --ignore-scripts

WORKDIR /app/services/ai-tutor-backend
EXPOSE 3003
CMD ["node", "src/index.js"]