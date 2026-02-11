# 快速启动测试环境

## 1. 环境要求

- Node.js >= 20.0.0
- pnpm 9.15.0+
- PostgreSQL (本地或 Docker)
- Redis (本地或 Docker)

## 2. 启动依赖服务

### 使用 Docker (推荐)

```bash
# 启动 PostgreSQL 和 Redis
docker run -d --name wordrhyme-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=wordrhyme \
  -p 5432:5432 \
  postgres:15

docker run -d --name wordrhyme-redis \
  -p 6379:6379 \
  redis:7-alpine
```

### 验证服务

```bash
# PostgreSQL
docker exec wordrhyme-postgres pg_isready

# Redis
docker exec wordrhyme-redis redis-cli ping
```

## 3. 配置环境变量

```bash
# 复制环境变量模板 (如果存在)
cp apps/server/.env.example apps/server/.env

# 或手动创建 apps/server/.env
cat > apps/server/.env << 'EOF'
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wordrhyme

# Redis
REDIS_URL=redis://localhost:6379

# Auth
BETTER_AUTH_SECRET=your-secret-key-at-least-32-characters-long
BETTER_AUTH_URL=http://localhost:3000

# Encryption (for Settings)
SETTINGS_ENCRYPTION_KEY=your-32-byte-encryption-key-here

# Optional: S3 (skip for local storage)
# S3_BUCKET=
# S3_REGION=
# S3_ACCESS_KEY_ID=
# S3_SECRET_ACCESS_KEY=
EOF
```

## 4. 安装依赖

```bash
# 在项目根目录
pnpm install
```

## 5. 初始化数据库

```bash
# 生成 schema
pnpm db:generate

# 推送到数据库
pnpm --filter @wordrhyme/server db:push

# 运行 seed 创建初始数据
pnpm --filter @wordrhyme/server db:seed

# 创建测试账户
pnpm --filter @wordrhyme/server seed:test-accounts
```

## 6. 启动服务

### 开发模式 (热重载)

```bash
# 终端 1: 启动后端
cd apps/server && pnpm dev

# 终端 2: 启动前端
cd apps/admin && pnpm dev
```

### 或使用 Turbo 一键启动

```bash
# 在根目录
pnpm dev
```

## 7. 访问服务

| 服务 | URL |
|------|-----|
| Admin 前端 | http://localhost:5173 |
| API 后端 | http://localhost:3000 |
| tRPC Playground | http://localhost:3000/trpc |
| Drizzle Studio | `pnpm --filter @wordrhyme/server db:studio` |

## 8. 测试账户

如果运行了 `seed:test-accounts`，应该有以下测试账户：

| 角色 | 邮箱 | 密码 |
|------|------|------|
| 超级管理员 | admin@test.com | password123 |
| 租户 A 管理员 | admin-a@test.com | password123 |
| 租户 B 管理员 | admin-b@test.com | password123 |
| 普通用户 | user@test.com | password123 |

> **注意**: 具体账户信息请查看 `apps/server/src/db/seed/seed-test-accounts.ts`

## 9. 常用命令

```bash
# 运行后端测试
pnpm --filter @wordrhyme/server test

# 运行前端测试
pnpm --filter @wordrhyme/admin test

# 查看数据库
pnpm --filter @wordrhyme/server db:studio

# 重置开发数据库
pnpm --filter @wordrhyme/server script:reset-dev

# 类型检查
pnpm type-check

# 代码检查
pnpm lint
```

## 10. 问题排查

### 数据库连接失败

```bash
# 检查 PostgreSQL 是否运行
docker ps | grep postgres

# 检查连接
psql -h localhost -U postgres -d wordrhyme -c "SELECT 1"
```

### Redis 连接失败

```bash
# 检查 Redis 是否运行
docker ps | grep redis

# 测试连接
redis-cli ping
```

### 端口冲突

```bash
# 检查端口占用
lsof -i :3000  # 后端
lsof -i :5173  # 前端
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
```

### 清理重新开始

```bash
# 停止并删除容器
docker stop wordrhyme-postgres wordrhyme-redis
docker rm wordrhyme-postgres wordrhyme-redis

# 清理 node_modules
pnpm clean

# 重新安装
pnpm install
```

---

## 下一步

环境启动成功后，按照 `manual-test-checklist.md` 进行手动功能测试。
