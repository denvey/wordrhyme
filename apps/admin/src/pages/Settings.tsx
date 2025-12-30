/**
 * Settings Page
 *
 * Extensible settings page with tabs for core settings and plugin settings.
 */
import { Settings as SettingsIcon } from 'lucide-react';
import { useState, Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger, Skeleton } from '@wordrhyme/ui';
import { useExtensions, PluginErrorBoundary } from '../components/PluginUILoader';
import { ExtensionPoint, type SettingsTabExtension } from '../lib/extensions';

/**
 * Core tabs always available
 */
const coreTabs = [
    { id: 'general', label: 'General' },
    { id: 'security', label: 'Security' },
    { id: 'billing', label: 'Billing' },
];

export function SettingsPage() {
    const [activeTab, setActiveTab] = useState('general');
    const extensions = useExtensions();

    // Filter to settings tab extensions only
    const pluginTabs = extensions.filter(
        (ext): ext is SettingsTabExtension => ext.type === ExtensionPoint.SETTINGS_TAB
    );

    // All tabs = core tabs + plugin tabs
    const allTabs = [
        ...coreTabs,
        ...pluginTabs.map(ext => ({
            id: ext.id,
            label: ext.label,
            pluginId: ext.pluginId,
            component: ext.component,
        })),
    ];

    return (
        <div>
            <div className="flex items-center gap-3 mb-8">
                <SettingsIcon className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold">Settings</h1>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-6">
                    {allTabs.map((tab) => (
                        <TabsTrigger key={tab.id} value={tab.id}>
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                {/* Core Tab Contents */}
                <TabsContent value="general">
                    <div className="rounded-xl border border-border bg-card p-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Organization Name</label>
                                <input
                                    type="text"
                                    defaultValue="My Organization"
                                    className="w-full max-w-md px-3 py-2 rounded-lg border border-input bg-background"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Timezone</label>
                                <select className="w-full max-w-md px-3 py-2 rounded-lg border border-input bg-background">
                                    <option>UTC</option>
                                    <option>America/New_York</option>
                                    <option>Europe/London</option>
                                    <option>Asia/Shanghai</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="security">
                    <div className="rounded-xl border border-border bg-card p-6">
                        <div className="text-muted-foreground">
                            Security settings will be available after authentication is configured.
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="billing">
                    <div className="rounded-xl border border-border bg-card p-6">
                        <div className="text-muted-foreground">
                            Billing settings are not applicable for self-hosted installations.
                        </div>
                    </div>
                </TabsContent>

                {/* Plugin Tab Contents */}
                {pluginTabs.map((ext) => (
                    <TabsContent key={ext.id} value={ext.id}>
                        <div className="rounded-xl border border-border bg-card p-6">
                            <PluginErrorBoundary pluginId={ext.pluginId}>
                                <Suspense fallback={<Skeleton className="h-48 w-full" />}>
                                    <ext.component />
                                </Suspense>
                            </PluginErrorBoundary>
                        </div>
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
