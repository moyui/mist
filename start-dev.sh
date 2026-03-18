#!/bin/bash
set -e

# Mist Backend Development Startup Script
# 这个脚本会启动所有必要的开发服务

echo "=== Mist Backend 开发环境启动 ==="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
MYSQL_HOST="${mysql_server_host:-127.0.0.1}"
MYSQL_PORT="${mysql_server_port:-3306}"
MYSQL_USER="${mysql_server_username:-root}"
MYSQL_PASSWORD="${mysql_server_password:-123456}"
MYSQL_DATABASE="${mysql_server_database:-mist}"

AKTOOLS_PORT=8080
MIST_PORT=8001

# 日志目录
LOG_DIR="logs"
mkdir -p "$LOG_DIR"

# 清理函数
cleanup() {
    echo ""
    echo "=== 正在停止所有服务 ==="

    # 停止 Mist
    if [ ! -z "$MIST_PID" ]; then
        echo "停止 Mist (PID: $MIST_PID)..."
        kill $MIST_PID 2>/dev/null || true
        wait $MIST_PID 2>/dev/null || true
    fi

    # 停止 AKTools
    if [ ! -z "$AKTOOLS_PID" ]; then
        echo "停止 AKTools (PID: $AKTOOLS_PID)..."
        kill $AKTOOLS_PID 2>/dev/null || true
        wait $AKTOOLS_PID 2>/dev/null || true
    fi

    echo -e "${GREEN}✅ 所有服务已停止${NC}"
}

# 设置清理陷阱
trap cleanup EXIT INT TERM

# 检查端口占用
check_port() {
    local port=$1
    local name=$2

    if lsof -i :$port >/dev/null 2>&1; then
        echo -e "${RED}❌ 端口 $port 已被占用 ($name)${NC}"
        echo "请先停止占用该端口的进程："
        echo "  lsof -i :$port"
        exit 1
    fi
}

# 检查所有端口
echo "1. 检查端口占用..."
check_port $AKTOOLS_PORT "AKTools"
check_port $MIST_PORT "Mist"
echo -e "${GREEN}   ✅ 所有端口可用${NC}"

# 检查 MySQL
echo ""
echo "2. 检查 MySQL 连接..."
if podman exec epic_mestorf mysql -u$MYSQL_USER -p$MYSQL_PASSWORD -e "SELECT 1" >/dev/null 2>&1; then
    echo -e "${GREEN}   ✅ MySQL 连接成功${NC}"
else
    echo -e "${RED}   ❌ MySQL 连接失败${NC}"
    echo "请检查："
    echo "  1. MySQL 容器是否运行: podman ps"
    echo "  2. 密码是否正确"
    exit 1
fi

# 检查数据库是否存在
echo ""
echo "3. 检查数据库..."
DB_EXISTS=$(podman exec epic_mestorf mysql -u$MYSQL_USER -p$MYSQL_PASSWORD -se "SHOW DATABASES LIKE '$MYSQL_DATABASE'" 2>/dev/null || echo "")
if [ -z "$DB_EXISTS" ]; then
    echo "   创建数据库 $MYSQL_DATABASE..."
    podman exec epic_mestorf mysql -u$MYSQL_USER -p$MYSQL_PASSWORD -e "CREATE DATABASE IF NOT EXISTS $MYSQL_DATABASE DEFAULT CHARACTER SET utf8mb4;" >/dev/null 2>&1
    echo -e "${GREEN}   ✅ 数据库已创建${NC}"
else
    echo -e "${GREEN}   ✅ 数据库已存在${NC}"
fi

# 检查 AKTools
echo ""
echo "4. 检查 AKTools..."
if ! python3 -c "import aktools" 2>/dev/null; then
    echo "   AKTools 未安装，正在安装..."
    python3 -m pip install aktools --user >/dev/null 2>&1
    echo -e "${GREEN}   ✅ AKTools 已安装${NC}"
else
    echo -e "${GREEN}   ✅ AKTools 已安装${NC}"
fi

# 设置环境变量
export mysql_server_host=$MYSQL_HOST
export mysql_server_port=$MYSQL_PORT
export mysql_server_username=$MYSQL_USER
export mysql_server_password=$MYSQL_PASSWORD
export mysql_server_database=$MYSQL_DATABASE

# 启动 AKTools
echo ""
echo "5. 启动 AKTools..."
python3 -m aktools > "$LOG_DIR/aktools.log" 2>&1 &
AKTOOLS_PID=$!
echo "   AKTools PID: $AKTOOLS_PID"
echo "   等待 AKTools 启动..."

# 等待 AKTools 就绪
for i in {1..10}; do
    if curl -s http://localhost:$AKTOOLS_PORT/docs >/dev/null 2>&1; then
        echo -e "${GREEN}   ✅ AKTools 已就绪 (http://localhost:$AKTOOLS_PORT)${NC}"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${RED}   ❌ AKTools 启动超时${NC}"
        echo "   查看日志: cat $LOG_DIR/aktools.log"
        exit 1
    fi
    sleep 1
done

# 启动 Mist 应用
echo ""
echo "6. 启动 Mist 应用..."
pnpm run start:dev:mist > "$LOG_DIR/mist.log" 2>&1 &
MIST_PID=$!
echo "   Mist PID: $MIST_PID"
echo "   等待应用启动..."

# 等待应用就绪
for i in {1..20}; do
    if curl -s http://localhost:$MIST_PORT/app/hello >/dev/null 2>&1; then
        echo -e "${GREEN}   ✅ Mist 已就绪 (http://localhost:$MIST_PORT)${NC}"
        break
    fi
    if [ $i -eq 20 ]; then
        echo -e "${YELLOW}   ⚠️  Mist 启动较慢，请检查日志${NC}"
        echo "   查看日志: tail -f $LOG_DIR/mist.log"
        break
    fi
    sleep 1
done

# 显示服务状态
echo ""
echo "=== 服务状态 ==="
echo -e "${GREEN}✅ 所有服务已启动${NC}"
echo ""
echo "服务地址："
echo "  • AKTools:      http://localhost:$AKTOOLS_PORT"
echo "  • Mist 应用:    http://localhost:$MIST_PORT"
echo "  • API 文档:     http://localhost:$MIST_PORT/api-docs"
echo "  • 健康检查:     http://localhost:$MIST_PORT/app/hello"
echo ""
echo "日志文件："
echo "  • AKTools: tail -f $LOG_DIR/aktools.log"
echo "  • Mist:    tail -f $LOG_DIR/mist.log"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo ""

# 保持脚本运行
wait
