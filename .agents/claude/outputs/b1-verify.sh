#!/usr/bin/env bash
# ============================================================================
# B-1 验收：底座凭据缝 —— 每用户独立大模型 / API Key（加密存储 + 隔离）
# 依据：docs/AGENT_CREDENTIAL_SEAM.md（C1–C8）+ .agents/claude/tasks/b1-credential-seam.md
#
# 结构：
#   §0 迁移幂等        —— 032 跑两次不报错；表结构（BYTEA 三列 + FK）
#   §1 底座单测        —— packages/agent-core（node --test；新增凭据套件）
#   §2 api 回归        —— tsc --noEmit + jest（agent 模块 + 全量）
#   §3 底座零 env 依赖 —— C3/C4：credential-store.js 里 process.env 命中 = 0
#   §4 离线密文往返     —— 假库直驱 CredentialStore：往返一致 / hint 后 4 位 / 篡改 fail-fast
#   §5 活体端到端       —— 源码直起 3009（AGENT_CRED_MASTER_KEY 注入）：
#                          5.1 operator PUT api_key → 成功 + 只回掩码（响应零明文）
#                          5.2 GET → has_key + hint 后 4 位，响应零明文
#                          5.3 非运营 PUT 他人 entity key → 403（C7 多租户隔离）
#                          5.4 落库 = 密文（ciphertext/iv/auth_tag 非空）+ 明文 grep 命中 0（C1）
#                          5.5 合并：ModelRouter.resolve('entity=<uuid>') 解密回原值（往返一致）
#                          5.6 篡改 auth_tag → resolve 抛错，不静默回退 env（C8）
#                          5.7 不回归：不带 api_key 的 PUT/GET 行为对拍旧版（C9）
#                          5.8 未配置主密钥实例 → 带 api_key 被拒（凭据面关闭，零回归）
#                          5.9 主密钥长度非法 → 启动 fail-fast（C3）
#                          5.10 清场：删测试 route_key（级联删凭据）
#   §6 凭据零泄漏      —— 源码/产出物 grep 无真实密钥字面量；API 日志零明文
# 末行打印「PASS=<n> FAIL=<m> VERIFY_EXIT=0」。
#
# 依赖：services/api 已 build（dist 含 032）、packages/agent-core 已装；§5 另需
#       postgres(5432)/auth-center(3004) 在跑。种子 operator 账号：testuser/test1234（根组织 owner）。
# 用法： bash .agents/claude/outputs/b1-verify.sh
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_DIR="$ROOT_DIR/services/api"
CORE_DIR="$ROOT_DIR/packages/agent-core"
P2P_BASE="${P2P_BASE:-http://localhost:3009/api}"
AUTH_BASE="${AUTH_BASE:-http://localhost:3004/auth}"
OP_IDENTIFIER="${TEST_IDENTIFIER:-testuser}"
OP_PASSWORD="${TEST_PASSWORD:-test1234}"
DB_NAME="${DB_NAME:-gri}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
export DB_NAME DB_USER DB_PASSWORD DB_HOST DB_PORT
TS="$(date +%s)"
HELPER="$ROOT_DIR/.b1-verify.tmp.mjs"
API_LOG="$(mktemp /tmp/b1-api.XXXXXX.log)"
BAD_LOG="$(mktemp /tmp/b1-badkey.XXXXXX.log)"
API_PID=""
TEST_ROUTE_KEY=""
TEST_PLAINTEXT='nvapi-TESTKEY1234'

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }
ok() { if [ "$1" = "0" ]; then pass "$2"; else fail "$2"; fi; }

cleanup() {
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null
  if [ -n "$TEST_ROUTE_KEY" ]; then
    node "$HELPER" cleanup "$TEST_ROUTE_KEY" >/dev/null 2>&1
  fi
  rm -f "$HELPER" "$API_LOG" "$BAD_LOG" 2>/dev/null
}
trap cleanup EXIT

# 32 字节主密钥（一次性；base64）。仅本次验收实例使用，不落盘不入库。
MASTER_KEY="${AGENT_CRED_MASTER_KEY:-$(openssl rand -base64 32)}"
export AGENT_CRED_MASTER_KEY="$MASTER_KEY"

# 离线 helper：真库直连（pg）+ 底座真加解密（同一份源码）。
cat > "$HELPER" <<'MJS'
import pg from 'pg';
import { CredentialStore, makeCipher, ModelRouter } from './packages/agent-core/src/index.js';

const [, , cmd, ...args] = process.argv;
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'gri',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});
const query = (text, params) => pool.query(text, params);
const rand = () => Math.floor(Math.random() * 1e9);

async function main() {
  if (cmd === 'cols') {
    // 密文三列字节长度（证明"落库是密文"）+ 审计列（C6：updated_by/updated_at 有记）
    const { rows } = await pool.query(
      "SELECT octet_length(ciphertext) c, octet_length(iv) i, octet_length(auth_tag) t, algo, key_version, (updated_by IS NOT NULL) has_by, (updated_at IS NOT NULL) has_at FROM agent.llm_credentials WHERE route_key = $1",
      [args[0]],
    );
    const r = rows[0];
    if (!r) return console.log('MISSING');
    console.log(`c=${r.c} i=${r.i} t=${r.t} algo=${r.algo} kv=${r.key_version} by=${r.has_by} at=${r.has_at}`);
    return;
  }
  if (cmd === 'grep-plain') {
    // 明文/任意子串是否出现在该行的任何文本列（hint/route_key/algo）或密文里
    const { rows } = await pool.query(
      `SELECT count(*)::int n FROM agent.llm_credentials
        WHERE route_key LIKE '%' || $1 || '%'
           OR COALESCE(hint,'') LIKE '%' || $1 || '%'
           OR COALESCE(algo,'') LIKE '%' || $1 || '%'
           OR encode(ciphertext,'escape') LIKE '%' || $1 || '%'
           OR encode(iv,'escape') LIKE '%' || $1 || '%'
           OR encode(auth_tag,'escape') LIKE '%' || $1 || '%'`,
      [args[0]],
    );
    console.log(rows[0].n);
    return;
  }
  if (cmd === 'roundtrip') {
    // 真库 + 底座真解密；ModelRouter.resolve 合并凭据
    const cipher = makeCipher(Buffer.from(process.env.AGENT_CRED_MASTER_KEY, 'base64'));
    const cs = new CredentialStore({ cipher, query });
    const router = new ModelRouter({ query }, { LLM_API_KEY: 'nvapi-ENV-FALLBACK' }, cs);
    const got = await cs.get(args[0]);
    const cfg = await router.resolve(args[0]);
    const want = args[1];
    if (!got) return console.log('NO_CRED');
    if (got.apiKey !== want) return console.log('MISMATCH');
    if (cfg.apiKey !== want) return console.log('RESOLVE_MISMATCH');
    if (cfg.source !== 'route+cred') return console.log(`SRC=${cfg.source}`);
    console.log('OK');
    return;
  }
  if (cmd === 'tamper') {
    // 篡改 auth_tag（真库读原值 → 翻转首字节 → 写回，保证必变）→ get/resolve 必须抛错（fail-fast，不静默回退 env）
    const cur = await pool.query('SELECT auth_tag FROM agent.llm_credentials WHERE route_key = $1', [args[0]]);
    if (!cur.rows[0]) return console.log('NO_ROW');
    const tag = Buffer.from(cur.rows[0].auth_tag);
    tag[0] = tag[0] ^ 0xff;
    await pool.query('UPDATE agent.llm_credentials SET auth_tag = $2 WHERE route_key = $1', [args[0], tag]);
    const cipher = makeCipher(Buffer.from(process.env.AGENT_CRED_MASTER_KEY, 'base64'));
    const cs = new CredentialStore({ cipher, query });
    const router = new ModelRouter({ query }, { LLM_API_KEY: 'nvapi-ENV-FALLBACK' }, cs);
    const threwGet = await cs.get(args[0]).then(() => false, () => true);
    const threwResolve = await router.resolve(args[0]).then(() => false, () => true);
    console.log(`${threwGet ? 'THREW_GET' : 'SILENT_GET'}/${threwResolve ? 'THREW_RESOLVE' : 'SILENT_RESOLVE'}`);
    return;
  }
  if (cmd === 'seed-route') {
    await pool.query(
      `INSERT INTO agent.llm_routes (route_key, provider, model, enabled) VALUES ($1,'nvidia','seed-model',true)
       ON CONFLICT (route_key) DO UPDATE SET model='seed-model', updated_at=NOW()`,
      [args[0]],
    );
    console.log('SEEDED');
    return;
  }
  if (cmd === 'cleanup') {
    // 清场：删测试路由行（级联删凭据）
    await pool.query('DELETE FROM agent.llm_routes WHERE route_key = $1', [args[0]]);
    const { rows } = await pool.query('SELECT count(*)::int n FROM agent.llm_credentials WHERE route_key = $1', [args[0]]);
    console.log(`ROUTE_CLEANED cred_left=${rows[0].n} rand=${rand()}`);
    return;
  }
  console.log('UNKNOWN_CMD');
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error(`HELPER_ERR ${e.message}`);
    await pool.end().catch(() => {});
    process.exit(1);
  });
MJS

# ---------------------------------------------------------------------------
echo "== §0. 迁移 032 幂等 + 表结构 =="
MIG1="$(cd "$API_DIR" && DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" node dist/migrate/run-migrations.js 2>&1)"
RC1=$?
MIG2="$(cd "$API_DIR" && DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" node dist/migrate/run-migrations.js 2>&1)"
RC2=$?
if [ "$RC1" = "0" ] && [ "$RC2" = "0" ]; then pass "§0.1 迁移跑两次均退出 0（幂等）"; else fail "§0.1 迁移退出码 $RC1/$RC2"; fi
case "$MIG2" in
  *"skip 032_agent_credentials.sql"*) pass "§0.2 032 二次执行为 skip（幂等；首跑 applied-or-skip 均可）" ;;
  *) fail "§0.2 032 二次执行非 skip（首跑=$(printf '%s' "$MIG1" | grep -c '032') 次跑命中 -- 'skip 032': $(printf '%s' "$MIG2" | grep -c 'skip 032')）" ;;
esac
COLS="$(node "$HELPER" cols "__b1_probe_missing__" 2>/dev/null)"
[ "$COLS" = "MISSING" ] && pass "§0.3 agent.llm_credentials 表存在（SELECT 可达）" || fail "§0.3 表查询异常：$COLS"

# ---------------------------------------------------------------------------
echo "== §1. 底座单测（packages/agent-core，node --test）=="
CORE_OUT="$(cd "$CORE_DIR" && npm test 2>&1)"
CORE_PASS="$(printf '%s' "$CORE_OUT" | grep -E '^ℹ pass [0-9]+' | awk '{print $3}')"
CORE_FAIL="$(printf '%s' "$CORE_OUT" | grep -E '^ℹ fail [0-9]+' | awk '{print $3}')"
if [ "${CORE_FAIL:-1}" = "0" ] && [ "${CORE_PASS:-0}" -ge 62 ]; then
  pass "§1 底座 ${CORE_PASS} passed / 0 failed（含新增凭据套件）"
else
  fail "§1 底座 ${CORE_PASS:-0} passed / ${CORE_FAIL:-?} failed（期望 0 failed 且 ≥62）"
fi

# ---------------------------------------------------------------------------
echo "== §2. api 回归（tsc + jest）=="
( cd "$API_DIR" && npx tsc --noEmit ) >/dev/null 2>&1
ok $? "§2.1 npx tsc --noEmit 通过"
JEST_JSON="$(mktemp /tmp/b1-jest.XXXXXX.json)"
( cd "$API_DIR" && npx jest --json --outputFile="$JEST_JSON" ) >/dev/null 2>&1
JEST_RC=$?
JT_PASS="$(jq -r '.numPassedTests // 0' "$JEST_JSON" 2>/dev/null)"
JT_FAIL="$(jq -r '.numFailedTests // 0' "$JEST_JSON" 2>/dev/null)"
if [ "$JEST_RC" = "0" ] && [ "${JT_FAIL:-1}" = "0" ] && [ "${JT_PASS:-0}" -ge 646 ]; then
  pass "§2.2 jest 全量 ${JT_PASS} passed / 0 failed"
else
  fail "§2.2 jest rc=$JEST_RC ${JT_PASS:-0} passed / ${JT_FAIL:-?} failed"
fi
rm -f "$JEST_JSON"

# ---------------------------------------------------------------------------
echo "== §3. 底座零 env 依赖（C3/C4）=="
ENV_HITS="$(grep -c 'process\.env' "$CORE_DIR/src/credential-store.js" 2>/dev/null || true)"
[ "${ENV_HITS:-1}" = "0" ] && pass "§3.1 credential-store.js 里 process.env 命中 = 0（master key 由宿主注入）" || fail "§3.1 credential-store.js 含 process.env $ENV_HITS 处"
# model-router 既有 1 处 env 注入点（构造里 env 缺省 process.env）；本卡不得新增（注释行不计）
ENV_HITS2="$(grep -n 'process\.env' "$CORE_DIR/src/model-router.js" 2>/dev/null | grep -vE ':[[:space:]]*\*' | wc -l)"
[ "${ENV_HITS2:-9}" = "1" ] && pass "§3.2 model-router.js 仍只有 1 处 env 注入点（未新增 env 依赖）" || fail "§3.2 model-router.js 代码行 process.env 命中 $ENV_HITS2 处（期望 1）"

# ---------------------------------------------------------------------------
echo "== §4. 离线密文往返（假库直驱 CredentialStore）=="
OFFLINE="$(cd "$ROOT_DIR" && node --input-type=module -e '
import { CredentialStore, makeCipher } from "./packages/agent-core/src/index.js";
const KEY = Buffer.alloc(32, 3);
const PT = "nvapi-OFFLINE-RT99";
const rows = new Map();
let lastParams = null;
const query = async (t, p = []) => {
  if (/INSERT INTO agent\.llm_credentials/.test(t)) { lastParams = p; rows.set(p[0], { ciphertext: p[1], iv: p[2], auth_tag: p[3], algo: p[4], key_version: p[5], hint: p[6], updated_by: p[7] }); return { rows: [] }; }
  const r = rows.get(p[0]);
  if (/SELECT ciphertext/.test(t)) return { rows: r ? [r] : [] };
  if (/SELECT hint/.test(t)) return { rows: r ? [r] : [] };
  return { rows: [] };
};
const cs = new CredentialStore({ cipher: makeCipher(KEY), query });
const setRes = await cs.set("entity=x", PT, { updatedBy: "op" });
const got = await cs.get("entity=x");
const meta = await cs.meta("entity=x");
const leaks = JSON.stringify(lastParams.map((x) => (Buffer.isBuffer(x) ? x.toString("base64") : String(x)))).includes(PT);
const tampered = { ...rows.get("entity=x") }; tampered.auth_tag = Buffer.from("0000000000000000", "hex");
rows.set("entity=x", tampered);
const threw = await cs.get("entity=x").then(() => false, () => true);
console.log(JSON.stringify({ rt: got && got.apiKey === PT, hint: setRes.hint, metaLeak: JSON.stringify(meta).includes(PT), paramLeak: leaks, threw, ivLen: lastParams[2].length }));
' 2>&1)"
RT="$(printf '%s' "$OFFLINE" | jq -r '.rt' 2>/dev/null)"
HINT="$(printf '%s' "$OFFLINE" | jq -r '.hint' 2>/dev/null)"
LEAK="$(printf '%s' "$OFFLINE" | jq -r '.paramLeak' 2>/dev/null)"
METALEAK="$(printf '%s' "$OFFLINE" | jq -r '.metaLeak' 2>/dev/null)"
THREW="$(printf '%s' "$OFFLINE" | jq -r '.threw' 2>/dev/null)"
IVLEN="$(printf '%s' "$OFFLINE" | jq -r '.ivLen' 2>/dev/null)"
[ "$RT" = "true" ] && pass "§4.1 写→读解密 == 原值（往返一致）" || fail "§4.1 往返不一致：$OFFLINE"
[ "$HINT" = "RT99" ] && pass "§4.2 hint 只回后 4 位（RT99）" || fail "§4.2 hint=$HINT（期望 RT99）"
[ "$LEAK" = "false" ] && pass "§4.3 落库 bind 参数零明文" || fail "§4.3 落库参数含明文"
[ "$METALEAK" = "false" ] && pass "§4.4 meta() 零明文（只回 has_key/hint）" || fail "§4.4 meta 泄漏明文"
[ "$THREW" = "true" ] && pass "§4.5 篡改 auth_tag → get 抛错（fail-fast）" || fail "§4.5 篡改未抛错"
[ "$IVLEN" = "12" ] && pass "§4.6 IV = 12 字节（GCM 推荐 nonce）" || fail "§4.6 IV 长度=$IVLEN"

# ---------------------------------------------------------------------------
echo "== §5. 活体端到端（源码直起 3009，注入 AGENT_CRED_MASTER_KEY）=="
( cd "$API_DIR" && PORT=3009 DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" \
    AUTH_JWKS_URL="${AUTH_JWKS_URL:-http://localhost:3004/auth/jwks}" AUTH_CENTER_URL="${AUTH_CENTER_URL:-http://localhost:3004}" \
    AGENT_CRED_MASTER_KEY="$MASTER_KEY" \
    node dist/main.js ) >"$API_LOG" 2>&1 &
API_PID=$!

READY=""
for _ in $(seq 1 40); do
  if curl -sf -m 2 "http://localhost:3009/health" >/dev/null 2>&1; then READY=1; break; fi
  if ! kill -0 "$API_PID" 2>/dev/null; then break; fi
  sleep 0.5
done

if [ -z "$READY" ]; then
  fail "§5 前置：源码实例 3009 未就绪（见 $API_LOG）"
  echo "---- api log tail ----"; tail -20 "$API_LOG"
else
  pass "§5 前置：源码实例 3009 就绪（含本卡源码）"

  req() { # req <method> <url> <token|-> <body|-> ; sets RESP_CODE / RESP_BODY
    local method="$1" url="$2" token="$3" data="$4"
    local args=(-s -o /tmp/b1-resp.$$ -w '%{http_code}' -X "$method" -m 20)
    [ "$token" != "-" ] && args+=(-H "Authorization: Bearer $token")
    [ "$data" != "-" ] && args+=(-H 'Content-Type: application/json' -d "$data")
    RESP_CODE="$(curl "${args[@]}" "$url" 2>/dev/null)"
    RESP_BODY="$(cat /tmp/b1-resp.$$ 2>/dev/null)"; rm -f /tmp/b1-resp.$$
  }

  OP_TOKEN="$(curl -s -m 10 -X POST "$AUTH_BASE/login" -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg i "$OP_IDENTIFIER" --arg p "$OP_PASSWORD" '{identifier:$i,password:$p}')" | jq -r '.accessToken // empty')"
  if [ -z "$OP_TOKEN" ]; then
    fail "§5 前置：operator($OP_IDENTIFIER) 登录失败（auth-center 可达？）"
  else
    pass "§5 前置：operator 登录成功（根组织 owner = 站点运营）"

    # 一次性非运营用户：公开注册 → 登录。用户名固定（重复跑不堆积用户；已存在则直接登录）
    NU="b1nonop"
    req POST "$P2P_BASE/auth/register" - "$(jq -nc --arg u "$NU" --arg e "$NU@example.com" '{username:$u,email:$e,password:"password123",name:$u}')"
    NU_TOKEN="$(curl -s -m 10 -X POST "$AUTH_BASE/login" -H 'Content-Type: application/json' \
      -d "$(jq -nc --arg i "$NU@example.com" --arg p 'password123' '{identifier:$i,password:$p}')" | jq -r '.accessToken // empty')"
    if [ -n "$NU_TOKEN" ]; then
      case "$RESP_CODE" in
        2??) pass "§5 前置：非运营用户就绪（$NU，本次新建）" ;;
        *)   pass "§5 前置：非运营用户就绪（$NU，已存在 → 复用）" ;;
      esac
    else
      fail "§5 前置：非运营用户不可用（注册 HTTP $RESP_CODE: $(printf '%s' "$RESP_BODY" | head -c 160)）"
    fi

    TARGET_UUID="$(node --input-type=module -e 'import { randomUUID } from "node:crypto"; console.log(randomUUID())')"
    TEST_ROUTE_KEY="entity=$TARGET_UUID"

    # 5.1 operator PUT 带 api_key（write-only）
    req PUT "$P2P_BASE/agent/admin/routes" "$OP_TOKEN" "$(jq -nc --arg k "$TEST_ROUTE_KEY" --arg a "$TEST_PLAINTEXT" '{route_key:$k,model:"b1-route-model",api_key:$a}')"
    if [ "$RESP_CODE" = "200" ] && [ "$(printf '%s' "$RESP_BODY" | jq -r '.success')" = "true" ]; then
      if printf '%s' "$RESP_BODY" | grep -qF "$TEST_PLAINTEXT"; then
        fail "§5.1 PUT 响应体含明文 api_key（违反 C2）"
      else
        pass "§5.1 PUT api_key → 成功，响应体零明文（hint=$(printf '%s' "$RESP_BODY" | jq -r '.hint')）"
      fi
    else
      fail "§5.1 PUT api_key 失败 HTTP $RESP_CODE: $(printf '%s' "$RESP_BODY" | head -c 200)"
    fi

    # 5.2 GET 只回掩码
    req GET "$P2P_BASE/agent/admin/routes" "$OP_TOKEN" -
    ROW="$(printf '%s' "$RESP_BODY" | jq -c --arg k "$TEST_ROUTE_KEY" '.routes[]? | select(.route_key==$k)')"
    if [ "$RESP_CODE" = "200" ] && [ -n "$ROW" ]; then
      HAS="$(printf '%s' "$ROW" | jq -r '.has_key')"
      HINT="$(printf '%s' "$ROW" | jq -r '.hint')"
      if printf '%s' "$RESP_BODY" | grep -qF "$TEST_PLAINTEXT"; then
        fail "§5.2 GET 响应体含明文 api_key（违反 C2/C5）"
      elif [ "$HAS" = "true" ] && [ "$HINT" = "1234" ]; then
        pass "§5.2 GET 只回 has_key=true + hint=1234（响应零明文）"
      else
        fail "§5.2 GET 掩码不符：has_key=$HAS hint=$HINT"
      fi
    else
      fail "§5.2 GET 未取到该 route 行 HTTP $RESP_CODE"
    fi

    # 5.3 非运营越权改他人 entity key → 403（C7）
    if [ -n "$NU_TOKEN" ]; then
      req PUT "$P2P_BASE/agent/admin/routes" "$NU_TOKEN" "$(jq -nc --arg k "$TEST_ROUTE_KEY" '{route_key:$k,model:"hijack",api_key:"nvapi-HIJACK1234"}')"
      [ "$RESP_CODE" = "403" ] && pass "§5.3 非运营 PUT 他人 entity key → 403（多租户隔离）" || fail "§5.3 非运营越权应 403（实得 $RESP_CODE）"
      req GET "$P2P_BASE/agent/admin/routes" "$NU_TOKEN" -
      [ "$RESP_CODE" = "403" ] && pass "§5.3b 非运营 GET 路由（含掩码）→ 403" || fail "§5.3b 非运营 GET 应 403（实得 $RESP_CODE）"
    fi

    # 5.4 落库 = 密文；明文 grep 命中 0（C1）
    COLS="$(node "$HELPER" cols "$TEST_ROUTE_KEY" 2>/dev/null)"
    case "$COLS" in
      c=[1-9]*\ i=12\ t=16*"algo=aes-256-gcm"*"by=true"*"at=true"*) pass "§5.4a 落库为密文 + 审计列已记（$COLS）" ;;
      c=[1-9]*\ i=12\ t=16*) fail "§5.4a 密文列 OK 但审计列（updated_by/updated_at）缺失：$COLS" ;;
      *) fail "§5.4a 密文列异常：$COLS" ;;
    esac
    HITS="$(node "$HELPER" grep-plain "$TEST_PLAINTEXT" 2>/dev/null)"
    [ "$HITS" = "0" ] && pass "§5.4b 明文在凭据表全列 grep = 0 命中（C1）" || fail "§5.4b 明文落库命中 $HITS 处"

    # 5.5 合并往返（ModelRouter.resolve 解密 == 写入值）
    RT="$(node "$HELPER" roundtrip "$TEST_ROUTE_KEY" "$TEST_PLAINTEXT" 2>/dev/null)"
    [ "$RT" = "OK" ] && pass "§5.5 ModelRouter.resolve('$TEST_ROUTE_KEY') 解密回原值（source=route+cred）" || fail "§5.5 合并往返异常：$RT"

    # 5.6 篡改 → fail-fast（C8）
    TAMP="$(node "$HELPER" tamper "$TEST_ROUTE_KEY" 2>/dev/null)"
    [ "$TAMP" = "THREW_GET/THREW_RESOLVE" ] && pass "§5.6 篡改 auth_tag → get/resolve 均抛错（不静默回退 env）" || fail "§5.6 篡改处置异常：$TAMP"

    # 5.7 不回归：不带 api_key 的 PUT/GET 行为对拍旧版（C9）
    K2="kind=b1-nokey-$TS"
    req PUT "$P2P_BASE/agent/admin/routes" "$OP_TOKEN" "$(jq -nc --arg k "$K2" '{route_key:$k,provider:"nvidia",model:"legacy-model",enabled:true}')"
    P1="$(printf '%s' "$RESP_BODY" | jq -r '.success')"
    P2="$(printf '%s' "$RESP_BODY" | jq -r '.applied')"
    req GET "$P2P_BASE/agent/admin/routes" "$OP_TOKEN" -
    K2HAS="$(printf '%s' "$RESP_BODY" | jq -c --arg k "$K2" '[.routes[]? | select(.route_key==$k)] | length')"
    K2KEY="$(printf '%s' "$RESP_BODY" | jq -r --arg k "$K2" '.routes[]? | select(.route_key==$k) | .has_key')"
    if [ "$P1" = "true" ] && [ "$P2" = "true" ] && [ "$K2HAS" = "1" ] && [ "$K2KEY" = "false" ]; then
      pass "§5.7 无 api_key 路径行为对拍旧版（success/applied/行读回 一致，has_key=false）"
    else
      fail "§5.7 无 api_key 路径回归（success=$P1 applied=$P2 行数=$K2HAS has_key=$K2KEY）"
    fi
    node "$HELPER" cleanup "$K2" >/dev/null 2>&1

    # 5.8 未配置主密钥实例 → 带 api_key 被拒（凭据面关闭，零回归）
    ( cd "$API_DIR" && PORT=3012 DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" \
        AUTH_JWKS_URL="${AUTH_JWKS_URL:-http://localhost:3004/auth/jwks}" AUTH_CENTER_URL="${AUTH_CENTER_URL:-http://localhost:3004}" \
        AGENT_CRED_MASTER_KEY="" \
        node dist/main.js ) >/dev/null 2>&1 &
    NOKEY_PID=$!
    NOKEY_READY=""
    for _ in $(seq 1 40); do
      curl -sf -m 2 "http://localhost:3012/health" >/dev/null 2>&1 && { NOKEY_READY=1; break; }
      kill -0 "$NOKEY_PID" 2>/dev/null || break
      sleep 0.5
    done
    if [ -n "$NOKEY_READY" ]; then
      req PUT "http://localhost:3012/api/agent/admin/routes" "$OP_TOKEN" "$(jq -nc --arg k "entity=$TARGET_UUID" --arg a 'nvapi-NOKEY-TEST1' '{route_key:$k,api_key:$a}')"
      REFUSED="$(printf '%s' "$RESP_BODY" | jq -r '.success')"
      if [ "$REFUSED" = "false" ] && printf '%s' "$RESP_BODY" | grep -qi 'AGENT_CRED_MASTER_KEY'; then
        pass "§5.8 未配置主密钥 → api_key 被拒（凭据面关闭，零回归）"
      else
        fail "§5.8 未配置主密钥应拒收 api_key（实得 HTTP $RESP_CODE: $(printf '%s' "$RESP_BODY" | head -c 160)）"
      fi
    else
      fail "§5.8 备用实例 3012 未就绪"
    fi
    kill "$NOKEY_PID" 2>/dev/null

    # 5.9 主密钥长度非法 → 启动 fail-fast
    ( cd "$API_DIR" && PORT=3011 DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" \
        AUTH_JWKS_URL="${AUTH_JWKS_URL:-http://localhost:3004/auth/jwks}" AGENT_CRED_MASTER_KEY="tooshort" \
        timeout 20 node dist/main.js ) >"$BAD_LOG" 2>&1
    BADRC=$?
    if [ "$BADRC" != "0" ] && [ "$BADRC" != "124" ]; then
      pass "§5.9 主密钥长度非法 → 启动即退（rc=$BADRC，fail-fast）"
    else
      fail "§5.9 主密钥非法未 fail-fast（rc=$BADRC）"
    fi

    # 5.10 清场
    CLEAN="$(node "$HELPER" cleanup "$TEST_ROUTE_KEY" 2>/dev/null)"
    case "$CLEAN" in
      *cred_left=0*) pass "§5.10 清场：测试路由行/凭据已删（级联）" ;;
      *) fail "§5.10 清场异常：$CLEAN" ;;
    esac
    TEST_ROUTE_KEY=""
  fi
fi

# ---------------------------------------------------------------------------
echo "== §6. 凭据零泄漏 =="
# 6.1 测试明文只允许出现在测试文件里；生产源码/契约文案中不得出现
SRC_HITS="$(grep -rnF "$TEST_PLAINTEXT" "$CORE_DIR/src" "$API_DIR/src" 2>/dev/null | grep -vE '\.spec\.' | wc -l)"
[ "$SRC_HITS" = "0" ] && pass "§6.1 测试明文 fixtures 仅见于 *.spec.*，生产源码命中 0" || fail "§6.1 生产源码含测试明文 $SRC_HITS 处"
# 6.2 源码无 nvapi- 长字面量（真 key 形状）
REAL_HITS="$(grep -rnE 'nvapi-[A-Za-z0-9_-]{20,}' "$CORE_DIR/src" "$API_DIR/src" "$CORE_DIR/index.d.ts" 2>/dev/null | wc -l)"
[ "$REAL_HITS" = "0" ] && pass "§6.2 源码无 nvapi- 真 key 字面量（命中 0）" || fail "§6.2 源码疑含真实 key $REAL_HITS 处"
# 6.3 运行日志零明文（写 key 的全过程）
if [ -f "$API_LOG" ]; then
  LOG_HITS="$(grep -cF "$TEST_PLAINTEXT" "$API_LOG" 2>/dev/null || true)"
  [ "${LOG_HITS:-1}" = "0" ] && pass "§6.3 运行日志零明文 api_key" || fail "§6.3 运行日志泄漏 api_key $LOG_HITS 处"
fi
# 6.4 .env.example 只有占位、无真值
ENVLINE="$(grep -E '^AGENT_CRED_MASTER_KEY=' "$ROOT_DIR/.env.example" 2>/dev/null)"
case "$ENVLINE" in
  "AGENT_CRED_MASTER_KEY="*'#'*|"AGENT_CRED_MASTER_KEY=") [ -n "$ENVLINE" ] && pass "§6.4 .env.example 新增 AGENT_CRED_MASTER_KEY 占位（无真值）" || fail "§6.4 .env.example 缺 AGENT_CRED_MASTER_KEY" ;;
  *) fail "§6.4 .env.example 条目异常" ;;
esac

# ---------------------------------------------------------------------------
echo "------------------------------------------------------------------"
printf 'PASS=%d FAIL=%d VERIFY_EXIT=%d\n' "$PASS" "$FAIL" "$([ "$FAIL" = "0" ] && echo 0 || echo 1)"
[ "$FAIL" = "0" ]
