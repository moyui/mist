#!/usr/bin/env bash
# 加载 nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 切换到 Node 20（如果未安装，可以自动安装）
nvm use 20