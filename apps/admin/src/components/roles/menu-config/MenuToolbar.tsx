/**
 * MenuToolbar Component
 *
 * Provides search input and bulk actions for the menu visibility editor.
 */
import { Search, ChevronsUpDown, CheckSquare, Square } from 'lucide-react';
import { Input, Button } from '@wordrhyme/ui';

interface MenuToolbarProps {
    searchTerm: string;
    onSearchChange: (term: string) => void;
    onExpandAll: () => void;
    onCollapseAll: () => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    disabled?: boolean;
}

export function MenuToolbar({
    searchTerm,
    onSearchChange,
    onExpandAll,
    onCollapseAll,
    onSelectAll,
    onDeselectAll,
    disabled = false,
}: MenuToolbarProps) {
    return (
        <div className="flex items-center gap-2 mb-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="text"
                    placeholder="Search menus..."
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-9"
                    disabled={disabled}
                />
            </div>

            {/* Expand/Collapse Buttons */}
            <div className="flex items-center gap-1">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onExpandAll}
                    disabled={disabled}
                    title="Expand All"
                >
                    <ChevronsUpDown className="h-4 w-4 mr-1" />
                    Expand
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onCollapseAll}
                    disabled={disabled}
                    title="Collapse All"
                >
                    Collapse
                </Button>
            </div>

            {/* Select/Deselect Buttons */}
            <div className="flex items-center gap-1 ml-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onSelectAll}
                    disabled={disabled}
                    title="Select All"
                >
                    <CheckSquare className="h-4 w-4 mr-1" />
                    All
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onDeselectAll}
                    disabled={disabled}
                    title="Deselect All"
                >
                    <Square className="h-4 w-4 mr-1" />
                    None
                </Button>
            </div>
        </div>
    );
}
