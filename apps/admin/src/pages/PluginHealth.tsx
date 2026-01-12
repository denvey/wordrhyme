/**
 * Plugin Health Status Page
 *
 * Admin UI for monitoring plugin health status.
 *
 * Features:
 * - Health summary dashboard
 * - Individual plugin health cards
 * - State indicators (healthy/degraded/suspended)
 * - Manual reset for suspended plugins
 * - Auto-refresh capability
 */

import { useState } from 'react';
import { trpc } from '../lib/trpc';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Button,
    Badge,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@wordrhyme/ui';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    Pause,
    RefreshCw,
    RotateCcw,
    Puzzle,
    TrendingDown,
    Clock,
} from 'lucide-react';
import { toast } from 'sonner';

type HealthState = 'healthy' | 'degraded' | 'suspended';

interface PluginHealthStatus {
    pluginId: string;
    tenantId: string;
    state: HealthState;
    errorRate: number;
    errorCount: number;
    totalRequests: number;
    avgResponseTime: number;
    lastStateChange: string;
    lastError?: {
        message: string;
        timestamp: string;
    };
}

export default function PluginHealth() {
    const [autoRefresh, setAutoRefresh] = useState(false);

    const {
        data: summary,
        isLoading: summaryLoading,
        error: summaryError,
        refetch: refetchSummary,
    } = trpc.pluginHealth.summary.useQuery(undefined, {
        refetchInterval: autoRefresh ? 5000 : false,
    });

    const {
        data: plugins,
        isLoading: pluginsLoading,
        error: pluginsError,
        refetch: refetchPlugins,
    } = trpc.pluginHealth.list.useQuery(undefined, {
        refetchInterval: autoRefresh ? 5000 : false,
    });

    const handleRefresh = () => {
        refetchSummary();
        refetchPlugins();
    };

    const isLoading = summaryLoading || pluginsLoading;
    const error = summaryError || pluginsError;

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Activity className="h-8 w-8 text-primary" />
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">插件健康监控</h1>
                        <p className="text-muted-foreground mt-1">监控插件运行状态和健康指标</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        刷新
                    </Button>
                    <Button
                        variant={autoRefresh ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                    >
                        <Activity className="h-4 w-4 mr-2" />
                        {autoRefresh ? '停止自动刷新' : '自动刷新'}
                    </Button>
                </div>
            </div>

            {autoRefresh && (
                <Badge variant="secondary" className="animate-pulse">
                    每 5 秒自动刷新
                </Badge>
            )}

            {error && (
                <Card className="border-destructive">
                    <CardContent className="flex items-center gap-2 p-6">
                        <AlertCircle className="h-4 w-4 text-destructive" />
                        <span className="text-sm text-destructive">加载失败: {error.message}</span>
                    </CardContent>
                </Card>
            )}

            {/* Summary Cards */}
            <SummaryPanel summary={summary} isLoading={isLoading} />

            {/* Plugin List */}
            <Card>
                <CardHeader>
                    <CardTitle>插件健康状态</CardTitle>
                    <CardDescription>
                        所有被监控插件的实时健康状态
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center h-48">
                            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : !plugins || plugins.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Puzzle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>暂无插件健康数据</p>
                            <p className="text-sm mt-1">插件被调用后将自动开始监控</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {plugins.map((plugin: PluginHealthStatus) => (
                                <PluginHealthCard
                                    key={plugin.pluginId}
                                    plugin={plugin}
                                    onReset={() => {
                                        refetchSummary();
                                        refetchPlugins();
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

interface SummaryPanelProps {
    summary?: {
        total: number;
        healthy: number;
        degraded: number;
        suspended: number;
        totalRequests: number;
        totalErrors: number;
        overallErrorRate: number;
    };
    isLoading: boolean;
}

function SummaryPanel({ summary, isLoading }: SummaryPanelProps) {
    if (isLoading) {
        return (
            <div className="grid gap-4 md:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                        <CardContent className="flex items-center justify-center h-24">
                            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-4">
            {/* Total Plugins */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">总插件数</CardTitle>
                    <Puzzle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{summary?.total ?? 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">被监控的插件</p>
                </CardContent>
            </Card>

            {/* Healthy */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">健康</CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-green-600">{summary?.healthy ?? 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">正常运行</p>
                </CardContent>
            </Card>

            {/* Degraded */}
            <Card className={summary?.degraded ? 'border-yellow-500' : ''}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">降级</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-yellow-600">{summary?.degraded ?? 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">限流运行 (50%)</p>
                </CardContent>
            </Card>

            {/* Suspended */}
            <Card className={summary?.suspended ? 'border-destructive' : ''}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">暂停</CardTitle>
                    <Pause className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-destructive">{summary?.suspended ?? 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">熔断保护</p>
                </CardContent>
            </Card>
        </div>
    );
}

interface PluginHealthCardProps {
    plugin: PluginHealthStatus;
    onReset: () => void;
}

function PluginHealthCard({ plugin, onReset }: PluginHealthCardProps) {
    const resetMutation = trpc.pluginHealth.reset.useMutation({
        onSuccess: () => {
            toast.success('重置成功', {
                description: `插件 ${plugin.pluginId} 已恢复为健康状态`,
            });
            onReset();
        },
        onError: (error: { message: string }) => {
            toast.error('重置失败', {
                description: error.message,
            });
        },
    });

    const getStateConfig = (state: HealthState) => {
        switch (state) {
            case 'healthy':
                return {
                    icon: CheckCircle2,
                    color: 'text-green-500',
                    bgColor: 'bg-green-500/10',
                    borderColor: '',
                    label: '健康',
                    description: '插件运行正常',
                };
            case 'degraded':
                return {
                    icon: AlertTriangle,
                    color: 'text-yellow-500',
                    bgColor: 'bg-yellow-500/10',
                    borderColor: 'border-yellow-500',
                    label: '降级',
                    description: '错误率偏高，已启用限流 (50%)',
                };
            case 'suspended':
                return {
                    icon: Pause,
                    color: 'text-destructive',
                    bgColor: 'bg-destructive/10',
                    borderColor: 'border-destructive',
                    label: '暂停',
                    description: '错误过多，已启用熔断保护',
                };
        }
    };

    const stateConfig = getStateConfig(plugin.state);
    const StateIcon = stateConfig.icon;
    const errorRatePercent = (plugin.errorRate * 100).toFixed(1);
    const lastStateChange = new Date(plugin.lastStateChange).toLocaleString('zh-CN');

    return (
        <Card className={stateConfig.borderColor}>
            <CardContent className="p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {/* Status Icon */}
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stateConfig.bgColor}`}>
                            <StateIcon className={`h-5 w-5 ${stateConfig.color}`} />
                        </div>

                        {/* Plugin Info */}
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-medium">{plugin.pluginId}</h3>
                                <Badge variant={plugin.state === 'healthy' ? 'default' : 'destructive'}>
                                    {stateConfig.label}
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {stateConfig.description}
                            </p>
                        </div>
                    </div>

                    {/* Metrics */}
                    <div className="flex items-center gap-6">
                        {/* Error Rate */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="text-center">
                                        <div className={`text-lg font-semibold ${plugin.errorRate > 0.1 ? 'text-destructive' : ''}`}>
                                            {errorRatePercent}%
                                        </div>
                                        <div className="text-xs text-muted-foreground">错误率</div>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{plugin.errorCount} 错误 / {plugin.totalRequests} 总请求</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        {/* Response Time */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="text-center">
                                        <div className={`text-lg font-semibold ${plugin.avgResponseTime > 1000 ? 'text-yellow-600' : ''}`}>
                                            {plugin.avgResponseTime.toFixed(0)}ms
                                        </div>
                                        <div className="text-xs text-muted-foreground">平均响应</div>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>平均响应时间</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        {/* Total Requests */}
                        <div className="text-center">
                            <div className="text-lg font-semibold">{plugin.totalRequests}</div>
                            <div className="text-xs text-muted-foreground">总请求</div>
                        </div>

                        {/* Reset Button (for suspended plugins) */}
                        {plugin.state === 'suspended' && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <RotateCcw className="h-4 w-4 mr-2" />
                                        重置
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>确认重置插件健康状态？</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            这将把插件 <strong>{plugin.pluginId}</strong> 的健康状态重置为"健康"，
                                            允许其再次处理请求。请确保已修复导致错误的根本问题。
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>取消</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() => resetMutation.mutate({ pluginId: plugin.pluginId })}
                                            disabled={resetMutation.isPending}
                                        >
                                            {resetMutation.isPending ? '重置中...' : '确认重置'}
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                    </div>
                </div>

                {/* Last Error (if exists) */}
                {plugin.lastError && (
                    <div className="mt-4 p-3 bg-destructive/5 rounded-lg border border-destructive/20">
                        <div className="flex items-start gap-2">
                            <TrendingDown className="h-4 w-4 text-destructive mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-destructive">最后错误</div>
                                <p className="text-sm text-muted-foreground truncate">
                                    {plugin.lastError.message}
                                </p>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                    <Clock className="h-3 w-3" />
                                    {new Date(plugin.lastError.timestamp).toLocaleString('zh-CN')}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* State Change Time */}
                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    状态变更于: {lastStateChange}
                </div>
            </CardContent>
        </Card>
    );
}
