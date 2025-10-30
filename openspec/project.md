# Project Context

## Purpose
Cromwell CMS is a free open-source headless TypeScript CMS built to provide a powerful WordPress-like user experience with modern web technologies. It offers:
- Comprehensive plugin/theming system for extensibility
- Headless architecture for flexible frontend implementation
- Full-featured Admin panel for content management
- Multi-database support with TypeORM
- GraphQL and REST API endpoints

## Tech Stack

### Core Technologies
- **TypeScript 4.8.4** - Primary language across all packages
- **Node.js** - Runtime environment
- **Yarn Workspaces + Lerna** - Monorepo package management

### Frontend Stack
- **React 18.2.0** - UI library
- **Next.js 13.4.4** - React framework for SSR/SSG
- **Material-UI 5.10.x** - Component library (@mui/material, @mui/icons-material, @mui/lab)
- **Emotion 11.10.x** - CSS-in-JS styling (@emotion/react, @emotion/styled)
- **React Router 6.8.2** - Client-side routing
- **GraphQL 15.5.1 + Apollo Client 3.7.1** - Data fetching

### Backend Stack
- **Nest.js 9.2.1** - Backend framework (@nestjs/common, @nestjs/core)
- **Fastify 4.14.1** - HTTP server (@nestjs/platform-fastify)
- **TypeORM 0.2.37** - ORM for database access
- **GraphQL + Apollo Server 4.5.0** - GraphQL API (@nestjs/graphql, type-graphql)
- **Swagger** - REST API documentation (@nestjs/swagger)

### Database Support
- SQLite (default for development)
- MySQL
- MariaDB
- PostgreSQL

### Build Tools
- **Webpack 5.65.0** - Module bundling
- **TypeDI 0.10.0** - Dependency injection
- **ts-node 10.9.1** - TypeScript execution

### Testing
- **Jest** - Test framework (separate configurations per package)

### Validation & Transformation
- **class-validator 0.13.1** - Validation decorators
- **class-transformer 0.4.0** - Object transformation

## Project Conventions

### Code Style
- **Prettier** for code formatting across all file types (JS, JSX, JSON, CSS, SCSS, MD, TS, TSX)
- **TypeScript strict mode** with comprehensive type coverage
- **Consistent naming patterns** - read existing codebase before adding new names
- **NO emojis** unless explicitly requested
- **Concise communication** - short summaries preferred, detailed breakdowns only when working through plans

### Architecture Patterns

#### Monorepo Structure
```
system/
├── core/
│   ├── common/      # Shared types, constants, utilities
│   ├── backend/     # Server-side helpers, repositories, DB utilities
│   └── frontend/    # Client-side helpers, API clients, React components
├── server/          # Main API server (REST + GraphQL)
├── admin/           # Next.js-based admin panel
├── renderer/        # Next.js service for theme/plugin rendering
├── manager/         # Orchestration service
├── cli/             # Command-line interface (cromwell/crw)
└── utils/           # Module bundler/compiler/package manager
plugins/             # Modular functionality extensions
themes/              # Complete site templates
toolkits/            # Reusable component libraries
```

#### Service Communication
- **Main Entry Point**: http://localhost:4016 (proxy handles all routing)
- **API Server**: http://localhost:4016/api (REST + GraphQL)
- **Admin Panel**: http://localhost:4064
- **Renderer**: http://localhost:4128
- Ports configurable via cmsconfig.json

#### Key Principles
- **NO PARTIAL IMPLEMENTATION** - complete features fully
- **NO SIMPLIFICATION** - no placeholder comments about future implementation
- **NO CODE DUPLICATION** - reuse existing functions and constants
- **NO DEAD CODE** - delete unused code completely
- **NO OVER-ENGINEERING** - simple functions over unnecessary abstractions
- **NO MIXED CONCERNS** - proper separation (validation, API handlers, DB queries, UI)
- **NO RESOURCE LEAKS** - always close connections, clear timeouts, remove listeners

#### Error Handling Philosophy
- **Fail fast** for critical configuration (e.g., missing text model)
- **Log and continue** for optional features (e.g., extraction model)
- **Graceful degradation** when external services unavailable
- **User-friendly messages** through resilience layer

### Testing Strategy

#### Test Execution
- **ALWAYS use test-runner sub-agent** to execute tests
- **NO mock services** - use real services for all tests
- **Complete one test before moving on** - don't skip ahead on failures
- **Verify test structure first** - check if test is correct before refactoring codebase
- **Verbose tests** for debugging purposes

#### Test Coverage
- **IMPLEMENT TEST FOR EVERY FUNCTION** - no exceptions
- **NO CHEATER TESTS** - tests must be accurate, reflect real usage, designed to reveal flaws
- **Comprehensive test suites per package**:
  - system/server
  - system/admin
  - system/core/frontend
  - system/core/backend
  - system/cli
  - system/utils
  - toolkits/commerce

#### Test Commands
```bash
npm run test           # Run all tests
npm run test:server    # Test server components
npm run test:admin     # Test admin panel
npm run test:backend   # Test backend core
npm run test:frontend  # Test frontend core
npm run test:cli       # Test CLI
npm run test:utils     # Test utils
npm run test:commerce  # Test commerce toolkit
```

### Git Workflow
- **Main branch**: `main`
- Standard git workflow with feature branches
- No specific branching strategy enforced
- Commit messages should be clear and descriptive

## Domain Context

### Plugin System
- Plugins extend CMS functionality (newsletter, payments, search, etc.)
- Standard structure with `cromwell.config.js`
- Support both frontend components and backend resolvers/controllers
- Hot reloading in development mode
- Safe reloads for production plugin updates

### Theme System
- Themes are Next.js applications with Cromwell integrations
- Support custom pages, components, and styling
- Use `npm run watch` in theme directories for development
- Complete site templates for different use cases (store, blog)

### Toolkits
- Reusable component libraries shared across themes/plugins
- Example: `toolkits/commerce` for e-commerce functionality

### Service Orchestration
- **Manager** service controls other services
- **CLI** provides `cromwell` or `crw` commands for service management
- Individual services can run in isolation with watchers
- Development mode starts all services with hot reloading

## Important Constraints

### Installation
- **NEVER run `npm install` manually** - startup.js handles all installations
- Use Yarn for dependency management in development
- Build process automatically handles workspace dependencies
- Manual installation can break the monorepo structure

### Development Requirements
- Use CLI commands (`npx crw`) for service management
- Respect version resolutions in root package.json (locked versions for consistency)
- Database-specific migrations (separate folders per DB type)
- TypeScript compilation required before deployment

### Sub-Agent Usage for Context Optimization
1. **file-analyzer** - Always use when reading files (especially logs)
2. **code-analyzer** - Always use for searching code, analyzing code, researching bugs, tracing logic
3. **test-runner** - Always use to run tests and analyze results

### Communication Style
- Criticism welcomed - point out mistakes or better approaches
- Skeptical mindset - question assumptions
- Ask questions when uncertain - don't guess intent
- Occasional pleasantries fine, but no flattery or excessive compliments
- No unsolicited judgments or praise

## External Dependencies

### Required Services
- **TypeORM** for database abstraction layer
- **Apollo Server/Client** for GraphQL communication
- **Next.js** for SSR/SSG rendering
- **Nest.js** for backend API framework
- **Fastify** for HTTP server performance

### Optional Services
- **MariaDB** (docker: `npm run docker:start-dev-mariadb`)
- **PostgreSQL** (docker: `npm run docker:start-dev-postgres`)
- **Stripe** (payment plugin)
- **PayPal** (payment plugin)
- **Marqo** (search plugin)

### Development Tools
- Docker for development databases
- Lerna for versioning and publishing
- Prettier for code formatting
- Jest for testing
- Webpack for bundling

### API Endpoints
- **GraphQL Endpoint**: http://localhost:4016/api/graphql
- **GraphQL Playground**: https://studio.apollographql.com/sandbox/explorer?endpoint=http%3A%2F%2Flocalhost%3A4016%2Fapi%2Fgraphql
- **Swagger REST API**: http://localhost:4016/api/api-docs/
