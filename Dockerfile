# ============================================================
# WordRhyme Multi-Stage Dockerfile
# Targets: server, admin, web
# Build: docker build --target <target> -t wordrhyme-<target> .
#
# 安全设计: 最终镜像只包含编译产物 (dist/)，不含 .ts 源码
# ============================================================

# ===================== Base =====================
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ===================== Dependencies =====================
FROM base AS deps

# Copy workspace config and all package.json files for dependency resolution
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json tsconfig.json turbo.json biome.json ./

# Apps
COPY apps/server/package.json apps/server/
COPY apps/admin/package.json apps/admin/
COPY apps/web/package.json apps/web/

# Packages
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/plugin/package.json packages/plugin/
COPY packages/ui/package.json packages/ui/

# Plugins — copy all plugin package.json files
COPY plugins/alibaba-1688/package.json plugins/alibaba-1688/
COPY plugins/aliexpress/package.json plugins/aliexpress/
COPY plugins/dsuni/package.json plugins/dsuni/
COPY plugins/email-resend/package.json plugins/email-resend/
COPY plugins/example-observability/package.json plugins/example-observability/
COPY plugins/hello-world/package.json plugins/hello-world/
COPY plugins/lbac-relationships/package.json plugins/lbac-relationships/
COPY plugins/lbac-spaces/package.json plugins/lbac-spaces/
COPY plugins/lbac-teams/package.json plugins/lbac-teams/
COPY plugins/logger-pino/package.json plugins/logger-pino/
COPY plugins/search-postgres/package.json plugins/search-postgres/
COPY plugins/shop/package.json plugins/shop/
COPY plugins/shopify/package.json plugins/shopify/
COPY plugins/storage-s3/package.json plugins/storage-s3/
COPY plugins/woocommerce/package.json plugins/woocommerce/

RUN pnpm install --frozen-lockfile --ignore-scripts

# ===================== Builder =====================
FROM deps AS builder
COPY . .

# Build everything: packages → plugins → apps (turbo handles dependency order)
RUN pnpm turbo run build

# ---- 清理源码，只保留编译产物 ----
# 删除所有 packages/*/src 目录 (运行时只需 dist/)
RUN find packages -type d -name "src" -exec rm -rf {} + 2>/dev/null || true
# 删除所有 plugins/*/src 目录
RUN find plugins -type d -name "src" -exec rm -rf {} + 2>/dev/null || true
# 删除 .ts 源文件（保留 .d.ts 类型声明）
RUN find packages plugins -name "*.ts" ! -name "*.d.ts" -delete 2>/dev/null || true
RUN find packages plugins -name "*.tsx" -delete 2>/dev/null || true
# 删除开发配置文件
RUN find packages plugins -name "tsconfig*.json" -delete 2>/dev/null || true
RUN find packages plugins -name "vitest*.config.*" -delete 2>/dev/null || true
RUN find packages plugins -name "*.test.*" -delete 2>/dev/null || true
RUN find packages plugins -name "*.spec.*" -delete 2>/dev/null || true

# ===================== Target: server =====================
FROM base AS server
WORKDIR /app

# node_modules (for workspace resolution)
COPY --from=builder /app/node_modules ./node_modules

# Server compiled output only
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules

# Drizzle migrations (SQL files, for runtime db:migrate)
COPY --from=builder /app/apps/server/drizzle ./apps/server/drizzle

# Packages — only dist/ (compiled JS), no src/ (TS source)
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/package.json
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/package.json
COPY --from=builder /app/packages/plugin/dist ./packages/plugin/dist
COPY --from=builder /app/packages/plugin/package.json ./packages/plugin/package.json
COPY --from=builder /app/packages/ui/dist ./packages/ui/dist
COPY --from=builder /app/packages/ui/package.json ./packages/ui/package.json

# Plugins — only dist/ (compiled server JS + admin static assets)
# 这些是 builder 阶段已清理过源码的产物
COPY --from=builder /app/plugins ./plugins

# Root workspace config (pnpm workspace resolution)
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

ENV NODE_ENV=production
EXPOSE 3000

WORKDIR /app/apps/server
CMD ["node", "dist/main.js"]

# ===================== Target: admin =====================
# 纯静态文件，最干净的镜像
FROM nginx:1.27-alpine AS admin

COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html
COPY infra/nginx/admin.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# ===================== Target: web =====================
FROM base AS web
WORKDIR /app

# Next.js 构建产物
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules

# node_modules (workspace resolution)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Packages — only dist/ (Next.js SSR 运行时可能需要)
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/package.json
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/package.json
COPY --from=builder /app/packages/plugin/dist ./packages/plugin/dist
COPY --from=builder /app/packages/plugin/package.json ./packages/plugin/package.json
COPY --from=builder /app/packages/ui/dist ./packages/ui/dist
COPY --from=builder /app/packages/ui/package.json ./packages/ui/package.json

ENV NODE_ENV=production
EXPOSE 3002

WORKDIR /app/apps/web
CMD ["node_modules/.bin/next", "start", "--port", "3002"]
