/**
 * useMenuTreeSelection Hook
 *
 * Manages the selection state for a hierarchical menu tree with cascading logic.
 * - Checking a parent auto-checks all children
 * - Unchecking a parent auto-unchecks all children
 * - Supports indeterminate state for partially selected parents
 */
import { useState, useCallback, useMemo } from 'react';

export type CheckedState = 'checked' | 'unchecked' | 'indeterminate';

export interface MenuTreeNode {
    id: string;
    label: string;
    path: string;
    icon: string | null;
    parentId: string | null;
    order: number;
    children?: MenuTreeNode[];
}

/**
 * Get all descendant IDs of a node (including nested children)
 */
function getAllDescendantIds(node: MenuTreeNode): string[] {
    const ids: string[] = [];
    if (node.children) {
        for (const child of node.children) {
            ids.push(child.id);
            ids.push(...getAllDescendantIds(child));
        }
    }
    return ids;
}

/**
 * Get all node IDs in the tree
 */
function getAllNodeIds(nodes: MenuTreeNode[]): string[] {
    const ids: string[] = [];
    for (const node of nodes) {
        ids.push(node.id);
        if (node.children) {
            ids.push(...getAllNodeIds(node.children));
        }
    }
    return ids;
}

/**
 * Find a node by ID in the tree
 */
function findNode(nodes: MenuTreeNode[], id: string): MenuTreeNode | null {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findNode(node.children, id);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Build a parent map for quick parent lookups
 */
function buildParentMap(nodes: MenuTreeNode[]): Map<string, string | null> {
    const map = new Map<string, string | null>();

    function traverse(nodeList: MenuTreeNode[], parentId: string | null) {
        for (const node of nodeList) {
            map.set(node.id, parentId);
            if (node.children) {
                traverse(node.children, node.id);
            }
        }
    }

    traverse(nodes, null);
    return map;
}

export function useMenuTreeSelection(
    menuTree: MenuTreeNode[],
    initialCheckedIds: string[] = []
) {
    const [checkedIds, setCheckedIds] = useState<Set<string>>(
        () => new Set(initialCheckedIds)
    );

    // Build helper structures
    const allNodeIds = useMemo(() => getAllNodeIds(menuTree), [menuTree]);
    const parentMap = useMemo(() => buildParentMap(menuTree), [menuTree]);

    /**
     * Toggle a node's checked state with cascading
     */
    const handleToggle = useCallback((nodeId: string) => {
        setCheckedIds(prev => {
            const next = new Set(prev);
            const node = findNode(menuTree, nodeId);

            if (!node) return prev;

            if (next.has(nodeId)) {
                // Unchecking: remove self and all descendants
                next.delete(nodeId);
                getAllDescendantIds(node).forEach(id => next.delete(id));
            } else {
                // Checking: add self and all descendants
                next.add(nodeId);
                getAllDescendantIds(node).forEach(id => next.add(id));
            }

            return next;
        });
    }, [menuTree]);

    /**
     * Select all nodes
     */
    const handleSelectAll = useCallback(() => {
        setCheckedIds(new Set(allNodeIds));
    }, [allNodeIds]);

    /**
     * Deselect all nodes
     */
    const handleDeselectAll = useCallback(() => {
        setCheckedIds(new Set());
    }, []);

    /**
     * Get the visual checked state of a node
     * - 'checked': node and all descendants are checked
     * - 'unchecked': node and all descendants are unchecked
     * - 'indeterminate': some but not all descendants are checked
     */
    const getNodeState = useCallback((nodeId: string): CheckedState => {
        const node = findNode(menuTree, nodeId);
        if (!node) return 'unchecked';

        const descendants = getAllDescendantIds(node);

        // Leaf node: simple check
        if (descendants.length === 0) {
            return checkedIds.has(nodeId) ? 'checked' : 'unchecked';
        }

        // Parent node: check descendants
        const checkedDescendants = descendants.filter(id => checkedIds.has(id));

        if (checkedDescendants.length === 0 && !checkedIds.has(nodeId)) {
            return 'unchecked';
        }
        if (checkedDescendants.length === descendants.length && checkedIds.has(nodeId)) {
            return 'checked';
        }
        return 'indeterminate';
    }, [menuTree, checkedIds]);

    /**
     * Reset to initial state
     */
    const reset = useCallback((newInitialIds: string[] = []) => {
        setCheckedIds(new Set(newInitialIds));
    }, []);

    /**
     * Get array of checked IDs
     */
    const getCheckedIds = useCallback((): string[] => {
        return Array.from(checkedIds);
    }, [checkedIds]);

    return {
        checkedIds,
        handleToggle,
        handleSelectAll,
        handleDeselectAll,
        getNodeState,
        reset,
        getCheckedIds,
    };
}
