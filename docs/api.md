# BACKEND API SPECIFICATION

## Base URL
- Production: `https://api.nexus.dev`
- Development: `http://localhost:5000`

---

## 1. Health & Governance
### `GET /api/health`
Returns system status, executive leadership, and economic settings.

---

## 2. Authentication
### `POST /api/auth/login`
- **Body**: `{ "email": "...", "password": "..." }`
- **Response**: `{ "token": "...", "user": { ... } }`

### `GET /api/auth/me`
- **Headers**: `Authorization: Bearer <token>`
- **Response**: Current authenticated user session.

---

## 3. Projects & Claims
### `GET /api/projects/published`
- **Access**: Public
- **Response**: List of completed projects with public lead developer and contributors attribution.

### `POST /api/projects/:projectId/claim`
- **Access**: `DEVELOPER` (Approved & Verified)
- **Action**: Atomically locks credit account, deducts 1 claim credit, generates anonymous tag `Developer #XX`, and creates private chat.
- **Response**: `{ "claimId": "...", "anonymousTag": "Developer #01", "remainingCredits": 9 }`

### `POST /api/projects/:projectId/select`
- **Access**: `CLIENT` (Project Owner)
- **Body**: `{ "selectedDeveloperId": "..." }`
- **Action**: Atomically assigns selected developer as LEAD, updates project status to `DEVELOPER_SELECTED`, and initiates automated 100% credit refund ledger transactions for all other claiming developers.

---

## 4. Credits & Ledger
### `GET /api/credits/balance`
- **Access**: `DEVELOPER`
- **Response**: `{ "balance": 10, "developerId": "..." }`

### `GET /api/credits/ledger`
- **Access**: `DEVELOPER`
- **Response**: Immutable transaction history (`PURCHASE`, `PROJECT_CLAIM`, `PROJECT_NOT_SELECTED_REFUND`, `ADMIN_ADJUSTMENT`).

### `POST /api/credits/admin/adjust`
- **Access**: `CEO`, `ADMIN`
- **Body**: `{ "developerId": "...", "amount": 5, "reason": "Compensation for dispute resolution" }`
- **Response**: Updated balance and transaction ID with audit log.
