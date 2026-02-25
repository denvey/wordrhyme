import { useSyncExternalStore, useCallback } from 'react';
import { ExtensionRegistry } from './extension-registry';
import type { SlotEntry } from './extension-types';

export function useSlotExtensions(slotName: string): SlotEntry[] {
    const getSnapshot = useCallback(
        () => ExtensionRegistry.getBySlot(slotName),
        [slotName],
    );

    return useSyncExternalStore(
        ExtensionRegistry.subscribe,
        getSnapshot,
        getSnapshot,
    );
}
