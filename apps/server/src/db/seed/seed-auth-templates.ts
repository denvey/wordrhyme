/**
 * Seed Auth Email Templates
 *
 * Seeds notification templates for authentication flows:
 * - Email verification
 * - Password reset (future)
 */
import { db } from '../index.js';
import { notificationTemplates } from '../schema/definitions.js';

/**
 * Auth email verification template
 */
const AUTH_EMAIL_VERIFY_TEMPLATE = {
    key: 'auth.email.verify',
    name: 'Email Verification',
    description: 'Sent when a user registers to verify their email address',
    category: 'system' as const,
    title: {
        'en-US': 'Verify your email address',
        'zh-CN': '验证您的邮箱地址',
    },
    message: {
        'en-US': `Hi {userName},

Please verify your email address by clicking the link below:

{verificationUrl}

This link will expire in {expiresInHours} hours.

If you didn't create an account, you can safely ignore this email.

- The WordRhyme Team`,
        'zh-CN': `您好 {userName}，

请点击以下链接验证您的邮箱地址：

{verificationUrl}

此链接将在 {expiresInHours} 小时后过期。

如果您没有注册账号，请忽略此邮件。

- WordRhyme 团队`,
    },
    variables: ['userName', 'verificationUrl', 'expiresInHours'],
    defaultChannels: ['email'],
    priority: 'high' as const,
    pluginId: null,
    deprecated: false,
    version: 1,
};

/**
 * Seed auth templates
 */
export async function seedAuthTemplates(): Promise<void> {
    console.log('Seeding auth email templates...');

    await db
        .insert(notificationTemplates)
        .values(AUTH_EMAIL_VERIFY_TEMPLATE)
        .onConflictDoUpdate({
            target: notificationTemplates.key,
            set: {
                name: AUTH_EMAIL_VERIFY_TEMPLATE.name,
                description: AUTH_EMAIL_VERIFY_TEMPLATE.description,
                title: AUTH_EMAIL_VERIFY_TEMPLATE.title,
                message: AUTH_EMAIL_VERIFY_TEMPLATE.message,
                variables: AUTH_EMAIL_VERIFY_TEMPLATE.variables,
                defaultChannels: AUTH_EMAIL_VERIFY_TEMPLATE.defaultChannels,
                priority: AUTH_EMAIL_VERIFY_TEMPLATE.priority,
                version: AUTH_EMAIL_VERIFY_TEMPLATE.version,
                updatedAt: new Date(),
            },
        });

    console.log('✓ Auth email templates seeded');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    seedAuthTemplates()
        .then(() => {
            console.log('Done!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Failed to seed auth templates:', error);
            process.exit(1);
        });
}
