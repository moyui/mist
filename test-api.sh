#!/bin/bash
# API 快速测试脚本

MIST_PORT=${1:-8001}
BASE_URL="http://localhost:$MIST_PORT"

echo "=== Mist API 快速测试 ==="
echo "测试地址: $BASE_URL"
echo ""

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 测试1: 健康检查
echo "1. 健康检查..."
HEALTH=$(curl -s "$BASE_URL/app/hello")
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ PASS${NC} - $HEALTH"
else
    echo -e "${RED}❌ FAIL${NC} - 无法连接到服务器"
    exit 1
fi

# 测试2: 获取指数列表
echo ""
echo "2. 获取指数列表..."
INDICES=$(curl -s "$BASE_URL/data/index")
if echo "$INDICES" | grep -q "上证指数"; then
    echo -e "${GREEN}✅ PASS${NC} - 找到上证指数"
else
    echo -e "${YELLOW}⚠️  WARN${NC} - 未找到指数数据（可能数据库为空）"
fi

# 测试3: Swagger文档
echo ""
echo "3. API 文档..."
if curl -s "$BASE_URL/api-docs" | grep -q "swagger"; then
    echo -e "${GREEN}✅ PASS${NC} - Swagger 文档可用"
    echo "   访问: $BASE_URL/api-docs"
else
    echo -e "${YELLOW}⚠️  WARN${NC} - Swagger 文档未启用"
fi

# 测试4: AKTools连接
echo ""
echo "4. AKTools 连接..."
if curl -s http://localhost:8080/docs >/dev/null 2>&1; then
    echo -e "${GREEN}✅ PASS${NC} - AKTools 运行中"
else
    echo -e "${RED}❌ FAIL${NC} - AKTools 未运行"
fi

echo ""
echo "=== 测试完成 ==="
