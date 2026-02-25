# Change Proposal: Add OAuth Social Login

**Change ID:** `add-oauth-social-login`
**Status:** `draft`
**Created:** 2025-02-06
**Author:** Claude AI

---

## 1. Context

### 1.1 User Need

WordRhyme CMS needs to support OAuth social login (Google, GitHub, Apple) to provide a seamless authentication experience. Users should be able to:

- Sign in with Google, GitHub, or Apple instead of email/password
- Have accounts auto-linked when the OAuth email matches an existing local account
- Manage OAuth providers through Admin settings UI

### 1.2 Current State

- **Authentication**: `better-auth` with email/password, organization, admin, apiKey plugins
- **Login UI**: Simple email/password form at `apps/admin/src/pages/Login.tsx`
- **Settings System**: Core Settings system exists at `apps/server/src/settings/`
- **Social Login**: **NOT YET CONFIGURED**

### 1.3 Constraints Discovered

| Constraint ID | Source | Description |
|---------------|--------|-------------|
| HC-1 | CORE_DOMAIN_CONTRACT.md | Identity/Session belongs to Core, cannot be fully pluginized |
| HC-2 | SYSTEM_INVARIANTS.md | Core is the final authority for identity |
| HC-3 | Better-Auth Docs | `socialProviders` must be configured at initialization time |
| SC-1 | User Requirement | Admin UI to enable/disable providers |
| SC-2 | User Requirement | Auto-link accounts with same email |
| SC-3 | User Requirement | First phase: Google + GitHub + Apple |

---

## 2. Requirements

### R1: Core OAuth Provider Configuration

**Scenario:** System administrator configures OAuth providers

**Given:**
- Better-Auth natively supports Google, GitHub, Apple (no extra packages needed)
- Settings system can store sensitive configuration

**When:**
- Admin configures OAuth provider credentials in Settings UI
- System restarts (rolling reload)

**Then:**
- Configured providers are available at login
- Provider credentials are stored securely (encrypted)
- Disabled providers do not appear on login page

**Constraints:**
- Must use better-auth native `socialProviders` configuration
- Must support runtime enable/disable via Settings (requires restart)

---

### R2: Account Auto-Linking

**Scenario:** User signs in with OAuth using email that exists locally

**Given:**
- Local account exists with email `user@example.com`
- User signs in with Google using same email

**When:**
- OAuth callback is processed

**Then:**
- OAuth identity is linked to existing account
- No duplicate user is created
- User session uses the existing account

**Implementation Note:**
- Better-Auth handles this via `account` table linking
- No custom code needed if `trustEmail: true` is configured

---

### R3: Login UI with OAuth Buttons

**Scenario:** User views login page

**Given:**
- At least one OAuth provider is enabled in settings

**When:**
- User navigates to `/login`

**Then:**
- OAuth provider buttons are displayed (Google, GitHub, Apple icons)
- Clicking button initiates OAuth flow via `authClient.signIn.social()`
- After successful OAuth, user is redirected to dashboard

**Design Constraints:**
- Buttons should follow shadcn/ui styling
- Show only enabled providers
- Handle loading states

---

### R4: OAuth Provider Settings UI

**Scenario:** Admin configures OAuth providers

**Given:**
- User has super-admin role
- Settings page is accessible

**When:**
- Admin navigates to Settings > Authentication

**Then:**
- Each provider (Google, GitHub, Apple) has:
  - Enable/Disable toggle
  - Client ID input
  - Client Secret input (masked)
  - Optional: Redirect URI display (read-only, auto-generated)
- Save requires restart notification

**Security Constraints:**
- Client secrets must be encrypted at rest
- Only super-admins can access this setting

---

## 3. Success Criteria

| Criteria | Verification Method |
|----------|---------------------|
| Google login works end-to-end | Manual test: sign in with Google account |
| GitHub login works end-to-end | Manual test: sign in with GitHub account |
| Apple login works end-to-end | Manual test: sign in with Apple account |
| Account linking works | Test: create local account, then sign in with same email via Google |
| Settings UI saves configuration | Test: configure provider, restart, verify config persisted |
| Disabled providers hidden | Test: disable Google, verify button not shown on login |

---

## 4. Technical Approach

### 4.1 Phase 1: Core Configuration (Static)

Minimal implementation with environment variable configuration:

1. **Modify `auth.ts`**: Add `socialProviders` configuration
2. **Modify `Login.tsx`**: Add OAuth buttons
3. **Modify `auth-client.ts`**: Export `signIn.social`
4. **Add env vars**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, etc.

### 4.2 Phase 2: Settings-Driven (Dynamic)

Configuration via Admin Settings:

1. **Add OAuth Settings Schema**: Define `auth.oauth.providers` in Settings system
2. **Build Settings UI**: OAuth provider configuration form
3. **Refactor `auth.ts`**: Read from Settings instead of env vars
4. **Handle restart**: Settings change triggers reload notification

### 4.3 Future: Plugin-Based Providers

For providers requiring custom code (WeChat, OIDC):

1. **Create `AUTH_EXTENSION_CONTRACT.md`**: Define OAuth extension point
2. **Plugin discovery**: Allow plugins to register OAuth providers
3. **Example plugin**: `@wordrhyme/auth-wechat`

---

## 5. Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| better-auth | Installed | Native social provider support |
| Settings System | Exists | `apps/server/src/settings/` |
| Login Page | Exists | `apps/admin/src/pages/Login.tsx` |
| Google Cloud Console | External | Need to create OAuth credentials |
| GitHub OAuth App | External | Need to create OAuth app |
| Apple Developer | External | Need to configure Sign in with Apple |

---

## 6. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| OAuth callback URL mismatch | Login fails | Document correct callback URLs in setup guide |
| Secrets exposed in logs | Security breach | Use masked logging for auth configs |
| Account takeover via email | Security | Require email verification before linking |

---

## 7. Out of Scope

- WeChat / Enterprise WeChat (requires plugin architecture)
- Generic OIDC provider (future enhancement)
- Multi-tenant OAuth (each org has own credentials)
- SSO/SAML (enterprise feature)

---

## 8. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-02-06 | Core configuration, not plugin | Better-Auth natively supports Google/GitHub/Apple; Identity is Core responsibility |
| 2025-02-06 | Settings-driven enable/disable | Allows Admin UI control without code changes |
| 2025-02-06 | Auto-link same email accounts | Better UX, standard OAuth behavior |
| 2025-02-06 | Hand-write Login UI (not better-auth-ui) | Avoid 15+ Radix peer dependencies; use existing @wordrhyme/ui components |

---

## 9. UI Reference (from better-auth-ui)

### Social Login Button Layout

```tsx
// Reference layout from better-auth-ui
<div className="flex flex-col gap-2">
  {/* Divider */}
  <div className="relative my-4">
    <div className="absolute inset-0 flex items-center">
      <Separator />
    </div>
    <div className="relative flex justify-center text-xs uppercase">
      <span className="bg-background px-2 text-muted-foreground">
        Or continue with
      </span>
    </div>
  </div>

  {/* Provider Buttons */}
  <div className="grid grid-cols-3 gap-2">
    <Button variant="outline" onClick={() => signIn.social({ provider: 'google' })}>
      <GoogleIcon className="size-4" />
    </Button>
    <Button variant="outline" onClick={() => signIn.social({ provider: 'github' })}>
      <GitHubIcon className="size-4" />
    </Button>
    <Button variant="outline" onClick={() => signIn.social({ provider: 'apple' })}>
      <AppleIcon className="size-4" />
    </Button>
  </div>
</div>
```

### Provider Icons (SVG)

**Google Icon:**
```tsx
const GoogleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 256 262" xmlns="http://www.w3.org/2000/svg">
    <path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027" fill="#4285f4"/>
    <path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1" fill="#34a853"/>
    <path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z" fill="#fbbc05"/>
    <path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251" fill="#eb4335"/>
  </svg>
);
```

**GitHub Icon:**
```tsx
const GitHubIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 .297c-6.63 0-12 5.373-12 12c0 5.303 3.438 9.8 8.205 11.385c.6.113.82-.258.82-.577c0-.285-.01-1.04-.015-2.04c-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729c1.205.084 1.838 1.236 1.838 1.236c1.07 1.835 2.809 1.305 3.495.998c.108-.776.417-1.305.76-1.605c-2.665-.3-5.466-1.332-5.466-5.93c0-1.31.465-2.38 1.235-3.22c-.135-.303-.54-1.523.105-3.176c0 0 1.005-.322 3.3 1.23c.96-.267 1.98-.399 3-.405c1.02.006 2.04.138 3 .405c2.28-1.552 3.285-1.23 3.285-1.23c.645 1.653.24 2.873.12 3.176c.765.84 1.23 1.91 1.23 3.22c0 4.61-2.805 5.625-5.475 5.92c.42.36.81 1.096.81 2.22c0 1.606-.015 2.896-.015 3.286c0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" fill="currentColor"/>
  </svg>
);
```

**Apple Icon:**
```tsx
const AppleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.438 31.401a7 7 0 0 1-1.656-1.536a20 20 0 0 1-1.422-1.938a18.9 18.9 0 0 1-2.375-4.849c-.667-2-.99-3.917-.99-5.792c0-2.094.453-3.922 1.339-5.458a7.7 7.7 0 0 1 2.797-2.906a7.45 7.45 0 0 1 3.786-1.12q.705.002 1.51.198c.385.109.854.281 1.427.495c.729.281 1.13.453 1.266.495c.427.156.786.224 1.068.224c.214 0 .516-.068.859-.172c.193-.068.557-.188 1.078-.411c.516-.188.922-.349 1.245-.469c.495-.146.974-.281 1.401-.349a6.7 6.7 0 0 1 1.531-.063a9 9 0 0 1 2.589.557c1.359.547 2.458 1.401 3.276 2.615a6.4 6.4 0 0 0-.969.734a8.2 8.2 0 0 0-1.641 2.005a6.8 6.8 0 0 0-.859 3.359c.021 1.443.391 2.714 1.12 3.813a7.2 7.2 0 0 0 2.047 2.047c.417.281.776.474 1.12.604c-.161.5-.333.984-.536 1.464a19 19 0 0 1-1.667 3.083c-.578.839-1.031 1.464-1.375 1.88c-.536.635-1.052 1.12-1.573 1.458c-.573.38-1.25.583-1.938.583a4.4 4.4 0 0 1-1.38-.167c-.385-.13-.766-.271-1.141-.432a9 9 0 0 0-1.203-.453a6.3 6.3 0 0 0-3.099-.005c-.417.12-.818.26-1.214.432c-.557.234-.927.391-1.141.458c-.427.125-.87.203-1.318.229c-.693 0-1.339-.198-1.979-.599zm9.14-24.615c-.906.453-1.771.646-2.63.583c-.135-.865 0-1.75.359-2.719a7.3 7.3 0 0 1 1.333-2.24A7.1 7.1 0 0 1 19.812.733q1.319-.68 2.521-.734c.104.906 0 1.797-.333 2.76a8 8 0 0 1-1.333 2.344a6.8 6.8 0 0 1-2.115 1.682z" fill="currentColor"/>
  </svg>
);
```
