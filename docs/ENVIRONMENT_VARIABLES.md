# Environment Variables Reference & Deployment Guide

This document lists all required environment variables for both the **Frontend (Next.js 14 App Router)** and **Backend (Node.js/Express/PostgreSQL)** across local development and production cloud platforms (such as Render.com, Railway, Vercel, or AWS).

---

## 1. Quick Copy-Paste: Render.com Deployment

When deploying on Render, you typically configure two separate Web Services:
1. **Frontend Web Service** (Build: `npm install && npm run build:frontend`, Start: `npm run start --workspace=frontend`)
2. **Backend Web Service** (Build: `npm install && npm run build:backend`, Start: `npm run start --workspace=backend`)
3. **Render PostgreSQL Database** (Managed Database)

### 1.1 Frontend Web Service (Render Dashboard Environment Variables)

| Key | Value Example | Description |
| :--- | :--- | :--- |
| `NODE_VERSION` | `20.18.0` | Pins active LTS Node runtime (avoid Node 24). |
| `NODE_ENV` | `production` | **Required.** Must be `production` for Next.js builds. |
| `NEXT_PUBLIC_SITE_URL` | `https://your-frontend.onrender.com` | Public canonical URL for metadata and OpenGraph. |
| `INTERNAL_API_URL` | `https://your-backend.onrender.com` | Destination used by `next.config.mjs` to proxy `/api/*`. |
| `NEXT_PUBLIC_WS_URL` | `wss://your-backend.onrender.com/ws` | Full WebSocket endpoint for realtime chat & notifications. |
| `PORT` | `3000` | (Render sets its own internal port, but 3000 is default). |

> [!IMPORTANT]
> **Never set `NODE_ENV=development` on your frontend build!** Setting `NODE_ENV=development` causes Next.js to mix the development server runtime with production static generation, throwing `TypeError: Cannot read properties of null (reading 'useContext')`.

---

### 1.2 Backend Web Service (Render Dashboard Environment Variables)

| Key | Value Example | Description |
| :--- | :--- | :--- |
| `NODE_VERSION` | `20.18.0` | Pins active LTS Node runtime. |
| `NODE_ENV` | `production` | Enables production logging and security policies. |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db?sslmode=require` | Render PostgreSQL "Internal Database URL". |
| `JWT_SECRET` | *64-character random hex string* | Secret key for signing authentication tokens. |
| `JWT_EXPIRES_IN` | `7d` | Token session duration (`7d`, `24h`, etc.). |
| `CORS_ORIGIN` | `https://your-frontend.onrender.com` | Permitted frontend origins (no trailing slash). |
| `CREDIT_PRICE_INR` | `50` | Base price in INR per platform credit. |
| `CLAIM_COST_CREDITS` | `1` | Credits required to claim a project slot. |
| `DEFAULT_REFUND_PERCENTAGE` | `100` | Refund percentage for unselected developer proposals. |
| `PAYMENT_KEY_ID` | `rzp_test_placeholder_key` | Razorpay / Payment Gateway API Key. |
| `PAYMENT_SECRET` | `replace_with_payment_secret` | Payment Gateway Secret. |
| `PAYMENT_WEBHOOK_SECRET` | `replace_with_webhook_secret` | Webhook verification signature secret. |
| `SEED_DEFAULT_PASSWORD` | `DevPlatform2026!Secure` | Default password for seeded leadership accounts. |

---

## 2. Local Development Configuration

### 2.1 Frontend (`frontend/.env`)

```env
# Public URLs
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:5000/api

# Realtime WebSocket
NEXT_PUBLIC_WS_PORT=5000

# Next.js Server-Side Proxy to Express API
INTERNAL_API_URL=http://127.0.0.1:5000

# Server Port
PORT=3000
```

### 2.2 Backend (`backend/.env`)

```env
# Environment & Port
NODE_ENV=development
PORT=5000

# PostgreSQL Connection String
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nexus_platform

# JWT Authentication
JWT_SECRET=replace_with_a_secure_random_64_character_hex_secret
JWT_EXPIRES_IN=7d

# CORS Allowed Origin
CORS_ORIGIN=http://localhost:3000

# Platform Economy
CREDIT_PRICE_INR=50
CLAIM_COST_CREDITS=1
DEFAULT_REFUND_PERCENTAGE=100

# Payments
PAYMENT_KEY_ID=rzp_test_placeholder_key
PAYMENT_SECRET=replace_with_payment_gateway_secret
PAYMENT_WEBHOOK_SECRET=replace_with_webhook_secret

# Initial Seed Password
SEED_DEFAULT_PASSWORD=DevPlatform2026!Secure
```

---

## 3. How Variables Interact Across Services

```
 [ Browser Client ]
         │
         ├─── (1) HTTP Requests: '/api/*' ──────────────────────────┐
         │        (Proxied by Next.js using INTERNAL_API_URL)        ▼
         │                                               ┌────────────────────┐
         │                                               │   Express API      │
         ├─── (2) WebSocket: NEXT_PUBLIC_WS_URL ────────►│   (Port 5000)      │
         │        (e.g. wss://backend.onrender.com/ws)   │   CORS_ORIGIN      │
         │                                               │   JWT_SECRET       │
         ▼                                               └─────────┬──────────┘
 ┌──────────────────────┐                                          │
 │   Next.js Frontend   │                                          │ (DATABASE_URL)
 │   (Port 3000)        │                                          ▼
 │   NEXT_PUBLIC_*      │                                ┌────────────────────┐
 └──────────────────────┘                                │  PostgreSQL Engine │
                                                         └────────────────────┘
```

---

## 4. Generating Secure Secrets

To generate a secure 64-character hex secret for `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
