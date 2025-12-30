# WordRhyme Architecture

## System Overview

```mermaid
graph TB
    subgraph "Frontend"
        Admin[Admin UI<br/>React + MF2.0]
        Web[Web App<br/>Next.js 15]
    end
    
    subgraph "Backend"
        Server[API Server<br/>NestJS + Fastify]
        TRPC[tRPC Router]
    end
    
    subgraph "Data"
        PG[(PostgreSQL)]
        Redis[(Redis)]
    end
    
    subgraph "Plugins"
        P1[Plugin A]
        P2[Plugin B]
        P3[Plugin C]
    end
    
    Admin --> TRPC
    Web --> TRPC
    TRPC --> Server
    Server --> PG
    Server --> Redis
    Server --> P1
    Server --> P2
    Server --> P3
```

## Core Components

### Kernel

The kernel manages system lifecycle:
- **Booting**: Load config, initialize context providers
- **Running**: Accept requests, manage plugins
- **Reloading**: Hot reload plugins (v1.0)

### Context Providers

Each request has isolated context:
- `TenantContextProvider` - Multi-tenancy
- `UserContextProvider` - Authentication
- `LocaleContextProvider` - i18n
- `TimezoneContextProvider` - Time handling

### Plugin System

```mermaid
flowchart LR
    Manifest -->|Validate| Loader
    Loader -->|Resolve| Dependencies
    Dependencies -->|Register| Permissions
    Permissions -->|Initialize| Capabilities
    Capabilities -->|Start| Runtime
```

## Data Flow

```mermaid
sequenceDiagram
    participant Client
    participant tRPC
    participant Context
    participant Permission
    participant Plugin
    participant DB
    
    Client->>tRPC: Request
    tRPC->>Context: Inject tenant/user
    Context->>Permission: Check access
    Permission->>Plugin: Execute
    Plugin->>DB: Query (scoped)
    DB-->>Client: Response
```

## Multi-Tenancy

All data is scoped by `tenant_id`:
- Automatic filtering on queries
- Enforced at capability layer
- No cross-tenant data leakage

## Module Federation

Admin UI loads plugin UIs dynamically:
1. Host exposes shared dependencies
2. Plugins expose RemoteEntry.js
3. Runtime loads and registers extensions
