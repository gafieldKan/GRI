#!/usr/bin/env bash
# P3-C1 verification: ontology taxonomy + region geometry Explorer data plane.
set -uo pipefail

ROOT="${GRI_ROOT:-/home/ubantu/GRI}"
API_BASE="${API_BASE:-http://localhost:3008/api}"
cd "$ROOT"

PASS=0
FAIL=0
SKIP=0

pass() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }
skip() { SKIP=$((SKIP + 1)); echo "  SKIP  $1"; }

assert_file() {
  local description="$1"
  local file="$2"
  if [ -f "$file" ]; then
    pass "$description"
  else
    fail "$description (missing $file)"
  fi
}

assert_contains() {
  local description="$1"
  local file="$2"
  local pattern="$3"
  if grep -Fq -- "$pattern" "$file" 2>/dev/null; then
    pass "$description"
  else
    fail "$description (missing '$pattern' in $file)"
  fi
}

assert_not_contains() {
  local description="$1"
  local file="$2"
  local pattern="$3"
  if grep -Fq -- "$pattern" "$file" 2>/dev/null; then
    fail "$description (unexpected '$pattern' in $file)"
  else
    pass "$description"
  fi
}

run_step() {
  local description="$1"
  local log="$2"
  shift 2
  if "$@" >"$log" 2>&1; then
    pass "$description"
    return 0
  fi
  fail "$description"
  tail -n 24 "$log" | sed 's/^/        /'
  return 1
}

assert_status() {
  local description="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    pass "$description (HTTP $actual)"
  else
    fail "$description (expected HTTP $expected, got $actual)"
  fi
}

assert_jq() {
  local description="$1"
  local body="$2"
  local filter="$3"
  if printf '%s' "$body" | jq -e "$filter" >/dev/null 2>&1; then
    pass "$description"
  else
    fail "$description"
  fi
}

probe() {
  local path="$1"
  local raw
  raw="$(curl -sS --max-time 30 -w '\n%{http_code}' "$API_BASE$path" 2>/dev/null)" || return 1
  HTTP_CODE="$(printf '%s' "$raw" | tail -n 1)"
  HTTP_BODY="$(printf '%s' "$raw" | sed '$d')"
}

echo "== P3-C1 verification =="

echo "== 1. static contract =="
TAXONOMY_DIR="services/api/src/modules/taxonomy"
EXPLORER="apps/explorer/index.html"

for file in taxonomy.module.ts taxonomy.controller.ts taxonomy.service.ts taxonomy.types.ts geo.controller.ts geo.service.ts geo.types.ts taxonomy.controller.spec.ts taxonomy.service.spec.ts geo.controller.spec.ts geo.service.spec.ts; do
  assert_file "taxonomy file $file exists" "$TAXONOMY_DIR/$file"
done
assert_file "Explorer index exists" "$EXPLORER"

assert_contains "AppModule imports TaxonomyModule" "services/api/src/app.module.ts" "TaxonomyModule"
assert_contains "public route allows taxonomy reads" "services/api/src/auth/public-routes.ts" "\\/taxonomy\\/"
assert_contains "public route allows geo regions" "services/api/src/auth/public-routes.ts" "\\/geo\\/regions\\/"
assert_contains "service reads ontology.region" "$TAXONOMY_DIR/taxonomy.service.ts" "ontology.region"
assert_contains "service reads ontology.industry" "$TAXONOMY_DIR/taxonomy.service.ts" "ontology.industry"
assert_contains "children queries direct parent" "$TAXONOMY_DIR/taxonomy.service.ts" "c.parent_id = p.id"
assert_contains "path query walks ancestors" "$TAXONOMY_DIR/taxonomy.service.ts" "WITH RECURSIVE"
assert_contains "geo derives from reference maps" "$TAXONOMY_DIR/geo.service.ts" "un-regions-maps.geo.json"
assert_contains "geo derives from reference world borders" "$TAXONOMY_DIR/geo.service.ts" "un-regions.geo.json"
assert_contains "Explorer consumes taxonomy API" "$EXPLORER" "/api/taxonomy/"
assert_contains "Explorer consumes geo API" "$EXPLORER" "/api/geo/regions"
assert_not_contains "Explorer no longer fetches static tree" "$EXPLORER" "./data/regions.json"
assert_not_contains "Explorer no longer fetches static industry tree" "$EXPLORER" "./data/industry.json"
assert_not_contains "Explorer no longer fetches static country slices" "$EXPLORER" "'./data/geo/'"

echo "== 2. build and test gates =="
run_step "services/api TypeScript" "/tmp/p3-c1-tsc.log" bash -lc "cd '$ROOT/services/api' && npx tsc --noEmit"
run_step "taxonomy focused Jest" "/tmp/p3-c1-focused-jest.log" bash -lc "cd '$ROOT/services/api' && npx jest src/modules/taxonomy src/auth/public-routes.spec.ts --runInBand"
run_step "services/api full Jest" "/tmp/p3-c1-full-jest.log" bash -lc "cd '$ROOT/services/api' && npx jest --runInBand"
run_step "services/api build" "/tmp/p3-c1-build.log" bash -lc "cd '$ROOT/services/api' && npm run build"

echo "== 3. live anonymous API =="
if ! command -v curl >/dev/null 2>&1; then
  skip "live API checks (curl unavailable)"
elif ! probe "/taxonomy/region/children"; then
  skip "live API checks (unreachable: $API_BASE)"
else
  assert_status "region root children" "200" "$HTTP_CODE"
  assert_jq "region root is world with direct children" "$HTTP_BODY" '.parent.id == "9999999" and .parent.level == "world" and (.children | length) == 6'

  probe "/taxonomy/region/children?parent=100000"
  assert_status "region country children" "200" "$HTTP_CODE"
  assert_jq "China children include Beijing directly" "$HTTP_BODY" '.parent.id == "100000" and any(.children[]; .id == "110000" and .parentId == "100000")'

  probe "/taxonomy/industry/children"
  assert_status "industry root children" "200" "$HTTP_CODE"
  assert_jq "industry root is UN with ISIC system child" "$HTTP_BODY" '.parent.id == "UN" and .children[0].id == "ISIC Rev.5"'

  probe "/taxonomy/industry/children?parent=ISIC%20Rev.5"
  assert_status "industry system children" "200" "$HTTP_CODE"
  assert_jq "ISIC system returns direct sections" "$HTTP_BODY" '.parent.id == "ISIC Rev.5" and (.children | length) == 22'

  probe "/taxonomy/region/node/100000"
  assert_status "region node detail" "200" "$HTTP_CODE"
  assert_jq "region node detail is China" "$HTTP_BODY" '.id == "100000" and .name == "中国" and .level == "country"'

  Q_CN="$(jq -rn --arg q '农业' '$q|@uri')"
  probe "/taxonomy/industry/search?q=$Q_CN&limit=5"
  assert_status "industry Chinese search" "200" "$HTTP_CODE"
  assert_jq "industry Chinese search returns hits" "$HTTP_BODY" '(.items | length) > 0 and any(.items[]; (.name // "") | contains("农业"))'

  probe "/taxonomy/industry/search?q=Agriculture&limit=5"
  assert_status "industry English search" "200" "$HTTP_CODE"
  assert_jq "industry English search returns hits" "$HTTP_BODY" '(.items | length) > 0'

  probe "/taxonomy/industry/search?q=01&limit=5"
  assert_status "industry code search" "200" "$HTTP_CODE"
  assert_jq "industry code search returns code 01" "$HTTP_BODY" 'any(.items[]; .code == "01")'

  probe "/taxonomy/region/path/110000"
  assert_status "region ancestry path" "200" "$HTTP_CODE"
  assert_jq "region path is root-to-target" "$HTTP_BODY" '.nodes[0].id == "9999999" and .nodes[-1].id == "110000"'

  probe "/taxonomy/planet/children"
  assert_status "unknown taxonomy name" "404" "$HTTP_CODE"
  probe "/taxonomy/region/node/999999"
  assert_status "unknown taxonomy id" "404" "$HTTP_CODE"
  probe "/taxonomy/region/node/not-a-region-id"
  assert_status "malformed taxonomy id" "400" "$HTTP_CODE"
  probe "/taxonomy/industry/search?q=&limit=5"
  assert_status "empty taxonomy search" "400" "$HTTP_CODE"
  probe "/taxonomy/industry/search?q=A&limit=0"
  assert_status "invalid search limit" "400" "$HTTP_CODE"

  probe "/geo/regions/world"
  assert_status "world geometry" "200" "$HTTP_CODE"
  assert_jq "world geometry is a country FeatureCollection" "$HTTP_BODY" '.type == "FeatureCollection" and (.features | length) == 248'

  probe "/geo/regions/100000"
  assert_status "country geometry slice" "200" "$HTTP_CODE"
  assert_jq "country geometry slice is non-empty" "$HTTP_BODY" '.type == "FeatureCollection" and (.features | length) > 0'

  probe "/geo/regions/999999"
  assert_status "unknown country geometry" "404" "$HTTP_CODE"
  probe "/geo/regions/china"
  assert_status "malformed country geometry id" "400" "$HTTP_CODE"

  RAW="$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -X POST "$API_BASE/taxonomy/region/children" 2>/dev/null || true)"
  assert_status "taxonomy writes stay protected" "401" "$RAW"
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "全绿：PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
  exit 0
fi

echo "未全绿：PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
exit 1
