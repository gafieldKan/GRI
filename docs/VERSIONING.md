# 版本与发布策略（W4 · semver）

> 适用范围：`@gri/*` 工作区包（`packages/*`）与对外契约面（`/api/v1/**`）。
> 目标：**一次 minor 发布全链通过**；任何不兼容变更**显式开新版**，不得静默原地改。

---

## 一、两类「版本」是两个正交轴（勿混）

| 轴 | 载体 | 语义 | 不变式 |
|---|---|---|---|
| **包版本** | `package.json` 的 `version`（各 `@gri/*`） | 该包**代码/导出面**的语义版本 | semver：破坏性 → major；新增能力 → minor；修 bug → patch |
| **契约版本** | 响应头 `X-Agent-Api-Version` + 信封 `v`（当前 `1`）；`plugin.json` 的 `apiVersion`（当前 `"1"`）；`EnginePort.apiVersion`（`'1'`） | **线上契约**的语义版本 | **不兼容变更开 `/api/v2/**`**（或 `apiVersion:"2"`），**不得原地改 v1** |

> 包版本升到 `1.2.0` **不代表**契约变 v2；契约 bump 也**不必**动包 major。二者各按自己的遗留承诺走。

## 二、包版本规则（`@gri/*`）

- 一律 **semver** `MAJOR.MINOR.PATCH`；预发布用 `-rc.N` / `-alpha.N`。
- 当前全部 `0.1.0`（**未发布**；`0.x` = 契约仍在演进，breaking 可走 minor）。
- **导出面即契约**：宿主/消费者可见的命名导出（`packages/<pkg>/index.d.ts` 的声明 + `src/index.js` 的具名 export）——删/改签名 = **major**；新增 = minor。
- `files` 白名单决定**入包内容**（`src` + `index.d.ts` + `README.md`）；改 `files` 视为对发布物的变更，随版本一并记。

## 三、契约版本规则（对外面）

- `/api/v1/agent/*` 的**形状真源**：`docs/AGENT_PUBLIC_CONTRACT.md`（散文）+ `docs/openapi/agent-v1.yaml`（机读镜像）。
  **改一须同改另一**（镜像漂移是本仓已被复验揪出过的真缺陷类）。
- 承诺：成功 `{v,success,data}` / 失败 `{v,success,error{code,message}}`；`X-Agent-Api-Version` 恒下发；**v1 语义冻结**。
- 例外：全局鉴权的 401 用 Nest 缺省体 `{code,message}`（非 v1 信封）——已在 spec 的 `AuthError` 显式标注。
- 新增字段：**向后兼容**（消费者须容忍未知字段）；删/改语义：**开 v2**。

## 四、发布步骤（**须显式授权** —— 对外动作）

0. **前置**：`grep -rn "example.invalid"` 清空 —— `packages/agent-core` **与** `packages/agent-sdk` 的 `package.json` 的 `repository`/`homepage` 目前**都是占位**，须各填真实仓址；根 `package.json` 为 `private:true`（工作区根不入包）。
1. 选定版本（按 §二/§三）；更新 `package.json` 的 `version` +（若契约变）`X-Agent-Api-Version`/`apiVersion` 与两份契约文件。
2. **门禁**：`npm -w <pkg> test` 绿 + `npm run test --workspace=gri-api` 绿 + `tsc --noEmit` 0 + build 0。
3. **独立复验**（作者不自验，见 `.agents` 纪律）。
4. `npm publish -w <pkg>`（`publishConfig.registry` 指向 `https://registry.npmmirror.com`；`access` 按包可见性定）。
5. **全链验证**：干净环境 `npm i <pkg>@<version>` 可用（W4 出口判据）。

> 当前状态（2026-10-28）：**安装面已验证** —— `npm pack`（`packages/agent-core`）产 **21 文件**（合 `files` 白名单）；
> `npm i <tgz>` 于**干净目录**（dep 走 npmmirror）成功，`import('@gri/agent-core')` → **44 导出**（含 `AgentCore`/`ModelRouter`）
> —— W4 gate「干净环境 `npm i` 可用」**✅（agent-core）**。**`npm publish --dry-run` 载荷通过**（21 文件 / 48.6 kB）。
> **发布仍阻塞（两点，须补齐）**：① 本机**无 `registry.npmmirror.com` 登录/token**（dry-run 报 `requires you to be logged in`）；
> ② **无 git remote** → `repository`/`homepage` 仍是 `example.invalid` **占位**，须填真实仓址。二者齐备即可 `npm publish`。

---

## 五、不做

- 不做 changesets/自动发布流水线（本地目录 manifest-first；发布是显式人工动作）。
- 不把工作区根（`private:true`）入包。
- 不在 v1 面上原地改语义（只加不改）。
