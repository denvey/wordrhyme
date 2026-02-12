#!/usr/bin/env python3
"""
Recover files from Claude CLI session logs (.jsonl).

Claude logs every Write/Edit tool call with full file content.
This script extracts the LATEST version of each file from all sessions.

Usage:
  python3 scripts/recover-from-claude-logs.py              # Preview (dry-run, default)
  python3 scripts/recover-from-claude-logs.py --apply       # Actually recover files
  python3 scripts/recover-from-claude-logs.py --list-all    # Show all recoverable files
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path("/Users/denvey/Workspace/Coding/Personal/wordrhyme")
CLAUDE_PROJECTS = Path(os.path.expanduser(
    "~/.claude/projects/-Users-denvey-Workspace-Coding-Personal-wordrhyme"
))

# Files we want to recover (the 84 MISS files from Timeline recovery + extras)
LOST_FILES = [
    # apps/admin - MISS from Timeline
    "apps/admin/src/components/audit-logs/index.ts",
    "apps/admin/src/lib/ability.tsx",
    "apps/admin/src/pages/Files.tsx",
    "apps/admin/src/pages/Members.tsx",
    "apps/admin/src/pages/RoleDetail.tsx",
    # apps/server - auth guards
    "apps/server/src/auth/guards/guard-audit.service.ts",
    "apps/server/src/auth/guards/membership.service.ts",
    "apps/server/src/auth/guards/tenant-ban.service.ts",
    # apps/server - audit
    "apps/server/src/audit/audit.service.ts",
    "apps/server/src/audit/audit.worker.ts",
    "apps/server/src/audit/index.ts",
    # apps/server - asset
    "apps/server/src/asset/asset.service.ts",
    "apps/server/src/asset/image-processor.service.ts",
    # apps/server - billing (full module)
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
    "apps/server/src/cache/cache-namespace.ts",
    "apps/server/src/cache/cache.module.ts",
    "apps/server/src/cache/index.ts",
    # apps/server - file-storage (full module)
    "apps/server/src/file-storage/cdn.service.ts",
    "apps/server/src/file-storage/file.service.ts",
    "apps/server/src/file-storage/index.ts",
    "apps/server/src/file-storage/multipart-upload.service.ts",
    "apps/server/src/file-storage/providers/local.provider.ts",
    "apps/server/src/file-storage/storage-provider.factory.ts",
    "apps/server/src/file-storage/storage-provider.registry.ts",
    # apps/server - lbac (full module)
    "apps/server/src/lbac/key-builder.ts",
    "apps/server/src/lbac/ownership-inheritance-service.ts",
    "apps/server/src/lbac/ownership-repository.ts",
    "apps/server/src/lbac/tag-sync-service.ts",
    # apps/server - notifications (full module)
    "apps/server/src/notifications/channel.service.ts",
    "apps/server/src/notifications/notification-cleanup.task.ts",
    "apps/server/src/notifications/notification.service.ts",
    "apps/server/src/notifications/preference.service.ts",
    "apps/server/src/notifications/template.service.ts",
    "apps/server/src/notifications/view-strategy.ts",
    # apps/server - permission
    "apps/server/src/permission/casl-ability.ts",
    "apps/server/src/permission/constants.ts",
    # apps/server - scheduler
    "apps/server/src/scheduler/providers/builtin.provider.ts",
    "apps/server/src/scheduler/providers/provider.registry.ts",
    "apps/server/src/scheduler/scheduler.service.ts",
    # apps/server - services
    "apps/server/src/services/menu.service.ts",
    # apps/server - settings
    "apps/server/src/settings/cache.service.ts",
    "apps/server/src/settings/encryption.service.ts",
    "apps/server/src/settings/feature-flag.service.ts",
    "apps/server/src/settings/schema-registry.service.ts",
    "apps/server/src/settings/settings.service.ts",
    # apps/server - trpc routers
    "apps/server/src/trpc/routers/assets.ts",
    "apps/server/src/trpc/routers/audit.ts",
    "apps/server/src/trpc/routers/feature-flags.ts",
    "apps/server/src/trpc/routers/files.ts",
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
    "apps/server/src/webhooks/webhook.service.ts",
    # apps/server - seeds
    "apps/server/src/db/seed/check-menu-org-ids.ts",
    "apps/server/src/db/seed/seed-roles.ts",
    "apps/server/src/db/seed/sync-menus-visibility.ts",
    # apps/server - tests
    "apps/server/src/__tests__/audit/audit.service.test.ts",
    "apps/server/src/__tests__/auth/registration.test.ts",
    "apps/server/src/__tests__/hooks/hook-executor.test.ts",
    "apps/server/src/__tests__/hooks/hook-registry.test.ts",
    "apps/server/src/__tests__/observability/logger-adapter.integration.test.ts",
    "apps/server/src/__tests__/permission/role-permissions.integration.test.ts",
    "apps/server/src/__tests__/queue/queue.service.test.ts",
    "apps/server/src/audit/__tests__/audit-flush.test.ts",
]


def extract_writes_from_sessions():
    """Extract the latest Write content for each file from all session logs."""
    file_contents = {}  # rel_path -> (session_mtime, content)

    if not CLAUDE_PROJECTS.exists():
        print(f"ERROR: Claude projects directory not found: {CLAUDE_PROJECTS}")
        sys.exit(1)

    sessions = sorted(CLAUDE_PROJECTS.glob("*.jsonl"), key=lambda p: p.stat().st_mtime)

    for session_path in sessions:
        session_mtime = session_path.stat().st_mtime
        try:
            with open(session_path) as f:
                for line in f:
                    try:
                        obj = json.loads(line)
                    except (json.JSONDecodeError, ValueError):
                        continue

                    if not isinstance(obj, dict):
                        continue

                    msg = obj.get("message", {})
                    if not isinstance(msg, dict):
                        continue

                    content_list = msg.get("content", [])
                    if not isinstance(content_list, list):
                        continue

                    for item in content_list:
                        if not isinstance(item, dict):
                            continue
                        if item.get("type") != "tool_use":
                            continue

                        name = item.get("name", "")
                        inp = item.get("input", {})

                        if name == "Write":
                            fp = inp.get("file_path", "")
                            file_content = inp.get("content", "")
                            if fp.startswith(str(PROJECT_ROOT) + "/") and file_content:
                                rel = fp[len(str(PROJECT_ROOT)) + 1:]
                                # Keep the latest version (sessions sorted by mtime)
                                file_contents[rel] = (session_mtime, file_content)

        except (IOError, OSError) as e:
            print(f"  Warning: Could not read {session_path.name}: {e}")

    return file_contents


def recover_files(file_contents, dry_run=True):
    """Recover lost files from extracted Write contents."""
    recovered = 0
    not_found = 0
    skipped = 0

    lost_set = set(LOST_FILES)

    print(f"\n{'=' * 60}")
    print(f"{'DRY RUN' if dry_run else 'RECOVERING'}: {len(lost_set)} lost files")
    print(f"Write records found: {len(file_contents)} project files")
    print(f"{'=' * 60}\n")

    for rel_path in sorted(LOST_FILES):
        if rel_path not in file_contents:
            print(f"  MISS  {rel_path}")
            not_found += 1
            continue

        session_mtime, content = file_contents[rel_path]
        ts_str = datetime.fromtimestamp(session_mtime).strftime("%Y-%m-%d %H:%M")
        size_kb = len(content) / 1024

        if dry_run:
            print(f"  OK    {rel_path}  ({size_kb:.1f} KB, session: {ts_str})")
            recovered += 1
        else:
            try:
                target = PROJECT_ROOT / rel_path
                target.parent.mkdir(parents=True, exist_ok=True)
                with open(target, "w") as f:
                    f.write(content)
                print(f"  OK    {rel_path}  ({size_kb:.1f} KB)")
                recovered += 1
            except IOError as e:
                print(f"  ERR   {rel_path}: {e}")
                skipped += 1

    print(f"\n{'=' * 60}")
    print(f"Results: {recovered} recoverable, {not_found} not found, {skipped} errors")
    print(f"{'=' * 60}")

    if dry_run and recovered > 0:
        print(f"\nRun with --apply to actually recover {recovered} files:")
        print(f"  python3 scripts/recover-from-claude-logs.py --apply")

    return recovered, not_found


def main():
    apply_mode = "--apply" in sys.argv
    dry_run = not apply_mode

    if not dry_run:
        print("WARNING: This will OVERWRITE current files with versions from Claude logs.")
        print("Make sure you have committed or stashed current changes first!\n")

    print("Scanning Claude CLI session logs...")
    file_contents = extract_writes_from_sessions()
    print(f"Found {len(file_contents)} project files with Write records.\n")

    if "--list-all" in sys.argv:
        print("All recoverable project files:")
        for rel_path, (mtime, content) in sorted(file_contents.items()):
            ts = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M")
            print(f"  {rel_path}  ({len(content)/1024:.1f} KB, {ts})")
        print()

    recover_files(file_contents, dry_run=dry_run)


if __name__ == "__main__":
    main()
