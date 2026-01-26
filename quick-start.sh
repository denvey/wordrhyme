#!/bin/bash

# 开发环境快速初始化脚本
# 运行: bash quick-start.sh

set -e

echo ""
echo "==================================="
echo "  开发环境快速初始化"
echo "==================================="
echo ""

# 加载 .env 文件（如果存在）
if [ -f ".env" ]; then
    echo "📄 加载 .env 文件..."
    export $(grep -v '^#' .env | xargs)
    echo "✓ .env 文件已加载"
    echo ""
fi

# 检查 DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo "❌ 错误: DATABASE_URL 环境变量未设置"
    echo "   请在 .env 文件中配置 DATABASE_URL"
    exit 1
fi

echo "✓ DATABASE_URL 已配置"
echo ""

# 步骤 1: 运行数据库迁移
echo "📦 步骤 1/3: 运行数据库迁移..."
cd apps/server
pnpm drizzle-kit push
cd ../..
echo "✓ 数据库 schema 已更新"
echo ""

# 步骤 2: 询问是否重置数据库
read -p "是否重置数据库（删除所有数据）？(y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔄 重置数据库..."
    pnpm --filter @wordrhyme/server script:reset-dev
    echo "✓ 数据库已重置"
else
    echo "⊙ 跳过数据库重置"
fi
echo ""

# 步骤 3: 初始化系统数据
echo "🌱 步骤 2/3: 初始化系统数据..."
pnpm --filter @wordrhyme/server script:seed-initial
echo ""

# 步骤 4: 配置跨租户权限（可选）
read -p "是否配置跨租户权限？(Y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo "🔐 配置跨租户权限..."
    pnpm --filter @wordrhyme/server script:setup-cross-tenant
    echo ""
fi

# 完成
echo "==================================="
echo "  ✅ 初始化完成！"
echo "==================================="
echo ""
echo "下一步:"
echo "  1. 启动应用: pnpm dev"
echo "  2. 访问: http://localhost:5173"
echo "  3. 使用管理员账号登录"
echo ""
echo "管理员账号:"
if [ -n "$ADMIN_EMAIL" ]; then
    echo "  邮箱: $ADMIN_EMAIL"
else
    echo "  邮箱: admin@example.com"
fi
if [ -n "$ADMIN_PASSWORD" ]; then
    echo "  密码: $ADMIN_PASSWORD"
else
    echo "  密码: Admin123456!"
fi
echo ""
echo "提示:"
echo "  - 切换到 Platform 组织以使用跨租户功能"
echo "  - 查看文档: DEV_SETUP_GUIDE.md"
echo ""
