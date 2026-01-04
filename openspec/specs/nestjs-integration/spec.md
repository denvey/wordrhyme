# nestjs-integration Specification

## Purpose
TBD - created by archiving change add-mvp-core-implementation. Update Purpose after archive.
## Requirements
### Requirement: NestJS Shell Architecture

NestJS SHALL serve as a "thin shell" providing infrastructure (DI, module lifecycle, middleware) while tRPC handles all API logic. NestJS Controllers SHALL NOT be used (tRPC replaces REST endpoints).

#### Scenario: Module initialization order
- **WHEN** the server starts
- **THEN** NestJS modules initialize in order: DatabaseModule → ContextModule → AuthModule → PluginModule → TrpcModule

#### Scenario: No NestJS Controllers
- **WHEN** API requests arrive at `/trpc/*`
- **THEN** they are handled by the tRPC router, NOT NestJS controllers

---

### Requirement: Fastify Instance Sharing

The Fastify instance created by NestJS SHALL be shared with modules that need direct Fastify access (e.g., TrpcModule for route registration, Fastify plugins for multipart/static).

#### Scenario: tRPC registration on Fastify
- **WHEN** TrpcModule initializes
- **THEN** it receives the Fastify instance via DI
- **AND** registers the tRPC plugin on the Fastify instance

---

