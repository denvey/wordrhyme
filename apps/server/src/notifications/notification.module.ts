import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service.js';
import { TemplateService } from './template.service.js';
import { PreferenceService } from './preference.service.js';
import { ChannelService } from './channel.service.js';
import { NotificationCleanupTask } from './notification-cleanup.task.js';
import { EventBus } from '../events/index.js';

/**
 * Notification Module
 *
 * Provides notification services for the application.
 * Includes scheduled tasks for notification cleanup.
 */
@Module({
  providers: [
    NotificationService,
    TemplateService,
    PreferenceService,
    ChannelService,
    NotificationCleanupTask,
    EventBus,
  ],
  exports: [
    NotificationService,
    TemplateService,
    PreferenceService,
    ChannelService,
    NotificationCleanupTask,
    EventBus,
  ],
})
export class NotificationModule {}
