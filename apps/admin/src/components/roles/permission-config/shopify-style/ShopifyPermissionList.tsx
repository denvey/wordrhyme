import { memo, useCallback, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Checkbox, Input, Button, cn } from '@wordrhyme/ui';
import { PermissionGroup } from './PermissionGroup';
import type { ResourceTreeNode, PermissionState } from '../types';

interface ShopifyPermissionListProps {
  /** Resource tree data */
  resourceTree: ResourceTreeNode[];
  /** Current permission state */
  permissionState: PermissionState;
  /** Search term for filtering */
  searchTerm?: string;
  /** Whether the list is disabled */
  disabled?: boolean;
  /** Callback when search term changes */
  onSearchChange?: (term: string) => void;
  /** Callback when an action is toggled */
  onToggleAction: (subject: string, action: string, availableActions?: readonly string[]) => void;
  /** Callback when all actions for a resource are set */
  onSetActions: (subject: string, actions: string[]) => void;
  /** Callback when all permissions for a node are toggled */
  onToggleAllForNode: (node: ResourceTreeNode) => void;
  /** Callback when all permissions are toggled */
  onToggleAll: (resourceTree: ResourceTreeNode[], selectAll: boolean) => void;
  /** Get permission count for a node */
  getPermissionCount: (node: ResourceTreeNode) => { selected: number; total: number };
  /** Get total permission count */
  getTotalPermissionCount: (resourceTree: ResourceTreeNode[]) => { selected: number; total: number };
  /** Callback to open advanced configuration */
  onOpenAdvanced: (subject: string) => void;
}

/**
 * Action labels for display (matching the ones in PermissionGroup)
 */
const ACTION_LABELS: Record<string, string> = {
  create: 'Create',
  read: 'Read',
  update: 'Update',
  delete: 'Delete',
  publish: 'Publish',
  manage: 'Manage',
};

/**
 * Filter nodes by search term
 */
function filterBySearch(
  nodes: ResourceTreeNode[],
  searchTerm: string
): ResourceTreeNode[] {
  if (!searchTerm.trim()) return nodes;

  const term = searchTerm.toLowerCase();

  const filterNode = (node: ResourceTreeNode): ResourceTreeNode | null => {
    const matchesLabel = node.label.toLowerCase().includes(term);
    const matchesSubject = node.subject.toLowerCase().includes(term);

    // Check if any action label matches
    const matchesAction = node.actions.some(action =>
      (ACTION_LABELS[action] || action).toLowerCase().includes(term)
    );

    // Filter children recursively
    const filteredChildren = node.children
      .map(filterNode)
      .filter((n): n is ResourceTreeNode => n !== null);

    // Keep node if it matches, has matching action, or has matching children
    if (matchesLabel || matchesSubject || matchesAction || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
      };
    }

    return null;
  };

  return nodes
    .map(filterNode)
    .filter((n): n is ResourceTreeNode => n !== null);
}

export const ShopifyPermissionList = memo(function ShopifyPermissionList({
  resourceTree,
  permissionState,
  searchTerm = '',
  disabled = false,
  onSearchChange,
  onToggleAction,
  onSetActions,
  onToggleAllForNode,
  onToggleAll,
  getPermissionCount,
  getTotalPermissionCount,
  onOpenAdvanced,
}: ShopifyPermissionListProps) {
  const [expandAll, setExpandAll] = useState(false);

  // Filter tree by search term
  const filteredTree = useMemo(
    () => filterBySearch(resourceTree, searchTerm),
    [resourceTree, searchTerm]
  );

  // Calculate total permission count
  const totalCount = useMemo(
    () => getTotalPermissionCount(resourceTree),
    [resourceTree, getTotalPermissionCount]
  );

  const isAllSelected = totalCount.selected === totalCount.total && totalCount.total > 0;
  const isPartiallySelected = totalCount.selected > 0 && totalCount.selected < totalCount.total;

  // Handle "Select All" toggle
  const handleSelectAllChange = useCallback(
    (checked: boolean) => {
      onToggleAll(resourceTree, checked);
    },
    [resourceTree, onToggleAll]
  );

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Search Header */}
      {onSearchChange && (
        <div className="p-3 border-b border-border bg-muted/5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search permissions..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 bg-background h-9 text-sm ring-offset-background"
            />
          </div>
        </div>
      )}

      {/* Select All Header */}
      <div
        className={cn(
          'flex items-center justify-between py-2.5 px-4',
          'bg-background border-b border-border',
          'sticky top-0 z-10'
        )}
      >
        <div className="flex items-center gap-3">
          <Checkbox
            id="select-all"
            checked={isPartiallySelected ? 'indeterminate' : isAllSelected}
            disabled={disabled}
            onCheckedChange={(value) => {
              if (value !== 'indeterminate') {
                handleSelectAllChange(value);
              }
            }}
            className="h-4 w-4"
          />
          <label
            htmlFor="select-all"
            className={cn(
              'text-sm font-medium cursor-pointer select-none',
              disabled && 'cursor-not-allowed opacity-60'
            )}
          >
            Select all permissions
          </label>
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs font-normal"
            onClick={() => setExpandAll(!expandAll)}
          >
            {expandAll ? 'Collapse all' : 'Expand all'}
          </Button>

          <span
            className={cn(
              'text-xs font-medium tabular-nums px-2 py-0.5 rounded-full bg-muted/50',
              totalCount.selected > 0 ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            {totalCount.selected}/{totalCount.total}
          </span>
        </div>
      </div>

      {/* Permission Groups */}
      <div className="flex flex-col bg-background">
        {filteredTree.map((node) => (
          <PermissionGroup
            key={node.code}
            node={node}
            permissionState={permissionState}
            disabled={disabled}
            onToggleAction={onToggleAction}
            onSetActions={onSetActions}
            onToggleNode={onToggleAllForNode}
            getPermissionCount={getPermissionCount}
            onOpenAdvanced={onOpenAdvanced}
            defaultOpen={expandAll || !!searchTerm.trim()}
          />
        ))}
      </div>

      {/* Empty State */}
      {filteredTree.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-3 opacity-20" />
          <p className="text-sm">
            {searchTerm.trim()
              ? 'No permissions match your search.'
              : 'No permissions available.'}
          </p>
        </div>
      )}
    </div>
  );
});
