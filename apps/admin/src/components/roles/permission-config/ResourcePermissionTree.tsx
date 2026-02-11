/**
 * ResourcePermissionTree Component
 *
 * Renders a hierarchical tree of resources with inline permission checkboxes.
 * Supports search filtering, expand/collapse, and quick actions.
 */
import { memo, useState, useCallback, useMemo } from 'react';
import { TooltipProvider } from '@wordrhyme/ui';
import { ResourceNode } from './ResourceNode';
import type { ResourceTreeNode, PermissionState, ResourcePermissionState } from './types';

interface ResourcePermissionTreeProps {
  resourceTree: ResourceTreeNode[];
  permissionState: PermissionState;
  searchTerm: string;
  disabled?: boolean;
  onToggleAction: (subject: string, action: string) => void;
  onSetActions: (subject: string, actions: string[]) => void;
  onOpenAdvanced: (subject: string) => void;
  onToggleAllForNode: (node: ResourceTreeNode) => void;
  getPermissionCount: (node: ResourceTreeNode) => { selected: number; total: number };
}

/**
 * Default permission state for a resource
 */
const DEFAULT_RESOURCE_STATE: ResourcePermissionState = {
  actions: [],
  fields: null,
  preset: null,
  customConditions: null,
};

/**
 * Check if a node or any of its descendants match the search term
 */
function nodeMatchesSearch(node: ResourceTreeNode, searchTerm: string): boolean {
  const term = searchTerm.toLowerCase();

  // Check if this node matches
  if (
    node.label.toLowerCase().includes(term) ||
    node.subject.toLowerCase().includes(term)
  ) {
    return true;
  }

  // Check if any children match
  if (node.children) {
    return node.children.some(child => nodeMatchesSearch(child, term));
  }

  return false;
}

/**
 * Get all node IDs that should be expanded when searching
 */
function getExpandedIdsForSearch(
  nodes: ResourceTreeNode[],
  searchTerm: string
): Set<string> {
  const expandedIds = new Set<string>();

  function traverse(nodeList: ResourceTreeNode[]) {
    for (const node of nodeList) {
      if (node.children && node.children.length > 0) {
        // Expand if any descendant matches
        if (nodeMatchesSearch(node, searchTerm)) {
          expandedIds.add(node.code);
        }
        traverse(node.children);
      }
    }
  }

  traverse(nodes);
  return expandedIds;
}

export const ResourcePermissionTree = memo(function ResourcePermissionTree({
  resourceTree,
  permissionState,
  searchTerm,
  disabled = false,
  onToggleAction,
  onSetActions,
  onOpenAdvanced,
  onToggleAllForNode,
  getPermissionCount,
}: ResourcePermissionTreeProps) {
  // Track expanded nodes
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // Start with all parent nodes expanded
    const ids = new Set<string>();
    function expandParents(nodes: ResourceTreeNode[]) {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          ids.add(node.code);
          expandParents(node.children);
        }
      }
    }
    expandParents(resourceTree);
    return ids;
  });

  // When searching, auto-expand matching nodes
  const effectiveExpandedIds = useMemo(() => {
    if (searchTerm.trim()) {
      return getExpandedIdsForSearch(resourceTree, searchTerm);
    }
    return expandedIds;
  }, [resourceTree, searchTerm, expandedIds]);

  const handleToggleExpand = useCallback((nodeCode: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeCode)) {
        next.delete(nodeCode);
      } else {
        next.add(nodeCode);
      }
      return next;
    });
  }, []);

  /**
   * Get permission state for a resource
   */
  const getPermissionState = useCallback(
    (subject: string): ResourcePermissionState => {
      return permissionState[subject] || DEFAULT_RESOURCE_STATE;
    },
    [permissionState]
  );

  /**
   * Render a node and its children recursively
   */
  const renderNode = (node: ResourceTreeNode, level: number): React.ReactNode => {
    const hasChildren = !!(node.children && node.children.length > 0);
    const isExpanded = effectiveExpandedIds.has(node.code);

    // Check visibility based on search
    const isVisible = !searchTerm.trim() || nodeMatchesSearch(node, searchTerm);

    const nodePermissionState = getPermissionState(node.subject);
    const nodePermissionCount = getPermissionCount(node);

    return (
      <div key={node.code} role="group">
        <ResourceNode
          node={node}
          level={level}
          isExpanded={isExpanded}
          isVisible={isVisible}
          hasChildren={hasChildren}
          permissionState={nodePermissionState}
          permissionCount={nodePermissionCount}
          disabled={disabled}
          systemReserved={node.systemReserved}
          onToggleExpand={() => handleToggleExpand(node.code)}
          onToggleAction={(action) => onToggleAction(node.subject, action)}
          onSelectAll={() => onSetActions(node.subject, [...node.actions])}
          onSelectReadOnly={() => onSetActions(node.subject, ['read'])}
          onClearAll={() => onSetActions(node.subject, [])}
          onOpenAdvanced={() => onOpenAdvanced(node.subject)}
          onToggleAllChildren={() => onToggleAllForNode(node)}
        />

        {/* Render children if expanded */}
        {hasChildren && isExpanded && (
          <div role="group" aria-label={`${node.label} children`}>
            {node.children!.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div role="tree" aria-label="Resource permission configuration" className="py-2">
        {resourceTree.map(node => renderNode(node, 0))}

        {resourceTree.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No resources available
          </div>
        )}
      </div>
    </TooltipProvider>
  );
});
