#!/bin/bash
# 停止所有开发服务

echo "=== 停止 Mist Backend 开发服务 ==="
echo ""

# 停止 Mist
if pgrep -f "nest start mist" > /dev/null; then
    echo "停止 Mist..."
    pkill -f "nest start mist"
    echo -e "\033[0;32m✅ Mist 已停止\033[0m"
else
    echo "Mist 未运行"
fi

# 停止 AKTools
if pgrep -f "aktools" > /dev/null; then
    echo "停止 AKTools..."
    pkill -f "aktools"
    echo -e "\033[0;32m✅ AKTools 已停止\033[0m"
else
    echo "AKTools 未运行"
fi

echo ""
echo "=== 所有服务已停止 ==="
