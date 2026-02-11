/**
 * Scheduled Tasks Database Schema
 *
 * Drizzle ORM table definitions for scheduled task management.
 * These are the source of truth - Zod schemas are generated from these.
 */
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  real,
  index,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { organization } from './auth';

// ============================================================
// Types
// ============================================================

export type HandlerType = 'queue-job' | 'webhook' | 'plugin-callback';
export type TaskStatus = 'success' | 'failed';
export type ExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'timeout';
export type ProviderStatus = 'registered' | 'active' | 'inactive' | 'unregistered';
export type CreatedByType = 'user' | 'plugin' | 'system';

export interface HandlerConfig {
  queueName?: string;
  jobName?: string;
  url?: string;
  pluginId?: string;
  methodName?: string;
}

export interface ExecutionError {
  code: string;
  message: string;
  stack?: string;
}

export interface ProviderCapabilities {
  supportsSeconds: boolean;
  supportsTimezone: boolean;
  supportsPauseResume: boolean;
  minInterval: number;
  maxTasks: number;
  requiresWebhook: boolean;
}

// ============================================================
// Scheduled Tasks Table
// ============================================================

/**
 * Scheduled Tasks Table
 *
 * 存储定时任务配置
 */
export const scheduledTasks = pgTable(
  'scheduled_tasks',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    cronExpression: text('cron_expression').notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    handlerType: text('handler_type').$type<HandlerType>().notNull(),
    handlerConfig: jsonb('handler_config').notNull().$type<HandlerConfig>(),
    payload: jsonb('payload'),
    enabled: boolean('enabled').notNull().default(true),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    lastStatus: text('last_status').$type<TaskStatus>(),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    retryBackoffMultiplier: real('retry_backoff_multiplier').notNull().default(2),
    providerId: text('provider_id').notNull().default('builtin'),
    providerMetadata: jsonb('provider_metadata'),
    createdBy: text('created_by').notNull(),
    createdByType: text('created_by_type').$type<CreatedByType>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('scheduled_tasks_organization_idx').on(table.organizationId),
    index('scheduled_tasks_next_run_idx').on(table.nextRunAt, table.enabled),
    index('scheduled_tasks_provider_idx').on(table.providerId),
  ],
);

export type ScheduledTask = typeof scheduledTasks.$inferSelect;

// ============================================================
// Task Executions Table
// ============================================================

/**
 * Task Executions Table
 *
 * 存储任务执行历史
 */
export const taskExecutions = pgTable(
  'task_executions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // FK to scheduledTasks table
    taskId: text('task_id')
      .notNull()
      .references(() => scheduledTasks.id, { onDelete: 'cascade' }),
    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    status: text('status').$type<ExecutionStatus>().notNull(),
    attempt: integer('attempt').notNull().default(1),
    result: jsonb('result'),
    error: jsonb('error').$type<ExecutionError>(),
    lockKey: text('lock_key').notNull(),
    workerId: text('worker_id').notNull(),
  },
  (table) => [
    index('task_executions_task_idx').on(table.taskId, table.startedAt),
    index('task_executions_organization_idx').on(table.organizationId),
    index('task_executions_status_idx').on(table.status),
  ],
);

export type TaskExecution = typeof taskExecutions.$inferSelect;

// ============================================================
// Scheduler Providers Table
// ============================================================

/**
 * Scheduler Providers Table
 *
 * 存储已注册的 Scheduler Provider（第三方插件）
 */
export const schedulerProviders = pgTable(
  'scheduler_providers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    version: text('version').notNull(),
    pluginId: text('plugin_id'),
    capabilities: jsonb('capabilities').notNull().$type<ProviderCapabilities>(),
    status: text('status').$type<ProviderStatus>().notNull(),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
    unregisteredAt: timestamp('unregistered_at', { withTimezone: true }),
  },
  (table) => [
    index('scheduler_providers_plugin_idx').on(table.pluginId),
    index('scheduler_providers_status_idx').on(table.status),
  ],
);

// ============================================================
// Zod Schemas
// ============================================================

export const scheduledTaskSchema = createInsertSchema(scheduledTasks);
export const taskExecutionSchema = createInsertSchema(taskExecutions);
export const schedulerProviderSchema = createInsertSchema(schedulerProviders);

// ============================================================
// Inferred Types
// ============================================================

export type SchedulerProvider = typeof schedulerProviders.$inferSelect;
