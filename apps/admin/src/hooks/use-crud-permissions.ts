import { useMemo } from 'react';
import type { z } from 'zod';
import type { CrudPermissions } from '@wordrhyme/auto-crud';
import { useAbility, type AppAbility } from '@/lib/ability';

/**
 * Calculate CRUD permissions from CASL ability
 *
 * @param subject - CASL subject name (e.g., 'Employee', 'Article')
 * @param schema - Zod schema to extract field names from
 * @returns CrudPermissions object with `can` and `deny` properties
 *
 * @example
 * ```tsx
 * const permissions = useCrudPermissions('Employee', employeeSchema);
 * <AutoCrudTable permissions={permissions} />
 * ```
 */
export function useCrudPermissions<T extends z.ZodObject<z.ZodRawShape>>(
  subject: string,
  schema: T
): CrudPermissions {
  const ability = useAbility();

  return useMemo(() => {
    // Default to allow-all when ability is not configured (consistent with AbilityProvider default)
    if (!ability || ability.rules.length === 0) {
      return {
        can: { create: true, update: true, delete: true, export: true },
        deny: [],
      };
    }

    return {
      can: {
        create: ability.can('create', subject as Parameters<AppAbility['can']>[1]),
        update: ability.can('update', subject as Parameters<AppAbility['can']>[1]),
        delete: ability.can('delete', subject as Parameters<AppAbility['can']>[1]),
        export:
          ability.can('read', subject as Parameters<AppAbility['can']>[1]) ||
          ability.can('manage', subject as Parameters<AppAbility['can']>[1]),
      },
      deny: getDenyFields(ability, subject, schema),
    };
  }, [ability, subject, schema]);
}

/**
 * Extract denied fields from CASL rules
 */
function getDenyFields<T extends z.ZodObject<z.ZodRawShape>>(
  ability: AppAbility,
  subject: string,
  schema: T
): string[] {
  const allFields = Object.keys(schema.shape);

  // Find read rule with fields restriction
  const readRule = ability.rules.find(
    (r) =>
      (r.action === 'read' || r.action === 'manage') &&
      r.subject === subject &&
      r.fields &&
      !r.inverted
  );

  if (!readRule?.fields) {
    return [];
  }

  // Calculate difference: all fields - allowed fields = denied fields
  const allowedFields = new Set(readRule.fields);
  return allFields.filter((f) => !allowedFields.has(f));
}
