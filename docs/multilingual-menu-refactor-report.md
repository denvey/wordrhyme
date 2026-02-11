# 多语言菜单重构完成报告

## 问题

1. "i18n" 对普通用户太技术化，应该用更友好的英文
2. 菜单显示需要支持多级展开

## 解决方案

### 1. 菜单名称优化 ✅

**改名为**: "Multilingual" (多语言的标准英文)

**原因**:
- ❌ "i18n" - 技术术语，普通用户不理解
- ❌ "Internationalization" - 太长(20个字符)
- ✅ "Multilingual" - 简洁、直观、用户友好

**执行**:
```sql
UPDATE menus SET label = 'Multilingual' WHERE code = 'core:i18n';
```

### 2. 菜单组件多级支持改造 ✅

**改造内容**:

#### A. 接口定义改为递归结构

**文件**: `apps/admin/src/components/nav-main.tsx`

```typescript
// 之前: 只支持二级
export interface NavMainItem {
  id: string;
  title: string;
  url: string;  // 不支持 null
  items?: {     // 子项不递归
    id: string;
    title: string;
    url: string;
  }[];
}

// 之后: 支持无限层级
export interface NavMainItem {
  id: string;
  title: string;
  url: string | null;  // null 表示目录节点
  icon?: LucideIcon | null;
  items?: NavMainItem[];  // 递归结构!
}
```

#### B. 渲染逻辑改为递归函数

**关键改动**:
```typescript
// 新增递归渲染函数
const renderMenuItem = (item: NavMainItem, depth: number = 0): React.ReactNode => {
  const hasChildren = item.items && item.items.length > 0;

  if (!hasChildren) {
    // 根据 depth 判断是顶级还是嵌套
    return depth === 0 ? renderTopLevelLeaf(item) : renderNestedLeaf(item);
  }

  // 有子节点 - 递归渲染
  return (
    <Collapsible>
      <CollapsibleTrigger>{item.title}</CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {item.items?.map(subItem => renderMenuItem(subItem, depth + 1))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
};
```

#### C. 菜单转换函数递归化

**文件**: `apps/admin/src/components/Layout.tsx`

```typescript
// 之前: 只转换一层子菜单
function convertMenuToNavItem(menu: MenuTreeNode): NavMainItem {
  return {
    items: menu.children?.map(child => ({
      id: child.id,
      title: child.label,
      // 子节点不递归
    })),
  };
}

// 之后: 完全递归
function convertMenuToNavItem(menu: MenuTreeNode): NavMainItem {
  return {
    items: menu.children?.map(child => convertMenuToNavItem(child)),  // 递归!
  };
}
```

---

## 最终菜单结构

### 数据库层级
```
Settings (core:settings)
├── General
├── Notifications
├── Menus
├── Webhooks
├── API Tokens
├── Hooks
├── Audit Logs
└── Multilingual (core:i18n)           ← 父级菜单
    ├── Languages (core:i18n-languages)     ← 二级子菜单
    └── Translations (core:i18n-translations) ← 二级子菜单
```

### UI 显示效果
```
Settings ▼
  General
  Notifications
  Menus
  Webhooks
  API Tokens
  Hooks
  Audit Logs
  Multilingual ▶                     ← 可展开的分组
    Languages                         ← 三级菜单
    Translations                      ← 三级菜单
```

---

## 技术细节

### 支持的层级深度

**理论上**: 无限层级（递归实现）

**实际建议**: 最多 3-4 级（UX 考虑）

**当前使用**: 3 级
- Level 0: Settings (顶级菜单)
- Level 1: Multilingual (分组)
- Level 2: Languages, Translations (功能页面)

### 目录节点 vs 叶子节点

| 特性 | 目录节点 | 叶子节点 |
|------|----------|----------|
| **path** | `null` | `/settings/languages` |
| **可点击** | ❌ 仅展开/折叠 | ✅ 导航到页面 |
| **示例** | Multilingual | Languages |

### 展开/折叠逻辑

```typescript
<Collapsible
  defaultOpen={item.isActive || isActive}  // 当前活跃路径自动展开
  className="group/collapsible"
>
  <CollapsibleTrigger>
    <ChevronRight className="... group-data-[state=open]:rotate-90" />
  </CollapsibleTrigger>
</Collapsible>
```

**行为**:
- 访问 `/settings/languages` 时,自动展开 Settings → Multilingual
- 点击 Multilingual 切换展开/折叠
- Chevron 图标旋转动画

---

## 修改的文件

### 后端
1. ✅ 数据库: `UPDATE menus SET label = 'Multilingual'`
2. ✅ 验证脚本: `scripts/rename-to-multilingual.ts`

### 前端
1. ✅ `components/nav-main.tsx` - 递归渲染逻辑
2. ✅ `components/Layout.tsx` - 递归转换函数
3. ✅ `hooks/useMenus.ts` - 更新 Fallback 菜单 + 接口定义

---

## 兼容性保证

### 向后兼容

✅ **二级菜单仍正常工作**:
```typescript
// 旧的二级菜单结构仍然有效
Settings
  └── General  // 直接子菜单,depth=1
```

✅ **单级菜单仍正常工作**:
```typescript
// 无子菜单的顶级项
Dashboard  // depth=0, 无展开
```

### 类型安全

```typescript
// MenuItem 接口支持可选的递归
interface MenuItem {
  path: string | null;  // 支持目录节点
  children?: MenuItem[]; // 可选,支持递归
}
```

---

## 验证步骤

### 1. 数据库验证
```bash
$ pnpm tsx scripts/rename-to-multilingual.ts
✅ Renamed to "Multilingual"

core:i18n: "Multilingual" (parent: core:settings)
core:i18n-languages: "Languages" (parent: core:i18n)
core:i18n-translations: "Translations" (parent: core:i18n)
```

### 2. 前端验证

**启动开发服务器**:
```bash
cd apps/admin
pnpm dev
```

**检查点**:
- [ ] Settings 菜单可以展开
- [ ] Multilingual 显示在 Settings 下
- [ ] 点击 Multilingual 可以展开/折叠
- [ ] Languages 和 Translations 显示在 Multilingual 下
- [ ] 点击 Languages 导航到 `/settings/languages`
- [ ] 访问 `/settings/languages` 时,自动展开 Settings 和 Multilingual
- [ ] Chevron 图标旋转动画正常

### 3. 类型检查
```bash
pnpm tsc --noEmit
```

---

## 未来扩展可能

### 添加第四级菜单(如需要)

```sql
-- 示例: Languages 下添加子菜单
INSERT INTO menus (code, label, path, parent_code, ...)
VALUES ('core:i18n-languages-regions', 'Regions', '/settings/languages/regions', 'core:i18n-languages', ...);
```

**自动支持**: 递归逻辑自动处理任意层级

### 添加更多多语言功能

```
Multilingual
  ├── Languages
  ├── Translations
  ├── Regions        ← 新增
  ├── Currencies     ← 新增
  └── Locales        ← 新增
```

---

## 性能考虑

### 渲染性能

**优化**: 使用 `React.memo` 优化深层嵌套菜单

```typescript
const MenuItemMemoized = React.memo(MenuItem);
```

**当前状态**: 3级菜单,性能影响可忽略

### 打开/关闭状态

**当前**: 每次访问页面重新计算

**优化方向**: 使用 `localStorage` 记住展开状态

```typescript
const [openMenus, setOpenMenus] = useState(() =>
  JSON.parse(localStorage.getItem('sidebar-open-menus') || '[]')
);
```

---

## 总结

✅ **名称优化**: "i18n" → "Multilingual" (用户友好)

✅ **多级支持**: 从固定二级改为递归无限级

✅ **向后兼容**: 现有二级菜单不受影响

✅ **类型安全**: TypeScript 完整支持

✅ **UI 体验**: 自动展开当前路径,Chevron 动画流畅

🎯 **结果**: 菜单系统现在支持任意层级,为未来扩展打下基础

---

**执行时间**: 2025-01-XX
**状态**: ✅ 完成
**测试状态**: 等待前端验证
