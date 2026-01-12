import { useState } from 'react';
import {
  FileText,
  Plus,
  Edit2,
  Eye,
  Archive,
  Loader2,
  Search,
} from 'lucide-react';
import { trpc } from '../lib/trpc';
import { Button, cn } from '@wordrhyme/ui';

interface NotificationTemplate {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: 'system' | 'plugin' | 'custom';
  title: Record<string, string>;
  message: Record<string, string>;
  variables: string[] | null;
  defaultChannels: string[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  pluginId: string | null;
  deprecated: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

type CategoryFilter = 'all' | 'system' | 'plugin' | 'custom';

export function NotificationTemplatesPage() {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [includeDeprecated, setIncludeDeprecated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] =
    useState<NotificationTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [previewLocale, setPreviewLocale] = useState('en-US');
  const [previewVariables, setPreviewVariables] = useState<
    Record<string, string>
  >({});

  const { data, isLoading, refetch } =
    trpc.notificationTemplates.list.useQuery({
      category:
        categoryFilter !== 'all'
          ? (categoryFilter as 'system' | 'plugin' | 'custom')
          : undefined,
      includeDeprecated,
    });

  const previewQuery = trpc.notificationTemplates.preview.useQuery(
    {
      key: selectedTemplate?.key || '',
      variables: previewVariables,
      locale: previewLocale,
    },
    {
      enabled: !!selectedTemplate && !isEditing,
    }
  );

  const upsertMutation = trpc.notificationTemplates.upsert.useMutation({
    onSuccess: () => {
      refetch();
      setIsEditing(false);
    },
  });

  const deprecateMutation = trpc.notificationTemplates.deprecate.useMutation({
    onSuccess: () => {
      refetch();
      setSelectedTemplate(null);
    },
  });

  const templates = (data || []) as NotificationTemplate[];

  const filteredTemplates = templates.filter((t) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        t.key.toLowerCase().includes(query) ||
        t.name.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const getCategoryBadge = (category: string) => {
    const styles: Record<string, string> = {
      system: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      plugin:
        'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      custom:
        'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    };
    return (
      <span
        className={cn(
          'px-2 py-0.5 text-xs font-medium rounded-full',
          styles[category] || 'bg-gray-100 text-gray-800'
        )}
      >
        {category}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      low: 'bg-gray-100 text-gray-600',
      normal: 'bg-blue-100 text-blue-600',
      high: 'bg-orange-100 text-orange-600',
      urgent: 'bg-red-100 text-red-600',
    };
    return (
      <span
        className={cn(
          'px-2 py-0.5 text-xs font-medium rounded-full',
          styles[priority] || 'bg-gray-100 text-gray-600'
        )}
      >
        {priority}
      </span>
    );
  };

  const handleCreateNew = () => {
    setSelectedTemplate({
      id: '',
      key: '',
      name: '',
      description: null,
      category: 'custom',
      title: { 'en-US': '' },
      message: { 'en-US': '' },
      variables: [],
      defaultChannels: ['in-app'],
      priority: 'normal',
      pluginId: null,
      deprecated: false,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setIsEditing(true);
  };

  const handleEdit = (template: NotificationTemplate) => {
    setSelectedTemplate(template);
    setIsEditing(true);
  };

  const handleView = (template: NotificationTemplate) => {
    setSelectedTemplate(template);
    setIsEditing(false);
    // Initialize preview variables
    const vars: Record<string, string> = {};
    template.variables?.forEach((v) => {
      vars[v] = `{${v}}`;
    });
    setPreviewVariables(vars);
  };

  const handleSave = () => {
    if (!selectedTemplate) return;

    upsertMutation.mutate({
      key: selectedTemplate.key,
      name: selectedTemplate.name,
      description: selectedTemplate.description || undefined,
      category: selectedTemplate.category,
      title: selectedTemplate.title,
      message: selectedTemplate.message,
      variables: selectedTemplate.variables || undefined,
      defaultChannels: selectedTemplate.defaultChannels,
      priority: selectedTemplate.priority,
      pluginId: selectedTemplate.pluginId || undefined,
      version: selectedTemplate.version,
    });
  };

  const handleDeprecate = (key: string) => {
    if (window.confirm('Are you sure you want to deprecate this template?')) {
      deprecateMutation.mutate({ key });
    }
  };

  return (
    <div className="flex h-full">
      {/* Template List */}
      <div className="w-1/2 border-r overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold">Notification Templates</h1>
            </div>
            <Button size="sm" onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-md text-sm"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as CategoryFilter)
              }
              className="px-3 py-2 border rounded-md text-sm"
            >
              <option value="all">All Categories</option>
              <option value="system">System</option>
              <option value="plugin">Plugin</option>
              <option value="custom">Custom</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeDeprecated}
                onChange={(e) => setIncludeDeprecated(e.target.checked)}
              />
              Show deprecated
            </label>
          </div>

          {/* Template List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No templates found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className={cn(
                    'p-4 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors',
                    selectedTemplate?.id === template.id &&
                      'ring-2 ring-primary',
                    template.deprecated && 'opacity-60'
                  )}
                  onClick={() => handleView(template)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium truncate">{template.name}</h3>
                        {template.deprecated && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 text-gray-600">
                            deprecated
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground font-mono truncate">
                        {template.key}
                      </p>
                      {template.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                          {template.description}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {getCategoryBadge(template.category)}
                      {getPriorityBadge(template.priority)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Template Detail / Editor */}
      <div className="w-1/2 overflow-y-auto bg-muted/20">
        {selectedTemplate ? (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">
                {isEditing
                  ? selectedTemplate.id
                    ? 'Edit Template'
                    : 'New Template'
                  : 'Template Details'}
              </h2>
              <div className="flex items-center gap-2">
                {!isEditing ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(selectedTemplate)}
                      disabled={selectedTemplate.deprecated}
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeprecate(selectedTemplate.key)}
                      disabled={
                        selectedTemplate.deprecated ||
                        deprecateMutation.isPending
                      }
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      Deprecate
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsEditing(false);
                        if (!selectedTemplate.id) {
                          setSelectedTemplate(null);
                        }
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={upsertMutation.isPending}
                    >
                      {upsertMutation.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Save
                    </Button>
                  </>
                )}
              </div>
            </div>

            {isEditing ? (
              // Edit Form
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Template Key *
                  </label>
                  <input
                    type="text"
                    value={selectedTemplate.key}
                    onChange={(e) =>
                      setSelectedTemplate({
                        ...selectedTemplate,
                        key: e.target.value,
                      })
                    }
                    placeholder="e.g., order.shipped"
                    className="w-full px-3 py-2 border rounded-md text-sm font-mono"
                    disabled={!!selectedTemplate.id}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={selectedTemplate.name}
                    onChange={(e) =>
                      setSelectedTemplate({
                        ...selectedTemplate,
                        name: e.target.value,
                      })
                    }
                    placeholder="Order Shipped"
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Description
                  </label>
                  <textarea
                    value={selectedTemplate.description || ''}
                    onChange={(e) =>
                      setSelectedTemplate({
                        ...selectedTemplate,
                        description: e.target.value || null,
                      })
                    }
                    placeholder="Description..."
                    rows={2}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Category
                    </label>
                    <select
                      value={selectedTemplate.category}
                      onChange={(e) =>
                        setSelectedTemplate({
                          ...selectedTemplate,
                          category: e.target.value as
                            | 'system'
                            | 'plugin'
                            | 'custom',
                        })
                      }
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    >
                      <option value="system">System</option>
                      <option value="plugin">Plugin</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Priority
                    </label>
                    <select
                      value={selectedTemplate.priority}
                      onChange={(e) =>
                        setSelectedTemplate({
                          ...selectedTemplate,
                          priority: e.target.value as
                            | 'low'
                            | 'normal'
                            | 'high'
                            | 'urgent',
                        })
                      }
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Title (en-US) *
                  </label>
                  <input
                    type="text"
                    value={selectedTemplate.title['en-US'] || ''}
                    onChange={(e) =>
                      setSelectedTemplate({
                        ...selectedTemplate,
                        title: { ...selectedTemplate.title, 'en-US': e.target.value },
                      })
                    }
                    placeholder="Your order has shipped!"
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Message (en-US) *
                  </label>
                  <textarea
                    value={selectedTemplate.message['en-US'] || ''}
                    onChange={(e) =>
                      setSelectedTemplate({
                        ...selectedTemplate,
                        message: {
                          ...selectedTemplate.message,
                          'en-US': e.target.value,
                        },
                      })
                    }
                    placeholder="Your order #{orderId} has shipped via {carrier}."
                    rows={3}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use {'{'} variableName {'}'} for variable interpolation
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Variables (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={selectedTemplate.variables?.join(', ') || ''}
                    onChange={(e) =>
                      setSelectedTemplate({
                        ...selectedTemplate,
                        variables: e.target.value
                          .split(',')
                          .map((v) => v.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="orderId, carrier, trackingUrl"
                    className="w-full px-3 py-2 border rounded-md text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Default Channels
                  </label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedTemplate.defaultChannels.includes(
                          'in-app'
                        )}
                        onChange={(e) => {
                          const channels = e.target.checked
                            ? [...selectedTemplate.defaultChannels, 'in-app']
                            : selectedTemplate.defaultChannels.filter(
                                (c) => c !== 'in-app'
                              );
                          setSelectedTemplate({
                            ...selectedTemplate,
                            defaultChannels: channels,
                          });
                        }}
                      />
                      in-app
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Additional channels (email, push, sms) require plugins
                  </p>
                </div>
              </div>
            ) : (
              // View Mode
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground uppercase mb-1">
                      Key
                    </label>
                    <p className="font-mono text-sm">{selectedTemplate.key}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground uppercase mb-1">
                      Version
                    </label>
                    <p className="text-sm">v{selectedTemplate.version}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase mb-1">
                    Description
                  </label>
                  <p className="text-sm">
                    {selectedTemplate.description || 'No description'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground uppercase mb-1">
                      Category
                    </label>
                    {getCategoryBadge(selectedTemplate.category)}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground uppercase mb-1">
                      Priority
                    </label>
                    {getPriorityBadge(selectedTemplate.priority)}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase mb-1">
                    Default Channels
                  </label>
                  <div className="flex items-center gap-2">
                    {selectedTemplate.defaultChannels.map((channel) => (
                      <span
                        key={channel}
                        className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-800"
                      >
                        {channel}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase mb-1">
                    Variables
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedTemplate.variables?.length ? (
                      selectedTemplate.variables.map((v) => (
                        <span
                          key={v}
                          className="px-2 py-0.5 text-xs font-mono rounded bg-muted"
                        >
                          {'{'}
                          {v}
                          {'}'}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No variables
                      </span>
                    )}
                  </div>
                </div>

                {/* Preview Section */}
                <div className="border-t pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Preview
                    </h3>
                    <select
                      value={previewLocale}
                      onChange={(e) => setPreviewLocale(e.target.value)}
                      className="px-2 py-1 border rounded text-sm"
                    >
                      {Object.keys(selectedTemplate.title).map((locale) => (
                        <option key={locale} value={locale}>
                          {locale}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Variable inputs for preview */}
                  {selectedTemplate.variables?.length ? (
                    <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Test Variables:
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {selectedTemplate.variables.map((v) => (
                          <div key={v} className="flex items-center gap-2">
                            <label className="text-xs font-mono text-muted-foreground">
                              {v}:
                            </label>
                            <input
                              type="text"
                              value={previewVariables[v] || ''}
                              onChange={(e) =>
                                setPreviewVariables({
                                  ...previewVariables,
                                  [v]: e.target.value,
                                })
                              }
                              className="flex-1 px-2 py-1 border rounded text-sm"
                              placeholder={`{${v}}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Preview result */}
                  <div className="p-4 border rounded-lg bg-white dark:bg-gray-900">
                    {previewQuery.isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : previewQuery.data ? (
                      <>
                        <h4 className="font-semibold mb-2">
                          {previewQuery.data.title}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {previewQuery.data.message}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Unable to render preview
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select a template to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
