#!/usr/bin/env bash
#
# deploy-freshness.sh - detect source changes that are not represented by the
# deployed baked images or nginx-served frontend bundles.
#
# Judgment rules:
#   * api / auth-center are baked images (Dockerfile COPY dist, no source mount).
#     Their authoritative source time is git, not filesystem mtime:
#       newest source commit timestamp for the build context > image .Created
#       => STALE; any relevant uncommitted change => STALE.
#   * web / web-ai-tutor / portal are served from dist/build/h5 through nginx.
#     Dist is gitignored, so the source commit timestamp is the git authority;
#     mtime is used only for uncommitted files that may be newer than the last
#     build. A missing or older dist index is STALE.
#
# Side effects:
#   * Default mode is read-only and prints repair commands only.
#   * --fix rebuilds STALE baked services and, when any frontend is stale, runs
#     npm run build:all-h5 followed by docker restart gri-nginx.
#
# Known issue documented by W2: uni build replaces the dist/build/h5 directory,
# so nginx must be restarted after frontend builds to refresh the bind mount.
#
# Usage:
#   bash scripts/deploy-freshness.sh
#   bash scripts/deploy-freshness.sh --fix
#
# Exit status is 0 only when the final scan has no STALE service.
set -u -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FIX=0
case "${1:-}" in
  "")
    ;;
  --fix)
    FIX=1
    ;;
  *)
    printf 'Usage: bash scripts/deploy-freshness.sh [--fix]\n' >&2
    exit 2
    ;;
esac

BAKED_SERVICES=(api auth-center)
BAKED_CONTEXTS=(. services/auth-center)
BAKED_CONTAINERS=(gri-api gri-auth-center)
# api uses the repository root as its Docker context. Its Dockerfile only copies
# these paths, so uncommitted task/output files outside this source face do not
# invalidate the image contents.
API_SOURCE_PATHS=(
  .dockerignore
  package.json
  package-lock.json
  packages/agent-core
  packages/jwt-verifier
  packages/ontology
  packages/ontology-engine
  services/api
  scripts/reference-data/data/un-regions.geo.json
  scripts/reference-data/data/un-regions-maps.geo.json
)
AUTH_SOURCE_PATHS=(services/auth-center)

FRONTEND_SERVICES=(web web-ai-tutor portal)
FRONTEND_DISTS=(
  apps/web/dist/build/h5/index.html
  apps/web-ai-tutor/dist/build/h5/index.html
  apps/portal/dist/build/h5/index.html
)
FRONTEND_SOURCES=(
  "apps/web/src styles"
  "apps/web-ai-tutor/src styles packages/world-art"
  "apps/portal/src styles packages/world-art"
)
FRONTEND_BUILD_COMMAND="npm run build:all-h5 && docker restart gri-nginx"

usage_fix_command() {
  # --no-cache is required: a cached build can reuse an image whose .Created
  # predates the source commit even though the source layer is up to date.
  printf 'docker compose -f docker-compose.yml build --no-cache %s && docker compose -f docker-compose.yml up -d --no-deps %s' "$1" "$1"
}

status_stale() {
  printf 'STALE %s %s\n' "$1" "$2"
}

status_fresh() {
  printf 'FRESH %s\n' "$1"
}

emit_fix() {
  printf 'FIX %s\n' "$1"
}

git_timestamp() {
  local paths=("$@")
  git log -1 --format=%ct -- "${paths[@]}" 2>/dev/null || true
}

git_status_for() {
  local paths=("$@")
  git status --porcelain -- "${paths[@]}" 2>/dev/null || true
}

check_baked() {
  local index="$1"
  local service="${BAKED_SERVICES[$index]}"
  local context="${BAKED_CONTEXTS[$index]}"
  local container="${BAKED_CONTAINERS[$index]}"
  local source_paths_name
  local -a source_paths
  local uncommitted
  local commit_ts
  local container_image
  local image_created
  local image_ts
  local fix_command

  if [ "$service" = "api" ]; then
    source_paths=("${API_SOURCE_PATHS[@]}")
    source_paths_name="api source face"
  else
    source_paths=("${AUTH_SOURCE_PATHS[@]}")
    source_paths_name="auth-center build context"
  fi

  uncommitted="$(git_status_for "${source_paths[@]}")"
  if [ -n "$uncommitted" ]; then
    status_stale "$service" "uncommitted changes in ${source_paths_name}"
    fix_command="$(usage_fix_command "$service")"
    emit_fix "$fix_command"
    return
  fi

  commit_ts="$(git_timestamp "$context")"
  if [ -z "$commit_ts" ]; then
    status_stale "$service" "no git timestamp for context ${context}"
    emit_fix "$(usage_fix_command "$service")"
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    status_stale "$service" "docker is unavailable; cannot inspect image"
    emit_fix "$(usage_fix_command "$service")"
    return
  fi

  container_image="$(docker inspect "$container" --format '{{.Image}}' 2>/dev/null || true)"
  if [ -z "$container_image" ]; then
    status_stale "$service" "container ${container} is unavailable"
    emit_fix "$(usage_fix_command "$service")"
    return
  fi

  image_created="$(docker inspect "$container_image" --format '{{.Created}}' 2>/dev/null || true)"
  image_ts="$(date -d "$image_created" +%s 2>/dev/null || true)"
  if [ -z "$image_ts" ]; then
    status_stale "$service" "image timestamp is unavailable"
    emit_fix "$(usage_fix_command "$service")"
    return
  fi

  if [ "$commit_ts" -gt "$image_ts" ]; then
    status_stale "$service" "source commit ${commit_ts} is newer than image ${image_ts}"
    emit_fix "$(usage_fix_command "$service")"
    return
  fi

  status_fresh "$service"
}

changed_source_files() {
  local paths=("$@")

  {
    git diff --name-only -z -- "${paths[@]}" 2>/dev/null || true
    git diff --cached --name-only -z -- "${paths[@]}" 2>/dev/null || true
    git ls-files --others --exclude-standard -z -- "${paths[@]}" 2>/dev/null || true
  } | tr '\0' '\n'
}

deleted_source_files() {
  local paths=("$@")

  {
    git diff --name-only --diff-filter=D -z -- "${paths[@]}" 2>/dev/null || true
    git diff --cached --name-only --diff-filter=D -z -- "${paths[@]}" 2>/dev/null || true
  } | tr '\0' '\n'
}

newest_changed_mtime() {
  local -a paths
  local file
  local mtime
  local newest=0

  mapfile -t paths < <(changed_source_files "$@")
  for file in "${paths[@]}"; do
    [ -f "$file" ] || continue
    mtime="$(stat -c %Y "$file" 2>/dev/null || printf '0')"
    if [ "$mtime" -gt "$newest" ]; then
      newest="$mtime"
    fi
  done
  printf '%s' "$newest"
}

check_frontend() {
  local index="$1"
  local service="${FRONTEND_SERVICES[$index]}"
  local dist="${FRONTEND_DISTS[$index]}"
  local source_spec="${FRONTEND_SOURCES[$index]}"
  local -a source_paths
  local path
  local deleted
  local commit_ts
  local changed_mtime
  local dist_mtime

  read -r -a source_paths <<<"$source_spec"
  for path in "${source_paths[@]}"; do
    if [ ! -e "$path" ]; then
      status_stale "$service" "configured source path is missing: ${path}"
      emit_fix "$FRONTEND_BUILD_COMMAND"
      return
    fi
  done

  if [ ! -f "$dist" ]; then
    status_stale "$service" "built index is missing: ${dist}"
    emit_fix "$FRONTEND_BUILD_COMMAND"
    return
  fi

  deleted="$(deleted_source_files "${source_paths[@]}")"
  if [ -n "$deleted" ]; then
    status_stale "$service" "uncommitted source deletion in configured source face"
    emit_fix "$FRONTEND_BUILD_COMMAND"
    return
  fi

  commit_ts="$(git_timestamp "${source_paths[@]}")"
  if [ -z "$commit_ts" ]; then
    status_stale "$service" "no git timestamp for configured source face"
    emit_fix "$FRONTEND_BUILD_COMMAND"
    return
  fi

  dist_mtime="$(stat -c %Y "$dist" 2>/dev/null || true)"
  if [ -z "$dist_mtime" ]; then
    status_stale "$service" "built index timestamp is unavailable"
    emit_fix "$FRONTEND_BUILD_COMMAND"
    return
  fi

  if [ "$commit_ts" -gt "$dist_mtime" ]; then
    status_stale "$service" "source commit ${commit_ts} is newer than dist ${dist_mtime}"
    emit_fix "$FRONTEND_BUILD_COMMAND"
    return
  fi

  changed_mtime="$(newest_changed_mtime "${source_paths[@]}")"
  if [ "$changed_mtime" -gt "$dist_mtime" ]; then
    status_stale "$service" "uncommitted source mtime ${changed_mtime} is newer than dist ${dist_mtime}"
    emit_fix "$FRONTEND_BUILD_COMMAND"
    return
  fi

  status_fresh "$service"
}

scan_all() {
  local i

  for i in "${!BAKED_SERVICES[@]}"; do
    check_baked "$i"
  done
  for i in "${!FRONTEND_SERVICES[@]}"; do
    check_frontend "$i"
  done
}

stale_count() {
  local output="$1"
  printf '%s\n' "$output" | grep -c '^STALE ' || true
}

fresh_count() {
  local output="$1"
  printf '%s\n' "$output" | grep -c '^FRESH ' || true
}

print_summary() {
  local output="$1"
  local stale
  local fresh

  stale="$(stale_count "$output")"
  fresh="$(fresh_count "$output")"
  printf 'STALE=%s FRESH=%s\n' "$stale" "$fresh"
}

if [ "$FIX" -eq 0 ]; then
  output="$(scan_all)"
  printf '%s\n' "$output"
  print_summary "$output"
  if [ "$(stale_count "$output")" -gt 0 ]; then
    exit 1
  fi
  exit 0
fi

initial="$(scan_all)"
if [ "$(stale_count "$initial")" -eq 0 ]; then
  printf '%s\n' "$initial"
  print_summary "$initial"
  exit 0
fi

fix_failed=0
for service in "${BAKED_SERVICES[@]}"; do
  if printf '%s\n' "$initial" | grep -q "^STALE ${service} "; then
    if ! docker compose -f docker-compose.yml build --no-cache "$service"; then
      fix_failed=1
    elif ! docker compose -f docker-compose.yml up -d --no-deps "$service"; then
      fix_failed=1
    fi
  fi
done

frontend_stale=0
for service in "${FRONTEND_SERVICES[@]}"; do
  if printf '%s\n' "$initial" | grep -q "^STALE ${service} "; then
    frontend_stale=1
    break
  fi
done

if [ "$frontend_stale" -eq 1 ]; then
  if npm run build:all-h5; then
    if ! docker restart gri-nginx; then
      fix_failed=1
    fi
  else
    fix_failed=1
  fi
fi

final="$(scan_all)"
printf '%s\n' "$final"
print_summary "$final"

if [ "$fix_failed" -eq 1 ]; then
  printf 'FIX_FAILED one or more repair commands failed\n' >&2
fi
if [ "$(stale_count "$final")" -gt 0 ]; then
  exit 1
fi
exit 0
