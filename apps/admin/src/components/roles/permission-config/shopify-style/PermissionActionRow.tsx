/**
 * PermissionActionRow Component
 *
 * Shopify-style permission row with individual action checkboxes.
 * Shows each action (Create, Read, Update, Delete, etc.) as separate checkboxes.
 */
import { memo } from 'react';
import { Checkbox, cn } from '@wordrhyme/ui';
import type { ResourcePermissionState } from '../types';

/**
 * Action display configuration
 */
const ACTION_CONFIG: Record<string, { label: string; shortLabel: string }> = {
  create: { label: 'Create', shortLabel: 'C' },
  read: { label: 'Read', shortLabel: 'R' },
  update: { label: 'Update', shortLabel: 'U' },
  delete: { label: 'Delete', shortLabel: 'D' },
  publish: { label: 'Publish', shortLabel: 'P' },
  manage: { label: 'Manage', shortLabel: 'M' },
};

interface PermissionActionRowProps {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Available actions for this resource */
  actions: readonly string[];
  /** Current permission state */
  permissionState: ResourcePermissionState;
  /** Whether the row is disabled */
  disabled?: boolean;
  /** Use compact mode (show short labels) */
  compact?: boolean;
  /** Callback when an action is toggled */
  onToggleAction: (action: string) => void;
  /** Callback when all actions are toggled */
  onToggleAll: (checked: boolean) => void;
}

export const PermissionActionRow = memo(function PermissionActionRow({
  id,
  label,
  actions,
  permissionState,
  disabled = false,
  compact = false,
  onToggleAction,
  onToggleAll,
}: PermissionActionRowProps) {
  const selectedCount = permissionState.actions.length;
  const totalCount = actions.length;
  const isAllSelected = selectedCount === totalCount && totalCount > 0;
  const isPartiallySelected = selectedCount > 0 && selectedCount < totalCount;

  return (
    <div
      className={cn(
        'flex items-center gap-4 py-3 px-4',
        'border-b border-border last:border-b-0',
        'hover:bg-muted/30 transition-colors'
      )}
    >
      {/* Resource Checkbox (select all actions) */}
      <label
        htmlFor={id}
        className={cn(
          'flex items-center gap-3 min-w-[200px] cursor-pointer select-none',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        <Checkbox
          id={id}
          checked={isPartiallySelected ? 'indeterminate' : isAllSelected}
          disabled={disabled}
          onCheckedChange={(value) => {
            if (value !== 'indeterminate') {
              onToggleAll(value);
            }
          }}
          className="h-4 w-4"
        />
        <span className="text-sm font-medium truncate">{label}</span>
      </label>

      {/* Individual Action Checkboxes */}
      <div className="flex items-center gap-4 flex-1">
        {actions.map((action) => {
          const config = ACTION_CONFIG[action] || { label: action, shortLabel: action[0].toUpperCase() };
          const isChecked = permissionState.actions.includes(action);

          return (
            <label
              key={action}
              className={cn(
                'flex items-center gap-1.5 cursor-pointer select-none',
                'hover:text-foreground transition-colors',
                disabled && 'cursor-not-allowed opacity-60'
              )}
            >
              <Checkbox
                id={`${id}-${action}`}
                checked={isChecked}
                disabled={disabled}
                onCheckedChange={() => onToggleAction(action)}
                className="h-3.5 w-3.5"
              />
              <span
                className={cn(
                  'text-xs',
                  isChecked ? 'text-foreground font-medium' : 'text-muted-foreground'
                )}
              >
                {compact ? config.shortLabel : config.label}
              </span>
            </label>
          );
        })}
      </div>

      {/* Permission Count */}
      <span
        className={cn(
          'text-xs font-medium tabular-nums min-w-[40px] text-right',
          selectedCount > 0 ? 'text-primary' : 'text-muted-foreground'
        )}
      >
        {selectedCount}/{totalCount}
      </span>
    </div>
  );
});
