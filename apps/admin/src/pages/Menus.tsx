/**
 * Menus Page
 *
 * Menu management for the current organization.
 * Allows viewing, creating, editing, and deleting custom menus.
 * Core and plugin menus can only have limited properties modified.
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Menu as MenuIcon,
    Plus,
    MoreHorizontal,
    Pencil,
    Trash2,
    ChevronRight,
    ChevronDown,
    Puzzle,
    Box,
    ExternalLink,
    Eye,
    Globe,
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useActiveOrganization } from '../lib/auth-client';
import { trpc } from '../lib/trpc';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Label,
    Input,
    Badge,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@wordrhyme/ui';
import { toast } from 'sonner';

interface MenuData {
    id: string;
    source: string;
    organizationId: string;
    label: string;
    icon: string | null;
    path: string;
    openMode: 'route' | 'external';
    parentId: string | null;
    order: number;
    target: 'admin' | 'web';
    requiredPermission: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
}

interface MenuTreeNode extends MenuData {
    children: MenuTreeNode[];
    level: number;
}

/**
 * Build tree structure from flat menu list
 */
function buildMenuTree(menus: MenuData[]): MenuTreeNode[] {
    const menuMap = new Map<string, MenuTreeNode>();
    const rootNodes: MenuTreeNode[] = [];

    // First pass: create all nodes
    for (const menu of menus) {
        menuMap.set(menu.id, {
            ...menu,
            children: [],
            level: 0,
        });
    }

    // Second pass: build hierarchy
    for (const menu of menus) {
        const node = menuMap.get(menu.id)!;
        if (menu.parentId && menuMap.has(menu.parentId)) {
            const parent = menuMap.get(menu.parentId)!;
            node.level = parent.level + 1;
            parent.children.push(node);
        } else {
            rootNodes.push(node);
        }
    }

    // Sort by order
    const sortNodes = (nodes: MenuTreeNode[]) => {
        nodes.sort((a, b) => a.order - b.order);
        for (const node of nodes) {
            sortNodes(node.children);
        }
    };
    sortNodes(rootNodes);

    return rootNodes;
}

/**
 * Flatten tree for rendering with indentation
 */
function flattenTree(nodes: MenuTreeNode[], result: MenuTreeNode[] = []): MenuTreeNode[] {
    for (const node of nodes) {
        result.push(node);
        if (node.children.length > 0) {
            flattenTree(node.children, result);
        }
    }
    return result;
}

/**
 * Get icon component from lucide-react
 */
function getIconComponent(iconName: string | null): React.ComponentType<{ className?: string }> | null {
    if (!iconName) return null;
    const Icon = (LucideIcons as Record<string, React.ComponentType<{ className?: string }>>)[iconName];
    return Icon || null;
}

/**
 * Get source badge color and label
 */
function getSourceInfo(source: string): { color: 'default' | 'secondary' | 'outline'; label: string; icon: React.ReactNode } {
    switch (source) {
        case 'core':
            return { color: 'secondary', label: 'Core', icon: <Box className="h-3 w-3" /> };
        case 'custom':
            return { color: 'outline', label: 'Custom', icon: <Pencil className="h-3 w-3" /> };
        default:
            return { color: 'default', label: 'Plugin', icon: <Puzzle className="h-3 w-3" /> };
    }
}

export function MenusPage() {
    const { data: activeOrg } = useActiveOrganization();
    const navigate = useNavigate();

    // Dialog states
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [rolesDialogOpen, setRolesDialogOpen] = useState(false);
    const [selectedMenu, setSelectedMenu] = useState<MenuData | null>(null);

    // Collapsed state for tree nodes
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

    // Form state
    const [formData, setFormData] = useState({
        label: '',
        path: '',
        openMode: 'route' as 'route' | 'external',
        icon: '',
        parentId: '',
        order: 0,
        target: 'admin' as 'admin' | 'web',
    });

    // Fetch menus
    const { data: menus, isLoading, refetch } = trpc.menu.listAll.useQuery(
        { target: 'admin' },
        { enabled: !!activeOrg?.id }
    );

    // Fetch visible roles for selected menu
    const { data: visibleRoles } = trpc.menu.getVisibleRoles.useQuery(
        { menuId: selectedMenu?.id ?? '' },
        { enabled: !!selectedMenu?.id && rolesDialogOpen }
    );

    // Create mutation
    const createMutation = trpc.menu.create.useMutation({
        onSuccess: () => {
            toast.success('Menu created successfully');
            setCreateDialogOpen(false);
            resetForm();
            refetch();
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to create menu');
        },
    });

    // Update mutation
    const updateMutation = trpc.menu.update.useMutation({
        onSuccess: () => {
            toast.success('Menu updated successfully');
            setEditDialogOpen(false);
            setSelectedMenu(null);
            resetForm();
            refetch();
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update menu');
        },
    });

    // Delete mutation
    const deleteMutation = trpc.menu.delete.useMutation({
        onSuccess: () => {
            toast.success('Menu deleted successfully');
            setDeleteDialogOpen(false);
            setSelectedMenu(null);
            refetch();
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to delete menu');
        },
    });

    // Build tree from menus
    const menuTree = useMemo(() => {
        if (!menus) return [];
        return buildMenuTree(menus as MenuData[]);
    }, [menus]);

    // Get flat list for rendering
    const flatMenus = useMemo(() => {
        const flat = flattenTree(menuTree);
        // Filter out collapsed children
        return flat.filter(menu => {
            if (!menu.parentId) return true;
            // Check if any ancestor is collapsed
            let currentId: string | null = menu.parentId;
            while (currentId) {
                if (collapsedIds.has(currentId)) return false;
                const parent = menus?.find(m => m.id === currentId);
                currentId = parent?.parentId ?? null;
            }
            return true;
        });
    }, [menuTree, collapsedIds, menus]);

    // Get parent menu options for select
    const parentOptions = useMemo(() => {
        if (!menus) return [];
        // Only root menus and directories can be parents
        return menus.filter(m => !m.parentId);
    }, [menus]);

    const resetForm = () => {
        setFormData({
            label: '',
            path: '',
            openMode: 'route',
            icon: '',
            parentId: '',
            order: 0,
            target: 'admin',
        });
    };

    const handleCreate = () => {
        if (!formData.label.trim() || !formData.path.trim()) {
            toast.error('Label and path are required');
            return;
        }
        createMutation.mutate({
            label: formData.label.trim(),
            path: formData.path.trim(),
            openMode: formData.openMode,
            icon: formData.icon.trim() || null,
            parentId: formData.parentId || null,
            order: formData.order,
            target: formData.target,
        });
    };

    const handleUpdate = () => {
        if (!selectedMenu) return;
        if (!formData.label.trim()) {
            toast.error('Label is required');
            return;
        }

        const isCustom = selectedMenu.source === 'custom';

        updateMutation.mutate({
            id: selectedMenu.id,
            label: formData.label.trim(),
            icon: formData.icon.trim() || null,
            order: formData.order,
            ...(isCustom && {
                path: formData.path.trim(),
                openMode: formData.openMode,
                parentId: formData.parentId || null,
                target: formData.target,
            }),
        });
    };

    const handleDelete = () => {
        if (!selectedMenu) return;
        deleteMutation.mutate({ id: selectedMenu.id });
    };

    const openEditDialog = (menu: MenuData) => {
        setSelectedMenu(menu);
        setFormData({
            label: menu.label,
            path: menu.path,
            openMode: menu.openMode || 'route',
            icon: menu.icon || '',
            parentId: menu.parentId || '',
            order: menu.order,
            target: menu.target,
        });
        setEditDialogOpen(true);
    };

    const openDeleteDialog = (menu: MenuData) => {
        setSelectedMenu(menu);
        setDeleteDialogOpen(true);
    };

    const openRolesDialog = (menu: MenuData) => {
        setSelectedMenu(menu);
        setRolesDialogOpen(true);
    };

    const toggleCollapse = (menuId: string) => {
        setCollapsedIds(prev => {
            const next = new Set(prev);
            if (next.has(menuId)) {
                next.delete(menuId);
            } else {
                next.add(menuId);
            }
            return next;
        });
    };

    const hasChildren = (menuId: string) => {
        return menus?.some(m => m.parentId === menuId) ?? false;
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <MenuIcon className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold">Menus</h1>
                </div>
                <Button onClick={() => {
                    resetForm();
                    setCreateDialogOpen(true);
                }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Menu
                </Button>
            </div>

            <div className="rounded-xl border border-border bg-card">
                <div className="p-6 border-b border-border">
                    <h2 className="font-semibold">Menu Structure</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage navigation menus. Core and plugin menus can only have order, icon, and label modified.
                    </p>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    </div>
                ) : !menus || menus.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <MenuIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No menus found.</p>
                        <p className="text-sm mt-1">Create a custom menu to get started.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {flatMenus.map((menu) => {
                            const sourceInfo = getSourceInfo(menu.source);
                            const IconComponent = getIconComponent(menu.icon);
                            const isCollapsed = collapsedIds.has(menu.id);
                            const menuHasChildren = hasChildren(menu.id);
                            const isCustom = menu.source === 'custom';

                            return (
                                <div
                                    key={menu.id}
                                    className="p-4 flex items-center justify-between hover:bg-muted/50"
                                >
                                    <div className="flex items-center gap-3" style={{ paddingLeft: `${menu.level * 24}px` }}>
                                        {/* Expand/Collapse button */}
                                        <button
                                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted"
                                            onClick={() => menuHasChildren && toggleCollapse(menu.id)}
                                        >
                                            {menuHasChildren ? (
                                                isCollapsed ? (
                                                    <ChevronRight className="h-4 w-4" />
                                                ) : (
                                                    <ChevronDown className="h-4 w-4" />
                                                )
                                            ) : (
                                                <span className="w-4" />
                                            )}
                                        </button>

                                        {/* Icon */}
                                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                            {IconComponent ? (
                                                <IconComponent className="h-5 w-5 text-primary" />
                                            ) : (
                                                <MenuIcon className="h-5 w-5 text-primary" />
                                            )}
                                        </div>

                                        {/* Label and info */}
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-medium">{menu.label}</h3>
                                                <Badge variant={sourceInfo.color} className="gap-1">
                                                    {sourceInfo.icon}
                                                    {sourceInfo.label}
                                                </Badge>
                                                {menu.target === 'web' && (
                                                    <Badge variant="outline">
                                                        <ExternalLink className="h-3 w-3 mr-1" />
                                                        Web
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                                                <span className="truncate max-w-[300px]">{menu.path}</span>
                                                {menu.openMode === 'external' && (
                                                    <Badge variant="outline" className="text-xs gap-1">
                                                        <Globe className="h-3 w-3" />
                                                        External
                                                    </Badge>
                                                )}
                                                {menu.icon && <span className="text-xs opacity-60">({menu.icon})</span>}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span className="text-sm text-muted-foreground px-2 py-1 bg-muted rounded">
                                                        #{menu.order}
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent>Sort order</TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => openEditDialog(menu)}>
                                                    <Pencil className="h-4 w-4 mr-2" />
                                                    Edit Menu
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => openRolesDialog(menu)}>
                                                    <Eye className="h-4 w-4 mr-2" />
                                                    View Visibility
                                                </DropdownMenuItem>
                                                {isCustom && (
                                                    <>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            className="text-destructive"
                                                            onClick={() => openDeleteDialog(menu)}
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                            Delete Menu
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Create Dialog */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create New Menu</DialogTitle>
                        <DialogDescription>
                            Create a custom navigation menu item.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="create-label">Label *</Label>
                            <Input
                                id="create-label"
                                value={formData.label}
                                onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
                                placeholder="e.g., Reports"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="create-path">Path / URL *</Label>
                            <Input
                                id="create-path"
                                value={formData.path}
                                onChange={(e) => setFormData(prev => ({ ...prev, path: e.target.value }))}
                                placeholder={formData.openMode === 'route' ? 'e.g., /reports' : 'e.g., https://example.com'}
                            />
                            <p className="text-xs text-muted-foreground">
                                {formData.openMode === 'route' && 'Internal route path (external URLs open in iframe)'}
                                {formData.openMode === 'external' && 'Opens in new tab'}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="create-openMode">Open Mode</Label>
                            <Select
                                value={formData.openMode}
                                onValueChange={(value: 'route' | 'external') => setFormData(prev => ({ ...prev, openMode: value }))}
                            >
                                <SelectTrigger id="create-openMode">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="route">Route (Internal / iFrame)</SelectItem>
                                    <SelectItem value="external">External (New Tab)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="create-icon">Icon (Lucide icon name)</Label>
                            <Input
                                id="create-icon"
                                value={formData.icon}
                                onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value }))}
                                placeholder="e.g., BarChart3"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="create-order">Order</Label>
                                <Input
                                    id="create-order"
                                    type="number"
                                    value={formData.order}
                                    onChange={(e) => setFormData(prev => ({ ...prev, order: parseInt(e.target.value) || 0 }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="create-target">Target</Label>
                                <Select
                                    value={formData.target}
                                    onValueChange={(value: 'admin' | 'web') => setFormData(prev => ({ ...prev, target: value }))}
                                >
                                    <SelectTrigger id="create-target">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="admin">Admin</SelectItem>
                                        <SelectItem value="web">Web</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="create-parent">Parent Menu (optional)</Label>
                            <Select
                                value={formData.parentId}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, parentId: value === 'none' ? '' : value }))}
                            >
                                <SelectTrigger id="create-parent">
                                    <SelectValue placeholder="No parent (root level)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No parent (root level)</SelectItem>
                                    {parentOptions.map(opt => (
                                        <SelectItem key={opt.id} value={opt.id}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} disabled={createMutation.isPending}>
                            {createMutation.isPending ? 'Creating...' : 'Create Menu'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Menu</DialogTitle>
                        <DialogDescription>
                            {selectedMenu?.source === 'custom'
                                ? 'Modify this custom menu.'
                                : 'System menus can only have order, icon, and label modified.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-label">Label *</Label>
                            <Input
                                id="edit-label"
                                value={formData.label}
                                onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
                            />
                        </div>
                        {selectedMenu?.source === 'custom' && (
                            <div className="space-y-2">
                                <Label htmlFor="edit-path">Path / URL *</Label>
                                <Input
                                    id="edit-path"
                                    value={formData.path}
                                    onChange={(e) => setFormData(prev => ({ ...prev, path: e.target.value }))}
                                    placeholder={formData.openMode === 'route' ? 'e.g., /reports' : 'e.g., https://example.com'}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {formData.openMode === 'route' && 'Internal route path (external URLs open in iframe)'}
                                    {formData.openMode === 'external' && 'Opens in new tab'}
                                </p>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="edit-openMode">Open Mode</Label>
                            <Select
                                value={formData.openMode}
                                onValueChange={(value: 'route' | 'external') => setFormData(prev => ({ ...prev, openMode: value }))}
                            >
                                <SelectTrigger id="edit-openMode">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="route">Route (Internal / iFrame)</SelectItem>
                                    <SelectItem value="external">External (New Tab)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-icon">Icon (Lucide icon name)</Label>
                            <Input
                                id="edit-icon"
                                value={formData.icon}
                                onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value }))}
                                placeholder="e.g., BarChart3"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-order">Order</Label>
                                <Input
                                    id="edit-order"
                                    type="number"
                                    value={formData.order}
                                    onChange={(e) => setFormData(prev => ({ ...prev, order: parseInt(e.target.value) || 0 }))}
                                />
                            </div>
                            {selectedMenu?.source === 'custom' && (
                                <div className="space-y-2">
                                    <Label htmlFor="edit-target">Target</Label>
                                    <Select
                                        value={formData.target}
                                        onValueChange={(value: 'admin' | 'web') => setFormData(prev => ({ ...prev, target: value }))}
                                    >
                                        <SelectTrigger id="edit-target">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="admin">Admin</SelectItem>
                                            <SelectItem value="web">Web</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                        {selectedMenu?.source === 'custom' && (
                            <div className="space-y-2">
                                <Label htmlFor="edit-parent">Parent Menu (optional)</Label>
                                <Select
                                    value={formData.parentId}
                                    onValueChange={(value) => setFormData(prev => ({ ...prev, parentId: value === 'none' ? '' : value }))}
                                >
                                    <SelectTrigger id="edit-parent">
                                        <SelectValue placeholder="No parent (root level)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No parent (root level)</SelectItem>
                                        {parentOptions
                                            .filter(opt => opt.id !== selectedMenu?.id)
                                            .map(opt => (
                                                <SelectItem key={opt.id} value={opt.id}>
                                                    {opt.label}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Menu</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{selectedMenu?.label}"?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* View Visibility Dialog */}
            <Dialog open={rolesDialogOpen} onOpenChange={setRolesDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Menu Visibility</DialogTitle>
                        <DialogDescription>
                            Roles that can see "{selectedMenu?.label}"
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {!visibleRoles || visibleRoles.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>No roles have visibility configured.</p>
                                <p className="text-sm mt-1">Configure visibility in Role settings.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {visibleRoles.filter(r => r.visible).map(role => (
                                    <div
                                        key={role.id}
                                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                                    >
                                        <div>
                                            <p className="font-medium">{role.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {role.slug}
                                            </p>
                                        </div>
                                        <Badge variant={role.scope === 'global' ? 'secondary' : 'outline'}>
                                            {role.scope === 'global' ? 'Global' : 'Tenant'}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setRolesDialogOpen(false);
                                if (visibleRoles && visibleRoles.length > 0) {
                                    // Navigate to first visible role's detail page
                                    navigate(`/roles/${visibleRoles[0].id}`);
                                }
                            }}
                        >
                            Configure in Roles
                        </Button>
                        <Button onClick={() => setRolesDialogOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
