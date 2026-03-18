import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  notificationPreferences,
  type NotificationPreference,
  type InsertNotificationPreference,
  type QuietHoursConfig,
  type EmailFrequency,
} from '@wordrhyme/db';

/**
 * Default notification preference
 */
const DEFAULT_PREFERENCE: Omit<
  InsertNotificationPreference,
  'id' | 'userId' | 'organizationId'
> = {
  enabledChannels: ['in-app'],
  templateOverrides: {},
  quietHours: null,
  emailFrequency: 'instant',
};

/**
 * Preference Service
 *
 * Manages user notification preferences.
 */
@Injectable()
export class PreferenceService {
  /**
   * Get user preference (creates default if not exists)
   */
  async getPreference(
    userId: string,
    organizationId: string
  ): Promise<NotificationPreference> {
    const [existing] = await db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.organizationId, organizationId)
        )
      )
      .limit(1);

    if (existing) {
      return existing;
    }

    // Create default preference
    const [created] = await db
      .insert(notificationPreferences)
      .values({
        userId,
        organizationId,
        ...DEFAULT_PREFERENCE,
      })
      .returning();

    if (!created) {
      throw new Error('Failed to create default preference');
    }

    return created;
  }

  /**
   * Update user preference
   */
  async updatePreference(
    userId: string,
    organizationId: string,
    updates: Partial<{
      enabledChannels: string[] | undefined;
      templateOverrides: Record<string, string[]> | undefined;
      quietHours: QuietHoursConfig | null | undefined;
      emailFrequency: EmailFrequency | undefined;
    }>
  ): Promise<NotificationPreference> {
    // Ensure preference exists
    await this.getPreference(userId, organizationId);

    const [updated] = await db
      .update(notificationPreferences)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.organizationId, organizationId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error('Failed to update preference');
    }

    return updated;
  }

  /**
   * Check if should send to channel
   *
   * Considers: enabled channels, template overrides, quiet hours, priority
   */
  async shouldSendToChannel(
    userId: string,
    organizationId: string,
    channel: string,
    templateKey: string,
    priority: 'low' | 'normal' | 'high' | 'urgent'
  ): Promise<{ should: boolean; reason: string }> {
    const pref = await this.getPreference(userId, organizationId);

    // In-app is always sent
    if (channel === 'in-app') {
      return { should: true, reason: 'always enabled' };
    }

    // Check template-specific override
    const overrides = pref.templateOverrides as Record<string, string[]> | null;
    if (overrides && overrides[templateKey]) {
      const templateChannels = overrides[templateKey];
      if (!templateChannels.includes(channel)) {
        return { should: false, reason: 'template override disabled' };
      }
    } else {
      // Check global enabled channels
      const enabledChannels = pref.enabledChannels as string[];
      if (!enabledChannels.includes(channel)) {
        return { should: false, reason: 'user disabled' };
      }
    }

    // Check quiet hours (urgent bypasses)
    if (priority !== 'urgent') {
      const quietHours = pref.quietHours as QuietHoursConfig | null;
      if (quietHours?.enabled && this.isInQuietHours(quietHours)) {
        return { should: false, reason: 'quiet hours active' };
      }
    }

    return { should: true, reason: 'user preference' };
  }

  /**
   * Check if current time is within quiet hours
   */
  private isInQuietHours(config: QuietHoursConfig): boolean {
    try {
      // Get current time in user's timezone
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: config.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const timeString = formatter.format(now);
      const timeParts = timeString.split(':').map(Number);
      const hours = timeParts[0] ?? 0;
      const minutes = timeParts[1] ?? 0;
      const currentMinutes = hours * 60 + minutes;

      // Parse start and end times
      const startParts = config.start.split(':').map(Number);
      const endParts = config.end.split(':').map(Number);
      const startHours = startParts[0] ?? 0;
      const startMinutes = startParts[1] ?? 0;
      const endHours = endParts[0] ?? 0;
      const endMinutes = endParts[1] ?? 0;
      const startTotalMinutes = startHours * 60 + startMinutes;
      const endTotalMinutes = endHours * 60 + endMinutes;

      // Handle overnight quiet hours (e.g., 22:00 - 08:00)
      if (startTotalMinutes > endTotalMinutes) {
        return (
          currentMinutes >= startTotalMinutes ||
          currentMinutes <= endTotalMinutes
        );
      }

      return (
        currentMinutes >= startTotalMinutes &&
        currentMinutes <= endTotalMinutes
      );
    } catch {
      // If timezone is invalid, don't block
      return false;
    }
  }

  /**
   * Get email frequency for user
   */
  async getEmailFrequency(
    userId: string,
    organizationId: string
  ): Promise<EmailFrequency> {
    const pref = await this.getPreference(userId, organizationId);
    return pref.emailFrequency as EmailFrequency;
  }

  /**
   * Resolve channels for a notification
   *
   * Returns list of channels to send to, with decision trace
   */
  async resolveChannels(
    userId: string,
    organizationId: string,
    templateKey: string,
    defaultChannels: string[],
    priority: 'low' | 'normal' | 'high' | 'urgent'
  ): Promise<{
    channels: string[];
    decisionTrace: Array<{ channel: string; included: boolean; reason: string }>;
  }> {
    const pref = await this.getPreference(userId, organizationId);
    const decisionTrace: Array<{
      channel: string;
      included: boolean;
      reason: string;
    }> = [];

    // Start with template defaults
    const overrides = pref.templateOverrides as Record<string, string[]> | null;
    const candidateChannels =
      (overrides && overrides[templateKey]) || defaultChannels;

    const channels: string[] = [];

    // In-app is always included
    if (!channels.includes('in-app')) {
      channels.push('in-app');
      decisionTrace.push({
        channel: 'in-app',
        included: true,
        reason: 'always enabled',
      });
    }

    // Check each candidate channel
    for (const channel of candidateChannels) {
      if (channel === 'in-app') continue; // Already handled

      const result = await this.shouldSendToChannel(
        userId,
        organizationId,
        channel,
        templateKey,
        priority
      );

      decisionTrace.push({
        channel,
        included: result.should,
        reason: result.reason,
      });

      if (result.should) {
        channels.push(channel);
      }
    }

    return { channels, decisionTrace };
  }
}
