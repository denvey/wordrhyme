import { useState } from 'react';
import {
  FlaskConical,
  Send,
  Bell,
  FileText,
  Settings,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react';
import { trpc } from '../lib/trpc';
import { Button, cn } from '@wordrhyme/ui';

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  data?: unknown;
}

export function NotificationTestPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // Test notification config
  const [notificationTitle, setNotificationTitle] = useState('Test Notification');
  const [notificationMessage, setNotificationMessage] = useState(
    'This is a test notification from the test page.'
  );
  const [notificationType, setNotificationType] = useState<
    'info' | 'success' | 'warning' | 'error'
  >('info');
  const [sendToAll, setSendToAll] = useState(false);

  // Queries
  const notificationListQuery = trpc.notification.list.useQuery(
    { limit: 5 },
    { enabled: false }
  );
  const unreadCountQuery = trpc.notification.unreadCount.useQuery(undefined, {
    enabled: false,
  });
  const preferencesQuery = trpc.notificationPreferences.get.useQuery(undefined, {
    enabled: false,
  });
  const templatesQuery = trpc.notificationTemplates.list.useQuery(undefined, {
    enabled: false,
  });

  // Mutations
  const sendTestMutation = trpc.notification.sendTest.useMutation();
  const markAllReadMutation = trpc.notification.markAllAsRead.useMutation();
  const upsertTemplateMutation = trpc.notificationTemplates.upsert.useMutation();

  const updateResult = (name: string, update: Partial<TestResult>) => {
    setResults((prev) =>
      prev.map((r) => (r.name === name ? { ...r, ...update } : r))
    );
  };

  const addResult = (result: TestResult) => {
    setResults((prev) => [...prev, result]);
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setResults([]);

    // Test 1: List Notifications
    addResult({ name: 'List Notifications', status: 'running' });
    try {
      const data = await notificationListQuery.refetch();
      updateResult('List Notifications', {
        status: 'success',
        message: `Found ${data.data?.notifications?.length || 0} notifications`,
        data: data.data,
      });
    } catch (e) {
      updateResult('List Notifications', {
        status: 'error',
        message: String(e),
      });
    }

    // Test 2: Unread Count
    addResult({ name: 'Unread Count', status: 'running' });
    try {
      const data = await unreadCountQuery.refetch();
      updateResult('Unread Count', {
        status: 'success',
        message: `Unread: ${data.data?.count || 0}`,
        data: data.data,
      });
    } catch (e) {
      updateResult('Unread Count', {
        status: 'error',
        message: String(e),
      });
    }

    // Test 3: Get Preferences
    addResult({ name: 'Get Preferences', status: 'running' });
    try {
      const data = await preferencesQuery.refetch();
      updateResult('Get Preferences', {
        status: 'success',
        message: `Channels: ${(data.data?.enabledChannels as string[])?.join(', ') || 'none'}`,
        data: data.data,
      });
    } catch (e) {
      updateResult('Get Preferences', {
        status: 'error',
        message: String(e),
      });
    }

    // Test 4: List Templates
    addResult({ name: 'List Templates', status: 'running' });
    try {
      const data = await templatesQuery.refetch();
      updateResult('List Templates', {
        status: 'success',
        message: `Found ${data.data?.length || 0} templates`,
        data: data.data,
      });
    } catch (e) {
      updateResult('List Templates', {
        status: 'error',
        message: String(e),
      });
    }

    setIsRunning(false);
  };

  const createTestTemplate = async () => {
    const name = 'Create Test Template';
    addResult({ name, status: 'running' });
    try {
      const data = await upsertTemplateMutation.mutateAsync({
        key: 'test.welcome',
        name: 'Test Welcome',
        description: 'A test welcome template',
        category: 'custom',
        title: { 'en-US': 'Welcome, {userName}!', 'zh-CN': '欢迎, {userName}!' },
        message: {
          'en-US': 'Hello {userName}, welcome to our platform!',
          'zh-CN': '你好 {userName}，欢迎使用我们的平台！',
        },
        variables: ['userName'],
        defaultChannels: ['in-app'],
        priority: 'normal',
      });
      updateResult(name, {
        status: 'success',
        message: `Template created: ${data.key}`,
        data,
      });
    } catch (e) {
      updateResult(name, {
        status: 'error',
        message: String(e),
      });
    }
  };

  const sendTestNotification = async () => {
    const name = sendToAll
      ? 'Send to All Members'
      : 'Send to Current User';
    addResult({ name, status: 'running' });
    try {
      const data = await sendTestMutation.mutateAsync({
        title: notificationTitle,
        message: notificationMessage,
        type: notificationType,
        toAllMembers: sendToAll,
      });
      updateResult(name, {
        status: 'success',
        message: `Sent ${data.count} notification(s)`,
        data,
      });
    } catch (e) {
      updateResult(name, {
        status: 'error',
        message: String(e),
      });
    }
  };

  const markAllRead = async () => {
    const name = 'Mark All Read';
    addResult({ name, status: 'running' });
    try {
      const data = await markAllReadMutation.mutateAsync();
      updateResult(name, {
        status: 'success',
        message: `Marked ${data.count} as read`,
        data,
      });
    } catch (e) {
      updateResult(name, {
        status: 'error',
        message: String(e),
      });
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pending':
        return <div className="w-5 h-5 rounded-full bg-gray-200" />;
      case 'running':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <FlaskConical className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">Notification System Test</h1>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Button
          onClick={runAllTests}
          disabled={isRunning}
          className="h-24 flex flex-col items-center justify-center gap-2"
        >
          <RefreshCw className={cn('h-6 w-6', isRunning && 'animate-spin')} />
          <span>Run All Tests</span>
        </Button>

        <Button
          variant="outline"
          onClick={createTestTemplate}
          className="h-24 flex flex-col items-center justify-center gap-2"
        >
          <FileText className="h-6 w-6" />
          <span>Create Template</span>
        </Button>

        <Button
          variant="outline"
          onClick={sendTestNotification}
          disabled={sendTestMutation.isPending}
          className="h-24 flex flex-col items-center justify-center gap-2"
        >
          {sendToAll ? (
            <Users className="h-6 w-6" />
          ) : (
            <Send className="h-6 w-6" />
          )}
          <span>{sendToAll ? 'Send to All' : 'Send to Me'}</span>
        </Button>

        <Button
          variant="outline"
          onClick={markAllRead}
          className="h-24 flex flex-col items-center justify-center gap-2"
        >
          <Bell className="h-6 w-6" />
          <span>Mark All Read</span>
        </Button>
      </div>

      {/* Test Configuration */}
      <div className="bg-muted/30 rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Send Test Notification
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={notificationTitle}
              onChange={(e) => setNotificationTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
              placeholder="Notification title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={notificationType}
              onChange={(e) =>
                setNotificationType(
                  e.target.value as 'info' | 'success' | 'warning' | 'error'
                )
              }
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Message</label>
            <textarea
              value={notificationMessage}
              onChange={(e) => setNotificationMessage(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
              rows={2}
              placeholder="Notification message"
            />
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={sendToAll}
                onChange={(e) => setSendToAll(e.target.checked)}
                className="rounded"
              />
              <span className="font-medium">Send to all organization members</span>
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              If unchecked, notification will only be sent to current user
            </p>
          </div>
        </div>
      </div>

      {/* Test Results */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Test Results</h2>
          {results.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResults([])}
            >
              Clear
            </Button>
          )}
        </div>
        <div className="divide-y">
          {results.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground">
              <FlaskConical className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Click "Run All Tests" or send a test notification</p>
            </div>
          ) : (
            results.map((result, idx) => (
              <div key={idx} className="px-6 py-4">
                <div className="flex items-start gap-4">
                  <div className="mt-0.5">{getStatusIcon(result.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{result.name}</h3>
                      <span
                        className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-full',
                          result.status === 'success' &&
                            'bg-green-100 text-green-800',
                          result.status === 'error' &&
                            'bg-red-100 text-red-800',
                          result.status === 'running' &&
                            'bg-blue-100 text-blue-800',
                          result.status === 'pending' &&
                            'bg-gray-100 text-gray-800'
                        )}
                      >
                        {result.status}
                      </span>
                    </div>
                    {result.message && (
                      <p
                        className={cn(
                          'text-sm mt-1',
                          result.status === 'error'
                            ? 'text-red-600'
                            : 'text-muted-foreground'
                        )}
                      >
                        {result.message}
                      </p>
                    )}
                    {result.data && result.status === 'success' && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          View response data
                        </summary>
                        <pre className="mt-2 p-3 bg-muted/50 rounded text-xs overflow-auto max-h-48">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Navigation Links */}
      <div className="mt-8 p-6 bg-muted/30 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">Related Pages</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="/notifications"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90"
          >
            Notifications List
          </a>
          <a
            href="/notifications/preferences"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90"
          >
            Notification Preferences
          </a>
          <a
            href="/notifications/templates"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90"
          >
            Notification Templates
          </a>
        </div>
      </div>
    </div>
  );
}
