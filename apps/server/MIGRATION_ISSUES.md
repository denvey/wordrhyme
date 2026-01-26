# 🔧 迁移过程中遇到的问题及解决方案

## 问题总结

在 `tenantId` → `organizationId` 迁移过程中,遇到了以下问题:

---

## 问题 1: sed 命令清空文件 ❌

### 现象
```bash
sed -i '' 's/pattern/replacement/g' file.ts
# 结果: 文件被清空,变成 0 字节
```

### 原因
macOS 的 `sed -i ''` 命令在某些情况下会清空文件,而不是正确替换内容。

### 解决方案 ✅
改用 `perl -i -pe` 命令:
```bash
perl -i -pe 's/pattern/replacement/g' file.ts
```

### 受影响的文件
- `notification.service.ts` - 被清空后恢复
- `files.ts` - 被清空后恢复
- `provider.registry.ts` - 被清空后恢复
- `scheduler.service.ts` - 被清空后恢复
- `settings.service.ts` - 被清空后恢复

---

## 问题 2: 错误的表名替换 ❌

### 现象
```typescript
// 错误的替换
import { tenantSettings } from '../../db/schema/settings.js';
// 但 settings.ts 中只导出 settings,没有 tenantSettings
```

### 原因
批量替换时,将变量名 `tenantSettings` 也替换成了 `settings`,但这个变量名在代码中是正确的,不应该替换。

实际上应该是:
- 数据库表名: `settings` (正确)
- 变量名: 可以是 `tenantSettings` 或 `settings` (都可以)

### 解决方案 ✅
```bash
# 将错误的 tenantSettings 改回 settings
perl -i -pe 's/tenantSettings/settings/g' src/scheduler/providers/provider.registry.ts
```

---

## 问题 3: 遗漏的字段引用 ❌

### 现象
服务器启动后报 SQL 语法错误:
```sql
-- 错误的 SQL
WHERE notifications.user_id = $1 AND  = $2
                                   ^^^^^ 空条件
```

### 原因
某些文件中的 `notifications.tenantId` 没有被替换为 `notifications.organizationId`。

### 受影响的文件
- `notification.service.ts` - 16 处
- `files.ts` - 1 处
- `provider.registry.ts` - 2 处
- `scheduler.service.ts` - 1 处

### 解决方案 ✅
```bash
# 使用 Perl 精确替换数据库字段引用
perl -i -pe 's/notifications\.tenantId/notifications.organizationId/g' src/notifications/notification.service.ts
perl -i -pe 's/files\.tenantId/files.organizationId/g' src/trpc/routers/files.ts
perl -i -pe 's/settings\.tenantId/settings.organizationId/g' src/scheduler/providers/provider.registry.ts
perl -i -pe 's/scheduledTasks\.tenantId/scheduledTasks.organizationId/g' src/scheduler/scheduler.service.ts
```

---

## 问题 4: Context 参数类型不匹配 ❌

### 现象
```typescript
// 函数定义
async function filterMenusByRoleVisibility(
    menuList: MenuTreeNode[],
    ctx: { userId?: string; tenantId?: string; userRoles?: string[] }  // ❌ tenantId
): Promise<MenuTreeNode[]> {
    if (!ctx.organizationId) {  // ❌ 使用了 organizationId
        return [];
    }
}

// 调用处
filterMenusByRoleVisibility(tree, {
    userId: ctx.userId,
    tenantId: ctx.organizationId,  // ❌ 传入 tenantId
    userRoles: ctx.userRoles,
});
```

### 原因
函数参数定义和函数体内使用的字段名不一致。

### 解决方案 ✅
统一使用 `organizationId`:
```typescript
async function filterMenusByRoleVisibility(
    menuList: MenuTreeNode[],
    ctx: { userId?: string; organizationId?: string; userRoles?: string[] }  // ✅
): Promise<MenuTreeNode[]> {
    if (!ctx.organizationId) {  // ✅
        return [];
    }
}

filterMenusByRoleVisibility(tree, {
    userId: ctx.userId,
    organizationId: ctx.organizationId,  // ✅
    userRoles: ctx.userRoles,
});
```

---

## 经验教训

### 1. 批量替换要谨慎 ⚠️

**问题**:
- `sed` 命令可能清空文件
- 批量替换可能误伤变量名

**建议**:
- ✅ 使用 `perl -i -pe` 而不是 `sed -i ''`
- ✅ 先在小范围测试
- ✅ 使用 git 随时可以恢复
- ✅ 每次替换后验证文件完整性

### 2. 分阶段验证 ✅

**建议的流程**:
1. ✅ 数据库迁移
2. ✅ Schema 定义更新
3. ✅ 验证 Schema (运行 `verify-migration.sh`)
4. ✅ 代码字段引用更新
5. ✅ 验证代码 (检查空文件、导入错误)
6. ✅ 启动服务器测试
7. ✅ 修复运行时错误
8. ✅ 最终验证

### 3. 精确匹配很重要 🎯

**错误示例**:
```bash
# ❌ 太宽泛,会误伤变量名
sed 's/tenantId/organizationId/g'

# ❌ 太宽泛,会误伤所有 tenantSettings
sed 's/tenantSettings/settings/g'
```

**正确示例**:
```bash
# ✅ 只替换数据库字段引用
perl -i -pe 's/notifications\.tenantId/notifications.organizationId/g'

# ✅ 只替换特定表的字段
perl -i -pe 's/eq\(settings\.tenantId,/eq(settings.organizationId,/g'
```

### 4. 自动化验证脚本 🤖

创建验证脚本 `verify-migration.sh`:
```bash
#!/bin/bash
# 1. 检查数据库字段引用
# 2. 检查 Context 类型
# 3. 检查 Schema 定义
# 4. 检查空文件
# 5. 检查导入错误
```

---

## 最终修复清单

### 恢复的文件 (git restore)
- [x] `notification.service.ts`
- [x] `files.ts`
- [x] `provider.registry.ts`
- [x] `scheduler.service.ts`
- [x] `settings.service.ts`

### 修复的字段引用
- [x] `notifications.tenantId` → `notifications.organizationId` (16 处)
- [x] `files.tenantId` → `files.organizationId` (1 处)
- [x] `settings.tenantId` → `settings.organizationId` (3 处)
- [x] `scheduledTasks.tenantId` → `scheduledTasks.organizationId` (1 处)

### 修复的导入
- [x] `tenantSettings` → `settings` (provider.registry.ts)

### 修复的类型定义
- [x] `filterMenusByRoleVisibility` 参数类型 (menu.ts)

---

## 验证结果

```bash
$ ./verify-migration.sh

✅ 没有遗漏的字段引用
✅ Context 已更新为 organizationId
✅ 所有 Schema 已更新
✅ 无空文件
✅ 无导入错误

📊 迁移统计:
   - Schema 中的 organizationId 字段: 32
   - 代码中的 .organizationId 引用: 351

✅ 迁移验证通过!
```

---

## 工具推荐

### 安全的批量替换工具

1. **Perl** (推荐) ✅
   ```bash
   perl -i -pe 's/pattern/replacement/g' file.ts
   ```

2. **GNU sed** (需要安装)
   ```bash
   brew install gnu-sed
   gsed -i 's/pattern/replacement/g' file.ts
   ```

3. **VS Code** (手动但安全)
   - 使用 "Replace in Files" 功能
   - 可以预览所有更改
   - 支持正则表达式

### 验证工具

1. **文件完整性检查**
   ```bash
   find src -name "*.ts" -type f -size 0
   ```

2. **导入检查**
   ```bash
   grep -r "import.*from" src --include="*.ts" | grep "undefined"
   ```

3. **TypeScript 编译检查**
   ```bash
   pnpm tsc --noEmit
   ```

---

**文档创建时间**: 2026-01-22
**状态**: ✅ 所有问题已解决
**可以启动服务器**: 🚀
