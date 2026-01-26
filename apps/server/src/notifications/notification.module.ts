import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { TemplateService } from './template.service.js';
import { PreferenceService } from './preference.service';
import { ChannelService } from './channel.service.js';
import { NotificationCleanupTask } from './notification-cleanup.task';
import { EventBus } from '../events/index';

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
export class NotificationModule { }
