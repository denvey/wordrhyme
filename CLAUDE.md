# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cromwell CMS is a free open-source headless TypeScript CMS built with React, Next.js, Nest.js, and TypeORM. It provides a powerful plugin/theming system with a comprehensive Admin panel for WordPress-like user experience.

## Architecture

Cromwell CMS operates as a monorepo with multiple interconnected services:

### Core Services (system/)
- **API Server & Proxy** (`system/server`) - Main API server with REST/GraphQL endpoints and proxy handling
- **Admin Panel** (`system/admin`) - Next.js-based management interface 
- **Renderer** (`system/renderer`) - Next.js service that compiles and serves theme/plugin files
- **Manager** (`system/manager`) - Main orchestration service that controls other services
- **CLI** (`system/cli`) - Command-line interface (`cromwell` or `crw` commands)
- **Utils** (`system/utils`) - Module bundler/compiler/package manager

### Core Libraries (system/core/)
- **Common** (`system/core/common`) - Shared types, constants, and utilities
- **Backend** (`system/core/backend`) - Server-side helpers, repositories, and database utilities
- **Frontend** (`system/core/frontend`) - Client-side helpers, API clients, and React components

### Extensions
- **Plugins** (`plugins/`) - Modular functionality extensions (newsletter, payment processors, etc.)
- **Themes** (`themes/`) - Complete site templates (store, blog)
- **Toolkits** (`toolkits/`) - Reusable component libraries

## Development Commands

### Installation and Setup
```bash
npm run build          # Build all packages (handles installation automatically)
npx cromwell start     # Start the CMS with default SQLite database
```

### Development
```bash
npm run dev            # Start all services in development mode with watchers
```

### Individual Service Development
```bash
npx crw s --sv s --dev # Start API Server with watcher
npx crw s --sv a --dev # Start Admin Panel with hot reload
npx crw s --sv r --dev # Start Renderer with watcher
```

### Testing
```bash
npm run test           # Run all tests
npm run test:server    # Test server components
npm run test:admin     # Test admin panel
npm run test:backend   # Test backend core
npm run test:frontend  # Test frontend core
npm run test:cli       # Test CLI
```

### Building and Packaging
```bash
npm run build:core     # Build core packages only
npm run build:system   # Build system packages only
npm run lerna:patch    # Bump patch versions
npm run lerna:publish  # Publish to npm
```

### Database Development
```bash
# Start development databases
npm run docker:start-dev-mariadb   # MariaDB on port 3306
npm run docker:start-dev-postgres  # PostgreSQL on port 5432

# Configure by copying cmsconfig.json.dev-example to cmsconfig.json
# and renaming desired DB config from "orm-*" to "orm"
```

## Service Architecture Details

### Default Ports (configurable via cmsconfig.json)
- **Main Entry Point**: http://localhost:4016 (Proxy handles all routing)
- **API Server**: http://localhost:4016/api (REST + GraphQL)
- **Admin Panel**: http://localhost:4064
- **Renderer**: http://localhost:4128

### API Endpoints
- **GraphQL**: http://localhost:4016/api/graphql
- **GraphQL Playground**: https://studio.apollographql.com/sandbox/explorer?endpoint=http%3A%2F%2Flocalhost%3A4016%2Fapi%2Fgraphql
- **Swagger REST API**: http://localhost:4016/api/api-docs/

## Key Development Patterns

### Workspace Structure
- Uses Yarn workspaces with Lerna for package management
- Each service is an independent npm package with its own build process
- Shared dependencies are managed at the root level with version resolutions

### Plugin Development
- Plugins follow a standard structure with `cromwell.config.js`
- Support both frontend components and backend resolvers/controllers
- Hot reloading available in development mode

### Theme Development  
- Themes are Next.js applications with special Cromwell integrations
- Use `npm run watch` in theme directories for development
- Support custom pages, components, and styling

### Database Support
- TypeORM with support for SQLite, MySQL, MariaDB, PostgreSQL
- Migrations are database-specific (separate folders for each DB type)
- Development databases available via Docker commands

## Important Notes

### Installation
- **Never run `npm install` manually** - the startup.js script handles all installations
- Use yarn for dependency management in development
- Build process automatically handles workspace dependencies

### Development Best Practices
- Use the CLI commands (`npx crw`) for service management
- Individual services can be developed in isolation with watchers
- Hot reloading is available for admin panel and themes
- Safe reloads are implemented for production plugin updates

### Testing and Quality
- Each package has its own Jest configuration
- TypeScript compilation available via `npm run typecheck` in server package
- Prettier formatting via `npm run format` (available at root and package levels)

## Development Guidelines

> Think carefully and implement the most concise solution that changes as little code as possible.

### USE SUB-AGENTS FOR CONTEXT OPTIMIZATION

#### 1. Always use the file-analyzer sub-agent when asked to read files.
The file-analyzer agent is an expert in extracting and summarizing critical information from files, particularly log files and verbose outputs. It provides concise, actionable summaries that preserve essential information while dramatically reducing context usage.

#### 2. Always use the code-analyzer sub-agent when asked to search code, analyze code, research bugs, or trace logic flow.
The code-analyzer agent is an expert in code analysis, logic tracing, and vulnerability detection. It provides concise, actionable summaries that preserve essential information while dramatically reducing context usage.

#### 3. Always use the test-runner sub-agent to run tests and analyze the test results.
Using the test-runner agent ensures:
- Full test output is captured for debugging
- Main conversation stays clean and focused
- Context usage is optimized
- All issues are properly surfaced
- No approval dialogs interrupt the workflow

### Philosophy

#### Error Handling
- **Fail fast** for critical configuration (missing text model)
- **Log and continue** for optional features (extraction model)
- **Graceful degradation** when external services unavailable
- **User-friendly messages** through resilience layer

#### Testing
- Always use the test-runner agent to execute tests.
- Do not use mock services for anything ever.
- Do not move on to the next test until the current test is complete.
- If the test fails, consider checking if the test is structured correctly before deciding we need to refactor the codebase.
- Tests to be verbose so we can use them for debugging.

### Tone and Behavior
- Criticism is welcome. Please tell me when I am wrong or mistaken, or even when you think I might be wrong or mistaken.
- Please tell me if there is a better approach than the one I am taking.
- Please tell me if there is a relevant standard or convention that I appear to be unaware of.
- Be skeptical.
- Be concise.
- Short summaries are OK, but don't give an extended breakdown unless we are working through the details of a plan.
- Do not flatter, and do not give compliments unless I am specifically asking for your judgement.
- Occasional pleasantries are fine.
- Feel free to ask many questions. If you are in doubt of my intent, don't guess. Ask.

### ABSOLUTE RULES:
- NO PARTIAL IMPLEMENTATION
- NO SIMPLIFICATION : no "//This is simplified stuff for now, complete implementation would blablabla"
- NO CODE DUPLICATION : check existing codebase to reuse functions and constants Read files before writing new functions. Use common sense function name to find them easily.
- NO DEAD CODE : either use or delete from codebase completely
- IMPLEMENT TEST FOR EVERY FUNCTIONS
- NO CHEATER TESTS : test must be accurate, reflect real usage and be designed to reveal flaws. No useless tests! Design tests to be verbose so we can use them for debuging.
- NO INCONSISTENT NAMING - read existing codebase naming patterns.
- NO OVER-ENGINEERING - Don't add unnecessary abstractions, factory patterns, or middleware when simple functions would work. Don't think "enterprise" when you need "working"
- NO MIXED CONCERNS - Don't put validation logic inside API handlers, database queries inside UI components, etc. instead of proper separation
- NO RESOURCE LEAKS - Don't forget to close database connections, clear timeouts, remove event listeners, or clean up file handles