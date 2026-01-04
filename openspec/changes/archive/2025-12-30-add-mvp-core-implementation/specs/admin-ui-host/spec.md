# Admin UI Host Specification

## Overview

The Admin UI host is a React application built with **Rsbuild** (Rspack-powered build tool), **Module Federation 2.0**, and **`@wordrhyme/ui`** (centralized UI component package based on shadcn/ui + Tailwind CSS 4.0). It uses the **sidebar-07** layout template from shadcn/ui as the foundation.

## ADDED Requirements

### Requirement: @wordrhyme/ui Package

The Admin UI SHALL use the centralized `@wordrhyme/ui` package for all UI components. This package SHALL be shared across Admin, Web, and Plugins via Module Federation to eliminate component duplication.

#### Scenario: UI package installed
- **WHEN** the Admin UI project is initialized
- **THEN** `@wordrhyme/ui` is installed as a dependency
- **AND** all UI components are imported from `@wordrhyme/ui`
- **AND** the package is configured as a Module Federation shared dependency

#### Scenario: Plugin imports UI components
- **WHEN** a plugin needs UI components
- **THEN** it imports from `@wordrhyme/ui` (e.g., `import { Button } from '@wordrhyme/ui'`)
- **AND** Module Federation loads components from the host (no duplication)
- **AND** the plugin bundle does NOT include duplicate UI code

---

### Requirement: shadcn/ui + Tailwind 4.0 in @wordrhyme/ui

The `@wordrhyme/ui` package SHALL contain all shadcn/ui components and Tailwind CSS 4.0 configuration. The sidebar-07 template SHALL be included in this package.

#### Scenario: @wordrhyme/ui package structure
- **WHEN** `packages/ui` is created
- **THEN** shadcn/ui is initialized via `npx shadcn@latest init`
- **AND** sidebar-07 template is installed via `npx shadcn@latest add sidebar-07`
- **AND** Tailwind CSS 4.0 is configured with `@theme` directive in `src/styles/globals.css`
- **AND** all components are exported from `src/index.ts`

#### Scenario: shadcn/ui components available
- **WHEN** Admin/Web/Plugin imports from `@wordrhyme/ui`
- **THEN** the following are available:
  - UI primitives: `Button`, `Card`, `Dialog`, `Input`, `Label`, `Select`, `Table`, `Form`, etc.
  - Layout components: `AppSidebar`, `NavMain`, `NavUser`, `TeamSwitcher` (sidebar-07)
  - Utilities: `cn()` function, Tailwind theme classes

---

### Requirement: Module Federation Configuration

The Admin UI host SHALL be configured with Rsbuild + Module Federation 2.0. The host SHALL define extension points for plugins to inject UI components.

#### Scenario: Host application loads
- **WHEN** the Admin UI is accessed in a browser
- **THEN** the host application loads successfully
- **AND** the layout (header, sidebar, content area) is rendered
- **AND** no JavaScript errors occur

---

### Requirement: Plugin UI Loading

The host SHALL fetch plugin descriptors from the server API. For each plugin with `admin.remoteEntry` defined in `manifest.json`, the server SHALL provide a fully-resolved `admin.remoteEntryUrl` that the host can load via Module Federation.

#### Scenario: Plugin remote entry loaded
- **WHEN** the server API returns a plugin with `admin.remoteEntry = "./dist/admin/remoteEntry.js"`
- **AND** the server provides `admin.remoteEntryUrl = "/plugins/{pluginId}/static/admin/remoteEntry.js"`
- **THEN** the host loads `admin.remoteEntryUrl`
- **AND** the plugin's UI components are available for rendering
- **AND** the plugin appears in the sidebar (if it registered a sidebar item)

#### Scenario: Plugin UI error isolated
- **WHEN** a plugin's remote entry fails to load (404 or JS error)
- **THEN** an error boundary catches the error
- **AND** a fallback UI is displayed for that plugin
- **AND** other plugins continue to render normally

---

### Requirement: Extension Point Registry

The host SHALL provide an extension point registry. Supported extension points for MVP: `sidebar`, `settings.page`. Plugins SHALL register components at these extension points.

#### Scenario: Plugin registers sidebar item
- **WHEN** a plugin calls `registerExtension('sidebar', SidebarComponent)`
- **THEN** the sidebar component is rendered in the host's sidebar
- **AND** clicking the sidebar item navigates to the plugin's page

#### Scenario: Plugin registers settings page
- **WHEN** a plugin calls `registerExtension('settings.page', SettingsComponent)`
- **THEN** a new tab appears in the Settings page
- **AND** clicking the tab renders the plugin's settings UI

---

### Requirement: Authentication (MVP Stub)

For MVP, authentication SHALL be stubbed (hardcoded admin user or no auth). The Admin UI SHALL assume localhost access only. Post-MVP, better-auth integration will be added.

#### Scenario: No authentication required
- **WHEN** the Admin UI is accessed on localhost
- **THEN** no login page is shown
- **AND** the user is treated as "admin" with full access

---

### Requirement: Permission-Based Menu Loading

The host SHALL fetch menus from the `menus` table via tRPC API. Menus SHALL be filtered based on the current user's permissions. If a menu has no `requiredPermission`, it SHALL be visible to admin users by default.

#### Scenario: Menus fetched from database
- **WHEN** the Admin UI initializes
- **THEN** it calls `trpc.menu.list.useQuery({ target: 'admin' })`
- **AND** the server returns menu items from `menus` table filtered by user permissions
- **AND** the sidebar renders the menu items in hierarchical order

#### Scenario: Menu with required permission
- **WHEN** a menu item has `requiredPermission = 'plugin:seo:dashboard.read'`
- **AND** the current user has that permission
- **THEN** the menu item is displayed in the sidebar
- **AND** clicking it navigates to the menu's `path`

#### Scenario: Menu without required permission hidden
- **WHEN** a menu item has `requiredPermission = 'plugin:seo:settings.write'`
- **AND** the current user does NOT have that permission
- **THEN** the menu item is NOT displayed in the sidebar

#### Scenario: Menu without permission defaults to admin
- **WHEN** a menu item has `requiredPermission = null`
- **AND** the current user has admin role
- **THEN** the menu item is displayed (default fallback)

#### Scenario: Parent menu hidden cascades to children
- **WHEN** a parent menu is hidden due to permission check
- **THEN** all child menus are automatically hidden
- **AND** the child permission checks are skipped (optimization)

---

### Requirement: Dynamic Menu Registration on Plugin Install

When a plugin is installed, the server SHALL parse `admin.menus` from the manifest and insert records into `menus` table with `source = pluginId`. The Admin UI SHALL automatically refresh menus after plugin installation.

#### Scenario: Plugin menus registered on install
- **WHEN** a plugin is installed with manifest:
  ```json
  {
    "pluginId": "com.vendor.seo",
    "admin": {
      "menus": [
        {
          "id": "seo-dashboard",
          "label": "SEO Dashboard",
          "icon": "ChartBar",
          "path": "/plugins/seo/dashboard",
          "order": 10
        }
      ]
    }
  }
  ```
- **THEN** the server inserts a row into `menus` table with `source = 'com.vendor.seo'`
- **AND** the Admin UI refetches menu list
- **AND** the new menu appears in sidebar

#### Scenario: Plugin menus removed on uninstall
- **WHEN** a plugin is uninstalled
- **THEN** all rows in `menus` where `source = {uninstalledPluginId}` are deleted
- **AND** the Admin UI removes the menu items from sidebar

---

## Implementation Details

### @wordrhyme/ui Package Structure (Primitives Only)

```
packages/ui/
├── src/
│   ├── components/
│   │   └── ui/                    # shadcn/ui primitives only
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── dialog.tsx
│   │       ├── sidebar.tsx        # Sidebar primitives
│   │       └── ...                # 24 primitive components
│   ├── lib/
│   │   └── utils.ts               # cn() utility
│   ├── styles/
│   │   └── globals.css            # Tailwind 4.0 theme
│   └── index.ts                   # Public API (primitives only)
├── components.json                # shadcn/ui config
├── package.json
├── tsconfig.json
└── tailwind.config.ts
```

### Admin App Structure (Layout Components)

```
apps/admin/
├── src/
│   ├── components/
│   │   ├── app-sidebar.tsx        # sidebar-07 main component
│   │   ├── nav-main.tsx           # Primary navigation
│   │   ├── nav-projects.tsx       # Projects navigation
│   │   ├── nav-user.tsx           # User menu
│   │   └── team-switcher.tsx      # Org/workspace switcher
│   ├── pages/
│   └── main.tsx
└── components.json                # shadcn/ui config for admin
```

**Rationale**: Following shadcn-ui monorepo best practices:
- Shared primitives live in `packages/ui`
- App-specific layouts live in `apps/admin`
- Plugins import primitives from `@wordrhyme/ui`, build custom UIs

### @wordrhyme/ui Public API

```typescript
// packages/ui/src/index.ts
export * from './components/ui/button';
export * from './components/ui/card';
export * from './components/ui/dialog';
export * from './components/ui/sidebar';
export * from './components/ui/form';
// ... all primitive components

export { useIsMobile } from './hooks/use-mobile';
export { cn } from './lib/utils';
```

### package.json Configuration

```json
{
  "name": "@wordrhyme/ui",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./styles": "./src/styles/globals.css"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-dropdown-menu": "^2.1.4",
    "@radix-ui/react-label": "^2.1.1",
    "@radix-ui/react-select": "^2.1.4",
    "@radix-ui/react-slot": "^1.1.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.469.0",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "typescript": "^5.7.2"
  }
}
```

### shadcn/ui Configuration

#### `components.json` (Auto-generated by `shadcn init`)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/styles/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

#### Tailwind CSS 4.0 Configuration

```css
/* packages/ui/src/styles/globals.css */
@import "tailwindcss";

@theme {
  /* Color Palette */
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.15 0 0);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.15 0 0);
  --color-popover: oklch(1 0 0);
  --color-popover-foreground: oklch(0.15 0 0);

  --color-primary: oklch(0.42 0.19 265);
  --color-primary-foreground: oklch(0.98 0 0);

  --color-secondary: oklch(0.96 0 0);
  --color-secondary-foreground: oklch(0.15 0 0);

  --color-muted: oklch(0.96 0 0);
  --color-muted-foreground: oklch(0.46 0 0);

  --color-accent: oklch(0.96 0 0);
  --color-accent-foreground: oklch(0.15 0 0);

  --color-destructive: oklch(0.58 0.22 27);
  --color-destructive-foreground: oklch(0.98 0 0);

  --color-border: oklch(0.91 0 0);
  --color-input: oklch(0.91 0 0);
  --color-ring: oklch(0.42 0.19 265);

  /* Border Radius */
  --radius: 0.5rem;

  /* Sidebar */
  --color-sidebar-background: oklch(1 0 0);
  --color-sidebar-foreground: oklch(0.15 0 0);
  --color-sidebar-primary: oklch(0.42 0.19 265);
  --color-sidebar-primary-foreground: oklch(0.98 0 0);
  --color-sidebar-accent: oklch(0.96 0 0);
  --color-sidebar-accent-foreground: oklch(0.15 0 0);
  --color-sidebar-border: oklch(0.91 0 0);
  --color-sidebar-ring: oklch(0.42 0.19 265);
}

/* Dark theme (optional for MVP) */
@media (prefers-color-scheme: dark) {
  @theme {
    --color-background: oklch(0.15 0 0);
    --color-foreground: oklch(0.98 0 0);
    /* ... dark mode colors */
  }
}
```

---

### Admin App Integration

#### Import UI Package Styles

```tsx
// apps/admin/src/main.tsx
import '@wordrhyme/ui/styles'; // Import Tailwind theme
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
```

#### Rsbuild Configuration with Module Federation

```typescript
// apps/admin/rsbuild.config.ts
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],

  html: {
    template: './index.html',
  },

  source: {
    entry: {
      index: './src/main.tsx',
    },
  },

  // Module Federation 2.0
  moduleFederation: {
    options: {
      name: 'admin_host',
      remotes: {}, // Dynamic remotes loaded at runtime
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
        '@wordrhyme/ui': {
          singleton: true,
          requiredVersion: '^0.1.0',
          eager: true, // Load immediately (not lazy)
        },
      },
    },
  },
});
```

**Key Points**:
- `@wordrhyme/ui` is marked as `singleton` - only one instance across all remotes
- `eager: true` - host loads UI package immediately
- Plugins inherit this configuration - they DON'T bundle `@wordrhyme/ui`

---

### sidebar-07 Layout Integration

#### App Layout Structure

```tsx
// apps/admin/src/App.tsx
import { SidebarProvider } from '@wordrhyme/ui';
import { AppSidebar } from './components/app-sidebar';
import { Outlet } from 'react-router-dom';

export function App() {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
```

#### Dynamic Sidebar with Database Menus

```tsx
// apps/admin/src/components/app-sidebar.tsx
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@wordrhyme/ui';
import { trpc } from '@/lib/trpc';
import { NavUser } from '@wordrhyme/ui';
import { TeamSwitcher } from '@wordrhyme/ui';
import * as LucideIcons from 'lucide-react';

export function AppSidebar() {
  const { data: menus, isLoading } = trpc.menu.list.useQuery({ target: 'admin' });

  // Build menu tree (parent-child hierarchy)
  const menuTree = buildMenuTree(menus || []);

  return (
    <Sidebar>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {menuTree.map((menu) => (
            <MenuItem key={menu.id} menu={menu} />
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

function MenuItem({ menu }: { menu: MenuNode }) {
  const Icon = menu.icon ? LucideIcons[menu.icon as keyof typeof LucideIcons] : null;

  if (menu.children.length > 0) {
    // Collapsible group
    return (
      <SidebarMenuItem>
        <SidebarMenuButton>
          {Icon && <Icon className="h-4 w-4" />}
          <span>{menu.label}</span>
        </SidebarMenuButton>
        <SidebarMenu>
          {menu.children.map((child) => (
            <MenuItem key={child.id} menu={child} />
          ))}
        </SidebarMenu>
      </SidebarMenuItem>
    );
  }

  // Leaf item
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <a href={menu.path}>
          {Icon && <Icon className="h-4 w-4" />}
          <span>{menu.label}</span>
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function buildMenuTree(menus: Menu[]): MenuNode[] {
  const map = new Map<string, MenuNode>();
  const roots: MenuNode[] = [];

  // First pass: create nodes
  menus.forEach((menu) => {
    map.set(menu.id, { ...menu, children: [] });
  });

  // Second pass: build tree
  menus.forEach((menu) => {
    const node = map.get(menu.id)!;
    if (menu.parentId) {
      const parent = map.get(menu.parentId);
      if (parent) {
        parent.children.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  return roots;
}

interface MenuNode extends Menu {
  children: MenuNode[];
}
```

---

### Plugin Integration Example

```typescript
// plugins/hello-world/src/admin/index.tsx
import { Button, Card, CardHeader, CardTitle, CardContent } from '@wordrhyme/ui';

export function HelloWorldSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hello World Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <Button>Click me!</Button>
      </CardContent>
    </Card>
  );
}
```

**Plugin Rsbuild Config**:
```typescript
// plugins/hello-world/rsbuild.config.ts
export default defineConfig({
  moduleFederation: {
    options: {
      name: 'plugin_hello_world',
      exposes: {
        './Settings': './src/admin/index.tsx',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
        '@wordrhyme/ui': {
          singleton: true,
          requiredVersion: '^0.1.0',
          // Import from host, don't bundle
        },
      },
    },
  },
});
```

**Result**: Plugin bundle does NOT include `@wordrhyme/ui` code - loaded from host at runtime.

---

### tRPC Menu Procedure (Server)

```typescript
// apps/server/src/trpc/routers/menu.ts
import { router, protectedProcedure } from '../trpc';
import { z } from 'zod';
import { db } from '../../db';
import { menus } from '../../db/schema';
import { eq, and } from 'drizzle-orm';

export const menuRouter = router({
  list: protectedProcedure
    .input(z.object({ target: z.enum(['admin', 'web']) }))
    .query(async ({ input, ctx }) => {
      // 1. 查询所有菜单（当前组织 + 目标应用）
      const allMenus = await db.query.menus.findMany({
        where: and(
          eq(menus.organizationId, ctx.organizationId),
          eq(menus.target, input.target)
        ),
        orderBy: (items, { asc }) => [asc(items.order)],
      });

      // 2. 权限过滤
      const filteredMenus = [];
      for (const menu of allMenus) {
        if (!menu.requiredPermission) {
          // 无权限要求 → 默认管理员可见
          if (ctx.isAdmin) {
            filteredMenus.push(menu);
          }
        } else {
          // 有权限要求 → 检查权限
          const hasPermission = await ctx.permissionKernel.can(menu.requiredPermission);
          if (hasPermission) {
            filteredMenus.push(menu);
          }
        }
      }

      // 3. 过滤孤儿菜单（父菜单被隐藏的子菜单）
      const menuIds = new Set(filteredMenus.map(m => m.id));
      const validMenus = filteredMenus.filter(m =>
        !m.parentId || menuIds.has(m.parentId)
      );

      return validMenus;
    }),
});
```

### Menu Registry (Server)

```typescript
// apps/server/src/core/menu-registry.ts
import { db } from '../db';
import { menus } from '../db/schema';
import type { PluginManifest } from '@wordrhyme/plugin';
import { eq } from 'drizzle-orm';

export class MenuRegistry {
  /**
   * 注册插件菜单（安装时调用）
   */
  async registerPluginMenus(manifest: PluginManifest, organizationId: string): Promise<void> {
    const menusToInsert = [];

    // Admin menus
    if (manifest.admin?.menus) {
      for (const menu of manifest.admin.menus) {
        menusToInsert.push({
          id: `${manifest.pluginId}:${menu.id}`,
          source: manifest.pluginId, // 插件 ID
          organizationId,
          label: menu.label,
          icon: menu.icon || null,
          path: menu.path,
          parentId: menu.parentId ? `${manifest.pluginId}:${menu.parentId}` : null,
          order: menu.order || 0,
          requiredPermission: menu.requiredPermission || null,
          target: 'admin' as const,
          metadata: menu.metadata || null,
        });
      }
    }

    // Web menus
    if (manifest.web?.menus) {
      for (const menu of manifest.web.menus) {
        menusToInsert.push({
          id: `${manifest.pluginId}:${menu.id}`,
          source: manifest.pluginId, // 插件 ID
          organizationId,
          label: menu.label,
          icon: menu.icon || null,
          path: menu.path,
          parentId: menu.parentId ? `${manifest.pluginId}:${menu.parentId}` : null,
          order: menu.order || 0,
          requiredPermission: menu.requiredPermission || null,
          target: 'web' as const,
          metadata: menu.metadata || null,
        });
      }
    }

    if (menusToInsert.length > 0) {
      await db.insert(menus)
        .values(menusToInsert)
        .onConflictDoNothing(); // 幂等性
    }

    console.log(`✅ Registered ${menusToInsert.length} menus for plugin ${manifest.pluginId}`);
  }

  /**
   * 注册 Core 菜单（seed 脚本调用）
   */
  async registerCoreMenus(organizationId: string): Promise<void> {
    const coreMenus = [
      {
        id: 'core:settings',
        source: 'core',
        organizationId,
        label: '系统设置',
        icon: 'Settings',
        path: '/settings',
        order: 100,
        target: 'admin' as const,
        requiredPermission: 'organization:update:organization',
      },
      {
        id: 'core:users',
        source: 'core',
        organizationId,
        label: '用户管理',
        icon: 'Users',
        path: '/settings/users',
        parentId: 'core:settings',
        order: 10,
        target: 'admin' as const,
        requiredPermission: 'user:manage:organization',
      },
    ];

    await db.insert(menus)
      .values(coreMenus)
      .onConflictDoNothing();

    console.log(`✅ Registered ${coreMenus.length} core menus`);
  }

  /**
   * 删除插件菜单（卸载时调用）
   */
  async unregisterMenus(source: string): Promise<void> {
    const deleted = await db.delete(menus)
      .where(eq(menus.source, source));

    console.log(`🗑️  Removed ${deleted.rowCount} menus for source ${source}`);
  }
}

export const menuRegistry = new MenuRegistry();
```

---
