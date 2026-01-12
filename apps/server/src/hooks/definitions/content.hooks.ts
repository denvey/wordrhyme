/**
 * Content Hooks
 *
 * Hook definitions for Content CRUD lifecycle.
 */

import { HookDefinition } from '../hook.types';

export const CONTENT_HOOKS: HookDefinition[] = [
  // Single operations
  {
    id: 'content.beforeCreate',
    type: 'filter',
    description: 'Before content creation - fill defaults, filter sensitive words',
    defaultTimeout: 5000,
  },
  {
    id: 'content.afterCreate',
    type: 'action',
    description: 'After content creation - notifications, index sync',
    defaultTimeout: 5000,
  },
  {
    id: 'content.onRead',
    type: 'filter',
    description: 'On read - inject computed fields, field-level masking',
    defaultTimeout: 3000,
  },
  {
    id: 'content.beforeUpdate',
    type: 'filter',
    description: 'Before update - optimistic lock, immutable field protection',
    defaultTimeout: 5000,
  },
  {
    id: 'content.afterUpdate',
    type: 'action',
    description: 'After update - clear cache, webhook',
    defaultTimeout: 5000,
  },
  {
    id: 'content.beforeDelete',
    type: 'filter',
    description: 'Before delete - reference check (throw to abort)',
    defaultTimeout: 5000,
  },
  {
    id: 'content.afterDelete',
    type: 'action',
    description: 'After delete - cleanup orphan resources',
    defaultTimeout: 5000,
  },

  // Publish lifecycle
  {
    id: 'content.beforePublish',
    type: 'filter',
    description: 'Before publish - approval workflow',
    defaultTimeout: 5000,
  },
  {
    id: 'content.afterPublish',
    type: 'action',
    description: 'After publish - SSG trigger, CDN push',
    defaultTimeout: 10000,
  },
  {
    id: 'content.beforeUnpublish',
    type: 'filter',
    description: 'Before unpublish',
    defaultTimeout: 5000,
  },
  {
    id: 'content.afterUnpublish',
    type: 'action',
    description: 'After unpublish',
    defaultTimeout: 5000,
  },

  // Analytics
  {
    id: 'content.onView',
    type: 'action',
    description: 'On view - analytics',
    defaultTimeout: 3000,
  },

  // Bulk operations
  {
    id: 'content.beforeBulkCreate',
    type: 'filter',
    description: 'Bulk create before',
    defaultTimeout: 10000,
  },
  {
    id: 'content.afterBulkCreate',
    type: 'action',
    description: 'Bulk create after',
    defaultTimeout: 10000,
  },
  {
    id: 'content.beforeBulkUpdate',
    type: 'filter',
    description: 'Bulk update before',
    defaultTimeout: 10000,
  },
  {
    id: 'content.afterBulkUpdate',
    type: 'action',
    description: 'Bulk update after',
    defaultTimeout: 10000,
  },
  {
    id: 'content.beforeBulkDelete',
    type: 'filter',
    description: 'Bulk delete before',
    defaultTimeout: 10000,
  },
  {
    id: 'content.afterBulkDelete',
    type: 'action',
    description: 'Bulk delete after',
    defaultTimeout: 10000,
  },
];
