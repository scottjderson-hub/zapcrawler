# Office365 Cookie-Assisted OAuth Implementation

## Overview

This implementation uses **cookies to bypass login** in an OAuth flow, allowing users to authenticate with Office365 without entering passwords while still getting proper API access tokens.

## How It Works

**Flow**: Cookies → OAuth Authorization → Access Token → Graph API Access

1. **User provides cookies** from their browser session
2. **Cookies skip the login page** in OAuth authorization flow
3. **Microsoft shows consent page** (if not already consented)
4. **System auto-submits consent** (or gets authorization code directly)
5. **Exchange code for access token** using OAuth2
6. **Use access token** with Microsoft Graph API for real email data

## Microsoft Azure Setup Required

### 1. Create Azure AD App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **"New registration"**
4. Set application name: `"Mail Discovery Tool"`
5. Set redirect URI: `http://localhost:3000/auth/microsoft/callback`
6. Click **"Register"**

### 2. Configure Permissions

In your app registration:

1. Go to **API permissions**
2. Click **"Add a permission"**
3. Select **"Microsoft Graph"**
4. Choose **"Delegated permissions"**
5. Add these permissions:
   - `Mail.Read`
   - `Mail.ReadWrite`
   - `offline_access`
6. Click **"Grant admin consent"**

### 3. Get Required Keys

From your app registration, get these values:

- **Application (client) ID** - from Overview page
- **Directory (tenant) ID** - from Overview page
- **Client secret** - from Certificates & secrets (create new secret)

### 4. Configure Environment Variables

Add to your `.env` file:

```bash
# Microsoft OAuth Configuration
MICROSOFT_CLIENT_ID=your_application_client_id_here
MICROSOFT_CLIENT_SECRET=your_client_secret_here
MICROSOFT_TENANT_ID=your_tenant_id_here
MICROSOFT_REDIRECT_URI=http://localhost:3000/auth/microsoft/callback
```

## How to Use

### 1. Get Browser Cookies

1. Login to `outlook.live.com` in your browser
2. Open Developer Tools (F12)
3. Go to **Application/Storage** → **Cookies** → `login.microsoftonline.com`
4. Copy these cookies:
   - `ESTSAUTH`
   - `ESTSAUTHPERSISTENT`
   - `SignInStateCookie`
5. Format as JSON array (see Office365CookieModal for format)

### 2. Add Account

1. Click **"Office365 (Cookies)"** button
2. Enter email address
3. Select proxy (required)
4. Paste cookies in JSON format
5. Click **"Add Account"**

### 3. Authentication Flow

The system will:
1. ✅ Validate cookie format
2. 🔑 Use cookies to access OAuth authorization URL
3. 🔑 Handle consent page automatically (if needed)
4. 🔑 Exchange authorization code for access token
5. ✅ Test access token with Graph API
6. 📧 Fetch real folders and emails using Graph API

## Features

- **Real Authentication**: Uses proper OAuth2 flow with access tokens
- **Cookie Bypass**: Skips password entry using browser cookies
- **Automatic Consent**: Handles Microsoft consent pages automatically
- **Real Data**: Fetches actual folders and emails via Microsoft Graph API
- **Proxy Support**: Routes connections through SOCKS5 proxies
- **Error Handling**: Clear error messages for troubleshooting

## Troubleshooting

### "Microsoft OAuth not configured"
- Set the required environment variables in `.env`

### "Cookie validation failed"
- Ensure cookies include `ESTSAUTH` and `ESTSAUTHPERSISTENT`
- Get fresh cookies from active browser session

### "OAuth flow did not complete automatically"
- Cookies may be expired - get new ones
- Account may require manual consent first
- Check proxy connectivity

### "Access token validation failed"
- Verify Azure app permissions are granted
- Check that tenant ID is correct
- Ensure redirect URI matches Azure configuration

## Implementation Details

### Files Modified

- `backend/src/services/protocols/office365Cookie.ts` - Main implementation
- `src/components/Office365CookieModal.tsx` - UI component (already existed)
- `backend/.env.example` - Environment variables

### Key Methods

- `performCookieAssistedOAuth()` - Main OAuth flow with cookies
- `handleConsentPage()` - Automatic consent submission
- `testAccessToken()` - Validates obtained access token
- `getFolders()` - Real folder data via Graph API
- `syncMessages()` - Real email data via Graph API

## Security Notes

- Cookies are transmitted securely and only used for Microsoft OAuth
- Access tokens are properly scoped to mail permissions only
- All authentication follows Microsoft's OAuth2 standards
- Proxy support ensures connection anonymity if needed

The implementation provides a seamless user experience where users authenticate once in their browser, then the system handles all OAuth complexity automatically while providing real email data access.