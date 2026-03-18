/**
 * Schema Registry Service
 *
 * Manages JSON Schema definitions for settings validation.
 * Supports wildcard patterns for matching multiple keys.
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { db } from '../db/index.js';
import {
  settingSchemas,
  type SettingSchema,
  type InsertSettingSchema,
} from '@wordrhyme/db';

/**
 * Schema registration input
 */
export interface RegisterSchemaInput {
  keyPattern: string;
  schema: Record<string, unknown>;
  version?: number;
  defaultValue?: unknown;
  description?: string;
}

/**
 * Schema match result
 */
export interface SchemaMatch {
  schema: SettingSchema;
  validate: ValidateFunction;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[] | undefined;
  schemaVersion?: number | undefined;
}

@Injectable()
export class SchemaRegistryService implements OnModuleInit {
  private ajv: Ajv;
  private schemaCache: Map<string, SchemaMatch> = new Map();
  private allSchemas: SettingSchema[] = [];

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      coerceTypes: true,
    });
    addFormats(this.ajv);
  }

  async onModuleInit() {
    await this.loadSchemas();
  }

  /**
   * Load all schemas from database into memory
   */
  async loadSchemas(): Promise<void> {
    this.allSchemas = await db
      .select()
      .from(settingSchemas)
      .where(eq(settingSchemas.deprecated, false))
      .orderBy(desc(settingSchemas.version));

    // Clear cache when reloading
    this.schemaCache.clear();
  }

  /**
   * Register a new schema
   */
  async register(input: RegisterSchemaInput): Promise<SettingSchema> {
    const existing = await db
      .select()
      .from(settingSchemas)
      .where(
        and(
          eq(settingSchemas.keyPattern, input.keyPattern),
          eq(settingSchemas.version, input.version ?? 1)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing schema
      const [updated] = await db
        .update(settingSchemas)
        .set({
          schema: input.schema,
          defaultValue: input.defaultValue,
          description: input.description,
        })
        .where(eq(settingSchemas.id, existing[0]!.id))
        .returning();

      await this.loadSchemas();
      return updated!;
    }

    // Insert new schema
    const data: InsertSettingSchema = {
      keyPattern: input.keyPattern,
      schema: input.schema,
      version: input.version ?? 1,
      defaultValue: input.defaultValue,
      description: input.description,
    };

    const [schema] = await db.insert(settingSchemas).values(data).returning();

    await this.loadSchemas();
    return schema!;
  }

  /**
   * Deprecate a schema (soft delete)
   */
  async deprecate(keyPattern: string, version?: number): Promise<boolean> {
    const conditions = [eq(settingSchemas.keyPattern, keyPattern)];
    if (version !== undefined) {
      conditions.push(eq(settingSchemas.version, version));
    }

    const result = await db
      .update(settingSchemas)
      .set({ deprecated: true })
      .where(and(...conditions))
      .returning({ id: settingSchemas.id });

    await this.loadSchemas();
    return result.length > 0;
  }

  /**
   * Find schema for a given key
   *
   * Resolution order:
   * 1. Exact match (highest priority)
   * 2. Wildcard match (most specific pattern wins)
   */
  findSchema(key: string): SchemaMatch | null {
    // Check cache first
    const cached = this.schemaCache.get(key);
    if (cached) return cached;

    // 1. Exact match
    const exact = this.allSchemas.find(
      (s) => s.keyPattern === key && !s.deprecated
    );
    if (exact) {
      const match = this.createSchemaMatch(exact);
      this.schemaCache.set(key, match);
      return match;
    }

    // 2. Wildcard match (most specific wins)
    const wildcardMatches = this.allSchemas
      .filter((s) => !s.deprecated && this.matchWildcard(s.keyPattern, key))
      .sort((a, b) => this.specificity(b.keyPattern) - this.specificity(a.keyPattern));

    if (wildcardMatches.length > 0) {
      const match = this.createSchemaMatch(wildcardMatches[0]!);
      this.schemaCache.set(key, match);
      return match;
    }

    return null;
  }

  /**
   * Validate a value against the schema for a given key
   */
  validate(key: string, value: unknown): ValidationResult {
    const match = this.findSchema(key);

    if (!match) {
      // No schema defined, allow any value
      return { valid: true };
    }

    const valid = match.validate(value);

    if (!valid) {
      return {
        valid: false,
        errors: match.validate.errors?.map(
          (e) => `${e.instancePath} ${e.message}`
        ),
        schemaVersion: match.schema.version,
      };
    }

    return {
      valid: true,
      schemaVersion: match.schema.version,
    };
  }

  /**
   * Get default value for a key from its schema
   */
  getDefault(key: string): unknown {
    const match = this.findSchema(key);
    return match?.schema.defaultValue ?? null;
  }

  /**
   * Get schema version for a key
   */
  getSchemaVersion(key: string): number {
    const match = this.findSchema(key);
    return match?.schema.version ?? 1;
  }

  /**
   * List all registered schemas
   */
  async list(options?: {
    includeDeprecated?: boolean;
  }): Promise<SettingSchema[]> {
    if (options?.includeDeprecated) {
      return db.select().from(settingSchemas).orderBy(desc(settingSchemas.version));
    }
    return this.allSchemas;
  }

  /**
   * Create a SchemaMatch with compiled validator
   */
  private createSchemaMatch(schema: SettingSchema): SchemaMatch {
    const schemaId = `${schema.keyPattern}:${schema.version}`;
    let validate = this.ajv.getSchema(schemaId);

    if (!validate) {
      this.ajv.addSchema(schema.schema, schemaId);
      validate = this.ajv.getSchema(schemaId);
    }

    return {
      schema,
      validate: validate as ValidateFunction,
    };
  }

  /**
   * Match a wildcard pattern against a key
   *
   * Supported patterns:
   * - "*" matches any single segment
   * - "**" matches any number of segments
   * - "email.*" matches "email.smtp", "email.from"
   * - "plugin:*:api_key" matches "plugin:my-plugin:api_key"
   */
  private matchWildcard(pattern: string, key: string): boolean {
    // Determine separator (supports both . and :)
    const separator = pattern.includes(':') ? ':' : '.';
    const patternParts = pattern.split(separator);
    const keyParts = key.split(separator);

    return this.matchParts(patternParts, keyParts);
  }

  /**
   * Recursive pattern matching for wildcard segments
   */
  private matchParts(pattern: string[], key: string[]): boolean {
    let pi = 0;
    let ki = 0;

    while (pi < pattern.length && ki < key.length) {
      const p = pattern[pi];

      if (p === '**') {
        // ** matches zero or more segments
        // Try matching rest of pattern with remaining key parts
        for (let i = ki; i <= key.length; i++) {
          if (this.matchParts(pattern.slice(pi + 1), key.slice(i))) {
            return true;
          }
        }
        return false;
      }

      if (p === '*') {
        // * matches exactly one segment
        pi++;
        ki++;
        continue;
      }

      if (p !== key[ki]) {
        return false;
      }

      pi++;
      ki++;
    }

    // Check if both exhausted
    return pi === pattern.length && ki === key.length;
  }

  /**
   * Calculate pattern specificity (more segments = more specific)
   *
   * Non-wildcard segments have higher weight than wildcards.
   */
  private specificity(pattern: string): number {
    const separator = pattern.includes(':') ? ':' : '.';
    const parts = pattern.split(separator);

    let score = 0;
    for (const part of parts) {
      if (part === '**') {
        score += 1; // Least specific
      } else if (part === '*') {
        score += 10; // More specific than **
      } else {
        score += 100; // Most specific (exact match)
      }
    }

    return score;
  }

  /**
   * Clear schema cache (useful for testing)
   */
  clearCache(): void {
    this.schemaCache.clear();
  }
}
