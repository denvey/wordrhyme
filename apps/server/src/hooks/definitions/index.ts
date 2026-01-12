/**
 * Hook Definitions Index
 *
 * Exports all hook definitions for registration.
 */

import { HookDefinition } from '../hook.types';
import { CONTENT_HOOKS } from './content.hooks';
import { USER_HOOKS } from './user.hooks';
import { ECOMMERCE_HOOKS } from './ecommerce.hooks';
import { MEDIA_HOOKS } from './media.hooks';
import { ALL_SYSTEM_HOOKS } from './system.hooks';

// Re-export individual modules
export * from './content.hooks';
export * from './user.hooks';
export * from './ecommerce.hooks';
export * from './media.hooks';
export * from './system.hooks';

/**
 * All Core Hook Definitions
 *
 * This is the complete list of hooks that Core defines.
 * Plugins can register handlers for these hooks.
 */
export const ALL_HOOKS: HookDefinition[] = [
  ...CONTENT_HOOKS,
  ...USER_HOOKS,
  ...ECOMMERCE_HOOKS,
  ...MEDIA_HOOKS,
  ...ALL_SYSTEM_HOOKS,
];

/**
 * Get hook count by category
 */
export function getHookStats(): {
  content: number;
  user: number;
  ecommerce: number;
  media: number;
  system: number;
  total: number;
} {
  return {
    content: CONTENT_HOOKS.length,
    user: USER_HOOKS.length,
    ecommerce: ECOMMERCE_HOOKS.length,
    media: MEDIA_HOOKS.length,
    system: ALL_SYSTEM_HOOKS.length,
    total: ALL_HOOKS.length,
  };
}
