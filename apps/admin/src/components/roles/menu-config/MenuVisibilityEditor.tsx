/**
 * MenuVisibilityEditor Component
 *
 * Main container for editing menu visibility configuration for a role.
 * Handles data fetching, state management, and save operations.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Save, RotateCcw, Loader2, AlertCircle, Info } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@wordrhyme/ui';
import { toast } from 'sonner';
import { trpc } from '../../../lib/trpc';
import { MenuToolbar } from './MenuToolbar';
import { MenuTree } from './MenuTree';
import { useMenuTreeSelection, type MenuTreeNode } from './useMenuTreeSelection';

interface MenuVisibilityEditorProps {
    roleId: string;
    isSystem?: boolean;
    organizationId?: string | null; // null = global scope
}

interface MenuConfigItem {
    menuId: string;
    code: string;
    label: string;
    path: string;
    icon: string | null;
    parentCode: string | null;
    order: number;
    effectiveVisible: boolean;
}

/**
 * Build tree structure from flat menu list
 * Uses code/parentCode for hierarchy (not menuId/parentId)
 */
function buildMenuTree(menus: Array<{
    menuId: string;
    code: string;
    label: string;
    path: string;
    icon: string | null;
    parentCode: string | null;
    order: number;
    effectiveVisible: boolean;
}>): MenuTreeNode[] {
    // Create maps for quick lookup
    const menuMap = new Map<string, MenuTreeNode>(); // menuId -> node
    const codeToIdMap = new Map<string, string>(); // code -> menuId
    const rootNodes: MenuTreeNode[] = [];

    // First pass: create all nodes and build code->id mapping
    for (const menu of menus) {
        codeToIdMap.set(menu.code, menu.menuId);
        menuMap.set(menu.menuId, {
            id: menu.menuId,
            label: menu.label,
            path: menu.path,
            icon: menu.icon,
            parentId: menu.parentCode ? codeToIdMap.get(menu.parentCode) || null : null,
            order: menu.order,
            children: [],
        });
    }

    // Second pass: resolve parentCode to parentId and build hierarchy
    for (const menu of menus) {
        const node = menuMap.get(menu.menuId)!;
        const parentId = menu.parentCode ? codeToIdMap.get(menu.parentCode) : null;

        if (parentId && menuMap.has(parentId)) {
            const parent = menuMap.get(parentId)!;
            parent.children = parent.children || [];
            parent.children.push(node);
        } else {
            rootNodes.push(node);
        }
    }

    // Sort by order
    const sortNodes = (nodes: MenuTreeNode[]) => {
        nodes.sort((a, b) => a.order - b.order);
        for (const node of nodes) {
            if (node.children) {
                sortNodes(node.children);
            }
        }
    };
    sortNodes(rootNodes);

    return rootNodes;
}

export function MenuVisibilityEditor({
    roleId,
    isSystem = false,
    organizationId,
}: MenuVisibilityEditorProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [hasChanges, setHasChanges] = useState(false);

    // Fetch menu visibility configuration
    const {
        data: menuConfig,
        isLoading,
        error,
        refetch,
    } = trpc.roleMenuVisibility.list.useQuery(
        { roleId, organizationId },
        { enabled: !!roleId }
    );

    // Update mutation
    const updateMutation = trpc.roleMenuVisibility.update.useMutation({
        onSuccess: () => {
            toast.success('Menu visibility saved successfully');
            setHasChanges(false);
            refetch();
        },
        onError: (err: { message?: string }) => {
            toast.error(err.message || 'Failed to save menu visibility');
        },
    });

    // Build tree structure from config
    const menuTree = useMemo(() => {
        if (!menuConfig) return [];
        return buildMenuTree(menuConfig);
    }, [menuConfig]);

    // Get initial checked IDs (menus that are visible)
    const initialCheckedIds = useMemo(() => {
        if (!menuConfig) return [];
        return menuConfig
            .filter((m: MenuConfigItem) => m.effectiveVisible)
            .map((m: MenuConfigItem) => m.menuId);
    }, [menuConfig]);

    // Tree selection state
    const {
        checkedIds,
        handleToggle,
        handleSelectAll,
        handleDeselectAll,
        getNodeState,
        reset,
        getCheckedIds,
    } = useMenuTreeSelection(menuTree, initialCheckedIds);

    // Reset when initial data changes
    useEffect(() => {
        reset(initialCheckedIds);
        setHasChanges(false);
    }, [initialCheckedIds, reset]);

    // Track changes
    const handleToggleWithTracking = useCallback((nodeId: string) => {
        handleToggle(nodeId);
        setHasChanges(true);
    }, [handleToggle]);

    const handleSelectAllWithTracking = useCallback(() => {
        handleSelectAll();
        setHasChanges(true);
    }, [handleSelectAll]);

    const handleDeselectAllWithTracking = useCallback(() => {
        handleDeselectAll();
        setHasChanges(true);
    }, [handleDeselectAll]);

    // Save handler
    const handleSave = useCallback(() => {
        const visibleMenuIds = getCheckedIds();
        updateMutation.mutate({
            roleId,
            organizationId: organizationId ?? null,
            visibleMenuIds,
        });
    }, [roleId, organizationId, getCheckedIds, updateMutation]);

    // Reset handler
    const handleReset = useCallback(() => {
        reset(initialCheckedIds);
        setHasChanges(false);
    }, [reset, initialCheckedIds]);

    // Expand/collapse handlers (will be connected to MenuTree)
    const [treeKey, setTreeKey] = useState(0);
    const handleExpandAll = useCallback(() => {
        // Force re-render with all expanded
        setTreeKey(prev => prev + 1);
    }, []);
    const handleCollapseAll = useCallback(() => {
        setTreeKey(prev => prev + 1);
    }, []);

    if (isLoading) {
        return (
            <Card>
                <CardContent className="py-12">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Loading menu configuration...</span>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card>
                <CardContent className="py-8">
                    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
                        <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                        <p className="text-sm text-destructive">
                            Failed to load menu configuration: {error.message}
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Menu Visibility</CardTitle>
                <CardDescription>
                    Configure which menus are visible to users with this role.
                    {organizationId === null && (
                        <span className="block mt-1 text-amber-600">
                            You are editing global defaults. These apply to all tenants unless overridden.
                        </span>
                    )}
                </CardDescription>
            </CardHeader>

            <CardContent>
                {isSystem && (
                    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 p-4 flex items-start gap-3">
                        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                            This is a system role. Menu visibility cannot be modified.
                        </p>
                    </div>
                )}

                <MenuToolbar
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    onExpandAll={handleExpandAll}
                    onCollapseAll={handleCollapseAll}
                    onSelectAll={handleSelectAllWithTracking}
                    onDeselectAll={handleDeselectAllWithTracking}
                    disabled={isSystem}
                />

                <div className="border rounded-lg max-h-[500px] overflow-y-auto">
                    <MenuTree
                        key={treeKey}
                        menuTree={menuTree}
                        checkedIds={checkedIds}
                        searchTerm={searchTerm}
                        getNodeState={getNodeState}
                        onToggleCheck={isSystem ? () => {} : handleToggleWithTracking}
                    />
                </div>

                {menuTree.length === 0 && !isLoading && (
                    <div className="text-center py-8 text-muted-foreground">
                        No menus found. Menus will appear here once they are created.
                    </div>
                )}
            </CardContent>

            <CardFooter className="flex justify-between border-t pt-4">
                <Button
                    variant="outline"
                    onClick={handleReset}
                    disabled={!hasChanges || isSystem || updateMutation.isPending}
                >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                </Button>

                <Button
                    onClick={handleSave}
                    disabled={!hasChanges || isSystem || updateMutation.isPending}
                >
                    {updateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Changes
                </Button>
            </CardFooter>
        </Card>
    );
}
