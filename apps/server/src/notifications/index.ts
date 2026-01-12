// Notification Module
export { NotificationModule } from './notification.module.js';

// Services
export { NotificationService, type CreateNotificationInput, type CreateNotificationResult } from './notification.service.js';
export { TemplateService } from './template.service.js';
export { PreferenceService } from './preference.service.js';
export { ChannelService } from './channel.service.js';

// Scheduled Tasks
export { NotificationCleanupTask } from './notification-cleanup.task.js';

// View Strategy
export {
  type NotificationViewStrategy,
  type ViewContext,
  InboxStrategy,
  SocialFeedStrategy,
  ViewStrategyRegistry,
  isInboxStrategy,
  isSocialFeedStrategy,
} from './view-strategy.js';
