/**
 * JSON Diff Viewer
 *
 * Renders a side-by-side comparison of old and new JSON values
 * with syntax highlighting for changes.
 */
import { useMemo } from 'react';
import { cn } from '@wordrhyme/ui';

interface JsonDiffViewerProps {
    oldValue?: unknown;
    newValue?: unknown;
    className?: string;
}

interface DiffLine {
    type: 'add' | 'remove' | 'unchanged';
    content: string;
    lineNumber: number;
}

/**
 * Simple JSON diff algorithm
 */
function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
    const result: DiffLine[] = [];
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);

    let lineNum = 1;

    // Find removed lines (in old but not in new)
    for (const line of oldLines) {
        if (!newSet.has(line)) {
            result.push({ type: 'remove', content: line, lineNumber: lineNum++ });
        }
    }

    // Process new lines
    for (const line of newLines) {
        if (!oldSet.has(line)) {
            result.push({ type: 'add', content: line, lineNumber: lineNum++ });
        } else {
            result.push({ type: 'unchanged', content: line, lineNumber: lineNum++ });
        }
    }

    return result;
}

export function JsonDiffViewer({ oldValue, newValue, className }: JsonDiffViewerProps) {
    const diff = useMemo(() => {
        const oldJson = oldValue ? JSON.stringify(oldValue, null, 2) : '';
        const newJson = newValue ? JSON.stringify(newValue, null, 2) : '';

        const oldLines = oldJson ? oldJson.split('\n') : [];
        const newLines = newJson ? newJson.split('\n') : [];

        return computeDiff(oldLines, newLines);
    }, [oldValue, newValue]);

    if (!oldValue && !newValue) {
        return (
            <div className={cn('text-muted-foreground text-sm italic', className)}>
                No changes recorded
            </div>
        );
    }

    // If only new value (creation)
    if (!oldValue && newValue) {
        return (
            <div className={cn('font-mono text-sm', className)}>
                <div className="mb-2 text-xs font-medium text-muted-foreground">Created:</div>
                <pre className="p-3 rounded-md bg-green-500/10 border border-green-500/20 overflow-auto max-h-96">
                    <code className="text-green-600 dark:text-green-400">
                        {JSON.stringify(newValue, null, 2)}
                    </code>
                </pre>
            </div>
        );
    }

    // If only old value (deletion)
    if (oldValue && !newValue) {
        return (
            <div className={cn('font-mono text-sm', className)}>
                <div className="mb-2 text-xs font-medium text-muted-foreground">Deleted:</div>
                <pre className="p-3 rounded-md bg-red-500/10 border border-red-500/20 overflow-auto max-h-96">
                    <code className="text-red-600 dark:text-red-400">
                        {JSON.stringify(oldValue, null, 2)}
                    </code>
                </pre>
            </div>
        );
    }

    // Side-by-side diff
    return (
        <div className={cn('grid grid-cols-2 gap-4 font-mono text-sm', className)}>
            {/* Old Value */}
            <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">Before:</div>
                <pre className="p-3 rounded-md bg-muted/50 border overflow-auto max-h-96">
                    {diff
                        .filter((line) => line.type !== 'add')
                        .map((line, idx) => (
                            <div
                                key={idx}
                                className={cn(
                                    'px-1 -mx-1',
                                    line.type === 'remove' && 'bg-red-500/20 text-red-600 dark:text-red-400'
                                )}
                            >
                                {line.type === 'remove' && <span className="mr-2 text-red-500">-</span>}
                                {line.content}
                            </div>
                        ))}
                </pre>
            </div>

            {/* New Value */}
            <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">After:</div>
                <pre className="p-3 rounded-md bg-muted/50 border overflow-auto max-h-96">
                    {diff
                        .filter((line) => line.type !== 'remove')
                        .map((line, idx) => (
                            <div
                                key={idx}
                                className={cn(
                                    'px-1 -mx-1',
                                    line.type === 'add' && 'bg-green-500/20 text-green-600 dark:text-green-400'
                                )}
                            >
                                {line.type === 'add' && <span className="mr-2 text-green-500">+</span>}
                                {line.content}
                            </div>
                        ))}
                </pre>
            </div>
        </div>
    );
}
