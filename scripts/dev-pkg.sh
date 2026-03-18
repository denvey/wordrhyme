#!/usr/bin/env bash
# ============================================================================
# dev-pkg.sh — 底座 + 指定 packages watch 模式
#
# 用法:
#   pnpm dev:pkg core           # 底座 + @wordrhyme/core watch
#   pnpm dev:pkg core db plugin # 底座 + 多个 packages watch
#   pnpm dev:pkg --list         # 列出可用 packages
# ============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGES_DIR="$ROOT_DIR/packages"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

list_packages() {
    echo -e "${CYAN}可用 packages:${NC}"
    echo ""
    for dir in "$PACKAGES_DIR"/*/; do
        [ -f "$dir/package.json" ] || continue
        local folder_name
        folder_name=$(basename "$dir")
        local pkg_name
        pkg_name=$(grep '"name"' "$dir/package.json" | head -1 | sed 's/.*"name": "//;s/".*//')
        printf "  ${YELLOW}%-15s${NC} → %s\n" "$folder_name" "$pkg_name"
    done
    echo ""
    echo -e "${BLUE}用法: pnpm dev:pkg <包文件夹名> [<包文件夹名> ...]${NC}"
}

main() {
    if [ $# -eq 0 ] || [ "${1:-}" = "--list" ] || [ "${1:-}" = "-l" ]; then
        list_packages
        exit 0
    fi

    # 解析 package 参数
    local pkg_filters=()
    local pkg_names=()

    for folder_name in "$@"; do
        local pkg_dir="$PACKAGES_DIR/$folder_name"
        if [ ! -d "$pkg_dir" ] || [ ! -f "$pkg_dir/package.json" ]; then
            echo -e "${RED}错误: packages/$folder_name 不存在${NC}" >&2
            echo -e "运行 ${YELLOW}pnpm dev:pkg --list${NC} 查看可用包" >&2
            exit 1
        fi
        local pkg_name
        pkg_name=$(grep '"name"' "$pkg_dir/package.json" | head -1 | sed 's/.*"name": "//;s/".*//')
        pkg_filters+=("--filter=$pkg_name")
        pkg_names+=("$folder_name")
    done

    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}🚀 底座 + packages watch 模式${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  Watch packages:  ${YELLOW}${pkg_names[*]}${NC}"
    echo -e "  其余 packages:   ${BLUE}预构建${NC}"
    echo ""

    # Step 1: 预构建所有 packages
    echo -e "${YELLOW}📦 Step 1: 预构建 packages...${NC}"
    (cd "$ROOT_DIR" && npx turbo build --filter='./packages/*')
    echo -e "${GREEN}✅ 预构建完成${NC}"
    echo ""

    # Step 2: 启动 apps + 指定 packages
    local concurrency=$(( 3 + ${#pkg_filters[@]} + 2 ))

    echo -e "${YELLOW}🔧 Step 2: 启动底座 + packages watch...${NC}"
    echo ""

    (cd "$ROOT_DIR" && exec npx turbo run dev \
        --filter=@wordrhyme/admin \
        --filter=@wordrhyme/server \
        --filter=@wordrhyme/web \
        "${pkg_filters[@]}" \
        --concurrency="$concurrency")
}

main "$@"
