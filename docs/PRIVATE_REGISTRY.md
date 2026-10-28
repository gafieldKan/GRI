# 私有 Registry（@gri/* 分发）

> 自托管 **Verdaccio** 私服，承载 `@gri/*` 包。**为什么不是公网**：`gri` 这个 scope 在 npmjs 上**已被他人占用**（`https://www.npmjs.com/org/gri`），故 `@gri/*` 只能发私服。Verdaccio 让**任何** scope 归你掌控（含 `@gri`）。

---

## 一、当前状态（本机）

| 项 | 值 |
|---|---|
| 地址 | `http://localhost:4873` |
| 配置 | `~/.verdaccio/config.yaml` |
| 存储 | `~/.verdaccio/storage`（持久） |
| 鉴权 | `htpasswd`（`~/.verdaccio/htpasswd`，`max_users:1`）；`access/publish: $authenticated`（**无匿名**） |
| npm 凭据 | `~/.verdaccio/npmrc`（含 `_authToken=`；**仅本机，勿入库**） |
| 已发 | `@gri/agent-core` · `@gri/agent-sdk` · `@gri/plugin-host`（均 `0.1.0`） |

**凭据**：用户名 `gri`（口令由管理员设，见 `~/.verdaccio/htpasswd`）；token 在 `~/.verdaccio/npmrc`。**本文件不含任何口令/token**（仓库公开）。

## 二、运维（启 / 停 / 换）

```bash
# 启（后台）
nohup npx --yes verdaccio@6 --config ~/.verdaccio/config.yaml > /tmp/verdaccio.log 2>&1 &
# 停（**别用 `pkill -f verdaccio`** —— 会连当前 shell 一起杀）
fuser -k 4873/tcp
# 健康检查（匿名应 401）
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4873/@gri%2Fagent-core
```
> 要让**团队**用：把 `localhost` 换成对内可达的主机/IP，并（建议）做成 systemd 常驻 + 改口令 + 只放行 `@gri` scope。或**直接换公司 Nexus**（见 §五）。

## 三、消费（从私服装 `@gri/*`）

在**使用方**项目根放一份 `.npmrc`（或用 `--userconfig`）：

```ini
# .npmrc（使用方）
@gri:registry=http://<私服主机>:4873
//<私服主机>:4873/:_authToken=<你的 token>   # 无 token 会 401（私服无匿名）
```
然后：

```bash
npm i @gri/agent-core @gri/agent-sdk @gri/plugin-host
```

**验收口径（机器可复现）**：干净目录里 `npm i` 上述三包 → `node -e "import('@gri/agent-core').then(m=>console.log(Object.keys(m).length))"` → **44**（`agent-sdk` 4 / `plugin-host` 9）。

## 四、发布新版本（维护者）

```bash
# 1) 目标 registry 由各包 publishConfig.registry 决定（现值 http://localhost:4873）
#    ⚠️ publishConfig.registry **盖过** `npm publish --registry=` —— 改目标要改 publishConfig
# 2) 定版（见 docs/VERSIONING.md）：改对应 package.json 的 version
# 3) 门禁 + 独立复验（承 .agents 纪律）
npm run test --workspace=gri-api && (cd services/api && npx tsc --noEmit)
# 4) 发
cd packages/<pkg> && npm publish --userconfig=~/.verdaccio/npmrc
# 5) 复验：干净目录 npm i @gri/<pkg>@<新版本>（承 §三 验收口径）
```

## 五、换成公司 Nexus / 真私服

1. 在 Nexus 建 npm hosted 仓库（放开 `@gri` 或 `*` 的 publish 权限）+ 拿 token。
2. 把各可发包 `publishConfig.registry` 指向它（当前为 `http://localhost:4873` 占位）：
   `agent-core` / `agent-sdk` / `plugin-host`（其余包按需补 `publishConfig` + `repository`/`homepage`/`bugs`）。
3. 用同一套 §四 流程发布 + 验收。

> **公网仍不可发** `@gri/*`（scope 被占）。若要公网开源，须**改 scope**（全仓改包名，见 `docs/VERSIONING.md` §一 命名空间说明）。
