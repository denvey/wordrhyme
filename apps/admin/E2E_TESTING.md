# E2E Testing Guide

Admin UI 的端到端测试，使用 Playwright 自动化测试浏览器交互。

## 🎯 Quick Start

### 安装浏览器
```bash
# 首次运行需要安装 Playwright 浏览器
pnpm --filter @wordrhyme/admin exec playwright install chromium
```

### 准备测试数据
```bash
# 确保测试账号已创建
pnpm --filter @wordrhyme/server seed:test-accounts
```

### 运行测试
```bash
# 运行所有 E2E 测试
pnpm --filter @wordrhyme/admin test:e2e

# UI 模式（推荐，可视化调试）
pnpm --filter @wordrhyme/admin test:e2e:ui

# Debug 模式（单步调试）
pnpm --filter @wordrhyme/admin test:e2e:debug
```

---

## 📋 测试覆盖

### 1. **auth.spec.ts** - 登录测试
- ✅ 显示登录页面
- ✅ Owner 登录
- ✅ Admin 登录
- ✅ Member 登录
- ✅ 错误凭据处理

### 2. **permissions.spec.ts** - 角色权限测试
- ✅ **Owner**: 查看所有菜单、创建/编辑/删除角色
- ✅ **Admin**: 查看有限菜单、访问内容管理、无法访问角色管理
- ✅ **Member**: 最小菜单、只读成员列表、无法访问系统管理

### 3. **casl-editor.spec.ts** - CASL 规则编辑器测试
- ✅ 添加基本 CASL 规则
- ✅ 字段级权限（Fields）
- ✅ ABAC 条件（Conditions）
- ✅ 反向规则（Inverted）
- ✅ 添加多条规则
- ✅ 删除规则
- ✅ 编辑现有角色

---

## 🔧 测试账号

在 `e2e/fixtures.ts` 中定义的测试账号：

| 角色 | 邮箱 | 密码 |
|------|------|------|
| Owner | owner@wordrhyme.test | Test123456 |
| Admin | admin@wordrhyme.test | Test123456 |
| Member | member@wordrhyme.test | Test123456 |

这些账号由 `pnpm --filter @wordrhyme/server seed:test-accounts` 创建。

---

## 🛠️ 测试架构

### Fixtures（`e2e/fixtures.ts`）
提供可复用的测试 fixtures：
- `TEST_ACCOUNTS` - 测试账号配置
- `login()` - 登录辅助函数
- `ownerPage` - 已登录的 Owner 页面
- `adminPage` - 已登录的 Admin 页面
- `memberPage` - 已登录的 Member 页面

### 使用 Fixture
```typescript
import { test, expect } from './fixtures.js';

test('example test', async ({ ownerPage }) => {
    // ownerPage 已经登录，直接使用
    await ownerPage.goto('/system/roles');
    // ...
});
```

---

## 📝 编写新测试

### 模板：基本测试
```typescript
import { test, expect } from '@playwright/test';

test('should do something', async ({ page }) => {
    await page.goto('/some-page');
    await expect(page.getByText('Expected Text')).toBeVisible();
});
```

### 模板：需要登录的测试
```typescript
import { test, expect } from './fixtures.js';

test('should do something as owner', async ({ ownerPage }) => {
    await ownerPage.goto('/system/roles');
    // ownerPage 已经登录为 Owner
});
```

### 模板：表单交互
```typescript
test('should fill form', async ({ ownerPage }) => {
    await ownerPage.fill('input[name="name"]', 'Test Value');
    await ownerPage.selectOption('select[name="type"]', 'option-value');
    await ownerPage.check('input[type="checkbox"]');
    await ownerPage.click('button[type="submit"]');
});
```

---

## 🐛 调试测试

### 1. UI 模式（推荐）
```bash
pnpm --filter @wordrhyme/admin test:e2e:ui
```
提供可视化界面，可以：
- 看到浏览器实时操作
- 查看 DOM 快照
- 时间旅行调试
- 重新运行失败的测试

### 2. Debug 模式
```bash
pnpm --filter @wordrhyme/admin test:e2e:debug
```
单步执行测试，使用 Playwright Inspector。

### 3. 查看测试报告
```bash
# 运行测试后会自动生成 HTML 报告
# 打开 playwright-report/index.html
```

### 4. 截图和视频
失败的测试会自动截图和录制视频，保存在：
- `test-results/` - 失败测试的截图和 trace
- `playwright-report/` - HTML 测试报告

---

## ⚙️ 配置

`playwright.config.ts` 配置说明：

```typescript
{
    testDir: './e2e',              // 测试目录
    fullyParallel: true,           // 并行运行
    retries: 0,                    // 失败重试次数（CI: 2）
    workers: 4,                    // 并发 worker 数量
    baseURL: 'http://localhost:5173',
    webServer: {
        command: 'pnpm dev',       // 自动启动开发服务器
        url: 'http://localhost:5173',
        reuseExistingServer: true  // 复用已有服务器
    }
}
```

---

## 🚀 CI/CD 集成

在 CI 环境中运行测试：

```yaml
# GitHub Actions 示例
- name: Install browsers
  run: pnpm --filter @wordrhyme/admin exec playwright install --with-deps chromium

- name: Run E2E tests
  run: pnpm --filter @wordrhyme/admin test:e2e
  env:
    CI: true
```

---

## 📚 最佳实践

### 1. 使用语义化选择器
```typescript
// ✅ 好
await page.getByRole('button', { name: '保存' });
await page.getByLabel('用户名');
await page.getByPlaceholder('请输入...');

// ❌ 不好
await page.locator('.btn-primary');
await page.locator('div > button:nth-child(2)');
```

### 2. 等待元素可见
```typescript
// ✅ 好
await expect(page.getByText('成功')).toBeVisible({ timeout: 5000 });

// ❌ 不好
await page.waitForTimeout(2000);
```

### 3. 清理测试数据
```typescript
test.afterEach(async ({ ownerPage }) => {
    // 删除测试创建的数据
    await cleanup(ownerPage);
});
```

### 4. 避免硬编码延迟
```typescript
// ✅ 好
await page.waitForURL('**/dashboard');

// ❌ 不好
await page.waitForTimeout(3000);
```

---

## 🔗 相关文档

- [Playwright 官方文档](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [后端权限测试](../../server/PERMISSION_TESTING.md)

---

**Last Updated**: 2026-01-07
**Test Files**: 3 files (auth, permissions, casl-editor)
**Status**: ✅ Ready to use
