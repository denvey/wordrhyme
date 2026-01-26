import { Job } from 'bullmq';

/**
 * Job priority levels
 */
export type JobPriority = 'critical' | 'high' | 'normal' | 'low';

/**
 * Options for enqueuing a job
 */
export interface EnqueueOptions {
  priority?: JobPriority;
  delay?: number; // milliseconds
  attempts?: number;
  jobId?: string;
}

/**
 * Job handler function type
 */
export type JobHandler<T = unknown> = (
  data: T,
  job: Job<T>
) => Promise<void>;

/**
 * Job handler context for plugins
 */
export interface JobHandlerContext {
  organizationId: string;
  pluginId?: string;
  job: Job;
}

/**
 * Queue job data structure (all jobs must include organizationId)
 */
export interface QueueJobData {
  organizationId: string;
  [key: string]: unknown;
}

/**
 * Queue health metrics
 */
export interface QueueHealthMetrics {
  activeCount: number;
  waitingCount: number;
  completedCount: number;
  failedCount: number;
  delayedCount: number;
}

/**
 * Queue health status
 */
export type QueueHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Queue health response
 */
export interface QueueHealthResponse {
  status: QueueHealthStatus;
  metrics: QueueHealthMetrics;
  timestamp: Date;
}

/**
 * Fatal job error - no retry
 */
export class FatalJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalJobError';
  }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitExceededError extends Error {
  constructor(pluginId: string) {
    super(`Rate limit exceeded for plugin: ${pluginId}`);
    this.name = 'RateLimitExceededError';
  }
}

/**
 * Payload too large error
 */
export class PayloadTooLargeError extends Error {
  constructor(size: number, maxSize: number) {
    super(`Payload size ${size} exceeds max ${maxSize}`);
    this.name = 'PayloadTooLargeError';
  }
}

/**
 * Tenant mismatch error
 */
export class TenantMismatchError extends Error {
  constructor() {
    super('Tenant mismatch: job organizationId does not match context');
    this.name = 'TenantMismatchError';
  }
}

/**
 * Invalid job namespace error
 */
export class InvalidJobNamespaceError extends Error {
  constructor(jobName: string) {
    super(
      `Invalid job name: ${jobName}. Must follow pattern: core:{module}:{action} or plugin:{pluginId}:{action}`
    );
    this.name = 'InvalidJobNamespaceError';
  }
}
