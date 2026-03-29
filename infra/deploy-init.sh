#!/bin/bash
# ============================================================
# WordRhyme 首次部署脚本
# 在服务器上运行此脚本完成初始化部署
# Usage: bash infra/deploy-init.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

echo "🚀 WordRhyme 首次部署初始化"
echo "=================================="

# 1. 检查前置条件
echo ""
echo "📋 检查前置条件..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装。请先运行 server-init.sh"
    exit 1
fi

echo "✅ Docker $(docker --version | awk '{print $3}')"

# 2. 检查环境变量文件
if [ ! -f ".env.production" ]; then
    echo ""
    echo "❌ 未找到 .env.production 文件"
    echo "   请先复制模板并填入真实值："
    echo "   cp .env.production.example .env.production"
    echo "   vim .env.production"
    exit 1
fi

echo "✅ .env.production 已配置"

# 3. 加载环境变量
source .env.production

# 4. 创建 certbot 目录
mkdir -p certbot/conf certbot/www

# 5. 登录 GHCR（需要 GitHub Personal Access Token）
echo ""
echo "🔐 登录 GitHub Container Registry..."
if [ -z "${GHCR_TOKEN:-}" ]; then
    echo "   请输入 GitHub Personal Access Token (需有 read:packages 权限):"
    echo "   创建地址: https://github.com/settings/tokens/new?scopes=read:packages"
    read -rsp "   Token: " GHCR_TOKEN
    echo ""
fi
echo "$GHCR_TOKEN" | docker login ghcr.io -u denvey --password-stdin
echo "✅ GHCR 登录成功"

# 6. 首次获取 SSL 证书
echo ""
echo "🔐 获取 SSL 证书..."
echo "   域名: $SERVER_DOMAIN, $ADMIN_DOMAIN, $WEB_DOMAIN"

# 临时 nginx 用于 ACME 验证
docker run -d --name wr-certbot-nginx \
    -p 80:80 \
    -v "$SCRIPT_DIR/certbot/www:/var/www/certbot" \
    nginx:1.27-alpine \
    sh -c 'echo "server { listen 80; location /.well-known/acme-challenge/ { root /var/www/certbot; } location / { return 444; } }" > /etc/nginx/conf.d/default.conf && nginx -g "daemon off;"'

sleep 2

for DOMAIN in $SERVER_DOMAIN $ADMIN_DOMAIN $WEB_DOMAIN; do
    echo "   📜 申请证书: $DOMAIN"
    docker run --rm \
        -v "$SCRIPT_DIR/certbot/conf:/etc/letsencrypt" \
        -v "$SCRIPT_DIR/certbot/www:/var/www/certbot" \
        certbot/certbot certonly --webroot \
        -w /var/www/certbot \
        -d "$DOMAIN" \
        --email "$ADMIN_EMAIL" \
        --agree-tos --no-eff-email --non-interactive \
        || echo "⚠️  证书获取失败: $DOMAIN (可稍后手动重试)"
done

docker stop wr-certbot-nginx && docker rm wr-certbot-nginx
echo "✅ SSL 证书获取完成"

# 7. 拉取镜像并启动
echo ""
echo "📥 拉取 Docker 镜像..."

docker compose -f docker-compose.prod.yml --env-file .env.production pull

echo "✅ 镜像拉取完成"

echo ""
echo "🚀 启动所有服务..."

docker compose -f docker-compose.prod.yml --env-file .env.production up -d

echo "✅ 所有服务已启动"

# 8. 等待数据库就绪
echo ""
echo "⏳ 等待数据库就绪..."
sleep 10

# 9. 运行数据库迁移
echo ""
echo "📦 运行数据库迁移..."

docker exec wr-server sh -c "cd /app/apps/server && node dist/db/migrate-prod.js" || {
    echo "⚠️  数据库迁移失败，请手动运行："
    echo "   docker exec wr-server sh -c 'cd /app/apps/server && node dist/db/migrate-prod.js'"
}

# 10. 运行种子数据
echo ""
echo "🌱 初始化种子数据..."

docker exec wr-server sh -c "cd /app/apps/server && node -e \"import('./dist/db/seed/seed-accounts.js').catch(e => { console.error(e); process.exit(1) })\"" || {
    echo "⚠️  种子数据初始化失败，请手动运行"
}

# 11. 保存 GHCR Token 供后续 CI 使用
echo ""
echo "💾 保存 GHCR 凭证..."
docker login ghcr.io -u denvey --password-stdin <<< "$GHCR_TOKEN" 2>/dev/null

echo ""
echo "=================================="
echo "🎉 部署完成！"
echo ""
echo "📍 服务地址:"
echo "   🌐 Web:   https://$WEB_DOMAIN"
echo "   🔧 Admin: https://$ADMIN_DOMAIN"
echo "   🔌 API:   https://$SERVER_DOMAIN"
echo ""
echo "📊 查看服务状态:  docker compose -f docker-compose.prod.yml ps"
echo "📋 查看日志:      docker compose -f docker-compose.prod.yml logs -f server"
echo "=================================="
