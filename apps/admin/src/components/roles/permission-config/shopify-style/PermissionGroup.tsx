import { memo, useState, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder, HelpCircle } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Checkbox, cn, Collapsible, CollapsibleContent, CollapsibleTrigger, Tooltip, TooltipTrigger, TooltipContent } from '@wordrhyme/ui';
import { PermissionRow } from './PermissionRow';
import { groupActions, humanizeAction } from '../ResourceNode';
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
  const [isResourceExpanded, setIsResourceExpanded] = useState(false);

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

  // Case 2: Resource Node — Inline Mini Matrix
  const resourceState = permissionState[node.subject] || DEFAULT_RESOURCE_STATE;
  const hasAdvanced = !!(resourceState.preset || resourceState.customConditions);

  const groups = groupActions(node.actions);
  const sections = [
    { key: 'read', actions: groups.read },
    { key: 'write', actions: groups.write },
    { key: 'other', actions: groups.other },
  ].filter(s => s.actions.length > 0);
  const hasMultipleGroups = sections.length > 1;

  return (
    <div
      className={cn(
        'py-2 px-4 group/header',
        'hover:bg-muted/20 transition-colors'
      )}
      style={{ paddingLeft: `${level * 24 + 16}px` }}
    >
      {/* Row 1: Resource header */}
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsResourceExpanded(prev => !prev)}
      >
        <div className="flex items-center gap-3">
          <Checkbox
            id={`node-${node.code}`}
            checked={isPartiallySelected ? 'indeterminate' : isAllSelected}
            disabled={effectiveDisabled}
            onCheckedChange={(checked) => {
              handleResourceRowToggle(!!checked);
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5"
          />
          {IconComponent ? (
            <IconComponent className="h-3.5 w-3.5 text-muted-foreground/80" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-muted-foreground/60" />
          )}
          <span className="text-[13px] font-medium">{node.label}</span>
          {hasAdvanced && (
            <span className="text-[9px] uppercase tracking-wider font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
              {resourceState.preset || 'Custom'}
            </span>
          )}
          {isResourceExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div onClick={(e) => e.stopPropagation()}>
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
          </div>
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground/60 px-2 min-w-[40px] text-right">
            {nodeCount.selected}/{nodeCount.total}
          </span>
        </div>
      </div>

      {/* Row 2+: Action groups — expanded content with left guide line */}
      {isResourceExpanded && <div className="mt-2 ml-[18px] border-l-2 border-border/40 pl-4 pb-1">
        {/* Developer-defined quick-select groups */}
        {node.actionGroups && node.actionGroups.length > 0 && (
          <div className="mb-3">
            <span className="text-[11px] font-bold uppercase tracking-tight text-muted-foreground/70 mb-1.5 block">
              Presets
            </span>
            <div className="flex flex-wrap gap-2">
              {node.actionGroups.map((group) => {
                const groupAllChecked = group.actions.every(a =>
                  resourceState.actions.includes(a) || resourceState.actions.includes('manage'));
                const groupPartial = !groupAllChecked && group.actions.some(a =>
                  resourceState.actions.includes(a) || resourceState.actions.includes('manage'));
                return (
                  <label
                    key={group.key}
                    className={cn(
                      'group/pill relative flex items-center gap-2 py-1.5 px-3 rounded-lg border cursor-pointer',
                      'transition-all hover:shadow-sm active:scale-[0.98]',
                      groupAllChecked
                        ? 'bg-primary/10 border-primary text-primary shadow-sm'
                        : groupPartial
                          ? 'bg-primary/[0.03] border-primary/40 border-dashed text-foreground'
                          : 'bg-muted/30 border-border/50 text-muted-foreground hover:border-border hover:bg-muted/50',
                      effectiveDisabled && 'opacity-50 grayscale cursor-not-allowed'
                    )}
                  >
                    <Checkbox
                      checked={groupPartial ? 'indeterminate' : groupAllChecked}
                      disabled={effectiveDisabled}
                      onCheckedChange={(checked) => {
                        const current = new Set(resourceState.actions);
                        if (checked) {
                          group.actions.forEach(a => current.add(a));
                        } else {
                          group.actions.forEach(a => current.delete(a));
                        }
                        onSetActions(node.subject, [...current]);
                      }}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-xs font-semibold tracking-tight">{group.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Read / Write / Other sections */}
        <div className="flex flex-col gap-1">
          {sections.map((section) => {
            const groupAllChecked = section.actions.every(a =>
              resourceState.actions.includes(a) || resourceState.actions.includes('manage'));
            const groupPartial = !groupAllChecked && section.actions.some(a =>
              resourceState.actions.includes(a) || resourceState.actions.includes('manage'));

            return (
              <div
                key={section.key}
                className="group flex items-start gap-4 py-1.5 px-2 -mx-2 rounded-md hover:bg-muted/30 transition-colors"
              >
                {/* Group label checkbox */}
                {hasMultipleGroups && (
                  <label
                    className={cn(
                      'flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider cursor-pointer shrink-0 w-14 pt-px',
                      'hover:text-foreground transition-colors',
                      groupAllChecked || groupPartial ? 'text-foreground/80' : 'text-muted-foreground/50',
                      effectiveDisabled && 'cursor-not-allowed'
                    )}
                  >
                    <Checkbox
                      checked={groupPartial ? 'indeterminate' : groupAllChecked}
                      disabled={effectiveDisabled}
                      onCheckedChange={(checked) => {
                        const current = new Set(resourceState.actions);
                        if (checked) {
                          section.actions.forEach(a => current.add(a));
                        } else {
                          section.actions.forEach(a => current.delete(a));
                        }
                        onSetActions(node.subject, [...current]);
                      }}
                      className="h-3.5 w-3.5"
                    />
                    <span>{section.key === 'read' ? 'Read' : section.key === 'write' ? 'Write' : 'Other'}</span>
                  </label>
                )}

                {/* Actions — flex wrap for natural flow */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                  {section.actions.map((action) => {
                    const isChecked = resourceState.actions.includes(action) || resourceState.actions.includes('manage');
                    const description = node.actionDescriptions?.[action];
                    return (
                      <label
                        key={action}
                        className={cn(
                          'flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap py-0.5',
                          'hover:text-foreground transition-colors',
                          isChecked ? 'text-foreground font-medium' : 'text-muted-foreground',
                          effectiveDisabled && 'cursor-not-allowed'
                        )}
                      >
                        <Checkbox
                          checked={isChecked}
                          disabled={effectiveDisabled}
                          onCheckedChange={() => onToggleAction(node.subject, action, node.actions)}
                          className="h-3.5 w-3.5"
                        />
                        <span>{humanizeAction(action)}</span>
                        {description && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-muted-foreground/40 hover:text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[240px] text-xs">
                              {description}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>}
    </div>
  );
});