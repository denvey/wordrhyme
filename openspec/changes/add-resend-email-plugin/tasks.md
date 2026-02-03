# Implementation Tasks (Zero-Decision Execution Plan)

所有决策已完成，以下任务可机械执行，无需额外判断。

**实施进度**: Phase 1-4 已完成 ✅

---

## Phase 1: Plugin Scaffolding ✅

### 1.1 Create Plugin Directory Structure ✅
```bash
mkdir -p plugins/email-resend/src/{server,admin/components}
mkdir -p plugins/email-resend/dist
```

### 1.2 Create package.json ✅
- [x] File: `plugins/email-resend/package.json`

### 1.3 Create manifest.json ✅
- [x] File: `plugins/email-resend/manifest.json`

### 1.4 Create tsconfig.json ✅
- [x] File: `plugins/email-resend/tsconfig.json`

### 1.5 Create tsup.config.ts ✅
- [x] File: `plugins/email-resend/tsup.config.ts`

### 1.6 Create rsbuild.config.ts ✅
- [x] File: `plugins/email-resend/rsbuild.config.ts`

---

## Phase 2: Server Implementation ✅

### 2.1 Create ResendEmailService ✅
- [x] File: `plugins/email-resend/src/server/resend.service.ts`

### 2.2 Create Plugin Entry Point ✅
- [x] File: `plugins/email-resend/src/server/index.ts`
- Includes tRPC router with `getStatus`, `saveSettings`, `sendTest` endpoints
- Lifecycle hooks: `onEnable`, `onDisable`
- Notification channel registration and event subscription

---

## Phase 3: Admin UI Implementation ✅

### 3.1 Create Settings Page Component ✅
- [x] File: `plugins/email-resend/src/admin/components/SettingsPage.tsx`

### 3.2 Create Test Email Form Component ✅
- [x] File: `plugins/email-resend/src/admin/components/TestEmailForm.tsx`

### 3.3 Create Admin Entry Point ✅
- [x] File: `plugins/email-resend/src/admin/index.tsx`

---

## Phase 4: Build Configuration ✅

### 4.1 Configure tsup for Server Build ✅
- [x] Output: `dist/server/index.js` (ESM)
- [x] External: `@wordrhyme/plugin`, `resend`

### 4.2 Configure Module Federation for Admin ✅
- [x] Output: `dist/admin/remoteEntry.js`
- [x] Expose: `./admin`
- [x] Shared: `react`, `react-dom`, `lucide-react`, `@wordrhyme/ui`

### 4.3 Build and Verify ✅
- [x] Run `pnpm build` - SUCCESS
- [x] Verify `dist/` structure matches manifest paths

---

## Phase 5: Testing

### 5.1 Unit Tests for ResendEmailService
- [ ] File: `plugins/email-resend/src/server/__tests__/resend.service.test.ts`

Test cases:
- `initialize()` with valid API key
- `send()` success returns email ID
- `send()` failure throws error with message
- `isConfigured()` returns false before init
- API key format validation (starts with `re_`)

### 5.2 Integration Tests for Channel Handler
- [ ] File: `plugins/email-resend/src/server/__tests__/channel.handler.test.ts`

Test cases:
- `onEnable()` registers channel with correct key
- Event handler only sends email when channel in list
- Event handler skips users without email
- Event handler logs error but doesn't throw on failure

### 5.3 PBT (Property-Based) Tests
- [ ] API key never appears in logs (string search)
- [ ] Multiple onEnable calls = 1 channel
- [ ] Retry count never exceeds 3

---

## Phase 6: Documentation

### 6.1 Create Plugin README
- [ ] File: `plugins/email-resend/README.md`

Contents:
- Prerequisites (Resend account)
- Installation steps
- Configuration guide
- Troubleshooting

---

## Verification Checklist

Before marking complete:
- [ ] `manifest.json` passes schema validation
- [ ] Plugin loads without errors
- [ ] Settings can be saved and retrieved
- [ ] Test email sends successfully
- [ ] Notification → Email flow works end-to-end
- [ ] All PBT invariants pass
