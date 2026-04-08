import { Sheet, SheetContent } from '@wordrhyme/ui';
import type { MediaPickerOptions } from './MediaPickerDialog';
import { MediaBrowser } from './MediaBrowser';

export function MediaPickerDrawer({
    open,
    onOpenChange,
    options,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    options: MediaPickerOptions | null;
}) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            {/* 800px width for a comfortable right-side media browser */}
            <SheetContent 
                side="right" 
                className="w-full sm:max-w-[800px] p-0 flex flex-col border-none [&>button]:hidden shadow-2xl"
                onInteractOutside={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('[role="dialog"]')) e.preventDefault();
                }}
            >
                <div className="flex-1 min-h-0 bg-background h-full">
                    <MediaBrowser 
                        mode="picker" 
                        options={options as any} 
                        onClose={() => onOpenChange(false)} 
                    />
                </div>
            </SheetContent>
        </Sheet>
    );
}
