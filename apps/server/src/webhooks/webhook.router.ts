/**
 * Webhook tRPC Router
 *
 * API endpoints for webhook management.
 */
import { router, protectedProcedure, requirePermission } from '../trpc/trpc.js';
import { WebhookService } from './webhook.service.js';
import {
  createWebhookInputSchema,
  updateWebhookInputSchema,
  deleteWebhookInputSchema,
  testWebhookInputSchema,
  queryDeliveriesInputSchema,
} from './dto/webhook.dto.js';

// Singleton service instance
let webhookService: WebhookService | null = null;

export function setWebhookService(service: WebhookService) {
  webhookService = service;
}

export const webhookRouter = router({
  /**
   * Create a new webhook endpoint
   * Requires: Webhook:create
   */
  create: protectedProcedure
    .use(requirePermission('Webhook:create'))
    .input(createWebhookInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!webhookService) {
        throw new Error('WebhookService not initialized');
      }
      return webhookService.create(ctx.tenantId!, ctx.userId!, input);
    }),

  /**
   * List all webhook endpoints
   * Requires: Webhook:read
   */
  list: protectedProcedure
    .use(requirePermission('Webhook:read'))
    .query(async ({ ctx }) => {
      if (!webhookService) {
        throw new Error('WebhookService not initialized');
      }
      return webhookService.list(ctx.tenantId!);
    }),

  /**
   * Get a single webhook endpoint
   * Requires: Webhook:read
   */
  get: protectedProcedure
    .use(requirePermission('Webhook:read'))
    .input(deleteWebhookInputSchema)
    .query(async ({ ctx, input }) => {
      if (!webhookService) {
        throw new Error('WebhookService not initialized');
      }
      return webhookService.get(ctx.tenantId!, input.id);
    }),

  /**
   * Update webhook endpoint
   * Requires: Webhook:update
   */
  update: protectedProcedure
    .use(requirePermission('Webhook:update'))
    .input(updateWebhookInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!webhookService) {
        throw new Error('WebhookService not initialized');
      }
      return webhookService.update(ctx.tenantId!, input);
    }),

  /**
   * Delete webhook endpoint
   * Requires: Webhook:delete
   */
  delete: protectedProcedure
    .use(requirePermission('Webhook:delete'))
    .input(deleteWebhookInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!webhookService) {
        throw new Error('WebhookService not initialized');
      }
      return webhookService.delete(ctx.tenantId!, input.id);
    }),

  /**
   * Test webhook endpoint
   * Requires: Webhook:test
   */
  test: protectedProcedure
    .use(requirePermission('Webhook:test'))
    .input(testWebhookInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!webhookService) {
        throw new Error('WebhookService not initialized');
      }
      return webhookService.test(ctx.tenantId!, input);
    }),

  /**
   * Query delivery history
   * Requires: Webhook:read
   */
  deliveries: protectedProcedure
    .use(requirePermission('Webhook:read'))
    .input(queryDeliveriesInputSchema)
    .query(async ({ ctx, input }) => {
      if (!webhookService) {
        throw new Error('WebhookService not initialized');
      }
      return webhookService.deliveries(ctx.tenantId!, input);
    }),
});
