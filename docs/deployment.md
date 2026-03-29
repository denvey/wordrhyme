# WordRhyme 生产环境部署指南

## 概述

WordRhyme 支持两种生产部署架构，根据你的服务器资源灵活选择：

| 架构 | 适用场景 | 服务器要求 |
|------|---------|-----------|
| **A. 单机全量部署** | 个人/小团队，1 台服务器搞定 | 2C4G+ |
| **B. 多机分离部署** | 高可用/大流量，数据库独立 | 应用 1C2G+，数据库 2C4G+ |

两种架构使用**同一套 CI/CD 流水线**（GitHub Actions），差异仅在服务器配置。

---

## 架构图

### A. 单机全量部署

```
                    GitHub Actions
                         │
                    Build → Push GHCR
                         │
                    SSH Deploy
                         ↓
┌────────────────── 服务器 (1台) ──────────────────┐
│                                                   │
│   ┌─── Nginx (:80/:443) ───┐                    │
│   │  SSL 终端 + 反向代理    │                    │
│   └──┬──────┬──────┬───────┘                    │
│      ↓      ↓      ↓                            │
│   Server  Admin   Web                            │
│   :3000   :80    :3002                           │
│      │                                            │
│      ↓                                            │
│   PostgreSQL (:5432)  +  Redis (:6379)           │
│   (Docker 容器，本机)                             │
│                                                   │
│   Certbot (SSL 自动续期)                          │
└───────────────────────────────────────────────────┘
```

### B. 多机分离部署

```
                    GitHub Actions
                         │
                    Build → Push GHCR
                         │
            ┌────────────┼────────────┐
            ↓            ↓            ↓
     ┌─ App Server 1 ─┐ ┌─ App 2 ─┐ ┌─ App N ─┐
     │ Nginx+Server    │ │  ...    │ │  ...    │
     │ Admin+Web       │ │         │ │         │
     └───────┬─────────┘ └────┬────┘ └────┬────┘
             │                │           │
             └────────────────┼───────────┘
                              ↓
              ┌──── DB Server (1台) ────┐
              │   PostgreSQL (:5432)    │
              │   Redis (:6379)         │
              │   防火墙白名单          │
              │   每日自动备份          │
              └─────────────────────────┘
```

---

## 前置要求

- **域名**: 准备 3 个子域名，解析到服务器 IP
  - `api.example.com` → API 服务
  - `admin.example.com` → 管理后台
  - `example.com` → 前台网站
- **GitHub**: 仓库开启 Packages 权限（GHCR 镜像存储）
- **服务器 OS**: Ubuntu 22.04+ (推荐)

---

## A. 单机全量部署

适合入门，所有服务跑在一台机器上。

### 步骤 1：初始化服务器

```bash
# SSH 到服务器
ssh root@your-server-ip

# 创建项目目录
mkdir -p /opt/wordrhyme
cd /opt/wordrhyme

# 上传 infra 目录
# (本地执行)
scp -r infra/ root@your-server-ip:/opt/wordrhyme/

# 运行初始化脚本 (安装 Docker、防火墙、fail2ban)
bash infra/server-init.sh
```

### 步骤 2：配置环境变量

```bash
cd /opt/wordrhyme/infra

# 复制模板
cp .env.production.example .env.production

# 编辑，填入真实值
vim .env.production
```

**必填项:**

```bash
# 域名
SERVER_DOMAIN=api.example.com
ADMIN_DOMAIN=admin.example.com
WEB_DOMAIN=example.com

# 数据库 (单机模式只需设这 3 个)
DB_USER=wordrhyme
DB_PASSWORD=你的强密码1
DB_NAME=wordrhyme

# Redis
REDIS_PASSWORD=你的强密码2

# CORS
CORS_ORIGINS=https://example.com,https://admin.example.com

# 管理员
APP_URL=https://api.example.com
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=你的管理员密码
```

### 步骤 3：首次部署

```bash
# 一键完成: SSL证书 → 拉取镜像 → 启动服务 → 数据库迁移 → 种子数据
bash infra/deploy-init.sh
```

脚本会要求输入 GitHub Personal Access Token (需 `read:packages` 权限):
- 创建地址: https://github.com/settings/tokens/new?scopes=read:packages

### 步骤 4：配置 GitHub Actions

在 GitHub 仓库 → **Settings → Secrets and variables → Actions** 添加:

| Secret | 值 |
|--------|-----|
| `SERVER_HOST` | 服务器公网 IP |
| `SERVER_USER` | `root` (或部署用户) |
| `SSH_PRIVATE_KEY` | SSH 私钥 (见下面生成方式) |
| `SERVER_PORT` | SSH 端口 (默认 `22`) |

在 **Settings → Environments** 创建环境 `production-aliyun`，把上面的 Secrets 放在此环境下。

**生成部署专用 SSH 密钥:**

```bash
# 本地执行
ssh-keygen -t ed25519 -C "deploy@wordrhyme" -f ~/.ssh/wordrhyme_deploy -N ""

# 公钥加到服务器
ssh-copy-id -i ~/.ssh/wordrhyme_deploy.pub root@your-server-ip

# 私钥内容粘贴到 GitHub Secret
cat ~/.ssh/wordrhyme_deploy
```

### 步骤 5：验证

```bash
# 查看服务状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.prod.yml logs -f server

# 访问
curl https://api.example.com/api/health
```

之后每次 `git push origin main`，GitHub Actions 会自动部署。

---

## B. 多机分离部署

将数据库部署在独立服务器上，多台应用服务器共享数据库。

### 步骤 1：部署数据库服务器

```bash
# 上传文件到数据库服务器
scp -r infra/ root@db-server-ip:/opt/wordrhyme-db/

# SSH 到数据库服务器
ssh root@db-server-ip
cd /opt/wordrhyme-db

# 配置环境变量 (与应用服务器共用同一份模板)
cp .env.production.example .env.production
vim .env.production   # 至少填 DB_USER / DB_PASSWORD / REDIS_PASSWORD

# 运行数据库初始化脚本
bash db-init.sh
```

脚本会：
1. 安装 Docker
2. 让你输入应用服务器的 IP 列表（防火墙白名单）
3. 从 `.env.production` 读取数据库配置
4. 启动 PostgreSQL + Redis
5. 配置每日自动备份 (cron)
6. **输出连接串** ← 复制保存

输出示例:
```
DATABASE_URL=postgresql://wordrhyme:xxx@10.0.0.1:5432/wordrhyme
REDIS_URL=redis://:xxx@10.0.0.1:6379
```

### 步骤 2：部署应用服务器（每台都做）

```bash
ssh root@app-server-ip
mkdir -p /opt/wordrhyme
```

```bash
# 本地上传
scp -r infra/ root@app-server-ip:/opt/wordrhyme/

# 服务器上初始化
cd /opt/wordrhyme
bash infra/server-init.sh

# 配置环境变量
cd infra
cp .env.production.example .env.production
vim .env.production
```

**关键区别** — 填入数据库服务器的连接串：

```bash
# ⚠️ 不要设 DB_USER / DB_PASSWORD / DB_NAME
# 直接写完整外部连接串:
DATABASE_URL=postgresql://wordrhyme:xxx@db-server-ip:5432/wordrhyme
REDIS_URL=redis://:xxx@db-server-ip:6379

# 域名、CORS、管理员等同单机模式...
```

然后执行首次部署:
```bash
bash deploy-init.sh
```

### 步骤 3：配置 GitHub Actions 多环境

在 GitHub → **Settings → Environments** 创建多个环境：

```
production-aliyun   → SERVER_HOST=1.1.1.1
production-dmit     → SERVER_HOST=2.2.2.2
```

每个环境独立配置 `SERVER_HOST`、`SERVER_USER`、`SSH_PRIVATE_KEY`。

> **注意:** 修改 `.github/workflows/deploy.yml` 中 deploy job 的 matrix 数组，加入新环境名：
> ```yaml
> && '["production-aliyun","production-dmit"]'
> ```

手动触发部署时可选择部署到 `all` 或指定环境。

---

## 日常运维

### 常规发布（无数据库变更）

```bash
git push origin main
# → GitHub Actions 自动: Lint → Test → Build 镜像 → 部署
```

### 有数据库变更的发布

```bash
# 1. 本地生成 SQL 迁移
pnpm db:generate

# 2. 提交
git add apps/server/drizzle/
git commit -m "feat: add xxx table"
git push origin main

# 3. GitHub Actions → Run workflow → 勾选 ✅ "运行数据库迁移"
```

### 紧急修复

```
GitHub Actions → Run workflow → 勾选 ✅ "跳过测试"
```

### 手动更新

```bash
# SSH 到服务器
cd /opt/wordrhyme/infra

# 拉取最新镜像并重启
bash deploy-update.sh

# 如果需要迁移
bash deploy-update.sh --migrate
```

### 查看状态

```bash
# 服务状态
docker compose -f docker-compose.prod.yml ps

# 实时日志
docker compose -f docker-compose.prod.yml logs -f server

# 最近 100 行
docker compose -f docker-compose.prod.yml logs --tail=100 server
```

### 手动迁移

```bash
docker exec wr-server sh -c "cd /app/apps/server && node dist/db/migrate-prod.js"
```

### 回滚

```bash
# 回退到指定 commit 的镜像
IMAGE_PREFIX=ghcr.io/denvey/dsneo
docker pull ${IMAGE_PREFIX}/server:abc1234    # commit sha 前 7 位
docker pull ${IMAGE_PREFIX}/admin:abc1234
docker pull ${IMAGE_PREFIX}/web:abc1234

# 重启
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

---

## 备份

### 自动备份

GitHub Actions 每天北京时间 11:00 自动运行 `Database Backup` 工作流：
- **本地**: 服务器 `/opt/wordrhyme/backups/`，保留 7 天
- **云存储** (可选): S3 兼容存储，保留 60 天

### 开启云存储备份

在 GitHub → **Settings → Secrets and variables → Actions** 添加:

| Secret | 示例值 (阿里云 OSS) |
|--------|---------------------|
| `BACKUP_S3_ENDPOINT` | `https://oss-us-west-1.aliyuncs.com` |
| `BACKUP_S3_BUCKET` | `wordrhyme-backups` |
| `BACKUP_S3_ACCESS_KEY` | OSS AccessKey ID |
| `BACKUP_S3_SECRET_KEY` | OSS AccessKey Secret |

也支持 Cloudflare R2、AWS S3、MinIO 等任何 S3 兼容存储。

### 手动备份

```bash
# 通过 GitHub Actions
# → Actions → Database Backup → Run workflow

# 或 SSH 到服务器
docker exec wr-postgres pg_dump -U wordrhyme -d wordrhyme \
  --clean --if-exists --no-owner | gzip > backup_$(date +%Y%m%d).sql.gz
```

### 恢复数据库

```bash
# 解压并恢复
gunzip -c backup_20260329.sql.gz | docker exec -i wr-postgres psql -U wordrhyme -d wordrhyme
```

---

## 服务器迁移

从阿里云迁移到 DMIT（或任何新服务器）：

```bash
# 1. 新服务器初始化
ssh root@new-server
bash server-init.sh

# 2. 复制环境变量（只改域名 IP 相关的）
scp root@old-server:/opt/wordrhyme/infra/.env.production .

# 3. 首次部署
bash deploy-init.sh

# 4. 恢复数据
scp root@old-server:/opt/wordrhyme/backups/latest.sql.gz .
gunzip -c latest.sql.gz | docker exec -i wr-postgres psql -U wordrhyme -d wordrhyme

# 5. 更新 DNS 解析到新 IP

# 6. 更新 GitHub Secret: SERVER_HOST → 新 IP
```

---

## 文件清单

```
wordrhyme/
├── Dockerfile                          # 多阶段构建 (server/admin/web)
├── .dockerignore                       # Docker 构建排除
│
├── .github/workflows/
│   ├── deploy.yml                      # CI/CD 流水线 (多环境)
│   └── backup.yml                      # 每日自动备份
│
└── infra/
    ├── docker-compose.prod.yml         # 应用服务编排 (全量/无状态)
    ├── docker-compose.db.yml           # 数据库服务编排 (独立部署)
    ├── docker-compose.yml              # 本地开发用
    │
    ├── .env.production.example         # 统一环境变量模板 (应用+数据库共用)
    │
    ├── server-init.sh                  # 服务器初始化 (Docker/防火墙)
    ├── deploy-init.sh                  # 应用首次部署 (SSL/镜像/迁移)
    ├── deploy-update.sh                # 手动更新部署
    ├── db-init.sh                      # 数据库服务器初始化
    │
    └── nginx/
        ├── gateway.conf.template       # Nginx 反向代理 (多域名)
        ├── admin.conf                  # Admin SPA 路由
        └── ssl-params.conf            # SSL 安全参数
```

---

## 安全注意事项

1. **`.env.production`** 包含所有密码，**严禁**提交到 Git
2. 数据库服务器的防火墙**只允许应用服务器 IP** 访问 5432/6379 端口
3. 使用**专用部署密钥**，不要用个人 SSH 密钥
4. Docker 镜像**不含源码**，只有编译后的 JS 产物
5. SSL 证书由 Certbot 自动续期，无需手动管理
