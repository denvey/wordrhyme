# Permission Constants Usage Guide

> **类型安全 + 常量导入的最佳实践**
>
> 解决字符串拼写错误问题，同时支持插件动态注册。

---

## ✅ 最终方案：常量对象 + 类型推断

### 核心设计

```typescript
// constants.ts

// 1. 常量对象定义
export const Actions = {
    manage: 'manage',
    create: 'create',
    read: 'read',
    update: 'update',
    delete: 'delete',
} as const;

export const Subjects = {
    All: 'All',
    User: 'User',
    Content: 'Content',
    // ...
} as const;

// 2. 类型自动推导
export type AppAction = typeof Actions[keyof typeof Actions];
export type AppSubject = typeof Subjects[keyof typeof Subjects] | `plugin:${string}`;

// 3. 数组导出（for 遍历）
export const APP_ACTIONS = Object.values(Actions);
export const APP_SUBJECTS = Object.values(Subjects);
```

---

## 📝 实际使用

### ✅ Router 中使用常量

```typescript
import { Actions, Subjects } from '@/permission/constants';

export const articlesRouter = router({
  list: protectedProcedure
    .meta({ permission: {
      action: Actions.read,        // ← 常量，不会拼错
      subject: Subjects.Content    // ← IDE 自动补全
    }})
    .query(async () => { /* ... */ }),

  create: protectedProcedure
    .meta({ permission: {
      action: Actions.create,      // ← 类型安全
      subject: Subjects.Content
    }})
    .mutation(async () => { /* ... */ }),

  update: protectedProcedure
    .meta({ permission: {
      action: Actions.update,
      subject: Subjects.Content
    }})
    .mutation(async () => { /* ... */ }),
});
```

**优势**：
- ✅ **零拼写错误**：`Actions.updte` → 编译错误
- ✅ **IDE 自动补全**：输入 `Actions.` 自动提示所有选项
- ✅ **重构友好**：修改常量值，所有引用自动更新
- ✅ **代码简洁**：比字符串短

---

## 🎯 常量对象设计细节

### Actions 常量

```typescript
export const Actions = {
    /** 完全管理权限（包含所有 CRUD） */
    manage: 'manage',
    /** 创建新记录 */
    create: 'create',
    /** 读取/查看记录 */
    read: 'read',
    /** 更新现有记录 */
    update: 'update',
    /** 删除记录 */
    delete: 'delete',
} as const;
```

**为什么移除 test？**
- ❌ 太特化，只为 webhook 服务
- ✅ webhook 测试可以用 `Actions.update` 代替

### Subjects 常量

```typescript
export const Subjects = {
    /** 通配符 - 匹配所有资源 */
    All: 'All',
    /** 用户账户 */
    User: 'User',
    /** 组织/租户 */
    Organization: 'Organization',
    /** 团队 */
    Team: 'Team',
    /** 内容（文章、帖子） */
    Content: 'Content',
    /** 导航菜单 */
    Menu: 'Menu',
    /** 插件管理 */
    Plugin: 'Plugin',
    /** 角色管理 */
    Role: 'Role',
    /** 权限配置 */
    Permission: 'Permission',
    /** 审计日志 */
    AuditLog: 'AuditLog',
    /** 系统设置 */
    Settings: 'Settings',
    /** 功能开关 */
    FeatureFlag: 'FeatureFlag',
    /** Webhooks */
    Webhook: 'Webhook',
} as const;
```

**命名规范**：
- ✅ PascalCase 单数形式
- ✅ 业务概念，非表名
- ✅ 简洁明了

---

## 🔌 插件动态 Subject

### 插件注册流程

**1. 插件 manifest.json 声明**

```json
{
  "id": "notification",
  "name": "Notification Plugin",
  "permissions": {
    "declares": [
      {
        "subject": "plugin:notification",
        "description": "通知消息管理"
      }
    ]
  }
}
```

**2. 插件启动时自动注册**

```typescript
// 插件启动钩子
async onEnable(context: PluginContext) {
  // 自动写入 role_permissions 表（仅元数据）
  await context.db.insert(rolePermissions).values({
    roleId: 'system-metadata',  // 特殊标记
    action: 'read',
    subject: 'plugin:notification',
    source: 'plugin-notification',  // 标记来源
  });
}
```

**3. Admin UI 自动发现**

```typescript
// permissions.meta API 自动返回插件 subjects
const { data } = await trpc.permissions.meta.useQuery();

// data.subjects 包含：
// [
//   { value: 'User', label: '用户', isPlugin: false },
//   { value: 'Content', label: '内容', isPlugin: false },
//   { value: 'plugin:notification', label: 'plugin:notification', isPlugin: true },
// ]
```

---

## 🗄️ 数据库同步策略

### 核心原则

**constants.ts 是唯一真相源（Single Source of Truth）**

```
constants.ts (定义)
    ↓
数据库 role_permissions (存储字符串)
    ↓
Admin UI (显示选项)
```

### 同步方式

#### 方式 1: Seed 脚本（推荐）

```typescript
// db/seed/seed-permission-constants.ts

import { Actions, Subjects, SUBJECT_DISPLAY_NAMES } from '@/permission/constants';
import { db } from '@/db';
import { permissionMeta } from '@/db/schema';

async function syncPermissionConstants() {
  // 同步 subjects 元数据
  for (const [key, value] of Object.entries(Subjects)) {
    await db.insert(permissionMeta).values({
      type: 'subject',
      value: value,
      label: SUBJECT_DISPLAY_NAMES[value],
      isCore: true,
    }).onConflictDoUpdate({
      target: permissionMeta.value,
      set: { label: SUBJECT_DISPLAY_NAMES[value] },
    });
  }

  // 同步 actions 元数据
  for (const [key, value] of Object.entries(Actions)) {
    await db.insert(permissionMeta).values({
      type: 'action',
      value: value,
      label: ACTION_DISPLAY_NAMES[value],
    }).onConflictDoUpdate({
      target: permissionMeta.value,
      set: { label: ACTION_DISPLAY_NAMES[value] },
    });
  }
}
```

**运行时机**：
- ✅ 应用启动时自动同步
- ✅ 数据库迁移时同步
- ✅ `npm run db:seed` 手动同步

#### 方式 2: 运行时验证（可选）

```typescript
// permission-kernel.ts

import { isValidAction, isValidSubject } from './constants';

async function can(action: string, subject: string, ...) {
  // 验证 action 合法性
  if (!isValidAction(action)) {
    throw new Error(`Invalid action: ${action}`);
  }

  // 验证 subject 合法性（允许插件 subjects）
  if (!isValidSubject(subject)) {
    throw new Error(`Invalid subject: ${subject}`);
  }

  // ...
}
```

---

## 📊 完整架构

### 三层设计

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: 定义层 (constants.ts)                          │
│ - Actions 常量对象                                       │
│ - Subjects 常量对象                                      │
│ - 类型导出 (AppAction, AppSubject)                       │
│ - 显示名称/描述映射                                      │
└─────────────────────────────────────────────────────────┘
                        ↓ 导入
┌─────────────────────────────────────────────────────────┐
│ Layer 2: 声明层 (Router)                                │
│ .meta({ permission: {                                   │
│   action: Actions.update,    ← 使用常量                 │
│   subject: Subjects.Content  ← 类型安全                 │
│ }})                                                      │
└─────────────────────────────────────────────────────────┘
                        ↓ 检查
┌─────────────────────────────────────────────────────────┐
│ Layer 3: 配置层 (Database)                              │
│ role_permissions 表:                                     │
│ { roleId: 'editor',                                     │
│   action: 'update',    ← 存储字符串值                   │
│   subject: 'Content',                                   │
│   conditions: { ownerId: "${user.id}" } }               │
└─────────────────────────────────────────────────────────┘
                        ↓ 运行时
┌─────────────────────────────────────────────────────────┐
│ Layer 4: 执行层 (PermissionKernel + ScopedDb)          │
│ - RBAC 检查: user.roles → role_permissions             │
│ - ABAC 检查: conditions 匹配 + SQL 优化                │
│ - Field 过滤: permittedFields 自动应用                  │
└─────────────────────────────────────────────────────────┘
```

### 数据流

```
开发时：
  开发者写代码 → 导入 Actions/Subjects 常量 → TypeScript 检查

部署时：
  Seed 脚本运行 → 从 constants.ts 读取 → 写入 permission_meta 表

运行时：
  用户请求 → tRPC 中间件 → PermissionKernel.require(action, subject)
           → 查询 role_permissions → CASL 规则匹配 → 允许/拒绝
```

---

## 🎯 对比方案

| 方案 | 优点 | 缺点 | 评分 |
|------|------|------|------|
| **字符串字面量** | 简洁 | 易拼错，无提示 | ⭐⭐ |
| **Enum** | 类型安全 | 不支持 plugin subjects | ⭐⭐⭐ |
| **常量对象 (最终)** | 类型安全 + 简洁 + 可扩展 | 需要导入 | ⭐⭐⭐⭐⭐ |
| **Helper 函数** | 更简洁？ | 过度封装，不够灵活 | ⭐⭐⭐ |

---

## ✨ 实际收益

### Before (字符串字面量)

```typescript
// ❌ 问题：
// 1. 容易拼错 'updat'
// 2. 不知道有哪些可用 subjects
// 3. 重构困难

.meta({ permission: { action: 'update', subject: 'Content' } })
```

### After (常量对象)

```typescript
// ✅ 优势：
// 1. Actions.updte → 编译错误 ✅
// 2. IDE 提示所有 Actions/Subjects ✅
// 3. 重构：改 constants.ts 即可 ✅

import { Actions, Subjects } from '@/permission/constants';

.meta({ permission: { action: Actions.update, subject: Subjects.Content } })
```

**代码对比**：
- Before: 68 字符
- After: 74 字符 (+6 字符，+9%)
- 但换来：**零拼写错误 + IDE 支持 + 重构友好**

---

## 🔧 如何添加新 Subject

### Step 1: 更新 constants.ts

```typescript
export const Subjects = {
    // ... 现有 subjects
    Article: 'Article',  // ← 添加新 subject
} as const;

export const SUBJECT_DISPLAY_NAMES = {
    // ...
    [Subjects.Article]: '文章',  // ← 添加显示名称
};

export const SUBJECT_DESCRIPTIONS = {
    // ...
    [Subjects.Article]: '文章内容管理',  // ← 添加描述
};
```

### Step 2: 立即可用！

```typescript
// 无需修改类型，自动支持
.meta({ permission: {
  action: Actions.create,
  subject: Subjects.Article  // ← 自动补全 ✅
}})
```

### Step 3: 运行 seed 同步到数据库

```bash
npm run db:seed
```

---

## 📖 API 参考

### 导出的常量

```typescript
import {
  Actions,         // 常量对象 { manage: 'manage', create: 'create', ... }
  Subjects,        // 常量对象 { All: 'All', User: 'User', ... }
  APP_ACTIONS,     // 数组 ['manage', 'create', 'read', ...]
  APP_SUBJECTS,    // 数组 ['All', 'User', 'Organization', ...]
  AppAction,       // 类型 'manage' | 'create' | ...
  AppSubject,      // 类型 'All' | 'User' | ... | `plugin:${string}`
} from '@/permission/constants';
```

### 工具函数

```typescript
// 验证 action 合法性
isValidAction('manage')  // true
isValidAction('publish') // false

// 验证 subject 合法性（包括插件 subjects）
isValidSubject('User')  // true
isValidSubject('plugin:notification')  // true
isValidSubject('InvalidSubject')  // false

// 获取元数据（含插件 subjects）
getPermissionMeta(['plugin:notification'])
// → { subjects: [...], actions: [...] }
```

---

## 🚀 迁移指南

### 1. 安装导入

```typescript
// 在所有 router 文件顶部添加
import { Actions, Subjects } from '@/permission/constants';
```

### 2. 替换字符串

```bash
# 查找所有需要替换的地方
grep -r "action: '" apps/server/src/trpc/routers

# 逐个替换
# Before:
.meta({ permission: { action: 'update', subject: 'User' } })

# After:
.meta({ permission: { action: Actions.update, subject: Subjects.User } })
```

### 3. TypeScript 检查

```bash
# 编译检查所有引用
npm run type-check

# 如果报错，说明用了不存在的 subject
# ❌ Subjects.Article → 需要先在 constants.ts 中定义
```

---

**版本**: v3.0 (常量对象方案)
**最后更新**: 2025-01-30
**原则**: Type-Safe + Import Constants
