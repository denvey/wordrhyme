# OAuth Social Login Setup Guide

This guide explains how to configure OAuth social login providers for WordRhyme.

## Supported Providers

- Google
- GitHub
- Apple

## Prerequisites

- WordRhyme server running
- Access to provider developer consoles
- Environment variables configured

---

## 1. Google OAuth Setup

### 1.1 Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Select **Web application**
6. Configure:
   - **Name**: WordRhyme (or your app name)
   - **Authorized JavaScript origins**: `http://localhost:3000` (dev), `https://your-domain.com` (prod)
   - **Authorized redirect URIs**: `http://localhost:3000/api/auth/callback/google`

### 1.2 Get Credentials

After creation, copy:
- **Client ID** → `GOOGLE_CLIENT_ID`
- **Client Secret** → `GOOGLE_CLIENT_SECRET`

### 1.3 Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** user type (or Internal for organization-only)
3. Fill in required fields: App name, User support email, Developer contact
4. Add scopes: `email`, `profile`, `openid`
5. Add test users if in testing mode

---

## 2. GitHub OAuth Setup

### 2.1 Create OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **OAuth Apps** → **New OAuth App**
3. Configure:
   - **Application name**: WordRhyme
   - **Homepage URL**: `http://localhost:3000` (dev) or your production URL
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`

### 2.2 Get Credentials

After creation, copy:
- **Client ID** → `GITHUB_CLIENT_ID`
- Click **Generate a new client secret** → `GITHUB_CLIENT_SECRET`

---

## 3. Apple Sign In Setup

### 3.1 Prerequisites

- Apple Developer Program membership ($99/year)
- Access to [Apple Developer Portal](https://developer.apple.com/account/resources/identifiers)

### 3.2 Create App ID

1. Go to **Identifiers** → **+** button
2. Select **App IDs** → Continue
3. Select **App** → Continue
4. Configure:
   - **Description**: WordRhyme
   - **Bundle ID**: `com.yourcompany.wordrhyme`
5. Enable **Sign in with Apple** capability
6. Click **Register**

### 3.3 Create Service ID

1. Go to **Identifiers** → **+** button
2. Select **Services IDs** → Continue
3. Configure:
   - **Description**: WordRhyme Web
   - **Identifier**: `com.yourcompany.wordrhyme.web`
4. Enable **Sign in with Apple**
5. Click **Configure**:
   - **Primary App ID**: Select your App ID
   - **Domains**: `localhost`, `your-domain.com`
   - **Return URLs**: `http://localhost:3000/api/auth/callback/apple`
6. Click **Save** → **Register**

### 3.4 Create Private Key

1. Go to **Keys** → **+** button
2. Configure:
   - **Key Name**: WordRhyme Sign In
   - Enable **Sign in with Apple**
   - Click **Configure** → Select your Primary App ID
3. Click **Register**
4. **Download the key file** (`.p8`) - you can only download once!
5. Note the **Key ID**

### 3.5 Get Credentials

- **Service ID** → `APPLE_CLIENT_ID` (e.g., `com.yourcompany.wordrhyme.web`)
- **Private Key** (base64 encoded) → `APPLE_CLIENT_SECRET`
- **Team ID** (from top-right of Apple Developer) → `APPLE_TEAM_ID`
- **Key ID** → `APPLE_KEY_ID`

To encode the private key:
```bash
cat AuthKey_XXXXXX.p8 | base64 | tr -d '\n'
```

---

## 4. Environment Variables

Add to your `.env` file:

```env
# Google
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Apple
APPLE_CLIENT_ID=com.yourcompany.wordrhyme.web
APPLE_CLIENT_SECRET=base64-encoded-private-key
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_KEY_ID=XXXXXXXXXX
```

---

## 5. Callback URLs Reference

| Provider | Development Callback URL | Production Callback URL |
|----------|-------------------------|------------------------|
| Google | `http://localhost:3000/api/auth/callback/google` | `https://your-domain.com/api/auth/callback/google` |
| GitHub | `http://localhost:3000/api/auth/callback/github` | `https://your-domain.com/api/auth/callback/github` |
| Apple | `http://localhost:3000/api/auth/callback/apple` | `https://your-domain.com/api/auth/callback/apple` |

---

## 6. Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `OAuthAccountNotLinked` | Email already registered with different method | User should login with original method first |
| `AccessDenied` | User cancelled OAuth flow | No action needed |
| `Configuration` | Missing or invalid credentials | Check environment variables |
| `redirect_uri_mismatch` | Callback URL not configured | Add exact callback URL in provider console |

### Debug Steps

1. **Check server logs** for `[Auth] Social providers enabled:` message
2. **Verify environment variables** are loaded correctly
3. **Ensure callback URLs** match exactly (including protocol and port)
4. **Clear browser cookies** if switching between accounts

### Provider Not Appearing

If a provider's button doesn't initiate OAuth:
1. Check that both `CLIENT_ID` and `CLIENT_SECRET` are set
2. Restart the server after adding environment variables
3. Check browser console for errors

---

## 7. Security Considerations

- **Never commit secrets** to version control
- Use **environment variables** or a secrets manager
- Rotate credentials periodically
- Use **HTTPS** in production
- Limit callback URLs to your domains only
