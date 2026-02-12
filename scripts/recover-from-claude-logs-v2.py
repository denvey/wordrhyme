#!/usr/bin/env python3
"""
Recover files from Claude CLI session logs by replaying Write + Edit operations.

Unlike the simple version, this script replays ALL operations (Write then Edits)
in chronological order to reconstruct the final version of each file.

Usage:
  python3 scripts/recover-from-claude-logs-v2.py              # Preview (dry-run)
  python3 scripts/recover-from-claude-logs-v2.py --apply       # Actually recover
  python3 scripts/recover-from-claude-logs-v2.py --list-all    # Show all recoverable files
  python3 scripts/recover-from-claude-logs-v2.py --detail FILE # Show ops for a specific file
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


def collect_operations():
    """Collect all Write/Edit operations from all sessions, in chronological order."""
    # First, sort sessions by mtime to get chronological order
    sessions = []
    for f in CLAUDE_PROJECTS.glob("*.jsonl"):
        sessions.append((f.stat().st_mtime, f))
    sessions.sort(key=lambda x: x[0])

    # file_ops: rel_path -> [(op_type, data, session_id), ...]
    file_ops = {}

    for mtime, session_path in sessions:
        session_id = session_path.stem[:8]
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
                        fp = inp.get("file_path", "")
                        if not fp.startswith(str(PROJECT_ROOT) + "/"):
                            continue
                        rel = fp[len(str(PROJECT_ROOT)) + 1:]

                        if name == "Write":
                            content = inp.get("content", "")
                            if content:
                                if rel not in file_ops:
                                    file_ops[rel] = []
                                file_ops[rel].append(("Write", content, session_id))
                        elif name == "Edit":
                            old_string = inp.get("old_string", "")
                            new_string = inp.get("new_string", "")
                            replace_all = inp.get("replace_all", False)
                            if old_string is not None and new_string is not None:
                                if rel not in file_ops:
                                    file_ops[rel] = []
                                file_ops[rel].append(("Edit", {
                                    "old_string": old_string,
                                    "new_string": new_string,
                                    "replace_all": replace_all,
                                }, session_id))
        except (IOError, OSError) as e:
            print(f"  Warning: Could not read {session_path.name}: {e}")

    return file_ops


def replay_operations(ops):
    """Replay Write + Edit operations to reconstruct the final file content.

    Returns (content, stats) where stats = (writes, edits_applied, edits_failed)
    """
    content = None
    writes = 0
    edits_applied = 0
    edits_failed = 0

    for op_type, data, session_id in ops:
        if op_type == "Write":
            content = data
            writes += 1
            # Reset edit counters after a Write (new base)
        elif op_type == "Edit" and content is not None:
            old_string = data["old_string"]
            new_string = data["new_string"]
            replace_all = data.get("replace_all", False)

            if old_string in content:
                if replace_all:
                    content = content.replace(old_string, new_string)
                else:
                    content = content.replace(old_string, new_string, 1)
                edits_applied += 1
            else:
                edits_failed += 1

    return content, (writes, edits_applied, edits_failed)


# Files to recover
LOST_FILES = [
    "apps/admin/src/components/audit-logs/index.ts",
    "apps/admin/src/lib/ability.tsx",
    "apps/admin/src/pages/Files.tsx",
    "apps/admin/src/pages/Members.tsx",
    "apps/admin/src/pages/RoleDetail.tsx",
    "apps/server/src/auth/guards/guard-audit.service.ts",
    "apps/server/src/auth/guards/membership.service.ts",
    "apps/server/src/auth/guards/tenant-ban.service.ts",
    "apps/server/src/audit/audit.service.ts",
    "apps/server/src/audit/audit.worker.ts",
    "apps/server/src/audit/index.ts",
    "apps/server/src/asset/asset.service.ts",
    "apps/server/src/asset/image-processor.service.ts",
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
    "apps/server/src/cache/cache-namespace.ts",
    "apps/server/src/cache/cache.module.ts",
    "apps/server/src/cache/index.ts",
    "apps/server/src/file-storage/cdn.service.ts",
    "apps/server/src/file-storage/file.service.ts",
    "apps/server/src/file-storage/index.ts",
    "apps/server/src/file-storage/multipart-upload.service.ts",
    "apps/server/src/file-storage/providers/local.provider.ts",
    "apps/server/src/file-storage/storage-provider.factory.ts",
    "apps/server/src/file-storage/storage-provider.registry.ts",
    "apps/server/src/lbac/key-builder.ts",
    "apps/server/src/lbac/ownership-inheritance-service.ts",
    "apps/server/src/lbac/ownership-repository.ts",
    "apps/server/src/lbac/tag-sync-service.ts",
    "apps/server/src/notifications/channel.service.ts",
    "apps/server/src/notifications/notification-cleanup.task.ts",
    "apps/server/src/notifications/notification.service.ts",
    "apps/server/src/notifications/preference.service.ts",
    "apps/server/src/notifications/template.service.ts",
    "apps/server/src/notifications/view-strategy.ts",
    "apps/server/src/permission/casl-ability.ts",
    "apps/server/src/permission/constants.ts",
    "apps/server/src/scheduler/providers/builtin.provider.ts",
    "apps/server/src/scheduler/providers/provider.registry.ts",
    "apps/server/src/scheduler/scheduler.service.ts",
    "apps/server/src/services/menu.service.ts",
    "apps/server/src/settings/cache.service.ts",
    "apps/server/src/settings/encryption.service.ts",
    "apps/server/src/settings/feature-flag.service.ts",
    "apps/server/src/settings/schema-registry.service.ts",
    "apps/server/src/settings/settings.service.ts",
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
    "apps/server/src/webhooks/webhook.dispatcher.ts",
    "apps/server/src/webhooks/webhook.service.ts",
    "apps/server/src/db/seed/check-menu-org-ids.ts",
    "apps/server/src/db/seed/seed-roles.ts",
    "apps/server/src/db/seed/sync-menus-visibility.ts",
    "apps/server/src/__tests__/audit/audit.service.test.ts",
    "apps/server/src/__tests__/auth/registration.test.ts",
    "apps/server/src/__tests__/hooks/hook-executor.test.ts",
    "apps/server/src/__tests__/hooks/hook-registry.test.ts",
    "apps/server/src/__tests__/observability/logger-adapter.integration.test.ts",
    "apps/server/src/__tests__/permission/role-permissions.integration.test.ts",
    "apps/server/src/__tests__/queue/queue.service.test.ts",
    "apps/server/src/audit/__tests__/audit-flush.test.ts",
    # Also re-recover Timeline files that may have been modified by Claude after Timeline snapshot
    "apps/admin/src/components/Layout.tsx",
    "apps/admin/src/components/nav-main.tsx",
    "apps/admin/src/pages/AuditLogs.tsx",
    "apps/admin/src/pages/Login.tsx",
    "apps/admin/src/pages/Menus.tsx",
    "apps/admin/src/pages/Settings.tsx",
    "apps/admin/src/App.tsx",
    "apps/admin/src/hooks/useMenus.ts",
    "apps/admin/src/lib/auth.tsx",
    "apps/server/src/app.module.ts",
    "apps/server/src/main.ts",
    "apps/server/src/db/client.ts",
    "apps/server/src/db/index.ts",
    "apps/server/src/db/schema/definitions.ts",
    "apps/server/src/db/schema/index.ts",
    "apps/server/src/db/scoped-db.ts",
    "apps/server/src/db/seed.ts",
    "apps/server/src/auth/auth.ts",
    "apps/server/src/auth/index.ts",
    "apps/server/src/trpc/context.ts",
    "apps/server/src/trpc/router.ts",
    "apps/server/src/trpc/trpc.module.ts",
    "apps/server/src/trpc/trpc.ts",
    "apps/server/src/trpc/routers/menu.ts",
    "apps/server/src/trpc/routers/cache.ts",
    "apps/server/src/plugins/plugin-manager.ts",
    "apps/server/src/plugins/menu-registry.ts",
    "apps/server/src/plugins/migration-service.ts",
    "apps/server/src/plugins/permission-registry.ts",
    "apps/server/src/plugins/capabilities/index.ts",
    "apps/server/src/plugins/capabilities/permission.capability.ts",
    "apps/server/src/permission/index.ts",
    "apps/server/src/permission/permission-kernel.ts",
    "apps/server/src/permission/permission.module.ts",
    "apps/server/src/cache/cache-manager.ts",
    "apps/server/src/cache/cache.types.ts",
    "apps/server/src/settings/cache.service.ts",
    "apps/server/src/webhooks/webhook.repository.ts",
    "packages/plugin/src/index.ts",
    "packages/plugin/src/manifest.ts",
]


def main():
    apply_mode = "--apply" in sys.argv
    ok_only = "--ok-only" in sys.argv
    dry_run = not apply_mode
    detail_file = None
    if "--detail" in sys.argv:
        idx = sys.argv.index("--detail")
        if idx + 1 < len(sys.argv):
            detail_file = sys.argv[idx + 1]

    if not dry_run:
        print("WARNING: This will OVERWRITE current files with replayed versions.")
        print("Make sure you have committed or stashed current changes first!\n")

    print("Scanning Claude CLI session logs (collecting all Write + Edit ops)...")
    file_ops = collect_operations()
    print(f"Found operations for {len(file_ops)} project files.\n")

    # Detail mode: show operations for a specific file
    if detail_file:
        if detail_file in file_ops:
            ops = file_ops[detail_file]
            print(f"Operations for {detail_file}: {len(ops)}")
            for op_type, data, sid in ops:
                if op_type == "Write":
                    print(f"  [Write] session={sid}  {len(data)} chars")
                else:
                    old = data['old_string'][:50].replace('\n', '\\n')
                    new = data['new_string'][:50].replace('\n', '\\n')
                    print(f"  [Edit ] session={sid}  '{old}' => '{new}'")
            # Replay and show result
            content, (w, ea, ef) = replay_operations(ops)
            print(f"\nReplay: {w} writes, {ea} edits applied, {ef} edits failed")
            if content:
                print(f"Final content: {len(content)} chars")
        else:
            print(f"No operations found for {detail_file}")
        return

    # List all mode
    if "--list-all" in sys.argv:
        print("All files with operations:")
        for rel_path in sorted(file_ops.keys()):
            ops = file_ops[rel_path]
            writes = sum(1 for o in ops if o[0] == "Write")
            edits = sum(1 for o in ops if o[0] == "Edit")
            print(f"  {rel_path}  ({writes} writes, {edits} edits)")
        print()

    # Recovery
    recovered = 0
    not_found = 0
    skipped = 0
    edit_warnings = []

    unique_files = list(dict.fromkeys(LOST_FILES))  # Deduplicate preserving order

    print(f"{'=' * 70}")
    print(f"{'DRY RUN' if dry_run else 'RECOVERING'}: {len(unique_files)} files (Write + Edit replay)")
    print(f"{'=' * 70}\n")

    for rel_path in sorted(unique_files):
        if rel_path not in file_ops:
            print(f"  MISS  {rel_path}")
            not_found += 1
            continue

        ops = file_ops[rel_path]
        content, (w, ea, ef) = replay_operations(ops)

        if content is None:
            print(f"  MISS  {rel_path} (no Write found, only Edits)")
            not_found += 1
            continue

        total_edits = ea + ef
        size_kb = len(content) / 1024
        is_ok = ef == 0
        status = "OK   " if is_ok else "WARN "
        edit_info = f"W:{w} E:{ea}" + (f" F:{ef}" if ef > 0 else "")

        # Skip WARN files in --ok-only mode
        if ok_only and not is_ok:
            print(f"  SKIP  {rel_path}  ({edit_info}, has failed edits)")
            skipped += 1
            continue

        if dry_run:
            print(f"  {status} {rel_path}  ({size_kb:.1f} KB, {edit_info})")
            recovered += 1
        else:
            try:
                target = PROJECT_ROOT / rel_path
                target.parent.mkdir(parents=True, exist_ok=True)
                with open(target, "w") as f:
                    f.write(content)
                print(f"  {status} {rel_path}  ({size_kb:.1f} KB, {edit_info})")
                recovered += 1
            except IOError as e:
                print(f"  ERR   {rel_path}: {e}")
                skipped += 1

        if ef > 0:
            edit_warnings.append((rel_path, ef))

    print(f"\n{'=' * 70}")
    print(f"Results: {recovered} recovered, {not_found} not found, {skipped} errors")
    if edit_warnings:
        print(f"\nWARNING: {len(edit_warnings)} files had failed edits (content may be incomplete):")
        for rel, fails in edit_warnings:
            print(f"  {rel}  ({fails} edits could not be applied)")
    print(f"{'=' * 70}")

    if dry_run and recovered > 0:
        print(f"\nRun with --apply to actually recover {recovered} files:")
        print(f"  python3 scripts/recover-from-claude-logs-v2.py --apply")


if __name__ == "__main__":
    main()
