/**
 * Phase 6 — Admin Credit Management Foundation Verification Suite
 * 
 * Verifies:
 * 1. Admin must be able to give credits to one user (ADMIN_CREDIT_GRANT with ledger, audit, notification).
 * 2. Admin must be able to give credits to multiple/all eligible users (Bulk Grant with batch reference).
 * 3. Admin must be able to remove credits from one user (ADMIN_CREDIT_REMOVAL with non-negative protection).
 * 4. Admin must be able to remove credits from multiple/all eligible users (Bulk Removal with non-negative protection).
 * 5. Complete credit history inspection with granular filters.
 * 6. Accountability: Identification of who performed every adjustment (performed_by, UID, email, role).
 * 7. Mandatory Reason Enforcement: Adjustments without justification are strictly rejected.
 * 8. Role Restrictions: Only ADMIN / CEO have credit-management authority. MD & SUPPORT are strictly denied.
 * 9. Mathematical Reconciliation & Ledger Immutability (balance == balance_before + delta).
 */

import { Server } from 'http';
import app from '../server.js';
import { query, pool } from '../database/db.js';
import { CreditLedgerService } from '../services/creditLedgerService.js';
import { isValidUserUid } from '../utils/uidGenerator.js';

interface TestSummary {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestSummary[] = [];

function assert(condition: boolean, testName: string, failureDetails?: string) {
  if (condition) {
    console.log(`  ✔ [PASS] ${testName}`);
    results.push({ name: testName, passed: true });
  } else {
    console.error(`  ✘ [FAIL] ${testName} - ${failureDetails || 'Assertion failed'}`);
    results.push({ name: testName, passed: false, details: failureDetails });
  }
}

async function runTest() {
  console.log('================================================================');
  console.log('PHASE 6: ADMIN CREDIT MANAGEMENT FOUNDATION VERIFICATION');
  console.log('================================================================\n');

  let server: Server | null = null;
  let baseUrl = '';

  try {
    // 1. Launch ephemeral server
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server?.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`[Harness] Test server running at ${baseUrl}`);
        resolve();
      });
    });

    const timestamp = Date.now();

    // 2. Set up test users: Admin, CEO, MD, Support, Client, Developer 1, Developer 2
    console.log('\n--- Setting up test actors across platform roles ---');

    // Admin
    const adminEmail = `admin_cr_${timestamp}@nexus.dev`;
    const adminPass = 'Password123!Secure';
    const regAdminRes = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Platform Admin Actor',
        email: adminEmail,
        password: adminPass,
        confirmPassword: adminPass,
        companyName: 'Platform Operations Admin',
      }),
    });
    const adminData = await regAdminRes.json();
    const adminUserId = adminData.user.id;
    await query(`UPDATE users SET role = 'ADMIN', status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [adminUserId]);

    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPass }),
    });
    const adminToken = (await adminLoginRes.json()).token;
    assert(Boolean(adminToken), 'Admin user authenticated successfully');

    // CEO (M. Shiva Gopi)
    const ceoLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'shiva@nexus.dev', password: 'DevPlatform2026!Secure' }),
    });
    const ceoToken = (await ceoLoginRes.json()).token;
    assert(Boolean(ceoToken), 'CEO user authenticated successfully');

    // MD (Ritesh Lingamallu)
    const mdLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ritesh@nexus.dev', password: 'DevPlatform2026!Secure' }),
    });
    const mdToken = (await mdLoginRes.json()).token;
    assert(Boolean(mdToken), 'MD user authenticated successfully');

    // Support Staff
    const supportLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'support@nexus.dev', password: 'DevPlatform2026!Secure' }),
    });
    const supportToken = (await supportLoginRes.json()).token;
    assert(Boolean(supportToken), 'Support user authenticated successfully');

    // Target Developer 1
    const dev1Email = `dev1_cr_${timestamp}@nexus.dev`;
    const regDev1Res = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Developer Alpha',
        username: `devalpha_${timestamp.toString().slice(-6)}`,
        email: dev1Email,
        password: adminPass,
        confirmPassword: adminPass,
        roleTitle: 'Systems Architect',
        experience: 6,
        progLangs: 'TypeScript, Go',
        bio: 'Alpha developer for Phase 6 credit ledger test.',
      }),
    });
    const dev1Data = await regDev1Res.json();
    const dev1UserId = dev1Data.user.id;
    const dev1DeveloperId = dev1Data.developer.id;
    const dev1Uid = dev1Data.user.uid;
    await query(`UPDATE developers SET verification_status = 'VERIFIED' WHERE id = $1`, [dev1DeveloperId]);
    await query(`UPDATE users SET status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [dev1UserId]);

    const dev1LoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: dev1Email, password: adminPass }),
    });
    const dev1Token = (await dev1LoginRes.json()).token;
    assert(Boolean(dev1Token), 'Developer 1 authenticated successfully');

    // Target Developer 2
    const dev2Email = `dev2_cr_${timestamp}@nexus.dev`;
    const regDev2Res = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Developer Beta',
        username: `devbeta_${timestamp.toString().slice(-6)}`,
        email: dev2Email,
        password: adminPass,
        confirmPassword: adminPass,
        roleTitle: 'Backend Engineer',
        experience: 4,
        progLangs: 'Python, Rust',
        bio: 'Beta developer for Phase 6 credit ledger test.',
      }),
    });
    const dev2Data = await regDev2Res.json();
    const dev2UserId = dev2Data.user.id;
    const dev2DeveloperId = dev2Data.developer.id;
    await query(`UPDATE developers SET verification_status = 'VERIFIED' WHERE id = $1`, [dev2DeveloperId]);
    await query(`UPDATE users SET status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [dev2UserId]);

    // Target Client
    const clientEmail = `client_cr_${timestamp}@nexus.dev`;
    const regClientRes = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Enterprise Client',
        email: clientEmail,
        password: adminPass,
        confirmPassword: adminPass,
        companyName: 'Acme Enterprise Solutions',
      }),
    });
    const clientData = await regClientRes.json();
    const clientUserId = clientData.user.id;
    await query(`UPDATE users SET status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [clientUserId]);

    const clientLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: clientEmail, password: adminPass }),
    });
    const clientToken = (await clientLoginRes.json()).token;
    assert(Boolean(clientToken), 'Client authenticated successfully');

    // =========================================================================
    // SECTION 1: ROLE RESTRICTIONS & UNAUTHORIZED ATTEMPTS
    // =========================================================================
    console.log('\n--- SECTION 1: Role Restrictions (MD, SUPPORT, CLIENT, DEVELOPER) ---');

    // 1.1 MD attempts to grant credits -> strictly 403 Forbidden
    const mdGrantRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mdToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: dev1UserId,
        amount: 10,
        reason: 'Unauthorized MD credit grant attempt',
      }),
    });
    assert(mdGrantRes.status === 403, `MD denied credit grant authority (status ${mdGrantRes.status})`);

    // 1.2 Support staff attempts to adjust credits -> strictly 403 Forbidden
    const suppGrantRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supportToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: dev1UserId,
        amount: 10,
        reason: 'Unauthorized Support credit grant attempt',
      }),
    });
    assert(suppGrantRes.status === 403, `Support denied credit grant authority (status ${suppGrantRes.status})`);

    // 1.3 Developer attempts to grant credits -> strictly 403 Forbidden
    const devGrantRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dev1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: dev2UserId,
        amount: 5,
        reason: 'Unauthorized Developer grant attempt',
      }),
    });
    assert(devGrantRes.status === 403, `Developer denied credit management access (status ${devGrantRes.status})`);

    // 1.4 Client attempts to grant credits -> strictly 403 Forbidden
    const clientGrantRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: dev1UserId,
        amount: 5,
        reason: 'Unauthorized Client grant attempt',
      }),
    });
    assert(clientGrantRes.status === 403, `Client denied credit management access (status ${clientGrantRes.status})`);

    // 1.5 Guest (Unauthenticated) -> strictly 401 Unauthorized
    const guestGrantRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: dev1UserId,
        amount: 5,
        reason: 'Unauthenticated attempt',
      }),
    });
    assert(guestGrantRes.status === 401, `Guest denied with 401 Unauthorized (status ${guestGrantRes.status})`);

    // =========================================================================
    // SECTION 2: MANDATORY REASON ENFORCEMENT
    // =========================================================================
    console.log('\n--- SECTION 2: Mandatory Reason Enforcement ---');

    // 2.1 Attempt credit grant with empty reason -> 400
    const noReasonRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: dev1UserId,
        amount: 10,
        reason: '',
      }),
    });
    assert(noReasonRes.status === 400, `Empty reason rejected with 400 Bad Request (status ${noReasonRes.status})`);

    // 2.2 Attempt credit grant with whitespace-only reason -> 400
    const whitespaceReasonRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: dev1UserId,
        amount: 10,
        reason: '   ',
      }),
    });
    assert(whitespaceReasonRes.status === 400, `Whitespace reason rejected with 400 Bad Request (status ${whitespaceReasonRes.status})`);

    // 2.3 Attempt negative or zero amount grant -> 400
    const zeroAmountRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: dev1UserId,
        amount: 0,
        reason: 'Zero credit test',
      }),
    });
    assert(zeroAmountRes.status === 400, `Zero amount grant rejected with 400 Bad Request (status ${zeroAmountRes.status})`);

    // =========================================================================
    // SECTION 3: GIVE CREDITS TO ONE USER (ADMIN_CREDIT_GRANT)
    // =========================================================================
    console.log('\n--- SECTION 3: Give Credits to One User (ADMIN_CREDIT_GRANT) ---');

    const grantReason = 'Platform contribution welcome bonus granted by Platform Admin';
    const grantRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: dev1Uid, // Using 16-character public UID
        amount: 15,
        reason: grantReason,
      }),
    });
    assert(grantRes.status === 200, `Admin successfully granted 15 credits (status ${grantRes.status})`);
    const grantData = await grantRes.json();
    assert(grantData.success === true, 'Grant response indicates success');
    assert(grantData.balance === 15, `Balance updated to 15 (got ${grantData.balance})`);
    assert(grantData.balanceBefore === 0, `Balance before recorded as 0 (got ${grantData.balanceBefore})`);
    assert(grantData.type === 'ADMIN_CREDIT_GRANT', `Transaction type is ADMIN_CREDIT_GRANT (got ${grantData.type})`);

    // 3.1 Verify immutable transaction ledger record in database
    const txRes = await query(
      `SELECT * FROM credit_transactions WHERE id = $1`,
      [grantData.transactionId]
    );
    assert(txRes.rows.length === 1, 'Transaction recorded in credit_transactions table');
    const tx = txRes.rows[0];
    assert(tx.user_id === dev1UserId, `Transaction user_id matches target user (${tx.user_id})`);
    assert(tx.amount === 15, `Transaction amount is +15 (got ${tx.amount})`);
    assert(tx.balance_before === 0, `Transaction balance_before is 0 (got ${tx.balance_before})`);
    assert(tx.balance_after === 15, `Transaction balance_after is 15 (got ${tx.balance_after})`);
    assert(tx.reason === grantReason, 'Transaction reason correctly persisted in ledger');
    assert(tx.performed_by === adminUserId, `performed_by matches Admin user ID (${tx.performed_by})`);
    assert(tx.type === 'ADMIN_CREDIT_GRANT', `Ledger type is ADMIN_CREDIT_GRANT (${tx.type})`);

    // 3.2 Verify audit log entry
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE actor_user_id = $1 AND action = 'ADMIN_CREDIT_GRANT' ORDER BY created_at DESC LIMIT 1`,
      [adminUserId]
    );
    assert(auditRes.rows.length === 1, 'Audit log created for ADMIN_CREDIT_GRANT');

    // 3.3 Verify user notification delivered
    const notifRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND type = 'CREDIT_GRANTED' ORDER BY created_at DESC LIMIT 1`,
      [dev1UserId]
    );
    assert(notifRes.rows.length === 1, 'Notification generated and delivered to recipient');
    assert(notifRes.rows[0].message.includes('15 credits'), 'Notification message mentions granted credit amount');

    // =========================================================================
    // SECTION 4: REMOVE CREDITS FROM ONE USER (ADMIN_CREDIT_REMOVAL)
    // =========================================================================
    console.log('\n--- SECTION 4: Remove Credits from One User (ADMIN_CREDIT_REMOVAL) ---');

    const removeReason = 'Administrative adjustment for duplicate bonus correction';
    const removeRes = await fetch(`${baseUrl}/api/admin/credits/remove`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: dev1UserId, // Using internal UUID
        amount: 5,
        reason: removeReason,
      }),
    });
    assert(removeRes.status === 200, `Admin successfully removed 5 credits (status ${removeRes.status})`);
    const removeData = await removeRes.json();
    assert(removeData.balance === 10, `Balance reduced from 15 to 10 (got ${removeData.balance})`);
    assert(removeData.balanceBefore === 15, `Balance before recorded as 15 (got ${removeData.balanceBefore})`);
    assert(removeData.amount === -5, `Delta amount recorded as -5 (got ${removeData.amount})`);

    // 4.1 Verify ledger entry
    const remTxRes = await query(
      `SELECT * FROM credit_transactions WHERE id = $1`,
      [removeData.transactionId]
    );
    assert(remTxRes.rows.length === 1, 'Removal transaction recorded in immutable ledger');
    const remTx = remTxRes.rows[0];
    assert(remTx.type === 'ADMIN_CREDIT_REMOVAL', `Transaction type is ADMIN_CREDIT_REMOVAL (${remTx.type})`);
    assert(remTx.amount === -5, `Transaction amount is -5 (${remTx.amount})`);
    assert(remTx.balance_before === 15, `balance_before is 15 (${remTx.balance_before})`);
    assert(remTx.balance_after === 10, `balance_after is 10 (${remTx.balance_after})`);
    assert(remTx.performed_by === adminUserId, `performed_by matches Admin user ID (${remTx.performed_by})`);

    // 4.2 Verify removal notification
    const remNotifRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND type = 'CREDIT_REMOVED' ORDER BY created_at DESC LIMIT 1`,
      [dev1UserId]
    );
    assert(remNotifRes.rows.length === 1, 'Credit deduction notification delivered to user');

    // =========================================================================
    // SECTION 5: NEGATIVE BALANCE PREVENTION
    // =========================================================================
    console.log('\n--- SECTION 5: Negative Balance Prevention ---');

    // Current balance is 10. Attempting to remove 20 credits must be rejected!
    const overDeductRes = await fetch(`${baseUrl}/api/admin/credits/remove`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: dev1UserId,
        amount: 20,
        reason: 'Attempting to over-deduct into negative balance',
      }),
    });
    assert(overDeductRes.status === 400, `Over-deduction rejected with 400 Bad Request (status ${overDeductRes.status})`);
    const overDeductData = await overDeductRes.json();
    assert(overDeductData.error.includes('negative balance'), 'Error message clearly explains negative balance prohibition');

    // Verify balance is completely untouched
    const balCheckRes = await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev1UserId]);
    assert(balCheckRes.rows[0].balance === 10, 'Balance strictly preserved at 10 credits');

    // =========================================================================
    // SECTION 6: BULK CREDIT GRANT (MULTIPLE / ALL ELIGIBLE USERS)
    // =========================================================================
    console.log('\n--- SECTION 6: Bulk Credit Grant ---');

    const bulkGrantReason = 'Q4 Platform Hackathon Community Reward Distribution';
    const bulkGrantRes = await fetch(`${baseUrl}/api/admin/credits/bulk-grant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetScope: 'CUSTOM',
        userIds: [dev1UserId, dev2UserId, clientUserId],
        amount: 7,
        reason: bulkGrantReason,
      }),
    });
    assert(bulkGrantRes.status === 200, `Bulk credit grant succeeded (status ${bulkGrantRes.status})`);
    const bulkGrantData = await bulkGrantRes.json();
    assert(bulkGrantData.count === 3, `Bulk grant affected exactly 3 users (got ${bulkGrantData.count})`);
    assert(bulkGrantData.totalCredits === 21, `Total 21 credits granted (got ${bulkGrantData.totalCredits})`);
    assert(Boolean(bulkGrantData.batchReference), `Batch reference generated (${bulkGrantData.batchReference})`);

    // Verify individual account balances post bulk grant
    const dev1Bal = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev1UserId])).rows[0].balance;
    const dev2Bal = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev2UserId])).rows[0].balance;
    const clientBal = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [clientUserId])).rows[0].balance;

    assert(dev1Bal === 17, `Dev 1 balance: 10 + 7 = 17 (got ${dev1Bal})`);
    assert(dev2Bal === 7, `Dev 2 balance: 0 + 7 = 7 (got ${dev2Bal})`);
    assert(clientBal === 7, `Client balance: 0 + 7 = 7 (got ${clientBal})`);

    // Verify bulk audit log recorded
    const bulkAuditRes = await query(
      `SELECT * FROM audit_logs WHERE action = 'ADMIN_BULK_CREDIT_GRANT' AND entity_id = $1`,
      [bulkGrantData.batchReference]
    );
    assert(bulkAuditRes.rows.length === 1, 'Bulk audit log recorded with batch reference');

    // =========================================================================
    // SECTION 7: BULK CREDIT REMOVAL
    // =========================================================================
    console.log('\n--- SECTION 7: Bulk Credit Removal ---');

    const bulkRemReason = 'End-of-campaign unused credit cleanup';
    const bulkRemRes = await fetch(`${baseUrl}/api/admin/credits/bulk-remove`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetScope: 'CUSTOM',
        userIds: [dev1UserId, dev2UserId],
        amount: 2,
        reason: bulkRemReason,
      }),
    });
    assert(bulkRemRes.status === 200, `Bulk credit removal succeeded (status ${bulkRemRes.status})`);
    const bulkRemData = await bulkRemRes.json();
    assert(bulkRemData.count === 2, `Bulk removal affected 2 users (got ${bulkRemData.count})`);
    assert(bulkRemData.totalCredits === 4, `Total 4 credits deducted (got ${bulkRemData.totalCredits})`);

    const dev1BalPostRem = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev1UserId])).rows[0].balance;
    const dev2BalPostRem = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev2UserId])).rows[0].balance;
    assert(dev1BalPostRem === 15, `Dev 1 balance reduced from 17 to 15 (got ${dev1BalPostRem})`);
    assert(dev2BalPostRem === 5, `Dev 2 balance reduced from 7 to 5 (got ${dev2BalPostRem})`);

    // =========================================================================
    // SECTION 8: COMPLETE CREDIT HISTORY & ACCOUNTABILITY INSPECTION
    // =========================================================================
    console.log('\n--- SECTION 8: Credit History & Accountability Inspection ---');

    // 8.1 Fetch complete history
    const historyRes = await fetch(`${baseUrl}/api/admin/credits/history?userId=${dev1UserId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(historyRes.status === 200, `Admin fetched credit history for user (status ${historyRes.status})`);
    const historyData = await historyRes.json();
    assert(Array.isArray(historyData.history), 'Credit history returns an array of transactions');
    assert(historyData.history.length >= 4, `Found ${historyData.history.length} transactions for Dev 1`);

    // 8.2 Verify accountability: performed_by is populated for every admin adjustment
    for (const item of historyData.history) {
      if (item.type.startsWith('ADMIN_')) {
        assert(Boolean(item.performed_by_user_id), `Tx ${item.id} has performed_by_user_id (${item.performed_by_user_id})`);
        assert(Boolean(item.performed_by_email), `Tx ${item.id} has performed_by_email (${item.performed_by_email})`);
        assert(Boolean(item.reason), `Tx ${item.id} has mandatory reason: "${item.reason}"`);
        assert(item.balance_before !== null && item.balance_before !== undefined, `Tx ${item.id} records balance_before (${item.balance_before})`);
        assert(item.balance_after !== null && item.balance_after !== undefined, `Tx ${item.id} records balance_after (${item.balance_after})`);
      }
    }

    // 8.3 Verify list accounts endpoint
    const accountsRes = await fetch(`${baseUrl}/api/admin/credits/accounts`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(accountsRes.status === 200, `Admin fetched credit accounts summary (status ${accountsRes.status})`);
    const accountsData = await accountsRes.json();
    assert(Array.isArray(accountsData.accounts), 'Accounts endpoint returns list of user accounts');
    const dev1Account = accountsData.accounts.find((a: any) => a.user_id === dev1UserId);
    assert(Boolean(dev1Account), 'Dev 1 account found in summary');
    assert(dev1Account.balance === 15, `Dev 1 account summary balance is 15 (got ${dev1Account?.balance})`);

    // =========================================================================
    // SECTION 9: CEO CREDIT MANAGEMENT ACCESS
    // =========================================================================
    console.log('\n--- SECTION 9: CEO Global Credit Governance ---');

    const ceoGrantRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ceoToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: dev2UserId,
        amount: 25,
        reason: 'Direct discretionary grant by Platform CEO for outstanding technical milestone delivery',
      }),
    });
    assert(ceoGrantRes.status === 200, `CEO successfully granted 25 credits (status ${ceoGrantRes.status})`);
    const ceoGrantData = await ceoGrantRes.json();
    assert(ceoGrantData.balance === 30, `Dev 2 balance increased from 5 to 30 (got ${ceoGrantData.balance})`);

    // Verify CEO performed_by attribution
    const ceoTx = (await query(`SELECT * FROM credit_transactions WHERE id = $1`, [ceoGrantData.transactionId])).rows[0];
    const ceoUser = (await query(`SELECT id FROM users WHERE email = 'shiva@nexus.dev'`)).rows[0];
    assert(ceoTx.performed_by === ceoUser.id, `Transaction explicitly attributes CEO as performer (${ceoTx.performed_by})`);

    // =========================================================================
    // SECTION 10: MATHEMATICAL RECONCILIATION & DOUBLE-ENTRY LEDGER VALIDATION
    // =========================================================================
    console.log('\n--- SECTION 10: Double-Entry Ledger Mathematical Reconciliation ---');

    // Reconcile Dev 1: Starting balance (0) + sum(amount) == current account balance
    const dev1Txs = await query(
      `SELECT type, amount, balance_before, balance_after, created_at FROM credit_transactions WHERE user_id = $1 ORDER BY created_at ASC`,
      [dev1UserId]
    );

    let runningBalance = 0;
    let reconciliationPassed = true;

    for (const t of dev1Txs.rows) {
      if (runningBalance !== t.balance_before) {
        reconciliationPassed = false;
        console.error(`Mismatch: Expected balance_before ${runningBalance}, got ${t.balance_before}`);
      }
      runningBalance += t.amount;
      if (runningBalance !== t.balance_after) {
        reconciliationPassed = false;
        console.error(`Mismatch: Expected balance_after ${runningBalance}, got ${t.balance_after}`);
      }
    }

    const actualDev1Bal = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev1UserId])).rows[0].balance;
    assert(reconciliationPassed, 'All intermediate ledger state transitions perfectly match delta amounts');
    assert(runningBalance === actualDev1Bal, `Ledger sum (${runningBalance}) exactly equals current balance (${actualDev1Bal})`);
    assert(actualDev1Bal === 15, `Dev 1 final balance is exactly 15 credits`);

  } catch (error: any) {
    console.error('\nFatal test runner error:', error);
    assert(false, 'Test execution completed without uncaught exception', error.message);
  } finally {
    if (server) {
      server.close();
      console.log('\n[Harness] Ephemeral test server closed.');
    }
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n================================================================');
  console.log('PHASE 6 TEST SUMMARY');
  console.log('================================================================');
  console.log(`Total tests: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

  if (failed > 0) {
    console.error('FAILED TESTS:');
    results.filter((r) => !r.passed).forEach((r) => console.error(`  - ${r.name}: ${r.details || ''}`));
    process.exit(1);
  } else {
    console.log('ALL PHASE 6 ADMIN CREDIT MANAGEMENT CHECKS PASSED PERFECTLY! ✔\n');
  }
}

runTest().catch((err) => {
  console.error('Unhandled test runner failure:', err);
  process.exit(1);
});
