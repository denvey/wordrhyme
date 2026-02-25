/**
 * Translations Management Page
 *
 * Manage UI translations (i18n_messages) for the organization.
 * Supports JSONB multi-language editing.
 *
 * @see design.md D2: 翻译管理
 */
import { useMemo } from 'react';
import { z } from 'zod';
import { FileText } from 'lucide-react';
import { AutoCrudTable, useAutoCrudResource } from '@wordrhyme/auto-crud';
import { trpc } from '../../lib/trpc';

/**
 * Translation message schema
 * type: matches DB I18nMessageType = 'page' | 'api'
 * namespace: freeform text (DB allows any string, e.g. 'common', 'plugin:xxx')
 */
const messageSchema = z.object({
  id: z.string().optional(),
  key: z.string().min(1, 'Key is required'),
  namespace: z.string().default('common'),
  type: z.enum(['page', 'api']).default('page'),
  translations: z.record(z.string(), z.string()).default({}),
  description: z.string().optional(),
  isEnabled: z.boolean().default(true),
});

/**
 * Message type options (matches DB: I18nMessageType)
 */
const MESSAGE_TYPES = [
  { value: 'page', label: '前端界面' },
  { value: 'api', label: '后端接口' },
];

// Full-width decorator props for single-column layout (FormGrid defaults to grid-cols-2)
const FULL_WIDTH = { className: 'space-y-2 col-span-2' };

/**
 * Translations Page Component
 */
export function TranslationsPage() {

  // Fetch available languages for the translation editor
  const { data: languages } = (trpc as any).i18n.languages.list.useQuery({ page: 1, perPage: 100, joinOperator: 'and' as const });

  // Get enabled languages for dynamic form fields
  const enabledLanguages = useMemo(
    () => {
      const items = languages ? (Array.isArray(languages) ? languages : languages.data) : [];
      return items.filter((l: { isEnabled: boolean }) => l.isEnabled);
    },
    [languages]
  );

  // Use auto-crud resource hook
  const resource = useAutoCrudResource({
    router: (trpc as any).i18n.messages,
    schema: messageSchema,
    query: (params) => ({
      ...params,
    }),
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

  // Build form overrides with dynamic language fields
  const formOverrides = useMemo(
    () => ({
      id: { 'x-hidden': true },
      key: {
        title: '翻译键',
        description: '唯一标识，如 common.save、errors.not_found',
        'x-decorator-props': FULL_WIDTH,
      },
      namespace: { 'x-hidden': true, default: 'common' },
      type: {
        title: '文本类型',
        description: '前端界面文本 或 后端接口消息',
        'x-component': 'Select',
        enum: MESSAGE_TYPES.map(t => ({ label: t.label, value: t.value })),
        'x-decorator-props': FULL_WIDTH,
      },
      description: {
        title: '备注',
        description: '为翻译人员提供上下文说明（可选）',
        'x-component': 'Textarea',
        'x-component-props': { rows: 2 },
        'x-decorator-props': FULL_WIDTH,
      },
      translations: {
        type: 'object' as const,
        title: '翻译内容',
        'x-component': 'ObjectContainer',
        'x-decorator-props': FULL_WIDTH,
        properties: Object.fromEntries(
          enabledLanguages.map((lang: { locale: string; name: string; nativeName?: string }) => [
            lang.locale,
            {
              type: 'string',
              title: lang.nativeName && lang.nativeName !== lang.name
                ? `${lang.name} (${lang.nativeName})`
                : lang.name,
              'x-decorator': 'FormItem',
              'x-component': 'Textarea',
              'x-component-props': {
                rows: 2,
                placeholder: `输入 ${lang.nativeName || lang.name} 翻译`,
              },
            },
          ])
        ),
      },
      isEnabled: {
        title: '启用',
        'x-decorator-props': FULL_WIDTH,
      },
    }),
    [enabledLanguages]
  );

  return (
    <div className="container mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <FileText className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">翻译管理</h1>
          <p className="text-muted-foreground">
            管理应用的 UI 翻译文本
          </p>
        </div>
      </div>

      <AutoCrudTable
        title="翻译管理"
        schema={messageSchema}
        resource={resource as any}
        fields={{
          id: { hidden: true },
          key: { label: '翻译键' },
          namespace: { label: '命名空间' },
          type: {
            label: '文本类型',
            filter: {
              variant: 'select',
              options: MESSAGE_TYPES,
            },
          },
          translations: { table: false },
          description: { table: false },
          isEnabled: { label: '状态' },
        }}
        table={{
          defaultSort: [{ id: 'key', desc: false }],
        }}
        form={{
          overrides: formOverrides,
        }}
      />
    </div>
  );
}

export default TranslationsPage;
