#!/bin/bash
# 快速重启服务（保留日志）

echo "=== 快速重启服务 ==="

# 停止服务
./stop-dev.sh

# 等待进程完全退出
sleep 2

# 重启
./start-dev.sh
