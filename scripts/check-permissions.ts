import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  pgTable,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';

// Define minimal schema needed
const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
});

const rolePermissions = pgTable('role_permissions', {
  id: text('id').primaryKey(),
  roleId: text('role_id').notNull(),
  action: text('action').notNull(),
  subject: text('subject').notNull(),
  fields: jsonb('fields'),
  conditions: jsonb('conditions'),
  inverted: boolean('inverted').default(false).notNull(),
});

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/wordrhyme';
  console.log('Connecting to:', dbUrl);
  const sql = postgres(dbUrl);
  const db = drizzle(sql);

  const result = await db
    .select({
      action: rolePermissions.action,
      subject: rolePermissions.subject,
      fields: rolePermissions.fields,
      roleSlug: roles.slug,
    })
    .from(rolePermissions)
    .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
    .where(eq(rolePermissions.subject, 'I18nLanguage'));

  console.log('I18nLanguage permissions:');
  console.log(JSON.stringify(result, null, 2));

  // Check all subjects
  const allSubjects = await db
    .selectDistinct({ subject: rolePermissions.subject })
    .from(rolePermissions);

  console.log('\nAll subjects in role_permissions:');
  console.log(allSubjects.map(s => s.subject).sort().join(', '));

  await sql.end();
}

main().catch(console.error);
