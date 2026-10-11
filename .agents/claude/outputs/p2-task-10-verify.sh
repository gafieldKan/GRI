#!/usr/bin/env bash
# ============================================================================
# P2-T10 验收：organization 邀请鉴权门禁 + 审计分页/筛选（增量补齐卡）
#
# 结构：
#   §1 jest 单测      —— organization.controller/service spec（本卡新增 ≥10 例）
#   §2 离线行为断言   —— ts-node 直驱 OrganizationService + 记录型假库，独立复核 §1：
#                        2.1 邀请门禁：owner/admin 放行；member 与非成员 403，且不触邀请 SQL
#                        2.2 邀请 status/limit/offset 走 bind 参数；缺省不变（无 LIMIT，仍返全量）
#                        2.3 审计 offset 分页 + action/entity_type/actor_id/时间范围筛选（全 bind）
#                        2.4 total 与筛选同口径；limit/offset 越界钳制
#                        2.5 非法 actorId/时间 → 400（不把坏值丢给 PG 崩 500）；注入串仅作字面值
#                        2.6 门禁先于查询：越权者不产生任何审计 SQL
#   §3 活体端到端     —— api 可达时执行（operator=testuser 根 owner + 一次性非成员用户）：
#                        3.1 operator GET :id/invitations → 200
#                        3.2 非成员 GET :id/invitations → 403   ← 本卡修复点（修复前 200 裸数据）
#                        3.3 非成员 GET :id/audit → 403
#                        3.4 审计分页取到第二页 + action 筛选生效 + 坏参 400
#                        3.5 回归：GET :id/members → 200；POST /organizations → 201（建后删，清场）
#                        不可达 → 该段 SKIP，不计数（§1/§2 已独立覆盖行为）
#
# 依赖：services/api 已 npm install；§3 另需 api(3008)/auth-center(3004) 在跑。
# ⚠️ §3 校验的是「运行实例」的代码：容器须含本卡修复 —— docker compose build api && docker compose up -d api
# 用法： bash .agents/claude/outputs/p2-task-10-verify.sh
# 通过： 末尾打印「PASS=<n> FAIL=0 VERIFY_EXIT=0」
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_DIR="$ROOT_DIR/services/api"
API_BASE="${API_BASE:-http://localhost:3008/api}"
AUTH_BASE="${AUTH_BASE:-http://localhost:3004/auth}"
API_HEALTH="${API_HEALTH:-http://localhost:3008/health}"
AUTH_HEALTH="${AUTH_HEALTH:-http://localhost:3004/health}"

OP_IDENTIFIER="${TEST_IDENTIFIER:-testuser}"
OP_PASSWORD="${TEST_PASSWORD:-test1234}"
ROOT_ORG="${ROOT_ORG:-10000000-0000-0000-0000-000000000001}"
TS="$(date +%s)"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }

json_field() { # json_field <field>  (stdin = jest --json 输出)
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s)["'"$1"'"]||0)}catch(e){console.log(0)}})'
}

# ---------------------------------------------------------------------------
echo "== §1. jest 单测（organization 模块）=="
JEST_JSON="$(cd "$API_DIR" && npx jest src/modules/organization --json 2>/dev/null)"
JT_PASS="$(printf '%s' "$JEST_JSON" | json_field numPassedTests)"
JT_FAIL="$(printf '%s' "$JEST_JSON" | json_field numFailedTests)"
JT_TOTAL="$(printf '%s' "$JEST_JSON" | json_field numTotalTests)"
if [ "${JT_FAIL:-0}" -eq 0 ] && [ "${JT_PASS:-0}" -ge 40 ]; then
  pass "jest: ${JT_PASS}/${JT_TOTAL:-?} tests passed, 0 failed（本卡新增 ≥10 例后模块基线 ≥40）"
else
  fail "jest: ${JT_PASS:-0} passed / ${JT_FAIL:-0} failed（期望 0 failed 且 ≥40 passed）"
fi

# ---------------------------------------------------------------------------
echo "== §2. 离线行为断言（ts-node 直驱 OrganizationService + 记录型假库）=="
HARNESS="$API_DIR/.p2t10-verify.tmp.ts"
cat > "$HARNESS" <<'TS'
import { OrganizationService } from './src/modules/organization/organization.service';

const ORG = '10000000-0000-0000-0000-000000000001';
const OWNER = 'a0000000-0000-0000-0000-000000000001';
const ADMIN = 'a0000000-0000-0000-0000-000000000010';
const MEMBER = 'a0000000-0000-0000-0000-000000000002';
const OUTSIDER = 'a0000000-0000-0000-0000-000000000099';
const INV_ROW = { id: 'i1', organization_id: ORG, email: 'x@y.com', status: 'pending' };
const AUDIT_ROW = {
  id: 'a1', action: 'member.add', entity_type: 'member', entity_id: null,
  actor_id: ADMIN, actor_name: '管理员', changes: {}, created_at: '2026-10-01T00:00:00Z',
};

let pass = 0;
let fail = 0;
const ok = (cond: boolean, desc: string): void => {
  if (cond) { pass += 1; console.log('PASS  ' + desc); }
  else { fail += 1; console.log('FAIL  ' + desc); }
};

type Call = { sql: string; params?: unknown[] };

/** 记录型假库：捕获每条 SQL + bind 参数（用于断言「筛选一律参数化」）。 */
function mkdb(
  membership: Record<string, string>,
  rows: { total?: number; audit?: unknown[]; inv?: unknown[] } = {},
): { svc: OrganizationService; calls: Call[] } {
  const calls: Call[] = [];
  const query = async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (/FROM tenant\.organizations/.test(sql)) {
      return { rows: params?.[0] ? [{ id: params[0], level: 1, parent_path: '/' }] : [] };
    }
    if (/SELECT role FROM tenant\.organization_members/.test(sql)) {
      const role = membership[params?.[1] as string];
      return { rows: role ? [{ role }] : [] };
    }
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: rows.total ?? 0 }] };
    if (/FROM tenant\.organization_audit_logs/.test(sql)) return { rows: rows.audit ?? [] };
    if (/FROM tenant\.organization_invitations/.test(sql)) return { rows: rows.inv ?? [] };
    if (/FROM public\.users/.test(sql)) return { rows: [{ id: 'u' }] };
    return { rows: [] };
  };
  const db = { query } as unknown as ConstructorParameters<typeof OrganizationService>[0];
  return { svc: new OrganizationService(db), calls };
}

const auditCall = (calls: Call[]): Call | undefined =>
  calls.find((c) => /FROM tenant\.organization_audit_logs/.test(c.sql));
const pageParams = (calls: Call[]): unknown[] | undefined =>
  calls.find((c) => /LIMIT \$/.test(c.sql))?.params;
const isForbidden = async (p: Promise<unknown>): Promise<boolean> =>
  p.then(() => false, (e: Error) => e.constructor.name === 'ForbiddenException');
const isBadRequest = async (p: Promise<unknown>): Promise<boolean> =>
  p.then(() => false, (e: Error) => e.constructor.name === 'BadRequestException');

async function main(): Promise<void> {
  // --- §2.1 邀请门禁 ---
  {
    const { svc } = mkdb({ [OWNER]: 'owner' }, { inv: [INV_ROW] });
    ok((await svc.listInvitations(OWNER, ORG)).length === 1, '邀请：owner 放行并返回列表');
  }
  {
    const { svc } = mkdb({ [ADMIN]: 'admin' }, { inv: [INV_ROW] });
    ok((await svc.listInvitations(ADMIN, ORG)).length === 1, '邀请：admin 放行');
  }
  {
    const { svc, calls } = mkdb({ [MEMBER]: 'member' });
    const forbidden = await isForbidden(svc.listInvitations(MEMBER, ORG));
    ok(forbidden, '邀请：本组织普通 member → 403（无管理权不得读邀请）');
    ok(!calls.some((c) => /FROM tenant\.organization_invitations/.test(c.sql)),
      '邀请：403 时不执行邀请 SQL（无数据泄露路径）');
  }
  {
    const { svc, calls } = mkdb({});
    const forbidden = await isForbidden(svc.listInvitations(OUTSIDER, ORG));
    ok(forbidden, '邀请：组织外登录用户 → 403 ← 修复前为 200 裸数据');
    ok(!calls.some((c) => /FROM tenant\.organization_invitations/.test(c.sql)),
      '邀请：非成员 403 时不执行邀请 SQL');
  }

  // --- §2.2 邀请筛选/分页参数化 ---
  {
    const { svc, calls } = mkdb({ [ADMIN]: 'admin' }, { inv: [INV_ROW] });
    await svc.listInvitations(ADMIN, ORG, { status: 'pending' });
    const q = calls.find((c) => /FROM tenant\.organization_invitations/.test(c.sql));
    ok(q?.sql.includes('status = $2') === true, '邀请：status 筛选条件参数化（status = $2）');
    ok(q?.sql.includes('pending') === false, '邀请：筛选值不进 SQL 文本（字面值零拼接）');
    ok(JSON.stringify(q?.params) === JSON.stringify([ORG, 'pending']), '邀请：status bind 参数正确');
  }
  {
    const { svc, calls } = mkdb({ [ADMIN]: 'admin' });
    await svc.listInvitations(ADMIN, ORG, { limit: 10, offset: 20 });
    ok(JSON.stringify(pageParams(calls)) === JSON.stringify([ORG, 10, 20]), '邀请：limit/offset → LIMIT/OFFSET 绑定');
  }
  {
    const { svc, calls } = mkdb({ [ADMIN]: 'admin' });
    await svc.listInvitations(ADMIN, ORG);
    const q = calls.find((c) => /FROM tenant\.organization_invitations/.test(c.sql));
    ok(q?.sql.match(/LIMIT/) === null, '邀请：缺省无 LIMIT（保持「返回全部」旧行为，Portal 零改动）');
  }

  // --- §2.3 审计分页 + 筛选 ---
  {
    const { svc, calls } = mkdb({ [ADMIN]: 'admin' }, { total: 12, audit: [AUDIT_ROW] });
    const page = await svc.getAudit(ADMIN, ORG, { limit: 10, offset: 10 });
    ok(JSON.stringify(pageParams(calls)) === JSON.stringify([ORG, 10, 10]), '审计：第二页 LIMIT 10 OFFSET 10');
    ok(page.total === 12 && page.limit === 10 && page.offset === 10, '审计：返回 total/limit/offset');
    ok(page.rows.length === 1 && page.rows[0].id === 'a1', '审计：rows 为当前页数据');
  }
  {
    const { svc, calls } = mkdb({ [ADMIN]: 'admin' }, { audit: [AUDIT_ROW] });
    await svc.getAudit(ADMIN, ORG, { action: 'member.add' });
    const q = auditCall(calls);
    ok(q?.sql.includes('a.action = $2') === true, '审计：action 参数化（a.action = $2）');
    ok(q?.sql.includes('member.add') === false, '审计：action 值不进 SQL 文本');
  }
  {
    const { svc, calls } = mkdb({ [ADMIN]: 'admin' }, { audit: [AUDIT_ROW] });
    await svc.getAudit(ADMIN, ORG, { entityType: 'member', actorId: ADMIN });
    const q = auditCall(calls);
    ok(q?.sql.includes('a.entity_type = $2') === true && q?.sql.includes('a.actor_id = $3') === true,
      '审计：entity_type/actor_id 联合筛选按序参数化');
  }
  {
    const { svc, calls } = mkdb({ [ADMIN]: 'admin' }, { audit: [AUDIT_ROW] });
    await svc.getAudit(ADMIN, ORG, { from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' });
    const q = auditCall(calls);
    ok(q?.sql.includes('a.created_at >= $2') === true && q?.sql.includes('a.created_at <= $3') === true,
      '审计：时间范围上下界参数化（created_at >= / <=）');
    ok(JSON.stringify(pageParams(calls)) ===
      JSON.stringify([ORG, '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', 50, 0]),
      '审计：时间值归一为 ISO 并作 bind 参数');
  }
  {
    const { svc, calls } = mkdb({ [ADMIN]: 'admin' }, { total: 3, audit: [AUDIT_ROW] });
    const page = await svc.getAudit(ADMIN, ORG, { action: 'member.add' });
    const countQ = calls.find((c) => /COUNT\(\*\)/.test(c.sql));
    ok(countQ?.sql.includes('a.action = $2') === true, '审计：COUNT 与分页共用同一 WHERE（同口径）');
    ok(page.total === 3, '审计：total 取自过滤后 COUNT');
  }

  // --- §2.4 越界钳制 ---
  {
    const { svc, calls } = mkdb({ [ADMIN]: 'admin' });
    const page = await svc.getAudit(ADMIN, ORG, { limit: 5000, offset: -5 });
    ok(JSON.stringify(pageParams(calls)) === JSON.stringify([ORG, 200, 0]), '审计：limit 上限 200 / offset 负数归 0');
    ok(page.limit === 200 && page.offset === 0, '审计：钳制结果回传客户端');
  }
  {
    const { svc, calls } = mkdb({ [ADMIN]: 'admin' });
    await svc.getAudit(ADMIN, ORG);
    ok(JSON.stringify(pageParams(calls)) === JSON.stringify([ORG, 50, 0]), '审计：缺省 limit=50/offset=0（保持旧默认）');
  }

  // --- §2.5 非法参数 fail-fast + 注入面 ---
  {
    const { svc, calls } = mkdb({ [ADMIN]: 'admin' });
    ok(await isBadRequest(svc.getAudit(ADMIN, ORG, { actorId: 'not-a-uuid' })),
      '审计：非法 actorId → 400（不把坏值丢给 PG uuid 列）');
    ok(!auditCall(calls), '审计：非法参数在校验阶段即止（未产生 SQL）');
  }
  {
    const { svc } = mkdb({ [ADMIN]: 'admin' });
    ok(await isBadRequest(svc.getAudit(ADMIN, ORG, { from: '昨天' })), '审计：非法时间 → 400');
  }
  {
    const { svc, calls } = mkdb({ [ADMIN]: 'admin' });
    const payload = `member.add' OR '1'='1`;
    await svc.getAudit(ADMIN, ORG, { action: payload });
    const q = auditCall(calls);
    ok(q?.sql.includes("OR '1'='1") === false, '审计：注入串不进 SQL 文本');
    ok(Array.isArray(q?.params) && (q?.params as unknown[]).includes(payload), '审计：注入串仅作 bind 字面值');
  }

  // --- §2.6 门禁先于查询 ---
  {
    const { svc, calls } = mkdb({});
    ok(await isForbidden(svc.getAudit(OUTSIDER, ORG, { action: 'member.add', limit: 1 })),
      '审计：非成员 → 403');
    ok(!calls.some((c) => /organization_audit_logs|COUNT/.test(c.sql)),
      '审计：403 时未产生任何审计/COUNT 查询（门禁在最前）');
  }
  {
    const { svc, calls } = mkdb({ [MEMBER]: 'member' });
    ok(await isForbidden(svc.listInvitations(MEMBER, ORG, { limit: 1 })), '邀请：member + 分页参数仍 403（参数不绕过门禁）');
  }

  console.log('HARNESS PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail ? 1 : 0);
}

main().catch((e: Error) => {
  console.log('FAIL  harness threw: ' + (e && e.message));
  console.log('HARNESS PASS=' + pass + ' FAIL=' + (fail + 1));
  process.exit(1);
});
TS

HARNESS_OUT="$(cd "$API_DIR" && npx ts-node --compiler-options \
  '{"experimentalDecorators":true,"emitDecoratorMetadata":true,"esModuleInterop":true,"module":"commonjs","target":"ES2022","strict":false}' \
  .p2t10-verify.tmp.ts 2>&1)"
HARNESS_RC=$?
rm -f "$HARNESS"

printf '%s\n' "$HARNESS_OUT" | grep -E '^(PASS|FAIL) ' || true
HP="$(printf '%s\n' "$HARNESS_OUT" | grep -cE '^PASS ' || true)"
HF="$(printf '%s\n' "$HARNESS_OUT" | grep -cE '^FAIL ' || true)"
PASS=$((PASS + ${HP:-0}))
FAIL=$((FAIL + ${HF:-0}))
[ "$HARNESS_RC" -eq 0 ] || fail "ts-node harness exited rc=$HARNESS_RC"

# ---------------------------------------------------------------------------
echo "== §3. 活体端到端（operator=根 owner / 一次性非成员用户）=="

RESP_CODE=""
RESP_BODY=""
req() { # req <method> <url> <token|-> <body|->
  local method="$1" url="$2" token="$3" data="$4"
  local args=(-sS -w $'\n%{http_code}' -X "$method" "$url" -H 'Content-Type: application/json')
  [ "$token" != "-" ] && args+=(-H "Authorization: Bearer $token")
  [ "$data" != "-" ] && args+=(-d "$data")
  local out
  out="$(curl "${args[@]}" 2>/dev/null)"
  RESP_CODE="$(printf '%s' "$out" | tail -n1)"
  RESP_BODY="$(printf '%s' "$out" | sed '$d')"
}
jbody() { printf '%s' "$RESP_BODY" | jq -r "$1" 2>/dev/null; }

if ! curl -sf -m 5 "$API_HEALTH" >/dev/null 2>&1 || ! curl -sf -m 5 "$AUTH_HEALTH" >/dev/null 2>&1; then
  echo "SKIP  api($API_HEALTH)/auth-center($AUTH_HEALTH) 未就绪 → 跳过 §3（不计分）"
  echo "      恢复： docker compose up -d api auth-center"
else
  req POST "$AUTH_BASE/login" - "$(jq -nc --arg i "$OP_IDENTIFIER" --arg p "$OP_PASSWORD" '{identifier:$i,password:$p}')"
  OP_TOKEN="$(jbody .accessToken)"
  if [ -z "$OP_TOKEN" ] || [ "$OP_TOKEN" = "null" ]; then
    fail "§3 前置：operator($OP_IDENTIFIER) 登录失败（HTTP $RESP_CODE）"
  else
    pass "§3 前置：operator 登录成功（根组织 owner）"

    # 一次性非成员用户：注册即与任何组织无关 → 用于证明门禁生效
    NU="p2t10_${TS}"
    req POST "$API_BASE/auth/register" - \
      "$(jq -nc --arg u "$NU" --arg e "${NU}@example.com" --arg p 'password123' '{username:$u,email:$e,password:$p,name:"T10验收"}')"
    if [ "$RESP_CODE" != "201" ]; then
      fail "§3 前置：非成员用户注册失败（HTTP $RESP_CODE）"
    else
      req POST "$AUTH_BASE/login" - "$(jq -nc --arg i "${NU}@example.com" --arg p 'password123' '{identifier:$i,password:$p}')"
      NM_TOKEN="$(jbody .accessToken)"
      if [ -z "$NM_TOKEN" ] || [ "$NM_TOKEN" = "null" ]; then
        fail "§3 前置：非成员用户登录失败（HTTP $RESP_CODE）"
      else
        pass "§3 前置：非成员用户已就绪（$NU，非任何组织成员）"

        # 3.1 operator → 200 + 数组
        req GET "$API_BASE/organizations/$ROOT_ORG/invitations" "$OP_TOKEN" -
        if [ "$RESP_CODE" = "200" ] && [ "$(printf '%s' "$RESP_BODY" | jq -r 'type' 2>/dev/null)" = "array" ]; then
          pass "§3.1 operator GET :id/invitations → 200 且为邀请数组"
        else
          fail "§3.1 operator GET :id/invitations 应 200 + 数组（实得 HTTP $RESP_CODE: $(printf '%s' "$RESP_BODY" | head -c 120)）"
        fi

        # 3.2 非成员 → 403（本卡修复点）
        req GET "$API_BASE/organizations/$ROOT_ORG/invitations" "$NM_TOKEN" -
        if [ "$RESP_CODE" = "403" ]; then
          pass "§3.2 非成员 GET :id/invitations → 403（修复前为 200 裸数据）"
        else
          fail "§3.2 非成员 GET :id/invitations 应 403（实得 HTTP $RESP_CODE）"
        fi

        # 3.3 非成员 → 审计亦 403
        req GET "$API_BASE/organizations/$ROOT_ORG/audit" "$NM_TOKEN" -
        if [ "$RESP_CODE" = "403" ]; then pass "§3.3 非成员 GET :id/audit → 403"; else fail "§3.3 非成员 GET :id/audit 应 403（实得 HTTP $RESP_CODE）"; fi

        # 3.4 审计分页 + 筛选 + 坏参
        req GET "$API_BASE/organizations/$ROOT_ORG/audit?limit=50&offset=0" "$OP_TOKEN" -
        TOTAL="$(jbody .total)"
        if [ "$RESP_CODE" = "200" ] && [ -n "$TOTAL" ] && [ "$TOTAL" != "null" ]; then
          pass "§3.4a operator GET :id/audit → 200，total=$TOTAL（分页元数据）"
        else
          fail "§3.4a operator GET :id/audit 应 200 + total（实得 HTTP $RESP_CODE）"
        fi

        # 数据不足 2 条时，经既有业务写（建/撤邀请）补 2 条审计，使「第二页」可观测
        if [ "${TOTAL:-0}" -lt 2 ]; then
          req POST "$API_BASE/organizations/$ROOT_ORG/invitations" "$OP_TOKEN" \
            "$(jq -nc --arg e "p2t10-verify-${TS}@example.com" '{email:$e,message:"T10 分页验收造数"}')"
          INV_ID="$(jbody .id)"
          if [ "$RESP_CODE" = "201" ] && [ -n "$INV_ID" ] && [ "$INV_ID" != "null" ]; then
            req DELETE "$API_BASE/organizations/$ROOT_ORG/invitations/$INV_ID" "$OP_TOKEN" -
            pass "§3.4b 造审计数据：invitation.create + invitation.cancel（2 条）"
          else
            fail "§3.4b 造审计数据失败（HTTP $RESP_CODE）"
          fi
        fi

        req GET "$API_BASE/organizations/$ROOT_ORG/audit?limit=1&offset=0" "$OP_TOKEN" -
        P1_ID="$(jbody '.rows[0].id')"
        P1_TOTAL="$(jbody .total)"
        req GET "$API_BASE/organizations/$ROOT_ORG/audit?limit=1&offset=1" "$OP_TOKEN" -
        P2_ID="$(jbody '.rows[0].id')"
        if [ -n "$P1_ID" ] && [ "$P1_ID" != "null" ] && [ -n "$P2_ID" ] && [ "$P2_ID" != "null" ] && [ "$P1_ID" != "$P2_ID" ]; then
          pass "§3.4c 审计分页：offset=0 与 offset=1 取到不同行（total=$P1_TOTAL，确有第二页）"
        else
          fail "§3.4c 审计分页应取到两页不同行（p1=$P1_ID p2=$P2_ID total=$P1_TOTAL）"
        fi

        req GET "$API_BASE/organizations/$ROOT_ORG/audit?action=invitation.create" "$OP_TOKEN" -
        OTHER_ACTIONS="$(printf '%s' "$RESP_BODY" | jq -r '[.rows[]|select(.action!="invitation.create")]|length' 2>/dev/null)"
        if [ "$RESP_CODE" = "200" ] && [ "${OTHER_ACTIONS:-1}" = "0" ] && [ "$(jbody .total)" != "0" ]; then
          pass "§3.4d 审计筛选：?action=invitation.create 仅返回该动作（$(jbody .total) 条）"
        else
          fail "§3.4d 审计筛选 action 未生效（HTTP $RESP_CODE，异动作行数=$OTHER_ACTIONS）"
        fi

        req GET "$API_BASE/organizations/$ROOT_ORG/audit?actorId=not-a-uuid" "$OP_TOKEN" -
        [ "$RESP_CODE" = "400" ] && pass "§3.4e 非法 actorId → 400（fail-fast，不 500）" || fail "§3.4e 非法 actorId 应 400（实得 $RESP_CODE）"
        req GET "$API_BASE/organizations/$ROOT_ORG/audit?from=%E6%98%A8%E5%A4%A9" "$OP_TOKEN" -
        [ "$RESP_CODE" = "400" ] && pass "§3.4f 非法 from → 400（fail-fast，不 500）" || fail "§3.4f 非法 from 应 400（实得 $RESP_CODE）"

        # 3.5 回归：成员清单 + 建/删组织
        req GET "$API_BASE/organizations/$ROOT_ORG/members" "$OP_TOKEN" -
        [ "$RESP_CODE" = "200" ] && pass "§3.5a 回归：GET :id/members → 200（门禁未波及既有端点）" || fail "§3.5a GET :id/members 应 200（实得 $RESP_CODE）"

        req POST "$API_BASE/organizations" "$OP_TOKEN" \
          "$(jq -nc --arg n "P2T10 验收子组织 $TS" --arg p "$ROOT_ORG" '{name:$n,type:"other",parent_id:$p}')"
        CHILD_ID="$(jbody .id)"
        if [ "$RESP_CODE" = "201" ] && [ -n "$CHILD_ID" ] && [ "$CHILD_ID" != "null" ]; then
          pass "§3.5b 回归：POST /organizations（子组织）→ 201"
          req DELETE "$API_BASE/organizations/$CHILD_ID" "$OP_TOKEN" -
          case "$RESP_CODE" in 2??) pass "§3.5c 清场：DELETE 子组织 → $RESP_CODE" ;; *) fail "§3.5c 清场 DELETE 应 2xx（实得 $RESP_CODE）" ;; esac
        else
          fail "§3.5b POST /organizations 应 201（实得 HTTP $RESP_CODE: $(printf '%s' "$RESP_BODY" | head -c 120)）"
        fi
      fi
    fi
  fi
fi

# ---------------------------------------------------------------------------
echo
if [ "$FAIL" -eq 0 ]; then
  echo "PASS=$PASS FAIL=0 VERIFY_EXIT=0"
  exit 0
else
  echo "PASS=$PASS FAIL=$FAIL VERIFY_EXIT=1"
  exit 1
fi
