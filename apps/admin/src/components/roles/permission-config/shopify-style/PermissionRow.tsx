import { memo } from 'react';
import { Settings2 } from 'lucide-react';
import { Checkbox, Button, cn, Tooltip, TooltipContent, TooltipTrigger } from '@wordrhyme/ui';

interface PermissionRowProps {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Whether this item is checked */
  checked: boolean;
  /** Whether this item is in indeterminate state */
  indeterminate?: boolean;
  /** Number of selected permissions */
  selectedCount?: number;
  /** Total number of permissions */
  totalCount?: number;
  /** Whether the checkbox is disabled */
  disabled?: boolean;
  /** Indentation level (0 for top-level) */
  level?: number;
  /** Whether this is a group header */
  isGroupHeader?: boolean;
  /** Whether this resource has advanced configuration (CASL/Fields) */
  hasAdvancedConfig?: boolean;
  /** Label for the advanced configuration (e.g. preset name) */
  advancedLabel?: string | null;
  /** Callback when checkbox state changes */
  onCheckedChange: (checked: boolean) => void;
  /** Callback to open advanced configuration */
  onOpenAdvanced?: () => void;
  /** Whether to show the expand/collapse icon (for nested resources) */
  isExpandable?: boolean;
  /** Whether it is expanded */
  isExpanded?: boolean;
  /** Toggle expand/collapse */
  onToggleExpand?: () => void;
}

export const PermissionRow = memo(function PermissionRow({
  id,
  label,
  checked,
  indeterminate = false,
  selectedCount,
  totalCount,
  disabled = false,
  level = 0,
  isGroupHeader = false,
  hasAdvancedConfig = false,
  advancedLabel,
  onCheckedChange,
  onOpenAdvanced,
  isExpandable,
  isExpanded,
  onToggleExpand,
  isOnlySettings = false,
}: PermissionRowProps & { isOnlySettings?: boolean }) {
  const showCount = totalCount !== undefined && totalCount > 0;
  const hasSelections = selectedCount !== undefined && selectedCount > 0;

  if (isOnlySettings) {
    return (
      <div className="flex items-center">
        {!disabled && onOpenAdvanced && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-8 w-8 transition-opacity',
                  hasAdvancedConfig ? 'text-primary opacity-100' : 'text-muted-foreground opacity-0 group-hover/header:opacity-100'
                )}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenAdvanced();
                }}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Advanced Configuration</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group flex items-center justify-between py-2 px-4',
        'border-b border-border/50 last:border-b-0',
        'hover:bg-muted/20 transition-colors',
        isGroupHeader && 'bg-muted/5'
      )}
      style={{ paddingLeft: `${level * 24 + 16}px` }}
    >
      <div className="flex items-center gap-3 flex-1">
        <Checkbox
          id={id}
          checked={indeterminate ? 'indeterminate' : checked}
          disabled={disabled}
          onCheckedChange={(value) => {
            if (value !== 'indeterminate') {
              onCheckedChange(value);
            }
          }}
          className={cn(
            'h-3.5 w-3.5',
            isGroupHeader && 'h-4 w-4'
          )}
        />
        <label
          htmlFor={id}
          className={cn(
            'flex items-center gap-2 flex-1 cursor-pointer select-none',
            disabled && 'cursor-not-allowed opacity-60'
          )}
        >
          <span
            className={cn(
              'text-[13px] transition-colors',
              isGroupHeader ? 'font-medium' : 'font-normal',
              (checked || indeterminate) ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {label}
          </span>
        </label>
      </div>

      <div className="flex items-center gap-1.5">
        {!isGroupHeader && !disabled && onOpenAdvanced && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-8 w-8 transition-opacity',
                  hasAdvancedConfig ? 'text-primary opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-100'
                )}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenAdvanced();
                }}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Advanced Configuration</TooltipContent>
          </Tooltip>
        )}

        {showCount && (
          <span
            className={cn(
              'text-[11px] font-medium tabular-nums px-2',
              hasSelections
                ? 'text-primary'
                : 'text-muted-foreground'
            )}
          >
            {selectedCount}/{totalCount}
          </span>
        )}
      </div>
    </div>
  );
});
