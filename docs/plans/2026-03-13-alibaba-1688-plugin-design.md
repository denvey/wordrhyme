# Alibaba 1688 Plugin Design

**Date**: 2026-03-13
**Status**: Approved
**Plugin ID**: `com.wordrhyme.alibaba-1688`

## Architecture

alibaba-1688 is a **platform adapter** for the dsuni plugin. It handles all 1688 Open Platform API interactions and feeds data through dsuni's sync infrastructure.

### Responsibility Matrix

| Responsibility | Owner |
|---|---|
| 1688 API signing, auth, requests | alibaba-1688 |
| Product search (keyword/image) | alibaba-1688 |
| Product detail fetching | alibaba-1688 |
| Top list / hot keywords | alibaba-1688 |
| Freight estimation | alibaba-1688 |
| Image upload (for image search) | alibaba-1688 |
| SKU-to-attribute conversion, price calculation | alibaba-1688 |
| 1688 CDN image URL rewriting | alibaba-1688 |
| API credential management (Settings UI) | alibaba-1688 |
| Product/order sync orchestration | dsuni (existing) |
| external_mappings management | dsuni (existing) |
| Sync dashboard | dsuni (existing) |

## File Structure

```
plugins/alibaba-1688/
├── manifest.json
├── package.json
├── tsup.config.ts
├── rsbuild.config.ts
├── tsconfig.json
├── src/
│   ├── server/
│   │   ├── index.ts              # Main entry: router + lifecycle hooks
│   │   ├── permissions.ts        # Permission key constants
│   │   ├── alibaba-api.ts        # AlibabaAPI class (from example/dsuni lib/fetch/1688.ts)
│   │   ├── utils/
│   │   │   ├── convert.ts        # SKU→attributes, category flattening
│   │   │   ├── price.ts          # Price range, best price, coefficient calc
│   │   │   └── image.ts          # 1688 CDN URL rewriting
│   │   └── routers/
│   │       ├── product.ts        # search, detail, imageSearch, topList, imageUpload
│   │       ├── tools.ts          # hotKeyword, estimateFreight
│   │       └── settings.ts       # Credential CRUD via ctx.settings
│   └── admin/
│       ├── index.tsx             # Extension registration
│       └── pages/
│           └── Settings.tsx      # API credential config + connection test
```

## Migration Source Map

| Target | Source (example/dsuni) |
|---|---|
| `alibaba-api.ts` | `apps/web/src/lib/fetch/1688.ts` |
| `routers/product.ts` | `apps/web/src/server/api/routers/alibaba.ts` (list, productById, imageSearch, topList, imageUpload) |
| `routers/tools.ts` | `apps/web/src/server/api/routers/alibaba.ts` (hotKeyword, estimateFreight) |
| `utils/convert.ts` | `apps/web/src/lib/convert.ts` (skuToAttrs, flattenCategories) |
| `utils/price.ts` | `apps/web/src/lib/price.ts` (getPriceRange, getPrice, calcPrice) |
| `utils/image.ts` | `apps/web/src/lib/url.ts` (replace1688Image) |
| `permissions.ts` | New (aligned with manifest permission keys) |
| `routers/settings.ts` | New (credential management via ctx.settings) |
| `admin/pages/Settings.tsx` | New (credential config UI) |

## Key Adaptation from Example

1. **Credentials**: Hardcoded `appKey/appSecret/accessToken` → `ctx.settings.get('alibaba_1688.credentials')` per-tenant
2. **API Client**: Factory function `createClient(ctx)` reads settings and instantiates `AlibabaAPI`
3. **Router style**: Next.js tRPC router → `pluginRouter` / `pluginProcedure` from `@wordrhyme/plugin/server`
4. **Permissions**: All endpoints require permission check via `requirePermission(ctx, ...)`
5. **Enums**: `AlibabaLanguage` moved into plugin scope (no DB enum dependency)

## Server API Endpoints

### routers/product.ts

| Endpoint | Method | Description |
|---|---|---|
| `product.search` | query | Keyword search with pagination (keywordQuery + imageQuery) |
| `product.detail` | query | Get product detail by offerId |
| `product.imageSearch` | query | Image-based product search |
| `product.topList` | query | Trending/hot product rankings |
| `product.imageUpload` | mutation | Upload image for image search (returns imageId) |

### routers/tools.ts

| Endpoint | Method | Description |
|---|---|---|
| `tools.hotKeyword` | query | Category hot search keywords |
| `tools.estimateFreight` | query | Domestic freight estimation |

### routers/settings.ts

| Endpoint | Method | Description |
|---|---|---|
| `settings.get` | query | Read current credentials (secret masked) |
| `settings.update` | mutation | Save appKey/appSecret/accessToken |
| `settings.testConnection` | mutation | Verify credentials by calling 1688 API |

## Data Flow

```
User configures credentials → settings.update → ctx.settings.set('alibaba_1688.credentials', ...)
                                                         ↓
dsuni triggers sync → alibaba-1688.product.search/detail → createClient(ctx) reads credentials
                                                         ↓
                                                   AlibabaAPI.request()
                                                         ↓
                                               Raw data + convert/price utils
                                                         ↓
                                           dsuni.sync.importProducts → Shop tables
```

## Manifest Changes

- `type`: `"backend"` → `"full"`
- `dependencies`: add `["com.wordrhyme.dsuni"]`
- `capabilities.ui`: add `{ "settingsTab": true }`
- `capabilities.data.write`: `true` → `false` (does not write data directly)
- `admin` section: add Module Federation config with settings extension

## Admin UI

Single Settings page with two sections:
1. **API Credentials**: appKey, appSecret (password), accessToken (password), Save button
2. **Connection Test**: Test button, success/failure status display
