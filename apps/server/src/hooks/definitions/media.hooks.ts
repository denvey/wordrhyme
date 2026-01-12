/**
 * Media Hooks
 *
 * Hook definitions for Media/File upload and processing.
 */

import { HookDefinition } from '../hook.types';

export const MEDIA_HOOKS: HookDefinition[] = [
  {
    id: 'media.beforeUpload',
    type: 'filter',
    description: 'Before upload - validation, virus scan',
    defaultTimeout: 10000,
  },
  {
    id: 'media.afterUpload',
    type: 'action',
    description: 'After upload - queue processing',
    defaultTimeout: 5000,
  },
  {
    id: 'media.onProcess',
    type: 'action',
    description: 'Async processing (non-blocking)',
    defaultTimeout: 30000,
  },
  {
    id: 'media.onProcessingComplete',
    type: 'action',
    description: 'Processing completed',
    defaultTimeout: 5000,
  },
  {
    id: 'media.transform',
    type: 'filter',
    description: 'On-demand transform',
    defaultTimeout: 10000,
  },
  {
    id: 'media.onRead',
    type: 'filter',
    description: 'On read - dynamic URL signing',
    defaultTimeout: 3000,
  },
  {
    id: 'media.beforeDelete',
    type: 'filter',
    description: 'Before delete - reference check',
    defaultTimeout: 5000,
  },
  {
    id: 'media.afterDelete',
    type: 'action',
    description: 'After delete - CDN cleanup',
    defaultTimeout: 10000,
  },
  {
    id: 'media.beforeBulkDelete',
    type: 'filter',
    description: 'Bulk delete before',
    defaultTimeout: 10000,
  },
  {
    id: 'media.afterBulkDelete',
    type: 'action',
    description: 'Bulk delete after',
    defaultTimeout: 10000,
  },
];
