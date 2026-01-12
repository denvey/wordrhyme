export { QueueService } from './queue.service.js';
export { QueueModule } from './queue.module.js';
export {
  getRedisConnection,
  defaultJobOptions,
  CORE_QUEUE_NAMES,
  JOB_PRIORITY,
  PLUGIN_JOB_LIMITS,
} from './queue.config.js';
export type { JobPriority } from './queue.config.js';
export {
  FatalJobError,
  RateLimitExceededError,
  PayloadTooLargeError,
  TenantMismatchError,
  InvalidJobNamespaceError,
} from './queue.types.js';
export type {
  JobHandler,
  EnqueueOptions,
  QueueJobData,
  QueueHealthMetrics,
  QueueHealthResponse,
  QueueHealthStatus,
  JobHandlerContext,
} from './queue.types.js';
