#!/usr/bin/env python3
"""
Batch recover files from Antigravity IDE Timeline history.

Usage:
  python3 scripts/recover-from-timeline.py             # Preview (dry-run, default)
  python3 scripts/recover-from-timeline.py --apply      # Actually recover files
  python3 scripts/recover-from-timeline.py --list-all   # Show all project files in Timeline
"""

import json
import os
import shutil
import sys
from pathlib import Path
from datetime import datetime
from urllib.parse import unquote

# Configuration
HISTORY_DIR = Path(os.path.expanduser(
    "~/Library/Application Support/Antigravity/User/History"
))
PROJECT_ROOT = Path("/Users/denvey/Workspace/Coding/Personal/wordrhyme")

# Cutoff: only recover versions saved BEFORE the git reset --hard
# The reset happened around 2026-02-11 ~17:30 CST (UTC+8)
# Use the latest version saved before this timestamp
# 2026-02-11 17:30:00 CST = 2026-02-11 09:30:00 UTC
RESET_TIMESTAMP_MS = int(datetime(2026, 2, 11, 17, 30, 0).timestamp() * 1000)

# Files we know were lost (M type - modified but changes destroyed)
LOST_FILES = [
    # apps/admin
    "apps/admin/package.json",
    "apps/admin/rsbuild.config.ts",
    "apps/admin/src/App.tsx",
    "apps/admin/src/bootstrap.tsx",
    "apps/admin/src/components/Layout.tsx",
    "apps/admin/src/components/PluginSidebarExtensions.tsx",
    "apps/admin/src/components/audit-logs/index.ts",
    "apps/admin/src/components/nav-main.tsx",
    "apps/admin/src/hooks/useMenus.ts",
    "apps/admin/src/index.css",
    "apps/admin/src/lib/ability.tsx",
    "apps/admin/src/lib/auth-client.ts",
    "apps/admin/src/lib/auth.tsx",
    "apps/admin/src/pages/AuditLogs.tsx",
    "apps/admin/src/pages/Files.tsx",
    "apps/admin/src/pages/Login.tsx",
    "apps/admin/src/pages/Members.tsx",
    "apps/admin/src/pages/Menus.tsx",
    "apps/admin/src/pages/RoleDetail.tsx",
    "apps/admin/src/pages/Settings.tsx",
    # apps/server - core
    "apps/server/package.json",
    "apps/server/tsconfig.json",
    "apps/server/src/app.module.ts",
    "apps/server/src/config/env.ts",
    "apps/server/src/main.ts",
    "apps/server/src/context/async-local-storage.ts",
    # apps/server - db
    "apps/server/src/db/client.ts",
    "apps/server/src/db/index.ts",
    "apps/server/src/db/schema/definitions.ts",
    "apps/server/src/db/schema/index.ts",
    "apps/server/src/db/schema/plugin-schemas.ts",
    "apps/server/src/db/scoped-db.ts",
    "apps/server/src/db/seed.ts",
    "apps/server/src/db/seed/check-menu-org-ids.ts",
    "apps/server/src/db/seed/seed-roles.ts",
    "apps/server/src/db/seed/sync-menus-visibility.ts",
    # apps/server - auth
    "apps/server/src/auth/auth.ts",
    "apps/server/src/auth/index.ts",
    "apps/server/src/auth/guards/guard-audit.service.ts",
    "apps/server/src/auth/guards/membership.service.ts",
    "apps/server/src/auth/guards/tenant-ban.service.ts",
    # apps/server - services
    "apps/server/src/services/menu.service.ts",
    "apps/server/src/asset/asset.service.ts",
    "apps/server/src/asset/image-processor.service.ts",
    "apps/server/src/audit/audit.service.ts",
    "apps/server/src/audit/audit.worker.ts",
    "apps/server/src/audit/index.ts",
    # apps/server - billing
    "apps/server/src/billing/events/billing.events.ts",
    "apps/server/src/billing/repos/billing.repo.ts",
    "apps/server/src/billing/repos/index.ts",
    "apps/server/src/billing/repos/quota.repo.ts",
    "apps/server/src/billing/repos/subscription.repo.ts",
    "apps/server/src/billing/repos/tenant-quota.repo.ts",
    "apps/server/src/billing/services/index.ts",
    "apps/server/src/billing/services/payment.service.ts",
    "apps/server/src/billing/services/quota.service.ts",
    "apps/server/src/billing/services/renewal.service.ts",
    "apps/server/src/billing/services/subscription.service.ts",
    "apps/server/src/billing/services/unified-usage.service.ts",
    "apps/server/src/billing/services/usage.service.ts",
    # apps/server - cache
    "apps/server/src/cache/cache-manager.ts",
    "apps/server/src/cache/cache-namespace.ts",
    "apps/server/src/cache/cache.module.ts",
    "apps/server/src/cache/cache.types.ts",
    "apps/server/src/cache/index.ts",
    # apps/server - file-storage
    "apps/server/src/file-storage/cdn.service.ts",
    "apps/server/src/file-storage/file.service.ts",
    "apps/server/src/file-storage/index.ts",
    "apps/server/src/file-storage/multipart-upload.service.ts",
    "apps/server/src/file-storage/providers/local.provider.ts",
    "apps/server/src/file-storage/storage-provider.factory.ts",
    "apps/server/src/file-storage/storage-provider.registry.ts",
    # apps/server - lbac
    "apps/server/src/lbac/key-builder.ts",
    "apps/server/src/lbac/ownership-inheritance-service.ts",
    "apps/server/src/lbac/ownership-repository.ts",
    "apps/server/src/lbac/tag-sync-service.ts",
    # apps/server - notifications
    "apps/server/src/notifications/channel.service.ts",
    "apps/server/src/notifications/notification-cleanup.task.ts",
    "apps/server/src/notifications/notification.service.ts",
    "apps/server/src/notifications/preference.service.ts",
    "apps/server/src/notifications/template.service.ts",
    "apps/server/src/notifications/view-strategy.ts",
    # apps/server - permission
    "apps/server/src/permission/casl-ability.ts",
    "apps/server/src/permission/constants.ts",
    "apps/server/src/permission/index.ts",
    "apps/server/src/permission/permission-kernel.ts",
    "apps/server/src/permission/permission.module.ts",
    # apps/server - plugins
    "apps/server/src/plugins/capabilities/index.ts",
    "apps/server/src/plugins/capabilities/permission.capability.ts",
    "apps/server/src/plugins/menu-registry.ts",
    "apps/server/src/plugins/migration-service.ts",
    "apps/server/src/plugins/permission-registry.ts",
    "apps/server/src/plugins/plugin-manager.ts",
    # apps/server - scheduler
    "apps/server/src/scheduler/providers/builtin.provider.ts",
    "apps/server/src/scheduler/providers/provider.registry.ts",
    "apps/server/src/scheduler/scheduler.service.ts",
    # apps/server - settings
    "apps/server/src/settings/cache.service.ts",
    "apps/server/src/settings/encryption.service.ts",
    "apps/server/src/settings/feature-flag.service.ts",
    "apps/server/src/settings/schema-registry.service.ts",
    "apps/server/src/settings/settings.service.ts",
    # apps/server - trpc
    "apps/server/src/trpc/context.ts",
    "apps/server/src/trpc/router.ts",
    "apps/server/src/trpc/trpc.module.ts",
    "apps/server/src/trpc/trpc.ts",
    "apps/server/src/trpc/routers/assets.ts",
    "apps/server/src/trpc/routers/audit.ts",
    "apps/server/src/trpc/routers/cache.ts",
    "apps/server/src/trpc/routers/feature-flags.ts",
    "apps/server/src/trpc/routers/files.ts",
    "apps/server/src/trpc/routers/menu.ts",
    "apps/server/src/trpc/routers/notification-preferences.ts",
    "apps/server/src/trpc/routers/notification-templates.ts",
    "apps/server/src/trpc/routers/notifications.ts",
    "apps/server/src/trpc/routers/organization.ts",
    "apps/server/src/trpc/routers/permissions.ts",
    "apps/server/src/trpc/routers/role-menu-visibility.ts",
    "apps/server/src/trpc/routers/roles.ts",
    "apps/server/src/trpc/routers/settings.ts",
    "apps/server/src/trpc/routers/user-admin.example.ts",
    # apps/server - webhooks
    "apps/server/src/webhooks/webhook.dispatcher.ts",
    "apps/server/src/webhooks/webhook.repository.ts",
    "apps/server/src/webhooks/webhook.service.ts",
    # apps/server - tests
    "apps/server/src/__tests__/audit/audit.service.test.ts",
    "apps/server/src/__tests__/auth/registration.test.ts",
    "apps/server/src/__tests__/context/context.test.ts",
    "apps/server/src/__tests__/hooks/hook-executor.test.ts",
    "apps/server/src/__tests__/hooks/hook-registry.test.ts",
    "apps/server/src/__tests__/observability/logger-adapter.integration.test.ts",
    "apps/server/src/__tests__/permission/permission-kernel.test.ts",
    "apps/server/src/__tests__/permission/role-permissions.integration.test.ts",
    "apps/server/src/__tests__/plugins/manifest.test.ts",
    "apps/server/src/__tests__/plugins/menu-registry.test.ts",
    "apps/server/src/__tests__/queue/queue.service.test.ts",
    "apps/server/src/__tests__/trpc/router.test.ts",
    "apps/server/src/audit/__tests__/audit-flush.test.ts",
    # packages
    "packages/plugin/package.json",
    "packages/plugin/src/index.ts",
    "packages/plugin/src/manifest.ts",
    "packages/plugin/tsup.config.ts",
    "packages/ui/package.json",
    "packages/ui/src/styles/globals.css",
    # plugins
    "plugins/hello-world/rsbuild.config.ts",
    # root
    "package.json",
    "pnpm-lock.yaml",
    # docs
    "docs/architecture/DATA_MODEL_GOVERNANCE.md",
    "docs/architecture/GLOBALIZATION_GOVERNANCE.md",
    "docs/i18n-architecture-final.md",
    # openspec
    "openspec/specs/plugin-api/spec.md",
    # other
    ".env.example",
    "README.md",
]


def uri_to_path(uri: str) -> str:
    """Convert file:// URI to filesystem path."""
    if uri.startswith("file://"):
        path = unquote(uri[7:])  # Remove file:// and decode percent-encoding
        return path
    return uri


def scan_history():
    """Scan all history entries and build a map of project files."""
    file_map = {}  # relative_path -> [(timestamp, history_file_path), ...]

    if not HISTORY_DIR.exists():
        print(f"ERROR: History directory not found: {HISTORY_DIR}")
        sys.exit(1)

    for entry_dir in HISTORY_DIR.iterdir():
        if not entry_dir.is_dir():
            continue

        entries_file = entry_dir / "entries.json"
        if not entries_file.exists():
            continue

        try:
            with open(entries_file) as f:
                data = json.load(f)
        except (json.JSONDecodeError, IOError):
            continue

        resource = data.get("resource", "")
        abs_path = uri_to_path(resource)

        # Only care about files in our project
        if not abs_path.startswith(str(PROJECT_ROOT) + "/"):
            continue

        rel_path = abs_path[len(str(PROJECT_ROOT)) + 1:]

        entries = data.get("entries", [])
        if not entries:
            continue

        versions = []
        for entry in entries:
            ts = entry.get("timestamp", 0)
            file_id = entry.get("id", "")
            history_file = entry_dir / file_id
            if history_file.exists():
                versions.append((ts, str(history_file)))

        if versions:
            versions.sort(key=lambda x: x[0], reverse=True)  # Latest first
            file_map[rel_path] = versions

    return file_map


def recover_files(file_map, dry_run=True):
    """Recover lost files from history."""
    recovered = 0
    skipped = 0
    not_found = 0

    lost_set = set(LOST_FILES)

    print(f"\n{'=' * 60}")
    print(f"{'DRY RUN' if dry_run else 'RECOVERING'}: {len(lost_set)} lost files")
    print(f"History entries found: {len(file_map)} project files")
    print(f"{'=' * 60}\n")

    for rel_path in sorted(LOST_FILES):
        if rel_path not in file_map:
            print(f"  MISS  {rel_path}")
            not_found += 1
            continue

        versions = file_map[rel_path]

        # Pick the best version
        if RESET_TIMESTAMP_MS:
            # Find latest version before the reset
            candidates = [(ts, fp) for ts, fp in versions if ts < RESET_TIMESTAMP_MS]
            if not candidates:
                print(f"  MISS  {rel_path} (no version before cutoff)")
                not_found += 1
                continue
            best_ts, best_file = candidates[0]
        else:
            # Use the latest version available
            best_ts, best_file = versions[0]

        ts_str = datetime.fromtimestamp(best_ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
        target = PROJECT_ROOT / rel_path

        if dry_run:
            print(f"  OK    {rel_path}  ({ts_str}, {len(versions)} versions)")
            recovered += 1
        else:
            try:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(best_file, target)
                print(f"  OK    {rel_path}  ({ts_str})")
                recovered += 1
            except IOError as e:
                print(f"  ERR   {rel_path}: {e}")
                skipped += 1

    print(f"\n{'=' * 60}")
    print(f"Results: {recovered} recoverable, {not_found} not found, {skipped} errors")
    print(f"{'=' * 60}")

    if dry_run and recovered > 0:
        print(f"\nRun with --apply to actually recover {recovered} files:")
        print(f"  python3 scripts/recover-from-timeline.py --apply")

    return recovered, not_found


def main():
    apply_mode = "--apply" in sys.argv
    dry_run = not apply_mode

    if not dry_run:
        print("WARNING: This will OVERWRITE current files with Timeline versions.")
        print("Make sure you have committed or stashed current changes first!\n")

    print("Scanning Antigravity Timeline history...")
    file_map = scan_history()
    print(f"Found {len(file_map)} project files in Timeline history.\n")

    # Show all available project files if requested
    if "--list-all" in sys.argv:
        print("All project files in Timeline:")
        for rel_path, versions in sorted(file_map.items()):
            latest_ts = datetime.fromtimestamp(versions[0][0] / 1000).strftime("%Y-%m-%d %H:%M:%S")
            print(f"  {rel_path}  ({len(versions)} versions, latest: {latest_ts})")
        print()

    recover_files(file_map, dry_run=dry_run)


if __name__ == "__main__":
    main()
