# i18n 菜单层级重构完成

## 问题

用户反馈："这2个菜单应该有个父级"

## 解决方案

创建了一个父级菜单 "Internationalization",将 Languages 和 Translations 作为其子菜单。

---

## 新的菜单层级结构

```
Settings (core:settings) - order: 100
├── General (order: 10)
├── Notifications (order: 20)
├── Webhooks (order: 30)
├── API Tokens (order: 40)
├── Hooks (order: 50)
├── Audit Logs (order: 60)
└── Internationalization (core:i18n) - order: 70  ← 新增父级
    ├── Languages (core:i18n-languages) - order: 10
    └── Translations (core:i18n-translations) - order: 20
```

---

## 执行的修改

### 1. 数据库结构调整 ✅

**脚本**: `apps/server/src/db/seeds/restructure-i18n-menus.seed.ts`

**操作**:
1. 创建父级菜单 `core:i18n` (Internationalization)
2. 更新 `core:i18n-languages` 的 `parent_code` 为 `core:i18n`
3. 更新 `core:i18n-translations` 的 `parent_code` 为 `core:i18n`
4. 调整子菜单的 `order` (10, 20)

**执行结果**:
```bash
$ pnpm tsx src/db/seeds/restructure-i18n-menus.seed.ts

✅ Created parent menu: Internationalization
✅ Updated Languages menu parent
✅ Updated Translations menu parent
✅ i18n menu restructuring completed
```

### 2. 前端 Fallback 菜单更新 ✅

**文件**: `apps/admin/src/hooks/useMenus.ts`

**更新内容**:
- 添加 `core:i18n` 父级菜单项
- 修改 `core:i18n-languages` 和 `core:i18n-translations` 的 `parentId` 为 `core:i18n`

---

## 菜单详细信息

### 父级菜单 (Internationalization)

```javascript
{
  code: 'core:i18n',
  label: 'Internationalization',
  icon: 'Globe',          // 地球图标
  path: null,             // 分组菜单,无路径
  parent_code: 'core:settings',
  order: 70,
  target: 'admin',
  visible: true
}
```

### 子菜单 1 (Languages)

```javascript
{
  code: 'core:i18n-languages',
  label: 'Languages',
  icon: 'Languages',
  path: '/settings/languages',
  parent_code: 'core:i18n',  ← 父级改为 core:i18n
  order: 10,
  target: 'admin',
  visible: true
}
```

### 子菜单 2 (Translations)

```javascript
{
  code: 'core:i18n-translations',
  label: 'Translations',
  icon: 'FileText',
  path: '/settings/translations',
  parent_code: 'core:i18n',  ← 父级改为 core:i18n
  order: 20,
  target: 'admin',
  visible: true
}
```

---

## 验证结果

```bash
$ pnpm tsx scripts/verify-i18n-menus.ts

=== Menu Hierarchy Validation ===

✅ Settings menu exists (core:settings)
✅ i18n parent menu exists (core:i18n)
  ✅ Parent correctly set to core:settings
✅ Languages menu exists (core:i18n-languages)
  ✅ Parent correctly set to core:i18n
✅ Translations menu exists (core:i18n-translations)
  ✅ Parent correctly set to core:i18n
```

---

## 用户体验改进

### 修改前 ❌
```
Settings
├── ...
├── Languages        ← 太多平级菜单
└── Translations
```

### 修改后 ✅
```
Settings
└── Internationalization   ← 清晰的分组
    ├── Languages
    └── Translations
```

**优势**:
1. ✅ **更清晰的层级**: i18n 功能有独立的分组
2. ✅ **更好的扩展性**: 未来可添加更多 i18n 相关菜单(如 "Regions", "Currencies")
3. ✅ **减少菜单混乱**: Settings 下的一级菜单数量减少
4. ✅ **符合直觉**: 用户可以快速定位 i18n 相关功能

---

## 访问路径

### 方式 1: 侧边栏导航
```
Settings
  → Internationalization
      → Languages       (/settings/languages)
      → Translations    (/settings/translations)
```

### 方式 2: 直接 URL (不变)
```
http://localhost:3000/settings/languages
http://localhost:3000/settings/translations
```

---

## 可选优化建议

### 1. 中文化标签(可选)

如果需要中文界面:

```sql
UPDATE menus SET label = '国际化' WHERE code = 'core:i18n';
UPDATE menus SET label = '语言管理' WHERE code = 'core:i18n-languages';
UPDATE menus SET label = '翻译管理' WHERE code = 'core:i18n-translations';
```

或使用 i18n 系统动态翻译菜单标签。

### 2. 图标替换(可选)

如果觉得图标不合适:

```sql
-- 更时尚的组合
UPDATE menus SET icon = 'Globe2' WHERE code = 'core:i18n';
UPDATE menus SET icon = 'MessageSquare' WHERE code = 'core:i18n-translations';
```

### 3. 未来扩展

可在 Internationalization 下添加更多菜单:

- **Regions** - 区域管理(时区、日期格式)
- **Currencies** - 货币管理
- **Locales** - 本地化配置
- **Translation Memory** - 翻译记忆库

---

## 相关文件

### 已修改文件
1. `apps/server/src/db/seeds/restructure-i18n-menus.seed.ts` - 重构脚本(新建)
2. `apps/admin/src/hooks/useMenus.ts` - 更新 FALLBACK_MENUS
3. `apps/server/scripts/verify-i18n-menus.ts` - 更新验证逻辑

### 已存在文件(无需修改)
1. `apps/admin/src/App.tsx` - 路由配置
2. `apps/admin/src/pages/i18n/*` - 页面组件

---

## 总结

✅ **问题已解决**:
- 创建了父级菜单 "Internationalization"
- Languages 和 Translations 成为其子菜单
- 菜单层级更清晰,符合用户预期

✅ **验证完成**:
- 数据库层级正确
- 前端 Fallback 已同步
- 父子关系验证通过

🎯 **用户体验提升**:
- 菜单结构更合理
- 便于未来扩展
- 减少一级菜单混乱

---

**执行时间**: $(date)
**状态**: ✅ 完成
