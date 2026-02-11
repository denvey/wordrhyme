# @wordrhyme/plugin-email-resend

Send notification emails via [Resend](https://resend.com) API.

## Features

- Sends email notifications through Resend's reliable infrastructure
- Integrates with WordRhyme's notification system as an email channel
- Admin UI for configuration and testing
- Secure API key storage with encryption
- Multi-language support (en-US, zh-CN)

## Installation

1. Copy the plugin to your WordRhyme plugins directory:
   ```bash
   cp -r plugins/email-resend /path/to/wordrhyme/plugins/
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Build the plugin:
   ```bash
   pnpm build
   ```

4. Restart WordRhyme to load the plugin.

## Configuration

### Required Settings

| Setting | Description |
|---------|-------------|
| `api_key` | Your Resend API key (starts with `re_`) |
| `from_address` | The email address to send from (must be verified in Resend) |

### Optional Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `from_name` | Display name for the sender | `WordRhyme` |
| `reply_to` | Reply-to email address | None |

### Getting a Resend API Key

1. Sign up at [resend.com](https://resend.com)
2. Verify your domain or use Resend's testing domain
3. Create an API key in the [API Keys section](https://resend.com/api-keys)
4. Copy the key (starts with `re_`)

## Usage

### Via Admin UI

1. Navigate to the plugin settings in WordRhyme admin
2. Enter your Resend API key
3. Configure the sender email address
4. Click "Test Connection" to verify the setup

### Via tRPC API

The plugin exposes the following tRPC endpoints:

#### `emailResend.getSettings`

Get current plugin configuration (API key is masked).

```typescript
const settings = await trpc.emailResend.getSettings.query();
// { isConfigured: true, fromAddress: "noreply@example.com", fromName: "WordRhyme", replyTo: null }
```

#### `emailResend.updateSettings`

Update plugin configuration.

```typescript
await trpc.emailResend.updateSettings.mutate({
  apiKey: "re_xxxxxxxxxx",
  fromAddress: "noreply@example.com",
  fromName: "My App",
  replyTo: "support@example.com"
});
```

#### `emailResend.testConnection`

Send a test email to verify configuration.

```typescript
const result = await trpc.emailResend.testConnection.mutate({
  email: "test@example.com"
});
// { success: true, emailId: "email_xxx" }
```

### Notification Channel

The plugin registers as a notification channel: `plugin:com.wordrhyme.email-resend:email`

Users can enable this channel in their notification preferences to receive emails for:
- System notifications
- Content updates
- Custom plugin notifications

## Development

### Project Structure

```
plugins/email-resend/
├── src/
│   ├── server/             # Server-side code
│   │   ├── index.ts        # Plugin entry, lifecycle, tRPC router
│   │   ├── resend.service.ts # Resend SDK wrapper
│   │   └── __tests__/      # Test files
│   └── admin/              # Admin UI (React)
│       ├── SettingsPage.tsx
│       ├── TestEmailForm.tsx
│       └── index.tsx
├── manifest.json           # Plugin manifest
├── package.json
├── tsconfig.json
├── tsup.config.ts          # Server build config
├── rsbuild.config.ts       # Admin UI build config
└── vitest.config.ts        # Test config
```

### Scripts

```bash
# Build everything
pnpm build

# Development mode (watch)
pnpm dev

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Watch tests
pnpm test:watch
```

### Testing

The plugin includes comprehensive tests:

- **Unit Tests** (`resend.service.test.ts`): Tests for the ResendEmailService class
- **Integration Tests** (`channel.handler.test.ts`): Tests for lifecycle hooks and notification handling
- **Property-Based Tests** (`pbt.invariants.test.ts`): Security invariants using fast-check

## Permissions

The plugin declares the following permissions:

| Permission | Description |
|------------|-------------|
| `plugin:com.wordrhyme.email-resend:settings.read` | Read plugin settings |
| `plugin:com.wordrhyme.email-resend:settings.write` | Update plugin settings |
| `plugin:com.wordrhyme.email-resend:test.send` | Send test emails |

## Troubleshooting

### "Plugin not configured" warning

Ensure you have set both the API key and from address in the plugin settings.

### "Invalid API key" error

- Verify your API key starts with `re_`
- Check if the key is still valid in Resend dashboard
- Ensure the key has permission to send emails

### Emails not being received

- Check if the from address domain is verified in Resend
- Check spam/junk folder
- Review Resend dashboard for delivery status

## License

Private - WordRhyme CMS Plugin
