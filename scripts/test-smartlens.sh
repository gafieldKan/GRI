#!/bin/bash

# 智学慧眼 SmartLens v5.1 - 自动化测试脚本
# 测试环境：http://localhost:3003

BACKEND="http://localhost:3003"
PASS=0
FAIL=0

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_header() {
    echo -e "\n${YELLOW}============================================${NC}" >&2
    echo -e "${YELLOW}  智学慧眼 SmartLens v5.1 - 自动化测试${NC}" >&2
    echo -e "${YELLOW}============================================${NC}\n" >&2
}

echo_test() {
    echo -e "${YELLOW}[$1]${NC} $2" >&2
}

echo_pass() {
    echo -e "${GREEN}✓ 通过${NC} - $1" >&2
    ((PASS++))
}

echo_fail() {
    echo -e "${RED}✗ 失败${NC} - $1" >&2
    ((FAIL++))
}

# 1. 健康检查测试
test_health() {
    echo_test "1" "后端健康检查..."
    RESPONSE=$(curl -s "$BACKEND/health")
    if echo "$RESPONSE" | grep -q '"status":"ok"'; then
        echo_pass "后端服务正常"
        return 0
    else
        echo_fail "后端服务异常"
        return 1
    fi
}

# 2. 创建会话测试
test_create_session() {
    echo_test "2" "创建会话测试..."
    RESPONSE=$(curl -s -X POST "$BACKEND/api/session" \
        -H "Content-Type: application/json" \
        -d '{"studentId":"test_student","knowledgePointId":"math_pythagorean"}')

    SESSION_ID=$(echo "$RESPONSE" | sed -n 's/.*"sessionId":"\([^"]*\)".*/\1/p' | head -1)

    if [ -n "$SESSION_ID" ]; then
        echo_pass "会话创建成功：$SESSION_ID"
        echo "$SESSION_ID"
        return 0
    else
        echo_fail "会话创建失败"
        echo "$RESPONSE"
        return 1
    fi
}

# 3. AI 响应测试
test_ai_response() {
    SESSION_ID=$1
    echo_test "3" "AI 响应测试..."

    RESPONSE=$(curl -s -X POST "$BACKEND/api/session/$SESSION_ID/message" \
        -H "Content-Type: application/json" \
        -d "{\"content\":\"你好，我想学习勾股定理\"}")

    if echo "$RESPONSE" | grep -q "state"; then
        echo_pass "AI 响应正常"
        return 0
    else
        echo_fail "AI 响应异常"
        echo "$RESPONSE"
        return 1
    fi
}

# 4. 题目加载测试
test_questions_loaded() {
    echo_test "4" "题目加载测试..."

    # 创建新会话获取题目
    RESPONSE=$(curl -s -X POST "$BACKEND/api/session" \
        -H "Content-Type: application/json" \
        -d '{"studentId":"test2","knowledgePointId":"math_pythagorean"}')

    SESSION_ID=$(echo "$RESPONSE" | sed -n 's/.*"sessionId":"\([^"]*\)".*/\1/p' | head -1)

    RESPONSE=$(curl -s -X POST "$BACKEND/api/session/$SESSION_ID/message" \
        -H "Content-Type: application/json" \
        -d "{\"content\":\"开始\"}")

    QCOUNT=$(echo "$RESPONSE" | grep -o '"id":"diag_pythag_[0-9]"' | wc -l)

    if [ "$QCOUNT" -ge "1" ] || echo "$RESPONSE" | grep -q "questions"; then
        echo_pass "加载诊断题：$QCOUNT 道"
        return 0
    else
        echo_fail "题目加载失败"
        return 1
    fi
}

# 5. 答案校验测试
test_answer_validation() {
    echo_test "5" "答案校验测试..."

    # 创建会话
    RESPONSE=$(curl -s -X POST "$BACKEND/api/session" \
        -H "Content-Type: application/json" \
        -d '{"studentId":"test3","knowledgePointId":"math_pythagorean"}')

    SESSION_ID=$(echo "$RESPONSE" | sed -n 's/.*"sessionId":"\([^"]*\)".*/\1/p' | head -1)

    # 发送消息获取题目
    RESPONSE=$(curl -s -X POST "$BACKEND/api/session/$SESSION_ID/message" \
        -H "Content-Type: application/json" \
        -d "{\"content\":\"开始\"}")

    # 提交答案
    RESPONSE=$(curl -s -X POST "$BACKEND/api/session/$SESSION_ID/message" \
        -H "Content-Type: application/json" \
        -d "{\"content\":\"我选择 5\"}")

    if echo "$RESPONSE" | grep -q "state\|success\|diagnosisResult"; then
        echo_pass "答案校验功能正常"
        return 0
    else
        echo_fail "答案校验失败"
        echo "$RESPONSE"
        return 1
    fi
}

# 6. 测验流程测试
test_quiz_flow() {
    echo_test "6" "测验流程测试..."

    RESPONSE=$(curl -s -X POST "$BACKEND/api/session" \
        -H "Content-Type: application/json" \
        -d '{"studentId":"test4","knowledgePointId":"math_pythagorean"}')

    SESSION_ID=$(echo "$RESPONSE" | sed -n 's/.*"sessionId":"\([^"]*\)".*/\1/p' | head -1)

    # 多轮对话模拟学习流程
    curl -s -X POST "$BACKEND/api/session/$SESSION_ID/message" \
        -H "Content-Type: application/json" \
        -d "{\"content\":\"开始学习\"}" > /dev/null

    # 检查状态
    RESPONSE=$(curl -s -X POST "$BACKEND/api/session/$SESSION_ID/message" \
        -H "Content-Type: application/json" \
        -d "{\"content\":\"5\"}")

    if echo "$RESPONSE" | grep -q "state\|success"; then
        echo_pass "测验流程正常"
        return 0
    else
        echo_fail "测验流程异常"
        return 1
    fi
}

# 主函数
main() {
    echo_header

    echo "测试环境：$BACKEND" >&2
    echo "测试时间：$(date '+%Y-%m-%d %H:%M:%S')" >&2
    echo "" >&2

    # 运行所有测试
    test_health
    SESSION_ID=$(test_create_session)
    test_ai_response "$SESSION_ID"
    test_questions_loaded
    test_answer_validation
    test_quiz_flow

    # 输出结果
    echo -e "\n${YELLOW}============================================${NC}" >&2
    echo -e "${YELLOW}  测试结果${NC}" >&2
    echo -e "${YELLOW}============================================${NC}" >&2
    echo -e "通过：${GREEN}${PASS}${NC}  失败：${RED}${FAIL}${NC}" >&2

    if [ $FAIL -eq 0 ]; then
        echo -e "\n${GREEN}所有测试通过！系统运行正常。${NC}" >&2
        exit 0
    else
        echo -e "\n${RED}部分测试失败，请检查系统配置。${NC}" >&2
        exit 1
    fi
}

main
