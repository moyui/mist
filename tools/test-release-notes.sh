#!/bin/bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SCRIPT="$ROOT_DIR/tools/generate-release-notes.sh"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

cd "$TMP_DIR"
git init -q
git config user.name "Test User"
git config user.email "test@example.com"

echo "initial" > file.txt
git add file.txt
git commit -q -m "feat: initial release"
git tag v1.0.0

for i in 1 2 3 4 5; do
  echo "feature-$i" >> file.txt
  git add file.txt
  git commit -q -m "feat: add feature $i"
done

echo "global" >> file.txt
git add file.txt
git commit -q -m "feat: update UtilsModule with @Global() and new services"

for i in 1 2 3 4 5; do
  echo "fix-$i" >> file.txt
  git add file.txt
  git commit -q -m "fix: patch issue $i"
done

git tag v1.0.1

MAX_RELEASE_ITEMS=6 \
GITHUB_REPOSITORY="mist-trade/mist" \
  bash "$SCRIPT" "1.0.1" "v1.0.1" release_notes.md

if grep -q "@Global()" release_notes.md; then
  echo "release notes contain a raw @Global() mention"
  cat release_notes.md
  exit 1
fi

grep -q "@<!-- -->Global()" release_notes.md
grep -q "还有 5 项变更" release_notes.md
grep -q "Full Changelog" release_notes.md

summary_items=$(awk '
  /^## Docker 镜像/ { exit }
  /^- 还有 / { next }
  /^- / { count++ }
  END { print count + 0 }
' release_notes.md)

if [ "$summary_items" -gt 6 ]; then
  echo "release notes summary is too long: $summary_items items"
  cat release_notes.md
  exit 1
fi
