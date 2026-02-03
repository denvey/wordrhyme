# Change: Add CRUD Permission Hook

## Why

`@wordrhyme/auto-crud` 组件需要接入 wordrhyme 权限系统，实现：
1. **按钮显隐控制**：根据用户权限决定新建/编辑/删除按钮是否显示
2. **字段过滤控制**：根据 CASL rules 中的 fields 配置决定列/表单字段是否显示

当前问题：
- auto-crud 组件没有内置权限支持，需要使用者手动计算权限
- 权限计算逻辑应该在业务层（wordrhyme），但缺少统一的 hook

本变更在 wordrhyme 项目中新增 `useCrudPermissions` hook，从全局 AbilityProvider 获取权限并计算 CRUD 操作权限和字段过滤列表，供 `@wordrhyme/auto-crud` 组件使用。

## What Changes

### 核心机制

1. **useCrudPermissions Hook**（**NEW**）
   - 从全局 `AbilityProvider` 获取 CASL ability 实例
   - 计算 CRUD 操作权限（`can.create/update/delete/export`）
   - 从 CASL rules 提取禁止访问的字段列表（`deny`）
   - 返回 `CrudPermissions` 对象供 auto-crud 组件使用

2. **利用已有缓存**
   - 前端 ability 已通过 `trpc.permissions.myRules.useQuery` 缓存 5 分钟
   - 无需额外请求，直接从 ability 实例计算

### 代码示例

**使用方式**：
```tsx
import { useAutoCrudResource, AutoCrudTable } from '@wordrhyme/auto-crud';
import { useCrudPermissions } from '@/hooks/use-crud-permissions';
import { employeeSchema } from '@/schemas/employee';

export default function EmployeesPage() {
  const resource = useAutoCrudResource({
    routerName: 'employees',
    schema: employeeSchema,
  });

  // 从全局 ability 计算权限
  const permissions = useCrudPermissions('Employee', employeeSchema);

  return (
    <AutoCrudTable
      schema={employeeSchema}
      resource={resource}
      permissions={permissions}  // { can: { create, update, delete }, deny: ['salary'] }
    />
  );
}
```

**效果矩阵**：

| 用户角色 | create | update | delete | salary 列 |
|---------|--------|--------|--------|-----------|
| admin | ✅ 显示 | ✅ 显示 | ✅ 显示 | ✅ 显示 |
| hr | ❌ 隐藏 | ✅ 显示 | ❌ 隐藏 | ✅ 显示 |
| viewer | ❌ 隐藏 | ❌ 隐藏 | ❌ 隐藏 | ❌ 隐藏 |

## Impact

### Affected Specs
- 无（本变更不修改现有规范）

### Affected Code

#### 新增文件
- `apps/admin/src/hooks/use-crud-permissions.ts` - CRUD 权限计算 hook

#### 无修改文件
- 本变更仅新增 hook，不修改现有代码

### Dependencies

#### 前置条件
- `@wordrhyme/auto-crud` 需先支持 `permissions` prop（在 wordrhyme-crud 项目中实现）

#### 依赖的现有组件
- `apps/admin/src/lib/ability.tsx` - AbilityProvider 和 useAbility hook
- `apps/server/src/permission/permission-kernel.ts` - PermissionKernel（后端）

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| AbilityProvider 未配置 | 低 - hook 返回默认值 | 无 ability 时返回全部允许 |
| CASL rules 无 fields 配置 | 低 - 默认全部允许 | 返回空 deny 数组 |
| 性能问题 | 低 - 仅内存计算 | useMemo 缓存计算结果 |

## Success Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| SC-1 | `useCrudPermissions('Article', schema)` 返回正确的 can 对象 | 单元测试 |
| SC-2 | deny 数组正确反映 CASL fields 限制 | 单元测试 |
| SC-3 | 无 AbilityProvider 时返回默认值（全部允许） | 单元测试 |
| SC-4 | TypeScript 类型完整 | `pnpm typecheck` 通过 |

## Related Changes

- **wordrhyme-crud**: `openspec/changes/visibility-control/permission-integration-design.md`
  - auto-crud 组件需先支持 `permissions` prop
  - 本 hook 计算的结果传给 auto-crud 组件使用
