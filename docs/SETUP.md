# Local & Staging Environment Setup Guide

A complete, step-by-step walkthrough for setting up, developing, testing, and debugging the **Nexus Developer Company Platform** on your local workstation or staging server.

---

## 1. System Requirements

Ensure your machine meets the minimum requirements:

- **Node.js**: `v20.x` or higher (LTS recommended)
- **npm**: `v10.x` or higher
- **PostgreSQL**: `15.x` or `16.x` (or Docker for running PostgreSQL container)
- **Git**: `2.x`+
- **OS**: Linux (Ubuntu, Debian, Fedora), macOS, or Windows WSL2

Verify your local toolchain:

```bash
node -v   # Expected: v20.x+
npm -v    # Expected: 10.x+
git --version
```

---

## 2. Quick Start (3 Minutes)

If you already have Docker installed and running, you can boot the entire stack in one command:

```bash
# 1. Clone the repository
git clone https://github.com/your-org/developer-company-platform.git
cd developer-company-platform

# 2. Copy environment files
cp .env.example .env
cp backend/.env.example backend/.env 2>/dev/null || cp .env backend/.env
cp frontend/.env.example frontend/.env.local 2>/dev/null || true

# 3. Launch Docker Compose stack
docker compose up -d --build

# 4. Apply database migrations & seed initial accounts
docker compose exec backend npm run db:migrate
docker compose exec backend npm run db:seed

# Access the applications:
# Frontend: http://localhost:3000
# Backend API: http://localhost:5000/api
# Health Check: http://localhost:5000/api/health
```

---

## 3. Manual Step-by-Step Local Setup (Native)

Follow these steps if you want to run the platform directly on your machine for fast interactive development.

### Step 3.1: Install Dependencies

The repository uses npm workspaces to manage both frontend and backend in a monorepo. Install all root and workspace dependencies:

```bash
npm install
```

### Step 3.2: Configure PostgreSQL Database

#### Option A: Run PostgreSQL in Docker (Simplest)

```bash
# Start a clean PostgreSQL 16 container on port 5432
docker run -d \
  --name nexus-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=nexus_platform \
  -p 5432:5432 \
  -v nexus_postgres_data:/var/lib/postgresql/data \
  postgres:16-alpine
```

#### Option B: Local Native PostgreSQL

If using a native local PostgreSQL service:

```bash
sudo -u postgres psql -c "CREATE USER postgres WITH PASSWORD 'postgres' SUPERUSER;"
sudo -u postgres psql -c "CREATE DATABASE nexus_platform OWNER postgres;"
```

### Step 3.3: Environment Files Configuration

Ensure `.env` in the root repository and in `backend/` have valid settings:

Create `backend/.env`:
```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nexus_platform
JWT_SECRET=nexus_local_development_secret_key_2026_super_secure
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3000
CREDIT_PRICE_INR=50
CLAIM_COST_CREDITS=1
DEFAULT_REFUND_PERCENTAGE=100
```

Create `frontend/.env.local`:
```env
NODE_ENV=development
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=/api
INTERNAL_API_URL=http://127.0.0.1:5000
```

### Step 3.4: Apply Migrations & Seed Data

Run migrations to create all database tables, foreign keys, triggers, and enum types:

```bash
# Apply all 11 database migrations in sequence
npm run db:migrate --workspace=backend

# Seed test users, CEO/MD accounts, default skills, and Client #001 with projects
npm run db:seed --workspace=backend
```

### Step 3.5: Start Development Servers

You can launch both the backend daemon and Next.js frontend concurrently from the root directory:

```bash
# Run both Backend (Port 5000) and Frontend (Port 3000)
npm run dev:all
```

Or run them in separate terminal tabs:

**Terminal 1 (Backend with auto-restart watch mode):**
```bash
npm run dev:backend
```

**Terminal 2 (Next.js Frontend with Turbopack / Fast Refresh):**
```bash
npm run dev
```

---

## 4. Default Seed Accounts & Quick Login Credentials

The platform includes pre-configured roles with realistic data ready for instant testing on [`http://localhost:3000/login`](http://localhost:3000/login):

| Role | Name | Email | Password | Primary Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **Client #001** | Apex Retail Labs | `client001@apexretail.io` | `password123` | Owns 18 projects, creates support tickets, selects proposals, approves deliverables |
| **Developer #01** | Rahul Kumar | `rahul@nexus.dev` | `password123` | Verified developer portfolio, claims projects, submits proposals, participates in support bridges |
| **CEO / Admin** | Ritesh Lingamallu | `ritesh@nexus.dev` | `password123` | Full administrative governance, approvals, refunds, credit adjustments, support staff operations |
| **MD** | M. Shiva Gopi | `shiva@nexus.dev` | `password123` | Technical management, developer verification, project milestones, support escalation |

> **Pro Tip**: On the `/login` page, you can click any of the **Quick Role Autofill** buttons (`Client #001`, `Developer`, `CEO Ritesh`, `MD Shiva`) to automatically populate credentials and log in with a single click.

---

## 5. Walkthrough: Testing the Complete Platform Workflows

### 5.1 Project Creation & Marketplace Claim Flow
1. Log in as **Client #001** (`client001@apexretail.io`).
2. Go to **Dashboard > Projects** and submit a new project (e.g. *Real-time Vector Search Engine*).
3. Log in as **CEO Ritesh** (`ritesh@nexus.dev`) at `/admin/projects` and click **Approve Project**.
4. The project enters the status `OPEN_FOR_CLAIMS`.
5. Log in as **Developer #01** (`rahul@nexus.dev`) at `/marketplace` and click **Claim Project Slot** (consumes 1 credit from wallet ledger).
6. The developer and client are placed into a private, identity-shielded conversation.

### 5.2 Proposals, Developer Selection & Ledger Auto-Refund
1. Developer submits a milestone proposal through the private project workspace.
2. Client reviews proposals and clicks **Select Developer**.
3. The selected developer is locked in; all unselected developers automatically receive an instant **100% credit refund** credited to their double-entry ledger.

### 5.3 Project Completion & Sealed Workspaces
1. Milestones are submitted, reviewed, and finalized.
2. The client confirms completion and accepts the delivery.
3. The original project chat is permanently **sealed and read-only** to protect code delivery integrity.

### 5.4 Support Ticket & Tripartite Support Bridge
1. From the completed project workspace or from [`/dashboard/support`](http://localhost:3000/dashboard/support), click **New Support Ticket**.
2. Select the completed project, specify category (`TECHNICAL`, `BUG`, `BILLING`, etc.) and priority (`URGENT`, `HIGH`, `NORMAL`, `LOW`).
3. Click **Submit Support Ticket**:
   - The ticket is created with SLA response and resolution targets computed dynamically.
   - The Smart Routing engine assigns the ticket to available support staff based on load and specialization.
   - A dedicated **Support Bridge** is initialized connecting Client, Support Staff, and Developer with masked identities.
4. Support staff can record confidential internal notes that are strictly stripped from client/developer views.

---

## 6. Running Verification & Quality Audit Test Suites

The codebase includes an extensive automated test suite covering all security, RBAC, ledger, and lifecycle rules:

```bash
# 1. Run Master Acceptance E2E Test (Platform Lifecycle, Double-Entry Ledger, Anonymity)
npm run test:e2e --workspace=backend

# 2. Run Support Operations & Staff Routing 30-Step Comprehensive Audit
npx tsx src/tests/supportOperationsAndStaffE2ETest.ts

# 3. Run Support System 38-Test Regression Suite (IDOR, Lifecycle, Sealed Chats)
NODE_ENV=test npx tsx src/tests/completeSupportSystemAuditTest.ts

# 4. Run WebSocket & Real-Time Event Architecture Audit
npx tsx src/tests/websocketRealtimeAuditTest.ts

# 5. Run Typecheck across entire monorepo
npm run typecheck

# 6. Run ESLint across entire monorepo
npm run lint

# 7. Run Next.js Production Build Test
npm run build:frontend
```

---

## 7. Clean Database Reset

If you want to completely wipe your database state and re-initialize it cleanly:

```bash
# Re-apply master schema
psql -U postgres -h localhost -d nexus_platform -f database/schema.sql

# Run all migrations in sequence
npm run db:migrate --workspace=backend

# Seed clean initial state
npm run db:seed --workspace=backend
```
