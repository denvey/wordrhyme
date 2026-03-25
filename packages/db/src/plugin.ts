import {
  pgTableCreator,
  text,
  type AnyPgColumnBuilder,
  type PgBuildColumns,
  type PgBuildExtraConfigColumns,
  type PgTableExtraConfig,
  type PgTableExtraConfigValue,
  type PgTableWithColumns,
} from 'drizzle-orm/pg-core';
import type { PgColumnsBuilders } from 'drizzle-orm/pg-core/columns/all';
import {
  createInsertSchema as _drizzleCreateInsertSchema,
  createSelectSchema,
} from 'drizzle-zod';

// Re-export createSelectSchema as-is (no policy field omission needed)
export { createSelectSchema as createPluginSelectSchema };

declare const __WR_PLUGIN_ID__: string | undefined;

type PluginProcess = typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

function createPluginPolicyFields() {
  return {
    organizationId: text('organization_id').notNull(),
    aclTags: text('acl_tags').array().notNull().default([]),
    denyTags: text('deny_tags').array().notNull().default([]),
  };
}

type PluginPolicyFieldBuilders = ReturnType<typeof createPluginPolicyFields>;
type PluginColumnMap<TColumnsMap extends Record<string, AnyPgColumnBuilder>> =
  TColumnsMap & PluginPolicyFieldBuilders;
type PluginTableResult<
  TTableName extends string,
  TColumnsMap extends Record<string, AnyPgColumnBuilder>,
> = PgTableWithColumns<{
  name: TTableName;
  schema: undefined;
  columns: PgBuildColumns<TTableName, PluginColumnMap<TColumnsMap>>;
  dialect: 'pg';
}>;
type PluginExtraConfig<TColumnsMap extends Record<string, AnyPgColumnBuilder>> = (
  self: PgBuildExtraConfigColumns<PluginColumnMap<TColumnsMap>>,
) => PgTableExtraConfig | PgTableExtraConfigValue[];

function resolvePluginId(): string {
  const runtime = globalThis as PluginProcess;
  const envPluginId = runtime.process?.env?.['WR_PLUGIN_ID'];
  const buildTimePluginId =
    typeof __WR_PLUGIN_ID__ === 'undefined' ? undefined : __WR_PLUGIN_ID__;
  const pluginId = buildTimePluginId ?? envPluginId;

  if (!pluginId) {
    throw new Error(
      'pluginTable() requires a plugin id. Configure __WR_PLUGIN_ID__ at build time ' +
      'or set process.env.WR_PLUGIN_ID before loading plugin schema files.',
    );
  }

  return pluginId;
}

export function normalizePluginId(pluginId: string): string {
  return pluginId.replace(/[.\-]/g, '_');
}

export function buildPluginTableName(shortName: string): string {
  return `plugin_${normalizePluginId(resolvePluginId())}_${shortName}`;
}

function createPluginPgTable() {
  return pgTableCreator((shortName) => buildPluginTableName(shortName));
}

export function pluginTable<
  TTableName extends string,
  TColumnsMap extends Record<string, AnyPgColumnBuilder>,
>(
  name: TTableName,
  columns: TColumnsMap,
  extraConfig?: PluginExtraConfig<TColumnsMap>,
): PluginTableResult<TTableName, TColumnsMap>;
export function pluginTable<
  TTableName extends string,
  TColumnsMap extends Record<string, AnyPgColumnBuilder>,
>(
  name: TTableName,
  columns: (columnTypes: PgColumnsBuilders) => TColumnsMap,
  extraConfig?: PluginExtraConfig<TColumnsMap>,
): PluginTableResult<TTableName, TColumnsMap>;
export function pluginTable<
  TTableName extends string,
  TColumnsMap extends Record<string, AnyPgColumnBuilder>,
>(
  name: TTableName,
  columns: TColumnsMap | ((columnTypes: PgColumnsBuilders) => TColumnsMap),
  extraConfig?: PluginExtraConfig<TColumnsMap>,
): PluginTableResult<TTableName, TColumnsMap> {
  const table = createPluginPgTable();

  if (typeof columns === 'function') {
    return table(
      name,
      (columnTypes) => ({
        ...columns(columnTypes),
        ...createPluginPolicyFields(),
      }),
      extraConfig as never,
    ) as unknown as PluginTableResult<TTableName, TColumnsMap>;
  }

  return table(
    name,
    {
      ...columns,
      ...createPluginPolicyFields(),
    },
    extraConfig as never,
  ) as unknown as PluginTableResult<TTableName, TColumnsMap>;
}

// ============================================================
// Plugin Zod Schema Helpers
// ============================================================

/**
 * Platform policy fields automatically injected by `pluginTable()`.
 * These are managed by ScopedDb at runtime and must never appear in API inputs.
 */
const POLICY_FIELD_OMIT = {
  organizationId: true,
  aclTags: true,
  denyTags: true,
} as const;

/**
 * Create a Zod insert schema for a plugin table, automatically omitting
 * platform policy fields (`organizationId`, `aclTags`, `denyTags`).
 *
 * Drop-in replacement for `createInsertSchema()` from drizzle-zod.
 * Plugin developers should use this instead to avoid leaking infra concerns.
 *
 * @example
 * ```ts
 * import { pluginTable, createPluginInsertSchema } from '@wordrhyme/db/plugin';
 *
 * export const myTable = pluginTable('items', { ... });
 * export const insertItemSchema = createPluginInsertSchema(myTable);
 * ```
 */
export function createPluginInsertSchema(
  ...args: Parameters<typeof _drizzleCreateInsertSchema>
) {
  return _drizzleCreateInsertSchema(...args).omit(POLICY_FIELD_OMIT);
}
