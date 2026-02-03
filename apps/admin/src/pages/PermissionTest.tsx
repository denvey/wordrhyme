/**
 * Permission Test Page
 *
 * Tests useCrudPermissions hook integration.
 * This page demonstrates how permissions are calculated from CASL ability.
 */
import { z } from 'zod';
import { useCrudPermissions } from '@/hooks/use-crud-permissions';
import { useAbility } from '@/lib/ability';

// Test schema - simulates an Employee entity
const employeeSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  department: z.string(),
  salary: z.number(),
  ssn: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export function PermissionTestPage() {
  const ability = useAbility();
  const permissions = useCrudPermissions('Employee', employeeSchema);

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-4">Permission Test Page</h1>
        <p className="text-muted-foreground">
          Tests the useCrudPermissions hook - calculates CRUD permissions from CASL ability.
        </p>
      </div>

      {/* Debug: Show current permissions */}
      <div className="bg-muted p-4 rounded-lg space-y-4">
        <h2 className="font-semibold">Current Permissions</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium mb-2">Ability Rules Count:</h3>
            <code className="text-xs bg-background p-2 rounded block">
              {ability.rules.length} rules
            </code>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">useCrudPermissions Result:</h3>
            <code className="text-xs bg-background p-2 rounded block whitespace-pre">
              {JSON.stringify(permissions, null, 2)}
            </code>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-2">Can Operations:</h3>
          <div className="flex gap-2 flex-wrap">
            <span className={`px-2 py-1 rounded text-xs ${permissions.can?.create ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
              Create: {permissions.can?.create ? '✓' : '✗'}
            </span>
            <span className={`px-2 py-1 rounded text-xs ${permissions.can?.update ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
              Update: {permissions.can?.update ? '✓' : '✗'}
            </span>
            <span className={`px-2 py-1 rounded text-xs ${permissions.can?.delete ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
              Delete: {permissions.can?.delete ? '✓' : '✗'}
            </span>
            <span className={`px-2 py-1 rounded text-xs ${permissions.can?.export ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
              Export: {permissions.can?.export ? '✓' : '✗'}
            </span>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-2">Denied Fields:</h3>
          <code className="text-xs bg-background p-2 rounded block">
            {permissions.deny?.length ? permissions.deny.join(', ') : '(none - all fields allowed)'}
          </code>
        </div>
      </div>

      {/* Schema fields */}
      <div className="bg-muted p-4 rounded-lg space-y-4">
        <h2 className="font-semibold">Schema Fields (Employee)</h2>
        <div className="flex gap-2 flex-wrap">
          {Object.keys(employeeSchema.shape).map((field) => {
            const isDenied = permissions.deny?.includes(field);
            return (
              <span
                key={field}
                className={`px-2 py-1 rounded text-xs ${
                  isDenied
                    ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 line-through'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                }`}
              >
                {field}
              </span>
            );
          })}
        </div>
      </div>

      {/* Usage example */}
      <div className="bg-muted p-4 rounded-lg space-y-4">
        <h2 className="font-semibold">Usage Example</h2>
        <pre className="text-xs bg-background p-4 rounded overflow-x-auto">
{`import { useCrudPermissions } from '@/hooks/use-crud-permissions';
import { AutoCrudTable } from '@wordrhyme/auto-crud';

const permissions = useCrudPermissions('Employee', employeeSchema);

<AutoCrudTable
  schema={employeeSchema}
  resource={resource}
  permissions={permissions}  // { can: {...}, deny: [...] }
/>`}
        </pre>
      </div>
    </div>
  );
}

export default PermissionTestPage;
