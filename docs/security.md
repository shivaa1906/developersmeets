# SECURITY & PRIVACY SPECIFICATION

## Core Tenets

1. **Complete Anonymity During Selection**:
   - Clients interact solely as `Client #001`, `Client #002`.
   - Developers interact solely as `Developer #01`, `Developer #02`.
   - Real names, personal emails, phones, and profile pictures are never returned in public selection payloads or API responses.
   - Internal real identities are held securely on the server and exposed only to CEO/Admin or upon verified project completion for public developer attribution.

2. **Server-Side Authorization**:
   - The server never trusts client-supplied roles or statuses.
   - Every API request validates authorization against the server database via JWT and RBAC middlewares (`requireRole`, `requireVerifiedDeveloper`).
   - Clients can only access projects they own.
   - Developers can only access conversations for projects they claimed.

3. **Financial & Ledger Integrity**:
   - Direct balance mutations (e.g. `balance = balance - 1`) are strictly forbidden.
   - All balance changes require a permanent `credit_transactions` entry with row locking (`FOR UPDATE`) within an atomic database transaction.
   - Balance check `CHECK (balance >= 0)` guarantees credit balances cannot drop below zero.
   - Automated refunds use deterministic reference keys (e.g. `REF-{projectId}-{devId}`) to prevent duplicate refund processing.

4. **Post-Completion Support Bridge**:
   - Completed project chats close automatically.
   - Post-completion assistance requires a formal support ticket (`SUP-2026-0001`).
   - Support bridges enforce a tripartite mediated structure (Client #001 ↔ Support Agent ↔ Technical Developer).
