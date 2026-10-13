#!/usr/bin/env bash
# ============================================================================
# P4-B 验收：维度治理 UI 补全（新建节点 + 审计流水查看）
#
# 结构：
#   §1 tsc / jest       —— tsc 0 err；taxonomy 模块 spec 全绿；全量 jest 不回归（基线 40 suites/572 tests，本卡后 ≥584）
#   §2 离线服务层断言   —— ts-node 直驱 TaxonomyService + 记录型假库（独立复核 §1，不依赖任何服务在跑）：
#                          2.1 region：父级 intermediate → 新建 country；锚点 node_id=code、level 由父级推导
#                          2.2 industry：父级 system → 新建 section；section 列取编码
#                          2.3 审计：op=create / source=manual（可透传 ai_command）/ before={} / target_id=编码 / actor_id=操作者
#                          2.4 粒度外（region 父级 province、industry 父级 section）→ 400，且不落库不写审计
#                          2.5 空值/缺字段/编码非法 → 400，且校验先于任何 SQL（fail-fast）
#                          2.6 父级不存在 → 404；编码重复 → 409（预检不带 status 过滤：已归档编码也占位）
#                          2.7 并发兜底：PG 23505 → 409（不冒 500）
#   §3 活体端到端 HTTP  —— api 可达时执行（operator=testuser；一次性非 operator 现场注册）：
#                          3.1 匿名 POST → 401（未入白名单）        3.2 非 operator POST → 403
#                          3.3 operator 新建 industry section → 201 + level/parentId 正确
#                          3.4 operator 新建 region province → 201
#                          3.5 编码重复 → 409                    3.6 父级不存在 → 404
#                          3.7 粒度外 → 400                      3.8 缺 name → 400
#                          3.9 GET :name/changes 出现 op=create 行（source=manual、actor_id 为操作者 UUID）
#                          3.10 回归：GET tree/children/search 仍 200；PUT/PATCH 既有治理端点仍 403（非 operator）
#                          不可达 → 该段 SKIP，不计数（§1/§2 已独立覆盖行为）
#   §4 真实浏览器 UI    —— playwright-core + chromium（有则跑；无则 SKIP）打开 https://localhost/explore/：
#                          4.1 operator 治理按钮 6 枚且含「＋ 新建」「▤ 审计」（沿用 probeOperator 显隐）
#                          4.2 非 operator：治理按钮 0 枚
#                          4.3 审计面板列出 changes 流水（op/target/source/时间/差异），pageerror=0
#                          4.4 新建弹窗：字段齐、空值前端拦截、取消可关
#                          4.5 弹窗全流程提交 → 201 提示「已创建」→ 刷新后 API 可查到该节点
#                          4.6 参考 UI 未坏：?dim=region 地图 path / ?dim=industry treemap rect+树行 均正常，pageerror=0
#   §5 静态契约         —— 参考文件零改动（git status）；index.html 含两个新入口；controller 不读 req.auth.roles；无新增迁移
#
# 依赖：services/api 已 npm install（tsc/jest/ts-node）；§3/§4 另需 api+auth-center+nginx 在跑。
# ⚠️ §3 校验的是「运行实例」的代码：容器须含本卡端点 —— docker compose … build api && up -d api
# 造数卫生：§3/§4 新建的 region/industry 节点与其审计行在退出时（含失败路径）真删，DB 复原。
# 凭据：仅 dev 测试账号（TEST_IDENTIFIER/TEST_PASSWORD 可覆盖），脚本不落任何密钥。
# 用法： bash .agents/claude/outputs/p4-b-verify.sh
# 通过： 末尾打印「PASS=<n> FAIL=0 VERIFY_EXIT=0」
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_DIR="$ROOT_DIR/services/api"
EXPLORER="$ROOT_DIR/apps/explorer/index.html"

API_BASE="${API_BASE:-https://localhost/api}"
AUTH_BASE="${AUTH_BASE:-https://localhost/auth}"
WEB_BASE="${WEB_BASE:-https://localhost/explore/}"
HEALTH="${HEALTH:-https://localhost/health}"
PG_CONTAINER="${PG_CONTAINER:-gri-postgres}"

OP_IDENTIFIER="${TEST_IDENTIFIER:-testuser}"
OP_PASSWORD="${TEST_PASSWORD:-test1234}"

TS="$(date +%s)"
SUF="$(printf '%s' "$TS" | tail -c 7)"
# 造数编码（退出时清理）：region 数字编码 / industry 字母+数字编码
RC="99$(printf '%s' "$TS" | tail -c 6)"
IC="ZQ$SUF"
IC_UI="ZP$SUF"

PASS=0
FAIL=0
LIVE=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }

json_field() { # json_field <field>  (stdin = jest 报告 JSON)
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s)["'"$1"'"]||0)}catch(e){console.log(0)}})'
}
# jest 报告经 --outputFile 落盘再读：直接捕获 stdout 会被测试内的 console/Nest 日志污染（JSON.parse 崩）。
JEST_REPORT="$API_DIR/.p4b-jest.tmp.json"

# ---------------------------------------------------------------------------
# 造数清理：无论成败都执行（§3/§4 各建 1~3 个节点）
cleanup_db() {
  [ "$LIVE" = "1" ] || return 0
  if ! docker exec "$PG_CONTAINER" psql -U postgres -d gri -tAc 'SELECT 1' >/dev/null 2>&1; then
    echo "WARN  无法访问 $PG_CONTAINER → 跳过造数清理（请手动删除 region:$RC / industry:$IC,$IC_UI 及其审计行）"
    return 0
  fi
  docker exec "$PG_CONTAINER" psql -U postgres -d gri -q -c \
    "DELETE FROM ontology.dimension_change_log
      WHERE (dimension='industry' AND target_id IN ('$IC','$IC_UI'))
         OR (dimension='region' AND target_id='$RC');" >/dev/null 2>&1
  docker exec "$PG_CONTAINER" psql -U postgres -d gri -q -c \
    "DELETE FROM ontology.industry WHERE code IN ('$IC','$IC_UI');
     DELETE FROM ontology.region WHERE node_id='$RC';" >/dev/null 2>&1
}
trap cleanup_db EXIT

# ---------------------------------------------------------------------------
echo "== §1. tsc / jest =="
if (cd "$API_DIR" && npx tsc --noEmit -p tsconfig.json >/dev/null 2>&1); then
  pass "tsc --noEmit 0 err"
else
  fail "tsc --noEmit 有编译错误"
fi

TAXO_JSON="$( (cd "$API_DIR" && npx jest src/modules/taxonomy src/auth/public-routes --json --outputFile="$JEST_REPORT" >/dev/null 2>&1) ; cat "$JEST_REPORT" 2>/dev/null)"
TT_PASS="$(printf '%s' "$TAXO_JSON" | json_field numPassedTests)"
TT_FAIL="$(printf '%s' "$TAXO_JSON" | json_field numFailedTests)"
if [ "${TT_FAIL:-0}" -eq 0 ] && [ "${TT_PASS:-0}" -ge 42 ]; then
  pass "jest 本卡面：${TT_PASS} passed / 0 failed（taxonomy 4 + public-routes，含本卡新增 12 例）"
else
  fail "jest 本卡面：${TT_PASS:-0} passed / ${TT_FAIL:-0} failed（期望 0 failed 且 ≥42 passed）"
fi

FULL_JSON="$( (cd "$API_DIR" && npx jest --json --outputFile="$JEST_REPORT" >/dev/null 2>&1) ; cat "$JEST_REPORT" 2>/dev/null)"
rm -f "$JEST_REPORT"
FT_PASS="$(printf '%s' "$FULL_JSON" | json_field numPassedTests)"
FT_FAIL="$(printf '%s' "$FULL_JSON" | json_field numFailedTests)"
FT_SUITES="$(printf '%s' "$FULL_JSON" | json_field numTotalTestSuites)"
if [ "${FT_FAIL:-0}" -eq 0 ] && [ "${FT_PASS:-0}" -ge 584 ]; then
  pass "jest 全量：${FT_SUITES} suites / ${FT_PASS} tests 全绿（基线 572，本卡 +12，零回归）"
else
  fail "jest 全量：${FT_PASS:-0} passed / ${FT_FAIL:-0} failed（期望 0 failed 且 ≥584 passed）"
fi

# ---------------------------------------------------------------------------
echo "== §2. 离线服务层断言（ts-node 直驱 TaxonomyService + 记录型假库）=="
HARNESS="$API_DIR/.p4b-verify.tmp.ts"
cat > "$HARNESS" <<'TS'
import { TaxonomyService } from './src/modules/taxonomy/taxonomy.service';

let pass = 0;
let fail = 0;
const ok = (cond: boolean, desc: string): void => {
  if (cond) { pass += 1; console.log('PASS  ' + desc); }
  else { fail += 1; console.log('FAIL  ' + desc); }
};

type Call = { sql: string; params?: unknown[] };
type Step = unknown[] | Error;

/** 记录型假库：按序吐出预置结果；超出预置即回空行（用于发现「多余查询」）。 */
function mkdb(steps: Step[]): { svc: TaxonomyService; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const query = async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    const step = steps[i++];
    if (step instanceof Error) throw step;
    return { rows: (step as unknown[]) ?? [] };
  };
  const svc = new TaxonomyService({ query } as unknown as ConstructorParameters<typeof TaxonomyService>[0]);
  return { svc, calls };
}

const REGION_INTERMEDIATE = {
  id: '9000030', code: '030', name: '东亚', short: null, english: null, level: 'intermediate',
  iso2: null, iso3: null, center: null, parent_id: '9000020', has_children: true, child_count: 4,
};
const REGION_COUNTRY = {
  id: '100000', code: '156', name: '中国', short: '中国', english: 'China', level: 'country',
  iso2: 'CN', iso3: 'CHN', center: null, parent_id: '9000030', has_children: true, child_count: 34,
};
const REGION_PROVINCE = { ...REGION_COUNTRY, id: '110000', code: '110000', name: '北京市', level: 'province' };
const REGION_CREATED = { ...REGION_COUNTRY, id: '9999001', code: '9999001', name: '验收国', level: 'country', parent_id: '9000030', has_children: false, child_count: 0 };
const INDUSTRY_SYSTEM = {
  id: 'ISIC Rev.5', code: 'ISIC Rev.5', name: '国际标准产业分类', short: null, english: 'ISIC Rev.5',
  level: 'system', parent_id: 'UN', section: null, intro: null, includes: null, also: null,
  excludes: null, refs: null, updated: null, has_children: true, child_count: 22,
};
const INDUSTRY_SECTION_PARENT = { ...INDUSTRY_SYSTEM, id: 'A', code: 'A', name: '农业、林业及渔业', level: 'section', parent_id: 'ISIC Rev.5', section: 'A' };
const INDUSTRY_CREATED = { ...INDUSTRY_SYSTEM, id: 'ZQ', code: 'ZQ', name: '验收门类', level: 'section', parent_id: 'ISIC Rev.5', section: 'ZQ', has_children: false, child_count: 0 };

const is400 = (p: Promise<unknown>) => p.then(() => false, (e: Error) => e.constructor.name === 'BadRequestException');
const is404 = (p: Promise<unknown>) => p.then(() => false, (e: Error) => e.constructor.name === 'NotFoundException');
const is409 = (p: Promise<unknown>) => p.then(() => false, (e: Error) => e.constructor.name === 'ConflictException');
const insertCall = (calls: Call[]) => calls.find((c) => /^INSERT INTO ontology\.(region|industry)/.test(c.sql.trim()));
const auditCall = (calls: Call[]) => calls.find((c) => c.sql.includes('ontology.dimension_change_log'));

async function main(): Promise<void> {
  // --- 2.1 region：父级 intermediate → country ---
  {
    const { svc, calls } = mkdb([[REGION_INTERMEDIATE], [], [], [REGION_CREATED]]);
    const node = await svc.createNode('region', { code: '9999001', name: '验收国', parentId: '9000030' }, 'actor-1') as { level?: string; parentId?: string; id?: string };
    ok(node.level === 'country' && node.id === '9999001', 'region：level 由父级推导（intermediate → country）');
    const ins = insertCall(calls);
    ok(ins?.sql.includes('INSERT INTO ontology.region') === true, 'region：写 ontology.region');
    ok(ins?.sql.includes('(SELECT id FROM ontology.region WHERE node_id = $5)') === true, 'region：parent_id 经 node_id 子查询解析（父级不存在即落空）');
    ok(JSON.stringify(ins?.params) === JSON.stringify(['9999001', '验收国', null, 'country', '9000030']),
      'region：bind 参数 = [编码, 名称, 简称, 推导层级, 父级编码]（锚点 node_id=code=编码）');
  }

  // --- 2.2 industry：父级 system → section ---
  {
    const { svc, calls } = mkdb([[INDUSTRY_SYSTEM], [], [], [INDUSTRY_CREATED]]);
    const node = await svc.createNode('industry', { code: 'ZQ', name: '验收门类', short: '验收', parentId: 'ISIC Rev.5' }, 'actor-1') as { level?: string };
    ok(node.level === 'section', 'industry：level 由父级推导（system → section）');
    const ins = insertCall(calls);
    ok(ins?.sql.includes('INSERT INTO ontology.industry') === true, 'industry：写 ontology.industry');
    ok(JSON.stringify(ins?.params) === JSON.stringify(['ZQ', '验收门类', '验收', 'section', 'ISIC Rev.5']),
      'industry：bind 参数 = [编码, 名称, 简称, 推导层级, 父级编码]（section 列取编码）');
  }

  // --- 2.3 审计 ---
  {
    const { svc, calls } = mkdb([[REGION_INTERMEDIATE], [], [], [REGION_CREATED]]);
    await svc.createNode('region', { code: '9999001', name: '验收国', parentId: '9000030' }, 'actor-1');
    const au = auditCall(calls);
    const p = (au?.params ?? []) as unknown[];
    ok(au?.sql.includes("'create'") === true && au?.sql.includes('before') === true,
      '审计：写 dimension_change_log，op 硬编码 create（不可被请求体覆盖）');
    ok(p[0] === 'region' && p[1] === '9999001', '审计：dimension/target_id = 维度/新节点编码');
    ok(p[2] === '{}', '审计：before = {}（新建无前态）');
    ok(typeof p[3] === 'string' && (JSON.parse(String(p[3])) as { id?: string }).id === '9999001',
      '审计：after = 新建节点全量（可回溯落库结果）');
    ok(p[4] === 'actor-1' && p[5] === 'manual', '审计：actor_id = 操作者、source 默认 manual');
  }
  {
    const { svc, calls } = mkdb([[INDUSTRY_SYSTEM], [], [], [INDUSTRY_CREATED]]);
    await svc.createNode('industry', { code: 'ZQ', name: '验收门类', parentId: 'ISIC Rev.5' }, 'actor-1', 'ai_command');
    ok(((auditCall(calls)?.params ?? []) as unknown[])[5] === 'ai_command',
      '审计：source 可透传（为后续 AI 命令接线留位）');
  }

  // --- 2.4 粒度外 ---
  {
    const { svc, calls } = mkdb([[REGION_PROVINCE]]);
    ok(await is400(svc.createNode('region', { code: '9999002', name: '越界', parentId: '110000' }, 'actor-1')),
      '粒度外：region 父级 province（其子级为 admin1）→ 400');
    ok(!insertCall(calls) && !auditCall(calls), '粒度外：不落库、不写审计（拒绝先于写）');
  }
  {
    const { svc, calls } = mkdb([[INDUSTRY_SECTION_PARENT]]);
    ok(await is400(svc.createNode('industry', { code: 'ZR', name: '越界', parentId: 'A' }, 'actor-1')),
      '粒度外：industry 父级 section（其子级为 division）→ 400');
    ok(!insertCall(calls), '粒度外：industry 不落库');
  }

  // --- 2.5 空值/非法（fail-fast，零 SQL）---
  {
    const { svc, calls } = mkdb([]);
    const bodies: Array<[string, Record<string, unknown>]> = [
      ['缺 name', { code: '9999003', parentId: '9000030' }],
      ['缺 code', { name: '验收国', parentId: '9000030' }],
      ['缺 parentId', { code: '9999003', name: '验收国' }],
      ['parentId 空白', { code: '9999003', name: '验收国', parentId: '   ' }],
      ['空对象', {}],
      ['region 编码非数字', { code: 'ABC', name: '验收国', parentId: '9000030' }],
    ];
    let all400 = true;
    for (const [, body] of bodies) {
      if (!(await is400(svc.createNode('region', body, 'actor-1')))) all400 = false;
    }
    ok(all400, '空值/非法：缺字段、空白父级、region 非数字编码 → 一律 400');
    ok(calls.length === 0, '空值/非法：校验先于任何 SQL（坏值不进 PG）');
  }

  // --- 2.6 父级 404 / 编码 409 ---
  {
    const { svc, calls } = mkdb([[]]);
    ok(await is404(svc.createNode('region', { code: '9999004', name: '验收国', parentId: '888888' }, 'actor-1')),
      '父级不存在 → 404');
    ok(!insertCall(calls), '父级 404：不落库');
  }
  {
    const { svc, calls } = mkdb([[REGION_INTERMEDIATE], [{ '?column?': 1 }]]);
    ok(await is409(svc.createNode('region', { code: '9999001', name: '重复', parentId: '9000030' }, 'actor-1')),
      '编码重复 → 409');
    const pre = calls[1];
    ok(pre?.sql.includes('FROM ontology.region WHERE node_id = $1') === true && !pre?.sql.includes('status'),
      '编码查重：预检不带 status 过滤（已归档节点占用的编码同样 409，不撞唯一约束 500）');
    ok(!insertCall(calls), '编码 409：不落库、不写审计');
  }
  {
    const conflict = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
    const { svc, calls } = mkdb([[REGION_INTERMEDIATE], [], conflict]);
    ok(await is409(svc.createNode('region', { code: '9999005', name: '并发', parentId: '9000030' }, 'actor-1')),
      '并发兜底：PG 23505 → 409（不冒 500）');
    ok(!auditCall(calls), '并发兜底：冲突时零审计写入');
  }
  {
    const boom = new Error('connection terminated');
    const { svc } = mkdb([[REGION_INTERMEDIATE], [], boom]);
    const other = await svc.createNode('region', { code: '9999006', name: '故障', parentId: '9000030' }, 'actor-1')
      .then(() => false, (e: Error) => e.constructor.name === 'Error' && e.message === 'connection terminated');
    ok(other, '非唯一约束错误不吞：原样上抛（不误报 409）');
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
  .p4b-verify.tmp.ts 2>&1)"
HARNESS_RC=$?
rm -f "$HARNESS"

printf '%s\n' "$HARNESS_OUT" | grep -E '^(PASS|FAIL) ' || true
HP="$(printf '%s\n' "$HARNESS_OUT" | grep -cE '^PASS ' || true)"
HF="$(printf '%s\n' "$HARNESS_OUT" | grep -cE '^FAIL ' || true)"
PASS=$((PASS + ${HP:-0}))
FAIL=$((FAIL + ${HF:-0}))
[ "$HARNESS_RC" -eq 0 ] || fail "ts-node harness exited rc=$HARNESS_RC（stderr 摘要：$(printf '%s' "$HARNESS_OUT" | grep -vE '^(PASS|FAIL) ' | tail -n1 | head -c 160)）"

# ---------------------------------------------------------------------------
echo "== §3. 活体端到端 HTTP（operator=根 owner / 一次性非 operator）=="

RESP_CODE=""
RESP_BODY=""
req() { # req <method> <url> <token|-> <body|->
  local method="$1" url="$2" token="$3" data="$4"
  local args=(-sk -m 20 -w $'\n%{http_code}' -X "$method" "$url" -H 'Content-Type: application/json')
  [ "$token" != "-" ] && args+=(-H "Authorization: Bearer $token")
  [ "$data" != "-" ] && args+=(-d "$data")
  local out
  out="$(curl "${args[@]}" 2>/dev/null)"
  RESP_CODE="$(printf '%s' "$out" | tail -n1)"
  RESP_BODY="$(printf '%s' "$out" | sed '$d')"
}
jbody() { printf '%s' "$RESP_BODY" | jq -r "$1" 2>/dev/null; }

if ! curl -sk -m 5 -o /dev/null "$HEALTH" 2>/dev/null; then
  echo "SKIP  api($HEALTH) 未就绪 → 跳过 §3（不计分）"
  echo "      恢复： docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d api"
else
  LIVE=1
  req POST "$AUTH_BASE/login" - "$(jq -nc --arg i "$OP_IDENTIFIER" --arg p "$OP_PASSWORD" '{identifier:$i,password:$p}')"
  OP_TOKEN="$(jbody .accessToken)"
  if [ -z "$OP_TOKEN" ] || [ "$OP_TOKEN" = "null" ]; then
    fail "§3 前置：operator($OP_IDENTIFIER) 登录失败（HTTP $RESP_CODE）"
  else
    pass "§3 前置：operator 登录成功（根组织 owner）"

    NU="p4b_$TS"
    req POST "$API_BASE/auth/register" - \
      "$(jq -nc --arg u "$NU" --arg e "${NU}@example.com" --arg p 'password123' '{username:$u,email:$e,password:$p,name:"P4B验收"}')"
    REG_CODE="$RESP_CODE"
    req POST "$AUTH_BASE/login" - "$(jq -nc --arg i "${NU}@example.com" --arg p 'password123' '{identifier:$i,password:$p}')"
    NM_TOKEN="$(jbody .accessToken)"
    if [ "$REG_CODE" = "201" ] && [ -n "$NM_TOKEN" ] && [ "$NM_TOKEN" != "null" ]; then
      pass "§3 前置：一次性非 operator 已就绪（$NU，注册 201 且登录成功、不属任何组织）"
    else
      fail "§3 前置：非 operator 注册/登录失败（register HTTP $REG_CODE）"
    fi

    IND_BODY="$(jq -nc --arg c "$IC" --arg p 'ISIC Rev.5' '{code:$c,name:"P4B验收门类",short:"验收",parentId:$p}')"
    REG_BODY="$(jq -nc --arg c "$RC" --arg p '100000' '{code:$c,name:"P4B验收省",parentId:$p}')"

    # 3.1 匿名 → 401
    req POST "$API_BASE/taxonomy/industry/node" - "$IND_BODY"
    [ "$RESP_CODE" = "401" ] && pass "§3.1 匿名 POST :name/node → 401（写端点未进公开白名单）" \
      || fail "§3.1 匿名 POST 应 401（实得 $RESP_CODE）"

    # 3.2 非 operator → 403
    if [ -n "${NM_TOKEN:-}" ] && [ "$NM_TOKEN" != "null" ]; then
      req POST "$API_BASE/taxonomy/industry/node" "$NM_TOKEN" "$IND_BODY"
      [ "$RESP_CODE" = "403" ] && pass "§3.2 非 operator POST → 403（门禁 assertSiteOperator 生效）" \
        || fail "§3.2 非 operator POST 应 403（实得 $RESP_CODE）"
    fi

    # 3.3 operator 新建 industry section → 201
    req POST "$API_BASE/taxonomy/industry/node" "$OP_TOKEN" "$IND_BODY"
    if [ "$RESP_CODE" = "201" ] && [ "$(jbody .id)" = "$IC" ] && [ "$(jbody .level)" = "section" ] \
       && [ "$(jbody .parentId)" = "ISIC Rev.5" ]; then
      pass "§3.3 operator 新建 industry → 201（id=$IC、level=section、parentId=ISIC Rev.5）"
    else
      fail "§3.3 operator 新建 industry 应 201 + level=section（实得 HTTP $RESP_CODE: $(printf '%s' "$RESP_BODY" | head -c 140)）"
    fi

    # 3.4 operator 新建 region province → 201
    req POST "$API_BASE/taxonomy/region/node" "$OP_TOKEN" "$REG_BODY"
    if [ "$RESP_CODE" = "201" ] && [ "$(jbody .id)" = "$RC" ] && [ "$(jbody .level)" = "province" ]; then
      pass "§3.4 operator 新建 region → 201（id=$RC、level=province ← 父级 country 100000）"
    else
      fail "§3.4 operator 新建 region 应 201 + level=province（实得 HTTP $RESP_CODE: $(printf '%s' "$RESP_BODY" | head -c 140)）"
    fi

    # 3.5 编码重复 → 409
    req POST "$API_BASE/taxonomy/industry/node" "$OP_TOKEN" "$IND_BODY"
    [ "$RESP_CODE" = "409" ] && pass "§3.5 重复编码 → 409" || fail "§3.5 重复编码应 409（实得 $RESP_CODE）"

    # 3.6 父级不存在 → 404
    req POST "$API_BASE/taxonomy/industry/node" "$OP_TOKEN" \
      "$(jq -nc --arg c "${IC}X" '{code:$c,name:"无父",parentId:"NOPE.NOPE"}')"
    [ "$RESP_CODE" = "404" ] && pass "§3.6 父级不存在 → 404" || fail "§3.6 父级不存在应 404（实得 $RESP_CODE）"

    # 3.7 粒度外 → 400
    req POST "$API_BASE/taxonomy/industry/node" "$OP_TOKEN" \
      "$(jq -nc --arg c "${IC}Y" '{code:$c,name:"越界",parentId:"A"}')"
    [ "$RESP_CODE" = "400" ] && pass "§3.7 粒度外（父级 section）→ 400" || fail "§3.7 粒度外应 400（实得 $RESP_CODE）"

    # 3.8 缺 name → 400
    req POST "$API_BASE/taxonomy/industry/node" "$OP_TOKEN" \
      "$(jq -nc --arg c "${IC}Z" '{code:$c,parentId:"ISIC Rev.5"}')"
    [ "$RESP_CODE" = "400" ] && pass "§3.8 缺 name → 400" || fail "§3.8 缺 name 应 400（实得 $RESP_CODE）"

    # 3.9 审计流水含 create 行
    req GET "$API_BASE/taxonomy/industry/changes?limit=20" "$OP_TOKEN" -
    if [ "$RESP_CODE" = "200" ]; then
      ROW="$(printf '%s' "$RESP_BODY" | jq -c --arg c "$IC" '[.[]|select(.target_id==$c)][0] // empty' 2>/dev/null)"
      if [ -n "$ROW" ] \
         && [ "$(printf '%s' "$ROW" | jq -r .op)" = "create" ] \
         && [ "$(printf '%s' "$ROW" | jq -r .source)" = "manual" ] \
         && printf '%s' "$(printf '%s' "$ROW" | jq -r .actor_id)" | grep -qE '^[0-9a-f-]{36}$' \
         && [ "$(printf '%s' "$ROW" | jq -r '.after.id')" = "$IC" ]; then
        pass "§3.9 GET :name/changes 出现 create 流（source=manual、actor_id=操作者 UUID、after 可回溯）"
      else
        fail "§3.9 changes 未列出 create 流（row=$(printf '%s' "$ROW" | head -c 160)）"
      fi
    else
      fail "§3.9 GET :name/changes 应 200（实得 $RESP_CODE）"
    fi

    # 3.10 回归：既有读端点与既有治理端点门禁不变
    req GET "$API_BASE/taxonomy/region/tree" - -
    [ "$RESP_CODE" = "200" ] && pass "§3.10a 回归：GET region/tree → 200（游客可读，参考 UI 数据面未变）" \
      || fail "§3.10a GET region/tree 应 200（实得 $RESP_CODE）"
    req GET "$API_BASE/taxonomy/industry/search?q=%E5%86%9C%E4%B8%9A&limit=2" - -
    [ "$RESP_CODE" = "200" ] && pass "§3.10b 回归：GET industry/search → 200（中文 query 需百分号编码，裸 UTF-8 会被 nginx 判 400）" \
      || fail "§3.10b 应 200（实得 $RESP_CODE）"
    if [ -n "${NM_TOKEN:-}" ] && [ "$NM_TOKEN" != "null" ]; then
      req PATCH "$API_BASE/taxonomy/industry/node/A" "$NM_TOKEN" '{"name":"越权改名"}'
      [ "$RESP_CODE" = "403" ] && pass "§3.10c 回归：非 operator PATCH node/:id → 403（既有治理端点门禁未松动）" \
        || fail "§3.10c 非 operator PATCH 应 403（实得 $RESP_CODE）"
    fi
  fi
fi

# ---------------------------------------------------------------------------
echo "== §4. 真实浏览器 UI（playwright-core，可缺则 SKIP）=="
# 注：临时脚本后缀须 .cjs —— 仓库根 package.json 是 "type":"module"，.js 会被当 ESM（require 不可用）。
UI_JS="$ROOT_DIR/.p4b-ui.tmp.cjs"
cat > "$UI_JS" <<'JS'
const path = require('path');
function loadPw() {
  const cands = ['playwright-core', 'playwright',
    path.join(process.env.HOME || '', 'openclaw/node_modules/playwright-core'),
    path.join(process.env.HOME || '', '.hermes/hermes-agent/node_modules/playwright-core')];
  for (const c of cands) { try { return require(c); } catch (e) { /* next */ } }
  return null;
}
const pw = loadPw();
if (!pw) { console.log('SKIP  playwright-core 不可用 → 跳过 §4（不计分）'); process.exit(3); }

const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });
const WEB = process.env.WEB_BASE;
const API_BASE = process.env.API_BASE;
const AUTH_BASE = process.env.AUTH_BASE;
const IC = process.env.IC;
const IC_UI = process.env.IC_UI;
let pass = 0, fail = 0;
const ok = (c, d) => { if (c) { pass++; console.log('PASS  ' + d); } else { fail++; console.log('FAIL  ' + d); } };

function rq(method, base, p, body, token) {
  return new Promise((res, rej) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {};
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    if (token) headers.Authorization = 'Bearer ' + token;
    const u = new URL(base + p);
    const req = https.request({ host: u.hostname, port: u.port || 443, path: u.pathname + u.search, method, headers, agent },
      (r) => { let s = ''; r.on('data', (d) => s += d); r.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) {} res({ status: r.statusCode, body: j, raw: s }); }); });
    req.on('error', rej); if (data) req.write(data); req.end();
  });
}

(async () => {
  const op = await rq('POST', AUTH_BASE, '/login', { identifier: process.env.OP_IDENTIFIER, password: process.env.OP_PASSWORD });
  const opTok = op.body && op.body.accessToken;
  if (!opTok) { console.log('FAIL  §4 前置：operator 登录失败（HTTP ' + op.status + '）'); fail++; return done(); }
  const nu = 'p4bui' + String(Date.now()).slice(-8);
  await rq('POST', API_BASE, '/auth/register', { username: nu, email: nu + '@example.com', password: 'password123', name: 'P4B UI' });
  const login = await rq('POST', AUTH_BASE, '/login', { identifier: nu + '@example.com', password: 'password123' });
  const nmTok = login.body && login.body.accessToken;

  const b = await pw.chromium.launch({ headless: true });
  const open = async (url, tok) => {
    const p = await b.newPage({ ignoreHTTPSErrors: true });
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e.message)));
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    if (tok) {
      await p.evaluate((t) => localStorage.setItem('gri-auth-token', JSON.stringify(t)), { accessToken: tok, user: { name: 'verify' } });
      await p.reload({ waitUntil: 'domcontentloaded' });
    }
    await p.waitForTimeout(3500);
    return { p, errs };
  };

  // 4.1 / 4.6a operator + region 地图
  let { p, errs } = await open(WEB + '?dim=region', opTok);
  const gov = await p.locator('.gri-sso .gov button').count();
  const labels = (await p.locator('.gri-sso .gov button').allTextContents()).join('|');
  ok(gov === 6 && labels.includes('新建') && labels.includes('审计'),
    '§4.1 operator：治理按钮 6 枚且含「＋ 新建」「▤ 审计」（沿用 probeOperator 显隐）');
  ok((await p.locator('.region').count()) >= 5 && errs.length === 0,
    '§4.6a ?dim=region 地图渲染（.region path ≥5）且 pageerror=0');
  await p.close();

  // 4.2 非 operator
  if (nmTok) {
    ({ p, errs } = await open(WEB + '?dim=region', nmTok));
    ok((await p.locator('.gri-sso .gov button').count()) === 0,
      '§4.2 非 operator：治理按钮 0 枚（点不到、也就误触不到 403）');
    await p.close();
  }

  // 4.6b industry treemap + 4.3 审计面板
  ({ p, errs } = await open(WEB + '?dim=industry', opTok));
  const rects = await p.locator('svg rect').count();
  const rows = await p.locator('.tree-row').count();
  ok(rects > 0 && rows > 0 && errs.length === 0,
    '§4.6b ?dim=industry treemap 渲染（rect=' + rects + ' 树行=' + rows + '）且 pageerror=0');

  await p.locator('.gri-sso .gov button.audit').click();
  await p.waitForTimeout(2500);
  const auditRows = await p.locator('.gri-log').count();
  const firstRow = ((await p.locator('.gri-log').first().innerText().catch(() => '')) || '').replace(/\n/g, ' ');
  const ops = (await p.locator('.gri-log .gri-op').allTextContents()).join(',');
  const srcs = (await p.locator('.gri-log .gri-src').allTextContents()).join(',');
  const times = (await p.locator('.gri-log .gri-time').allTextContents()).join(',');
  ok(auditRows >= 1 && ops.includes('create') && srcs.includes('manual') && firstRow.includes(IC) && /[:：]\d{2}/.test(times),
    '§4.3 审计面板列出流水（' + auditRows + ' 条；op=' + ops + '；source=' + srcs + '；含本次 create ' + IC + '；时间已本地化）');
  ok(errs.length === 0, '§4.3 审计面板渲染异常 0（pageerror=0）');
  await p.locator('.gri-panel header button').click();

  // 4.4 新建弹窗
  await p.locator('.gri-sso .gov button.new').click();
  await p.waitForTimeout(500);
  const fields = await p.locator('.gri-modal input').count();
  await p.locator('.gri-modal button.gri-ok').click();
  await p.waitForTimeout(300);
  const emptyMsg = await p.locator('.gri-modal .gri-msg').innerText();
  await p.locator('.gri-modal button.gri-cancel').click();
  await p.waitForTimeout(300);
  const stillOpen = await p.locator('.gri-modal').count();
  ok(fields >= 3 && emptyMsg.includes('必填') && stillOpen === 0,
    '§4.4 新建弹窗：字段 ' + fields + ' 个、空值前端拦截（“' + emptyMsg + '”）、取消可关');

  // 4.5 弹窗全流程 → 201 → 刷新后 API 可见
  const dialogs = [];
  p.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
  await p.locator('.gri-sso .gov button.new').click();
  await p.waitForTimeout(400);
  await p.locator('.gri-modal input.gri-parent').fill('ISIC Rev.5');
  await p.locator('.gri-modal input.gri-code').fill(IC_UI);
  await p.locator('.gri-modal input.gri-name').fill('P4B UI 验收门类');
  await p.locator('.gri-modal button.gri-ok').click();
  await p.waitForTimeout(4000);
  const got = await rq('GET', API_BASE, '/taxonomy/industry/node/' + IC_UI, null, opTok);
  ok(dialogs.some((m) => m.includes('已创建')) && got.status === 200 && got.body && got.body.level === 'section',
    '§4.5 弹窗全流程：提交 → 201 提示「已创建」（' + (dialogs[dialogs.length - 1] || '').slice(0, 40) + '）→ API 查到 level=section');
  ok(errs.length === 0, '§4.5 全流程 pageerror=0');
  await p.close();
  await b.close();
  done();

  function done() { console.log('UI PASS=' + pass + ' FAIL=' + fail); process.exit(fail ? 1 : 0); }
})().catch((e) => { console.log('FAIL  §4 异常：' + (e && e.message)); console.log('UI PASS=' + pass + ' FAIL=' + (fail + 1)); process.exit(1); });
JS

if [ "$LIVE" = "1" ]; then
  UI_OUT="$(cd "$ROOT_DIR" && WEB_BASE="$WEB_BASE" API_BASE="$API_BASE" AUTH_BASE="$AUTH_BASE" \
    OP_IDENTIFIER="$OP_IDENTIFIER" OP_PASSWORD="$OP_PASSWORD" IC="$IC" IC_UI="$IC_UI" \
    timeout 600 node "$UI_JS" 2>&1)"
  UI_RC=$?
else
  UI_OUT="SKIP  api 不可达 → 跳过 §4（不计分）"
  UI_RC=3
fi
rm -f "$UI_JS"

printf '%s\n' "$UI_OUT" | grep -E '^(PASS|FAIL|SKIP) ' || true
UP="$(printf '%s\n' "$UI_OUT" | grep -cE '^PASS ' || true)"
UF="$(printf '%s\n' "$UI_OUT" | grep -cE '^FAIL ' || true)"
PASS=$((PASS + ${UP:-0}))
FAIL=$((FAIL + ${UF:-0}))
# rc≠0 本属正常（有 FAIL 即 rc=1）；只有「跑挂到没吐出结果行」才算异常（3=SKIP）
if [ "$UI_RC" -ne 3 ] && ! printf '%s' "$UI_OUT" | grep -q '^UI PASS='; then
  fail "§4 browser run 未产出结果（rc=$UI_RC；$(printf '%s' "$UI_OUT" | grep -vE '^(PASS|FAIL|SKIP) ' | tail -n1 | head -c 160)）"
fi

# ---------------------------------------------------------------------------
echo "== §5. 静态契约 =="
ROLES_HITS="$(grep -c 'auth\.roles' "$API_DIR/src/modules/taxonomy/taxonomy.controller.ts" || true)"
[ "${ROLES_HITS:-1}" -eq 0 ] && pass "N2：taxonomy.controller 零处 req.auth.roles（身份只取 externalId）" \
  || fail "N2：taxonomy.controller 出现 auth.roles（$ROLES_HITS 处）"

for anchor in "openCreate" "openAudit" "＋ 新建" "▤ 审计" "gri-modal" "gri-panel" "/changes?limit=50" "/api/taxonomy/' + dim + '/node'"; do
  if grep -qF "$anchor" "$EXPLORER"; then pass "前端入口存在：$anchor"; else fail "前端缺少入口：$anchor"; fi
done

CHANGED_REF="$(cd "$ROOT_DIR" && git status --porcelain -- apps/explorer | grep -E 'region\.html|industry\.html' || true)"
[ -z "$CHANGED_REF" ] && pass "N4：参考文件 region.html / industry.html 零改动" \
  || fail "N4：参考文件被改动 → $CHANGED_REF"

NEW_MIGRATIONS="$(cd "$ROOT_DIR" && git status --porcelain -- services/api/src/migrate | wc -l | tr -d ' ')"
[ "${NEW_MIGRATIONS:-9}" -eq 0 ] && pass "N3：无新增/改动迁移（审计复用 026 既有表）" \
  || fail "N3：迁移目录有改动（$NEW_MIGRATIONS 个文件）"

# ---------------------------------------------------------------------------
# 造数清理复核（cleanup_db 由 EXIT trap 执行；此处先显式跑一次再复核）
cleanup_db
if [ "$LIVE" = "1" ] && docker exec "$PG_CONTAINER" psql -U postgres -d gri -tAc 'SELECT 1' >/dev/null 2>&1; then
  RESIDUE="$(docker exec "$PG_CONTAINER" psql -U postgres -d gri -tAc \
    "SELECT (SELECT count(*) FROM ontology.region WHERE node_id='$RC')
          + (SELECT count(*) FROM ontology.industry WHERE code IN ('$IC','$IC_UI'));" | tr -d ' ')"
  [ "${RESIDUE:-9}" = "0" ] && pass "造数清理：验收新建的节点与审计行已真删，库复原" \
    || fail "造数清理：仍有 $RESIDUE 行残留（region:$RC / industry:$IC,$IC_UI）"
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
