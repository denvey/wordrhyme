/**
 * Menus Page (Updated for Plan D API)
 *
 * Menu management for the current organization.
 * Uses code-based references instead of UUIDs.
 * Supports Copy-on-Write for system menu customization.
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
    EyeOff,
    Globe,
    Copy,
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

/**
 * Menu data from new API (code-based)
 */
interface MenuData {
    id: string;
    code: string;
    type: 'system' | 'custom';
    source: string;
    tenantId: string | null;
    label: string;
    icon: string | null;
    path: string | null; // NULL for directory menus
    openMode: 'route' | 'external';
    parentCode: string | null;
    order: number;
    visible: boolean;
    target: 'admin' | 'web';
    requiredPermission: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
    isOverride: boolean;
    originalTenantId: string | null;
}

interface MenuTreeNode extends MenuData {
    children: MenuTreeNode[];
    level: number;
}

/**
 * Build tree structure from flat menu list using parentCode
 */
function buildMenuTree(menus: MenuData[]): MenuTreeNode[] {
    const menuMap = new Map<string, MenuTreeNode>();
    const rootNodes: MenuTreeNode[] = [];

    // First pass: create all nodes (keyed by code)
    for (const menu of menus) {
        menuMap.set(menu.code, {
            ...menu,
            children: [],
            level: 0,
        });
    }

    // Second pass: build hierarchy using parentCode
    for (const menu of menus) {
        const node = menuMap.get(menu.code)!;
        if (menu.parentCode && menuMap.has(menu.parentCode)) {
            const parent = menuMap.get(menu.parentCode)!;
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
function getSourceInfo(source: string, isOverride: boolean): { color: 'default' | 'secondary' | 'outline'; label: string; icon: React.ReactNode } {
    if (isOverride) {
        return { color: 'default', label: 'Override', icon: <Copy className="h-3 w-3" /> };
    }
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
    const [collapsedCodes, setCollapsedCodes] = useState<Set<string>>(new Set());

    // Form state
    const [formData, setFormData] = useState({
        code: '',
        label: '',
        path: '',
        openMode: 'route' as 'route' | 'external',
        icon: '',
        parentCode: '',
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
        { code: selectedMenu?.code ?? '' },
        { enabled: !!selectedMenu?.code && rolesDialogOpen }
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

    // Toggle visibility mutation
    const toggleVisibilityMutation = trpc.menu.toggleVisibility.useMutation({
        onSuccess: () => {
            toast.success('Visibility updated');
            refetch();
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to update visibility');
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
            if (!menu.parentCode) return true;
            // Check if any ancestor is collapsed
            let currentCode: string | null = menu.parentCode;
            while (currentCode) {
                if (collapsedCodes.has(currentCode)) return false;
                const parent = menus?.find(m => m.code === currentCode);
                currentCode = parent?.parentCode ?? null;
            }
            return true;
        });
    }, [menuTree, collapsedCodes, menus]);

    // Get parent menu options for select (only root menus)
    const parentOptions = useMemo(() => {
        if (!menus) return [];
        return menus.filter(m => !m.parentCode);
    }, [menus]);

    const resetForm = () => {
        setFormData({
            code: '',
            label: '',
            path: '',
            openMode: 'route',
            icon: '',
            parentCode: '',
            order: 0,
            target: 'admin',
        });
    };

    const handleCreate = () => {
        if (!formData.code.trim() || !formData.label.trim()) {
            toast.error('Code and label are required');
            return;
        }
        createMutation.mutate({
            code: formData.code.trim(),
            label: formData.label.trim(),
            path: formData.path.trim() || null, // NULL for directory menus
            openMode: formData.openMode,
            icon: formData.icon.trim() || null,
            parentCode: formData.parentCode || null,
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

        const isSystem = selectedMenu.type === 'system';

        updateMutation.mutate({
            code: selectedMenu.code,
            label: formData.label.trim(),
            icon: formData.icon.trim() || null,
            order: formData.order,
            openMode: formData.openMode,
            // System menus: path and parentCode are locked
            ...(!isSystem && {
                path: formData.path.trim() || null, // NULL for directory menus
                parentCode: formData.parentCode || null,
            }),
        });
    };

    const handleDelete = () => {
        if (!selectedMenu) return;
        deleteMutation.mutate({ code: selectedMenu.code });
    };

    const handleToggleVisibility = (menu: MenuData) => {
        toggleVisibilityMutation.mutate({
            code: menu.code,
            visible: !menu.visible,
        });
    };

    const openEditDialog = (menu: MenuData) => {
        setSelectedMenu(menu);
        setFormData({
            code: menu.code,
            label: menu.label,
            path: menu.path ?? '', // Convert null to empty string for form
            openMode: menu.openMode || 'route',
            icon: menu.icon || '',
            parentCode: menu.parentCode || '',
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

    const toggleCollapse = (menuCode: string) => {
        setCollapsedCodes(prev => {
            const next = new Set(prev);
            if (next.has(menuCode)) {
                next.delete(menuCode);
            } else {
                next.add(menuCode);
            }
            return next;
        });
    };

    const hasChildren = (menuCode: string) => {
        return menus?.some(m => m.parentCode === menuCode) ?? false;
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
                        Manage navigation menus. System menus can have label, icon, order, and visibility modified. Path and hierarchy are locked.
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
                            const sourceInfo = getSourceInfo(menu.source, menu.isOverride);
                            const IconComponent = getIconComponent(menu.icon);
                            const isCollapsed = collapsedCodes.has(menu.code);
                            const menuHasChildren = hasChildren(menu.code);
                            const isCustom = menu.type === 'custom';
                            const isSystem = menu.type === 'system';

                            return (
                                <div
                                    key={menu.code}
                                    className={`p-4 flex items-center justify-between hover:bg-muted/50 ${!menu.visible ? 'opacity-50' : ''}`}
                                >
                                    <div className="flex items-center gap-3" style={{ paddingLeft: `${menu.level * 24}px` }}>
                                        {/* Expand/Collapse button */}
                                        <button
                                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted"
                                            onClick={() => menuHasChildren && toggleCollapse(menu.code)}
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
                                                {!menu.visible && (
                                                    <Badge variant="outline" className="gap-1">
                                                        <EyeOff className="h-3 w-3" />
                                                        Hidden
                                                    </Badge>
                                                )}
                                                {menu.target === 'web' && (
                                                    <Badge variant="outline">
                                                        <ExternalLink className="h-3 w-3 mr-1" />
                                                        Web
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                                                <code className="text-xs bg-muted px-1 rounded">{menu.code}</code>
                                                <span className="truncate max-w-[200px]">{menu.path}</span>
                                                {menu.openMode === 'external' && (
                                                    <Badge variant="outline" className="text-xs gap-1">
                                                        <Globe className="h-3 w-3" />
                                                        External
                                                    </Badge>
                                                )}
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
                                                <DropdownMenuItem onClick={() => handleToggleVisibility(menu)}>
                                                    {menu.visible ? (
                                                        <>
                                                            <EyeOff className="h-4 w-4 mr-2" />
                                                            Hide Menu
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Eye className="h-4 w-4 mr-2" />
                                                            Show Menu
                                                        </>
                                                    )}
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
                            <Label htmlFor="create-code">Code *</Label>
                            <Input
                                id="create-code"
                                value={formData.code}
                                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                                placeholder="e.g., my-reports"
                            />
                            <p className="text-xs text-muted-foreground">
                                Unique identifier. Will be prefixed with "custom:" automatically.
                            </p>
                        </div>
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
                            <Label htmlFor="create-path">Path / URL (optional for directory menus)</Label>
                            <Input
                                id="create-path"
                                value={formData.path}
                                onChange={(e) => setFormData(prev => ({ ...prev, path: e.target.value }))}
                                placeholder={formData.openMode === 'route' ? 'e.g., /reports (leave empty for directory)' : 'e.g., https://example.com'}
                            />
                            <p className="text-xs text-muted-foreground">
                                {formData.openMode === 'route' && 'Internal route path (external URLs open in iframe). Leave empty to create a directory menu.'}
                                {formData.openMode === 'external' && 'Opens in new tab. Leave empty to create a directory menu.'}
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
                                    onChange={(e) => setFormData(prev => ({ ...prev, order: Number.parseInt(e.target.value) || 0 }))}
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
                                value={formData.parentCode}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, parentCode: value === 'none' ? '' : value }))}
                            >
                                <SelectTrigger id="create-parent">
                                    <SelectValue placeholder="No parent (root level)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No parent (root level)</SelectItem>
                                    {parentOptions.map(opt => (
                                        <SelectItem key={opt.code} value={opt.code}>
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
                            {selectedMenu?.type === 'custom'
                                ? 'Modify this custom menu.'
                                : 'System menus: path and hierarchy are locked. You can modify label, icon, order, and open mode.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Code</Label>
                            <Input value={formData.code} disabled className="bg-muted" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-label">Label *</Label>
                            <Input
                                id="edit-label"
                                value={formData.label}
                                onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-path">Path / URL {selectedMenu?.type === 'system' && '(Locked)'}</Label>
                            <Input
                                id="edit-path"
                                value={formData.path}
                                onChange={(e) => setFormData(prev => ({ ...prev, path: e.target.value }))}
                                disabled={selectedMenu?.type === 'system'}
                                className={selectedMenu?.type === 'system' ? 'bg-muted' : ''}
                            />
                        </div>
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
                                    onChange={(e) => setFormData(prev => ({ ...prev, order: Number.parseInt(e.target.value) || 0 }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Target (Locked)</Label>
                                <Input value={formData.target} disabled className="bg-muted" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-parent">Parent Menu {selectedMenu?.type === 'system' && '(Locked)'}</Label>
                            <Select
                                value={formData.parentCode}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, parentCode: value === 'none' ? '' : value }))}
                                disabled={selectedMenu?.type === 'system'}
                            >
                                <SelectTrigger id="edit-parent" className={selectedMenu?.type === 'system' ? 'bg-muted' : ''}>
                                    <SelectValue placeholder="No parent (root level)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No parent (root level)</SelectItem>
                                    {parentOptions
                                        .filter(opt => opt.code !== selectedMenu?.code)
                                        .map(opt => (
                                            <SelectItem key={opt.code} value={opt.code}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>
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
