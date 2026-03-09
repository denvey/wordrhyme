import { router } from "./trpc";
import { isPermissionRegistryReady, rebuildPermissionRegistry } from "./permission-registry";
import {
  detectRouteDrift,
  snapshotPluginRoutes,
} from "./route-drift";
import {
  isBillingGuardReady,
  getL2ModuleDefault,
} from "../billing/billing-guard";
import { pluginRouter } from "./routers/plugin";
import { menuRouter } from "./routers/menu";
import { rolesRouter } from "./routers/roles";
import { permissionsRouter } from "./routers/permissions";
import { notificationRouter } from "./routers/notifications";
import { notificationPreferencesRouter } from "./routers/notification-preferences";
import { notificationTemplatesRouter } from "./routers/notification-templates";
import { settingsRouter } from "./routers/settings";
import { featureFlagsRouter } from "./routers/feature-flags";
import { mediaRouter } from "./routers/media";
import { cacheRouter } from "./routers/cache";
import { auditRouter } from "./routers/audit";
import { pluginDebugRouter } from "./routers/plugin-debug";
import { pluginHealthRouter } from "./routers/plugin-health";
import { webhookRouter } from "../webhooks/webhook.router.js";
import { schedulerRouter } from "./routers/scheduler";
import { hooksRouter } from "./routers/hooks";
import { apiTokensRouter } from "./routers/api-tokens";
import { billingRouter } from "./routers/billing";
import { organizationRouter } from "./routers/organization";
import { i18nRouter } from "./routers/i18n";
import { currencyRouter } from "./routers/currency";
import { oauthSettingsRouter } from "./routers/oauth-settings";
import { permissionConfigRouter } from "./routers/permission-config";
import { storageRouter } from "./routers/storage";
import { infraPolicyRouter } from "./routers/infra-policy";

const coreRoutes = {
  plugin: pluginRouter,
  menu: menuRouter,
  roles: rolesRouter,
  permissions: permissionsRouter,
  notification: notificationRouter,
  notificationPreferences: notificationPreferencesRouter,
  notificationTemplates: notificationTemplatesRouter,
  settings: settingsRouter,
  featureFlags: featureFlagsRouter,
  media: mediaRouter,
  cache: cacheRouter,
  audit: auditRouter,
  pluginDebug: pluginDebugRouter,
  pluginHealth: pluginHealthRouter,
  webhook: webhookRouter,
  scheduler: schedulerRouter,
  hooks: hooksRouter,
  apiTokens: apiTokensRouter,
  billing: billingRouter,
  organization: organizationRouter,
  i18n: i18nRouter,
  currency: currencyRouter,
  oauthSettings: oauthSettingsRouter,
  permissionConfig: permissionConfigRouter,
  storage: storageRouter,
  infraPolicy: infraPolicyRouter,
};

/**
 * Core Router (static routes)
 */
const coreRouter = router(coreRoutes);

/**
 * Plugin Routers (dynamically merged)
 * Key: pluginId (e.g., "hello-world")
 * Value: plugin's tRPC router
 */
const pluginRouters = new Map<string, any>();

/**
 * Bidirectional mapping: normalizedId ↔ original pluginId
 * e.g., "storage-s3" ↔ "com.wordrhyme.storage-s3"
 */
const normalizedToOriginal = new Map<string, string>();

/**
 * Current App Router (rebuilt when plugins change)
 */
let _appRouter: any = coreRouter;

/**
 * Get current app router
 */
export function getAppRouter() {
  return _appRouter;
}

/**
 * Register plugin router
 *
 * Called by PluginManager when loading a plugin.
 * Plugin routes will be available at: /trpc/pluginApis.{pluginId}.{procedure}
 * Example: /trpc/pluginApis.hello-world.sayHello
 *
 * Note: We use pluginApis instead of plugin to avoid conflicts with plugin.list etc.
 */
export function registerPluginRouter(
  pluginId: string,
  pluginRouterInstance: any,
) {
  // Normalize pluginId: "com.wordrhyme.hello-world" -> "hello-world"
  const normalizedId = pluginId
    .replace(/^com\.wordrhyme\./, "")
    .replace(/\./g, "-");

  // Snapshot current procedures for billing drift detection
  const routeSnapshot = isPermissionRegistryReady()
    ? snapshotPluginRoutes(normalizedId)
    : [];

  pluginRouters.set(normalizedId, pluginRouterInstance);
  normalizedToOriginal.set(normalizedId, pluginId);
  _appRouter = rebuildAppRouter();
  // Rebuild permission registry to include new plugin procedures
  if (isPermissionRegistryReady()) {
    rebuildPermissionRegistry(_appRouter);

    // Billing drift detection (only when billing guard is ready)
    if (isBillingGuardReady() && routeSnapshot.length > 0) {
      detectRouteDrift(
        normalizedId,
        routeSnapshot,
        getL2ModuleDefault,
      );
    }
  }
  console.log(
    `[tRPC] Plugin router registered: ${normalizedId} (original: ${pluginId})`,
  );
  console.log(
    `[tRPC] Available plugin routes: ${Array.from(pluginRouters.keys()).join(", ")}`,
  );
}

/**
 * Unregister plugin router
 *
 * Called by PluginManager when unloading a plugin.
 */
export function unregisterPluginRouter(pluginId: string) {
  const normalizedId = pluginId
    .replace(/^com\.wordrhyme\./, "")
    .replace(/\./g, "-");

  // Snapshot current procedures for billing drift detection
  const routeSnapshot = isPermissionRegistryReady()
    ? snapshotPluginRoutes(normalizedId)
    : [];

  pluginRouters.delete(normalizedId);
  normalizedToOriginal.delete(normalizedId);
  _appRouter = rebuildAppRouter();
  // Rebuild permission registry to remove unloaded plugin procedures
  if (isPermissionRegistryReady()) {
    rebuildPermissionRegistry(_appRouter);

    // Billing drift detection — all procedures removed
    if (isBillingGuardReady() && routeSnapshot.length > 0) {
      detectRouteDrift(
        normalizedId,
        routeSnapshot,
        getL2ModuleDefault,
      );
    }
  }
  console.log(`[tRPC] Plugin router unregistered: ${normalizedId}`);
}

/**
 * Resolve normalizedId back to original pluginId
 * e.g., "storage-s3" → "com.wordrhyme.storage-s3"
 */
export function resolvePluginId(normalizedId: string): string | undefined {
  return normalizedToOriginal.get(normalizedId);
}

/**
 * Rebuild app router by merging core + all plugins
 *
 * Structure:
 * - /trpc/plugin.list (core plugin management routes)
 * - /trpc/pluginApis.hello-world.sayHello (plugin-specific routes)
 *
 * MVP: Put all plugin routers under 'pluginApis' namespace to avoid conflicts
 */
function rebuildAppRouter() {
  // If no plugins, just return core router
  if (pluginRouters.size === 0) {
    return coreRouter;
  }

  // Build plugin routes object
  const pluginApiRoutes: Record<string, any> = {};
  for (const [pluginId, pluginRouterInstance] of pluginRouters) {
    pluginApiRoutes[pluginId] = pluginRouterInstance;
  }

  // Create pluginApis router with all plugin routers
  const pluginApisRouter = router(pluginApiRoutes);

  return router({
    ...coreRoutes,
    // All plugin-specific APIs under pluginApis namespace
    pluginApis: pluginApisRouter,
  });
}

/**
 * Export type for client
 * Using coreRouter type directly for stable type inference
 */
export type AppRouter = typeof coreRouter;
