#!/bin/bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
WORKFLOW="$ROOT_DIR/.github/workflows/release.yml"
WORKSPACE="$ROOT_DIR/pnpm-workspace.yaml"

grep -q "tools/generate-release-notes.sh" "$WORKFLOW"
! grep -q "tools/package-release.sh" "$WORKFLOW"
! grep -q "tools/build-executable.sh" "$WORKFLOW"
grep -q "dry_run:" "$WORKFLOW"
grep -q "github.event.inputs.dry_run != 'true'" "$WORKFLOW"
! grep -q "actions/upload-artifact" "$WORKFLOW"
! grep -q "fail_on_unmatched_files: true" "$WORKFLOW"
grep -q "ghcr.io/\${{ github.repository }}" "$WORKFLOW"
! grep -q "release/mist-" "$WORKFLOW"
! grep -q "ghcr.io/moyui/mist" "$WORKFLOW"
grep -q "packages:" "$WORKSPACE"
