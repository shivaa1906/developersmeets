# Phase 3 — Executive Account Governance & Admin API Permission Audit

Authoritative permission matrix and API access inventory for the Nexus platform.

---

## 1. Executive Roles & Permission Architecture

The platform strictly differentiates executive and user tiers:

1. **CEO (`CEO`)**:
   - **Primary Account**: `shivaa1906@gmail.com` (M. Shiva Gopi)
   - **Authority**: Highest administrative role with wildcard superadmin permission (`*`).
   - **Exclusive Capabilities**:
     - System settings & platform configuration (`GET / PATCH /api/admin/settings`).
     - Managing executive permissions (`PATCH /api/admin/users/:userId/permissions`).
     - Assigning executive roles (`POST /api/admin/users/:userId/assign-role`).
     - Suspending, unsuspending, or disabling executive accounts (`MD`, `ADMIN`).
   - **Self-Protection Safeguards**: Database-level immutability triggers prevent changing CEO email, downgrading role, suspending, disabling, or deleting the primary CEO account.

2. **Managing Director (`MD`)**:
   - **Sample/Staging Account**: `md@example.invalid` (Ritesh Lingamallu)
   - **Authority**: Operational management role with explicit, granular permissions.
   - **Allowed Capabilities**:
     - Reviewing, approving, editing, cancelling, and reopening projects.
     - Reviewing, approving, and suspending developers.
     - Viewing clients, claims, inquiries, analytics, and operational audit logs.
     - Read-only viewing of financial ledger and non-secret payment status.
     - Managing community channels (create, archive, moderate).
   - **Restricted Capabilities (403 Forbidden)**:
     - Platform business rules and system settings (CEO Only).
     - Managing executive permissions or assigning roles (CEO Only).
     - Suspending or disabling executive accounts (`CEO`, `MD`, `ADMIN`).
     - Credit management, manual adjustments, and bulk grants/removals (CEO & Admin Only).

3. **Platform Administrator (`ADMIN`)**:
   - Standard administrative operations and credit wallet management.
   - Restricted from CEO-only executive permission assignments and CEO account modifications.

4. **Support Staff (`SUPPORT`)**:
   - Restricted to support ticket queues, support bridges, and inquiries. Denied from all general administrative and credit endpoints.

5. **Developers & Clients (`DEVELOPER`, `CLIENT`)**:
   - Denied from all endpoints under `/api/admin/*` (403 Forbidden).

---

## 2. Comprehensive Admin API Inventory & Permission Matrix

| Endpoint | Method | CEO | MD | Support | Developer | Client | Required Permission / Role | Audit Required |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/admin/developers/pending` | GET | Full | Full | 403 | 403 | 403 | `developers:read` | No |
| `/api/admin/developers/:id/approve` | POST | Full | Full | 403 | 403 | 403 | `developers:write` | **Yes** (`DEVELOPER_APPROVED`) |
| `/api/admin/developers/:id/reject` | POST | Full | Full | 403 | 403 | 403 | `developers:write` | **Yes** (`DEVELOPER_REJECTED`) |
| `/api/admin/developers/:id/suspend` | POST | Full | Full | 403 | 403 | 403 | `developers:write` | **Yes** (`DEVELOPER_SUSPENDED`) |
| `/api/admin/developers/:id/verify` | POST | Full | Full | 403 | 403 | 403 | `developers:write` | **Yes** (`DEVELOPER_VERIFIED_DIRECT`) |
| `/api/admin/developers/:id/wallet` | GET | Full | Full | 403 | 403 | 403 | `developers:read` | No |
| `/api/admin/projects` | GET | Full | Full | 403 | 403 | 403 | `projects:read` | No |
| `/api/admin/projects/:id/review` | POST | Full | Full | 403 | 403 | 403 | `projects:write` | **Yes** (`PROJECT_REVIEWING`) |
| `/api/admin/projects/:id/approve` | POST | Full | Full | 403 | 403 | 403 | `projects:write` | **Yes** (`PROJECT_APPROVED_OPEN_CLAIMS`) |
| `/api/admin/projects/:id` | PATCH | Full | Full | 403 | 403 | 403 | `projects:write` | **Yes** (`PROJECT_EDITED_BY_ADMIN`) |
| `/api/admin/projects/:id/cancel` | POST | Full | Full | 403 | 403 | 403 | `projects:write` | **Yes** (`PROJECT_CANCELLED_BY_ADMIN`) |
| `/api/admin/projects/:id/reopen` | POST | Full | Full | 403 | 403 | 403 | `projects:write` | **Yes** (`PROJECT_REOPENED_BY_ADMIN`) |
| `/api/admin/projects/:id/claims` | GET | Full | Full | 403 | 403 | 403 | `claims:read` | No |
| `/api/admin/projects/:id/proposals` | GET | Full | Full | 403 | 403 | 403 | `projects:read` | No |
| `/api/admin/projects/:id/completion` | GET | Full | Full | 403 | 403 | 403 | `projects:read` | No |
| `/api/admin/clients` | GET | Full | Full | 403 | 403 | 403 | `clients:read` | No |
| `/api/admin/claims` | GET | Full | Full | 403 | 403 | 403 | `claims:read` | No |
| `/api/admin/inquiries` | GET | Full | Full | 403 | 403 | 403 | `inquiries:read` | No |
| `/api/admin/executives` | GET | Full | Full | 403 | 403 | 403 | `executives:read` | No |
| `/api/admin/users/:id/permissions` | PATCH | Full | **403** | 403 | 403 | 403 | **CEO ONLY** | **Yes** (`EXECUTIVE_PERMISSIONS_UPDATED`) |
| `/api/admin/users/:id/assign-role` | POST | Full | **403** | 403 | 403 | 403 | **CEO ONLY** | **Yes** (`USER_ROLE_ASSIGNED`) |
| `/api/admin/users` | GET | Full | Full | 403 | 403 | 403 | `users:read` | No |
| `/api/admin/users/:id/suspend` | POST | Full | Configured* | 403 | 403 | 403 | `users:write` (*Non-Executive) | **Yes** (`USER_SUSPENDED`) |
| `/api/admin/users/:id/unsuspend` | POST | Full | Configured* | 403 | 403 | 403 | `users:write` (*Non-Executive) | **Yes** (`USER_UNSUSPENDED`) |
| `/api/admin/users/:id/disable` | POST | Full | Configured* | 403 | 403 | 403 | `users:write` (*Non-Executive) | **Yes** (`USER_DISABLED`) |
| `/api/admin/ledger` | GET | Full | Full | 403 | 403 | 403 | `ledger:read` | No |
| `/api/admin/payments` | GET | Full | Full | 403 | 403 | 403 | `payments:read` | No |
| `/api/admin/support/tickets` | GET | Full | Full | Full | 403 | 403 | `support:tickets:read` | No |
| `/api/admin/support/staff` | GET | Full | Full | Full | 403 | 403 | `support:staff:read` | No |
| `/api/admin/support/staff` | POST | Full | **403** | 403 | 403 | 403 | `ADMIN, CEO` | **Yes** (`STAFF_CREATED`) |
| `/api/admin/support/staff/invite` | POST | Full | **403** | 403 | 403 | 403 | `ADMIN, CEO` | **Yes** (`STAFF_INVITED`) |
| `/api/admin/support/staff/:id/status` | PATCH | Full | **403** | 403 | 403 | 403 | `ADMIN, CEO` | **Yes** (`STAFF_STATUS_UPDATED`) |
| `/api/admin/support/staff/:id/permissions` | PATCH | Full | **403** | 403 | 403 | 403 | `ADMIN, CEO` | **Yes** (`STAFF_PERMS_UPDATED`) |
| `/api/admin/support/staff/:id/suspend` | POST | Full | **403** | 403 | 403 | 403 | `ADMIN, CEO` | **Yes** (`STAFF_SUSPENDED`) |
| `/api/admin/support/staff/:id/remove` | POST | Full | **403** | 403 | 403 | 403 | `ADMIN, CEO` | **Yes** (`STAFF_REMOVED`) |
| `/api/admin/support/staff/:id/reassign` | POST | Full | **403** | 403 | 403 | 403 | `ADMIN, CEO` | **Yes** (`TICKETS_REASSIGNED`) |
| `/api/admin/support/teams` | GET | Full | Full | Full | 403 | 403 | `support:read` | No |
| `/api/admin/support/teams` | POST | Full | **403** | 403 | 403 | 403 | `ADMIN, CEO` | **Yes** (`TEAM_CREATED`) |
| `/api/admin/support/teams/:id/members` | POST | Full | **403** | 403 | 403 | 403 | `ADMIN, CEO` | **Yes** (`TEAM_MEMBER_ADDED`) |
| `/api/admin/support/teams/:id/members/:mId` | DELETE | Full | **403** | 403 | 403 | 403 | `ADMIN, CEO` | **Yes** (`TEAM_MEMBER_REMOVED`) |
| `/api/admin/analytics` | GET | Full | Full | 403 | 403 | 403 | `analytics:read` | No |
| `/api/admin/audit-logs` | GET | Full | Full | 403 | 403 | 403 | `audit_logs:read` | No |
| `/api/admin/settings` | GET | Full | **403** | 403 | 403 | 403 | **CEO ONLY** | No |
| `/api/admin/settings` | PATCH | Full | **403** | 403 | 403 | 403 | **CEO ONLY** | **Yes** (`PLATFORM_SETTINGS_UPDATED`) |
| `/api/admin/credits/adjust` | POST | Full | **403** | 403 | 403 | 403 | `credits:write` (`ADMIN, CEO`) | **Yes** (`CREDITS_ADJUSTED`) |
| `/api/admin/credits/grant` | POST | Full | **403** | 403 | 403 | 403 | `credits:write` (`ADMIN, CEO`) | **Yes** (`CREDITS_GRANTED`) |
| `/api/admin/credits/remove` | POST | Full | **403** | 403 | 403 | 403 | `credits:write` (`ADMIN, CEO`) | **Yes** (`CREDITS_REMOVED`) |
| `/api/admin/credits/bulk-preview` | POST | Full | **403** | 403 | 403 | 403 | `credits:write` (`ADMIN, CEO`) | No |
| `/api/admin/credits/bulk-grant` | POST | Full | **403** | 403 | 403 | 403 | `credits:write` (`ADMIN, CEO`) | **Yes** (`BULK_CREDITS_GRANTED`) |
| `/api/admin/credits/bulk-remove-preview` | POST | Full | **403** | 403 | 403 | 403 | `credits:write` (`ADMIN, CEO`) | No |
| `/api/admin/credits/bulk-remove` | POST | Full | **403** | 403 | 403 | 403 | `credits:write` (`ADMIN, CEO`) | **Yes** (`BULK_CREDITS_REMOVED`) |
| `/api/admin/credits/bulk-operations` | GET | Full | **403** | 403 | 403 | 403 | `credits:read` (`ADMIN, CEO`) | No |
| `/api/admin/credits/bulk-operations/:id` | GET | Full | **403** | 403 | 403 | 403 | `credits:read` (`ADMIN, CEO`) | No |
| `/api/admin/credits/history` | GET | Full | **403** | 403 | 403 | 403 | `credits:read` (`ADMIN, CEO`) | No |
| `/api/admin/credits/accounts` | GET | Full | **403** | 403 | 403 | 403 | `credits:read` (`ADMIN, CEO`) | No |
| `/api/admin/credits/search-users` | GET | Full | **403** | 403 | 403 | 403 | `credits:read` (`ADMIN, CEO`) | No |
| `/api/admin/credits/stats` | GET | Full | **403** | 403 | 403 | 403 | `credits:read` (`ADMIN, CEO`) | No |
| `/api/admin/credits/export` | GET | Full | **403** | 403 | 403 | 403 | `credits:read` (`ADMIN, CEO`) | **Yes** (`CREDITS_EXPORTED`) |
| `/api/admin/credits/users/:target` | GET | Full | **403** | 403 | 403 | 403 | `credits:read` (`ADMIN, CEO`) | No |

---

## 3. Database Integrity & Protection Invariants

1. **CEO Account Immutability**:
   - PostgreSQL trigger `protect_primary_ceo_account` blocks any update modifying email or role away from `CEO`.
   - PostgreSQL trigger `prevent_primary_ceo_deletion` blocks deletion of the primary CEO account.
   - Account cannot be marked `SUSPENDED` or `DISABLED`.
2. **Audit Log Append-Only Guarantee**:
   - PostgreSQL trigger `prevent_audit_log_tampering` rejects any `UPDATE` or `DELETE` statement targeting `audit_logs`.
   - Transactions executing sensitive executive actions automatically roll back via `AuditLogger.logStrict` if an audit record cannot be written.
3. **Role Mass-Assignment Defense**:
   - Public registration endpoints (`/api/auth/register/developer`, `/api/auth/register/client`) strictly enforce hardcoded roles and reject any user-supplied `role`, `permissions`, or `is_admin` fields.
4. **WebSocket Authorization**:
   - Realtime connections authenticate via JWT and query fresh user status and roles directly from the database. Client payloads specifying spoofed roles or unauthorized channels are rejected.
