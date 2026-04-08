import { Dialog, DialogContent } from '@wordrhyme/ui';
import type { PluginMediaInfo } from '@wordrhyme/plugin';
import { MediaBrowser } from './MediaBrowser';

export interface MediaPickerOptions {
    presentation?: 'dialog' | 'drawer'; // Where it should open
    mode?: 'single' | 'multi';
    onSelect: (media: PluginMediaInfo[]) => void;
}

export function MediaPickerDialog({
    open,
    onOpenChange,
    options,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    options: MediaPickerOptions | null;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* The standard w-full max-w-[1100px] size */}
            <DialogContent 
                className="max-w-[1100px] h-[85vh] flex p-0 overflow-hidden bg-background border-none rounded-lg [&>button]:hidden shadow-xl"
                onInteractOutside={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('[role="dialog"]')) e.preventDefault();
                }}
            >
                <div className="flex-1 min-w-0">
                    <MediaBrowser 
                        mode="picker" 
                        options={options || undefined} 
                        onClose={() => onOpenChange(false)} 
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}

