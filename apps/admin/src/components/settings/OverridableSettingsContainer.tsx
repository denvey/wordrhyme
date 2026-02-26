/**
 * OverridableSettingsContainer
 *
 * Generic wrapper for infrastructure plugin settings that handles
 * "inherit platform default / use custom configuration" toggle.
 *
 * Internally uses PolicyAwareBanner for the banner UI.
 */
import { useState, type ReactNode } from 'react';
import { Skeleton } from '@wordrhyme/ui';
import { useInfraVisibility, type InfraPolicyMode } from '../../hooks/use-infra-policy';
import { PolicyAwareBanner } from './PolicyAwareBanner';

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

    return (
        <div className="space-y-4">
            <PolicyAwareBanner
                mode={mode}
                hasCustomConfig={isCustom}
                riskLevel={riskLevel}
                onSwitchToCustom={() => setLocalOverride(true)}
                onResetToPlatform={() => setLocalOverride(false)}
            />

            {/* Children with context */}
            <div className={!isEditable ? 'pointer-events-none opacity-60' : undefined}>
                {children({ mode, isEditable })}
            </div>
        </div>
    );
}
