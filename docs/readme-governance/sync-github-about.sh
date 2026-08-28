#!/usr/bin/env bash
set -euo pipefail

# Sync GitHub About (description / homepage / topics) for 7 repos.
# Usage: ./sync-github-about.sh [--apply] [--file github-about.tsv]
# Supports TSV (preferred, TAB-separated: repo, description, homepage, topics) and CSV.
# Default is dry-run (prints gh commands only). Requires: gh auth login && gh auth refresh -s repo

FILE="github-about.tsv"
APPLY=false
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    --file) shift ;;
    --csv|--tsv) shift ;;
  esac
done
# Backward compat: positional --csv/--tsv or --file
if [[ "${1:-}" == "--csv" || "${1:-}" == "--file" || "${1:-}" == "--tsv" ]]; then FILE="${2:-$FILE}"; APPLY=false; [[ "${3:-}" == "--apply" || "${1:-}" == "--apply" ]] && APPLY=true; fi
if [[ "${1:-}" == "--apply" ]]; then APPLY=true; FILE="${2:-$FILE}"; [[ "${2:-}" == "--file" || "${2:-}" == "--csv" || "${2:-}" == "--tsv" ]] && FILE="${3:-$FILE}"; fi
# Prefer TSV if exists alongside CSV
if [[ "$FILE" == "github-about.tsv" && ! -f "$FILE" && -f "github-about.csv" ]]; then FILE="github-about.csv"; fi

if ! command -v gh >/dev/null 2>&1; then echo "gh CLI not found" >&2; exit 1; fi

is_tsv=false
[[ "$FILE" == *.tsv ]] && is_tsv=true

line_num=0
while IFS= read -r line || [[ -n "$line" ]]; do
  line_num=$((line_num+1))
  [[ $line_num -eq 1 ]] && continue
  [[ -z "${line//[[:space:]]/}" ]] && continue
  if $is_tsv; then
    # TSV: split preserving empty field (homepage is empty, needs 4 columns)
    repo=$(echo "$line" | cut -f1)
    description=$(echo "$line" | cut -f2)
    homepage=$(echo "$line" | cut -f3)
    topics=$(echo "$line" | cut -f4)
  else
    # CSV: naive — works when fields are quoted; TSV is preferred for commas
    IFS=, read -r repo description homepage topics <<< "$line"
    repo=$(echo "$repo" | tr -d '"' | xargs)
    description=$(echo "$description" | sed 's/^"//;s/"$//')
    homepage=$(echo "$homepage" | tr -d '"' | xargs)
    topics=$(echo "$topics" | tr -d '"' | xargs)
  fi
  repo=$(echo "$repo" | xargs)
  description=$(echo "$description" | xargs)
  homepage=$(echo "$homepage" | xargs)
  topics=$(echo "$topics" | xargs)
  [[ -z "$repo" ]] && continue
  echo "== $repo =="
  echo "  description: $description"
  echo "  homepage: ${homepage:-<empty>}"
  echo "  topics: $topics"
  if $APPLY; then
    gh repo edit "$repo" --description "$description" --visibility public 2>&1 || gh repo edit "$repo" --description "$description" 2>&1 || true
    if [[ -n "$homepage" ]]; then gh repo edit "$repo" --homepage "$homepage" 2>&1 || true; fi
    topics_csv=$(echo "$topics" | tr ';' ',')
    if [[ -n "$topics_csv" ]]; then gh repo edit "$repo" --add-topic "$topics_csv" 2>&1 || true; fi
    echo "  -> applied (gh repo edit)"
  else
    echo "  gh repo edit \"$repo\" --description \"$description\" ${homepage:+--homepage \"$homepage\"} --add-topic \"$(echo "$topics" | tr ';' ',')\""
    echo "  [dry-run] add --apply to execute"
  fi
done < "$FILE"

echo ""
echo "Done. Dry-run by default; re-run with --apply to write."
echo "Note: mist-deploy is PRIVATE; gh may refuse --visibility public — remove that flag for it."
