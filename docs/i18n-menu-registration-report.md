# i18n 多语言菜单注册完成报告

## 问题

用户反馈:"翻译管理界面没有注册菜单"

## 根本原因

1. **数据库缺失**: 菜单数据需要插入到 `menus` 表
2. **前端 Fallback 缺失**: 静态 `FALLBACK_MENUS` 中没有包含 i18n 菜单项

## 解决方案

### 1. 数据库菜单注册 ✅

**执行的种子脚本**: `apps/server/src/db/seeds/i18n-menus.seed.ts`

**插入的菜单**:
```sql
-- Languages 菜单
code: 'core:i18n-languages'
label: 'Languages'
path: '/settings/languages'
icon: 'Languages'
parent_code: 'core:settings'
order: 70
target: 'admin'

-- Translations 菜单
code: 'core:i18n-translations'
label: 'Translations'
path: '/settings/translations'
icon: 'FileText'
parent_code: 'core:settings'
order: 71
target: 'admin'
```

**执行结果**:
```bash
$ pnpm tsx src/db/seeds/i18n-menus.seed.ts
✅ Settings menu code: core:settings
  ✅ Added: Languages
  ✅ Added: Translations
✅ i18n menu items added successfully
```

### 2. 前端 Fallback 菜单更新 ✅

**修改文件**: `apps/admin/src/hooks/useMenus.ts`

**更新内容**: 在 `FALLBACK_MENUS` 数组中添加了两个菜单项:
- Languages (Settings 子菜单)
- Translations (Settings 子菜单)

**作用**: 当数据库不可用时,前端仍可显示 i18n 菜单

---

## 菜单层级结构

```
Settings (core:settings)
├── General (order: 10)
├── Notifications (order: 20)
├── Webhooks (order: 30)
├── API Tokens (order: 40)
├── Hooks (order: 50)
├── Audit Logs (order: 60)
├── Languages (order: 70)      ← 新增
└── Translations (order: 71)    ← 新增
```

---

## 验证结果

### 数据库验证 ✅

```bash
$ pnpm tsx scripts/verify-i18n-menus.ts

=== Found i18n menus ===

Code: core:i18n-languages
  Label: Languages
  Path: /settings/languages
  Icon: Languages
  Parent: core:settings ✅
  Order: 70
  Visible: true
  Target: admin

Code: core:i18n-translations
  Label: Translations
  Path: /settings/translations
  Icon: FileText
  Parent: core:settings ✅
  Order: 71
  Visible: true
  Target: admin

=== Menu Hierarchy Validation ===
✅ Settings menu exists
✅ Languages menu exists (Parent correctly set)
✅ Translations menu exists (Parent correctly set)
```

### 路由验证 ✅

**文件**: `apps/admin/src/App.tsx`

路由已经存在(105-106行):
```tsx
<Route path="settings/languages" element={<LanguagesPage />} />
<Route path="settings/translations" element={<TranslationsPage />} />
```

---

## 访问路径

用户现在可以通过以下方式访问:

1. **通过侧边栏**:
   ```
   Settings → Languages
   Settings → Translations
   ```

2. **直接 URL**:
   ```
   http://localhost:3000/settings/languages
   http://localhost:3000/settings/translations
   ```

---

## 权限控制

当前配置:
- **Languages**: 无特殊权限要求 (`requiredPermission: null`)
- **Translations**: 无特殊权限要求 (`requiredPermission: null`)

如需添加权限控制,修改数据库:
```sql
UPDATE menus
SET required_permission = 'i18n:manage:organization'
WHERE code IN ('core:i18n-languages', 'core:i18n-translations');
```

---

## Feature Flag 控制

多语言功能可以通过 Setting 控制启用/禁用:

```typescript
// 检查是否启用
const enabled = await settingsService.get<boolean>(
  'tenant',
  'features.i18n.enabled',
  { organizationId, defaultValue: false }
);

if (!enabled) {
  // 隐藏菜单或显示 Empty State
}
```

**建议**: 在 `LanguagesPage` 和 `TranslationsPage` 组件中检查 feature flag,禁用时显示引导用户启用的 UI。

---

## 相关文件

### 已修改文件
1. `apps/server/src/db/seeds/i18n-menus.seed.ts` - 修复列名,使用新 schema
2. `apps/admin/src/hooks/useMenus.ts` - 添加 FALLBACK_MENUS

### 已创建文件
1. `apps/server/scripts/verify-i18n-menus.ts` - 验证脚本

### 已存在文件(无需修改)
1. `apps/admin/src/App.tsx` - 路由已存在
2. `apps/admin/src/pages/i18n/LanguagesPage.tsx` - 语言管理页面
3. `apps/admin/src/pages/i18n/TranslationsPage.tsx` - 翻译管理页面

---

## 后续工作

### 1. 条件显示菜单(可选)

如果希望仅在 i18n 功能启用时显示菜单:

```typescript
// apps/admin/src/components/Layout.tsx
const { data: i18nEnabled } = trpc.settings.get.useQuery({
  scope: 'tenant',
  key: 'features.i18n.enabled'
});

// 过滤菜单
const filteredNavItems = useMemo(() => {
  if (!i18nEnabled) {
    return navItems.filter(item =>
      !item.id.includes('i18n')
    );
  }
  return navItems;
}, [navItems, i18nEnabled]);
```

### 2. 菜单翻译(可选)

使用 i18n 系统翻译菜单标签:

```typescript
// 数据库存储
label: 'common.menu.languages'

// 前端渲染时
const translatedLabel = await ctx.i18n.t(menu.label, locale);
```

### 3. 图标优化(可选)

更新图标为更合适的选项:
```sql
UPDATE menus SET icon = 'Globe' WHERE code = 'core:i18n-languages';
UPDATE menus SET icon = 'Languages' WHERE code = 'core:i18n-translations';
```

---

## 总结

✅ **问题已解决**:
- 菜单已插入数据库 (`core:i18n-languages`, `core:i18n-translations`)
- 前端 Fallback 菜单已更新
- 菜单层级正确(Settings 子菜单)
- 路由已存在,无需修改

✅ **验证完成**:
- 数据库菜单结构正确
- 父子关系正确
- 显示状态为 `visible: true`

🎯 **用户体验**:
- 用户现可从 Settings 菜单访问 Languages 和 Translations
- 菜单排序合理(Audit Logs 之后)
- 与其他设置菜单保持一致性

---

**执行时间**: $(date)
**执行人**: AI Assistant
**状态**: ✅ 完成
