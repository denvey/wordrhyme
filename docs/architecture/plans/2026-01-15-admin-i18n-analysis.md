# WordRhyme CMS Admin 国际化 (i18n) 实施分析报告

## 1. 核心建议 (Executive Summary)

针对 React 19 + Rspack + Tailwind 4 的技术栈，推荐采用 **react-i18next** 作为国际化核心库。

-   **技术选型**: `react-i18next` + `i18next-http-backend` + `date-fns` (已存在项目依赖中)
-   **文件架构**: 基于 `public/locales` 的按需加载 JSON 资源方案
-   **UI 策略**: 在 Sidebar 底部或 Header 区域增加语言切换器，与 `ThemeToggle` 风格保持一致
-   **关键收益**: 成熟的生态、优秀的 TypeScript 支持、对代码分割友好

---

## 2. 技术选型详细分析

### 2.1 核心库对比

| 特性 | react-i18next (推荐) | react-intl (FormatJS) | LinguiJS |
| :--- | :--- | :--- | :--- |
| **API 风格** | Hooks (`useTranslation`) + 组件 | 主要为组件 (`<FormattedMessage>`) | 宏 (Macros) + Hooks |
| **翻译格式** | JSON (灵活，行业标准) | ICU Message Format (严格) | PO/JSON |
| **生态/社区** | 极大，插件丰富 | 大，标准兼容性好 | 较小，但在轻量化方面有优势 |
| **React 19 兼容** | 优秀 | 良好 | 需要配置编译插件 |
| **动态加载** | 内置支持后端加载 (http-backend) | 需自行实现加载逻辑 | 编译时处理为主 |

**推荐理由**: `react-i18next` 的 `useTranslation` hook 模式非常契合当前基于 Hooks 的代码风格 (Tailwind + Shadcn/ui)。其 `Backend` 插件机制能完美解决 "翻译文件管理" 和 "按需加载" 的需求。

### 2.2 日期与数字格式化

利用项目中已有的 `date-fns` 库配合 `Intl` API。
-   **日期**: `date-fns` 支持多语言 locale 导入。
-   **数字/货币**: 原生 `Intl.NumberFormat` 或 `react-i18next` 的插值格式化功能。

---

## 3. 架构设计方案

### 3.1 翻译文件组织 (File Structure)

采用 **按功能拆分 Namespace** 的策略，避免单个大文件加载过慢，同时便于多人协作。

```text
apps/admin/public/locales/
├── en-US/
│   ├── common.json      # 通用 (保存, 取消, 确认, 错误提示)
│   ├── auth.json        # 登录, 注册
│   ├── dashboard.json   # 仪表盘特有
│   ├── navigation.json  # 侧边栏菜单
│   └── settings.json    # 设置页
└── zh-CN/
    ├── common.json
    ├── auth.json
    ├── dashboard.json
    ├── navigation.json
    └── settings.json
```

### 3.2 配置策略 (Configuration)

在 `src/lib/i18n.ts` 中初始化：

-   **Backend**: 使用 `i18next-http-backend` 从 `/locales/{{lng}}/{{ns}}.json` 异步加载。
-   **Detection**: 使用 `i18next-browser-languagedetector` 自动识别 (LocalStorage > Navigator)。
-   **Fallback**: 默认 `zh-CN`。

### 3.3 类型安全 (TypeScript)

利用 `i18next` 的 TypeScript 支持，定义 `resources.d.ts`，实现 key 的自动补全和类型检查，防止 key 拼写错误。

---

## 4. UI/UX 改造方案

### 4.1 语言切换组件 (LanguageSwitcher)

当前 `SidebarHeaderContent` (`src/components/sidebar-header.tsx`) 包含 `ThemeToggle`。建议在此处并排添加语言切换按钮。

**交互设计**:
-   **Icon**: 使用 `Globe` 或 `Languages` (Lucide React)。
-   **Action**: 点击弹出 `DropdownMenu` (shadcn/ui)，列出可用语言。
-   **Feedback**: 切换后立即刷新界面文本，无需刷新页面。

### 4.2 布局调整 (RTL 预留)

虽然初期仅支持中英，但应在 `index.html` 或根组件根据当前语言动态设置 `dir="ltr"` 或 `dir="rtl"`，为未来支持阿拉伯语等做好准备 (Tailwind 的 `rtl:` 前缀依赖于此)。

---

## 5. 实施路线图 (Implementation Roadmap)

### 阶段 1: 基础建设
1.  安装依赖: `i18next`, `react-i18next`, `i18next-http-backend`, `i18next-browser-languagedetector`。
2.  创建 `src/lib/i18n.ts` 并配置 Rspack 处理静态资源拷贝。
3.  创建基础翻译文件 (`common.json`)。
4.  在 `src/bootstrap.tsx` 或 `src/App.tsx` 中引入配置。

### 阶段 2: 组件与布局改造
1.  开发 `LanguageSwitcher` 组件并集成到 Sidebar。
2.  **核心布局**: 提取 Sidebar、Header、Footer 中的文本到 `navigation.json`。
3.  **通用组件**: 改造 `Toaster`、`Dialog` 等全局组件的默认文案。

### 阶段 3: 页面级提取 (渐进式)
按高频使用顺序进行提取：
1.  **Dashboard**: `src/pages/Dashboard.tsx` (硬编码较多，适合练手)。
2.  **Auth**: 登录/注册页。
3.  **Settings**: 系统设置页。
4.  **列表页**: 表格列头、过滤器。

---

## 6. 性能影响评估

-   **Bundle Size**: `i18next` 核心包体积适中 (~40kb gzipped)，对现代 Admin 系统影响微乎其微。
-   **Loading**: 采用 `http-backend` 后，翻译文件通过网络异步加载，不会阻塞首屏 JS 执行。
-   **CLS (布局偏移)**: 需注意中文与英文长度差异。建议在设计组件时预留弹性空间 (使用 `flex-wrap`, `min-width`)，避免切换语言导致布局剧烈崩坏。

## 7. 示例代码 (Preview)

**src/lib/i18n.ts**:
```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'zh-CN',
    supportedLngs: ['zh-CN', 'en-US'],
    ns: ['common', 'dashboard'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React 默认防 XSS
    },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
  });

export default i18n;
```

**src/pages/Dashboard.tsx (改造后)**:
```tsx
import { useTranslation } from 'react-i18next';

export function DashboardPage() {
    const { t } = useTranslation('dashboard');
    // ...
    return (
        // ...
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        // ...
    );
}
```
