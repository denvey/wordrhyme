import { pgTable, text, timestamp, jsonb, boolean, integer, real, index } from 'drizzle-orm/pg-core';

/**
 * Scheduled Tasks Table
 *
 * 存储定时任务配置
 */
export const scheduledTasks = pgTable('scheduled_tasks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text('tenant_id').notNull(),

  // 任务定义
  name: text('name').notNull(),
  description: text('description'),
  cronExpression: text('cron_expression').notNull(),
  timezone: text('timezone').notNull().default('UTC'),

  // Handler 配置
  handlerType: text('handler_type', {
    enum: ['queue-job', 'webhook', 'plugin-callback']
  }).notNull(),
  handlerConfig: jsonb('handler_config').notNull().$type<{
    queueName?: string;
    jobName?: string;
    url?: string;
    pluginId?: string;
    methodName?: string;
  }>(),
  payload: jsonb('payload'),

  // 状态
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastStatus: text('last_status', { enum: ['success', 'failed'] }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),

  // 失败处理
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  retryBackoffMultiplier: real('retry_backoff_multiplier').notNull().default(2),

  // Provider 信息
  providerId: text('provider_id').notNull().default('builtin'),
  providerMetadata: jsonb('provider_metadata'),

  // 审计
  createdBy: text('created_by').notNull(),
  createdByType: text('created_by_type', {
    enum: ['user', 'plugin', 'system']
  }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('scheduled_tasks_tenant_idx').on(table.tenantId),
  nextRunIdx: index('scheduled_tasks_next_run_idx').on(table.nextRunAt, table.enabled),
  providerIdx: index('scheduled_tasks_provider_idx').on(table.providerId),
}));

/**
 * Task Executions Table
 *
 * 存储任务执行历史
 */
export const taskExecutions = pgTable('task_executions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  taskId: text('task_id').notNull(),
  tenantId: text('tenant_id').notNull(),

  // 时间
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),

  // 状态
  status: text('status', {
    enum: ['pending', 'running', 'success', 'failed', 'timeout']
  }).notNull(),
  attempt: integer('attempt').notNull().default(1),

  // 结果
  result: jsonb('result'),
  error: jsonb('error').$type<{
    code: string;
    message: string;
    stack?: string;
  }>(),

  // 分布式锁
  lockKey: text('lock_key').notNull(),
  workerId: text('worker_id').notNull(),
}, (table) => ({
  taskIdx: index('task_executions_task_idx').on(table.taskId, table.startedAt),
  tenantIdx: index('task_executions_tenant_idx').on(table.tenantId),
  statusIdx: index('task_executions_status_idx').on(table.status),
}));

/**
 * Scheduler Providers Table
 *
 * 存储已注册的 Scheduler Provider（第三方插件）
 */
export const schedulerProviders = pgTable('scheduler_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  pluginId: text('plugin_id'),
  capabilities: jsonb('capabilities').notNull().$type<{
    supportsSeconds: boolean;
    supportsTimezone: boolean;
    supportsPauseResume: boolean;
    minInterval: number;
    maxTasks: number;
    requiresWebhook: boolean;
  }>(),
  status: text('status', {
    enum: ['registered', 'active', 'inactive', 'unregistered']
  }).notNull(),
  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  unregisteredAt: timestamp('unregistered_at', { withTimezone: true }),
}, (table) => ({
  pluginIdx: index('scheduler_providers_plugin_idx').on(table.pluginId),
  statusIdx: index('scheduler_providers_status_idx').on(table.status),
}));

export type ScheduledTask = typeof scheduledTasks.$inferSelect;
export type InsertScheduledTask = typeof scheduledTasks.$inferInsert;
export type TaskExecution = typeof taskExecutions.$inferSelect;
export type InsertTaskExecution = typeof taskExecutions.$inferInsert;
export type SchedulerProvider = typeof schedulerProviders.$inferSelect;
export type InsertSchedulerProvider = typeof schedulerProviders.$inferInsert;
