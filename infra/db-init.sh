#!/bin/bash
# ============================================================
# WordRhyme 数据库服务器初始化脚本
#
# 在专用数据库服务器上运行此脚本：
#   scp -r infra/ root@db-server:/opt/wordrhyme-db/
#   ssh root@db-server
#   bash /opt/wordrhyme-db/db-init.sh
#
# 脚本会:
#   1. 安装 Docker
#   2. 配置防火墙 (仅开放指定 IP 的 PG/Redis 端口)
#   3. 启动 PostgreSQL + Redis
#   4. 设置自动备份 cron
#
# 环境变量: 与应用服务器共用 .env.production
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE=".env.production"

echo "🗄️  WordRhyme 数据库服务器初始化"
echo "=================================="

# ---- 1. 安装 Docker ----
if ! command -v docker &> /dev/null; then
    echo ""
    echo "📦 安装 Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "✅ Docker 已安装"
else
    echo "✅ Docker $(docker --version | awk '{print $3}')"
fi

# ---- 2. 防火墙配置 ----
echo ""
echo "🔒 配置防火墙..."

if command -v ufw &> /dev/null; then
    ufw --force enable
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh

    echo ""
    echo "🔑 配置数据库端口访问白名单"
    echo "   请输入允许连接数据库的应用服务器 IP (逗号分隔)"
    echo "   示例: 1.2.3.4,5.6.7.8"
    read -rp "   IP 列表: " ALLOWED_IPS

    IFS=',' read -ra IPS <<< "$ALLOWED_IPS"
    for IP in "${IPS[@]}"; do
        IP=$(echo "$IP" | xargs)  # trim
        echo "   允许 $IP → PostgreSQL (5432) + Redis (6379)"
        ufw allow from "$IP" to any port 5432 proto tcp
        ufw allow from "$IP" to any port 6379 proto tcp
    done

    ufw reload
    echo "✅ 防火墙已配置 (仅白名单 IP 可访问数据库)"
else
    echo "⚠️  未检测到 ufw，请手动配置 iptables/firewalld"
    echo "   需开放 5432 (PG) 和 6379 (Redis) 端口给应用服务器 IP"
fi

# ---- 3. 环境变量 ----
if [ ! -f "$ENV_FILE" ]; then
    echo ""
    echo "📋 创建环境变量..."
    cp .env.production.example "$ENV_FILE"
    echo "⚠️  请编辑 $ENV_FILE 设置数据库密码："
    echo "   vim $SCRIPT_DIR/$ENV_FILE"
    echo ""
    read -rp "   编辑完成后按回车继续..."
fi

set -a
source "$ENV_FILE"
set +a

# ---- 4. 创建备份目录 ----
mkdir -p backups pg-conf

# ---- 5. 创建自定义 PG 配置 (空文件，可后续调优) ----
touch pg-conf/postgresql.conf

# ---- 6. 启动数据库 ----
echo ""
echo "🚀 启动 PostgreSQL + Redis..."
docker compose -f docker-compose.db.yml --env-file "$ENV_FILE" up -d

echo "⏳ 等待数据库就绪..."
sleep 8

# 验证连接
docker exec wr-postgres pg_isready -U "${DB_USER:-wordrhyme}" && echo "✅ PostgreSQL 就绪" || echo "❌ PostgreSQL 启动失败"
docker exec wr-redis redis-cli -a "$REDIS_PASSWORD" ping && echo "✅ Redis 就绪" || echo "❌ Redis 启动失败"

# ---- 7. 设置自动备份 cron ----
echo ""
echo "⏰ 配置每日自动备份 (凌晨 3:00)..."

BACKUP_SCRIPT="$SCRIPT_DIR/db-backup.sh"
cat > "$BACKUP_SCRIPT" << 'BACKUP_EOF'
#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a
source "$SCRIPT_DIR/.env.production"
set +a

BACKUP_DIR="$SCRIPT_DIR/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/wordrhyme_${TIMESTAMP}.sql.gz"

# 备份
docker exec wr-postgres pg_dump -U "${DB_USER:-wordrhyme}" -d "${DB_NAME:-wordrhyme}" \
  --clean --if-exists --no-owner \
  | gzip > "$BACKUP_FILE"

# 保留 30 天
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete

echo "[$(date)] 备份完成: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
BACKUP_EOF

chmod +x "$BACKUP_SCRIPT"

# 加入 crontab
(crontab -l 2>/dev/null | grep -v "db-backup.sh"; echo "0 3 * * * $BACKUP_SCRIPT >> $SCRIPT_DIR/backups/backup.log 2>&1") | crontab -
echo "✅ 每日备份已配置"

# ---- 8. 输出连接信息 ----
DB_SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "=================================="
echo "🎉 数据库服务器部署完成！"
echo ""
echo "📍 连接信息 (填入应用服务器的 .env.production):"
echo ""
echo "   DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_SERVER_IP}:${DB_PORT:-5432}/${DB_NAME}"
echo "   REDIS_URL=redis://:${REDIS_PASSWORD}@${DB_SERVER_IP}:${REDIS_PORT:-6379}"
echo ""
echo "📊 管理命令:"
echo "   查看状态:  docker compose -f docker-compose.db.yml ps"
echo "   查看日志:  docker compose -f docker-compose.db.yml logs -f postgres"
echo "   手动备份:  bash db-backup.sh"
echo "   连接 PG:   docker exec -it wr-postgres psql -U ${DB_USER} -d ${DB_NAME}"
echo "   连接 Redis: docker exec -it wr-redis redis-cli -a ${REDIS_PASSWORD}"
echo "=================================="
