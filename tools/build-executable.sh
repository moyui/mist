#!/bin/bash
set -e

PLATFORM=$1
OUTPUT_DIR="dist/executables"

mkdir -p $OUTPUT_DIR

case $PLATFORM in
  linux-amd64)
    pkg . --targets node24-linux-x64 --output $OUTPUT_DIR/mist-linux-amd64
    ;;
  macos-amd64)
    pkg . --targets node24-macos-x64 --output $OUTPUT_DIR/mist-macos-amd64
    ;;
  macos-arm64)
    pkg . --targets node24-macos-arm64 --output $OUTPUT_DIR/mist-macos-arm64
    ;;
  windows-x86)
    pkg . --targets node24-win-x64 --output $OUTPUT_DIR/mist-windows-x86.exe
    ;;
  *)
    echo "Unknown platform: $PLATFORM"
    echo "Supported: linux-amd64, macos-amd64, macos-arm64, windows-x86"
    exit 1
    ;;
esac

echo "✅ Build complete for $PLATFORM"
