/**
 * OverridableSettingsContainer
 *
 * Generic wrapper for infrastructure plugin settings that handles
 * "inherit platform default / use custom configuration" toggle.
 */
import { useState, type ReactNode } from 'react';
import { Info, AlertTriangle, RotateCcw, Settings2 } from 'lucide-react';
import {
    Button,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Skeleton,
} from '@wordrhyme/ui';
import { useInfraVisibility, type InfraPolicyMode } from '../../hooks/use-infra-policy';

export interface OverridableSettingsContext {
    mode: InfraPolicyMode;
    isEditable: boolean;
}

interface OverridableSettingsContainerProps {
    pluginId: string;
    riskLevel?: 'high' | 'medium' | 'low';
    children: (ctx: OverridableSettingsContext) => ReactNode;
}

export function OverridableSettingsContainer({
    pluginId,
    riskLevel,
    children,
}: OverridableSettingsContainerProps) {
    const { data: visibility, isLoading } = useInfraVisibility(pluginId);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [localOverride, setLocalOverride] = useState<boolean | null>(null);

    if (isLoading) {
        return (
            <div className="space-y-4 p-6">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }

    if (!visibility) return null;

    const { mode, hasCustomConfig } = visibility;

    // Platform admins see the raw form — this container is for tenants only
    // unified mode should not render (tab is hidden), but guard anyway
    if (mode === 'unified') return null;

    const isCustom = localOverride ?? hasCustomConfig;
    const isEditable = mode === 'require_tenant' || isCustom;

    const handleSwitchToCustom = () => {
        if (riskLevel === 'high') {
            setConfirmOpen(true);
        } else {
            setLocalOverride(true);
        }
    };

    const handleConfirmCustom = () => {
        setLocalOverride(true);
        setConfirmOpen(false);
    };

    const handleResetToDefault = () => {
        setLocalOverride(false);
    };

    return (
        <div className="space-y-4">
            {/* Status Banner */}
            {mode === 'require_tenant' && !hasCustomConfig && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Configuration required to use this feature. Please complete the settings below.</span>
                </div>
            )}

            {mode === 'allow_override' && !isCustom && (
                <div className="flex items-center justify-between rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                    <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400">
                        <Info className="h-4 w-4 shrink-0" />
                        <span>Currently using platform default configuration.</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleSwitchToCustom}>
                        <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                        Switch to custom configuration
                    </Button>
                </div>
            )}

            {mode === 'allow_override' && isCustom && (
                <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                    <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>You are using custom configuration.</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleResetToDefault}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        Reset to platform default
                    </Button>
                </div>
            )}

            {/* Children with context */}
            <div className={!isEditable ? 'pointer-events-none opacity-60' : undefined}>
                {children({ mode, isEditable })}
            </div>

            {/* High-risk confirmation dialog */}
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Switch to custom configuration?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This is a high-risk infrastructure setting. Using custom configuration
                            means your organization will be responsible for maintaining and securing
                            this service. Platform defaults will no longer apply.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmCustom}>
                            I understand, switch to custom
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
