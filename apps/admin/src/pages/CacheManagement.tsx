/**
 * Cache Management Page
 *
 * Admin UI for monitoring and managing the cache system.
 *
 * Features:
 * - Real-time statistics dashboard
 * - Key browser with namespace filtering
 * - Pattern-based invalidation with dry-run preview
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
  Input,
  Label,
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@wordrhyme/ui';
import { AlertCircle, Activity, Database, Trash2, Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function CacheManagement() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">缓存管理</h1>
          <p className="text-muted-foreground mt-1">监控和管理缓存系统</p>
        </div>
      </div>

      <Tabs defaultValue="stats" className="space-y-4">
        <TabsList>
          <TabsTrigger value="stats">统计信息</TabsTrigger>
          <TabsTrigger value="browser">Key 浏览器</TabsTrigger>
          <TabsTrigger value="invalidate">缓存失效</TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="space-y-4">
          <StatsPanel />
        </TabsContent>

        <TabsContent value="browser" className="space-y-4">
          <KeyBrowser />
        </TabsContent>

        <TabsContent value="invalidate" className="space-y-4">
          <InvalidationPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Statistics Dashboard
 */
function StatsPanel() {
  const [autoRefresh, setAutoRefresh] = useState(false);

  const {
    data: stats,
    isLoading,
    error,
    refetch,
  } = trpc.cache.getStats.useQuery(undefined, {
    refetchInterval: autoRefresh ? 3000 : false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="flex items-center gap-2 p-6">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">加载统计信息失败: {error.message}</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
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
        {autoRefresh && (
          <Badge variant="secondary" className="animate-pulse">
            每 3 秒刷新
          </Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* L1 Memory Cache */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">内存缓存 (L1)</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.memoryUsage ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">当前 keys 数量 / 最大 1000</p>
            <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${((stats?.memoryUsage ?? 0) / 1000) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* L2 Redis Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Redis 状态 (L2)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant={stats?.l2Status === 'connected' ? 'default' : 'destructive'}>
                {stats?.l2Status === 'connected' ? '已连接' : '断开'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {stats?.l2Status === 'connected'
                ? '双层缓存正常工作'
                : '仅使用内存缓存（L1）'}
            </p>
          </CardContent>
        </Card>

        {/* L2 Latency */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Redis 延迟</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.l2Latency ?? 0} ms</div>
            <p className="text-xs text-muted-foreground mt-1">
              最后一次 Redis 操作延迟
            </p>
            {stats?.l2Latency !== undefined && (
              <p className="text-xs mt-2">
                {stats.l2Latency < 5 && (
                  <span className="text-green-600">✓ 优秀</span>
                )}
                {stats.l2Latency >= 5 && stats.l2Latency < 20 && (
                  <span className="text-yellow-600">○ 正常</span>
                )}
                {stats.l2Latency >= 20 && (
                  <span className="text-red-600">⚠ 较慢</span>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* System Status */}
      {stats?.l2Status === 'disconnected' && (
        <Card className="border-yellow-500">
          <CardContent className="flex items-center gap-2 p-6">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <div className="text-sm">
              <strong>Redis 连接失败</strong>：系统已自动降级到仅使用内存缓存（L1）。
              跨实例缓存同步功能暂时不可用。
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Key Browser
 */
function KeyBrowser() {
  const [namespaceType, setNamespaceType] = useState<'tenant' | 'plugin'>('tenant');
  const [selectedId, setSelectedId] = useState<string>('');
  const [pattern, setPattern] = useState('*');
  const [cursor, setCursor] = useState('0');
  const [keys, setKeys] = useState<string[]>([]);

  // Load tenant/plugin list
  const { data: tenants } = trpc.cache.listTenants.useQuery();
  const { data: plugins } = trpc.cache.listPlugins.useQuery();

  const idList = namespaceType === 'tenant' ? tenants : plugins;

  // Scan keys
  const scanMutation = trpc.cache.scanKeys.useMutation({
    onSuccess: (data) => {
      if (cursor === '0') {
        setKeys(data.keys);
      } else {
        setKeys((prev) => [...prev, ...data.keys]);
      }
      setCursor(data.cursor);
      toast.success('扫描完成', {
        description: `找到 ${data.keys.length} 个 keys`,
      });
    },
    onError: (error) => {
      toast.error('扫描失败', {
        description: error.message,
      });
    },
  });

  const handleScan = () => {
    if (!selectedId) {
      toast.error('请选择命名空间', {
        description: `请先选择一个 ${namespaceType === 'tenant' ? '租户' : '插件'}`,
      });
      return;
    }

    const namespace = `${namespaceType}:${selectedId}:${pattern}`;
    setCursor('0');
    setKeys([]);
    scanMutation.mutate({ namespace, cursor: '0', limit: 100 });
  };

  const handleLoadMore = () => {
    if (!selectedId || cursor === '0') return;

    const namespace = `${namespaceType}:${selectedId}:${pattern}`;
    scanMutation.mutate({ namespace, cursor, limit: 100 });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Key 浏览器</CardTitle>
          <CardDescription>浏览缓存中的 keys（按命名空间）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>命名空间类型</Label>
              <Select
                value={namespaceType}
                onValueChange={(value) => {
                  setNamespaceType(value as 'tenant' | 'plugin');
                  setSelectedId('');
                  setKeys([]);
                  setCursor('0');
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant">租户 (Tenant)</SelectItem>
                  <SelectItem value="plugin">插件 (Plugin)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                {namespaceType === 'tenant' ? '租户 ID' : '插件 ID'}
              </Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择..." />
                </SelectTrigger>
                <SelectContent>
                  {idList?.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Pattern 模式</Label>
              <Input
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="例如: users:* 或 *"
              />
            </div>
          </div>

          <Button onClick={handleScan} disabled={scanMutation.isPending || !selectedId}>
            <Search className="h-4 w-4 mr-2" />
            {scanMutation.isPending ? '扫描中...' : '扫描'}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {keys.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>扫描结果</CardTitle>
            <CardDescription>共找到 {keys.length} 个 keys</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {keys.map((key, index) => (
                <div
                  key={index}
                  className="px-3 py-2 bg-secondary rounded-md text-sm font-mono break-all"
                >
                  {key}
                </div>
              ))}
            </div>

            {cursor !== '0' && (
              <Button
                variant="outline"
                className="w-full mt-4"
                onClick={handleLoadMore}
                disabled={scanMutation.isPending}
              >
                {scanMutation.isPending ? '加载中...' : '加载更多'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Invalidation Panel
 */
function InvalidationPanel() {
  const [namespaceType, setNamespaceType] = useState<'tenant' | 'plugin'>('tenant');
  const [selectedId, setSelectedId] = useState<string>('');
  const [pattern, setPattern] = useState('');
  const [previewResult, setPreviewResult] = useState<{
    count: number;
    sampleKeys: string[];
    pattern: string;
  } | null>(null);

  // Load tenant/plugin list
  const { data: tenants } = trpc.cache.listTenants.useQuery();
  const { data: plugins } = trpc.cache.listPlugins.useQuery();

  const idList = namespaceType === 'tenant' ? tenants : plugins;

  // Preview mutation
  const previewMutation = trpc.cache.previewInvalidation.useMutation({
    onSuccess: (data) => {
      setPreviewResult(data);
      toast.success('预览完成', {
        description: `将删除约 ${data.count} 个 keys`,
      });
    },
    onError: (error) => {
      toast.error('预览失败', {
        description: error.message,
      });
    },
  });

  // Invalidate mutation
  const invalidateMutation = trpc.cache.invalidatePattern.useMutation({
    onSuccess: (data) => {
      toast.success('删除成功', {
        description: `已删除 ${data.count} 个 keys`,
      });
      setPreviewResult(null);
      setPattern('');
    },
    onError: (error) => {
      toast.error('删除失败', {
        description: error.message,
      });
    },
  });

  const handlePreview = () => {
    if (!selectedId || !pattern) {
      toast.error('参数不完整', {
        description: '请选择命名空间并输入 pattern',
      });
      return;
    }

    const namespace = `${namespaceType}:${selectedId}`;
    previewMutation.mutate({ namespace, pattern });
  };

  const handleInvalidate = () => {
    if (!selectedId || !pattern) return;

    const namespace = `${namespaceType}:${selectedId}`;
    invalidateMutation.mutate({ namespace, pattern, confirm: true });
  };

  return (
    <div className="space-y-4">
      <Card className="border-yellow-500">
        <CardContent className="flex items-center gap-2 p-6">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <div className="text-sm">
            <strong>警告</strong>：缓存失效操作将永久删除匹配的 keys。请先使用预览功能确认要删除的内容。
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>缓存失效工具</CardTitle>
          <CardDescription>按模式批量删除缓存 keys</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>命名空间类型</Label>
              <Select
                value={namespaceType}
                onValueChange={(value) => {
                  setNamespaceType(value as 'tenant' | 'plugin');
                  setSelectedId('');
                  setPreviewResult(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant">租户 (Tenant)</SelectItem>
                  <SelectItem value="plugin">插件 (Plugin)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                {namespaceType === 'tenant' ? '租户 ID' : '插件 ID'}
              </Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择..." />
                </SelectTrigger>
                <SelectContent>
                  {idList?.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Pattern 模式</Label>
              <Input
                value={pattern}
                onChange={(e) => {
                  setPattern(e.target.value);
                  setPreviewResult(null);
                }}
                placeholder="例如: users:* 或 settings:*"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={previewMutation.isPending || !selectedId || !pattern}
            >
              <Search className="h-4 w-4 mr-2" />
              {previewMutation.isPending ? '预览中...' : '预览'}
            </Button>

            <Button
              variant="destructive"
              onClick={handleInvalidate}
              disabled={
                invalidateMutation.isPending || !previewResult || !selectedId || !pattern
              }
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {invalidateMutation.isPending ? '删除中...' : '执行删除'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Results */}
      {previewResult && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              预览结果
            </CardTitle>
            <CardDescription>
              将删除约 <strong className="text-destructive">{previewResult.count}</strong> 个 keys
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>匹配的 pattern:</Label>
              <div className="mt-1 px-3 py-2 bg-secondary rounded-md text-sm font-mono">
                {previewResult.pattern}
              </div>
            </div>

            <div>
              <Label>示例 keys (前 10 个):</Label>
              <div className="mt-1 space-y-1 max-h-48 overflow-y-auto">
                {previewResult.sampleKeys.map((key, index) => (
                  <div
                    key={index}
                    className="px-3 py-2 bg-secondary rounded-md text-sm font-mono break-all"
                  >
                    {key}
                  </div>
                ))}
              </div>
            </div>

            <Card className="border-destructive bg-destructive/5">
              <CardContent className="flex items-center gap-2 p-6">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <div className="text-sm text-destructive">
                  确认删除后，此操作<strong>无法撤销</strong>。请仔细检查 pattern 是否正确。
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
