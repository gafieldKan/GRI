#!/bin/bash

# GRI 组织架构管理 API 测试脚本
# 使用前确保后端服务已启动 (npm start)

BASE_URL="http://localhost:3002"
PASS=0
FAIL=0

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "GRI 组织架构管理 API 测试"
echo "========================================"
echo ""

# 1. 健康检查
echo -e "${YELLOW}[1] 健康检查${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "${BASE_URL}/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ 通过${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ 失败 (HTTP $HTTP_CODE)${NC}"
    ((FAIL++))
fi

# 2. 获取组织树 (应该是空或已有数据)
echo -e "\n${YELLOW}[2] 获取组织树${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "${BASE_URL}/api/organizations/tree")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n -1)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ 通过${NC}"
    echo "响应：$BODY"
    ((PASS++))
else
    echo -e "${RED}✗ 失败 (HTTP $HTTP_CODE)${NC}"
    ((FAIL++))
fi

# 3. 创建根组织
echo -e "\n${YELLOW}[3] 创建根组织${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/organizations" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "示例科技公司",
    "shortName": "示例科技",
    "code": "DEMO-TECH",
    "type": "company",
    "description": "演示用组织"
  }')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n -1)
if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ 通过${NC}"
    ORG_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f3)
    echo "组织 ID: $ORG_ID"
    ((PASS++))
else
    echo -e "${RED}✗ 失败 (HTTP $HTTP_CODE)${NC}"
    echo "响应：$BODY"
    ((FAIL++))
fi

# 4. 获取组织列表
echo -e "\n${YELLOW}[4] 获取组织列表${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "${BASE_URL}/api/organizations/tree")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ 通过${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ 失败 (HTTP $HTTP_CODE)${NC}"
    ((FAIL++))
fi

# 5. 测试角色管理 - 获取角色列表
echo -e "\n${YELLOW}[5] 角色管理 - 获取角色列表 (需组织 ID)${NC}"
echo "跳过：需要先创建测试组织"

# 6. 测试邀请 API - 创建邀请
echo -e "\n${YELLOW}[6] 邀请 API - 创建邀请 (需组织 ID，跳过)${NC}"
echo "跳过：需要先创建测试组织"

# 总结
echo ""
echo "========================================"
echo -e "测试结果：${GREEN}通过 $PASS${NC}, ${RED}失败 $FAIL${NC}"
echo "========================================"

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}所有测试通过！${NC}"
    exit 0
else
    echo -e "${RED}部分测试失败${NC}"
    exit 1
fi
