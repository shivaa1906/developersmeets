# Facebook OAuth 2.0 Integration & Setup Guide

This document describes how to configure and deploy Facebook OAuth 2.0 authentication for the Nexus.dev enterprise platform.

---

## 1. Create a Meta for Developers Application

1. Navigate to the [Meta for Developers Portal](https://developers.facebook.com/).
2. Log in with your verified Facebook account and click **My Apps** > **Create App**.
3. Choose the appropriate app type:
   - Select **Consumer** or **Build Connected Experiences** (or **Authenticate and request data from users with Facebook Login**).
4. Enter an **App Display Name** (e.g. `Nexus Platform`) and contact email.
5. Click **Create App** and complete the security verification.

---

## 2. Configure the Facebook Login Product

1. On the App Dashboard, locate **Add products to your app**.
2. Find **Facebook Login** (or **Facebook Login for Business**) and click **Set Up**.
3. Select **Web** as the platform.
4. Enter your site URL:
   - Development: `http://localhost:3000`
   - Production: `https://your-domain.com`

---

## 3. Configure Valid OAuth Redirect URIs

1. In the left navigation menu, expand **Facebook Login** and select **Settings**.
2. Under **Client OAuth Settings**, ensure the following toggles are enabled:
   - **Client OAuth Login**: Yes
   - **Web OAuth Login**: Yes
   - **Enforce HTTPS**: Yes (automatically required for production)
3. Under **Valid OAuth Redirect URIs**, add the exact platform callback URIs:
   - **Local Development Callback:**
     ```
     http://localhost:5000/api/auth/facebook/callback
     ```
   - **Production Callback:**
     ```
     https://api.your-domain.com/api/auth/facebook/callback
     ```
     *(or `https://your-domain.com/api/auth/facebook/callback` if serving through a reverse proxy / Next.js rewrites)*
4. Click **Save Changes** at the bottom of the page.

> **CRITICAL SECURITY NOTE:**
> Never add wildcard (`*`) or insecure redirect URIs. The backend server strictly enforces matching between `FACEBOOK_OAUTH_REDIRECT_URI` and the callback destination registered in Meta's Developer Console.

---

## 4. Configure Required App Permissions & Settings

1. In the left sidebar, navigate to **App Review** > **Permissions and Features**.
2. Ensure the following basic identity permissions are granted:
   - `email`: Allows access to the user's primary email address.
   - `public_profile`: Allows access to the user's name and profile photo.
3. No intrusive or high-risk permissions (e.g., `publish_actions`, `pages_manage_posts`, `user_friends`) should ever be requested.
4. Navigate to **App Settings** > **Basic**:
   - Locate your **App ID** (used as `FACEBOOK_CLIENT_ID`).
   - Locate your **App Secret** (used as `FACEBOOK_CLIENT_SECRET`).

---

## 5. Configure Platform Environment Variables

In `backend/.env` (and cloud environment secret managers):

```bash
# ==============================================================================
# Facebook OAuth 2.0 Credentials (Phase 6)
# ==============================================================================
# Development
FACEBOOK_CLIENT_ID=your-facebook-app-id-here
FACEBOOK_CLIENT_SECRET=your-facebook-app-secret-here
FACEBOOK_OAUTH_REDIRECT_URI=http://localhost:5000/api/auth/facebook/callback

# Production Example
# FACEBOOK_CLIENT_ID=123456789012345
# FACEBOOK_CLIENT_SECRET=abcdef0123456789abcdef0123456789
# FACEBOOK_OAUTH_REDIRECT_URI=https://api.your-domain.com/api/auth/facebook/callback
```

> **ZERO SECRET LEAKAGE:**
> Never commit real secrets to Git repositories. Keep credentials restricted to `.env` and environment secret vaults.

---

## 6. Run the Application

Start the local development stack:

```bash
# Start backend API (port 5000)
cd backend
npm run dev

# Start frontend UI (port 3000)
cd frontend
npm run dev
```

---

## 7. Testing Facebook Authentication

1. Open your browser and navigate to `http://localhost:3000/login`.
2. Click **Continue with Facebook**.
3. You will be redirected to Facebook's OAuth consent screen (`https://www.facebook.com/v19.0/dialog/oauth`).
4. Log in and authorize permissions (`email`, `public_profile`).
5. After authorization, Facebook redirects back to `/api/auth/facebook/callback`, which:
   - Consumes and validates the single-use cryptographic state token (PKCE S256).
   - Exchanges the authorization code for an access token.
   - Cryptographically verifies token validity and audience matching against `FACEBOOK_CLIENT_ID`.
   - Fetches the user profile with HMAC-SHA256 `appsecret_proof`.
   - Resolves or safely provisions the platform identity.
   - Issues a platform JWT session with `token_version`.
   - Redirects to `/auth/callback`, establishing the authenticated session and routing to the client workspace.

---

## 8. Error Scenarios & Security Protections

- **User Cancellation:** Handled gracefully with redirect to `/login?error=cancelled`.
- **Missing Email:** If a Facebook account lacks an email (e.g., registered via phone only), registration halts with a safe prompt (`missing_email`) preventing fake/placeholder emails.
- **Email Conflict Defense:** If an email is already registered locally without a Facebook link, the system returns `account_exists_conflict`, directing the user to sign in with their existing credentials to prevent unauthorized account hijacking.
- **Account Status Safeguards:** Suspended (`403 account_suspended`) and disabled (`403 account_disabled`) accounts are rejected immediately.
