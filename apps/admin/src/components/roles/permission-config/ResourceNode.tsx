/**
 * ResourceNode Component
 *
 * Renders a single resource in the permission tree.
 * Displays action checkboxes directly on the node for quick selection.
 */
import { memo, Fragment } from 'react';
import { ChevronRight, ChevronDown, Settings2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Checkbox, Button, cn, Tooltip, TooltipContent, TooltipTrigger } from '@wordrhyme/ui';
import type { ResourceTreeNode, ResourcePermissionState } from './types';

// ─── Action Classification & Labels ───

const CRUD_READ_ACTIONS = new Set([
  'list', 'get', 'export', 'search', 'find', 'count',
]);

const CRUD_WRITE_ACTIONS = new Set([
  'create', 'update', 'delete', 'deleteMany', 'updateMany',
  'createMany', 'upsert', 'import',
]);

const READ_PREFIXES = ['list', 'get', 'find', 'search', 'count', 'my', 'check'];
const WRITE_PREFIXES = ['create', 'update', 'delete', 'set', 'assign', 'remove', 'import', 'reset', 'upsert', 'add', 'batch', 'bulk'];

/**
 * Classify action into read/write/other for visual grouping.
 */
export function classifyAction(action: string): 'read' | 'write' | 'other' {
  if (CRUD_READ_ACTIONS.has(action)) return 'read';
  if (CRUD_WRITE_ACTIONS.has(action)) return 'write';
  const lower = action.toLowerCase();
  if (READ_PREFIXES.some(p => lower.startsWith(p))) return 'read';
  if (WRITE_PREFIXES.some(p => lower.startsWith(p))) return 'write';
  return 'other';
}

/**
 * Group actions into read/write/other buckets for UI rendering.
 */
export function groupActions(actions: readonly string[]): {
  read: string[];
  write: string[];
  other: string[];
} {
  const groups = { read: [] as string[], write: [] as string[], other: [] as string[] };
  for (const action of actions) {
    groups[classifyAction(action)].push(action);
  }
  return groups;
}

/**
 * Known action display labels (standard CRUD operations).
 */
const ACTION_LABELS: Record<string, string> = {
  list: 'List',
  get: 'View',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  deleteMany: 'Bulk Delete',
  updateMany: 'Bulk Update',
  createMany: 'Bulk Create',
  upsert: 'Upsert',
  export: 'Export',
  import: 'Import',
  manage: 'Manage',
  publish: 'Publish',
};

/**
 * Humanize action name: known label → camelCase split → Title Case.
 */
export function humanizeAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

/**
 * Permission count for display
 */
interface PermissionCount {
  selected: number;
  total: number;
}

interface ResourceNodeProps {
  node: ResourceTreeNode;
  level: number;
  isExpanded: boolean;
  isVisible: boolean;
  hasChildren: boolean;
  permissionState: ResourcePermissionState;
  permissionCount: PermissionCount;
  disabled?: boolean;
  /** System reserved - show as disabled with tooltip */
  systemReserved?: boolean;
  onToggleExpand: () => void;
  onToggleAction: (action: string) => void;
  onSelectAll: () => void;
  onSelectReadOnly: () => void;
  onSelectWriteOnly: () => void;
  onClearAll: () => void;
  onOpenAdvanced: () => void;
  onToggleAllChildren?: () => void; // Cascade selection for directory nodes
}

/**
 * Resolve a Lucide icon name to its component
 */
function resolveIcon(iconName: string | null): LucideIcon | null {
  if (!iconName) return null;

  const icons = LucideIcons as unknown as Record<string, LucideIcon | undefined>;

  // Try direct lookup first (if already PascalCase)
  let icon = icons[iconName];
  if (icon) return icon;

  // Convert kebab-case to PascalCase
  const pascalCase = iconName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  icon = icons[pascalCase];
  return icon ?? null;
}

export const ResourceNode = memo(function ResourceNode({
  node,
  level,
  isExpanded,
  isVisible,
  hasChildren,
  permissionState,
  permissionCount,
  disabled = false,
  systemReserved = false,
  onToggleExpand,
  onToggleAction,
  onSelectAll,
  onSelectReadOnly,
  onSelectWriteOnly,
  onClearAll,
  onOpenAdvanced,
  onToggleAllChildren,
}: ResourceNodeProps) {
  if (!isVisible) return null;

  const IconComponent = resolveIcon(node.icon);
  const indentPx = level * 24;
  const isDirectory = node.isDirectory;
  const hasAdvancedConfig = permissionState.preset || permissionState.customConditions;

  // Combine disabled state: either explicitly disabled or system reserved
  const isDisabled = disabled || systemReserved;

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowRight':
        if (hasChildren && !isExpanded) {
          e.preventDefault();
          onToggleExpand();
        }
        break;
      case 'ArrowLeft':
        if (hasChildren && isExpanded) {
          e.preventDefault();
          onToggleExpand();
        }
        break;
    }
  };

  return (
    <div
      role="treeitem"
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-level={level + 1}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex items-center gap-2 py-2 px-3 rounded-md',
        'hover:bg-muted/50',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
        'transition-colors group',
        systemReserved && 'opacity-60 bg-muted/30'
      )}
      style={{ paddingLeft: `${indentPx + 12}px` }}
    >
      {/* Expand/Collapse Toggle */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (hasChildren) onToggleExpand();
        }}
        className={cn(
          'w-5 h-5 flex items-center justify-center rounded',
          'hover:bg-muted',
          !hasChildren && 'invisible'
        )}
        aria-label={isExpanded ? 'Collapse' : 'Expand'}
      >
        {hasChildren && (
          isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )
        )}
      </button>

      {/* Icon */}
      {IconComponent && (
        <IconComponent className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      )}

      {/* Directory Checkbox (cascade selection) */}
      {isDirectory && hasChildren && permissionCount.total > 0 && (
        <Checkbox
          checked={permissionCount.selected === permissionCount.total}
          disabled={isDisabled}
          onCheckedChange={() => onToggleAllChildren?.()}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4"
          {...(permissionCount.selected > 0 && permissionCount.selected < permissionCount.total
            ? { 'data-state': 'indeterminate' as const }
            : {})}
        />
      )}

      {/* Label */}
      <span className="text-sm font-medium truncate min-w-[120px]">
        {node.label}
        {systemReserved && (
          <span className="ml-2 text-xs text-muted-foreground">(系统保留)</span>
        )}
      </span>

      {/* Permission Count Badge (for directories or resources with children) */}
      {permissionCount.total > 0 && (
        <span className={cn(
          'text-xs px-1.5 py-0.5 rounded',
          permissionCount.selected > 0
            ? 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground'
        )}>
          {permissionCount.selected}/{permissionCount.total}
        </span>
      )}

      {/* Action Checkboxes — grouped by read/write/other */}
      {!isDirectory && node.actions.length > 0 && (() => {
        const groups = groupActions(node.actions);
        const sections: { key: string; actions: string[] }[] = [];
        if (groups.read.length > 0) sections.push({ key: 'read', actions: groups.read });
        if (groups.write.length > 0) sections.push({ key: 'write', actions: groups.write });
        if (groups.other.length > 0) sections.push({ key: 'other', actions: groups.other });

        return (
          <div className="flex items-center gap-1.5 ml-4 flex-wrap">
            {sections.map((section, si) => (
              <Fragment key={section.key}>
                {si > 0 && (
                  <span className="text-muted-foreground/30 mx-0.5 select-none">|</span>
                )}
                {section.actions.map((action) => {
                  const isChecked = permissionState.actions.includes(action);
                  const label = humanizeAction(action);

                  return (
                    <label
                      key={action}
                      className={cn(
                        'flex items-center gap-1.5 text-xs cursor-pointer',
                        'hover:text-foreground',
                        isChecked ? 'text-foreground' : 'text-muted-foreground',
                        isDisabled && 'cursor-not-allowed'
                      )}
                    >
                      <Checkbox
                        checked={isChecked}
                        disabled={isDisabled}
                        onCheckedChange={() => onToggleAction(action)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-3.5"
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </Fragment>
            ))}
          </div>
        );
      })()}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Quick Actions (shown on hover) */}
      {!isDirectory && node.actions.length > 0 && !isDisabled && (() => {
        const groups = groupActions(node.actions);
        return (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAll();
                }}
              >
                All
              </Button>
            </TooltipTrigger>
            <TooltipContent>Select all actions</TooltipContent>
          </Tooltip>

          {groups.read.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectReadOnly();
                  }}
                >
                  Read
                </Button>
              </TooltipTrigger>
              <TooltipContent>Select read-only actions</TooltipContent>
            </Tooltip>
          )}

          {groups.write.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectWriteOnly();
                  }}
                >
                  Write
                </Button>
              </TooltipTrigger>
              <TooltipContent>Select write-only actions</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearAll();
                }}
              >
                Clear
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove all permissions</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAdvanced();
                }}
              >
                <Settings2 className={cn(
                  'h-3.5 w-3.5',
                  hasAdvancedConfig ? 'text-primary' : 'text-muted-foreground'
                )} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {hasAdvancedConfig ? 'Edit advanced config' : 'Advanced config'}
            </TooltipContent>
          </Tooltip>
        </div>
        );
      })()}

      {/* Advanced Config Badge */}
      {hasAdvancedConfig && (
        <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">
          {permissionState.preset || 'Custom'}
        </span>
      )}
    </div>
  );
});
