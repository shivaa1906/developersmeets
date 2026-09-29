# Discord OAuth 2.0 Integration & Setup Guide

This document describes how to configure and deploy Discord OAuth 2.0 authentication for the Nexus.dev enterprise platform.

---

## 1. Create a Discord Developer Application

1. Navigate to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Log in with your verified Discord account and click **New Application** (top right).
3. Enter an **Application Name** (e.g. `Nexus Platform` or `Nexus Dev Platform`).
4. Agree to the Discord Developer Terms of Service and Developer Policy, then click **Create**.
5. Optionally add an app icon, description, and tags in the **General Information** tab.

---

## 2. Configure OAuth2 Settings & Redirect URIs

1. In the left navigation menu, click **OAuth2** > **General**.
2. Under **Redirects**, click **Add Redirect**.
3. Add the exact platform callback URIs:
   - **Local Development Callback:**
     ```
     http://localhost:5000/api/auth/discord/callback
     ```
   - **Production Callback:**
     ```
     https://api.your-domain.com/api/auth/discord/callback
     ```
     *(or `https://your-domain.com/api/auth/discord/callback` if serving through a reverse proxy / Next.js rewrites)*
4. Click **Save Changes** at the bottom of the page.

> **CRITICAL SECURITY NOTE:**
> Never add wildcard (`*`) or insecure redirect URIs. The backend server strictly enforces matching between `DISCORD_OAUTH_REDIRECT_URI` and the callback destination registered in Discord's Developer Portal.

---

## 3. Retrieve Client Credentials & Configure Scopes

1. In the **OAuth2** tab:
   - Locate your **Client ID** (used as `DISCORD_CLIENT_ID`).
   - Locate your **Client Secret** (click **Reset Secret** if needed, used as `DISCORD_CLIENT_SECRET`).
2. Scopes enforced by the platform:
   - `identify`: Retrieves user snowflake ID, username, global name, and avatar.
   - `email`: Retrieves verified primary email address.
3. No intrusive or bot permissions (e.g. `bot`, `guilds`, `messages.read`, `administrator`) should ever be requested. This integration is strictly for user authentication.

---

## 4. Configure Platform Environment Variables

In `backend/.env` (and cloud environment secret managers):

```bash
# ==============================================================================
# Discord OAuth 2.0 Credentials (Phase 7)
# ==============================================================================
# Development
DISCORD_CLIENT_ID=your-discord-client-id-here
DISCORD_CLIENT_SECRET=your-discord-client-secret-here
DISCORD_OAUTH_REDIRECT_URI=http://localhost:5000/api/auth/discord/callback

# Production Example
# DISCORD_CLIENT_ID=123456789012345678
# DISCORD_CLIENT_SECRET=abcdef0123456789abcdef0123456789
# DISCORD_OAUTH_REDIRECT_URI=https://api.your-domain.com/api/auth/discord/callback
```

> **ZERO SECRET LEAKAGE:**
> Never commit real secrets to Git repositories. Keep credentials restricted to `.env` and environment secret vaults.

---

## 5. Run the Application

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

## 6. Test Discord Authentication Flow

1. Open your browser and navigate to `http://localhost:3000/login`.
2. Click **Continue with Discord**.
3. You will be redirected to Discord's official authorization dialog (`https://discord.com/oauth2/authorize`).
4. Authorize the application.
5. Discord redirects back to `/api/auth/discord/callback`, which:
   - Validates the single-use PKCE state and code verifier
   - Exchanges code for access token via `https://discord.com/api/v10/oauth2/token`
   - Retrieves user identity profile from `https://discord.com/api/v10/users/@me`
   - Verifies email is verified on Discord
   - Either logs in existing user or safely provisions a new `CLIENT` organization account
   - Sets secure session JWT (`auth_token`) and redirects to `/dashboard`
