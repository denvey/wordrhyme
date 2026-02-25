# Change Proposal: OAuth Admin Settings UI

**Change ID:** `oauth-admin-settings`
**Type:** `feature`
**Priority:** `high`
**Status:** `ready-for-implementation`

---

## Summary

Add an admin settings page to configure OAuth social login providers (Google, GitHub, Apple) through the management interface, replacing the environment variable-based configuration from Phase 1.

## Background

Phase 1 implemented OAuth social login with environment variable configuration:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`

This requires server restart and direct access to environment files. Phase 2 enables runtime configuration through the admin UI.

## Requirements

### R1: OAuth Settings Page
Create a dedicated settings page at `/platform/settings/oauth` for managing OAuth providers:
- List all supported providers (Google, GitHub, Apple)
- Show enabled/disabled status
- Configure credentials per provider
- Test connection before saving

### R2: Settings Storage
Use existing Settings system with scope `global`:
- Key pattern: `auth.oauth.{provider}.{field}`
- Example: `auth.oauth.google.clientId`, `auth.oauth.google.clientSecret`
- Secrets stored encrypted (`encrypted: true`)

### R3: Runtime Provider Loading
Modify `buildSocialProviders()` to:
1. First check database settings
2. Fall back to environment variables if not configured in DB
3. Log which configuration source is used

### R4: API Endpoint
Create tRPC router for OAuth settings:
- `oauth.getProviders` - List all providers with status
- `oauth.getProvider` - Get single provider config (secrets masked)
- `oauth.setProvider` - Update provider configuration
- `oauth.testConnection` - Validate credentials

## Design

### Settings Keys

| Key | Type | Encrypted | Description |
|-----|------|-----------|-------------|
| `auth.oauth.google.enabled` | boolean | No | Enable Google OAuth |
| `auth.oauth.google.clientId` | string | No | Google Client ID |
| `auth.oauth.google.clientSecret` | string | Yes | Google Client Secret |
| `auth.oauth.github.enabled` | boolean | No | Enable GitHub OAuth |
| `auth.oauth.github.clientId` | string | No | GitHub Client ID |
| `auth.oauth.github.clientSecret` | string | Yes | GitHub Client Secret |
| `auth.oauth.apple.enabled` | boolean | No | Enable Apple OAuth |
| `auth.oauth.apple.clientId` | string | No | Apple Service ID |
| `auth.oauth.apple.clientSecret` | string | Yes | Apple Private Key (base64) |
| `auth.oauth.apple.teamId` | string | No | Apple Team ID |
| `auth.oauth.apple.keyId` | string | No | Apple Key ID |

### UI Layout

```
┌─────────────────────────────────────────────────────┐
│ OAuth Settings                                       │
├─────────────────────────────────────────────────────┤
│                                                      │
│ ┌─ Google ────────────────────────────────────────┐ │
│ │ [Toggle: Enabled]                               │ │
│ │ Client ID: [_________________________]          │ │
│ │ Client Secret: [••••••••••••] [Show]           │ │
│ │ Callback URL: https://...                       │ │
│ │                        [Test Connection] [Save] │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ GitHub ────────────────────────────────────────┐ │
│ │ [Toggle: Enabled]                               │ │
│ │ Client ID: [_________________________]          │ │
│ │ Client Secret: [••••••••••••]                  │ │
│ │                        [Test Connection] [Save] │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ Apple ─────────────────────────────────────────┐ │
│ │ [Toggle: Disabled]                              │ │
│ │ Service ID: [_________________________]         │ │
│ │ Team ID: [___________]  Key ID: [___________]  │ │
│ │ Private Key: [Upload .p8 file]                 │ │
│ │                        [Test Connection] [Save] │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ Note: Changes take effect immediately. No restart   │
│ required.                                           │
└─────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 2.1: Backend API
1. Create `apps/server/src/trpc/routers/oauth-settings.ts`
2. Implement CRUD operations using SettingsService
3. Add to main router

### Phase 2.2: Modify Provider Loading
1. Update `buildSocialProviders()` to read from DB first
2. Add cache for OAuth settings (5 min TTL)
3. Handle graceful fallback to env vars

### Phase 2.3: Admin UI
1. Create `apps/admin/src/pages/OAuthSettings.tsx`
2. Add route at `/platform/settings/oauth`
3. Add navigation menu item

### Phase 2.4: Login Page Enhancement
1. Modify Login.tsx to only show enabled providers
2. Add API to fetch enabled providers list
3. Handle provider availability dynamically

## Out of Scope

- Provider-specific configuration (scopes, permissions)
- Per-tenant OAuth configuration (all OAuth is global)
- OAuth provider marketplace

## Security Considerations

1. **Secrets encryption**: All client secrets stored with `encrypted: true`
2. **Permission check**: Only users with `manage Settings` can access
3. **Audit logging**: All OAuth config changes logged
4. **Secret masking**: API never returns raw secrets, only masked values
