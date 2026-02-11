# Add Multi-Source Storage Management with S3 Admin UI

**Status**: Ready for Implementation
**Created**: 2025-02-06
**Updated**: 2025-02-06
**Author**: Claude

## Context

The system needs comprehensive storage management supporting multiple storage providers simultaneously. Currently:
- `storage-s3` plugin only has server-side implementation
- Files page doesn't show which storage source files are from
- No UI to configure or select storage providers
- Database already supports `storageProvider` field per file

### User Need

1. **Multi-Source Storage**: Enable multiple storage sources (local + multiple S3 instances) to coexist
2. **S3 Configuration UI**: Configure S3/R2/MinIO connections through admin UI
3. **Files Page Enhancement**: Show storage source per file, filter by source, select upload target
4. **Backward Compatibility**: Existing files continue to work from their original storage source

---

## Finalized Constraints

| Decision Point | Constraint |
|----------------|------------|
| Multi-instance Support | User-defined `providerId` (kebab-case, 3-64 chars, regex: `^[a-z0-9-]{3,64}$`) |
| Config Persistence | Reuse Settings table, key=`plugin:storage-s3:instances`, value=JSON array |
| Config Update | Auto-refresh provider instances on save (no restart required) |
| Connection Test | Plugin route: `POST /api/plugins/storage-s3/test-connection` |
| Secret Handling | Write-only; API returns `****` placeholder; never expose real secret |
| Permission | Require `storage:manage` permission (platform admin only for now) |
| Upload Default | `localStorage.getItem('lastStorageProvider') || globalDefault || 'local'` |
| Provider Status | Enum: `unconfigured` | `healthy` | `error` |
| Null storageProvider | Treat as `local` for backward compatibility |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Files 页面                                │
├─────────────────────────────────────────────────────────────────┤
│  [存储源筛选: 全部 | Local | S3-AWS | S3-R2]                    │
│  [上传到: ▼ S3-AWS (默认)]                                      │
│                                                                  │
│  文件列表 (显示 storageProvider 列):                            │
│  | 文件名 | 大小 | 存储源 | 上传时间 |                          │
└─────────────────────────────────────────────────────────────────┘

Settings 页面:
├── Storage (新增设置页签)
│   ├── 存储源列表 (local 内置 + S3 插件注册)
│   ├── 默认存储源选择器
│   └── [+ 添加 S3 存储源] 按钮
```

---

## Implementation Tasks

### Phase 1: S3 Plugin Infrastructure

#### Task 1.1: Upgrade manifest.json
**File**: `plugins/storage-s3/manifest.json` (create, delete old `plugin.json`)

```json
{
  "pluginId": "com.wordrhyme.storage-s3",
  "version": "0.1.0",
  "name": "S3 Storage Provider",
  "description": "AWS S3 compatible storage provider",
  "vendor": "WordRhyme",
  "type": "full",
  "runtime": "node",
  "capabilities": {
    "ui": { "adminPage": false, "settingsTab": true }
  },
  "permissions": {
    "definitions": [
      { "key": "settings.read", "description": "View S3 settings" },
      { "key": "settings.write", "description": "Modify S3 settings" }
    ]
  },
  "server": {
    "entry": "./dist/server/index.js",
    "router": true,
    "hooks": ["onEnable", "onDisable"]
  },
  "admin": {
    "remoteEntry": "./dist/admin/remoteEntry.js",
    "exposes": { "./admin": "./src/admin/index.tsx" }
  }
}
```

#### Task 1.2: Add build configuration
**Files**:
- `plugins/storage-s3/rsbuild.config.ts` (copy from email-resend, update pluginId)
- `plugins/storage-s3/tsup.config.ts` (copy from email-resend)
- `plugins/storage-s3/package.json` (add admin deps)

#### Task 1.3: Reorganize source structure
**Actions**:
- Move `src/index.ts` → `src/server/index.ts`
- Move `src/s3-storage.provider.ts` → `src/server/s3-storage.provider.ts`
- Create `src/admin/` directory

#### Task 1.4: Create admin entry point
**File**: `plugins/storage-s3/src/admin/index.tsx`

```tsx
import type { Extension } from '@wordrhyme/plugin';
import { SettingsPage } from './components/SettingsPage';

export const extensions: Extension[] = [
  {
    id: 'storage-s3.settings',
    pluginId: 'com.wordrhyme.storage-s3',
    type: 'settings_tab',
    label: 'S3 Storage',
    order: 60,
    component: SettingsPage,
  },
];

export async function init(): Promise<void> {
  console.log('[Storage S3 Plugin] Admin UI initialized');
}

export default { extensions, init };
```

#### Task 1.5: Create SettingsPage component
**File**: `plugins/storage-s3/src/admin/components/SettingsPage.tsx`

**UI Structure**:
```
┌─────────────────────────────────────────────────────────────────┐
│ S3 Storage Configuration                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌─ Configured Instances ──────────────────────────────────────┐ │
│ │ ● s3-production  │ AWS S3     │ us-east-1 │ ✅ Healthy      │ │
│ │ ○ r2-backup      │ Cloudflare │ auto      │ ⚠️ Not tested  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [+ Add Storage Instance]                                         │
│                                                                  │
│ ─────────────────────────────────────────────────────────────── │
│                                                                  │
│ Instance: s3-production (editing)                                │
│                                                                  │
│ Provider Preset: [▼ AWS S3        ]                              │
│ Instance ID:     [s3-production   ] (kebab-case, 3-64 chars)    │
│ Display Name:    [Production S3   ]                              │
│ Region:          [us-east-1       ]                              │
│ Bucket:          [my-bucket       ]                              │
│ Access Key ID:   [AKIA...         ]                              │
│ Secret Key:      [••••••••••••    ] (write-only)                │
│ Endpoint:        [(auto for AWS)  ]                              │
│ CDN URL:         [(optional)      ]                              │
│ Force Path Style: [ ] (auto for MinIO)                          │
│                                                                  │
│ [Test Connection]  [Delete Instance]        [Cancel] [Save]     │
└─────────────────────────────────────────────────────────────────┘
```

**State Management**:
- Load instances from `trpc.plugin.storage-s3.listInstances`
- Save via `trpc.plugin.storage-s3.saveInstance`
- Delete via `trpc.plugin.storage-s3.deleteInstance`
- Test via `trpc.plugin.storage-s3.testConnection`

#### Task 1.6: Create server tRPC router
**File**: `plugins/storage-s3/src/server/router.ts`

```typescript
// Endpoints:
// - listInstances(): S3Instance[]
// - getInstance(id): S3Instance
// - saveInstance(data): void
// - deleteInstance(id): void
// - testConnection(config): { ok: boolean, latencyMs?: number, error?: string }

// S3Instance schema:
interface S3Instance {
  providerId: string;      // e.g., "s3-production"
  displayName: string;     // e.g., "Production S3"
  preset: 'aws' | 'r2' | 'minio' | 'custom';
  endpoint?: string;       // required for non-AWS
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey?: string; // never returned, only accepted on write
  publicUrlBase?: string;
  forcePathStyle: boolean;
  status: 'unconfigured' | 'healthy' | 'error';
  lastTestedAt?: Date;
}
```

#### Task 1.7: Update server entry for multi-instance
**File**: `plugins/storage-s3/src/server/index.ts`

- Load all instances from settings on `onEnable`
- Register each instance as separate provider with `providerId` as type
- On settings change, unregister old + register new (auto-refresh)

---

### Phase 2: Files Page Enhancement

#### Task 2.1: Add storageProvider to files API response
**File**: `apps/server/src/trpc/routers/files.ts`

- Include `storageProvider` in list/get responses
- Add `storageProvider` filter parameter to list query

#### Task 2.2: Add Storage Source column to Files page
**File**: `apps/admin/src/pages/Files.tsx`

- Add `storageProvider` to `FileInfo` interface
- Add badge column showing provider (Local / S3-xxx)
- Tooltip shows: provider name, bucket (no secrets)

#### Task 2.3: Add Storage Source filter
**File**: `apps/admin/src/pages/Files.tsx`

- Add dropdown filter next to MIME category filter
- Options: "All Sources" + dynamically loaded providers
- Combine with existing filters

---

### Phase 3: Core Storage Settings

#### Task 3.1: Add Storage tab to Settings
**File**: `apps/admin/src/pages/Settings.tsx`

- Add "Storage" to `coreTabs` array
- Render `StorageSettingsTab` component

#### Task 3.2: Create StorageSettingsTab component
**File**: `apps/admin/src/components/settings/StorageSettingsTab.tsx`

**UI**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Storage Configuration                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Default Storage Source: [▼ s3-production ]                      │
│                                                                  │
│ Available Providers:                                             │
│ ┌──────────────────────────────────────────────────────────────┐│
│ │ 📁 Local Storage      │ Built-in  │ ✅ Ready   │ [Settings] ││
│ │ ☁️ s3-production      │ S3 Plugin │ ✅ Healthy │ [Settings] ││
│ │ ☁️ r2-backup          │ S3 Plugin │ ⚠️ Error   │ [Settings] ││
│ └──────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Task 3.3: Create storage providers API
**File**: `apps/server/src/trpc/routers/storage.ts`

```typescript
// Endpoints:
// - listProviders(): StorageProviderInfo[]
// - getDefaultProvider(): string
// - setDefaultProvider(providerId): void

interface StorageProviderInfo {
  providerId: string;
  displayName: string;
  pluginId: string | null;  // null for built-in
  status: 'ready' | 'healthy' | 'error' | 'unconfigured';
  supportsTest: boolean;
}
```

---

### Phase 4: Upload Target Selection

#### Task 4.1: Add upload target selector to Files page
**File**: `apps/admin/src/pages/Files.tsx`

- In upload dialog, add "Upload to" dropdown
- Load available providers from API
- Default: `localStorage.lastStorageProvider || globalDefault || 'local'`
- On upload success: `localStorage.setItem('lastStorageProvider', selected)`

#### Task 4.2: Pass storageProvider to upload API
**File**: `apps/server/src/trpc/routers/files.ts`

- Add `storageProvider` parameter to `getUploadUrl` and `upload` mutations
- Validate provider exists and is healthy
- Store in `files.storageProvider` column

---

## File Summary

### New Files (12)
1. `plugins/storage-s3/manifest.json`
2. `plugins/storage-s3/rsbuild.config.ts`
3. `plugins/storage-s3/tsup.config.ts`
4. `plugins/storage-s3/src/admin/index.tsx`
5. `plugins/storage-s3/src/admin/components/SettingsPage.tsx`
6. `plugins/storage-s3/src/admin/types.ts`
7. `plugins/storage-s3/src/server/router.ts`
8. `apps/admin/src/components/settings/StorageSettingsTab.tsx`
9. `apps/server/src/trpc/routers/storage.ts`

### Modified Files (8)
1. `plugins/storage-s3/package.json` - add admin deps
2. `plugins/storage-s3/tsconfig.json` - update paths
3. `plugins/storage-s3/src/server/index.ts` - multi-instance support
4. `apps/admin/src/pages/Files.tsx` - storage column, filter, upload selector
5. `apps/admin/src/pages/Settings.tsx` - add Storage tab
6. `apps/server/src/trpc/routers/files.ts` - add storageProvider field and filter
7. `apps/server/src/trpc/index.ts` - add storage router
8. `apps/server/src/file-storage/storage-provider.factory.ts` - support dynamic providers

### Deleted Files (1)
1. `plugins/storage-s3/plugin.json` (replaced by manifest.json)

---

## Success Criteria

### S3 Plugin
- [ ] Plugin builds with `pnpm build`
- [ ] Settings tab appears in admin
- [ ] Can add/edit/delete S3 instances
- [ ] Test Connection works
- [ ] Config saves to Settings table
- [ ] Instances auto-refresh on save

### Files Page
- [ ] Storage Source column shows provider
- [ ] Filter by storage source works
- [ ] Upload target selector appears
- [ ] Remembers last selected provider

### Storage Settings
- [ ] Storage tab in Settings
- [ ] Lists all providers with status
- [ ] Can change default provider

---

## Non-Goals

- File browser within S3 bucket
- Storage usage statistics
- Bucket creation/management
- File migration between sources
- Per-folder storage assignment
