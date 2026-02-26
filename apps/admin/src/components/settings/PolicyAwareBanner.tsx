/**
 * PolicyAwareBanner
 *
 * Generic banner component for displaying tenant policy status.
 * Extracted from OverridableSettingsContainer for reuse across
 * both plugin settings tabs and standalone pages (e.g., currencies).
 *
 * Does NOT depend on pluginId — accepts mode/hasCustomConfig directly.
 */
import { useState } from 'react';
import { Info, AlertTriangle, RotateCcw, Settings2, Lock } from 'lucide-react';
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
import type { InfraPolicyMode } from '../../hooks/use-infra-policy';

export interface PolicyAwareBannerProps {
    mode: InfraPolicyMode;
    hasCustomConfig: boolean;
    onSwitchToCustom?: () => void;
    onResetToPlatform?: () => void;
    riskLevel?: 'high' | 'medium' | 'low';
    isLoading?: boolean;
    /** If true, shows a read-only banner for unified mode instead of hiding */
    showUnifiedBanner?: boolean;
}

export function PolicyAwareBanner({
    mode,
    hasCustomConfig,
    onSwitchToCustom,
    onResetToPlatform,
    riskLevel,
    isLoading,
    showUnifiedBanner = false,
}: PolicyAwareBannerProps) {
    const [confirmOpen, setConfirmOpen] = useState(false);

    if (isLoading) {
        return <Skeleton className="h-12 w-full" />;
    }

    const handleSwitchToCustom = () => {
        if (riskLevel === 'high') {
            setConfirmOpen(true);
        } else {
            onSwitchToCustom?.();
        }
    };

    const handleConfirmCustom = () => {
        onSwitchToCustom?.();
        setConfirmOpen(false);
    };

    return (
        <>
            {/* Unified mode: read-only banner */}
            {mode === 'unified' && showUnifiedBanner && (
                <div className="flex items-center gap-2 rounded-lg border border-muted bg-muted/50 p-4 text-sm text-muted-foreground">
                    <Lock className="h-4 w-4 shrink-0" />
                    <span>Currency configuration is managed by the platform.</span>
                </div>
            )}

            {/* Require tenant: warning if no config yet */}
            {mode === 'require_tenant' && !hasCustomConfig && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Configuration required to use this feature. Please complete the settings below.</span>
                </div>
            )}

            {/* Allow override: inheriting platform */}
            {mode === 'allow_override' && !hasCustomConfig && (
                <div className="flex items-center justify-between rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                    <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400">
                        <Info className="h-4 w-4 shrink-0" />
                        <span>Currently using platform default configuration.</span>
                    </div>
                    {onSwitchToCustom && (
                        <Button variant="outline" size="sm" onClick={handleSwitchToCustom}>
                            <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                            Switch to custom configuration
                        </Button>
                    )}
                </div>
            )}

            {/* Allow override: using custom */}
            {mode === 'allow_override' && hasCustomConfig && (
                <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                    <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>You are using custom configuration.</span>
                    </div>
                    {onResetToPlatform && (
                        <Button variant="outline" size="sm" onClick={onResetToPlatform}>
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            Reset to platform default
                        </Button>
                    )}
                </div>
            )}

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
        </>
    );
}
