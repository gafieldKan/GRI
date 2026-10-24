# F-1：JWT 带 kid + verifier JWKS 定期刷新 —— 修「间歇性全员 401」（登录态稳定性）

> 执行者：**Claude** ｜ 波次：稳定性修复（实测发现，先于 W1）｜ 依赖：无（纯修）
> 依据：2026-10-24 产品链路实测中复现三次「同一枚 token 隔离验签通过、运行中的 api 持续 401」——根因面：**token 无 `kid`**（`services/auth-center/src/auth/jwt-issuer.service.ts:63-67` `sign()` 未设 header）+ **verifier 无刷新机制**（`packages/jwt-verifier/src/index.js` 缓存只认 kid、无 TTL）。
> 定位：让「auth-center 重启/轮钥后，运行中的 api **不重启也能恢复验签**」，且任何缓存污染在有限时间内自愈。

## 📥 承重事实（架构师已核对，按此接线）

- **签发**：`jwt-issuer.service.ts:67` `return sign(payload, this.privateKey, options)`，options 无 `header` → token header 恒为 `{alg,typ}`，**无 kid**。
- **JWKS**：`jwt-issuer.service.ts:90-100` `getJwk()` 回 `{kty,use,alg, kid: this.issuer, ...jwk}`—— kid 恒为 issuer 串（`gri-auth-center`），**轮钥也不会变**。
- **verifier 缓存**（`packages/jwt-verifier/src/index.js`）：`cache={keyId,pem}`；`resolvePem(header)`：`cache.pem && (!targetKid || targetKid===cache.keyId)` → 直接复用；否则 fetch JWKS，按 `jwk.kid !== cache.keyId` 更新。**无 TTL、无定时刷新**；失败路径会清缓存重试一次（`:145-160`）。
- **Key 来源**：auth-center 未注入 `JWT_PRIVATE_KEY` 时启动生成临时 RSA，**持久化到容器 `/run/keys`（tmpfs）跨重启复用**（日志「复用持久密钥对 -> /run/keys」）——宿主机重启即换新钥。
- **今日症状（实测三次）**：token 隔离验签 ✅、运行中 api ❌ 持续 401；重启 api（新缓存）即恢复。**未能用现有日志定位污染时刻**——故本卡除修复外加**最小诊断日志**。

## 🎯 目标（三条）

### 目标 1：token 带 kid（auth-center）

- `sign()` options 增 `header: { kid: <KEY_ID> }`，`<KEY_ID>` 由**公钥指纹**派生（如 JWK `n` 的 sha256 前 16 hex）——**轮钥即换 kid**（JWKS 的 `kid` 同步改为同一指纹，`getJwk()` 与 header 必须同源，加 spec 断言二者相等）。
- 兼容：kid 仅头字段，payload/iss/exp 一律不变；`verifyAccess` 不传 kid 也照常验（向后兼容旧 token）。

### 目标 2：verifier JWKS 定期刷新 + 诊断（jwt-verifier）

- **TTL 刷新**：kid 命中缓存的快路径上，若「距上次 JWKS 拉取 > `jwksTtlMs`（默认 300000，可配 `AUTH_JWKS_TTL_MS`）」→ 后台/惰性重拉一次并按新 kid 更新缓存。语义：TTL 内不阻塞请求（先用缓存验，失败才走重拉重试，保持现有快路径性能）；**TTL 到期后的第一个请求允许一次同步刷新**（简单优先，勿引入定时器生命周期问题）。
- **失败重试保留**（现有行为不回归）：验签失败 → 清缓存 → 重拉 → 重试一次。
- **最小诊断日志**：重拉/失败路径上 `console.warn` 一行（含 kid、是否命中缓存、fetch 成败；**禁印 token/密钥/PEM**）。
- **无 kid 旧 token** 仍可验（取第一把钥的现有分支不变）。

### 目标 3：测试与回归

- `packages/jwt-verifier/tests/`：① 带 kid token：kid 不匹配 → 重拉后通过；② TTL 到期 → 重拉（可注入假时钟/小 TTL）；③ 无 kid token → 仍通过；④ 验签失败 → 清缓存重试一次成功；⑤ JWKS 拉取失败 → 明确抛错不静默。
- `services/auth-center`：⑥ 签发 token header 含 kid；⑦ header.kid === JWKS.kid；⑧ 轮换密钥后 kid 变化（若现状密钥持久化不易在测内轮换，则断言 kid 由公钥指纹派生这一**纯函数**性质即可）。
- 零回归：jwt-verifier 既有测试全绿；auth-center 既有测试全绿；services/api 654 + tsc 0（api 只是消费方，行为不变）。

## 🔴 硬约束

| # | 约束 |
|---|---|
| C1 | **只修两处**：`jwt-issuer.service.ts`（+kid）、`packages/jwt-verifier/src/index.js`（TTL+诊断）。不得顺手改别的 |
| C2 | payload/iss/exp/claims 一律不变（只是 header 多一个 kid） |
| C3 | 日志零敏感：不打 token/PEM/私钥 |
| C4 | 性能：kid 命中且未过 TTL → **不发 JWKS 请求**（保持缓存意义） |
| C5 | 不 commit / 不 checkout / **不 push**；末行 `FAIL=0`；临时探针用完即删 |
| C6 | `docs/` 若涉及验签说明（`AGENT_CREDENTIAL_SEAM.md`/契约文档）同步一句 kid/TTL 语义 |

## 📦 产出物

1. `services/auth-center/src/auth/jwt-issuer.service.ts`（+header kid、指纹派生、getJwk 同源）。
2. `packages/jwt-verifier/src/index.js`（TTL 刷新 + 诊断日志 + 既有失败重试保留）。
3. 两侧测试（上述 ①–⑧）。
4. `.agents/claude/outputs/f1-file-list.md` + `f1-verify.sh`。

## ✅ 验收标准

1. 新签发 token header **有 kid**，且与 `/auth/jwks` 当前 `kid` **相等**（curl 实证）。
2. verifier 单测 ①–⑤ 全过；TTL 默认 5 分钟可配。
3. **端到端场景验**（`f1-verify.sh` 内做）：起 verifier → 验 A token 通过 → **模拟轮钥**（测试内替换 JWKS 桩的返回）→ TTL 后/失败后**不重启 verifier** 仍能验新 token 通过。
4. 零回归：jwt-verifier / auth-center 既有测试 + api 654 + tsc 0。
5. 部署说明：auth-center 与 api 均为烘焙镜像 → 改动生效需 rebuild（写入 verify 脚本末尾提示，不自动重建）。

## 🧪 复验脚本要求

覆盖：kid 同源断言（spec）、JWKS curl 实证、verifier 五场景、TTL 配置读取、既有测试全量、api 零回归、末行 `FAIL=0`。

## ❓ 需确认

无。（kid 派生方式自定但须满足「轮钥即换」；TTL 默认值可调。「今日持续 401 的确切污染时刻」未能定位——以 TTL 自愈 + 诊断日志保证未来可定位，不在本卡追原始根因。）
