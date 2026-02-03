# Add CRUD Permission Hook - 实施任务清单

## 概述

本文档列出实现 `useCrudPermissions` hook 的具体任务。

---

## Task 1: 创建 useCrudPermissions Hook ✅

**文件**: `apps/admin/src/hooks/use-crud-permissions.ts` (已创建)

**内容**:

```typescript
import { useMemo } from 'react';
import { useAbility } from '@/lib/ability';
import type { MongoAbility } from '@casl/ability';
import type { z } from 'zod';
import type { CrudPermissions } from '@wordrhyme/auto-crud';

/**
 * 从 CASL ability 计算 CRUD 权限
 *
 * @param subject - CASL subject 名称 (如 'Employee', 'Article')
 * @param schema - Zod schema，用于获取全部字段列表
 * @returns CrudPermissions 对象，包含 can 和 deny
 */
export function useCrudPermissions<T extends z.ZodObject<z.ZodRawShape>>(
  subject: string,
  schema: T
): CrudPermissions {
  const ability = useAbility();

  return useMemo(() => {
    // 无权限系统时，默认全部允许
    if (!ability) {
      return {
        can: { create: true, update: true, delete: true, export: true },
        deny: []
      };
    }

    return {
      can: {
        create: ability.can('create', subject),
        update: ability.can('update', subject),
        delete: ability.can('delete', subject),
        export: ability.can('export', subject) || ability.can('read', subject),
      },
      deny: getDenyFields(ability, subject, schema),
    };
  }, [ability, subject, schema]);
}

/**
 * 从 CASL rules 提取禁止访问的字段
 */
function getDenyFields<T extends z.ZodObject<z.ZodRawShape>>(
  ability: MongoAbility,
  subject: string,
  schema: T
): string[] {
  const allFields = Object.keys(schema.shape);

  // 查找 read 规则中的 fields 限制
  const readRule = ability.rules.find(
    (r) => r.action === 'read' && r.subject === subject && r.fields && !r.inverted
  );

  if (!readRule?.fields) {
    // 无 fields 限制 = 全部允许
    return [];
  }

  // 计算差集：全部字段 - 允许字段 = 禁止字段
  const allowedFields = new Set(readRule.fields);
  return allFields.filter((f) => !allowedFields.has(f));
}
```

**验证**:
- [ ] `pnpm typecheck` 通过
- [ ] 无 AbilityProvider 时返回默认值（全部允许）
- [ ] 有权限限制时正确计算 can/deny

---

## Task 2: 导出 Hook ⏭️ (跳过)

**原因**: 项目 `hooks/` 目录无统一 `index.ts` 导出文件，各 hook 独立导入即可。

---

## Task 3: 添加单元测试 ✅

**文件**: `apps/admin/src/__tests__/components/use-crud-permissions.test.tsx` (已创建)

**测试覆盖**:
- SC-1: can 对象根据 ability 正确计算 (4 tests)
- SC-2: deny 数组反映 CASL fields 限制 (3 tests)
- SC-3: 无 AbilityProvider 时返回默认值 (2 tests)
- 边界情况 (2 tests)

**验证**: `pnpm test` - 11 tests passed

---

## Task 4: 集成示例页面验证 ✅

**文件**: `apps/admin/src/pages/PermissionTest.tsx` (已创建)

**路由**: `/test/permissions`

**验证内容**:
- 显示当前 Ability Rules 数量
- 显示 useCrudPermissions 返回值
- 可视化 can 操作权限状态
- 可视化 deny 字段列表
- 展示使用示例代码

---

## 验收标准

| ID | 标准 | 验证方法 |
|----|------|----------|
| SC-1 | `useCrudPermissions('Article', schema)` 返回正确的 can 对象 | 单元测试 |
| SC-2 | deny 数组正确反映 CASL fields 限制 | 单元测试 |
| SC-3 | 无 AbilityProvider 时返回默认值（全部允许） | 单元测试 |
| SC-4 | TypeScript 类型完整 | `pnpm typecheck` 通过 |

---

## 依赖关系

```
wordrhyme-crud (先完成)          wordrhyme (后完成)
┌─────────────────────────┐      ┌─────────────────────────┐
│ Task 1.1: 创建权限类型    │      │                         │
│ Task 1.2: 导出权限类型    │──────▶│ Task 1: 创建 hook       │
│ Task 2.x: 组件改造        │      │ Task 2: 导出            │
└─────────────────────────┘      │ Task 3: 测试            │
                                 │ Task 4: 集成验证         │
                                 └─────────────────────────┘
```

**前置条件**: `@wordrhyme/auto-crud` 需先支持 `permissions` prop 和导出 `CrudPermissions` 类型。

---

## 工作量估算

| Task | 预估时间 |
|------|----------|
| Task 1: 创建 Hook | 30min |
| Task 2: 导出 | 5min |
| Task 3: 单元测试 | 30min |
| Task 4: 集成验证 | 15min |
| **合计** | **~1.5h** |
