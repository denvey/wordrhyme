/**
 * Scheduler Provider Interface (SPI)
 *
 * 定义 Scheduler Provider 的标准接口。
 * - Built-in Provider 在 Core 中实现此接口
 * - 第三方 Provider 通过插件实现此接口
 */

export interface SchedulerProvider {
  /** Provider 唯一标识 */
  readonly id: string;

  /** Provider 显示名称 */
  readonly name: string;

  /** Provider 版本 */
  readonly version: string;

  /** Provider 能力声明 */
  readonly capabilities: ProviderCapabilities;

  /**
   * 初始化 Provider
   */
  initialize(config: ProviderConfig): Promise<void>;

  /**
   * 创建定时任务
   */
  createTask(params: CreateTaskParams): Promise<CreateTaskResult>;

  /**
   * 删除任务
   */
  deleteTask(taskId: string): Promise<void>;

  /**
   * 更新任务
   */
  updateTask(taskId: string, updates: UpdateTaskParams): Promise<void>;

  /**
   * 立即触发任务
   */
  triggerNow(taskId: string): Promise<TriggerResult>;

  /**
   * 获取任务执行历史
   */
  getExecutionHistory(
    taskId: string,
    options: PaginationOptions
  ): Promise<TaskExecution[]>;

  /**
   * 健康检查
   */
  healthCheck(): Promise<ProviderHealthStatus>;

  /**
   * 清理资源
   */
  shutdown(): Promise<void>;
}

export interface ProviderCapabilities {
  /** 是否支持秒级 Cron */
  supportsSeconds: boolean;

  /** 是否支持时区 */
  supportsTimezone: boolean;

  /** 是否支持暂停/恢复 */
  supportsPauseResume: boolean;

  /** 最小调度间隔（毫秒） */
  minInterval: number;

  /** 最大任务数（0 = 无限制） */
  maxTasks: number;

  /** 是否需要 Webhook 回调 */
  requiresWebhook: boolean;
}

export interface ProviderConfig {
  [key: string]: unknown;
}

export interface CreateTaskParams {
  id: string;
  tenantId: string;
  name: string;
  cronExpression: string;
  timezone: string;
  handlerConfig: HandlerConfig;
  payload?: Record<string, unknown>;
  retryPolicy: RetryPolicy;
}

export interface HandlerConfig {
  type: 'queue-job' | 'webhook' | 'plugin-callback';
  queueName?: string;
  jobName?: string;
  url?: string;
  pluginId?: string;
  methodName?: string;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMultiplier: number;
}

export interface CreateTaskResult {
  taskId: string;
  providerTaskId?: string;
  nextRunAt: Date;
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskParams {
  enabled?: boolean;
  cronExpression?: string;
  timezone?: string;
  payload?: Record<string, unknown>;
}

export interface TriggerResult {
  executionId: string;
  triggeredAt: Date;
}

export interface TaskExecution {
  id: string;
  taskId: string;
  scheduledAt: Date;
  startedAt: Date;
  completedAt?: Date;
  status: 'pending' | 'running' | 'success' | 'failed' | 'timeout';
  attempt: number;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface ProviderHealthStatus {
  healthy: boolean;
  latency?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}
