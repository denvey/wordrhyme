/**
 * Hello World Page Component
 *
 * Main page displayed when user clicks the sidebar item.
 * Demonstrates calling plugin backend API via tRPC.
 */
import React, { useState, useEffect } from 'react';

// Type for API response
interface GreetingResponse {
    message: string;
    timestamp: string;
    tenant: string;
}

interface PluginInfo {
    pluginId: string;
    tenant: string;
    permissionGranted: boolean;
    features: Record<string, boolean>;
}

interface Greeting {
    id: string;
    name: string;
    message: string;
    tenantId: string;
    createdAt: string;
}

export function HelloWorldPage() {
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [greeting, setGreeting] = useState<GreetingResponse | null>(null);
    const [pluginInfo, setPluginInfo] = useState<PluginInfo | null>(null);
    const [greetings, setGreetings] = useState<Greeting[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [advancedMode, setAdvancedMode] = useState(false);

    // Fetch plugin info and greetings on mount
    useEffect(() => {
        fetchPluginInfo();
        fetchGreetings();
    }, []);

    const fetchPluginInfo = async () => {
        try {
            const response = await fetch('/trpc/pluginApis.hello-world.getInfo');
            const data = await response.json();
            if (data.result?.data) {
                setPluginInfo(data.result.data);
            }
        } catch (err) {
            console.error('Failed to fetch plugin info:', err);
        }
    };

    const fetchGreetings = async () => {
        try {
            const endpoint = advancedMode
                ? 'listGreetingsAdvanced'
                : 'listGreetings';
            const url = `/trpc/pluginApis.hello-world.${endpoint}?input=${encodeURIComponent(
                JSON.stringify({ limit: 10 })
            )}`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.result?.data) {
                setGreetings(data.result.data);
            }
        } catch (err) {
            console.error('Failed to fetch greetings:', err);
        }
    };

    const handleSayHello = async () => {
        setLoading(true);
        setError(null);

        try {
            const url = `/trpc/pluginApis.hello-world.sayHello?input=${encodeURIComponent(
                JSON.stringify({ name: name || undefined })
            )}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.result?.data) {
                setGreeting(data.result.data);
            } else if (data.error) {
                setError(data.error.message || 'API request failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to call API');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateGreeting = async () => {
        if (!name.trim() || !message.trim()) {
            setError('Please enter both name and message');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const endpoint = advancedMode
                ? 'createGreetingAdvanced'
                : 'createGreeting';
            const response = await fetch(`/trpc/pluginApis.hello-world.${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, message }),
            });
            const data = await response.json();

            if (data.result?.data?.success) {
                // Add to local list and clear inputs
                setGreetings([
                    {
                        id: data.result.data.id,
                        name: data.result.data.name,
                        message: data.result.data.message,
                        tenantId: pluginInfo?.tenant ?? 'unknown',
                        createdAt: data.result.data.createdAt,
                    },
                    ...greetings,
                ]);
                setName('');
                setMessage('');
            } else if (data.error) {
                setError(data.error.message || 'Failed to create greeting');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create greeting');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteGreeting = async (id: string) => {
        try {
            const endpoint = advancedMode
                ? 'deleteGreetingAdvanced'
                : 'deleteGreeting';
            const response = await fetch(`/trpc/pluginApis.hello-world.${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            const data = await response.json();

            if (data.result?.data?.success) {
                setGreetings(greetings.filter((g) => g.id !== id));
            }
        } catch (err) {
            console.error('Failed to delete greeting:', err);
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold mb-2">Hello World Plugin</h1>
                <p className="text-muted-foreground">
                    A reference plugin demonstrating WordRhyme's plugin architecture with CRUD operations.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Say Hello Card */}
                <div className="rounded-lg border bg-card p-6">
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                        📣 Try the API
                    </h3>
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                                placeholder="Enter your name..."
                                value={name}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                                onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleSayHello()}
                            />
                            <button
                                className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-9 px-4 py-2 disabled:opacity-50"
                                onClick={handleSayHello}
                                disabled={loading}
                            >
                                {loading ? '...' : 'Say Hello'}
                            </button>
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                                {error}
                            </div>
                        )}

                        {greeting && (
                            <div className="p-4 rounded-lg bg-muted space-y-2">
                                <p className="font-medium text-lg">{greeting.message}</p>
                                <div className="flex gap-2 text-xs text-muted-foreground">
                                    <span>Tenant: {greeting.tenant}</span>
                                    <span>•</span>
                                    <span>{new Date(greeting.timestamp).toLocaleString()}</span>
                                </div>
                            </div>
                        )}

                        <div className="text-xs text-muted-foreground">
                            <code className="bg-muted px-1 py-0.5 rounded">
                                GET /trpc/pluginApis.hello-world.sayHello
                            </code>
                        </div>
                    </div>
                </div>

                {/* Plugin Info Card */}
                <div className="rounded-lg border bg-card p-6">
                    <h3 className="font-semibold mb-4 flex items-center justify-between">
                        Plugin Features
                        <button
                            className="text-muted-foreground hover:text-foreground"
                            onClick={fetchPluginInfo}
                            title="Refresh"
                        >
                            🔄
                        </button>
                    </h3>
                    {pluginInfo ? (
                        <div className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {pluginInfo.features && Object.entries(pluginInfo.features).map(([key, enabled]) => (
                                    <span
                                        key={key}
                                        className={`text-xs px-2 py-1 rounded ${enabled
                                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                            }`}
                                    >
                                        {enabled ? '✓' : '○'} {key}
                                    </span>
                                ))}
                            </div>
                            <div className="text-sm text-muted-foreground space-y-1">
                                <p><strong>Plugin ID:</strong> {pluginInfo.pluginId}</p>
                                <p><strong>Tenant:</strong> {pluginInfo.tenant}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground">
                            Loading plugin info...
                        </div>
                    )}
                </div>
            </div>

            {/* CRUD Demo Section */}
            <div className="rounded-lg border bg-card p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">🗄️ Database CRUD Demo</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Mode:</span>
                        <div className="inline-flex rounded-lg border p-1">
                            <button
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${!advancedMode
                                    ? 'bg-blue-500 text-white'
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                onClick={() => setAdvancedMode(false)}
                            >
                                ⚡ Simple
                            </button>
                            <button
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${advancedMode
                                    ? 'bg-purple-500 text-white'
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                onClick={() => setAdvancedMode(true)}
                            >
                                🔌 Advanced
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mode Description */}
                <div className={`mb-4 p-3 rounded-lg text-sm ${advancedMode
                    ? 'bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800'
                    : 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800'
                    }`}>
                    {advancedMode ? (
                        <div>
                            <span className="font-medium text-purple-700 dark:text-purple-300">
                                🔌 Advanced Mode (NestJS Service)
                            </span>
                            <p className="text-purple-600 dark:text-purple-400 text-xs mt-1">
                                Uses <code className="bg-purple-100 dark:bg-purple-900 px-1 rounded">HelloService</code> with
                                <code className="bg-purple-100 dark:bg-purple-900 px-1 rounded">@Inject(PLUGIN_DATABASE)</code> for DI-based database access.
                            </p>
                        </div>
                    ) : (
                        <div>
                            <span className="font-medium text-blue-700 dark:text-blue-300">
                                ⚡ Simple Mode (tRPC + ctx.db)
                            </span>
                            <p className="text-blue-600 dark:text-blue-400 text-xs mt-1">
                                Uses <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">ctx.db.query()</code> directly
                                in tRPC procedures with automatic tenant isolation.
                            </p>
                        </div>
                    )}
                </div>

                {/* Create Form */}
                <div className="flex gap-2 mb-4">
                    <input
                        type="text"
                        className="flex h-9 w-1/3 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                        placeholder="Name"
                        value={name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                    />
                    <input
                        type="text"
                        className="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                        placeholder="Message"
                        value={message}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMessage(e.target.value)}
                    />
                    <button
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-9 px-4 py-2 disabled:opacity-50"
                        onClick={handleCreateGreeting}
                        disabled={loading}
                    >
                        ➕ Create
                    </button>
                </div>

                {/* Greetings List */}
                <div className="space-y-2">
                    {greetings.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No greetings yet. Create one above!</p>
                    ) : (
                        greetings.map((g) => (
                            <div
                                key={g.id}
                                className="flex items-center justify-between p-3 rounded-lg bg-muted"
                            >
                                <div>
                                    <span className="font-medium">{g.name}</span>
                                    <span className="mx-2 text-muted-foreground">said:</span>
                                    <span>{g.message}</span>
                                    <span className="text-xs text-muted-foreground ml-2">
                                        ({new Date(g.createdAt).toLocaleDateString()})
                                    </span>
                                </div>
                                <button
                                    className="text-destructive hover:text-destructive/80 text-sm px-2"
                                    onClick={() => handleDeleteGreeting(g.id)}
                                >
                                    🗑️
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div className="mt-4 text-xs text-muted-foreground">
                    <p><strong>API Endpoints:</strong></p>
                    <code className="bg-muted px-1 py-0.5 rounded mr-2">POST /trpc/pluginApis.hello-world.createGreeting</code>
                    <code className="bg-muted px-1 py-0.5 rounded mr-2">GET /trpc/pluginApis.hello-world.listGreetings</code>
                    <code className="bg-muted px-1 py-0.5 rounded">POST /trpc/pluginApis.hello-world.deleteGreeting</code>
                </div>
            </div>

            {/* Development Modes */}
            <div className="rounded-lg border bg-card p-6">
                <h3 className="font-semibold mb-4">🔧 Plugin Development Modes</h3>
                <p className="text-muted-foreground text-sm mb-4">
                    This plugin demonstrates both development modes available in WordRhyme:
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                    {/* Simple Mode Card */}
                    <div className="p-4 rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-2xl">⚡</span>
                            <h4 className="font-semibold text-blue-700 dark:text-blue-300">Simple Mode</h4>
                            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                                tRPC Only
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                            快速开发模式，只需要导出 tRPC Router。
                        </p>
                        <ul className="space-y-1 text-sm">
                            <li className="flex items-center gap-2">
                                <span className="text-blue-500">●</span>
                                <code className="text-xs bg-muted px-1 rounded">sayHello</code> - 简单问候 API
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="text-blue-500">●</span>
                                <code className="text-xs bg-muted px-1 rounded">getInfo</code> - 获取插件信息
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="text-blue-500">●</span>
                                <code className="text-xs bg-muted px-1 rounded">ctx.db</code> - 数据库 CRUD
                            </li>
                        </ul>
                        <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                            <code className="text-xs text-muted-foreground">
                                export {'{'} router {'}'} from './router'
                            </code>
                        </div>
                    </div>

                    {/* Advanced Mode Card */}
                    <div className="p-4 rounded-lg border-2 border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-2xl">🔌</span>
                            <h4 className="font-semibold text-purple-700 dark:text-purple-300">Advanced Mode</h4>
                            <span className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
                                NestJS Module
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                            高级模式，支持 NestJS 依赖注入和服务类。
                        </p>
                        <ul className="space-y-1 text-sm">
                            <li className="flex items-center gap-2">
                                <span className="text-purple-500">●</span>
                                <code className="text-xs bg-muted px-1 rounded">HelloModule</code> - NestJS 模块
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="text-purple-500">●</span>
                                <code className="text-xs bg-muted px-1 rounded">HelloService</code> - @Injectable 服务
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="text-purple-500">●</span>
                                <code className="text-xs bg-muted px-1 rounded">LazyModuleLoader</code> - 动态加载
                            </li>
                        </ul>
                        <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-800">
                            <code className="text-xs text-muted-foreground">
                                "nestModule": "./dist/server/hello.module.js"
                            </code>
                        </div>
                    </div>
                </div>

                {/* Comparison Table */}
                <div className="mt-6 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b">
                                <th className="text-left py-2 pr-4">功能</th>
                                <th className="text-center py-2 px-4 text-blue-600 dark:text-blue-400">Simple Mode</th>
                                <th className="text-center py-2 px-4 text-purple-600 dark:text-purple-400">Advanced Mode</th>
                            </tr>
                        </thead>
                        <tbody className="text-muted-foreground">
                            <tr className="border-b">
                                <td className="py-2 pr-4">tRPC Router</td>
                                <td className="text-center py-2 px-4 text-green-500">✓</td>
                                <td className="text-center py-2 px-4 text-green-500">✓</td>
                            </tr>
                            <tr className="border-b">
                                <td className="py-2 pr-4">Database CRUD</td>
                                <td className="text-center py-2 px-4 text-green-500">✓</td>
                                <td className="text-center py-2 px-4 text-green-500">✓</td>
                            </tr>
                            <tr className="border-b">
                                <td className="py-2 pr-4">Lifecycle Hooks</td>
                                <td className="text-center py-2 px-4 text-green-500">✓</td>
                                <td className="text-center py-2 px-4 text-green-500">✓</td>
                            </tr>
                            <tr className="border-b">
                                <td className="py-2 pr-4">NestJS @Injectable</td>
                                <td className="text-center py-2 px-4 text-gray-400">-</td>
                                <td className="text-center py-2 px-4 text-green-500">✓</td>
                            </tr>
                            <tr className="border-b">
                                <td className="py-2 pr-4">依赖注入 (DI)</td>
                                <td className="text-center py-2 px-4 text-gray-400">-</td>
                                <td className="text-center py-2 px-4 text-green-500">✓</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">模块化架构</td>
                                <td className="text-center py-2 px-4 text-gray-400">-</td>
                                <td className="text-center py-2 px-4 text-green-500">✓</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

export default HelloWorldPage;
