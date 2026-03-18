#!/usr/bin/env bash
# ============================================================================
# dev-plugin.sh — 按需启动开发模式
#
# 用法:
#   pnpm dev:plugin shop            # 底座 + shop 插件
#   pnpm dev:plugin shop dsuni      # 底座 + shop + dsuni
#   pnpm dev:plugin --list          # 列出可用插件
#
# 流程:
#   1. 预构建全部插件 (turbo cache 加速)
#   2. 启动底座 (admin/server/web + packages)
#   3. 仅对指定插件启动 dev server (HMR)
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGINS_DIR="$ROOT_DIR/plugins"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================================================
# 列出可用插件
# ============================================================================
list_plugins() {
    echo -e "${CYAN}可用插件:${NC}"
    echo ""
    for dir in "$PLUGINS_DIR"/*/; do
        [ -f "$dir/package.json" ] || continue
        local folder_name
        folder_name=$(basename "$dir")
        local pkg_name
        pkg_name=$(grep '"name"' "$dir/package.json" | head -1 | sed 's/.*"name": "//;s/".*//')
        local has_ui=""
        if [ -f "$dir/rsbuild.config.ts" ]; then
            has_ui=" ${GREEN}[UI]${NC}"
        fi
        printf "  ${YELLOW}%-25s${NC} → %s%b\n" "$folder_name" "$pkg_name" "$has_ui"
    done
    echo ""
    echo -e "${BLUE}用法: pnpm dev:plugin <插件文件夹名> [<插件文件夹名> ...]${NC}"
}

# ============================================================================
# 根据文件夹名获取包名
# ============================================================================
get_package_name() {
    local folder_name="$1"
    local plugin_dir="$PLUGINS_DIR/$folder_name"

    if [ ! -d "$plugin_dir" ]; then
        echo -e "${RED}错误: 插件目录不存在: plugins/$folder_name${NC}" >&2
        echo -e "运行 ${YELLOW}pnpm dev:plugin --list${NC} 查看可用插件" >&2
        return 1
    fi

    if [ ! -f "$plugin_dir/package.json" ]; then
        echo -e "${RED}错误: 插件目录缺少 package.json: plugins/$folder_name${NC}" >&2
        return 1
    fi

    grep '"name"' "$plugin_dir/package.json" | head -1 | sed 's/.*"name": "//;s/".*//'
}

# ============================================================================
# 主流程
# ============================================================================
main() {
    # 无参数或 --list 则列出插件
    if [ $# -eq 0 ] || [ "${1:-}" = "--list" ] || [ "${1:-}" = "-l" ]; then
        list_plugins
        exit 0
    fi

    # 解析插件参数
    local plugin_filters=()
    local plugin_names=()

    for folder_name in "$@"; do
        local pkg_name
        pkg_name=$(get_package_name "$folder_name") || exit 1
        plugin_filters+=("--filter=$pkg_name")
        plugin_names+=("$folder_name")
    done

    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}🚀 按需启动开发模式${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  活跃插件 (HMR):  ${YELLOW}${plugin_names[*]}${NC}"
    echo -e "  其余插件:        ${BLUE}预构建静态加载${NC}"
    echo ""

    # Step 1: 预构建所有插件
    echo -e "${YELLOW}📦 Step 1: 预构建全部插件...${NC}"
    (cd "$ROOT_DIR" && npx turbo build --filter='./plugins/*' --filter='./packages/*')
    echo -e "${GREEN}✅ 插件预构建完成${NC}"
    echo ""

    # Step 2: 构建 turbo filter 参数
    # 底座 apps: 始终启动 (packages 已在 Step 1 预构建)
    local base_filters=(
        "--filter=@wordrhyme/admin"
        "--filter=@wordrhyme/server"
        "--filter=@wordrhyme/web"
    )

    # 计算并发数: 底座 apps(3) + 指定插件数
    local concurrency=$(( ${#base_filters[@]} + ${#plugin_filters[@]} + 2 ))

    echo -e "${YELLOW}🔧 Step 2: 启动底座 + 活跃插件...${NC}"
    echo -e "  并发数: $concurrency"
    echo ""

    # Step 3: 启动 turbo dev
    (cd "$ROOT_DIR" && exec npx turbo run dev \
        "${base_filters[@]}" \
        "${plugin_filters[@]}" \
        --concurrency="$concurrency")
}

main "$@"
