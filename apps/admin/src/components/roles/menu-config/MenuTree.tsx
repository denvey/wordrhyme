/**
 * MenuTree Component
 *
 * Renders a hierarchical tree of menu items with expand/collapse functionality.
 * Supports search filtering while keeping parent nodes visible for context.
 */
import { memo, useState, useCallback, useMemo } from 'react';
import { MenuNode } from './MenuNode';
import type { CheckedState, MenuTreeNode } from './useMenuTreeSelection';

interface MenuTreeProps {
    menuTree: MenuTreeNode[];
    checkedIds: Set<string>;
    searchTerm: string;
    getNodeState: (nodeId: string) => CheckedState;
    onToggleCheck: (nodeId: string) => void;
}

/**
 * Check if a node or any of its descendants match the search term
 */
function nodeMatchesSearch(node: MenuTreeNode, searchTerm: string): boolean {
    const term = searchTerm.toLowerCase();

    // Check if this node matches
    if (node.label.toLowerCase().includes(term) || node.path.toLowerCase().includes(term)) {
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
function getExpandedIdsForSearch(nodes: MenuTreeNode[], searchTerm: string): Set<string> {
    const expandedIds = new Set<string>();

    function traverse(nodeList: MenuTreeNode[]) {
        for (const node of nodeList) {
            if (node.children && node.children.length > 0) {
                // Expand if any descendant matches
                if (nodeMatchesSearch(node, searchTerm)) {
                    expandedIds.add(node.id);
                }
                traverse(node.children);
            }
        }
    }

    traverse(nodes);
    return expandedIds;
}

export const MenuTree = memo(function MenuTree({
    menuTree,
    checkedIds,
    searchTerm,
    getNodeState,
    onToggleCheck,
}: MenuTreeProps) {
    // Track expanded nodes
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
        // Start with all parent nodes expanded
        const ids = new Set<string>();
        function expandParents(nodes: MenuTreeNode[]) {
            for (const node of nodes) {
                if (node.children && node.children.length > 0) {
                    ids.add(node.id);
                    expandParents(node.children);
                }
            }
        }
        expandParents(menuTree);
        return ids;
    });

    // When searching, auto-expand matching nodes
    const effectiveExpandedIds = useMemo(() => {
        if (searchTerm.trim()) {
            return getExpandedIdsForSearch(menuTree, searchTerm);
        }
        return expandedIds;
    }, [menuTree, searchTerm, expandedIds]);

    const handleToggleExpand = useCallback((nodeId: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    }, []);

    /**
     * Expand all nodes
     */
    const expandAll = useCallback(() => {
        const allIds = new Set<string>();
        function traverse(nodes: MenuTreeNode[]) {
            for (const node of nodes) {
                if (node.children && node.children.length > 0) {
                    allIds.add(node.id);
                    traverse(node.children);
                }
            }
        }
        traverse(menuTree);
        setExpandedIds(allIds);
    }, [menuTree]);

    /**
     * Collapse all nodes
     */
    const collapseAll = useCallback(() => {
        setExpandedIds(new Set());
    }, []);

    /**
     * Render a node and its children recursively
     */
    const renderNode = (node: MenuTreeNode, level: number): React.ReactNode => {
        const hasChildren = !!(node.children && node.children.length > 0);
        const isExpanded = effectiveExpandedIds.has(node.id);

        // Check visibility based on search
        const isVisible = !searchTerm.trim() || nodeMatchesSearch(node, searchTerm);

        return (
            <div key={node.id} role="group">
                <MenuNode
                    node={node}
                    level={level}
                    checkedState={getNodeState(node.id)}
                    isExpanded={isExpanded}
                    isVisible={isVisible}
                    hasChildren={hasChildren}
                    onToggleCheck={() => onToggleCheck(node.id)}
                    onToggleExpand={() => handleToggleExpand(node.id)}
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
        <div role="tree" aria-label="Menu visibility configuration" className="py-2">
            {menuTree.map(node => renderNode(node, 0))}

            {menuTree.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                    No menus available
                </div>
            )}
        </div>
    );
});

// Export expand/collapse methods for external use
export type MenuTreeHandle = {
    expandAll: () => void;
    collapseAll: () => void;
};
