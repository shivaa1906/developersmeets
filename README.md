# NEXUS DEVELOPER COMPANY PLATFORM

A premium technology company operating system combining:
- **Software Company Website**
- **Verified Developer Network & Portfolios**
- **Public Project Showcase & Attribution**
- **Anonymous Project Marketplace**
- **Paid Project Claim System & Credit Wallet**
- **Double-Entry Ledger with Auto-Refunds**
- **Anonymous Client-to-Developer Chat**
- **Post-Completion Support Ticket & Mediated Bridge**
- **Executive Administration (CEO / MD HQ)**

---

## Executive Leadership

- **CEO / Founder / Admin**: **Ritesh Lingamallu** (Full platform governance, developer approvals, credit & financial oversight, platform configuration)
- **Managing Director**: **M. Shiva Gopi** (Technical project oversight, developer success, operations, milestone analytics)

---

## Architectural Separation: Frontend & Backend

Frontend and Backend are cleanly organized into decoupled workspaces:

```text
.
├── frontend/                     # Next.js 14 App Router, TypeScript, Tailwind CSS
│   ├── app/                      # Public, Auth, Dashboard, and Admin Routes
│   ├── components/
│   │   ├── ui/                   # 19 Reusable UI components
│   │   └── layout/               # Navbar, Footer, DashboardShell, AdminShell
│   ├── config/                   # Site config, leadership, credit economy
│   ├── styles/                   # globals.css with design tokens (#050505, #0D0D0D, #00F0FF)
│   ├── types/                    # Frontend TypeScript interfaces
│   └── validators/               # Zod input schemas
│
├── backend/                      # Node.js / Express, PostgreSQL, Modular Architecture
│   ├── src/
│   │   ├── config/               # Environment & constants
│   │   ├── controllers/          # Auth, Projects, Credits
│   │   ├── database/             # PostgreSQL client, migrations, seeds
│   │   ├── middlewares/          # JWT auth, server-side RBAC, error handling
│   │   ├── routes/               # Modular API routes
│   │   ├── services/             # CreditLedgerService, ProjectService
│   │   └── server.ts             # Express application & health check
│   └── package.json
│
├── database/                     # Master SQL DDL schema & migrations
│   └── schema.sql
├── docs/                         # Architecture, Database, Security, API docs
│   ├── architecture.md
│   ├── database.md
│   ├── security.md
│   └── api.md
├── .env.example                  # Environment template
└── package.json                  # Root npm workspace orchestrator
```

---

## Reusable UI System

All 19 components are implemented under `frontend/components/ui/`:
1. `Button` (loading state, icons, multiple variants)
2. `Input` (label, helperText, error state)
3. `Textarea` (resizable, label, error state)
4. `Select` (custom chevron, typed options)
5. `Modal` (accessible animated backdrop, Framer Motion)
6. `Dialog` (header, body, footer)
7. `ConfirmDialog` (destructive action confirmation)
8. `Dropdown` (click-outside listener, action items)
9. `Tabs` (active glow indicator, badge counters)
10. `Card` (Header, Title, Description, Content, Footer)
11. `Badge` (status and accent variants)
12. `Avatar` (image loading with fallback initials)
13. `Table` (responsive bordered table with sticky headers)
14. `Pagination` (accessible controls with total page tracking)
15. `Toast` (context provider, hook, animated notifications)
16. `Skeleton` (pulse loader for data fetching)
17. `EmptyState` (custom iconography and action trigger)
18. `ErrorState` (retry action and error messaging)
19. `LoadingState` (spinner with customizable status message)

---

## Design Tokens

- **Background**: `#050505`
- **Surface**: `#0D0D0D`
- **Surface Elevated**: `#141414`
- **Borders**: Subtle transparent white `rgba(255, 255, 255, 0.08)`
- **Accent**: Electric Cyan `#00F0FF` (with subtle glow) & Electric Purple `#8B5CF6`
- **Text**: Primary `#FFFFFF`, Secondary `#A1A1AA`

---

## Quick Start & Development

### 1. Setup Environment
```bash
cp .env.example .env
```

### 2. Install Dependencies
```bash
# Installs both frontend and backend workspaces
npm install
```

### 3. Run Development Servers
```bash
# Run both Backend (Port 5000) and Frontend (Port 3000) concurrently:
npm run dev:all

# Or run separately:
npm run dev           # Frontend only (http://localhost:3000)
npm run dev:backend   # Backend only (http://localhost:5000)
```

### 4. Database Setup & Seeding
```bash
# Apply schema to PostgreSQL:
psql $DATABASE_URL -f database/schema.sql

# Seed initial leadership (CEO Ritesh Lingamallu, MD M. Shiva Gopi, Client #001):
npm run db:seed --workspace=backend
```

### 5. Build, Typecheck & Test
```bash
# Typecheck both workspaces
npm run typecheck

# Lint all code
npm run lint

# Production build for both frontend and backend
npm run build

# Run Master 14-Step End-to-End Acceptance Test Suite (Database, Ledger, Anonymity, Milestones, Support)
npm run test:e2e --workspace=backend
```

### 6. Docker Container Orchestration
```bash
# Launch PostgreSQL, Backend (Port 5000), and Next.js Frontend (Port 3000)
docker compose up --build
```

