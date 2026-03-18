import React, { useMemo } from 'react';
import type { Category } from '../hooks/useCategories';

interface CategoryTreeViewProps {
    categories: Category[];
    onEdit?: (category: Category) => void;
    onDelete?: (category: Category) => void;
    onMove?: (category: Category, direction: 'up' | 'down') => void;
}

interface FlatNode {
    category: Category;
    depth: number;
}

function flattenTree(categories: Category[], parentId: string | null = null, depth = 0): FlatNode[] {
    const nodes: FlatNode[] = [];
    const children = categories
        .filter(c => (c.parent_id ?? null) === parentId)
        .sort((a, b) => a.sort_order - b.sort_order);

    for (const child of children) {
        nodes.push({ category: child, depth });
        nodes.push(...flattenTree(categories, child.id, depth + 1));
    }
    return nodes;
}

export function CategoryTreeView({ categories, onEdit, onDelete, onMove }: CategoryTreeViewProps) {
    const flatNodes = useMemo(() => flattenTree(categories), [categories]);

    if (flatNodes.length === 0) {
        return (
            <div className="p-8 text-center text-muted-foreground text-sm">
                No categories found. Create your first category.
            </div>
        );
    }

    return (
        <div className="rounded-lg border divide-y">
            {flatNodes.map(({ category, depth }) => (
                <div
                    key={category.id}
                    className="flex items-center justify-between p-3 hover:bg-muted/30"
                    style={{ paddingLeft: `${depth * 24 + 12}px` }}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        {depth > 0 && (
                            <span className="text-muted-foreground text-xs">{'└'}</span>
                        )}
                        <span className="text-sm font-medium truncate">{category.name}</span>
                        <span className="text-xs text-muted-foreground">{category.slug}</span>
                        {!category.is_active && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                Inactive
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {onMove && (
                            <>
                                <button
                                    className="text-xs px-1.5 py-1 rounded hover:bg-muted text-muted-foreground"
                                    onClick={() => onMove(category, 'up')}
                                    title="Move up"
                                >
                                    ↑
                                </button>
                                <button
                                    className="text-xs px-1.5 py-1 rounded hover:bg-muted text-muted-foreground"
                                    onClick={() => onMove(category, 'down')}
                                    title="Move down"
                                >
                                    ↓
                                </button>
                            </>
                        )}
                        {onEdit && (
                            <button
                                className="text-xs px-2 py-1 rounded hover:bg-muted text-muted-foreground"
                                onClick={() => onEdit(category)}
                            >
                                Edit
                            </button>
                        )}
                        {onDelete && (
                            <button
                                className="text-xs px-2 py-1 rounded hover:bg-destructive/10 text-destructive"
                                onClick={() => onDelete(category)}
                            >
                                Delete
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

export default CategoryTreeView;
