import { roles, rolePermissions } from './schema/definitions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDatabase = { insert: (table: any) => any; select: () => any };

interface CaslRuleDef {
  action: string;
  subject: string;
  fields?: string[] | null;
  conditions?: Record<string, unknown> | null;
  inverted?: boolean;
}

interface RoleDef {
  slug: string;
  name: string;
  description: string;
  rules: CaslRuleDef[];
}

export const DEFAULT_SYSTEM_ROLES: RoleDef[] = [
  {
    slug: 'owner',
    name: 'Owner',
    description: 'Full access to all resources',
    rules: [{ action: 'manage', subject: 'all' }],
  },
  {
    slug: 'admin',
    name: 'Administrator',
    description: 'Manage organization, plugins, users, and content',
    rules: [
      { action: 'manage', subject: 'Organization' },
      { action: 'manage', subject: 'Plugin' },
      { action: 'manage', subject: 'User' },
      { action: 'manage', subject: 'Content' },
      { action: 'manage', subject: 'Role' },
      { action: 'manage', subject: 'Menu' },
      { action: 'manage', subject: 'Media' },
      { action: 'manage', subject: 'Webhook' },
      { action: 'manage', subject: 'Hook' },
      { action: 'manage', subject: 'Core' },
      { action: 'manage', subject: 'System' },
      { action: 'update', subject: 'Settings' },
      { action: 'update', subject: 'FeatureFlag' },
      { action: 'read', subject: 'AuditLog' },
      { action: 'manage', subject: 'AuditLog' },
    ],
  },
  {
    slug: 'member',
    name: 'Member',
    description: 'Read content and comment',
    rules: [
      { action: 'read', subject: 'Content' },
      { action: 'create', subject: 'Content' },
      { action: 'update', subject: 'Content', conditions: { ownerId: '${user.id}' } },
      { action: 'read', subject: 'User' },
    ],
  },
  {
    slug: 'viewer',
    name: 'Viewer',
    description: 'Read public content only',
    rules: [{ action: 'read', subject: 'Content' }],
  },
];

export async function seedDefaultRoles(
  organizationId: string,
  database: AnyDatabase,
): Promise<void> {
  const db = database;

  for (const roleDef of DEFAULT_SYSTEM_ROLES) {
    const [role] = await db
      .insert(roles)
      .values({
        organizationId,
        name: roleDef.name,
        slug: roleDef.slug,
        description: roleDef.description,
        isSystem: true,
      })
      .onConflictDoNothing()
      .returning();

    if (!role) {
      continue;
    }

    for (const rule of roleDef.rules) {
      await db
        .insert(rolePermissions)
        .values({
          roleId: role.id,
          action: rule.action,
          subject: rule.subject,
          fields: rule.fields ?? null,
          conditions: rule.conditions ?? null,
          inverted: rule.inverted ?? false,
        })
        .onConflictDoNothing();
    }
  }
}

export type DefaultRoleSlug = typeof DEFAULT_SYSTEM_ROLES[number]['slug'];
