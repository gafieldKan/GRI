# GRI 项目瘦身 × 插件化改造方案（实测版）

> 状态：**v1 方案（2026-10-21）** ｜ 作者：总负责人（助手）
> 依据：**本机实测数据**（非估算）｜ 配套原则：`docs/PLUGIN_ARCHITECTURE.md`
> 纪律：**先度量 → 先隔离 → 先归档；不做不可逆删除**；每阶段有**回滚点**与**门禁**。

---

## 0. 实测体检（2026-10-21，本机）

### 0.1 工作区体积（803M）

| 项 | 体积 | 是否入库 | 判定 |
|---|---|---|---|
| `node_modules`（162 个） | **584M** | ❌ 未入库 | **可再生**，不入库（现状正确） |
| `scripts/reference-data/data` | **70M** | ✅ 入库（最大文件 `un-regions-maps.geo.json` **53M**；`un-regions.geo.json` 13M；`un-regions.json` 1.9M） | **运行时依赖**（见 §0.3）→ 不删，另策 |
| `apps/explorer` | 22M（data 14M + region.html 7.4M） | ✅ 入库 | **生产在用**（nginx 挂载）→ **不删** |
| `services/api` + `auth-center` | 65M | 含 dist/node_modules（未入库） | 源不入库，产物可再生 |
| `.agents` | 8M（`coordination/logs` **5.9M**） | ✅ 入库 | **构建日志**，可归档/清理 |
| `docs` | 652K / **64 文件** | ✅ 入库 | **散落**（含 archive/、多版计划） |
| `packages/*`（核心） | **660K** | ✅ 入库 | **核心很小——插件化成本低** ✅ |
| `.git` | 25M | — | 历史含多次 `package-lock` 与 12.7MB geo blob |

### 0.2 运行环境（Docker）——**冗余最大头**

| 项 | 实测 | 可回收 |
|---|---|---|
| 镜像 | **117 个 / 25GB** | **15.44GB（61%）** |
| **悬空镜像** | **106 个** | 全部 |
| 构建缓存 | **28.71GB** | **19.02GB** |
| 冗余镜像 | `gri-api:ci`（10 天前）、`gri-auth-center:ci`（10 天前）、`node:20-alpine` **与** `node:20.20.2-alpine`（两者并存） | 及时回收 |
| 运行中 | gri 栈 9 容器（api/auth/postgres×2/redis/nginx/web/portal/tutor）+ `anythingllm` + `ollama`（6.17GB，**非本项目**） | 保留 |

### 0.3 关键澄清（避免误删）

1. **70M geo 数据不是死数据**：`services/api/src/modules/taxonomy/geo.service.ts` 用 `__dirname/../../../../..` **运行时读取** `scripts/reference-data/data/un-regions.geo.json` + `un-regions-maps.geo.json`。→ **不得删**；若要瘦，只能「换存储」（见 P-1）。
2. **`apps/explorer` 不是废弃应用**：`docker-compose.prod.yml` 把 `./apps/explorer` 挂到 `/usr/share/nginx/html/explore` → **生产站点**。
3. **产物未入库**（`git ls-files` 中 `dist/node_modules` = **0**）→ 瘦身**不靠** `git rm` 产物。

### 0.4 真冗余清单（实测确认）

| 类别 | 对象 | 证据 |
|---|---|---|
| 死文件 | `ops/smartlens-20260918.dump` + `.err` | 一次性 dump（2026-09-18） |
| 死文件 | `.p2t4/`（p2 task-4 产出） | 一次性任务残留 |
| 死文件 | `tools/nat-proxy/`（19 文件，5 月遗留） | 与现栈无关 |
| 日志 | `.agents/coordination/logs/*` 5.9M | 构建日志（含 4.5M 单文件） |
| 文档 | `docs/archive/`、多版计划并存（P2/FEATURE_COMPLETION/REWRITE×3…） | 64 文件散落 |
| 环境 | 106 悬空镜像 + 19GB 构建缓存 + `.ci` 旧镜像 + 双 node 镜像 | docker 实测 |

---

## 1. 瘦身改造方案（四阶段，逐阶段可回滚）

> 每阶段结束**必须**：`build:h5` 通过 + 真实浏览器 `pageerror=0` + `deploy-freshness.sh` 复跑；**先 tag，后动手**。

### 阶段 S-0 · 安全网（不可跳过）

- `git tag pre-slim-2026-10-21`（回滚锚点）；`git status` 必须 CLEAN。
- 备份**未入库**关键物：`.env`（凭据）→ 单独保管（**不进仓库**）。
- 建立**度量基线**：`scripts/size-report.sh`（新增，纯只读）记录 工作区体积 / docker `system df` / 悬空计数 / docs 文件数 / `.git` 体积。
- **门禁**：基线与本文 §0 一致。

### 阶段 S-1 · 零风险清理（不动源码语义）

| 动作 | 对象 | 手段 |
|---|---|---|
| 删死文件 | `ops/smartlens-*.dump|.err`、`.p2t4/`、`tools/nat-proxy/` | `git rm`（有历史可回溯） |
| 归档日志 | `.agents/coordination/logs/*` 5.9M | 移入 `docs/archive/logs-2026-10.tar.gz` 或 `.gitignore` 排除 |
| Docker 回收 | 悬空镜像 106 + 构建缓存 19GB + `.ci` 旧镜像 | `docker image prune -f` + `docker builder prune -f` + 删两张 `.ci` / 一张重复 node |
| 归档文档 | `docs/archive/` 保持；根目录一次性 md（`.claude-p0-todos.md`）移档 | `git mv` |
| **门禁** | 前端仍可 build、站点仍可访问 | ✅ |

**预期回收**：Docker **≥19GB**；仓库工作区 **≥6M**。

### 阶段 S-2 · 结构瘦身（有语义边界，需评审）

| 动作 | 说明 | 风险门禁 |
|---|---|---|
| **geo 数据换存储** | 70M geo/12.7MB blob：**不删**，改为「构建期取数 → 存入 DB 或按需对象存储」，源码只留 loader | 与 `geo.service` 同批复验；先做**只读对拍**（新旧输出一致） |
| **apps/explorer 数据减重** | 14M data + 7.4M region.html：确认哪些字段**真被页面用**，程序化裁剪（保留可复现脚本） | 站点视觉对拍（复用 `migrating-reference-web-apps` 思路） |
| **docs 归并** | 64 文件 → 活文档 + `archive/`；重复计划合并（REWRITE×3、P2 系列） | 只归档不删 |
| **package-lock 历史** | 历史多次入库导致 `.git` 25M（**不 rewrite 历史**，仅后续规范） | 不动历史 |
| **门禁** | 对拍通过 + `pageerror=0` | ✅ |

### 阶段 S-3 · 防复发（规则化）

- `.gitignore` 增：日志/临时 dump/一次性任务目录/构建缓存。
- `scripts/size-report.sh` 纳入**定期体检**（heartbeat / 计划任务）。
- 新增 **PR 门禁**：仓库体积增量阈值 + 「不得新增一次性脚本到 `scripts/` 根」（进 `scripts/<domain>/`）。
- `docs/PROJECT_SLIMMING_PLAN.md` 与 `PLUGIN_ARCHITECTURE.md` 纳入 `GRI_LIFECYCLE_MANAGEMENT.md` 索引。

---

## 2. 插件化改造方案（显性化既有隐性插件）

> 详细原则见 `docs/PLUGIN_ARCHITECTURE.md`。**核心事实：`packages/*` 仅 660K，且 `world-art`/`auth-client`/`agent-core.skill` 已是事实插件**——本改造是**补清单 + 接注册表**，不是重写。

| 阶段 | 动作 | 产出 | 门禁 |
|---|---|---|---|
| **P-0** | 建 `packages/plugin-host`：契约（抽象类）+ registry（能力索引）+ 装配器 | 骨架代码（零具体实现） | 核心零插件依赖（P1） |
| **P-1** | `world-art` → `world.scene` 插件（补 `plugin.json`，接 registry；**画法零改动**） | 世界渲染走装配 | 三维度渲染对拍 |
| **P-2** | `k12-curriculum/import.mjs` / `reference-data/import.mjs` → `knowledge.content` / `knowledge.taxonomy` provider | 新增学科/分类 = 加插件目录 | 幂等对拍（`code` 锚点） |
| **P-3** | `agent-core/skill + tool-registry` → `agent.skill` 插件面（`toolSpec()`） | AI 定制 = 加插件 | agent 工具注册不退化 |
| **P-4** | `auth-client` 归一为 `auth.identity` 插件（三前端统一装配） | 消灭内联 auth 样板 | 三前端登录 E2E |

---

## 3. 建议执行顺序（与现有开发节奏不冲突）

**S-0 → S-1（立即可做，零风险，回收 ≥19GB）→ P-0（契约骨架）→ S-2 / P-1 并行 → P-2 → P-3 → P-4 → S-3。**

> 先瘦身（立竿见影、零风险），再插件化（结构性、分波次）。**插件化的每一步都要求「宿主不退化」**，与现有「作者不自验 / 助手独立复验」「串行铁律」纪律一致。

---

## 4. 风险与红线

| 风险 | 处置 |
|---|---|
| 误删运行时依赖（geo 数据 / explorer） | §0.3 已澄清，**列白名单**，S-2 才动且需对拍 |
| 清理破坏构建 | 每阶段 build + pageerror + deploy-freshness 门禁 |
| 插件化改动宿主行为 | P1（核心零插件依赖）+ 卸载不退化（P5） |
| git 历史膨胀（25M） | **不 rewrite 历史**；只规范后续 |
| 凭据 | `.env` **不进仓库**；清理时**不得**打印凭据 |

---

## 5. 待用户裁决

1. **执行顺序**：先 S-1（立即回收 19GB）还是先出 P-0 契约？（建议：先 S-1）
2. **geo 70M** 是否同意「换存储（loader 化）」纳入 S-2？（涉及 `geo.service` 改动，需独立复验）
3. **docs 64 文件**归并尺度：只归档，还是允许合并重复计划？
