/**
 * Phase 7 — Admin Single-User Credit Grant Verification Suite
 * 
 * Verifies:
 * 1. User Search:
 *    - Searchable by UID, Name, Email, Username.
 *    - Displays Name, UID, Role, Current Balance, Account Status.
 *    - Zero exposure of sensitive authentication information (password_hash, reset tokens).
 * 2. Grant Modal & API Flow:
 *    - Admin targets a user, specifies positive integer credits, and provides mandatory auditable reason.
 * 3. Server Transaction Atomicity:
 *    - lock credit account FOR UPDATE
 *    - read balance
 *    - calculate new balance
 *    - update balance
 *    - create ledger transaction (ADMIN_CREDIT_GRANT)
 *    - create audit log
 *    - create notification
 *    - commit (ACID rollback on failure)
 * 4. Exact Example Verification:
 *    - Before: 10 credits
 *    - Admin grants: 5 credits
 *    - After: 15 credits
 *    - Ledger: ADMIN_CREDIT_GRANT, +5, balance_before: 10, balance_after: 15
 * 5. Strict Security & Input Defense:
 *    - Prohibit negative numbers, zero, decimals/floats, overflow, unsafe integers.
 *    - Mandatory reason (min 5 chars).
 * 6. RBAC & Governance:
 *    - ADMIN & CEO allowed.
 *    - MD, SUPPORT, CLIENT, DEVELOPER, and unauthenticated strictly denied (403/401).
 */

import { Server } from 'http';
import app from '../server.js';
import { query, pool, withTransaction } from '../database/db.js';
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
  console.log('PHASE 7: ADMIN SINGLE-USER CREDIT GRANT VERIFICATION');
  console.log('================================================================\n');

  let server: Server | null = null;
  let baseUrl = '';

  try {
    // 1. Launch ephemeral test server
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server?.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`[Harness] Test server running at ${baseUrl}`);
        resolve();
      });
    });

    const timestamp = Date.now();

    // 2. Set up test actors across platform roles
    console.log('\n--- Setting up test actors for Phase 7 verification ---');

    // Admin Actor
    const adminEmail = `admin_p7_${timestamp}@nexus.dev`;
    const adminPass = 'Password123!Secure';
    const regAdminRes = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Phase 7 Platform Admin',
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

    // CEO Actor (M. Shiva Gopi)
    const ceoLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'shiva@nexus.dev', password: 'DevPlatform2026!Secure' }),
    });
    const ceoToken = (await ceoLoginRes.json()).token;
    assert(Boolean(ceoToken), 'CEO user authenticated successfully');

    // MD Actor (Ritesh Lingamallu)
    const mdLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ritesh@nexus.dev', password: 'DevPlatform2026!Secure' }),
    });
    const mdToken = (await mdLoginRes.json()).token;
    assert(Boolean(mdToken), 'MD user authenticated successfully');

    // Support Staff Actor
    const supportLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'support@nexus.dev', password: 'DevPlatform2026!Secure' }),
    });
    const supportToken = (await supportLoginRes.json()).token;
    assert(Boolean(supportToken), 'Support staff authenticated successfully');

    // Target Developer User (e.g. Ritesh Developer)
    const devEmail = `dev_p7_target_${timestamp}@nexus.dev`;
    const devPass = 'Password123!Secure';
    const regDevRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Ritesh Lingamallu Developer',
        username: `ritesh_dev_${timestamp.toString().slice(-6)}`,
        email: devEmail,
        password: devPass,
        confirmPassword: devPass,
        roleTitle: 'Senior Full Stack Engineer',
        experienceYears: 6,
        primarySkills: ['TypeScript', 'Node.js', 'PostgreSQL'],
        termsAccepted: true,
      }),
    });
    const devData = await regDevRes.json();
    const devUserId = devData.user.id;
    await query(`UPDATE users SET status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [devUserId]);

    const devLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: devEmail, password: devPass }),
    });
    const targetDevUsername = `ritesh_dev_${timestamp.toString().slice(-6)}`;
    const devLoginData = await devLoginRes.json();
    const devToken = devLoginData.token;
    const targetDevUid = devLoginData.user.uid;
    const targetDevName = devLoginData.user.displayName || devLoginData.user.name || 'Ritesh Lingamallu Developer';

    assert(Boolean(devToken), 'Target Developer authenticated successfully');
    assert(Boolean(targetDevUid) && isValidUserUid(targetDevUid), `Target Developer has valid 16-char UID: ${targetDevUid}`);

    // Target Client User
    const clientEmail = `client_p7_target_${timestamp}@nexus.dev`;
    const clientPass = 'Password123!Secure';
    const regClientRes = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Kiran Patel Director',
        email: clientEmail,
        password: clientPass,
        confirmPassword: clientPass,
        companyName: 'Apex Innovations Global',
      }),
    });
    const clientData = await regClientRes.json();
    const clientUserId = clientData.user.id;
    await query(`UPDATE users SET status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [clientUserId]);

    const clientLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: clientEmail, password: clientPass }),
    });
    const clientLoginData = await clientLoginRes.json();
    const clientToken = clientLoginData.token;
    const targetClientUid = clientLoginData.user.uid;
    assert(Boolean(clientToken), 'Target Client authenticated successfully');

    // =========================================================================
    // SECTION 1: USER SEARCH API VERIFICATION
    // =========================================================================
    console.log('\n--- SECTION 1: User Search API Verification ---');

    // 1.1 Search by 16-character public UID
    const searchByUidRes = await fetch(`${baseUrl}/api/admin/credits/search-users?q=${targetDevUid}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(searchByUidRes.status === 200, 'Search by UID returns HTTP 200');
    const searchByUidData = await searchByUidRes.json();
    assert(Array.isArray(searchByUidData.users), 'Search returns users array');
    const foundByUid = searchByUidData.users.find((u: any) => u.uid === targetDevUid);
    assert(Boolean(foundByUid), `User found by exact 16-character UID: ${targetDevUid}`);
    assert(foundByUid?.email === devEmail, `Found user email matches (${devEmail})`);

    // 1.2 Search by User Name
    const searchByNameRes = await fetch(`${baseUrl}/api/admin/credits/search-users?q=Ritesh`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(searchByNameRes.status === 200, 'Search by Name returns HTTP 200');
    const searchByNameData = await searchByNameRes.json();
    const foundByName = searchByNameData.users.find((u: any) => u.id === devUserId || u.uid === targetDevUid);
    assert(Boolean(foundByName), 'User found by Name substring "Ritesh"');

    // 1.3 Search by Email
    const searchByEmailRes = await fetch(`${baseUrl}/api/admin/credits/search-users?q=${devEmail}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(searchByEmailRes.status === 200, 'Search by Email returns HTTP 200');
    const searchByEmailData = await searchByEmailRes.json();
    const foundByEmail = searchByEmailData.users.find((u: any) => u.email === devEmail);
    assert(Boolean(foundByEmail), `User found by exact email (${devEmail})`);

    // 1.4 Search by Username
    const searchByUsernameRes = await fetch(`${baseUrl}/api/admin/credits/search-users?q=${targetDevUsername}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(searchByUsernameRes.status === 200, 'Search by Username returns HTTP 200');
    const searchByUsernameData = await searchByUsernameRes.json();
    const foundByUsername = searchByUsernameData.users.find((u: any) => u.username === targetDevUsername);
    assert(Boolean(foundByUsername), `User found by developer username (${targetDevUsername})`);

    // 1.5 Search Client by Company Name
    const searchByCompanyRes = await fetch(`${baseUrl}/api/admin/credits/search-users?q=Apex+Innovations`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(searchByCompanyRes.status === 200, 'Search by Company Name returns HTTP 200');
    const searchByCompanyData = await searchByCompanyRes.json();
    const foundByCompany = searchByCompanyData.users.find((u: any) => u.id === clientUserId || u.uid === targetClientUid);
    assert(Boolean(foundByCompany), 'Client user found by company name "Apex Innovations"');

    // 1.6 Verify Display Fields: Name, UID, Role, Current Balance, Account Status
    assert(typeof foundByUid.name === 'string' && foundByUid.name.length > 0, 'User search result contains valid Name');
    assert(isValidUserUid(foundByUid.uid), 'User search result contains valid 16-char UID');
    assert(foundByUid.role === 'DEVELOPER', 'User search result contains valid Role (DEVELOPER)');
    assert(typeof foundByUid.current_balance === 'number', 'User search result contains numeric Current Balance');
    assert(foundByUid.status === 'ACTIVE', 'User search result contains valid Account Status (ACTIVE)');

    // 1.7 STRICT SECURITY CHECK: No exposure of sensitive authentication information
    const allUsersReturned = [...searchByUidData.users, ...searchByNameData.users, ...searchByCompanyData.users];
    const noPasswordHash = allUsersReturned.every((u: any) => u.password_hash === undefined && u.password === undefined);
    const noResetToken = allUsersReturned.every((u: any) => u.password_reset_token === undefined && u.password_reset_expires_at === undefined);
    assert(noPasswordHash, 'ZERO EXPOSURE: password_hash is not present in search results');
    assert(noResetToken, 'ZERO EXPOSURE: password_reset_token is not present in search results');

    // =========================================================================
    // SECTION 2: SINGLE-USER CREDIT GRANT (Exact Phase 7 Example: 10 + 5 = 15)
    // =========================================================================
    console.log('\n--- SECTION 2: Single-User Credit Grant Example (10 -> +5 -> 15) ---');

    // 2.1 Set initial balance to exactly 10 credits
    await query(`DELETE FROM credit_accounts WHERE user_id = $1 OR (developer_id IS NOT NULL AND developer_id = (SELECT id FROM developers WHERE user_id = $1))`, [devUserId]);
    await query(
      `INSERT INTO credit_accounts (user_id, developer_id, balance, currency)
       VALUES ($1, (SELECT id FROM developers WHERE user_id = $1), 10, 'INR')`,
      [devUserId]
    );

    const initialAccRes = await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [devUserId]);
    const initialBalance = Number(initialAccRes.rows[0].balance);
    assert(initialBalance === 10, `Initial credit balance confirmed at 10 credits (got ${initialBalance})`);

    // 2.2 Admin grants 5 credits to Ritesh (targetDevUid)
    const grantReason = 'Promotional credit for approved project milestone delivery';
    const grantRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        target: targetDevUid,
        amount: 5,
        reason: grantReason,
      }),
    });

    assert(grantRes.status === 200, `Admin successfully granted 5 credits (HTTP ${grantRes.status})`);
    const grantData = await grantRes.json();

    // 2.3 Verify API Response Attributes
    assert(grantData.success === true, 'Grant response indicates success: true');
    assert(grantData.balanceBefore === 10, `Balance before is 10 (got ${grantData.balanceBefore})`);
    assert(grantData.amount === 5, `Granted amount is 5 (got ${grantData.amount})`);
    assert(grantData.balance === 15 && grantData.newBalance === 15, `Balance after is 15 (got ${grantData.balance})`);
    assert(grantData.type === 'ADMIN_CREDIT_GRANT', 'Ledger type is ADMIN_CREDIT_GRANT');
    assert(grantData.reason === grantReason, 'Reason matches submitted justification');
    assert(grantData.performedBy === adminUserId, 'performedBy matches Admin User ID');
    assert(Boolean(grantData.transactionId), `Ledger transactionId created: ${grantData.transactionId}`);
    assert(Boolean(grantData.referenceId), `Reference ID generated: ${grantData.referenceId}`);
    assert(grantData.user.uid === targetDevUid, `User UID matches target: ${targetDevUid}`);

    // 2.4 Verify Database Credit Account State
    const updatedAccRes = await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [devUserId]);
    const updatedBalance = Number(updatedAccRes.rows[0].balance);
    assert(updatedBalance === 15, `Database credit balance atomically updated to 15 (got ${updatedBalance})`);

    // 2.5 Verify Immutable Ledger Transaction
    const txRes = await query(
      `SELECT * FROM credit_transactions WHERE id = $1`,
      [grantData.transactionId]
    );
    assert(txRes.rows.length === 1, 'Ledger transaction record exists in credit_transactions table');
    const txRow = txRes.rows[0];
    assert(txRow.type === 'ADMIN_CREDIT_GRANT', 'Ledger record type is ADMIN_CREDIT_GRANT');
    assert(Number(txRow.amount) === 5, 'Ledger record delta amount is +5');
    assert(Number(txRow.balance_before) === 10, 'Ledger record balance_before is 10');
    assert(Number(txRow.balance_after) === 15, 'Ledger record balance_after is 15');
    assert(txRow.performed_by === adminUserId, `Ledger record explicitly attributes admin performer (${adminUserId})`);
    assert(txRow.reason === grantReason, 'Ledger record preserves auditable reason');

    // 2.6 Verify Executive Audit Log
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE actor_user_id = $1 AND action = 'ADMIN_CREDIT_GRANT' ORDER BY created_at DESC LIMIT 1`,
      [adminUserId]
    );
    assert(auditRes.rows.length === 1, 'Audit log entry created for ADMIN_CREDIT_GRANT');
    const auditRow = auditRes.rows[0];
    assert(auditRow.entity_type === 'CREDIT_ACCOUNT', 'Audit log entity_type is CREDIT_ACCOUNT');
    const auditMeta = typeof auditRow.metadata === 'string' ? JSON.parse(auditRow.metadata) : auditRow.metadata;
    assert(auditMeta.amount === 5, 'Audit log metadata records amount: 5');
    assert(auditMeta.balanceBefore === 10, 'Audit log metadata records balanceBefore: 10');
    assert(auditMeta.balanceAfter === 15, 'Audit log metadata records balanceAfter: 15');

    // 2.7 Verify Recipient Notification
    const notifRes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND type = 'CREDIT_GRANTED' ORDER BY created_at DESC LIMIT 1`,
      [devUserId]
    );
    assert(notifRes.rows.length === 1, 'Notification created for recipient user');
    const notifRow = notifRes.rows[0];
    assert(notifRow.title === 'Credits Granted to Account', 'Notification title is "Credits Granted to Account"');
    assert(notifRow.message.includes('+5 credits'), 'Notification message mentions +5 credits');
    assert(notifRow.message.includes('15 credits'), 'Notification message mentions new balance of 15 credits');
    assert(notifRow.message.includes(grantReason), 'Notification message includes justification reason');

    // =========================================================================
    // SECTION 3: ATOMIC SERVER TRANSACTION & ACID ROLLBACK ON FAILURE
    // =========================================================================
    console.log('\n--- SECTION 3: Atomic Transaction Rollback on Failure ---');

    const balBeforeRollbackTest = Number((await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [devUserId])).rows[0].balance);
    const txCountBefore = Number((await query(`SELECT COUNT(*) as count FROM credit_transactions WHERE user_id = $1`, [devUserId])).rows[0].count);

    // Simulate an atomic transaction failure inside withTransaction
    let rollbackCaught = false;
    try {
      await withTransaction(async (client) => {
        // Step A: update balance
        await client.query(`UPDATE credit_accounts SET balance = balance + 100 WHERE user_id = $1`, [devUserId]);
        // Step B: insert ledger record
        await client.query(
          `INSERT INTO credit_transactions (user_id, type, amount, balance_after, reference_id, description, performed_by)
           VALUES ($1, 'ADMIN_CREDIT_GRANT', 100, 115, 'SIMULATED_FAIL', 'Simulated failure', $2)`,
          [devUserId, adminUserId]
        );
        // Step C: throw intentional error to trigger rollback
        throw new Error('Simulated atomic failure mid-transaction (testing ROLLBACK)');
      });
    } catch (err: any) {
      rollbackCaught = true;
      assert(err.message.includes('Simulated atomic failure'), 'Intentional rollback error was thrown and caught');
    }

    assert(rollbackCaught, 'Transaction aborted and triggered rollback');

    // Verify balance was untouched
    const balAfterRollbackTest = Number((await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [devUserId])).rows[0].balance);
    assert(balAfterRollbackTest === balBeforeRollbackTest, `Balance remained exactly ${balBeforeRollbackTest} after rollback (did not corrupt to 115)`);

    // Verify no orphaned ledger transactions
    const txCountAfter = Number((await query(`SELECT COUNT(*) as count FROM credit_transactions WHERE user_id = $1`, [devUserId])).rows[0].count);
    assert(txCountAfter === txCountBefore, 'Ledger transaction count is unchanged after rollback (zero phantom records)');

    // =========================================================================
    // SECTION 4: STRICT SECURITY & INPUT VALIDATION DEFENSE
    // =========================================================================
    console.log('\n--- SECTION 4: Strict Security & Input Validation Defense ---');

    // 4.1 Reject negative amount (-5 credits)
    const negRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ target: targetDevUid, amount: -5, reason: 'Negative credit test' }),
    });
    assert(negRes.status === 400, 'Negative credit amount rejected with HTTP 400');
    const negData = await negRes.json();
    assert(negData.error.includes('positive integer'), 'Error message specifies positive integer required');

    // 4.2 Reject zero amount (0 credits)
    const zeroRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ target: targetDevUid, amount: 0, reason: 'Zero credit test' }),
    });
    assert(zeroRes.status === 400, 'Zero credit amount rejected with HTTP 400');

    // 4.3 Reject decimal / float amount (5.5 credits)
    const floatRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ target: targetDevUid, amount: 5.5, reason: 'Float credit test' }),
    });
    assert(floatRes.status === 400, 'Decimal / float credit amount (5.5) rejected with HTTP 400');

    // 4.4 Reject extreme overflow amount (> 1,000,000 credits)
    const overflowRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ target: targetDevUid, amount: 10_000_000, reason: 'Overflow credit test' }),
    });
    assert(overflowRes.status === 400, 'Overflow credit amount (10,000,000) rejected with HTTP 400');

    // 4.5 Reject unsafe integers
    const unsafeRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ target: targetDevUid, amount: 9007199254740992, reason: 'Unsafe integer test' }),
    });
    assert(unsafeRes.status === 400, 'Unsafe integer (> Number.MAX_SAFE_INTEGER) rejected with HTTP 400');

    // 4.6 Reject missing or too short justification reason (< 5 characters)
    const shortReasonRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ target: targetDevUid, amount: 5, reason: 'abc' }),
    });
    assert(shortReasonRes.status === 400, 'Justification reason under 5 characters rejected with HTTP 400');
    const shortData = await shortReasonRes.json();
    assert(shortData.error.includes('at least 5 characters'), 'Error specifies minimum 5 characters reason requirement');

    // 4.7 Reject non-existent target user
    const nonExistentRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ target: 'NonExistentUser123', amount: 5, reason: 'Valid justification reason' }),
    });
    assert(nonExistentRes.status === 400, 'Non-existent target user rejected with HTTP 400');

    // 4.8 Confirm balance remains unchanged at 15 after all failed attempts
    const balAfterValidationTests = Number((await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [devUserId])).rows[0].balance);
    assert(balAfterValidationTests === 15, `Balance remains intact at exactly 15 credits (got ${balAfterValidationTests})`);

    // =========================================================================
    // SECTION 5: RBAC & GOVERNANCE AUTHORIZATION
    // =========================================================================
    console.log('\n--- SECTION 5: RBAC & Governance Authorization ---');

    // 5.1 CEO can grant credits (HTTP 200)
    const ceoGrantRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({
        target: targetDevUid,
        amount: 3,
        reason: 'CEO Executive milestone discretionary grant',
      }),
    });
    assert(ceoGrantRes.status === 200, 'CEO role authorized to grant credits (HTTP 200)');
    const ceoGrantData = await ceoGrantRes.json();
    assert(ceoGrantData.newBalance === 18, `Balance increased to 18 credits (got ${ceoGrantData.newBalance})`);

    // 5.2 MD is strictly prohibited (HTTP 403 Forbidden)
    const mdGrantRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mdToken}` },
      body: JSON.stringify({
        target: targetDevUid,
        amount: 5,
        reason: 'Unauthorized MD adjustment attempt',
      }),
    });
    assert(mdGrantRes.status === 403, 'MD role strictly prohibited from granting credits (HTTP 403 Forbidden)');

    // 5.3 Support Staff is strictly prohibited (HTTP 403 Forbidden)
    const suppGrantRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supportToken}` },
      body: JSON.stringify({
        target: targetDevUid,
        amount: 5,
        reason: 'Unauthorized Support adjustment attempt',
      }),
    });
    assert(suppGrantRes.status === 403, 'SUPPORT role strictly prohibited from granting credits (HTTP 403 Forbidden)');

    // 5.4 Client is strictly prohibited (HTTP 403 Forbidden)
    const clientGrantRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken}` },
      body: JSON.stringify({
        target: targetDevUid,
        amount: 5,
        reason: 'Unauthorized Client adjustment attempt',
      }),
    });
    assert(clientGrantRes.status === 403, 'CLIENT role strictly prohibited from granting credits (HTTP 403 Forbidden)');

    // 5.5 Developer is strictly prohibited (HTTP 403 Forbidden)
    const devGrantRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${devToken}` },
      body: JSON.stringify({
        target: targetDevUid,
        amount: 5,
        reason: 'Unauthorized Developer adjustment attempt',
      }),
    });
    assert(devGrantRes.status === 403, 'DEVELOPER role strictly prohibited from granting credits (HTTP 403 Forbidden)');

    // 5.6 Unauthenticated request is rejected (HTTP 401 Unauthorized)
    const unauthGrantRes = await fetch(`${baseUrl}/api/admin/credits/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: targetDevUid,
        amount: 5,
        reason: 'Unauthenticated adjustment attempt',
      }),
    });
    assert(unauthGrantRes.status === 401, 'Unauthenticated request rejected with HTTP 401 Unauthorized');

    // Final balance check: 15 + 3 (CEO grant) = 18
    const finalBalance = Number((await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [devUserId])).rows[0].balance);
    assert(finalBalance === 18, `Final balance reconciled exactly at 18 credits (got ${finalBalance})`);

  } catch (err: any) {
    console.error('Test execution error:', err);
    assert(false, 'Test suite crashed', err.message);
  } finally {
    if (server) {
      await new Promise<void>((resolve) => {
        (server as Server).close(() => {
          console.log('\n[Harness] Ephemeral test server closed.');
          resolve();
        });
      });
    }
  }

  // Print Summary
  console.log('\n================================================================');
  console.log('PHASE 7 TEST SUMMARY');
  console.log('================================================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Total tests: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

  if (failed > 0) {
    console.error(`FAILED ${failed} CHECKS.`);
    process.exit(1);
  } else {
    console.log('ALL PHASE 7 ADMIN SINGLE-USER CREDIT GRANT CHECKS PASSED PERFECTLY! ✔\n');
    process.exit(0);
  }
}

runTest();
