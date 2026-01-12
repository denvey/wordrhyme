/**
 * Webhook DTOs and Zod Schemas
 */
import { z } from 'zod';

/**
 * Retry Policy Schema
 */
export const retryPolicySchema = z.object({
  attempts: z.number().int().min(0).max(10).default(5),
  backoffMs: z.number().int().min(100).max(60000).default(1000),
  maxBackoffMs: z.number().int().min(1000).max(300000).optional(),
});

export type RetryPolicy = {
  attempts: number;
  backoffMs: number;
  maxBackoffMs?: number | undefined;
};

/**
 * Create Webhook Input
 */
export const createWebhookInputSchema = z.object({
  url: z
    .string()
    .url('必须是有效的 URL')
    .startsWith('https://', '为了安全，必须使用 HTTPS'),
  events: z.array(z.string()).min(1, '至少选择一个事件类型'),
  enabled: z.boolean().default(true),
  retryPolicy: retryPolicySchema.optional(),
});

export type CreateWebhookInput = z.infer<typeof createWebhookInputSchema>;

/**
 * Update Webhook Input
 */
export const updateWebhookInputSchema = z.object({
  id: z.string(),
  url: z
    .string()
    .url('必须是有效的 URL')
    .startsWith('https://', '为了安全，必须使用 HTTPS')
    .optional(),
  events: z.array(z.string()).min(1).optional(),
  enabled: z.boolean().optional(),
  retryPolicy: retryPolicySchema.optional(),
  rotateSecret: z.boolean().optional(),
});

export type UpdateWebhookInput = z.infer<typeof updateWebhookInputSchema>;

/**
 * Delete Webhook Input
 */
export const deleteWebhookInputSchema = z.object({
  id: z.string(),
});

export type DeleteWebhookInput = z.infer<typeof deleteWebhookInputSchema>;

/**
 * Test Webhook Input
 */
export const testWebhookInputSchema = z.object({
  id: z.string(),
  payload: z.record(z.unknown()).optional(),
});

export type TestWebhookInput = z.infer<typeof testWebhookInputSchema>;

/**
 * Query Deliveries Input
 */
export const queryDeliveriesInputSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'success', 'failed']).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

export type QueryDeliveriesInput = z.infer<typeof queryDeliveriesInputSchema>;

/**
 * Webhook Endpoint Response
 */
export interface WebhookEndpointResponse {
  id: string;
  url: string;
  secretPreview: string; // Only preview (e.g., "whsec_****abc"), not full secret
  events: string[];
  enabled: boolean;
  retryPolicy: RetryPolicy;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Webhook Delivery Response
 */
export interface WebhookDeliveryResponse {
  id: string;
  endpointId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  lastAttemptAt: Date | null;
  responseCode: number | null;
  error: string | null;
  createdAt: Date;
}

/**
 * Deliveries Query Response
 */
export interface DeliveriesQueryResponse {
  deliveries: WebhookDeliveryResponse[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
