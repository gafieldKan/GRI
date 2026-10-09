# P2-T1 端到端验收脚本规格（E2E Verification Spec）

> 供 Codex 落成可执行 `.sh`（建议落点：`services/api/test/e2e/p2-task-1-identity.sh`，
> 或沿用 `.agents/claude/outputs/task-1-e2e-verification.sh` 的风格）。
> 本文件是**规格**：步骤 / 断言 / PASS 判据 / 环境变量，不含实现细节。

---

## 0. 环境与前置

| 变量 | 取值（docker compose） | 说明 |
|---|---|---|
| `API_BASE` | `http://localhost:3008/api` | 业务后端（宿主 3008 → 容器 3002） |
| `AUTH_BASE` | `http://localhost:3004/auth` | 签发中心直连 |
| `GATEWAY` *(可选)* | `http://localhost` | 经 nginx 的等价入口（回归用；`/api/*`→api，`/auth/*`→auth-center） |

**前置**：`docker compose up -d` 后 `postgres`/`postgres-auth`/`api`/`auth-center` 健康；迁移 017 已应用；backfill 已跑。

**工具**：`curl`、`jq`（必需，用于解析 JWT/JSON）。脚本开头 `command -v jq >/dev/null || { echo "need jq"; exit 2; }`。

**可重入**：每次运行用**唯一账号** `e2e_$(date +%s)_$RANDOM`，避免与历史数据冲突。

---

## 1. 断言步骤（严格按序）

> 记号：`[STEP]` 动作；`[ASSERT]` 断言；`[PASS]` 判据。

### A. 注册（公开端点，无 token）

```
[STEP] R1  POST $API_BASE/auth/register
           body = {"username":"<U>","email":"<U>@example.com","password":"OldPass!234","name":"E2E"}
[ASSERT A1] HTTP 状态 == 201
[ASSERT A2] 响应体 .role == "consumer" 且 .id 为非空 UUID 且不含 password_hash
[ASSERT A3] 公开可达性：本请求**未带** Authorization 头却**不是** 401（证明 register 入公开白名单）

[STEP] R2  POST $API_BASE/auth/register   同一 body（重复注册）
[ASSERT A4] HTTP 状态 == 409（幂等：不产生第二行）
```

### B. 登录（拿 token）

```
[STEP] L1  POST $AUTH_BASE/login  body={"identifier":"<U>@example.com","password":"OldPass!234"}
[ASSERT B1] HTTP == 200；.accessToken 非空 → 存 TOKEN
```

### C. 核心契约：external_id ≠ sub 且 ≡ public.users.id

```
[STEP] C1  PAYLOAD=$(echo $TOKEN | cut -d. -f2 | base64 -d 2>/dev/null)   # 需容错 base64url padding
[ASSERT C1] PAYLOAD.sub           非空且为 UUID
[ASSERT C2] PAYLOAD.external_id   非空且为 UUID
[ASSERT C3] PAYLOAD.external_id != PAYLOAD.sub          ★根治本 bug 的关键断言

[STEP] C4  GET $API_BASE/identity/me  -H "Authorization: Bearer $TOKEN"
[ASSERT C4] HTTP == 200
[ASSERT C5] 响应 .user.id == PAYLOAD.external_id         ★端到端证明 external_id ≡ public.users.id
             （无需直连 DB：能按 externalId 读到档案 = 映射成立）
[ASSERT C6] 响应 .user.username == "<U>"
```

> 备选（有库访问时）：`psql $gri -c "SELECT 1 FROM public.users WHERE id='$EXTERNAL_ID'"` 返回 1 行。
> 主判据用 C4/C5（不依赖 DB 凭据，更适 CI）。

### D. 改密

```
[STEP] D1  POST $API_BASE/auth/password  -H "Authorization: Bearer $TOKEN"
           body={"oldPassword":"OldPass!234","newPassword":"NewPass!567"}
[ASSERT D1] HTTP == 200

[STEP] D2  POST $AUTH_BASE/login  body={"identifier":"<U>@example.com","password":"NewPass!567"}
[ASSERT D2] HTTP == 200（新密可登录）

[STEP] D3  POST $AUTH_BASE/login  body={"identifier":"<U>@example.com","password":"OldPass!234"}
[ASSERT D3] HTTP == 401（旧密失败）
```

> 注：改密后旧 refresh_tokens 已吊销（设计 §4.1 step 6），旧 `TOKEN`（access）在 ≤900s 内仍可用于 /identity/me——本脚本不据此断言，D 段只验「密码语义」。

### E. 注销

```
[STEP] E1  DELETE $API_BASE/identity/me  -H "Authorization: Bearer $TOKEN"
[ASSERT E1] HTTP == 200

[STEP] E2  POST $AUTH_BASE/login  body={"identifier":"<U>@example.com","password":"NewPass!567"}
[ASSERT E2] HTTP == 401（凭证已停用 → 再登录失败）★注销生效的关键断言
```

### F. 公开路由鉴权边界（无 token 断言）

```
[STEP] F1  POST $API_BASE/auth/register    无 Authorization（空/缺字段 body）
[ASSERT F1] 状态 ∈ {201, 400} —— **绝不** 为 401（公开写端点）

[STEP] F2  POST $API_BASE/auth/password    无 Authorization
[ASSERT F2] HTTP == 401（受保护写端点）

[STEP] F3  DELETE $API_BASE/identity/me    无 Authorization
[ASSERT F3] HTTP == 401（受保护写端点）
```

---

## 2. PASS / FAIL 判据

- **PASS**：上述 **A1–A4、B1、C1–C6、D1–D3、E1–E2、F1–F3 全部**命中期望码/值。
- **FAIL**：任一断言不符 → 脚本以**非零退出码**结束，并打印：
  - 失败断言编号（如 `C3 FAIL: external_id == sub (sub=..., external_id=...)`）
  - 该步原始 HTTP 状态 + 响应体（截断至 500 字符）
- 脚本结尾打印 `E2E PASS (n/n)` 或 `E2E FAIL (X/n)` 汇总，退出码 `0`/`1`。

**关键失败语义提示**：
| 失败断言 | 指向的根因 |
|---|---|
| C3 失败（`external_id == sub`） | 注册**未**注入 externalId（本设计未落地 / backfill 未跑） |
| C5 失败（`/identity/me` 404/403） | `external_id ≡ public.users.id` 映射未建立 |
| A4 未 409 | 幂等门禁缺失（`public.users` UNIQUE 未加） |
| D3 非 401 | 改密未真正落哈希 |
| E2 非 401 | 注销未停用 auth-center 凭证（只软删了 profile） |
| F2/F3 非 401 | 保护端点误入公开白名单 |

---

## 3. 用例矩阵（对照设计契约表 §6）

| 用例 | 端点 | 鉴权 | 期望 |
|---|---|---|---|
| A1 | `POST /api/auth/register` | 公开 | 201 |
| A4 | `POST /api/auth/register`（重复） | 公开 | 409 |
| C4 | `GET /api/identity/me` | Bearer | 200 |
| D1 | `POST /api/auth/password` | Bearer | 200 |
| D3 | `POST /auth/login`（旧密） | 公开 | 401 |
| E1 | `DELETE /api/identity/me` | Bearer | 200 |
| E2 | `POST /auth/login`（注销后） | 公开 | 401 |
| F1 | `POST /api/auth/register`（无 token） | — | 201/400（非 401） |
| F2 | `POST /api/auth/password`（无 token） | — | 401 |
| F3 | `DELETE /api/identity/me`（无 token） | — | 401 |

---

## 4. 门禁（回归）用例（可选，CI 加固）

| 用例 | 动作 | 期望 |
|---|---|---|
| G1 | `GET /api/auth/jwks` 无 token | 200（公开） |
| G2 | `POST /api/auth/register` 带恶意 `externalId` 字段 | 该字段被 **忽略/拒绝**，服务端**不采信**客户端 externalId（fail-fast）；断言注册后 `external_id != 请求体 externalId` |
| G3 | backfill 幂等 | 连跑两次 backfill，第二次 0 行变更、无报错 |

---

## 5. 脚本骨架（伪 sh，供 Codex 参考，非最终）

```sh
#!/usr/bin/env bash
set -uo pipefail
API_BASE="${API_BASE:-http://localhost:3008/api}"
AUTH_BASE="${AUTH_BASE:-http://localhost:3004/auth}"
U="e2e_$(date +%s)_$RANDOM"; EMAIL="$U@example.com"; OLD="OldPass!234"; NEW="NewPass!567"
pass=0; fail=0
chk(){ # chk <id> <actual> <expected>
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  ok  $1 ($2)";
  else fail=$((fail+1)); echo "FAIL  $1: got=$2 want=$3"; fi
}
code(){ curl -s -o /tmp/e2e_body -w '%{http_code}' "$@"; }
b64d(){ local s="${1//-/+}"; s="${s//_//}"; echo "$s===" | cut -c1-$(( ${#s} + 2 )) | base64 -d 2>/dev/null; }

# A 注册
c=$(code -X POST "$API_BASE/auth/register" -H 'Content-Type: application/json' \
      -d "{\"username\":\"$U\",\"email\":\"$EMAIL\",\"password\":\"$OLD\",\"name\":\"E2E\"}")
chk A1 "$c" 201
chk A2 "$(jq -r .role /tmp/e2e_body)" consumer
c=$(code -X POST "$API_BASE/auth/register" -H 'Content-Type: application/json' \
      -d "{\"username\":\"$U\",\"email\":\"$EMAIL\",\"password\":\"$OLD\"}")
chk A4 "$c" 409

# B 登录
c=$(code -X POST "$AUTH_BASE/login" -H 'Content-Type: application/json' \
      -d "{\"identifier\":\"$EMAIL\",\"password\":\"$OLD\"}")
chk B1 "$c" 200; TOKEN=$(jq -r .accessToken /tmp/e2e_body)

# C 契约
PAY="$(b64d "$(echo "$TOKEN" | cut -d. -f2)")"
SUB=$(jq -r .sub <<<"$PAY"); EXT=$(jq -r .external_id <<<"$PAY")
[ "$EXT" != "$SUB" ] && [ -n "$EXT" ] && chk C3 ok ok || chk C3 "$EXT" "!=sub"
c=$(code "$API_BASE/identity/me" -H "Authorization: Bearer $TOKEN"); chk C4 "$c" 200
chk C5 "$(jq -r .user.id /tmp/e2e_body)" "$EXT"

# D 改密  E 注销  F 无 token 断言（略，按上表补全）
echo "-----"; echo "E2E $([ $fail -eq 0 ] && echo PASS || echo FAIL) ($pass passed, $fail failed)"
exit $([ $fail -eq 0 ] && echo 0 || echo 1)
```

> 注：`b64d` 需处理 base64url 的 `-`/`_` 与 padding；`jq` 解析 JWT payload。Codex 实现时可改用
> `python3 -c` 或 `jq -R 'split(".")[1] | @base64d | fromjson'` 更稳。
