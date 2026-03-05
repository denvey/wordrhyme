/**
 * Permission Template — Batch Configuration Tool
 *
 * Templates are optional convenience tools for bulk initialization.
 * "Apply template" = batch-write rbac.override.* / billing.override.* Settings entries.
 * Templates do NOT participate in runtime — once applied, entries are admin overrides (Priority 1).
 *
 * @see docs/architecture/PERMISSION_GOVERNANCE.md
 */

import type { SettingsService } from '../settings/settings.service';
import {
  getPermissionRegistry,
  isPermissionRegistryReady,
  setRbacOverride,
  getRbacOverride,
  type PermissionRegistryEntry,
} from './permission-registry';

// ─── Types ───

export interface ProcedureTemplateRule {
  match: {
    /** Glob-like path pattern (e.g., 'currency.policy.*', 'media.*') */
    path?: string;
    /** Exact procedure name (e.g., 'switchToCustom') */
    name?: string;
    /** Procedure type filter */
    type?: 'query' | 'mutation';
  };
  /** RBAC permission override */
  permission?: {
    action: string;
    subject: string;
  };
  /** Billing subject override */
  billing?: {
    subject: string;
  };
}

export interface UnifiedModuleTemplate {
  id: string;
  name: string;
  description: string;
  /** Module-level configuration (Infra Policy + RBAC + Billing) */
  modules: Record<string, {
    infraPolicy?: 'unified' | 'allow_override' | 'require_tenant';
    rbac?: { subject: string };
    billing?: { subject: string };
  }>;
  /** Procedure-level overrides (RBAC + Billing) */
  procedures?: ProcedureTemplateRule[];
}

export interface TemplateApplyReport {
  templateId: string;
  mode: 'dry-run' | 'apply';
  modules: {
    applied: string[];
    skipped: { module: string; field: string; reason: string }[];
  };
  procedures: {
    applied: string[];
    skipped: { path: string; reason: string }[];
  };
}

// ─── Built-in Templates ───

const BUILT_IN_TEMPLATES: UnifiedModuleTemplate[] = [
  {
    id: 'standard-saas',
    name: '标准 SaaS 模板',
    description: '适用于标准 SaaS 应用。平台统一管理基础数据（货币、存储），租户可自定义内容。',
    modules: {
      currency: { infraPolicy: 'allow_override', rbac: { subject: 'Currency' } },
      media: { rbac: { subject: 'Media' } },
      content: { rbac: { subject: 'Content' } },
    },
    procedures: [
      {
        match: { name: 'switchToCustom', type: 'mutation' },
        permission: { action: 'manage', subject: 'InfraPolicy' },
      },
      {
        match: { name: 'resetToPlatform', type: 'mutation' },
        permission: { action: 'manage', subject: 'InfraPolicy' },
      },
    ],
  },
  {
    id: 'strict-enterprise',
    name: '严格企业模板',
    description: '适用于企业场景。所有未配置的 mutation 被阻断，要求显式授权。',
    modules: {
      currency: { infraPolicy: 'unified', rbac: { subject: 'Currency' } },
      media: { rbac: { subject: 'Media' } },
    },
    procedures: [
      {
        match: { type: 'mutation' },
        permission: { action: 'manage', subject: 'System' },
      },
    ],
  },
];

// ─── Template Registry ───

const _templateMap = new Map<string, UnifiedModuleTemplate>(
  BUILT_IN_TEMPLATES.map(t => [t.id, t])
);

export function getTemplate(id: string): UnifiedModuleTemplate | undefined {
  return _templateMap.get(id);
}

export function listTemplates(): UnifiedModuleTemplate[] {
  return [..._templateMap.values()];
}

// ─── Rule Matching ───

/**
 * Check if a registry entry matches a template rule.
 * Supports glob-like path patterns with trailing wildcard (*).
 */
export function matchRule(
  match: ProcedureTemplateRule['match'],
  entry: PermissionRegistryEntry,
): boolean {
  if (match.type && entry.type !== match.type) return false;
  if (match.name && entry.name !== match.name) return false;
  if (match.path) {
    if (match.path.endsWith('.*')) {
      const prefix = match.path.slice(0, -2);
      if (!entry.path.startsWith(prefix + '.') && entry.path !== prefix) return false;
    } else if (entry.path !== match.path) {
      return false;
    }
  }
  return true;
}

// ─── Template Application ───

/**
 * Apply a unified module template.
 *
 * Writes module-level and procedure-level overrides to Settings.
 * Supports dry-run mode for previewing changes.
 *
 * Skips entries that already have admin overrides (respects existing config).
 */
export async function applyUnifiedTemplate(
  templateId: string,
  settingsService: SettingsService,
  mode: 'dry-run' | 'apply' = 'dry-run',
): Promise<TemplateApplyReport> {
  const template = _templateMap.get(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  if (!isPermissionRegistryReady()) {
    throw new Error('Permission registry not initialized');
  }

  const registry = getPermissionRegistry();
  const report: TemplateApplyReport = {
    templateId,
    mode,
    modules: { applied: [], skipped: [] },
    procedures: { applied: [], skipped: [] },
  };

  // 1. Module-level: write flat keys for each subsystem
  for (const [moduleName, config] of Object.entries(template.modules)) {
    if (config.infraPolicy) {
      const existing = await settingsService.get('global', `infra.policy.${moduleName}`);
      if (existing) {
        report.modules.skipped.push({ module: moduleName, field: 'infraPolicy', reason: 'existing' });
      } else {
        if (mode === 'apply') {
          await settingsService.set('global', `infra.policy.${moduleName}`, config.infraPolicy);
        }
        report.modules.applied.push(moduleName);
      }
    }
    if (config.rbac) {
      const existing = await settingsService.get('global', `rbac.module.${moduleName}.subject`);
      if (existing) {
        report.modules.skipped.push({ module: moduleName, field: 'rbac', reason: 'existing' });
      } else {
        if (mode === 'apply') {
          await settingsService.set('global', `rbac.module.${moduleName}.subject`, config.rbac.subject);
        }
        if (!report.modules.applied.includes(moduleName)) {
          report.modules.applied.push(moduleName);
        }
      }
    }
    if (config.billing) {
      const existing = await settingsService.get('global', `billing.module.${moduleName}.subject`);
      if (existing) {
        report.modules.skipped.push({ module: moduleName, field: 'billing', reason: 'existing' });
      } else {
        if (mode === 'apply') {
          await settingsService.set('global', `billing.module.${moduleName}.subject`, config.billing.subject);
        }
        if (!report.modules.applied.includes(moduleName)) {
          report.modules.applied.push(moduleName);
        }
      }
    }
  }

  // 2. Procedure-level: write RBAC + Billing overrides
  if (template.procedures) {
    for (const [path, entry] of registry) {
      const matchedRule = template.procedures.find(r => matchRule(r.match, entry));
      if (!matchedRule) continue;

      // Skip procedures that already have admin overrides
      const existingOverride = getRbacOverride(path);
      if (existingOverride) {
        report.procedures.skipped.push({ path, reason: 'admin-override' });
        continue;
      }

      if (mode === 'apply') {
        if (matchedRule.permission) {
          await setRbacOverride(path, matchedRule.permission);
        }
        if (matchedRule.billing) {
          await settingsService.set('global', `billing.override.${path}`, matchedRule.billing.subject);
        }
      }
      report.procedures.applied.push(path);
    }
  }

  return report;
}
