import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import {
  getRedisConnection,
  defaultJobOptions,
  CORE_QUEUE_NAMES,
  JOB_PRIORITY,
  PLUGIN_JOB_LIMITS,
} from './queue.config.js';
import {
  JobHandler,
  EnqueueOptions,
  QueueJobData,
  QueueHealthMetrics,
  QueueHealthResponse,
  QueueHealthStatus,
  FatalJobError,
  InvalidJobNamespaceError,
  TenantMismatchError,
  RateLimitExceededError,
  PayloadTooLargeError,
} from './queue.types.js';

// Job namespace pattern validation
// Note: BullMQ does not allow colons in queue/job names, so we use underscores
const CORE_JOB_PATTERN = /^core_[a-z]+(_[a-z]+)*$/;
const PLUGIN_JOB_PATTERN = /^plugin_[a-zA-Z0-9.-]+_[a-z][a-z0-9-]*$/;

/**
 * Rate limit tracker for plugins
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private handlers: Map<string, JobHandler> = new Map();
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  private isWorkerEnabled = false;

  async onModuleInit() {
    const connection = getRedisConnection();

    // Create main queue
    this.queue = new Queue(CORE_QUEUE_NAMES.NOTIFICATION, {
      connection,
      defaultJobOptions,
    });

    // Check if worker should run in-process
    const workerMode = process.env['WORKER_MODE'];
    if (workerMode !== 'standalone') {
      this.isWorkerEnabled = true;
      await this.startWorker();
    }
  }

  async onModuleDestroy() {
    await this.stopWorker();
    await this.queue?.close();
  }

  /**
   * Start the worker (in-process mode)
   */
  async startWorker(): Promise<void> {
    if (this.worker) return;

    const connection = getRedisConnection();

    this.worker = new Worker(
      CORE_QUEUE_NAMES.NOTIFICATION,
      async (job: Job) => {
        const handler = this.handlers.get(job.name);
        if (!handler) {
          console.warn(`No handler registered for job: ${job.name}`);
          return;
        }

        try {
          await handler(job.data, job);
        } catch (error) {
          if (error instanceof FatalJobError) {
            // Move to dead-letter queue, no retry
            throw error;
          }
          // Regular error, will retry
          throw error;
        }
      },
      {
        connection,
        concurrency: 5,
      }
    );

    this.worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Job ${job?.id} failed:`, err.message);
    });

    console.log('Queue worker started (in-process mode)');
  }

  /**
   * Stop the worker
   */
  async stopWorker(): Promise<void> {
    if (!this.worker) return;

    await this.worker.close();
    this.worker = null;
    console.log('Queue worker stopped');
  }

  /**
   * Validate job name follows namespace pattern
   */
  private validateJobName(name: string): void {
    if (!CORE_JOB_PATTERN.test(name) && !PLUGIN_JOB_PATTERN.test(name)) {
      throw new InvalidJobNamespaceError(name);
    }
  }

  /**
   * Enqueue a job (Core usage)
   */
  async enqueue<T extends QueueJobData>(
    name: string,
    data: T,
    options?: EnqueueOptions
  ): Promise<string> {
    if (!this.queue) {
      throw new Error('Queue not initialized');
    }

    this.validateJobName(name);

    const priority = options?.priority
      ? JOB_PRIORITY[options.priority]
      : JOB_PRIORITY.normal;

    const jobOptions: Record<string, unknown> = { priority };

    if (options?.delay !== undefined) {
      jobOptions['delay'] = options.delay;
    }
    if (options?.attempts !== undefined) {
      jobOptions['attempts'] = options.attempts;
    }
    if (options?.jobId !== undefined) {
      jobOptions['jobId'] = options.jobId;
    }

    const job = await this.queue.add(name, data, jobOptions);

    return job.id || '';
  }

  /**
   * Enqueue a job for a plugin (with namespace and limits)
   */
  async enqueueForPlugin<T extends QueueJobData>(
    pluginId: string,
    action: string,
    data: T,
    options?: EnqueueOptions
  ): Promise<string> {
    // Validate tenant matches
    const contextTenantId = data.tenantId;
    if (!contextTenantId) {
      throw new TenantMismatchError();
    }

    // Check rate limit
    this.checkRateLimit(pluginId);

    // Check payload size
    const payloadSize = JSON.stringify(data).length;
    if (payloadSize > PLUGIN_JOB_LIMITS.maxJobDataSize) {
      throw new PayloadTooLargeError(payloadSize, PLUGIN_JOB_LIMITS.maxJobDataSize);
    }

    // Create namespaced job name (use underscores, not colons - BullMQ restriction)
    const jobName = `plugin_${pluginId}_${action.replace(/-/g, '_')}`;

    return this.enqueue(jobName, data, {
      ...options,
      attempts: options?.attempts ?? PLUGIN_JOB_LIMITS.maxRetries,
    });
  }

  /**
   * Check and update rate limit for plugin
   */
  private checkRateLimit(pluginId: string): void {
    const now = Date.now();
    const entry = this.rateLimits.get(pluginId);

    if (!entry || now > entry.resetAt) {
      // Reset or create new entry
      this.rateLimits.set(pluginId, {
        count: 1,
        resetAt: now + 60000, // 1 minute window
      });
      return;
    }

    if (entry.count >= PLUGIN_JOB_LIMITS.maxJobsPerMinute) {
      throw new RateLimitExceededError(pluginId);
    }

    entry.count++;
  }

  /**
   * Register a job handler
   */
  registerHandler<T = unknown>(name: string, handler: JobHandler<T>): void {
    this.validateJobName(name);
    this.handlers.set(name, handler as JobHandler);
  }

  /**
   * Register a plugin job handler (with automatic namespace)
   */
  registerPluginHandler<T = unknown>(
    pluginId: string,
    action: string,
    handler: JobHandler<T>
  ): void {
    // Use underscores, not colons - BullMQ restriction
    // Also replace hyphens with underscores to match enqueueForPlugin
    const jobName = `plugin_${pluginId}_${action.replace(/-/g, '_')}`;
    this.handlers.set(jobName, handler as JobHandler);
  }

  /**
   * Unregister a handler
   */
  unregisterHandler(name: string): void {
    this.handlers.delete(name);
  }

  /**
   * Get queue health metrics
   */
  async getHealth(): Promise<QueueHealthResponse> {
    if (!this.queue) {
      return {
        status: 'unhealthy',
        metrics: {
          activeCount: 0,
          waitingCount: 0,
          completedCount: 0,
          failedCount: 0,
          delayedCount: 0,
        },
        timestamp: new Date(),
      };
    }

    const [active, waiting, completed, failed, delayed] = await Promise.all([
      this.queue.getActiveCount(),
      this.queue.getWaitingCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    const metrics: QueueHealthMetrics = {
      activeCount: active,
      waitingCount: waiting,
      completedCount: completed,
      failedCount: failed,
      delayedCount: delayed,
    };

    let status: QueueHealthStatus = 'healthy';
    if (waiting > 10000) {
      status = 'degraded';
    }
    if (failed > 1000) {
      status = 'unhealthy';
    }

    return {
      status,
      metrics,
      timestamp: new Date(),
    };
  }

  /**
   * Check if worker is running
   */
  isWorkerRunning(): boolean {
    return this.isWorkerEnabled && this.worker !== null;
  }
}
