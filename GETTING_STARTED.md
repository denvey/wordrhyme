# Getting Started with WordRhyme Development

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Docker (optional, for database)

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start infrastructure (PostgreSQL + Redis)
docker compose -f infra/docker-compose.yml up -d

# 3. Push database schema
pnpm --filter @wordrhyme/server db:push

# 4. Seed core data
pnpm --filter @wordrhyme/server db:seed

# 5. Start development servers
pnpm dev
```

## Project Structure

```
wordrhyme/
├── apps/
│   ├── server/       # NestJS + Fastify + tRPC (port 3000)
│   ├── admin/        # React + Rsbuild + MF2.0 (port 3001)
│   └── web/          # Next.js 15 (port 3002)
├── packages/
│   ├── plugin/       # @wordrhyme/plugin SDK
│   ├── core/         # @wordrhyme/core API client
│   └── ui/           # @wordrhyme/ui shared components
├── plugins/          # Plugin development directory
│   └── hello-world/  # Example plugin
└── infra/           # Docker compose files
```

## Development URLs

| Service | URL |
|---------|-----|
| Admin UI | http://localhost:3001 |
| API Server | http://localhost:3000 |
| tRPC Endpoint | http://localhost:3000/trpc |
| Drizzle Studio | `pnpm --filter @wordrhyme/server db:studio` |

## Build Commands

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @wordrhyme/server build
pnpm --filter @wordrhyme/admin build

# Type check
pnpm type-check
```

## Testing

```bash
# Run all tests
pnpm test

# Run server tests
pnpm --filter @wordrhyme/server test

# Run tests in watch mode
pnpm --filter @wordrhyme/server test:watch

# Run tests with coverage
pnpm --filter @wordrhyme/server test:coverage
```

## Plugin Development

For detailed plugin development guide, see [docs/PLUGIN_TUTORIAL.md](docs/PLUGIN_TUTORIAL.md).

Quick start:

1. Create a new directory in `plugins/`:
   ```bash
   mkdir -p plugins/my-plugin/src/server
   ```

2. Add `manifest.json`:
   ```json
   {
     "pluginId": "com.example.my-plugin",
     "version": "1.0.0",
     "name": "My Plugin",
     "type": "full",
     "runtime": "node",
     "engines": { "wordrhyme": "^0.1.0" }
   }
   ```

3. Implement server entry:
   ```typescript
   // plugins/my-plugin/src/server/index.ts
   import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin';
   
   export const router = pluginRouter({
     hello: pluginProcedure.query(() => 'Hello!')
   });
   ```

4. Build and test:
   ```bash
   pnpm --filter my-plugin build
   ```

## Environment Variables

See `.env.example` for all available options:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `DATABASE_URL` | PostgreSQL connection | - |
| `PLUGIN_DIR` | Plugin directory | ./plugins |
| `WORDRHYME_SAFE_MODE` | Skip non-core plugins | false |

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker compose -f infra/docker-compose.yml ps

# View logs
docker compose -f infra/docker-compose.yml logs postgres

# Reset database
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d
pnpm --filter @wordrhyme/server db:push
pnpm --filter @wordrhyme/server db:seed
```

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Plugin Not Loading

1. Check manifest.json is valid JSON
2. Verify `engines.wordrhyme` version matches
3. Check server logs for errors
4. Ensure plugin is built: `pnpm --filter <plugin> build`

### Module Federation Errors

1. Clear browser cache and reload
2. Rebuild admin: `pnpm --filter @wordrhyme/admin build`
3. Check plugin remoteEntry.js is accessible

## Development Workflow

1. **Start infrastructure**: `docker compose -f infra/docker-compose.yml up -d`
2. **Run dev servers**: `pnpm dev` (runs all apps concurrently)
3. **Make changes**: Edit files in `apps/` or `packages/`
4. **Test**: `pnpm test`
5. **Type check**: `pnpm type-check`
6. **Build**: `pnpm build`

## Next Steps

- [Plugin Development Tutorial](docs/PLUGIN_TUTORIAL.md)
- [API Reference](docs/API_REFERENCE.md)
- [Architecture Overview](docs/ARCHITECTURE.md)

