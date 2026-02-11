/**
 * Translations Management Page
 *
 * Manage UI translations (i18n_messages) for the organization.
 * Supports JSONB multi-language editing.
 *
 * @see design.md D2: 翻译管理
 */
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { FileText, Search, Filter } from 'lucide-react';
import { AutoCrudTable, useAutoCrudResource } from '@wordrhyme/auto-crud';
import { trpc } from '../../lib/trpc';
import {
  Badge,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@wordrhyme/ui';

/**
 * Translation message schema
 */
const messageSchema = z.object({
  id: z.string().optional(),
  key: z.string().min(1, 'Key is required'),
  namespace: z.string().min(1, 'Namespace is required'),
  type: z.enum(['page', 'component', 'message', 'error', 'label']).default('page'),
  translations: z.record(z.string(), z.string()).default({}),
  description: z.string().optional(),
  isEnabled: z.boolean().default(true),
});

type Message = z.infer<typeof messageSchema> & {
  id: string;
  source: string;
  sourceId: string | null;
  userModified: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Namespace options
 */
const NAMESPACES = [
  { value: 'core', label: 'Core' },
  { value: 'admin', label: 'Admin' },
  { value: 'common', label: 'Common' },
  { value: 'errors', label: 'Errors' },
  { value: 'validation', label: 'Validation' },
];

/**
 * Message type options
 */
const MESSAGE_TYPES = [
  { value: 'page', label: 'Page' },
  { value: 'component', label: 'Component' },
  { value: 'message', label: 'Message' },
  { value: 'error', label: 'Error' },
  { value: 'label', label: 'Label' },
];

/**
 * Translations Page Component
 */
export function TranslationsPage() {
  const [namespaceFilter, setNamespaceFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch available languages for the translation editor
  const { data: languages } = trpc.i18n.languages.list.useQuery({});

  // Build query input with filters
  const queryInput = useMemo(
    () => ({
      namespace: namespaceFilter || undefined,
      type: typeFilter || undefined,
      search: searchQuery || undefined,
    }),
    [namespaceFilter, typeFilter, searchQuery]
  );

  // Use auto-crud resource hook
  const resource = useAutoCrudResource<typeof messageSchema, Message>({
    router: trpc.i18n.messages as any,
    queryInput,
    schema: messageSchema,
    options: {
      idKey: 'id',
      defaultVariant: 'sheet',
      hooks: {
        onSuccess: (op) => {
          console.log(`[Translations] ${op} success`);
        },
      },
    },
  });

  // Get enabled languages for column generation
  const enabledLanguages = useMemo(
    () => (languages || []).filter((l: { isEnabled: boolean }) => l.isEnabled),
    [languages]
  );

  // Column definitions
  const columns = useMemo(
    () => [
      {
        accessorKey: 'key',
        header: 'Key',
        cell: ({ row }: { row: { original: Message } }) => (
          <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">
            {row.original.key}
          </code>
        ),
      },
      {
        accessorKey: 'namespace',
        header: 'Namespace',
        cell: ({ row }: { row: { original: Message } }) => (
          <Badge variant="outline">{row.original.namespace}</Badge>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }: { row: { original: Message } }) => (
          <Badge variant="secondary">{row.original.type}</Badge>
        ),
      },
      // Dynamic columns for each enabled language
      ...enabledLanguages.map((lang: { locale: string; name: string }) => ({
        id: `translation_${lang.locale}`,
        header: lang.name,
        cell: ({ row }: { row: { original: Message } }) => {
          const translation = row.original.translations?.[lang.locale];
          return (
            <div className="max-w-[200px] truncate" title={translation}>
              {translation || (
                <span className="text-muted-foreground italic">Not translated</span>
              )}
            </div>
          );
        },
      })),
      {
        accessorKey: 'source',
        header: 'Source',
        cell: ({ row }: { row: { original: Message } }) => (
          <div className="flex items-center gap-1">
            <Badge variant={row.original.source === 'user' ? 'default' : 'secondary'}>
              {row.original.source}
            </Badge>
            {row.original.userModified && (
              <Badge variant="outline" className="text-xs">
                Modified
              </Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'isEnabled',
        header: 'Status',
        cell: ({ row }: { row: { original: Message } }) => (
          <Badge variant={row.original.isEnabled ? 'default' : 'secondary'}>
            {row.original.isEnabled ? 'Active' : 'Disabled'}
          </Badge>
        ),
      },
    ],
    [enabledLanguages]
  );

  // Build form schema with dynamic language fields
  const formSchema = useMemo(
    () => ({
      type: 'object',
      properties: {
        key: {
          type: 'string',
          title: 'Translation Key',
          description: 'Unique key for this translation (e.g., common.save)',
          'x-decorator': 'FormItem',
          'x-component': 'Input',
          'x-component-props': {
            placeholder: 'e.g., common.save',
          },
        },
        namespace: {
          type: 'string',
          title: 'Namespace',
          description: 'Group translations by feature or module',
          default: 'core',
          enum: NAMESPACES.map((n) => ({ label: n.label, value: n.value })),
          'x-decorator': 'FormItem',
          'x-component': 'Select',
        },
        type: {
          type: 'string',
          title: 'Type',
          default: 'page',
          enum: MESSAGE_TYPES.map((t) => ({ label: t.label, value: t.value })),
          'x-decorator': 'FormItem',
          'x-component': 'Select',
        },
        description: {
          type: 'string',
          title: 'Description',
          description: 'Context for translators (optional)',
          'x-decorator': 'FormItem',
          'x-component': 'Input.TextArea',
          'x-component-props': {
            rows: 2,
          },
        },
        // Dynamic translation fields for each language
        translations: {
          type: 'object',
          title: 'Translations',
          'x-decorator': 'FormItem',
          'x-component': 'Card',
          properties: Object.fromEntries(
            enabledLanguages.map((lang: { locale: string; name: string; nativeName?: string }) => [
              lang.locale,
              {
                type: 'string',
                title: `${lang.name}${lang.nativeName ? ` (${lang.nativeName})` : ''}`,
                'x-decorator': 'FormItem',
                'x-component': 'Input.TextArea',
                'x-component-props': {
                  rows: 2,
                  placeholder: `Translation in ${lang.name}`,
                },
              },
            ])
          ),
        },
        isEnabled: {
          type: 'boolean',
          title: 'Enabled',
          default: true,
          'x-decorator': 'FormItem',
          'x-component': 'Switch',
        },
      },
    }),
    [enabledLanguages]
  );

  return (
    <div className="container mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <FileText className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Translations</h1>
          <p className="text-muted-foreground">
            Manage UI translations for your application
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search keys..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-[200px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={namespaceFilter} onValueChange={setNamespaceFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Namespace" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Namespaces</SelectItem>
              {NAMESPACES.map((ns) => (
                <SelectItem key={ns.value} value={ns.value}>
                  {ns.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Types</SelectItem>
              {MESSAGE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <AutoCrudTable
        schema={messageSchema}
        columns={columns}
        resource={resource}
        table={{
          defaultSort: [{ id: 'createdAt', desc: true }],
        }}
        formSchema={formSchema}
        createTitle="Add Translation"
        editTitle="Edit Translation"
        deleteTitle="Delete Translation"
        deleteDescription="Are you sure you want to delete this translation? This may cause missing text in your application."
        emptyState={{
          icon: FileText,
          title: 'No translations found',
          description: 'Add your first translation key to start localizing your app.',
        }}
        toolbar={{
          search: false, // We have custom search above
          create: true,
        }}
      />
    </div>
  );
}

export default TranslationsPage;
