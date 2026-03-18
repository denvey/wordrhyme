# Alibaba 1688 Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate the 1688 Open Platform API integration from example/dsuni into the alibaba-1688 plugin as a dsuni platform adapter.

**Architecture:** alibaba-1688 wraps the 1688 API client (signing, auth, requests) and exposes tRPC routes for product search/detail/image search. Credentials are stored per-tenant via ctx.settings. dsuni handles sync orchestration; this plugin only provides API access.

**Tech Stack:** TypeScript, tRPC (pluginRouter/pluginProcedure), Rsbuild + Module Federation (admin UI), Zod

**Design doc:** `docs/plans/2026-03-13-alibaba-1688-plugin-design.md`

---

### Task 1: Update project config files

**Files:**
- Modify: `plugins/alibaba-1688/manifest.json`
- Modify: `plugins/alibaba-1688/package.json`
- Modify: `plugins/alibaba-1688/tsconfig.json`

**Step 1: Update manifest.json**

Replace the entire file with:

```json
{
    "pluginId": "com.wordrhyme.alibaba-1688",
    "version": "0.2.0",
    "name": "Alibaba 1688 Integration",
    "description": "Platform adapter for 1688 wholesale marketplace — provides product search, detail, image search, and freight estimation via 1688 Open Platform API",
    "vendor": "WordRhyme",
    "type": "full",
    "runtime": "node",
    "engines": {
        "wordrhyme": "^0.1.0",
        "node": ">=20.0.0"
    },
    "dependencies": ["com.wordrhyme.dsuni"],
    "capabilities": {
        "ui": {
            "settingsTab": true
        },
        "data": {
            "read": true,
            "write": false
        }
    },
    "permissions": {
        "definitions": [
            {
                "key": "alibaba_1688.product.search",
                "description": "Search products on 1688"
            },
            {
                "key": "alibaba_1688.product.detail",
                "description": "View product details from 1688"
            },
            {
                "key": "alibaba_1688.tools.use",
                "description": "Use 1688 tools (hot keywords, freight estimation)"
            },
            {
                "key": "alibaba_1688.settings.manage",
                "description": "Manage 1688 API credentials"
            }
        ]
    },
    "server": {
        "entry": "./dist/server/index.js",
        "router": true,
        "hooks": [
            "onEnable",
            "onDisable"
        ]
    },
    "admin": {
        "remoteEntry": "./dist/admin/remoteEntry.js",
        "exposes": {
            "./admin": "./src/admin/index.tsx"
        },
        "extensions": [
            {
                "id": "alibaba_1688.settings",
                "label": "1688",
                "targets": [
                    {
                        "slot": "settings.plugin",
                        "order": 51
                    }
                ]
            }
        ]
    },
    "dataRetention": {
        "onDisable": "retain",
        "onUninstall": "delete"
    }
}
```

**Step 2: Update package.json**

Replace the entire file with:

```json
{
    "name": "alibaba-1688-plugin",
    "version": "0.2.0",
    "private": true,
    "type": "module",
    "scripts": {
        "build": "pnpm run build:server && pnpm run build:admin",
        "build:server": "tsup",
        "build:admin": "rsbuild build",
        "dev": "(pnpm run dev:server) & rsbuild dev",
        "dev:server": "tsup --watch --no-dts",
        "clean": "rm -rf dist"
    },
    "dependencies": {
        "@wordrhyme/plugin": "workspace:*",
        "@wordrhyme/server": "workspace:*",
        "zod": "^3.24.1"
    },
    "peerDependencies": {
        "react": "^18.0.0 || ^19.0.0",
        "react-dom": "^18.0.0 || ^19.0.0"
    },
    "devDependencies": {
        "@module-federation/enhanced": "^0.8.8",
        "@rsbuild/core": "^1.1.10",
        "@rsbuild/plugin-react": "^1.0.7",
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        "react": "^19.0.0",
        "react-dom": "^19.0.0",
        "tsup": "^8.3.5",
        "typescript": "^5.7.2"
    }
}
```

**Step 3: Update tsconfig.json**

Add `jsx` and `tsx` support:

```json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
        "outDir": "./dist",
        "rootDir": "./src",
        "jsx": "react-jsx",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "esModuleInterop": true,
        "allowSyntheticDefaultImports": true
    },
    "include": [
        "src/**/*.ts",
        "src/**/*.tsx"
    ],
    "exclude": [
        "node_modules",
        "dist"
    ]
}
```

**Step 4: Commit**

```bash
git add plugins/alibaba-1688/manifest.json plugins/alibaba-1688/package.json plugins/alibaba-1688/tsconfig.json
git commit -m "feat(alibaba-1688): update project config for full plugin type"
```

---

### Task 2: Create rsbuild.config.ts

**Files:**
- Create: `plugins/alibaba-1688/rsbuild.config.ts`

**Step 1: Create rsbuild config**

Copy dsuni's pattern exactly (it reads pluginId from manifest.json):

```typescript
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';
import { getPluginDevPort, getPluginMfName } from '@wordrhyme/plugin/src/dev-utils';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const manifest = JSON.parse(readFileSync(resolve(__dirname, 'manifest.json'), 'utf-8'));
const PLUGIN_ID = manifest.pluginId;

const MF_NAME = getPluginMfName(PLUGIN_ID);
const DEV_PORT = getPluginDevPort(PLUGIN_ID);
const DEV_PUBLIC_PATH = `http://localhost:${DEV_PORT}/`;
const PROD_PUBLIC_PATH = `/plugins/${PLUGIN_ID.replace(/^com\.wordrhyme\./, '')}/dist/admin/`;

export default defineConfig(({ command }) => {
    const isDevServer = command === 'dev';
    const publicPath = isDevServer ? DEV_PUBLIC_PATH : PROD_PUBLIC_PATH;

    return {
        plugins: [pluginReact()],
        source: {
            entry: {
                admin: './src/admin/index.tsx',
            },
        },
        server: {
            port: DEV_PORT,
            cors: true,
            headers: {
                'Access-Control-Allow-Origin': '*',
            },
        },
        dev: {
            hmr: true,
            liveReload: true,
            client: {
                protocol: 'ws',
                host: 'localhost',
                port: DEV_PORT,
            },
        },
        output: {
            distPath: {
                root: 'dist/admin',
            },
            assetPrefix: publicPath,
        },
        tools: {
            rspack: {
                output: {
                    publicPath: publicPath,
                    uniqueName: MF_NAME,
                },
                plugins: [
                    new ModuleFederationPlugin({
                        name: MF_NAME,
                        filename: 'remoteEntry.js',
                        getPublicPath: `return ${JSON.stringify(publicPath)};`,
                        dts: false,
                        manifest: false,
                        exposes: {
                            './admin': './src/admin/index.tsx',
                        },
                        shared: {
                            react: {
                                singleton: true,
                                import: false,
                                requiredVersion: '^18.0.0 || ^19.0.0',
                            },
                            'react-dom': {
                                singleton: true,
                                import: false,
                                requiredVersion: '^18.0.0 || ^19.0.0',
                            },
                            'lucide-react': {
                                singleton: true,
                                import: false,
                            },
                            '@wordrhyme/ui': {
                                singleton: true,
                                import: false,
                            },
                        },
                    }),
                ],
            },
        },
    };
});
```

**Step 2: Commit**

```bash
git add plugins/alibaba-1688/rsbuild.config.ts
git commit -m "feat(alibaba-1688): add rsbuild config for admin UI"
```

---

### Task 3: Create core API client

**Files:**
- Create: `plugins/alibaba-1688/src/server/alibaba-api.ts`

**Step 1: Create AlibabaAPI class**

Migrated from `example/dsuni/apps/web/src/lib/fetch/1688.ts`. Uses Node.js `crypto` for HMAC-SHA1 signing.

```typescript
import crypto from 'crypto';
import { URL, URLSearchParams } from 'url';

export interface AlibabaCredentials {
    appKey: string;
    appSecret: string;
    accessToken: string;
}

export class AlibabaAPI {
    private appKey: string;
    private secretKey: string;
    private accessToken: string;
    private baseUrl: string;

    constructor(credentials: AlibabaCredentials, baseUrl = 'https://gw.open.1688.com/openapi') {
        this.appKey = credentials.appKey;
        this.secretKey = credentials.appSecret;
        this.accessToken = credentials.accessToken;
        this.baseUrl = baseUrl;
    }

    private extractUrlPath(fullUrl: string): string {
        const parsedUrl = new URL(fullUrl);
        return parsedUrl.pathname;
    }

    private generateSignature(urlPath: string, params: Record<string, string>): string {
        const sortedParams = Object.keys(params).sort().map(key => `${key}${params[key]}`).join('');
        const s = urlPath + sortedParams;
        const hmac = crypto.createHmac('sha1', this.secretKey);
        hmac.update(s);
        return hmac.digest('hex').toUpperCase();
    }

    private encodeParams(params: Record<string, unknown>): Record<string, string> {
        const encoded: Record<string, string> = {};
        for (const key in params) {
            if (Object.prototype.hasOwnProperty.call(params, key)) {
                const value = params[key];
                encoded[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
            }
        }
        return encoded;
    }

    async request(data: {
        path: string;
        method: 'GET' | 'POST';
        params?: Record<string, unknown>;
        accessToken?: string | 'none';
        timestamp?: boolean;
        version?: number;
    }): Promise<any> {
        const { path, params = {}, method = 'POST', timestamp, accessToken, version = 1 } = data;
        const fullUrl = `${this.baseUrl}/param2/${version}${path}/${this.appKey}`;
        const urlPath = this.extractUrlPath(fullUrl).replace(/^\/openapi\//, '');

        if (timestamp) {
            params['_aop_timestamp'] = Date.now().toString();
        }

        if (accessToken !== 'none') {
            params['access_token'] = accessToken ?? this.accessToken;
        }

        const encodedParams = this.encodeParams(params);
        encodedParams['_aop_signature'] = this.generateSignature(urlPath, encodedParams);

        const urlWithParams = new URL(fullUrl);
        const body = new URLSearchParams(encodedParams).toString();

        if (method === 'GET') {
            urlWithParams.search = body;
        }

        const response = await fetch(urlWithParams.toString(), {
            method,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: method === 'POST' ? body : undefined,
        });

        return response.json();
    }
}

/**
 * Create an AlibabaAPI client from plugin context settings.
 * Reads credentials from ctx.settings with key 'alibaba_1688.credentials'.
 */
export async function createClient(ctx: {
    settings?: { get(key: string): Promise<string | null> };
}): Promise<AlibabaAPI> {
    if (!ctx.settings) {
        throw new Error('Settings not available');
    }

    const raw = await ctx.settings.get('alibaba_1688.credentials');
    if (!raw) {
        throw new Error('1688 API credentials not configured. Go to Settings → 1688 to configure.');
    }

    const credentials: AlibabaCredentials = JSON.parse(raw);
    if (!credentials.appKey || !credentials.appSecret || !credentials.accessToken) {
        throw new Error('Incomplete 1688 API credentials');
    }

    return new AlibabaAPI(credentials);
}
```

**Step 2: Commit**

```bash
git add plugins/alibaba-1688/src/server/alibaba-api.ts
git commit -m "feat(alibaba-1688): add AlibabaAPI client with HMAC-SHA1 signing"
```

---

### Task 4: Create utility modules

**Files:**
- Create: `plugins/alibaba-1688/src/server/utils/convert.ts`
- Create: `plugins/alibaba-1688/src/server/utils/price.ts`
- Create: `plugins/alibaba-1688/src/server/utils/image.ts`

**Step 1: Create convert.ts**

Migrated from `example/dsuni/apps/web/src/lib/convert.ts`. Includes `skuToAttributes` and `flattenCategories`.

```typescript
interface InputSku {
    skuId: string;
    salePrice: number;
    regularPrice: number;
    attributes: {
        id: number;
        name: string;
        value: string;
        nameEn?: string;
        valueEn?: string;
        skuImageUrl?: string;
    }[];
}

interface OutputAttribute {
    name: string;
    nameEn?: string;
    position: number;
    visible: boolean;
    variation: boolean;
    options: {
        id: number;
        name: string;
        nameEn?: string;
        value: string;
        valueEn?: string;
        image?: string;
    }[];
}

export function skuToAttributes(skuList: InputSku[]): OutputAttribute[] {
    const attributeMap = new Map<string, OutputAttribute>();
    const optionSets = new Map<string, Set<string>>();

    skuList?.forEach((sku) => {
        sku.attributes?.forEach((attr, attrIndex) => {
            const key = attr.nameEn ?? attr.name;
            if (!attributeMap.has(key)) {
                attributeMap.set(key, {
                    name: attr.name,
                    nameEn: attr.nameEn,
                    position: attrIndex + 1,
                    visible: true,
                    variation: true,
                    options: [],
                });
                optionSets.set(key, new Set());
            }

            const optionSet = optionSets.get(key)!;
            const optionValue = attr.valueEn ?? attr.value;
            if (!optionSet.has(optionValue)) {
                optionSet.add(optionValue);
                attributeMap.get(key)!.options.push({
                    id: attr.id,
                    name: attr.name,
                    nameEn: attr.nameEn,
                    value: attr.value,
                    valueEn: attr.valueEn,
                    image: attr.skuImageUrl ? attr.skuImageUrl.replace(/https:\/\/global-img-cdn\.1688\.com/g, 'https://cbu01.alicdn.com') : undefined,
                });
            }
        });
    });

    return Array.from(attributeMap.values());
}

interface NestedCategory {
    children?: NestedCategory[];
    level: number;
    cateId: string;
    cateName: string;
}

interface FlatCategory {
    level: number;
    id: string;
    name: string;
    parentId: number;
}

export function flattenCategories(categories: NestedCategory[]): FlatCategory[] {
    const result: FlatCategory[] = [];

    function flatten(category: NestedCategory, parentId = 0) {
        result.push({
            level: category.level,
            id: category.cateId,
            name: category.cateName,
            parentId,
        });
        if (category.children && category.children.length > 0) {
            category.children.forEach(child => {
                flatten(child, parseInt(category.cateId));
            });
        }
    }

    categories.forEach(category => flatten(category));
    return result;
}
```

**Step 2: Create price.ts**

Migrated from `example/dsuni/apps/web/src/lib/price.ts`.

```typescript
export function getPriceRange(data: { variations?: { salePrice: number | null }[]; salePrice?: number }): { minPrice: number; maxPrice: number } {
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    if (data.variations?.length) {
        let found = false;
        for (const item of data.variations) {
            if (item.salePrice !== null) {
                found = true;
                const price = Number(item.salePrice);
                if (!isNaN(price)) {
                    minPrice = Math.min(minPrice, price);
                    maxPrice = Math.max(maxPrice, price);
                }
            }
        }
        if (!found) {
            throw new Error('No valid prices found');
        }
    } else {
        minPrice = Number(data.salePrice);
        maxPrice = Number(data.salePrice);
    }

    return { minPrice, maxPrice };
}

export function getPrice(data: {
    price?: number;
    promotionPrice?: number;
    jxhyPrice?: number;
    consignPrice?: number;
    pfJxhyPrice?: number;
}): number {
    const validPrices = [data.price, data.jxhyPrice, data.consignPrice, data.pfJxhyPrice, data.promotionPrice]
        .filter((p): p is number => p !== undefined && p !== null && p !== 0);

    if (validPrices.length === 0) return 0;
    return Math.min(...validPrices);
}

export function calcPrice(price: number, coefficient = 1.15): number {
    const result = price * coefficient;
    return Number((Math.round(result * 100) / 100).toFixed(2));
}
```

**Step 3: Create image.ts**

Migrated from `example/dsuni/apps/web/src/lib/url.ts`.

```typescript
export function replace1688Image(url: string): string {
    return url.replace(/https:\/\/global-img-cdn\.1688\.com/g, 'https://cbu01.alicdn.com');
}
```

**Step 4: Commit**

```bash
git add plugins/alibaba-1688/src/server/utils/
git commit -m "feat(alibaba-1688): add convert, price, and image utility modules"
```

---

### Task 5: Create permissions and language enum

**Files:**
- Create: `plugins/alibaba-1688/src/server/permissions.ts`

**Step 1: Create permissions.ts**

```typescript
import { z } from 'zod';

export const PERMISSIONS = {
    product: {
        search: 'alibaba_1688.product.search',
        detail: 'alibaba_1688.product.detail',
    },
    tools: {
        use: 'alibaba_1688.tools.use',
    },
    settings: {
        manage: 'alibaba_1688.settings.manage',
    },
} as const;

export const AlibabaLanguage = z.enum([
    'zh', 'en', 'ja', 'ko', 'ru', 'vi', 'fr', 'pt', 'zh-tw', 'es', 'id', 'th', 'ar',
]);
export type AlibabaLanguage = z.infer<typeof AlibabaLanguage>;
```

**Step 2: Commit**

```bash
git add plugins/alibaba-1688/src/server/permissions.ts
git commit -m "feat(alibaba-1688): add permission constants and language enum"
```

---

### Task 6: Create settings router

**Files:**
- Create: `plugins/alibaba-1688/src/server/routers/settings.ts`

**Step 1: Create settings.ts**

```typescript
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import { requirePermission } from '@wordrhyme/plugin';
import { z } from 'zod';
import { PERMISSIONS } from '../permissions';
import { AlibabaAPI } from '../alibaba-api';

const credentialsSchema = z.object({
    appKey: z.string().min(1),
    appSecret: z.string().min(1),
    accessToken: z.string().min(1),
});

const SETTINGS_KEY = 'alibaba_1688.credentials';

function maskSecret(value: string): string {
    if (value.length <= 6) return '***';
    return value.slice(0, 3) + '***' + value.slice(-3);
}

export const settingsRouter = pluginRouter({
    get: pluginProcedure
        .query(async ({ ctx }) => {
            await requirePermission(ctx, PERMISSIONS.settings.manage);

            if (!ctx.settings) return null;

            const raw = await ctx.settings.get(SETTINGS_KEY);
            if (!raw) return null;

            const credentials = JSON.parse(raw);
            return {
                appKey: credentials.appKey ?? '',
                appSecret: credentials.appSecret ? maskSecret(credentials.appSecret) : '',
                accessToken: credentials.accessToken ? maskSecret(credentials.accessToken) : '',
                configured: true,
            };
        }),

    update: pluginProcedure
        .input(credentialsSchema)
        .mutation(async ({ input, ctx }) => {
            await requirePermission(ctx, PERMISSIONS.settings.manage);

            if (!ctx.settings) throw new Error('Settings not available');

            await ctx.settings.set(SETTINGS_KEY, JSON.stringify(input));

            ctx.logger.info('1688 API credentials updated');
            return { success: true };
        }),

    testConnection: pluginProcedure
        .mutation(async ({ ctx }) => {
            await requirePermission(ctx, PERMISSIONS.settings.manage);

            if (!ctx.settings) throw new Error('Settings not available');

            const raw = await ctx.settings.get(SETTINGS_KEY);
            if (!raw) {
                return { success: false, message: 'No credentials configured' };
            }

            const credentials = JSON.parse(raw);
            const client = new AlibabaAPI(credentials);

            try {
                // Use a lightweight search query as connection test
                const res = await client.request({
                    path: '/com.alibaba.fenxiao.crossborder/product.search.keywordQuery',
                    method: 'GET',
                    params: {
                        offerQueryParam: {
                            keyword: 'test',
                            country: 'en',
                            beginPage: 1,
                            pageSize: 1,
                        },
                    },
                });

                const success = !res.error_code;
                return {
                    success,
                    message: success
                        ? 'Connection to 1688 API verified'
                        : `API error: ${res.error_message || 'Unknown error'}`,
                    testedAt: new Date().toISOString(),
                };
            } catch (err) {
                return {
                    success: false,
                    message: err instanceof Error ? err.message : 'Connection failed',
                };
            }
        }),
});
```

**Step 2: Commit**

```bash
git add plugins/alibaba-1688/src/server/routers/settings.ts
git commit -m "feat(alibaba-1688): add settings router for credential management"
```

---

### Task 7: Create product router

**Files:**
- Create: `plugins/alibaba-1688/src/server/routers/product.ts`

**Step 1: Create product.ts**

Migrated from `example/dsuni/apps/web/src/server/api/routers/alibaba.ts`. Adapted to pluginRouter + requirePermission.

```typescript
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import { requirePermission } from '@wordrhyme/plugin';
import { z } from 'zod';
import { PERMISSIONS, AlibabaLanguage } from '../permissions';
import { createClient } from '../alibaba-api';

const searchSchema = z.object({
    keyword: z.string().optional(),
    sort: z.string().optional(),
    outMemberId: z.string().optional(),
    priceStart: z.string().optional(),
    priceEnd: z.string().optional(),
    categoryId: z.number().optional(),
    country: AlibabaLanguage.default('en'),
    filter: z.string().optional(),
    productCollectionId: z.string().optional(),
    imageId: z.string().optional(),
    regionOpp: z.string().optional(),
    snId: z.string().optional(),
    page: z.coerce.number().default(1),
    pageSize: z.coerce.number().default(40),
    cursor: z.number().optional(),
});

const imageSearchSchema = z.object({
    imageId: z.string(),
    country: AlibabaLanguage.default('en'),
    region: z.string().optional(),
    auxiliaryText: z.string().optional(),
    page: z.coerce.number().default(1),
    pageSize: z.coerce.number().default(40),
});

const detailSchema = z.object({
    offerId: z.number(),
    country: AlibabaLanguage.default('en'),
    outMemberId: z.string().optional(),
});

const topListSchema = z.object({
    rankId: z.string(),
    rankType: z.enum(['complex', 'hot', 'goodPrice']).default('complex'),
    language: AlibabaLanguage.default('en'),
    limit: z.number().default(20),
});

const imageUploadSchema = z.object({
    file: z.string(),
});

export const productRouter = pluginRouter({
    search: pluginProcedure
        .input(searchSchema)
        .query(async ({ input, ctx }) => {
            await requirePermission(ctx, PERMISSIONS.product.search);
            const client = await createClient(ctx);

            const { imageId, page, cursor, pageSize, ...others } = input;

            let path = '/com.alibaba.fenxiao.crossborder/product.search.keywordQuery';
            const params: Record<string, unknown> = {
                ...others,
                beginPage: cursor ?? page,
                pageSize,
            };

            if (imageId) {
                path = '/com.alibaba.fenxiao.crossborder/product.search.imageQuery';
                params.imageId = imageId;
            }

            const res = await client.request({
                method: 'GET',
                path,
                params: { offerQueryParam: params },
            });

            return res.result?.result ?? res;
        }),

    detail: pluginProcedure
        .input(detailSchema)
        .query(async ({ input, ctx }) => {
            await requirePermission(ctx, PERMISSIONS.product.detail);
            const client = await createClient(ctx);

            const res = await client.request({
                path: '/com.alibaba.fenxiao.crossborder/product.search.queryProductDetail',
                method: 'GET',
                params: {
                    offerDetailParam: {
                        ...input,
                        country: input.country || 'en',
                    },
                },
            });

            if (res.result?.success) {
                return res.result.result;
            }
            return res.result;
        }),

    imageSearch: pluginProcedure
        .input(imageSearchSchema)
        .query(async ({ input, ctx }) => {
            await requirePermission(ctx, PERMISSIONS.product.search);
            const client = await createClient(ctx);

            const res = await client.request({
                path: '/com.alibaba.fenxiao.crossborder/product.search.imageQuery',
                method: 'GET',
                params: { offerQueryParam: input },
            });

            return res.result?.result ?? res;
        }),

    topList: pluginProcedure
        .input(topListSchema)
        .query(async ({ input, ctx }) => {
            await requirePermission(ctx, PERMISSIONS.product.search);
            const client = await createClient(ctx);

            const res = await client.request({
                path: '/com.alibaba.fenxiao.crossborder/product.topList.query',
                method: 'GET',
                params: { rankQueryParams: input },
            });

            return res;
        }),

    imageUpload: pluginProcedure
        .input(imageUploadSchema)
        .mutation(async ({ input, ctx }) => {
            await requirePermission(ctx, PERMISSIONS.product.search);
            const client = await createClient(ctx);

            const res = await client.request({
                path: '/com.alibaba.fenxiao.crossborder/product.image.upload',
                method: 'POST',
                params: {
                    uploadImageParam: { imageBase64: input.file },
                },
            });

            return res;
        }),
});
```

**Step 2: Commit**

```bash
git add plugins/alibaba-1688/src/server/routers/product.ts
git commit -m "feat(alibaba-1688): add product router with search, detail, image search, top list"
```

---

### Task 8: Create tools router

**Files:**
- Create: `plugins/alibaba-1688/src/server/routers/tools.ts`

**Step 1: Create tools.ts**

```typescript
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import { requirePermission } from '@wordrhyme/plugin';
import { z } from 'zod';
import { PERMISSIONS, AlibabaLanguage } from '../permissions';
import { createClient } from '../alibaba-api';

const hotKeywordSchema = z.object({
    country: AlibabaLanguage.default('en'),
    categoryId: z.string(),
    hotKeywordType: z.string().default('cate'),
});

const estimateFreightSchema = z.object({
    offerId: z.number(),
    toProvinceCode: z.string(),
    toCityCode: z.string(),
    toCountryCode: z.string(),
    totalNum: z.number(),
});

export const toolsRouter = pluginRouter({
    hotKeyword: pluginProcedure
        .input(hotKeywordSchema)
        .query(async ({ input, ctx }) => {
            await requirePermission(ctx, PERMISSIONS.tools.use);
            const client = await createClient(ctx);

            const res = await client.request({
                path: '/com.alibaba.fenxiao.crossborder/product.search.topKeyword',
                method: 'GET',
                params: {
                    topSeKeywordParam: {
                        ...input,
                        sourceId: input.categoryId,
                    },
                },
            });

            return res.result?.result ?? [];
        }),

    estimateFreight: pluginProcedure
        .input(estimateFreightSchema)
        .query(async ({ input, ctx }) => {
            await requirePermission(ctx, PERMISSIONS.tools.use);
            const client = await createClient(ctx);

            const res = await client.request({
                path: '/com.alibaba.fenxiao.crossborder/product.freight.estimate',
                method: 'GET',
                params: { productFreightQueryParamsNew: input },
            });

            return res;
        }),
});
```

**Step 2: Commit**

```bash
git add plugins/alibaba-1688/src/server/routers/tools.ts
git commit -m "feat(alibaba-1688): add tools router with hot keywords and freight estimation"
```

---

### Task 9: Rewrite server entry

**Files:**
- Modify: `plugins/alibaba-1688/src/server/index.ts`

**Step 1: Replace server/index.ts**

```typescript
import { pluginRouter } from '@wordrhyme/plugin/server';
import type { PluginContext } from '@wordrhyme/plugin';
import { productRouter } from './routers/product';
import { toolsRouter } from './routers/tools';
import { settingsRouter } from './routers/settings';

export const router = pluginRouter({
    product: productRouter,
    tools: toolsRouter,
    settings: settingsRouter,
});

export type Alibaba1688Router = typeof router;

export async function onEnable(ctx: PluginContext) {
    ctx.logger.info('Alibaba 1688 integration enabled', {
        tRPC: '/trpc/pluginApis.alibaba-1688.*',
        requires: 'com.wordrhyme.dsuni',
        capabilities: [
            'product.search',
            'product.detail',
            'product.imageSearch',
            'product.topList',
            'product.imageUpload',
            'tools.hotKeyword',
            'tools.estimateFreight',
            'settings.get',
            'settings.update',
            'settings.testConnection',
        ],
    });
}

export async function onDisable(ctx: PluginContext) {
    ctx.logger.info('Alibaba 1688 integration disabled');
}
```

**Step 2: Commit**

```bash
git add plugins/alibaba-1688/src/server/index.ts
git commit -m "feat(alibaba-1688): rewrite server entry with product, tools, settings routers"
```

---

### Task 10: Create admin UI

**Files:**
- Create: `plugins/alibaba-1688/src/admin/index.tsx`
- Create: `plugins/alibaba-1688/src/admin/pages/Settings.tsx`

**Step 1: Create admin/index.tsx**

```tsx
import { settingsExtension } from '@wordrhyme/plugin';
import { Alibaba1688Settings } from './pages/Settings';

export const extensions = [
    settingsExtension({
        id: 'alibaba_1688.settings',
        label: '1688',
        order: 51,
        component: Alibaba1688Settings,
    }),
];

export async function init(): Promise<void> {
    console.log('[Alibaba 1688] Admin UI initialized');
}

export default { extensions, init };
```

**Step 2: Create admin/pages/Settings.tsx**

```tsx
import React, { useState, useEffect, useCallback } from 'react';

const PLUGIN_API = '/trpc/pluginApis.alibaba-1688';

interface CredentialInfo {
    appKey: string;
    appSecret: string;
    accessToken: string;
    configured: boolean;
}

export function Alibaba1688Settings() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [form, setForm] = useState({ appKey: '', appSecret: '', accessToken: '' });
    const [configured, setConfigured] = useState(false);

    const fetchSettings = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${PLUGIN_API}.settings.get`);
            const data = await res.json();
            if (data.result?.data) {
                const info: CredentialInfo = data.result.data;
                setForm({
                    appKey: info.appKey,
                    appSecret: '',
                    accessToken: '',
                });
                setConfigured(info.configured);
            }
        } catch (err) {
            console.error('Failed to fetch settings:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

    const handleSave = async () => {
        if (!form.appKey || !form.appSecret || !form.accessToken) {
            alert('Please fill in all fields');
            return;
        }
        setSaving(true);
        setTestResult(null);
        try {
            const res = await fetch(`${PLUGIN_API}.settings.update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (data.result?.data?.success) {
                setConfigured(true);
                fetchSettings();
            }
        } catch (err) {
            console.error('Failed to save:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch(`${PLUGIN_API}.settings.testConnection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            setTestResult(data.result?.data ?? { success: false, message: 'Unknown error' });
        } catch (err) {
            setTestResult({ success: false, message: String(err) });
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return <div className="text-center py-12 text-muted-foreground">Loading settings...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold">Alibaba 1688 Integration</h3>
                <p className="text-sm text-muted-foreground">
                    Configure your 1688 Open Platform API credentials to enable product search and sync.
                </p>
            </div>

            {/* Credentials Form */}
            <div className="rounded-lg border p-6 space-y-4">
                <h4 className="font-medium">API Credentials</h4>
                <p className="text-sm text-muted-foreground">
                    Get your credentials from{' '}
                    <a href="https://open.1688.com" target="_blank" rel="noreferrer"
                       className="text-primary hover:underline">
                        1688 Open Platform
                    </a>.
                </p>

                <div className="grid gap-4">
                    <div>
                        <label className="text-sm font-medium">App Key</label>
                        <input
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                            value={form.appKey}
                            onChange={e => setForm(prev => ({ ...prev, appKey: e.target.value }))}
                            placeholder="Your App Key"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium">App Secret</label>
                        <input
                            type="password"
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                            value={form.appSecret}
                            onChange={e => setForm(prev => ({ ...prev, appSecret: e.target.value }))}
                            placeholder={configured ? '••• (saved, enter new value to update)' : 'Your App Secret'}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium">Access Token</label>
                        <input
                            type="password"
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                            value={form.accessToken}
                            onChange={e => setForm(prev => ({ ...prev, accessToken: e.target.value }))}
                            placeholder={configured ? '••• (saved, enter new value to update)' : 'Your Access Token'}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                    <button
                        className="inline-flex items-center rounded-md bg-primary text-primary-foreground h-9 px-4 text-sm font-medium disabled:opacity-50"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save Credentials'}
                    </button>
                    {configured && (
                        <span className="text-xs text-green-600 dark:text-green-400">Configured</span>
                    )}
                </div>
            </div>

            {/* Connection Test */}
            <div className="rounded-lg border p-6 space-y-4">
                <h4 className="font-medium">Connection Test</h4>
                <p className="text-sm text-muted-foreground">
                    Verify your credentials by testing the connection to 1688 API.
                </p>

                <div className="flex items-center gap-3">
                    <button
                        className="inline-flex items-center rounded-md border h-9 px-4 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                        onClick={handleTest}
                        disabled={testing || !configured}
                    >
                        {testing ? 'Testing...' : 'Test Connection'}
                    </button>

                    {testResult && (
                        <div className={`text-sm ${testResult.success
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'}`}
                        >
                            {testResult.success ? 'Connected' : `Failed: ${testResult.message}`}
                        </div>
                    )}
                </div>

                {!configured && (
                    <p className="text-xs text-muted-foreground">
                        Save credentials first before testing the connection.
                    </p>
                )}
            </div>
        </div>
    );
}

export default Alibaba1688Settings;
```

**Step 3: Commit**

```bash
git add plugins/alibaba-1688/src/admin/
git commit -m "feat(alibaba-1688): add admin Settings page with credential config and connection test"
```

---

### Task 11: Install dependencies and verify build

**Step 1: Install dependencies**

```bash
cd plugins/alibaba-1688 && pnpm install
```

**Step 2: Build server**

```bash
pnpm run build:server
```

Expected: Build succeeds, output in `dist/server/`.

**Step 3: Build admin**

```bash
pnpm run build:admin
```

Expected: Build succeeds, output in `dist/admin/` with `remoteEntry.js`.

**Step 4: Commit build artifacts cleanup (if any tsconfig/config adjustments needed)**

Fix any build errors, then:

```bash
git add -A plugins/alibaba-1688/
git commit -m "feat(alibaba-1688): verify build passes for server and admin"
```
