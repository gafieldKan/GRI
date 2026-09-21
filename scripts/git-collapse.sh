#!/usr/bin/env bash
# =============================================================================
# git-collapse.sh —— GRI 本地 git 单根基线压缩（定期清理历史版本）
#
# 用法:  scripts/git-collapse.sh ["提交说明(默认=当前快照)"]
#
# 效果:  把【当前工作树】整体拍成唯一根提交, 清空全部历史,
#        使 .git 收敛到最小体积、历史记录只剩一条。可反复执行做"定期清理"。
#
# 前提:  · 本地-only 仓库, 无远程(或确认可重写); 执行前请自行备份/换机同步。
#        · 属不可逆操作: reflog 过期 + 激进 GC 后, 旧提交对象将被物理回收。
#        · node_modules/dist/ssl/.env* 均在 .gitignore, 不会被纳入快照。
# =============================================================================
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

MSG="${1:-GRI 本地单根基线 $(date +%F) — 当前快照}"
TMP="__slim_root_$$"

echo "ℹ️ 将把当前工作树压缩为单根基线:  ${MSG}"

# 0) 原工作分支必须提前捕获——checkout --orphan 后 symbolic-ref 会指向临时分支,
#    延迟捕获会让下面的 branch -M 把临时名 rename 到自身(空操作), 原分支残留旧根。
SRC_BRANCH="$(git symbolic-ref --short HEAD)"

# 1) 溯源记录: 压缩前的工作分支提交哈希(旧历史被回收后无 git 内救回, 仅留此档)
OLD_HASH="$(git rev-parse HEAD)"
cat >> scripts/git-collapse-shield.txt <<EOF

# $(date -Is)
#  压缩为: ${MSG}
#  压缩前 HEAD: ${OLD_HASH}
EOF

# 2) orphan 空支 -> 暂存当前完整工作树 -> 提交为根
git checkout --orphan "$TMP"
git add -A
git commit -q -m "$MSG"
NEW_HASH="$(git rev-parse HEAD)"

# 3) 工作分支与默认分支(master/main)都指向这同一根, 吸收旧谱系引用
git branch -M "$SRC_BRANCH"
for m in master main; do
  git branch -f "$m" "$NEW_HASH" 2>/dev/null || true
done

# 4) 过期全部 reflog + 激进回收悬空旧对象
git reflog expire --expire=now --all
git gc --aggressive --prune=now

# 5) 收尾再对准默认分支(master/main), 防 amd 等改写后旧根被残留引用
for m in master main; do git branch -f "$m" HEAD 2>/dev/null || true; done
git gc --auto 2>/dev/null || true

echo "✅ 完成:  ${NEW_HASH:0:7}  ${MSG}"
git log --oneline --all
echo "   提交数:  $(git rev-list --all --count)   .git:  $(du -sh .git | cut -f1)"
git status --short