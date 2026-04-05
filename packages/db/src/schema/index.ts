/**
 * Drizzle Schema Definitions
 *
 * Single source of truth for all database tables.
 * These schemas include FK constraints and are used by:
 * - drizzle-kit for migrations
 * - Server runtime for database operations
 * - Frontend for type inference (via @wordrhyme/db)
 *
 * Zod schemas in ./zod are generated from these.
 */

// Core auth tables
export * from './auth';

// Team tables
export * from './teams';

// Relationship tables
export * from './relationships';

// i18n tables
export * from './i18n';

// RBAC tables
export * from './roles';
export * from './role-permissions';
export * from './permissions';
export * from './menus';
// Permission field utilities
export * from './permission-fields';

// Plugin system tables
export * from './plugins';
export * from './plugin-migrations';

// Configuration tables
export * from './settings';
export * from './feature-flags';

// Media table (unified files + assets)
export * from './media';

// Notification tables
export * from './notifications';
export * from './notification-templates';
export * from './notification-channels';
export * from './notification-preferences';

// Audit tables
export * from './audit-logs';
export * from './audit-events';
export * from './audit-archive';

// LBAC tables
export * from './entity-ownerships';

// Billing tables
export * from './billing';
export * from './currency';
export * from './geo';

// Webhook tables
export * from './webhooks';

// Scheduled tasks tables
export * from './scheduled-tasks';
