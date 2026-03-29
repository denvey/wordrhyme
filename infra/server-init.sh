#!/bin/bash
# ============================================================
# 服务器初始化脚本 — 在新服务器上运行
# 适用于: 阿里云 ECS / DMIT VPS (Ubuntu 22.04+)
#
# Usage: curl -sSL <raw-url> | bash
# 或者:  bash infra/server-init.sh
# ============================================================

set -euo pipefail

echo "🖥️  WordRhyme 服务器初始化"
echo "=================================="

# 1. 系统更新
echo "📦 更新系统包..."
sudo apt-get update -y
sudo apt-get upgrade -y

# 2. 安装基础工具
echo "🔧 安装基础工具..."
sudo apt-get install -y \
    curl wget git \
    ca-certificates gnupg lsb-release \
    ufw fail2ban \
    htop iotop

# 3. 安装 Docker
echo "🐳 安装 Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    sudo systemctl enable docker
    sudo systemctl start docker
    echo "✅ Docker 已安装"
else
    echo "✅ Docker 已存在: $(docker --version)"
fi

# 4. 配置防火墙
echo "🔥 配置防火墙..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw --force enable
echo "✅ 防火墙已配置 (22, 80, 443)"

# 5. 配置 fail2ban
echo "🛡️  配置 fail2ban..."
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# 6. 配置系统优化
echo "⚡ 系统优化..."
# 增大文件描述符限制
cat <<'EOF' | sudo tee -a /etc/security/limits.conf
* soft nofile 65536
* hard nofile 65536
EOF

# Docker daemon 优化
sudo mkdir -p /etc/docker
cat <<'EOF' | sudo tee /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
EOF
sudo systemctl restart docker

# 7. 创建项目目录
DEPLOY_DIR="/opt/wordrhyme"
echo "📁 创建项目目录: $DEPLOY_DIR"
sudo mkdir -p "$DEPLOY_DIR"
sudo chown "$USER:$USER" "$DEPLOY_DIR"

# 8. 克隆代码
echo "📥 克隆代码..."
if [ ! -d "$DEPLOY_DIR/.git" ]; then
    git clone git@github.com:denvey/dsneo.git "$DEPLOY_DIR"
else
    echo "   项目已存在，跳过克隆"
fi

echo ""
echo "=================================="
echo "🎉 服务器初始化完成！"
echo ""
echo "➡️ 下一步:"
echo "   1. cd $DEPLOY_DIR/infra"
echo "   2. cp .env.production.example .env.production"
echo "   3. vim .env.production    # 填入真实配置"
echo "   4. bash deploy-init.sh    # 一键部署"
echo ""
echo "⚠️ 别忘了配置 GitHub Secrets:"
echo "   SERVER_HOST  = $(curl -s ifconfig.me)"
echo "   SERVER_USER  = $USER"
echo "   SERVER_PORT  = 22"
echo "   SSH_PRIVATE_KEY = (本机 ~/.ssh/id_ed25519 私钥内容)"
echo "=================================="
