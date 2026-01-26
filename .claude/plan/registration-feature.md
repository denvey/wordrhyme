# 用户注册功能实施计划

> 状态：待批准
> 创建时间：2025-01-20
> 版本：v1.0

## 概述

为 WordRhyme 项目添加用户注册功能，包含邮箱验证流程，复用现有 NotificationService 发送验证邮件。

---

## 一、文件修改清单

### 后端（apps/server）

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| **修改** | `src/auth/auth.ts` | 启用邮箱验证，配置 sendVerificationEmail 回调 |
| **新增** | `src/notifications/templates/auth-verify.ts` | 验证邮件模板定义 |
| **修改** | `src/notifications/notification.module.ts` | 导出 NotificationService 供 auth 模块使用 |
| **修改** | `src/db/seed/seed-templates.ts` | 添加 auth.email.verify 模板种子数据 |

### 前端（apps/admin）

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| **新增** | `src/pages/Register.tsx` | 注册页面组件 |
| **修改** | `src/App.tsx` | 添加 /register 路由 |
| **修改** | `src/pages/Login.tsx` | 添加注册页面链接 |

---

## 二、后端实施步骤

### Step 1: 修改 auth.ts 配置

```typescript
// apps/server/src/auth/auth.ts

import { NotificationService } from '../notifications/notification.service';

// 在 betterAuth 配置中添加：
export const auth = betterAuth({
    // ... 现有配置 ...

    // 启用邮箱验证
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: true, // 改为 true
    },

    // 邮箱验证配置
    emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url, token }, request) => {
            // 调用 NotificationService 发送验证邮件
            const notificationService = await getNotificationService();

            await notificationService.sendFromTemplate({
                userId: user.id,
                tenantId: 'system', // 注册时用户还没有组织
                templateKey: 'auth.email.verify',
                variables: {
                    userName: user.name || user.email.split('@')[0],
                    verificationUrl: url,
                    expiresInHours: 24,
                },
                channelOverrides: ['email'],
                priority: 'high',
                idempotencyKey: `verify-${token}`,
            });
        },
    },
});
```

### Step 2: 创建验证邮件模板

```typescript
// apps/server/src/db/seed/seed-templates.ts (追加)

export const AUTH_EMAIL_VERIFY_TEMPLATE = {
    key: 'auth.email.verify',
    category: 'system',
    priority: 'high',
    defaultChannels: ['email'],
    translations: {
        'en-US': {
            title: 'Verify your email address',
            message: `Hi {{userName}},

Please verify your email address by clicking the link below:

{{verificationUrl}}

This link will expire in {{expiresInHours}} hours.

If you didn't create an account, you can safely ignore this email.

- The WordRhyme Team`,
        },
        'zh-CN': {
            title: '验证您的邮箱地址',
            message: `您好 {{userName}}，

请点击以下链接验证您的邮箱地址：

{{verificationUrl}}

此链接将在 {{expiresInHours}} 小时后过期。

如果您没有注册账号，请忽略此邮件。

- WordRhyme 团队`,
        },
    },
};
```

### Step 3: 配置说明

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `requireEmailVerification` | `true` | 用户必须验证邮箱才能登录 |
| `sendOnSignUp` | `true` | 注册时自动发送验证邮件 |
| `autoSignInAfterVerification` | `true` | 验证成功后自动登录 |
| Token 过期时间 | 24 小时 | better-auth 默认 |

---

## 三、前端实施步骤

### Step 1: 创建 Register.tsx

```typescript
// apps/admin/src/pages/Register.tsx

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Loader2, CheckCircle, Mail } from 'lucide-react';
import { signUp } from '../lib/auth-client';

// Schema 定义
const registerSchema = z.object({
    name: z.string().min(2, '姓名至少 2 个字符'),
    email: z.string().email('请输入有效的邮箱地址'),
    password: z.string().min(8, '密码至少 8 个字符'),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
    const [isSuccess, setIsSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const form = useForm<RegisterFormValues>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            name: '',
            email: '',
            password: '',
            confirmPassword: '',
        },
    });

    const onSubmit = async (values: RegisterFormValues) => {
        setIsLoading(true);
        setError(null);

        try {
            await signUp.email({
                name: values.name,
                email: values.email,
                password: values.password,
            });
            setIsSuccess(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : '注册失败，请重试');
        } finally {
            setIsLoading(false);
        }
    };

    // 注册成功视图
    if (isSuccess) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-xl border border-border shadow-lg text-center">
                    <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                        <Mail className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold">查收验证邮件</h1>
                    <p className="text-muted-foreground">
                        我们已向您的邮箱发送了验证链接，请点击链接完成注册。
                    </p>
                    <Link
                        to="/login"
                        className="inline-block w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
                    >
                        返回登录
                    </Link>
                </div>
            </div>
        );
    }

    // 注册表单
    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-xl border border-border shadow-lg">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-primary">WordRhyme</h1>
                    <p className="text-muted-foreground mt-2">创建您的账号</p>
                </div>

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium mb-2">姓名</label>
                        <input
                            {...form.register('name')}
                            type="text"
                            placeholder="您的姓名"
                            className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                            autoFocus
                        />
                        {form.formState.errors.name && (
                            <p className="text-sm text-destructive mt-1">
                                {form.formState.errors.name.message}
                            </p>
                        )}
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-sm font-medium mb-2">邮箱</label>
                        <input
                            {...form.register('email')}
                            type="email"
                            placeholder="your@email.com"
                            className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        {form.formState.errors.email && (
                            <p className="text-sm text-destructive mt-1">
                                {form.formState.errors.email.message}
                            </p>
                        )}
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-sm font-medium mb-2">密码</label>
                        <input
                            {...form.register('password')}
                            type="password"
                            placeholder="至少 8 个字符"
                            className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        {form.formState.errors.password && (
                            <p className="text-sm text-destructive mt-1">
                                {form.formState.errors.password.message}
                            </p>
                        )}
                    </div>

                    {/* Confirm Password */}
                    <div>
                        <label className="block text-sm font-medium mb-2">确认密码</label>
                        <input
                            {...form.register('confirmPassword')}
                            type="password"
                            placeholder="再次输入密码"
                            className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        {form.formState.errors.confirmPassword && (
                            <p className="text-sm text-destructive mt-1">
                                {form.formState.errors.confirmPassword.message}
                            </p>
                        )}
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                            {error}
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                注册中...
                            </>
                        ) : (
                            '创建账号'
                        )}
                    </button>
                </form>

                <div className="text-center text-sm text-muted-foreground">
                    <span>已有账号？</span>
                    <Link to="/login" className="text-primary hover:underline ml-1">
                        立即登录
                    </Link>
                </div>
            </div>
        </div>
    );
}
```

### Step 2: 修改 App.tsx 路由

```typescript
// apps/admin/src/App.tsx

import { RegisterPage } from './pages/Register';

// 在 Routes 中添加：
<Route path="/register" element={<RegisterPage />} />
```

### Step 3: 修改 Login.tsx 添加注册链接

```typescript
// apps/admin/src/pages/Login.tsx

// 在表单底部添加：
<div className="text-center text-sm text-muted-foreground">
    <span>还没有账号？</span>
    <Link to="/register" className="text-primary hover:underline ml-1">
        立即注册
    </Link>
</div>
```

---

## 四、测试要点

### 后端测试

- [ ] 注册 API 正常创建用户
- [ ] 用户注册后 emailVerified = false
- [ ] 验证邮件通过 NotificationService 发送
- [ ] 未验证用户无法登录（返回 403）
- [ ] 验证链接点击后 emailVerified = true
- [ ] 验证后自动登录并创建默认组织
- [ ] 默认角色正确分配

### 前端测试

- [ ] 表单验证正常工作
- [ ] 注册成功显示验证提示页
- [ ] Loading 状态正确显示
- [ ] 错误信息正确展示
- [ ] 登录/注册页面链接跳转正常

---

## 五、实施顺序

1. **后端**：创建验证邮件模板（seed 数据）
2. **后端**：修改 auth.ts 启用邮箱验证
3. **后端**：确保 NotificationService 可被 auth 模块访问
4. **前端**：创建 Register.tsx 页面
5. **前端**：更新路由配置
6. **前端**：Login.tsx 添加注册链接
7. **测试**：端到端测试注册流程

---

## 六、依赖说明

| 依赖 | 状态 | 说明 |
|------|------|------|
| NotificationService | ✅ 已就绪 | 用于发送通知 |
| TemplateService | ✅ 已就绪 | 用于渲染模板 |
| Email Channel (Resend) | ⏳ 待开发 | 后续由 Resend 插件提供 |

> **注意**：在 Resend 插件完成前，邮件不会实际发送，但 NotificationService 会正常创建通知记录。

---

## 七、安全考虑

- Token 24 小时过期
- Token 单次使用
- 错误响应统一（防止账号枚举）
- 后续可添加重发限流（1次/分钟，5次/天）
