#!/bin/bash

# 低代码平台测试环境管理脚本
# 使用方式：
#   ./test-env.sh up      - 启动测试环境
#   ./test-env.sh down    - 停止测试环境
#   ./test-env.sh status  - 查看状态
#   ./test-env.sh clean   - 清理所有数据和容器
#   ./test-env.sh logs    - 查看日志

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.test.yml"
COMPOSE_PROJECT_NAME="lowcode-test"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_color() {
    case $1 in
        success) echo -e "${GREEN}$2${NC}" ;;
        error) echo -e "${RED}$2${NC}" ;;
        warning) echo -e "${YELLOW}$2${NC}" ;;
        *) echo "$2" ;;
    esac
}

# 检查 Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo_color error "Docker 未安装"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        echo_color error "docker-compose 未安装"
        exit 1
    fi
}

# 启动环境
up() {
    echo_color success "启动低代码平台测试环境..."

    # 检查 .env 文件
    if [ ! -f "$SCRIPT_DIR/.env" ]; then
        echo_color warning ".env 文件不存在，复制 .env.test 模板..."
        cp "$SCRIPT_DIR/.env.test" "$SCRIPT_DIR/.env"
    fi

    # 启动服务
    cd "$SCRIPT_DIR"
    docker-compose -f "$COMPOSE_FILE" up -d

    echo_color success "\n等待服务启动..."
    sleep 10

    # 检查服务状态
    echo_color success "\n服务状态:"
    docker-compose -f "$COMPOSE_FILE" ps

    echo_color success "\n测试环境已就绪!"
    echo_color warning "  低代码平台：http://localhost:8081"
    echo_color warning "  Mock AI Server: http://localhost:8888"
    echo_color warning "  MinIO 控制台：http://localhost:9001"
    echo_color warning "  PostgreSQL: localhost:5433"
    echo_color warning "  Redis: localhost:6380"
}

# 停止环境
down() {
    echo_color warning "停止测试环境..."

    cd "$SCRIPT_DIR"
    docker-compose -f "$COMPOSE_FILE" down

    echo_color success "测试环境已停止"
}

# 查看状态
status() {
    cd "$SCRIPT_DIR"

    if docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
        echo_color success "测试环境运行中"
        docker-compose -f "$COMPOSE_FILE" ps
    else
        echo_color warning "测试环境未运行"
    fi
}

# 清理所有数据
clean() {
    echo_color error "警告：此操作将删除所有测试数据!"
    read -p "确定要继续吗？(y/N) " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd "$SCRIPT_DIR"
        docker-compose -f "$COMPOSE_FILE" down -v
        docker system prune -f
        echo_color success "已清理所有测试数据"
    else
        echo_color warning "操作已取消"
    fi
}

# 查看日志
logs() {
    cd "$SCRIPT_DIR"
    docker-compose -f "$COMPOSE_FILE" logs -f
}

# 重置数据库
reset_db() {
    echo_color warning "重置测试数据库..."

    cd "$SCRIPT_DIR"
    docker-compose -f "$COMPOSE_FILE" exec -T postgres-test psql -U test -d lowcode_test -c "DROP SCHEMA IF EXISTS test_schema CASCADE;"
    docker-compose -f "$COMPOSE_FILE" exec -T postgres-test psql -U test -d lowcode_test -c "CREATE SCHEMA test_schema;"

    echo_color success "数据库已重置"
}

# 运行测试
run_tests() {
    echo_color success "运行全链路测试..."

    cd "$SCRIPT_DIR"

    # 检查环境是否运行
    if ! docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
        echo_color error "测试环境未运行，先启动环境..."
        up
    fi

    # 运行 Playwright 测试
    cd ../../
    npm run test:automation

    echo_color success "\n测试完成!"
}

# 主程序
case "${1:-}" in
    up)
        up
        ;;
    down)
        down
        ;;
    status)
        status
        ;;
    clean)
        clean
        ;;
    logs)
        logs
        ;;
    reset-db)
        reset_db
        ;;
    test)
        run_tests
        ;;
    *)
        echo "低代码平台测试环境管理"
        echo ""
        echo "使用方式：$0 {up|down|status|clean|logs|reset-db|test}"
        echo ""
        echo "命令说明:"
        echo "  up       - 启动测试环境"
        echo "  down     - 停止测试环境"
        echo "  status   - 查看状态"
        echo "  clean    - 清理所有数据"
        echo "  logs     - 查看日志"
        echo "  reset-db - 重置数据库"
        echo "  test     - 运行测试"
        ;;
esac
