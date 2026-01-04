# Cluster Coordination Specification

## ADDED Requirements

### Requirement: Redis Pub/Sub for Reload Signals

The system SHALL use Redis Pub/Sub to broadcast reload signals across cluster nodes. A `RELOAD_APP` message SHALL trigger graceful reload on all nodes.

#### Scenario: Reload signal broadcast
- **WHEN** a plugin is installed via the API
- **THEN** the server publishes a `RELOAD_APP` message to Redis
- **AND** all nodes subscribed to the channel receive the message

---

### Requirement: Graceful Reload with PM2

Each server node SHALL listen for `RELOAD_APP` messages. On receiving the message, the node SHALL trigger a PM2 graceful reload. PM2 SHALL perform a rolling restart (one instance at a time, zero downtime).

#### Scenario: Rolling reload triggered
- **WHEN** a `RELOAD_APP` message is received
- **THEN** the node calls `pm2 reload <app-name>` (or `process.exit(0)` if PM2 auto-restarts)
- **AND** PM2 starts a new instance before killing the old one
- **AND** active requests are drained before shutdown

---

### Requirement: Shared Plugin Storage

The `/plugins` directory MUST be on shared storage (NFS/NAS) accessible to all nodes. Plugin files SHALL be identical across all nodes.

#### Scenario: Plugin available on all nodes
- **WHEN** a plugin is installed on Node 1
- **THEN** the plugin files are written to the shared `/plugins` directory
- **WHEN** Node 2 reloads
- **THEN** Node 2 can read the plugin files from the shared directory
- **AND** Node 2 loads the plugin successfully

---

### Requirement: Development Mode Support

In development mode (single node, no PM2), the reload mechanism MAY be disabled or simplified. The system SHALL detect when PM2 is not available and skip cluster coordination.

#### Scenario: Development mode skips Redis broadcast
- **WHEN** the server runs without PM2 (e.g., `pnpm dev`)
- **THEN** plugin install does NOT broadcast `RELOAD_APP` to Redis
- **AND** the developer manually restarts the server
