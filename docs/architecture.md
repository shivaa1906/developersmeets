# PLATFORM ARCHITECTURE

## System Overview

The **Nexus Developer Company Platform** is a dual-tier platform uniting an elite software engineering company with a credit-backed project marketplace, anonymous developer selection engine, private community network, and public verified portfolio.

```text
                                CLIENT
                                  │
                                  ▼
                         PROJECT SUBMISSION
                                  │
                                  ▼
                         PRJ-2026-0001 (Admin Review)
                                  │
                                  ▼
                          OPEN FOR CLAIMS
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
    Developer #01            Developer #02            Developer #03
   (-1 Credit Slot)         (-1 Credit Slot)         (-1 Credit Slot)
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
                                  ▼
                      ISOLATED ANONYMOUS CHATS
                                  │
                                  ▼
                    CLIENT SELECTS DEVELOPER #01
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
   Developer #01            Developer #02            Developer #03
    (SELECTED)              (NOT SELECTED)           (NOT SELECTED)
  Credit Consumed             +1 Cr Refund             +1 Cr Refund
         │
         ▼
  PROJECT WORKSPACE
         │
         ▼
  MILESTONE DELIVERY
         │
         ▼
 PROJECT COMPLETION & PUBLIC ATTRIBUTION: "Built by Ritesh Lingamallu"
         │
         ▼
  ORIGINAL CHAT CLOSES → ANONYMOUS SUPPORT BRIDGE (SUP-2026-0001)
```

## Decoupled Architecture: Frontend & Backend Separation

As instructed, frontend and backend are completely decoupled into dedicated workspaces:

### 1. Frontend (`/frontend`)
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (Strict Mode)
- **Styling**: Tailwind CSS with custom dark tokens (`#050505` background, `#0D0D0D` surface, electric cyan `#00F0FF` accents, subtle transparent white borders)
- **UI Architecture**: Modular, accessible component primitives (Button, Modal, Dialog, ConfirmDialog, Dropdown, Tabs, Table, Pagination, Badge, Avatar, Toast, Skeleton, EmptyState, ErrorState, LoadingState)
- **Animation**: Framer Motion for modals, drawers, and state transitions
- **Routing**:
  - Public Company & Portfolio: `/`, `/company`, `/projects`, `/projects/[slug]`, `/developers`, `/developers/[username]`, `/careers`, `/contact`
  - Auth: `/login`, `/register`
  - Developer & Client Workspace: `/dashboard`, `/dashboard/profile`, `/dashboard/projects`, `/dashboard/messages`, `/dashboard/community`, `/dashboard/inquiries`, `/dashboard/credits`, `/dashboard/settings`
  - Executive Administration: `/admin/dashboard`, `/admin/developers`, `/admin/projects`, `/admin/clients`, `/admin/claims`, `/admin/credits`, `/admin/payments`, `/admin/inquiries`, `/admin/community`, `/admin/support`, `/admin/analytics`, `/admin/settings`

### 2. Backend (`/backend`)
- **Runtime**: Node.js / Express with modular service layers
- **Language**: TypeScript with ESM & NodeNext resolution
- **Security**: Helmet, CORS origin restriction, JWT bearer authentication, server-side RBAC
- **Ledger Engine**: Double-entry transactional credit system (`CreditLedgerService`) with row-level locking (`FOR UPDATE`) preventing negative balances and race conditions
- **Database Engine**: PostgreSQL client with connection pooling and atomic transactions

### 3. Shared Schemas & Governance
- **CEO / Founder / Admin**: Ritesh Lingamallu (Full platform administration, user governance, payment oversight)
- **Managing Director**: M. Shiva Gopi (Project oversight, engineering success, milestone monitoring)
