import { memo, useState, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Checkbox, cn, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wordrhyme/ui';
import { PermissionRow } from './PermissionRow';
import type { ResourceTreeNode, PermissionState, ResourcePermissionState } from '../types';

/**
 * Resolve a Lucide icon name to its component
 */
function resolveIcon(iconName: string | null): LucideIcon | null {
  if (!iconName) return null;
  const icons = LucideIcons as unknown as Record<string, LucideIcon | undefined>;

  // Try direct match
  let icon = icons[iconName];
  if (icon) return icon;

  // Try PascalCase
  const pascalCase = iconName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
  icon = icons[pascalCase];
  return icon ?? null;
}

/**
 * Action labels for display
 */
const ACTION_LABELS: Record<string, string> = {
  create: 'Create',
  read: 'Read',
  update: 'Update',
  delete: 'Delete',
  publish: 'Publish',
  manage: 'Manage',
};

interface PermissionGroupProps {
  /** Node data (Directory or Resource) */
  node: ResourceTreeNode;
  /** Current permission state */
  permissionState: PermissionState;
  /** Whether components are disabled */
  disabled?: boolean;
  /** Indentation level */
  level?: number;
  /** Callback when an individual action is toggled */
  onToggleAction: (subject: string, action: string, availableActions?: readonly string[]) => void;
  /** Callback when all actions for a resource are set */
  onSetActions: (subject: string, actions: string[]) => void;
  /** Callback when all permissions in a branch are toggled */
  onToggleNode: (node: ResourceTreeNode) => void;
  /** Get permission count for a node */
  getPermissionCount: (node: ResourceTreeNode) => { selected: number; total: number };
  /** Callback to open advanced configuration */
  onOpenAdvanced: (subject: string) => void;
  /** Default open state */
  defaultOpen?: boolean;
}

const DEFAULT_RESOURCE_STATE: ResourcePermissionState = {
  actions: [],
  fields: null,
  preset: null,
  customConditions: null,
};

export const PermissionGroup = memo(function PermissionGroup({
  node,
  permissionState,
  disabled = false,
  level = 0,
  onToggleAction,
  onSetActions,
  onToggleNode,
  getPermissionCount,
  onOpenAdvanced,
  defaultOpen = true,
}: PermissionGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const nodeCount = getPermissionCount(node);
  const isAllSelected = nodeCount.selected === nodeCount.total && nodeCount.total > 0;
  const isPartiallySelected = nodeCount.selected > 0 && nodeCount.selected < nodeCount.total;

  const IconComponent = useMemo(() => resolveIcon(node.icon), [node.icon]);

  const effectiveDisabled = !!(disabled || node.systemReserved);

  const handleToggle = useCallback(() => {
    if (effectiveDisabled) return;
    onToggleNode(node);
  }, [node, onToggleNode, effectiveDisabled]);

  const handleResourceRowToggle = useCallback(
    (checked: boolean) => {
      if (effectiveDisabled) return;
      onSetActions(node.subject, checked ? [...node.actions] : []);
    },
    [node, onSetActions, effectiveDisabled]
  );

  if (nodeCount.total === 0 && !node.isDirectory) {
    return null;
  }

  // Case 1: Directory Node
  if (node.isDirectory) {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
        <div
          className={cn(
            'flex items-center justify-between py-2 px-4 group/header',
            'hover:bg-muted/30 transition-colors',
            level === 0 && 'bg-muted/5 border-y border-border/60'
          )}
          style={{ paddingLeft: `${level * 24 + 16}px` }}
        >
          <div className="flex items-center gap-3 flex-1">
            <Checkbox
              id={`node-${node.code}`}
              checked={isPartiallySelected ? 'indeterminate' : isAllSelected}
              disabled={effectiveDisabled}
              onCheckedChange={() => handleToggle()}
              className="h-3.5 w-3.5"
            />
            <CollapsibleTrigger className="flex items-center gap-2.5 flex-1 cursor-pointer select-none">
              {IconComponent ? (
                <IconComponent className="h-3.5 w-3.5 text-muted-foreground/80" />
              ) : (
                <Folder className="h-3.5 w-3.5 text-muted-foreground/60" />
              )}
              <span className={cn(
                "text-[13px]",
                level === 0 ? "font-semibold" : "font-medium"
              )}>
                {node.label}
              </span>
              {node.children.length > 0 && (
                isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                )
              )}
            </CollapsibleTrigger>
          </div>

          <span className="text-[11px] font-medium tabular-nums text-muted-foreground/60 px-2">
            {nodeCount.selected}/{nodeCount.total}
          </span>
        </div>

        <CollapsibleContent>
          <div className="flex flex-col">
            {node.children.map((child) => (
              <PermissionGroup
                key={child.code}
                node={child}
                permissionState={permissionState}
                disabled={effectiveDisabled}
                level={level + 1}
                onToggleAction={onToggleAction}
                onSetActions={onSetActions}
                onToggleNode={onToggleNode}
                getPermissionCount={getPermissionCount}
                onOpenAdvanced={onOpenAdvanced}
                defaultOpen={defaultOpen}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  // Case 2: Resource Node
  const resourceState = permissionState[node.subject] || DEFAULT_RESOURCE_STATE;
  const hasAdvanced = !!(resourceState.preset || resourceState.customConditions);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <div
        className={cn(
          'flex items-center justify-between py-1.5 px-4 group/header',
          'hover:bg-muted/20 transition-colors'
        )}
        style={{ paddingLeft: `${level * 24 + 16}px` }}
      >
        <div className="flex items-center gap-3 flex-1">
          <Checkbox
            id={`node-${node.code}`}
            checked={isPartiallySelected ? 'indeterminate' : isAllSelected}
            disabled={effectiveDisabled}
            onCheckedChange={(checked) => handleResourceRowToggle(!!checked)}
            className="h-3.5 w-3.5"
          />
          <CollapsibleTrigger className="flex items-center gap-2.5 flex-1 cursor-pointer select-none">
            {IconComponent ? (
              <IconComponent className="h-3.5 w-3.5 text-muted-foreground/80" />
            ) : (
              <FileText className="h-3.5 w-3.5 text-muted-foreground/60" />
            )}
            <span className="text-[13px] font-medium">{node.label}</span>
            {node.actions.length > 0 && (
              isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
              )
            )}
            {hasAdvanced && (
              <span className="text-[9px] uppercase tracking-wider font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                {resourceState.preset || 'Custom'}
              </span>
            )}
          </CollapsibleTrigger>
        </div>

        <div className="flex items-center gap-1">
          <PermissionRow
            id={`resource-row-${node.code}`}
            label=""
            checked={isAllSelected}
            disabled={effectiveDisabled}
            level={0}
            hasAdvancedConfig={hasAdvanced}
            onCheckedChange={() => { }}
            onOpenAdvanced={() => onOpenAdvanced(node.subject)}
            isOnlySettings
          />
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground/60 px-2 min-w-[40px] text-right">
            {nodeCount.selected}/{nodeCount.total}
          </span>
        </div>
      </div>

      <CollapsibleContent>
        <div className="flex flex-col">
          {node.actions.map((action) => (
            <PermissionRow
              key={`${node.subject}-${action}`}
              id={`${node.subject}-${action}`}
              label={ACTION_LABELS[action] || action}
              checked={resourceState.actions.includes(action) || resourceState.actions.includes('manage')}
              disabled={effectiveDisabled}
              level={level + 1}
              onCheckedChange={() => onToggleAction(node.subject, action, node.actions)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});
