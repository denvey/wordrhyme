/**
 * MenuNode Component
 *
 * Renders a single menu item in the visibility tree.
 * Supports checkbox with indeterminate state, expand/collapse, and icons.
 */
import { memo } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Checkbox, cn } from '@wordrhyme/ui';
import type { CheckedState, MenuTreeNode } from './useMenuTreeSelection';

interface MenuNodeProps {
    node: MenuTreeNode;
    level: number;
    checkedState: CheckedState;
    isExpanded: boolean;
    isVisible: boolean;
    hasChildren: boolean;
    onToggleCheck: () => void;
    onToggleExpand: () => void;
}

/**
 * Resolve a Lucide icon name to its component
 */
function resolveIcon(iconName: string | null): LucideIcon | null {
    if (!iconName) return null;

    const icons = LucideIcons as unknown as Record<string, LucideIcon | undefined>;

    // Try direct lookup first (if already PascalCase)
    let icon = icons[iconName];
    if (icon) return icon;

    // Convert kebab-case to PascalCase
    const pascalCase = iconName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');

    icon = icons[pascalCase];
    return icon ?? null;
}

export const MenuNode = memo(function MenuNode({
    node,
    level,
    checkedState,
    isExpanded,
    isVisible,
    hasChildren,
    onToggleCheck,
    onToggleExpand,
}: MenuNodeProps) {
    if (!isVisible) return null;

    const IconComponent = resolveIcon(node.icon);
    const indentPx = level * 24;

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'Enter':
            case ' ':
                e.preventDefault();
                onToggleCheck();
                break;
            case 'ArrowRight':
                if (hasChildren && !isExpanded) {
                    e.preventDefault();
                    onToggleExpand();
                }
                break;
            case 'ArrowLeft':
                if (hasChildren && isExpanded) {
                    e.preventDefault();
                    onToggleExpand();
                }
                break;
        }
    };

    return (
        <div
            role="treeitem"
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-selected={checkedState === 'checked'}
            aria-checked={
                checkedState === 'indeterminate'
                    ? 'mixed'
                    : checkedState === 'checked'
            }
            aria-level={level + 1}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className={cn(
                'flex items-center gap-2 py-2 px-3 rounded-md',
                'hover:bg-muted/50 cursor-pointer',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                'transition-colors'
            )}
            style={{ paddingLeft: `${indentPx + 12}px` }}
        >
            {/* Expand/Collapse Toggle */}
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    if (hasChildren) onToggleExpand();
                }}
                className={cn(
                    'w-5 h-5 flex items-center justify-center rounded',
                    'hover:bg-muted',
                    !hasChildren && 'invisible'
                )}
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
                {hasChildren && (
                    isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )
                )}
            </button>

            {/* Checkbox */}
            <Checkbox
                checked={checkedState === 'checked'}
                // @ts-ignore - indeterminate is valid but not in types
                indeterminate={checkedState === 'indeterminate'}
                onCheckedChange={() => onToggleCheck()}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Toggle visibility for ${node.label}`}
            />

            {/* Icon */}
            {IconComponent && (
                <IconComponent className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}

            {/* Label */}
            <span className="text-sm font-medium truncate">{node.label}</span>

            {/* Path (subtle) */}
            <span className="text-xs text-muted-foreground ml-auto truncate max-w-[200px]">
                {node.path}
            </span>
        </div>
    );
});
