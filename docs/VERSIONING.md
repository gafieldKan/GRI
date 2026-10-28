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

> 当前状态（2026-10-28，更新）：**私有 registry 发布链路已跑通（`@gri` scope 不变）** —— 本地 Verdaccio
> （`http://localhost:4873`）实测：`npm publish` → `+ @gri/agent-core@0.1.0`；**干净环境** `npm i @gri/agent-core`
> （走该私服、dep 经 uplink npmjs）→ `import` **44 导出** 可用 —— **W4 gate 在私服上全过（发布全链 + 干净环境安装）**。
> 另：`npm pack` 产 21 文件（合 `files`）；git 已接 `origin=https://github.com/gafieldKan/GRI.git`（默认分支 `main`）。
> **落地到真实私服时**：把各包 `publishConfig.registry` 指向它（提交里当前仍是 `npmmirror` + `access:restricted` 占位），
> 并在私服开 `@gri` scope 的 publish 权限。**公网发不了 `@gri`**（npmjs 上该 scope 已被他人占用，见 §三 命名空间与 §五）。

---

## 五、不做

- 不做 changesets/自动发布流水线（本地目录 manifest-first；发布是显式人工动作）。
- 不把工作区根（`private:true`）入包。
- 不在 v1 面上原地改语义（只加不改）。
