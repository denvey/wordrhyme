/**
 * GroupedCheckboxList Component
 *
 * A reusable component for displaying grouped checkboxes with:
 * - Collapsible groups via Accordion
 * - "Select All" checkbox per group
 * - Indeterminate state when partially selected
 * - Customizable grouping and rendering
 */
import * as React from 'react';
import { Minus } from 'lucide-react';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from './accordion';
import { Checkbox } from './checkbox';
import { cn } from '../../lib/utils';

/** Subgroup labels for display (scope-based) */
const defaultSubgroupLabels: Record<string, string> = {
    // Scope labels
    space: 'Space',
    org: 'Organization',
    own: 'Own',
    public: 'Public',
    project: 'Project',
    team: 'Team',
    // Action labels (fallback)
    create: 'Create',
    read: 'Read',
    update: 'Update',
    delete: 'Delete',
    publish: 'Publish',
    invite: 'Invite',
    remove: 'Remove',
    assign: 'Assign',
    manage: 'Manage',
};

/** Action order for sorting within subgroups (CRUD order) */
const actionOrder: Record<string, number> = {
    read: 1,
    create: 2,
    update: 3,
    delete: 4,
    publish: 5,
    invite: 6,
    remove: 7,
    assign: 8,
    manage: 9,
};

/** Extract action from capability (e.g., "content:create:space" -> "create") */
function getActionFromCapability(capability: string): string {
    const parts = capability.split(':');
    return parts[1] || '';
}

/** Sort items by action order (CRUD) */
function sortByActionOrder(items: GroupedCheckboxItem[]): GroupedCheckboxItem[] {
    return [...items].sort((a, b) => {
        const actionA = getActionFromCapability(a.id);
        const actionB = getActionFromCapability(b.id);
        const orderA = actionOrder[actionA] ?? 99;
        const orderB = actionOrder[actionB] ?? 99;
        return orderA - orderB;
    });
}

/** Custom render function type for individual items */
export type RenderItemFn = (
    item: GroupedCheckboxItem,
    checked: boolean,
    disabled: boolean,
    toggleItem: (itemId: string, checked: boolean) => void
) => React.ReactNode;

/** Render a single checkbox item */
function renderCheckboxItem(
    item: GroupedCheckboxItem,
    selectedIds: Set<string>,
    disabled: boolean,
    toggleItem: (itemId: string, checked: boolean) => void,
    customRenderItem?: RenderItemFn
) {
    const checked = selectedIds.has(item.id);

    if (customRenderItem) {
        return <React.Fragment key={item.id}>{customRenderItem(item, checked, disabled, toggleItem)}</React.Fragment>;
    }

    return (
        <label
            key={item.id}
            className={cn(
                'flex items-start gap-3 py-2 px-2 rounded-md cursor-pointer',
                'hover:bg-muted/50 transition-colors',
                disabled && 'cursor-not-allowed opacity-50'
            )}
        >
            <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={(c) => toggleItem(item.id, c === true)}
                className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
                <div className="font-mono text-sm">{item.label}</div>
                {item.description && (
                    <div className="text-muted-foreground text-xs mt-0.5">
                        {item.description}
                    </div>
                )}
            </div>
        </label>
    );
}

/** Map column count to Tailwind grid class (must use full class names for purge) */
const COLUMNS_CLASS: Record<number, string> = {
    1: 'space-y-1',
    2: 'grid grid-cols-2 gap-1',
    3: 'grid grid-cols-3 gap-1',
};

/** Render group items with optional subgroup visual separators */
function renderGroupItems(
    items: GroupedCheckboxItem[],
    selectedIds: Set<string>,
    disabled: boolean,
    toggleItem: (itemId: string, checked: boolean) => void,
    customRenderItem?: RenderItemFn,
    columns: number = 1,
    onSelectionChange?: (newIds: Set<string>) => void
) {
    // Check if any items have subgroups
    const hasSubgroups = items.some((item) => item.subgroup);

    if (!hasSubgroups) {
        // No subgroups, render flat list sorted by action order
        const sortedItems = sortByActionOrder(items);
        const gridClass = COLUMNS_CLASS[columns] || COLUMNS_CLASS[1]!;
        return (
            <div className={gridClass}>
                {sortedItems.map((item) =>
                    renderCheckboxItem(item, selectedIds, disabled, toggleItem, customRenderItem)
                )}
            </div>
        );
    }

    // Group items by subgroup
    const subgrouped = new Map<string, GroupedCheckboxItem[]>();
    for (const item of items) {
        const subgroupKey = item.subgroup || '_ungrouped';
        const existing = subgrouped.get(subgroupKey) || [];
        existing.push(item);
        subgrouped.set(subgroupKey, existing);
    }

    // Sort subgroups: prioritize common scopes, then alphabetically
    const scopeOrder: Record<string, number> = {
        space: 1,
        org: 2,
        own: 3,
        public: 4,
        project: 5,
        team: 6,
        _ungrouped: 99,
    };
    const sortedSubgroups = Array.from(subgrouped.keys()).sort((a, b) => {
        const orderA = scopeOrder[a] ?? 50;
        const orderB = scopeOrder[b] ?? 50;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
    });

    return (
        <div className="space-y-4">
            {sortedSubgroups.map((subgroupKey) => {
                const subgroupItems = subgrouped.get(subgroupKey) || [];
                // Sort items within subgroup by action order (read, create, update, delete)
                const sortedItems = sortByActionOrder(subgroupItems);
                const label =
                    subgroupKey === '_ungrouped'
                        ? 'Other'
                        : defaultSubgroupLabels[subgroupKey] ||
                        subgroupKey.charAt(0).toUpperCase() + subgroupKey.slice(1);

                const subgroupAllSelected = sortedItems.every((item) => selectedIds.has(item.id));
                const subgroupPartial = !subgroupAllSelected && sortedItems.some((item) => selectedIds.has(item.id));
                const subgroupSelectedCount = sortedItems.filter((item) => selectedIds.has(item.id)).length;

                const toggleSubgroup = (checked: boolean) => {
                    if (!onSelectionChange) return;
                    const newIds = new Set(selectedIds);
                    for (const item of sortedItems) {
                        if (checked) newIds.add(item.id);
                        else newIds.delete(item.id);
                    }
                    onSelectionChange(newIds);
                };

                return (
                    <div key={subgroupKey}>
                        <div className="flex items-center gap-2 px-2 pb-1 mb-1 border-b border-border/50">
                            <Checkbox
                                checked={subgroupAllSelected}
                                disabled={disabled}
                                onCheckedChange={(checked) => toggleSubgroup(checked === true)}
                                className={cn(
                                    'h-3.5 w-3.5',
                                    subgroupPartial && 'data-[state=unchecked]:bg-primary/20'
                                )}
                            />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                {label}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                ({subgroupSelectedCount}/{sortedItems.length})
                            </span>
                        </div>
                        <div className={COLUMNS_CLASS[columns] || COLUMNS_CLASS[1]!}>
                            {sortedItems.map((item) =>
                                renderCheckboxItem(item, selectedIds, disabled, toggleItem, customRenderItem)
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/** Individual item in the list */
export interface GroupedCheckboxItem {
    /** Unique identifier */
    id: string;
    /** Group key for categorization */
    group: string;
    /** Optional subgroup key for visual grouping within a group (no select-all) */
    subgroup?: string;
    /** Primary display text */
    label: string;
    /** Optional description */
    description?: string;
}

/** Group configuration */
export interface GroupConfig {
    /** Group key */
    key: string;
    /** Display label for the group */
    label: string;
    /** Optional description */
    description?: string;
}

export interface GroupedCheckboxListProps {
    /** All items to display */
    items: GroupedCheckboxItem[];
    /** Currently selected item IDs */
    selectedIds: Set<string>;
    /** Callback when selection changes */
    onSelectionChange: (selectedIds: Set<string>) => void;
    /** Optional group configurations (auto-generated from items if not provided) */
    groups?: GroupConfig[];
    /** Groups to expand by default (defaults to all) */
    defaultExpandedGroups?: string[];
    /** Custom class name for the container */
    className?: string;
    /** Whether the list is disabled */
    disabled?: boolean;
    /** Custom render function for individual items (overrides default checkbox + label) */
    renderItem?: RenderItemFn;
    /** Number of columns for grid layout (default: 1) */
    columns?: number;
}

/**
 * GroupedCheckboxList - Displays items in collapsible groups with select-all support
 */
export function GroupedCheckboxList({
    items,
    selectedIds,
    onSelectionChange,
    groups: customGroups,
    defaultExpandedGroups,
    className,
    disabled = false,
    renderItem: customRenderItem,
    columns = 1,
}: GroupedCheckboxListProps) {
    // Group items by their group key
    const groupedItems = React.useMemo(() => {
        const grouped = new Map<string, GroupedCheckboxItem[]>();
        for (const item of items) {
            const existing = grouped.get(item.group) || [];
            existing.push(item);
            grouped.set(item.group, existing);
        }
        return grouped;
    }, [items]);

    // Auto-generate group configs if not provided
    const groups = React.useMemo(() => {
        if (customGroups) return customGroups;
        return Array.from(groupedItems.keys()).map((key) => ({
            key,
            label: key.charAt(0).toUpperCase() + key.slice(1),
        }));
    }, [customGroups, groupedItems]);

    // Default to all groups expanded
    const expandedGroups = React.useMemo(() => {
        return defaultExpandedGroups || groups.map((g) => g.key);
    }, [defaultExpandedGroups, groups]);

    // Check if all items in a group are selected
    const isGroupAllSelected = (groupKey: string): boolean => {
        const groupItems = groupedItems.get(groupKey) || [];
        return groupItems.length > 0 && groupItems.every((item) => selectedIds.has(item.id));
    };

    // Check if some (but not all) items in a group are selected
    const isGroupPartiallySelected = (groupKey: string): boolean => {
        const groupItems = groupedItems.get(groupKey) || [];
        const selectedCount = groupItems.filter((item) => selectedIds.has(item.id)).length;
        return selectedCount > 0 && selectedCount < groupItems.length;
    };

    // Toggle all items in a group
    const toggleGroup = (groupKey: string, checked: boolean) => {
        const groupItems = groupedItems.get(groupKey) || [];
        const newSelected = new Set(selectedIds);

        for (const item of groupItems) {
            if (checked) {
                newSelected.add(item.id);
            } else {
                newSelected.delete(item.id);
            }
        }

        onSelectionChange(newSelected);
    };

    // Toggle a single item
    const toggleItem = (itemId: string, checked: boolean) => {
        const newSelected = new Set(selectedIds);
        if (checked) {
            newSelected.add(itemId);
        } else {
            newSelected.delete(itemId);
        }
        onSelectionChange(newSelected);
    };

    // Get count of selected items in a group
    const getGroupSelectionCount = (groupKey: string): number => {
        const groupItems = groupedItems.get(groupKey) || [];
        return groupItems.filter((item) => selectedIds.has(item.id)).length;
    };

    return (
        <Accordion
            type="multiple"
            defaultValue={expandedGroups}
            className={cn('w-full', className)}
        >
            {groups.map((group) => {
                const groupItems = groupedItems.get(group.key) || [];
                if (groupItems.length === 0) return null;

                const allSelected = isGroupAllSelected(group.key);
                const partiallySelected = isGroupPartiallySelected(group.key);
                const selectedCount = getGroupSelectionCount(group.key);

                return (
                    <AccordionItem key={group.key} value={group.key}>
                        <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center gap-3 flex-1">
                                <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center"
                                >
                                    <Checkbox
                                        checked={allSelected}
                                        disabled={disabled}
                                        onCheckedChange={(checked) =>
                                            toggleGroup(group.key, checked === true)
                                        }
                                        className={cn(
                                            partiallySelected && 'data-[state=unchecked]:bg-primary/20'
                                        )}
                                    />
                                    {partiallySelected && (
                                        <Minus className="absolute h-3 w-3 text-primary pointer-events-none" />
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{group.label}</span>
                                    <span className="text-muted-foreground text-xs">
                                        ({selectedCount}/{groupItems.length})
                                    </span>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent>
                            <div className="pl-7">
                                {renderGroupItems(groupItems, selectedIds, disabled, toggleItem, customRenderItem, columns, onSelectionChange)}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                );
            })}
        </Accordion>
    );
}

export default GroupedCheckboxList;
