import {
  getPermissionRegistry,
  isPermissionRegistryReady,
  type PermissionRegistryEntry,
} from './permission-registry';

export interface RouteProcedureSnapshot {
  path: string;
  billingSubject: string | null;
  permissionAction: string;
  permissionSubject: string;
}

export interface RouteDriftReport {
  pluginId: string;
  timestamp: Date;
  removed: Array<{ path: string }>;
  added: Array<{
    path: string;
    billingSubject: string | null;
    permissionAction: string;
    permissionSubject: string;
  }>;
  billingChanged: Array<{
    path: string;
    oldSubject: string | null;
    newSubject: string | null;
  }>;
  permissionChanged: Array<{
    path: string;
    oldAction: string;
    newAction: string;
    oldSubject: string;
    newSubject: string;
  }>;
  hasL2SafetyNet: boolean;
  hasDrift: boolean;
}

export type L2ModuleDefaultChecker = (pluginId: string) => string | null;

const _latestReports = new Map<string, RouteDriftReport>();

function toSnapshot(path: string, entry: PermissionRegistryEntry): RouteProcedureSnapshot {
  return {
    path,
    billingSubject: entry.billingSubject,
    permissionAction: entry.permission.action,
    permissionSubject: entry.permission.subject,
  };
}

export function snapshotPluginRoutes(normalizedPluginId: string): RouteProcedureSnapshot[] {
  if (!isPermissionRegistryReady()) return [];

  const prefix = `pluginApis.${normalizedPluginId}.`;
  const registry = getPermissionRegistry();
  const snapshot: RouteProcedureSnapshot[] = [];

  for (const [path, entry] of registry.entries()) {
    if (!path.startsWith(prefix)) continue;
    snapshot.push(toSnapshot(path, entry));
  }

  return snapshot;
}

export function detectRouteDrift(
  normalizedPluginId: string,
  oldSnapshot: RouteProcedureSnapshot[],
  getL2Default: L2ModuleDefaultChecker,
): RouteDriftReport {
  const newSnapshot = snapshotPluginRoutes(normalizedPluginId);

  const oldPaths = new Map(oldSnapshot.map(s => [s.path, s]));
  const newPaths = new Map(newSnapshot.map(s => [s.path, s]));

  const removed: RouteDriftReport['removed'] = [];
  for (const [path] of oldPaths) {
    if (!newPaths.has(path)) {
      removed.push({ path });
    }
  }

  const added: RouteDriftReport['added'] = [];
  for (const [path, entry] of newPaths) {
    if (!oldPaths.has(path)) {
      added.push({
        path,
        billingSubject: entry.billingSubject,
        permissionAction: entry.permissionAction,
        permissionSubject: entry.permissionSubject,
      });
    }
  }

  const billingChanged: RouteDriftReport['billingChanged'] = [];
  const permissionChanged: RouteDriftReport['permissionChanged'] = [];

  for (const [path, newEntry] of newPaths) {
    const oldEntry = oldPaths.get(path);
    if (!oldEntry) continue;

    if (oldEntry.billingSubject !== newEntry.billingSubject) {
      billingChanged.push({
        path,
        oldSubject: oldEntry.billingSubject,
        newSubject: newEntry.billingSubject,
      });
    }

    if (
      oldEntry.permissionAction !== newEntry.permissionAction ||
      oldEntry.permissionSubject !== newEntry.permissionSubject
    ) {
      permissionChanged.push({
        path,
        oldAction: oldEntry.permissionAction,
        newAction: newEntry.permissionAction,
        oldSubject: oldEntry.permissionSubject,
        newSubject: newEntry.permissionSubject,
      });
    }
  }

  const hasL2SafetyNet = getL2Default(normalizedPluginId) !== null;
  const hasDrift =
    removed.length > 0 ||
    added.length > 0 ||
    billingChanged.length > 0 ||
    permissionChanged.length > 0;

  const report: RouteDriftReport = {
    pluginId: normalizedPluginId,
    timestamp: new Date(),
    removed,
    added,
    billingChanged,
    permissionChanged,
    hasL2SafetyNet,
    hasDrift,
  };

  if (hasDrift) {
    _latestReports.set(normalizedPluginId, report);
    logRouteDriftReport(report);
  } else {
    _latestReports.delete(normalizedPluginId);
  }

  return report;
}

export function getLatestRouteDriftReport(pluginId: string): RouteDriftReport | null {
  return _latestReports.get(pluginId) ?? null;
}

export function getAllRouteDriftReports(): RouteDriftReport[] {
  return Array.from(_latestReports.values());
}

export function clearRouteDriftReport(pluginId: string): void {
  _latestReports.delete(pluginId);
}

function logRouteDriftReport(report: RouteDriftReport): void {
  const lines: string[] = [
    `[RouteDrift] Plugin "${report.pluginId}" route changes detected:`,
  ];

  if (report.removed.length > 0) {
    lines.push(`  Removed (${report.removed.length}):`);
    for (const r of report.removed) {
      lines.push(`    - ${r.path}`);
    }
  }

  if (report.added.length > 0) {
    lines.push(`  Added (${report.added.length}):`);
    for (const a of report.added) {
      const billing = a.billingSubject ? `billing=${a.billingSubject}` : 'billing=(none)';
      lines.push(`    + ${a.path} (${billing}, permission=${a.permissionSubject}.${a.permissionAction})`);
    }
  }

  if (report.billingChanged.length > 0) {
    lines.push(`  Billing Changed (${report.billingChanged.length}):`);
    for (const c of report.billingChanged) {
      lines.push(`    ~ ${c.path}: ${c.oldSubject ?? '(none)'} → ${c.newSubject ?? '(none)'}`);
    }
  }

  if (report.permissionChanged.length > 0) {
    lines.push(`  Permission Changed (${report.permissionChanged.length}):`);
    for (const c of report.permissionChanged) {
      lines.push(`    ~ ${c.path}: ${c.oldSubject}.${c.oldAction} → ${c.newSubject}.${c.newAction}`);
    }
  }

  if (report.hasL2SafetyNet) {
    lines.push('  ✅ L2 module default configured — no revenue leakage risk');
  } else {
    lines.push('  ⚠️  No L2 module default — undeclared routes will be denied');
  }

  console.warn(lines.join('\n'));
}
