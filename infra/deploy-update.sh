#!/bin/bash
# ============================================================
# WordRhyme 手动更新部署脚本
# 从 GHCR 拉取最新镜像并重启服务
# Usage: bash infra/deploy-update.sh [--migrate]
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_MIGRATE=false

for arg in "$@"; do
    case $arg in
        --migrate) RUN_MIGRATE=true ;;
        *) echo "Unknown arg: $arg"; exit 1 ;;
    esac
done

cd "$SCRIPT_DIR"

echo "🔄 WordRhyme 更新部署"
echo "=================================="

# 1. 拉取最新镜像
echo ""
echo "📥 拉取最新镜像..."
docker compose -f docker-compose.prod.yml --env-file .env.production pull

# 2. 更新配置文件（如 nginx 等有变更）
echo ""
echo "📋 同步配置文件..."
cd "$(dirname "$SCRIPT_DIR")"
git fetch origin main
git checkout origin/main -- \
    infra/docker-compose.prod.yml \
    infra/nginx/ \
    2>/dev/null || true
cd "$SCRIPT_DIR"

# 3. 重启服务
echo ""
echo "🚀 更新服务..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# 4. 数据库迁移
if [ "$RUN_MIGRATE" = true ]; then
    echo ""
    echo "📦 运行数据库迁移..."
    sleep 5
    docker exec wr-server sh -c "cd /app/apps/server && node dist/db/migrate-prod.js"
    echo "✅ 数据库迁移完成"
fi

# 5. 清理旧镜像
echo ""
echo "🧹 清理无用镜像..."
docker image prune -f

# 6. 健康检查
echo ""
echo "🏥 健康检查..."
sleep 5

SERVICES=("wr-server" "wr-admin" "wr-web" "wr-nginx" "wr-postgres" "wr-redis")
ALL_HEALTHY=true

for svc in "${SERVICES[@]}"; do
    STATUS=$(docker inspect --format='{{.State.Status}}' "$svc" 2>/dev/null || echo "missing")
    if [ "$STATUS" = "running" ]; then
        echo "   ✅ $svc"
    else
        echo "   ❌ $svc: $STATUS"
        ALL_HEALTHY=false
    fi
done

echo ""
if [ "$ALL_HEALTHY" = true ]; then
    echo "🎉 更新完成！所有服务运行正常。"
else
    echo "⚠️  部分服务异常，请检查日志："
    echo "   docker compose -f docker-compose.prod.yml logs --tail=50"
fi
echo "=================================="
