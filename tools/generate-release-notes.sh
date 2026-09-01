#!/bin/bash
set -euo pipefail

VERSION=${1:?version is required}
TAG=${2:?tag is required}
OUTPUT=${3:-release_notes.md}
MAX_ITEMS=${MAX_RELEASE_ITEMS:-12}
REPOSITORY=${GITHUB_REPOSITORY:-mist-trade/mist}
IMAGE="ghcr.io/${REPOSITORY}"

sanitize_markdown() {
  sed -E 's/@([A-Za-z0-9][A-Za-z0-9-]*)/@<!-- -->\1/g'
}

current_ref="HEAD"
if git rev-parse --verify "${TAG}^{commit}" >/dev/null 2>&1; then
  current_ref="${TAG}^{commit}"
fi

previous_tag=$(git describe --tags --abbrev=0 "${current_ref}^" 2>/dev/null || true)

if [ -z "$previous_tag" ]; then
  cat > "$OUTPUT" <<EOF
### 首次发布

这是 Mist Backend 的第一个稳定版本。

## 主要功能

- 实时股票数据采集和存储
- 164+ 技术分析指标（MACD、RSI、KDJ 等）
- 缠论（Chan Theory）自动化分析
- 多智能体 AI 系统用于交易决策
- RESTful API with Swagger 文档
- mist-skills/AstrBot integration for AI and bot workflows
EOF
else
  total_changes=$(git rev-list --count "${previous_tag}..${current_ref}")
  shown_changes=$(( total_changes < MAX_ITEMS ? total_changes : MAX_ITEMS ))
  omitted_changes=$(( total_changes - shown_changes ))

  {
    echo "### 更新摘要"
    echo
    echo "自 ${previous_tag} 以来的主要变更（共 ${total_changes} 项）："
    echo

    item_count=0
    while IFS=$'\t' read -r subject hash; do
      if [ "$item_count" -ge "$MAX_ITEMS" ]; then
        break
      fi

      safe_subject=$(printf '%s' "$subject" | sanitize_markdown)
      echo "- ${safe_subject} (${hash})"
      item_count=$((item_count + 1))
    done < <(git log "${previous_tag}..${current_ref}" --format='%s%x09%h' --no-merges)

    if [ "$omitted_changes" -gt 0 ]; then
      echo "- 还有 ${omitted_changes} 项变更，见下方完整变更链接。"
    fi

    echo
    echo "**Full Changelog**: https://github.com/${REPOSITORY}/compare/${previous_tag}...${TAG}"
  } > "$OUTPUT"
fi

cat >> "$OUTPUT" <<EOF

## Docker 镜像

\`\`\`bash
# 拉取当前版本
docker pull ${IMAGE}:${VERSION}

# 或拉取 latest
docker pull ${IMAGE}:latest
\`\`\`

## 快速开始

\`\`\`bash
docker run -d \\
  -p 8001:8001 \\
  -p 8008:8008 \\
  -e mysql_server_host=host.docker.internal \\
  -e mysql_server_password=your_password \\
  ${IMAGE}:${VERSION}
\`\`\`
EOF

cat "$OUTPUT"
