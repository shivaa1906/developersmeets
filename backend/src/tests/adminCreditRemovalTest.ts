/**
 * Phase 9 — Admin Credit Removal Verification Suite
 * 
 * Verifies:
 * 1. Removal UI & Workflow:
 *    - Remove credits from one user, selected users, and eligible groups.
 * 2. Prevent Invalid Removal:
 *    - If balance is 2 and admin attempts to remove 5, operation is rejected with HTTP 400.
 *    - Never silently create negative balances (-3).
 * 3. Ledger Immutability:
 *    - Records ADMIN_CREDIT_REMOVAL (-X) with balance_before, balance_after, performed_by, reason.
 * 4. Do Not Delete History:
 *    - Never delete or modify previous transactions (+10 PURCHASE, -3 ADMIN_CREDIT_REMOVAL).
 * 5. Concurrent Safety:
 *    - Two admins attempt to remove credits simultaneously (Balance = 5, Admin A removes 4, Admin B removes 4).
 *    - Transactional locking (FOR UPDATE) guarantees exactly one succeeds and second is rejected.
 *    - Final balance is 1 (never -3!).
 * 6. Bulk Removal & Preview:
 *    - Preview endpoint accurately calculates deductions without mutating state.
 *    - Individual ledger records for each recipient in bulk.
 * 7. Strict Security & Input Defense:
 *    - Negative, zero, float, overflow amounts rejected.
 *    - Mandatory reason (min 5 chars).
 * 8. RBAC Governance:
 *    - CEO & ADMIN allowed.
 *    - MD, SUPPORT, CLIENT, DEVELOPER, and unauthenticated strictly prohibited (403/401).
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
  console.log('PHASE 9: ADMIN CREDIT REMOVAL VERIFICATION');
  console.log('================================================================\n');

  let server: Server | null = null;
  const port = 49195;
  const baseUrl = `http://localhost:${port}`;

  try {
    server = app.listen(port);
    await new Promise((resolve) => server!.once('listening', resolve));
    console.log(`[Harness] Ephemeral server running on port ${port}`);

    const timestamp = Date.now();
    const adminPass = 'Password123!Safe';

    // 1. Setup Admin A (Primary Platform Admin)
    const adminAEmail = `admin_a_cr_${timestamp}@nexus.dev`;
    const regAdminARes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Admin Alice',
        username: `adminalice_${timestamp.toString().slice(-6)}`,
        email: adminAEmail,
        password: adminPass,
        confirmPassword: adminPass,
        roleTitle: 'Platform Operator',
        experience: 5,
        progLangs: 'TypeScript',
        bio: 'Primary admin for Phase 9 credit removal test.',
      }),
    });
    const adminAData = await regAdminARes.json();
    const adminAUserId = adminAData.user.id;
    await query(`UPDATE users SET role = 'ADMIN', status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [adminAUserId]);

    const adminALoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminAEmail, password: adminPass }),
    });
    const adminAToken = (await adminALoginRes.json()).token;
    assert(Boolean(adminAToken), 'Admin A authenticated successfully');

    // 2. Setup Admin B (Concurrent Platform Admin)
    const adminBEmail = `admin_b_cr_${timestamp}@nexus.dev`;
    const regAdminBRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Admin Bob',
        username: `adminbob_${timestamp.toString().slice(-6)}`,
        email: adminBEmail,
        password: adminPass,
        confirmPassword: adminPass,
        roleTitle: 'Platform Operator',
        experience: 5,
        progLangs: 'Go',
        bio: 'Secondary admin for concurrent safety test.',
      }),
    });
    const adminBData = await regAdminBRes.json();
    const adminBUserId = adminBData.user.id;
    await query(`UPDATE users SET role = 'ADMIN', status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [adminBUserId]);

    const adminBLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminBEmail, password: adminPass }),
    });
    const adminBToken = (await adminBLoginRes.json()).token;
    assert(Boolean(adminBToken), 'Admin B authenticated successfully');

    // 3. Setup CEO
    const ceoRes = await query(`SELECT id, email, uid FROM users WHERE email = 'shiva@nexus.dev'`);
    let ceoUserId = ceoRes.rows[0]?.id;
    if (!ceoUserId) {
      const regCeoRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'CEO Shiva',
          username: `ceo_shiva_${timestamp.toString().slice(-6)}`,
          email: 'shiva@nexus.dev',
          password: adminPass,
          confirmPassword: adminPass,
          roleTitle: 'Chief Executive Officer',
          experience: 10,
          progLangs: 'Rust, TypeScript',
          bio: 'Executive CEO account.',
        }),
      });
      ceoUserId = (await regCeoRes.json()).user.id;
    }
    await query(`UPDATE users SET role = 'CEO', status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [ceoUserId]);
    const ceoLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'shiva@nexus.dev', password: 'DevPlatform2026!Secure' }),
    });
    const ceoToken = (await ceoLoginRes.json()).token;
    assert(Boolean(ceoToken), 'CEO user authenticated successfully');

    // 4. Setup MD (Managing Director)
    const mdEmail = `md_cr_${timestamp}@nexus.dev`;
    const regMdRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Director MD',
        username: `director_${timestamp.toString().slice(-6)}`,
        email: mdEmail,
        password: adminPass,
        confirmPassword: adminPass,
        roleTitle: 'Managing Director',
        experience: 8,
        progLangs: 'Java',
        bio: 'Managing Director account.',
      }),
    });
    const mdUserId = (await regMdRes.json()).user.id;
    await query(`UPDATE users SET role = 'MD', status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [mdUserId]);
    const mdLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mdEmail, password: adminPass }),
    });
    const mdToken = (await mdLoginRes.json()).token;

    // 5. Setup Support Staff
    const supportEmail = `support_cr_${timestamp}@nexus.dev`;
    const regSupportRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Support Staff',
        username: `support_${timestamp.toString().slice(-6)}`,
        email: supportEmail,
        password: adminPass,
        confirmPassword: adminPass,
        roleTitle: 'Support Specialist',
        experience: 3,
        progLangs: 'JavaScript',
        bio: 'Support specialist.',
      }),
    });
    const supportUserId = (await regSupportRes.json()).user.id;
    await query(`UPDATE users SET role = 'SUPPORT', status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [supportUserId]);
    const supportLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: supportEmail, password: adminPass }),
    });
    const supportToken = (await supportLoginRes.json()).token;

    // 6. Setup Developer 1 (Target: Developer #01 with initial 12 credits)
    const dev1Email = `dev1_rem_${timestamp}@nexus.dev`;
    const regDev1Res = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Developer #01',
        username: `dev01_${timestamp.toString().slice(-6)}`,
        email: dev1Email,
        password: adminPass,
        confirmPassword: adminPass,
        roleTitle: 'Senior Fullstack Engineer',
        experience: 6,
        progLangs: 'TypeScript, Go',
        bio: 'Target developer for single user removal.',
      }),
    });
    const dev1Data = await regDev1Res.json();
    const dev1UserId = dev1Data.user.id;
    const dev1Uid = dev1Data.user.uid;
    const dev1DeveloperId = dev1Data.developer.id;
    await query(`UPDATE developers SET verification_status = 'VERIFIED' WHERE id = $1`, [dev1DeveloperId]);
    await query(`UPDATE users SET status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [dev1UserId]);

    const dev1LoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: dev1Email, password: adminPass }),
    });
    const dev1Token = (await dev1LoginRes.json()).token;

    // 7. Setup Developer 2 (Target: Developer #02 with initial 2 credits)
    const dev2Email = `dev2_rem_${timestamp}@nexus.dev`;
    const regDev2Res = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Developer #02',
        username: `dev02_${timestamp.toString().slice(-6)}`,
        email: dev2Email,
        password: adminPass,
        confirmPassword: adminPass,
        roleTitle: 'Backend Specialist',
        experience: 4,
        progLangs: 'Python',
        bio: 'Target developer for invalid removal test.',
      }),
    });
    const dev2Data = await regDev2Res.json();
    const dev2UserId = dev2Data.user.id;
    const dev2Uid = dev2Data.user.uid;
    const dev2DeveloperId = dev2Data.developer.id;
    await query(`UPDATE developers SET verification_status = 'VERIFIED' WHERE id = $1`, [dev2DeveloperId]);
    await query(`UPDATE users SET status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [dev2UserId]);

    // 8. Setup Client
    const clientEmail = `client_rem_${timestamp}@nexus.dev`;
    const regClientRes = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Client Apex',
        email: clientEmail,
        password: adminPass,
        confirmPassword: adminPass,
        companyName: 'Apex Logistics Inc.',
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

    // =========================================================================
    // SECTION 1: SINGLE USER CREDIT REMOVAL (12 CREDITS -> REMOVE 3 -> 9 CREDITS)
    // =========================================================================
    console.log('\n--- SECTION 1: Single User Credit Removal (Example: 12 - 3 = 9) ---');

    // Seed Dev 1 initial balance at 12 credits via initial PURCHASE transaction
    await query(`DELETE FROM credit_accounts WHERE user_id = $1 OR developer_id = $2`, [dev1UserId, dev1DeveloperId]);
    await query(
      `INSERT INTO credit_accounts (user_id, developer_id, balance, currency) VALUES ($1, $2, 12, 'INR')`,
      [dev1UserId, dev1DeveloperId]
    );
    await query(
      `INSERT INTO credit_transactions (user_id, developer_id, type, amount, balance_before, balance_after, reference_id, reason, description)
       VALUES ($1, $2, 'PURCHASE', 12, 0, 12, 'SEED-PURCHASE-12', 'Initial seed purchase', 'Developer credit purchase')`,
      [dev1UserId, dev1DeveloperId]
    );

    const initialBalCheck = await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev1UserId]);
    assert(initialBalCheck.rows[0].balance === 12, 'Developer 1 initialized with 12 credits');

    // Admin removes 3 credits using 16-character public UID
    const removalReason = 'Manual correction';
    const removeRes = await fetch(`${baseUrl}/api/admin/credits/remove`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: dev1Uid,
        amount: 3,
        reason: removalReason,
      }),
    });

    assert(removeRes.status === 200, `Admin successfully removed 3 credits (HTTP ${removeRes.status})`);
    const removeData = await removeRes.json();
    assert(removeData.success === true, 'Removal response indicates success: true');
    assert(removeData.balanceBefore === 12, `Balance before is 12 (got ${removeData.balanceBefore})`);
    assert(removeData.amount === -3, `Delta amount recorded as -3 (got ${removeData.amount})`);
    assert(removeData.balance === 9, `Balance after is updated to 9 (got ${removeData.balance})`);
    assert(removeData.type === 'ADMIN_CREDIT_REMOVAL', `Transaction type is ADMIN_CREDIT_REMOVAL (${removeData.type})`);
    assert(removeData.reason === removalReason, 'Reason matches submitted justification');
    assert(removeData.performedBy === adminAUserId, 'performedBy attributes Admin A ID');

    // Verify database row in credit_accounts
    const dbBalRes = await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev1UserId]);
    assert(dbBalRes.rows[0].balance === 9, `Database credit balance updated to 9 (got ${dbBalRes.rows[0].balance})`);

    // Verify credit_transactions row
    const txRes = await query(`SELECT * FROM credit_transactions WHERE id = $1`, [removeData.transactionId]);
    assert(txRes.rows.length === 1, 'Transaction recorded in credit_transactions table');
    const tx = txRes.rows[0];
    assert(tx.type === 'ADMIN_CREDIT_REMOVAL', `Ledger record type is ADMIN_CREDIT_REMOVAL (${tx.type})`);
    assert(tx.amount === -3, `Ledger amount is -3 (got ${tx.amount})`);
    assert(tx.balance_before === 12, `Ledger balance_before is 12 (got ${tx.balance_before})`);
    assert(tx.balance_after === 9, `Ledger balance_after is 9 (got ${tx.balance_after})`);
    assert(tx.performed_by === adminAUserId, 'Ledger explicitly attributes Admin A as performer');
    assert(tx.reason === removalReason, 'Ledger preserves auditable reason');

    // Verify Audit Log
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE actor_user_id = $1 AND action = 'ADMIN_CREDIT_REMOVAL' ORDER BY created_at DESC LIMIT 1`,
      [adminAUserId]
    );
    assert(auditRes.rows.length === 1, 'Audit log created for ADMIN_CREDIT_REMOVAL');

    // Verify Notification
    const notifRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND type = 'CREDIT_REMOVED' ORDER BY created_at DESC LIMIT 1`,
      [dev1UserId]
    );
    assert(notifRes.rows.length === 1, 'Notification generated for recipient');
    assert(notifRes.rows[0].message.includes('3 credits'), 'Notification message mentions 3 credits deducted');
    assert(notifRes.rows[0].message.includes('9 credits'), 'Notification message mentions new balance of 9 credits');

    // =========================================================================
    // SECTION 2: PREVENT INVALID REMOVAL (NEGATIVE BALANCE REJECTION)
    // =========================================================================
    console.log('\n--- SECTION 2: Prevent Invalid Removal (Balance = 2, Remove = 5) ---');

    // Seed Dev 2 initial balance at 2 credits
    await query(`DELETE FROM credit_accounts WHERE user_id = $1 OR developer_id = $2`, [dev2UserId, dev2DeveloperId]);
    await query(
      `INSERT INTO credit_accounts (user_id, developer_id, balance, currency) VALUES ($1, $2, 2, 'INR')`,
      [dev2UserId, dev2DeveloperId]
    );

    const dev2BalCheck = await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev2UserId]);
    assert(dev2BalCheck.rows[0].balance === 2, 'Developer 2 initialized with 2 credits');

    // Admin attempts to remove 5 credits from Dev 2 (balance is 2) -> MUST BE REJECTED!
    const invalidRemoveRes = await fetch(`${baseUrl}/api/admin/credits/remove`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: dev2Uid,
        amount: 5,
        reason: 'Attempting to deduct more credits than available',
      }),
    });

    assert(invalidRemoveRes.status === 400, `Removal rejected with HTTP 400 Bad Request (got ${invalidRemoveRes.status})`);
    const invalidRemoveData = await invalidRemoveRes.json();
    assert(
      invalidRemoveData.error.includes('negative balance') || invalidRemoveData.error.includes('prohibit negative'),
      `Clear error explains negative balance prohibition: "${invalidRemoveData.error}"`
    );

    // Verify balance is completely untouched and never -3
    const dev2PostCheck = await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev2UserId]);
    assert(dev2PostCheck.rows[0].balance === 2, `Balance strictly preserved at 2 credits (never -3)`);

    // Verify zero phantom transactions were written
    const dev2TxCount = await query(`SELECT COUNT(*)::int as count FROM credit_transactions WHERE user_id = $1`, [dev2UserId]);
    assert(dev2TxCount.rows[0].count === 0, 'Zero phantom ledger transactions written on rejected removal');

    // =========================================================================
    // SECTION 3: DO NOT DELETE HISTORY (IMMUTABLE AUDIT TRAIL)
    // =========================================================================
    console.log('\n--- SECTION 3: Do Not Delete History ---');

    // Inspect Dev 1 complete transaction ledger
    const dev1History = await query(
      `SELECT type, amount, balance_before, balance_after, reason FROM credit_transactions WHERE user_id = $1 ORDER BY created_at ASC`,
      [dev1UserId]
    );

    assert(dev1History.rows.length === 2, `Dev 1 has exactly 2 transactions (got ${dev1History.rows.length})`);
    assert(dev1History.rows[0].type === 'PURCHASE', 'First transaction is original PURCHASE (+12)');
    assert(dev1History.rows[0].amount === 12, 'First transaction amount is +12 (history never deleted)');
    assert(dev1History.rows[1].type === 'ADMIN_CREDIT_REMOVAL', 'Second transaction is append-only ADMIN_CREDIT_REMOVAL (-3)');
    assert(dev1History.rows[1].amount === -3, 'Second transaction amount is -3');

    // Reconcile mathematical sum of ledger entries with current account balance
    const sumTransactions = dev1History.rows.reduce((acc, row) => acc + Number(row.amount), 0);
    assert(sumTransactions === 9, `Ledger sum (12 - 3 = ${sumTransactions}) exactly equals current balance (9)`);

    // =========================================================================
    // SECTION 4: CONCURRENT SAFETY (TWO ADMINS REMOVING SIMULTANEOUSLY)
    // =========================================================================
    console.log('\n--- SECTION 4: Concurrent Safety (Balance = 5, Admin A removes 4, Admin B removes 4) ---');

    // Setup dedicated concurrency test user with balance = 5 credits
    const concEmail = `conc_user_${timestamp}@nexus.dev`;
    const regConcRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Concurrency Test User',
        username: `conc_${timestamp.toString().slice(-6)}`,
        email: concEmail,
        password: adminPass,
        confirmPassword: adminPass,
        roleTitle: 'Systems Tester',
        experience: 5,
        progLangs: 'C++',
        bio: 'Dedicated for concurrent locking verification.',
      }),
    });
    const concData = await regConcRes.json();
    const concUserId = concData.user.id;
    const concUid = concData.user.uid;
    const concDevId = concData.developer.id;

    await query(`UPDATE developers SET verification_status = 'VERIFIED' WHERE id = $1`, [concDevId]);
    await query(`UPDATE users SET status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [concUserId]);
    await query(`DELETE FROM credit_accounts WHERE user_id = $1 OR developer_id = $2`, [concUserId, concDevId]);
    await query(
      `INSERT INTO credit_accounts (user_id, developer_id, balance, currency) VALUES ($1, $2, 5, 'INR')`,
      [concUserId, concDevId]
    );

    const concInitCheck = await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [concUserId]);
    assert(concInitCheck.rows[0].balance === 5, 'Concurrency test user initialized with exactly 5 credits');

    // Admin A attempts to remove 4 credits
    // Admin B attempts to remove 4 credits simultaneously
    console.log('  Executing concurrent removal requests from Admin A and Admin B...');
    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/api/admin/credits/remove`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target: concUid,
          amount: 4,
          reason: 'Concurrent race test - Admin A deduction',
        }),
      }),
      fetch(`${baseUrl}/api/admin/credits/remove`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminBToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target: concUid,
          amount: 4,
          reason: 'Concurrent race test - Admin B deduction',
        }),
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert(
      statuses[0] === 200 && statuses[1] === 400,
      `Exactly one transaction succeeded (200) and one failed (400) (got ${statuses.join(', ')})`
    );

    // Verify which admin succeeded and which received rejection
    const dataA = await resA.json();
    const dataB = await resB.json();

    const successfulRes = resA.status === 200 ? dataA : dataB;
    const failedRes = resA.status === 400 ? dataA : dataB;

    assert(successfulRes.balance === 1, `Successful admin updated balance to 1 (5 - 4 = 1)`);
    assert(
      failedRes.error.includes('negative balance') || failedRes.error.includes('prohibit negative'),
      `Failed admin received negative balance rejection: "${failedRes.error}"`
    );

    // Check database balance: MUST BE 1, NEVER -3!
    const finalConcBal = await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [concUserId]);
    assert(finalConcBal.rows[0].balance === 1, `CRITICAL: Final database balance is exactly 1 (NEVER -3!)`);

    // Verify ledger count: Exactly ONE ADMIN_CREDIT_REMOVAL transaction recorded
    const concTxList = await query(
      `SELECT type, amount, balance_before, balance_after FROM credit_transactions WHERE user_id = $1`,
      [concUserId]
    );
    assert(concTxList.rows.length === 1, `Ledger contains exactly 1 transaction (got ${concTxList.rows.length})`);
    assert(concTxList.rows[0].amount === -4, 'Ledger transaction delta is -4');
    assert(concTxList.rows[0].balance_before === 5, 'Ledger transaction balance_before was 5');
    assert(concTxList.rows[0].balance_after === 1, 'Ledger transaction balance_after is 1');

    // =========================================================================
    // SECTION 5: SELECTED USERS & ELIGIBLE GROUPS BULK REMOVAL
    // =========================================================================
    console.log('\n--- SECTION 5: Selected Users & Groups Bulk Removal ---');

    // Setup client balance at 10 credits
    await query(`DELETE FROM credit_accounts WHERE user_id = $1`, [clientUserId]);
    await query(
      `INSERT INTO credit_accounts (user_id, balance, currency) VALUES ($1, 10, 'INR')`,
      [clientUserId]
    );

    // 5.1 Preview Bulk Removal
    const previewRes = await fetch(`${baseUrl}/api/admin/credits/bulk-remove-preview`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetScope: 'SELECTED',
        userIds: [dev1UserId, clientUserId],
        amount: 2,
        reason: 'Preview bulk deduction for selected accounts',
      }),
    });

    assert(previewRes.status === 200, `Bulk removal preview returned HTTP 200 (got ${previewRes.status})`);
    const previewData = await previewRes.json();
    assert(previewData.recipientCount === 2, `Preview identifies 2 eligible recipients (got ${previewData.recipientCount})`);
    assert(previewData.estimatedTotalCredits === 4, `Estimated total credits to remove is 4 (got ${previewData.estimatedTotalCredits})`);
    assert(previewData.sampleRecipients.length === 2, 'Sample recipients populated in preview');

    // Verify preview did not alter balances
    const dev1BalPreExec = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev1UserId])).rows[0].balance;
    const clientBalPreExec = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [clientUserId])).rows[0].balance;
    assert(dev1BalPreExec === 9, 'Dev 1 balance untouched by preview (still 9)');
    assert(clientBalPreExec === 10, 'Client balance untouched by preview (still 10)');

    // 5.2 Execute Selected Users Bulk Removal
    const bulkRemoveRes = await fetch(`${baseUrl}/api/admin/credits/bulk-remove`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminAToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetScope: 'SELECTED',
        userIds: [dev1UserId, clientUserId],
        amount: 2,
        reason: 'Selected accounts promotional credit deduction',
      }),
    });

    assert(bulkRemoveRes.status === 200, `Bulk removal succeeded with HTTP 200 (got ${bulkRemoveRes.status})`);
    const bulkRemoveData = await bulkRemoveRes.json();
    assert(bulkRemoveData.success === true, 'Bulk removal response indicates success: true');
    assert(bulkRemoveData.count === 2, `Deducted from 2 accounts (got ${bulkRemoveData.count})`);
    assert(bulkRemoveData.totalCredits === 4, `Total 4 credits deducted (got ${bulkRemoveData.totalCredits})`);
    assert(Boolean(bulkRemoveData.batchReference), `Batch reference generated (${bulkRemoveData.batchReference})`);

    // Verify individual account balances post-deduction
    const dev1BalPost = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev1UserId])).rows[0].balance;
    const clientBalPost = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [clientUserId])).rows[0].balance;
    assert(dev1BalPost === 7, `Dev 1 balance reduced from 9 to 7 (got ${dev1BalPost})`);
    assert(clientBalPost === 8, `Client balance reduced from 10 to 8 (got ${clientBalPost})`);

    // Verify individual immutable transactions created with ADMIN_CREDIT_REMOVAL
    const bulkTxDev1 = await query(
      `SELECT * FROM credit_transactions WHERE user_id = $1 AND reference_id = $2`,
      [dev1UserId, bulkRemoveData.batchReference]
    );
    assert(bulkTxDev1.rows.length === 1, 'Dev 1 received individual ledger record for bulk removal');
    assert(bulkTxDev1.rows[0].amount === -2, 'Dev 1 ledger delta is -2');
    assert(bulkTxDev1.rows[0].balance_before === 9, 'Dev 1 balance_before is 9');
    assert(bulkTxDev1.rows[0].balance_after === 7, 'Dev 1 balance_after is 7');

    const bulkTxClient = await query(
      `SELECT * FROM credit_transactions WHERE user_id = $1 AND reference_id = $2`,
      [clientUserId, bulkRemoveData.batchReference]
    );
    assert(bulkTxClient.rows.length === 1, 'Client received individual ledger record for bulk removal');
    assert(bulkTxClient.rows[0].amount === -2, 'Client ledger delta is -2');
    assert(bulkTxClient.rows[0].balance_before === 10, 'Client balance_before is 10');
    assert(bulkTxClient.rows[0].balance_after === 8, 'Client balance_after is 8');

    // =========================================================================
    // SECTION 6: STRICT INPUT VALIDATION & DEFENSE
    // =========================================================================
    console.log('\n--- SECTION 6: Strict Input Validation & Defense ---');

    // 6.1 Negative amount -> HTTP 400
    const negRes = await fetch(`${baseUrl}/api/admin/credits/remove`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: dev1UserId, amount: -5, reason: 'Negative deduction attempt' }),
    });
    assert(negRes.status === 400, `Negative credit amount rejected with HTTP 400 (got ${negRes.status})`);

    // 6.2 Zero amount -> HTTP 400
    const zeroRes = await fetch(`${baseUrl}/api/admin/credits/remove`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: dev1UserId, amount: 0, reason: 'Zero deduction attempt' }),
    });
    assert(zeroRes.status === 400, `Zero credit amount rejected with HTTP 400 (got ${zeroRes.status})`);

    // 6.3 Decimal / float amount -> HTTP 400
    const floatRes = await fetch(`${baseUrl}/api/admin/credits/remove`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: dev1UserId, amount: 2.5, reason: 'Float deduction attempt' }),
    });
    assert(floatRes.status === 400, `Float credit amount (2.5) rejected with HTTP 400 (got ${floatRes.status})`);

    // 6.4 Overflow amount (> 1,000,000) -> HTTP 400
    const overflowRes = await fetch(`${baseUrl}/api/admin/credits/remove`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: dev1UserId, amount: 10_000_000, reason: 'Overflow deduction attempt' }),
    });
    assert(overflowRes.status === 400, `Overflow credit amount rejected with HTTP 400 (got ${overflowRes.status})`);

    // 6.5 Reason under 5 characters -> HTTP 400
    const shortReasonRes = await fetch(`${baseUrl}/api/admin/credits/remove`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: dev1UserId, amount: 1, reason: 'bad' }),
    });
    assert(shortReasonRes.status === 400, `Short reason rejected with HTTP 400 (got ${shortReasonRes.status})`);

    // 6.6 Non-existent user -> HTTP 400
    const noUserRes = await fetch(`${baseUrl}/api/admin/credits/remove`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'non_existent_uid_123', amount: 1, reason: 'Valid reason for ghost user' }),
    });
    assert(noUserRes.status === 400, `Non-existent user rejected with HTTP 400 (got ${noUserRes.status})`);

    // =========================================================================
    // SECTION 7: RBAC & GOVERNANCE AUTHORIZATION
    // =========================================================================
    console.log('\n--- SECTION 7: RBAC & Governance Authorization ---');

    // 7.1 CEO is authorized to remove credits (HTTP 200)
    const ceoRemoveRes = await fetch(`${baseUrl}/api/admin/credits/remove`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ceoToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: dev1UserId, amount: 1, reason: 'Executive CEO credit adjustment' }),
    });
    assert(ceoRemoveRes.status === 200, `CEO authorized to remove credits (HTTP 200)`);
    const dev1AfterCeo = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev1UserId])).rows[0].balance;
    assert(dev1AfterCeo === 6, `Dev 1 balance reduced to 6 by CEO (got ${dev1AfterCeo})`);

    // 7.2 MD is strictly prohibited (HTTP 403 Forbidden)
    const mdRemoveRes = await fetch(`${baseUrl}/api/admin/credits/remove`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mdToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: dev1UserId, amount: 1, reason: 'Unauthorized MD removal attempt' }),
    });
    assert(mdRemoveRes.status === 403, `MD strictly prohibited from removing credits (HTTP 403)`);

    // 7.3 Support staff is strictly prohibited (HTTP 403 Forbidden)
    const suppRemoveRes = await fetch(`${baseUrl}/api/admin/credits/remove`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supportToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: dev1UserId, amount: 1, reason: 'Unauthorized Support removal attempt' }),
    });
    assert(suppRemoveRes.status === 403, `SUPPORT strictly prohibited from removing credits (HTTP 403)`);

    // 7.4 Client is strictly prohibited (HTTP 403 Forbidden)
    const clientRemoveRes = await fetch(`${baseUrl}/api/admin/credits/remove`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: dev1UserId, amount: 1, reason: 'Unauthorized Client removal attempt' }),
    });
    assert(clientRemoveRes.status === 403, `CLIENT strictly prohibited from removing credits (HTTP 403)`);

    // 7.5 Developer is strictly prohibited (HTTP 403 Forbidden)
    const devRemoveRes = await fetch(`${baseUrl}/api/admin/credits/remove`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dev1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: clientUserId, amount: 1, reason: 'Unauthorized Dev removal attempt' }),
    });
    assert(devRemoveRes.status === 403, `DEVELOPER strictly prohibited from removing credits (HTTP 403)`);

    // 7.6 Unauthenticated is strictly rejected (HTTP 401 Unauthorized)
    const unauthRes = await fetch(`${baseUrl}/api/admin/credits/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: dev1UserId, amount: 1, reason: 'Unauthenticated removal attempt' }),
    });
    assert(unauthRes.status === 401, `Unauthenticated request rejected with HTTP 401`);

  } catch (error: any) {
    console.error('[Harness] Unexpected test failure:', error);
    assert(false, 'Unexpected failure during execution', error.message);
  } finally {
    if (server) {
      server.close();
      console.log('\n[Harness] Ephemeral test server closed.');
    }
    await pool.end();
  }

  // Summary
  console.log('\n================================================================');
  console.log('PHASE 9 TEST SUMMARY');
  console.log('================================================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Total tests: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

  if (failed > 0) {
    console.error('FAILED TESTS:');
    results.filter((r) => !r.passed).forEach((r) => console.error(`  - ${r.name}: ${r.details || ''}`));
    process.exit(1);
  } else {
    console.log('ALL PHASE 9 ADMIN CREDIT REMOVAL CHECKS PASSED PERFECTLY! ✔\n');
  }
}

runTest();
