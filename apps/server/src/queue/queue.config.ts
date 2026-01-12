import { ConnectionOptions, DefaultJobOptions } from 'bullmq';

/**
 * Get Redis connection options from environment
 */
export function getRedisConnection(): ConnectionOptions {
  const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
  const url = new URL(redisUrl);

  const options: ConnectionOptions = {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
  };

  if (url.password) {
    options.password = url.password;
  }

  if (url.username) {
    options.username = url.username;
  }

  return options;
}

/**
 * Default job options for all queues
 */
export const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: {
    age: 7 * 24 * 3600, // 7 days
    count: 1000,
  },
  removeOnFail: {
    age: 30 * 24 * 3600, // 30 days
  },
};

/**
 * Queue names used by Core
 *
 * Naming convention: core_{module}_{action}
 * Note: BullMQ does not allow colons in queue names
 */
export const CORE_QUEUE_NAMES = {
  NOTIFICATION: 'core_notification',
  NOTIFICATION_CLEANUP: 'core_notification_cleanup',
  NOTIFICATION_DIGEST: 'core_notification_digest',
} as const;

/**
 * Job priority mapping
 */
export const JOB_PRIORITY = {
  critical: 1,
  high: 2,
  normal: 3,
  low: 4,
} as const;

export type JobPriority = keyof typeof JOB_PRIORITY;

/**
 * Plugin job limits (defaults)
 */
export const PLUGIN_JOB_LIMITS = {
  maxConcurrency: 5,
  maxRetries: 3,
  maxJobsPerMinute: 100,
  maxJobDataSize: 64 * 1024, // 64KB
} as const;
