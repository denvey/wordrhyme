/**
 * Audit Configuration
 *
 * Defines which tables should be skipped for audit and
 * which fields should be redacted for security.
 *
 * @see docs/architecture/AUDIT_GOVERNANCE.md
 */

// ============================================================
// Skipped Tables (Prevent Circular Dependencies)
// ============================================================

/**
 * Tables that should NOT produce audit records
 *
 * These tables are skipped to prevent:
 * 1. Circular dependencies (audit table auditing itself)
 * 2. Performance issues (high-frequency internal tables)
 */
export const SKIP_AUDIT_TABLES = new Set([
  // Audit tables (prevent circular dependency)
  'audit_events',
  'audit_events_archive',
  'audit_logs',

  // Session tables (high frequency, low value)
  'sessions',
  'session',

  // Verification tokens (temporary data)
  'verification_tokens',
  'verification_token',
  'verificationToken',
]);

/**
 * Check if a table should skip audit
 *
 * @param tableName Table name to check
 * @returns true if audit should be skipped
 */
export function shouldSkipAudit(tableName: string): boolean {
  // CRITICAL: Skip 'unknown' to prevent audit loops when table name extraction fails
  if (tableName === 'unknown') {
    return true;
  }
  return SKIP_AUDIT_TABLES.has(tableName.toLowerCase());
}

// ============================================================
// Sensitive Fields (Automatic Redaction)
// ============================================================

/**
 * Fields that should be redacted in audit logs
 *
 * These fields will be replaced with '[REDACTED]' to prevent
 * sensitive data from appearing in audit logs.
 */
export const SENSITIVE_FIELDS = new Set([
  // Passwords
  'password',
  'passwordHash',
  'password_hash',
  'hashedPassword',
  'hashed_password',

  // Tokens and secrets
  'token',
  'secret',
  'apiKey',
  'api_key',
  'apiSecret',
  'api_secret',

  // Keys
  'privateKey',
  'private_key',
  'secretKey',
  'secret_key',
  'encryptionKey',
  'encryption_key',

  // OAuth tokens
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'idToken',
  'id_token',

  // Other sensitive data
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'ssn',
  'socialSecurityNumber',
]);

/**
 * The redaction placeholder
 */
export const REDACTED_VALUE = '[REDACTED]';

/**
 * Redact sensitive fields from an object
 *
 * Creates a shallow copy with sensitive fields replaced.
 * Does not mutate the original object.
 *
 * @param data Object to redact
 * @returns New object with sensitive fields redacted
 *
 * @example
 * ```typescript
 * const user = { name: 'John', password: 'secret123' };
 * const safe = redactSensitiveFields(user);
 * // { name: 'John', password: '[REDACTED]' }
 * ```
 */
export function redactSensitiveFields<T extends Record<string, unknown>>(
  data: T | null | undefined
): T | null | undefined {
  if (data === null || data === undefined) {
    return data;
  }

  const result = { ...data };

  for (const key of Object.keys(result)) {
    if (SENSITIVE_FIELDS.has(key)) {
      (result as Record<string, unknown>)[key] = REDACTED_VALUE;
    }
  }

  return result;
}

/**
 * Check if a field name is sensitive
 *
 * @param fieldName Field name to check
 * @returns true if the field is sensitive
 */
export function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_FIELDS.has(fieldName);
}

// ============================================================
// Table Name Extraction
// ============================================================

/**
 * Get table name from a Drizzle table object
 *
 * Drizzle stores table metadata in various ways depending on version.
 * This function handles multiple patterns.
 *
 * @param table Drizzle table object
 * @returns Table name string
 */
export function getTableName(table: unknown): string {
  if (!table || typeof table !== 'object') {
    return 'unknown';
  }

  const t = table as Record<string | symbol, unknown>;

  // Method 1: Check Symbol(drizzle:Name)
  const symbols = Object.getOwnPropertySymbols(t);
  for (const sym of symbols) {
    if (sym.toString().includes('Name') || sym.toString().includes('name')) {
      const value = t[sym];
      if (typeof value === 'string') {
        return value;
      }
    }
  }

  // Method 2: Check _.name property (common in Drizzle)
  if (typeof t['_'] === 'object' && t['_'] !== null) {
    const meta = t['_'] as Record<string, unknown>;
    if (typeof meta['name'] === 'string') {
      return meta['name'];
    }
  }

  // Method 3: Check direct name property
  if (typeof t['name'] === 'string') {
    return t['name'];
  }

  // Method 4: Check tableName property
  if (typeof t['tableName'] === 'string') {
    return t['tableName'];
  }

  return 'unknown';
}

// ============================================================
// Layer 1 Action Names
// ============================================================

/**
 * Infrastructure audit action names (Layer 1)
 */
export const INFRASTRUCTURE_ACTIONS = {
  INSERT: 'DB_INSERT',
  UPDATE: 'DB_UPDATE',
  DELETE: 'DB_DELETE',
} as const;

export type InfrastructureAction = typeof INFRASTRUCTURE_ACTIONS[keyof typeof INFRASTRUCTURE_ACTIONS];
