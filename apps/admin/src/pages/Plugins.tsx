import { Puzzle, Plus, Power, PowerOff } from 'lucide-react';
import { usePlugins, usePluginActions } from '../hooks/usePlugins';
import { cn } from '../lib/utils';

export function PluginsPage() {
    const { plugins, isLoading } = usePlugins();
    const { enablePlugin, disablePlugin } = usePluginActions();

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Puzzle className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold">Plugins</h1>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                    <Plus className="h-4 w-4" />
                    Install Plugin
                </button>
            </div>

            <div className="rounded-xl border border-border bg-card">
                <div className="p-6 border-b border-border">
                    <h2 className="font-semibold">Installed Plugins</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage your plugins here. Enable, disable, or configure them.
                    </p>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    </div>
                ) : plugins.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Puzzle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No plugins installed yet.</p>
                        <p className="text-sm mt-1">Click "Install Plugin" to get started.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {plugins.map((plugin) => (
                            <div key={plugin.id} className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        'w-10 h-10 rounded-lg flex items-center justify-center',
                                        plugin.status === 'enabled' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
                                    )}>
                                        <Puzzle className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-medium">{plugin.name}</h3>
                                        <p className="text-sm text-muted-foreground">
                                            v{plugin.version} • {plugin.status}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {plugin.status === 'enabled' ? (
                                        <button
                                            onClick={() => disablePlugin(plugin.id)}
                                            className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                                            title="Disable"
                                        >
                                            <PowerOff className="h-4 w-4" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => enablePlugin(plugin.id)}
                                            className="p-2 rounded-lg hover:bg-green-500/10 text-green-500 transition-colors"
                                            title="Enable"
                                        >
                                            <Power className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
