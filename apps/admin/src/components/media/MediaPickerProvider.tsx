import { useState, useCallback, useEffect } from 'react';
import { MediaPickerDialog, type MediaPickerOptions } from './MediaPickerDialog';
import { MediaPickerDrawer } from './MediaPickerDrawer';

// Define the global window interface
declare global {
    interface Window {
        __OMNIDS_MEDIA_PICKER__: {
            open: (options: MediaPickerOptions) => void;
        };
    }
}

export function MediaPickerProvider() {
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState<MediaPickerOptions | null>(null);

    const openDialog = useCallback((opts: MediaPickerOptions) => {
        setOptions(opts);
        setOpen(true);
    }, []);

    // Bind onto the global window object so that PluginSDK can call it easily without React context drilling
    useEffect(() => {
        window.__OMNIDS_MEDIA_PICKER__ = {
            open: openDialog,
        };
        return () => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            delete window.__OMNIDS_MEDIA_PICKER__;
        };
    }, [openDialog]);

    return (
        <>
            <MediaPickerDialog 
                open={open && options?.presentation !== 'drawer'} 
                onOpenChange={setOpen} 
                options={options} 
            />
            <MediaPickerDrawer
                open={open && options?.presentation === 'drawer'}
                onOpenChange={setOpen}
                options={options}
            />
        </>
    );
}
