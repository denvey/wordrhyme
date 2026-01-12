import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { PreferenceService } from '../../notifications';
import type { EmailFrequency, QuietHoursConfig } from '../../db/schema/definitions';

/**
 * Notification Preferences Router
 *
 * Provides endpoints for managing user notification preferences.
 */
export const notificationPreferencesRouter = router({
  /**
   * Get user preferences
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.tenantId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Tenant context required',
      });
    }

    const preferenceService = new PreferenceService();
    return preferenceService.getPreference(ctx.userId!, ctx.tenantId);
  }),

  /**
   * Update user preferences
   */
  update: protectedProcedure
    .input(
      z.object({
        enabledChannels: z.array(z.string()).optional(),
        templateOverrides: z.record(z.array(z.string())).optional(),
        quietHours: z
          .object({
            enabled: z.boolean(),
            start: z.string().regex(/^\d{2}:\d{2}$/),
            end: z.string().regex(/^\d{2}:\d{2}$/),
            timezone: z.string(),
          })
          .nullable()
          .optional(),
        emailFrequency: z.enum(['instant', 'hourly', 'daily']).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tenant context required',
        });
      }

      const preferenceService = new PreferenceService();
      return preferenceService.updatePreference(ctx.userId!, ctx.tenantId, {
        enabledChannels: input.enabledChannels,
        templateOverrides: input.templateOverrides,
        quietHours: input.quietHours as QuietHoursConfig | null | undefined,
        emailFrequency: input.emailFrequency as EmailFrequency | undefined,
      });
    }),

  /**
   * Get email frequency
   */
  getEmailFrequency: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.tenantId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Tenant context required',
      });
    }

    const preferenceService = new PreferenceService();
    const frequency = await preferenceService.getEmailFrequency(
      ctx.userId!,
      ctx.tenantId
    );

    return { frequency };
  }),
});
