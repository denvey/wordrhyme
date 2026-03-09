/**
 * Billing Drift Detection
 *
 * Billing-specific projection of the unified route drift engine.
 */
import {
  clearRouteDriftReport,
  getAllRouteDriftReports,
  getLatestRouteDriftReport,
  snapshotPluginRoutes,
  type L2ModuleDefaultChecker,
  type RouteDriftReport,
  type RouteProcedureSnapshot,
} from '../trpc/route-drift';

export interface ProcedureSnapshot {
  path: string;
  billingSubject: string | null;
}

export interface BillingDriftReport {
  pluginId: string;
  timestamp: Date;
  removed: Array<{ path: string }>;
  added: Array<{
    path: string;
    billingSubject: string | null;
  }>;
  changed: Array<{
    path: string;
    oldSubject: string | null;
    newSubject: string | null;
  }>;
  hasL2SafetyNet: boolean;
  hasDrift: boolean;
}

const _billingProjectionReports = new Map<string, BillingDriftReport>();

function toBillingSnapshot(snapshot: RouteProcedureSnapshot): ProcedureSnapshot {
  return {
    path: snapshot.path,
    billingSubject: snapshot.billingSubject,
  };
}

function toBillingReport(report: RouteDriftReport): BillingDriftReport {
  return {
    pluginId: report.pluginId,
    timestamp: report.timestamp,
    removed: report.removed,
    added: report.added.map((item) => ({
      path: item.path,
      billingSubject: item.billingSubject,
    })),
    changed: report.billingChanged,
    hasL2SafetyNet: report.hasL2SafetyNet,
    hasDrift: report.hasDrift,
  };
}

export function getLatestDriftReport(pluginId: string): BillingDriftReport | null {
  const report = getLatestRouteDriftReport(pluginId);
  return report ? toBillingReport(report) : (_billingProjectionReports.get(pluginId) ?? null);
}

export function getAllDriftReports(): BillingDriftReport[] {
  const merged = new Map<string, BillingDriftReport>();
  for (const report of getAllRouteDriftReports()) {
    merged.set(report.pluginId, toBillingReport(report));
  }
  for (const [pluginId, report] of _billingProjectionReports) {
    if (!merged.has(pluginId)) {
      merged.set(pluginId, report);
    }
  }
  return Array.from(merged.values());
}

export function clearDriftReport(pluginId: string): void {
  clearRouteDriftReport(pluginId);
  _billingProjectionReports.delete(pluginId);
}

export function snapshotPluginProcedures(normalizedPluginId: string): ProcedureSnapshot[] {
  return snapshotPluginRoutes(normalizedPluginId).map(toBillingSnapshot);
}

export function detectBillingDrift(
  normalizedPluginId: string,
  oldSnapshot: ProcedureSnapshot[],
  getL2Default: L2ModuleDefaultChecker,
): BillingDriftReport {
  const newSnapshot = snapshotPluginRoutes(normalizedPluginId);
  const oldPaths = new Map(oldSnapshot.map(s => [s.path, s]));
  const newPaths = new Map(newSnapshot.map(s => [s.path, s]));

  const removed: BillingDriftReport['removed'] = [];
  for (const [path] of oldPaths) {
    if (!newPaths.has(path)) {
      removed.push({ path });
    }
  }

  const added: BillingDriftReport['added'] = [];
  for (const [path, entry] of newPaths) {
    if (!oldPaths.has(path)) {
      added.push({ path, billingSubject: entry.billingSubject });
    }
  }

  const changed: BillingDriftReport['changed'] = [];
  for (const [path, newEntry] of newPaths) {
    const oldEntry = oldPaths.get(path);
    if (oldEntry && oldEntry.billingSubject !== newEntry.billingSubject) {
      changed.push({
        path,
        oldSubject: oldEntry.billingSubject,
        newSubject: newEntry.billingSubject,
      });
    }
  }

  const report: BillingDriftReport = {
    pluginId: normalizedPluginId,
    timestamp: new Date(),
    removed,
    added,
    changed,
    hasL2SafetyNet: getL2Default(normalizedPluginId) !== null,
    hasDrift: removed.length > 0 || added.length > 0 || changed.length > 0,
  };

  if (report.hasDrift) {
    _billingProjectionReports.set(normalizedPluginId, report);
  } else {
    _billingProjectionReports.delete(normalizedPluginId);
  }

  return report;
}
