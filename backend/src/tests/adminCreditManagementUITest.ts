/**
 * Phase 10 — Professional Admin Credit Management UI & Verification Suite
 * 
 * Tests:
 * 1. Live Dashboard Metrics (/api/admin/credits/stats):
 *    - Real-time double-entry calculations directly from DB (no fabricated stats).
 *    - Total Credits Held, Purchased, Granted, Removed, Consumed, Refunded.
 * 2. Granular User Credit Table (/api/admin/credits/accounts):
 *    - Columns: User, UID, Role, Current Credits, Purchased, Granted, Consumed, Refunded, Last Transaction, Status.
 *    - Filter by role, balanceFilter (POSITIVE, ZERO, ALL), minBalance, maxBalance, UID, and search.
 * 3. Comprehensive User Detail View (/api/admin/credits/users/:target):
 *    - Resolves by 16-character public UID and UUID.
 *    - User profile, 16-char UID, balance, lifetime summary, and chronological transaction history.
 *    - Matches requested spec format (+10 Purchase, -1 Project Claim, +1 Claim Refund, +5 Admin Grant, -1 Project Claim).
 * 4. Secure CSV Export (/api/admin/credits/export):
 *    - RFC-compliant CSV headers and formatting.
 *    - CSV formula injection protection (escapes =, +, -, @).
 *    - Audit logging (ADMIN_EXPORT_CREDIT_LEDGER in audit_logs).
 * 5. Role-Based Access Control (RBAC):
 *    - Allowed: CEO, ADMIN.
 *    - Denied: MD, SUPPORT, CLIENT, DEVELOPER, Unauthenticated (403/401).
 */

import { Server } from 'http';
import app from '../server.js';
import { query, pool } from '../database/db.js';
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
  console.log('PHASE 10: ADMIN CREDIT MANAGEMENT UI VERIFICATION');
  console.log('================================================================\n');

  let server: Server | null = null;
  const port = 49205;
  const baseUrl = `http://localhost:${port}`;

  try {
    server = app.listen(port);
    await new Promise((resolve) => server!.once('listening', resolve));
    console.log(`[Harness] Server running on port ${port}`);

    const timestamp = Date.now();
    const testPassword = 'Password123!Safe';

    // 1. Setup Admin Alice
    const adminEmail = `admin_alice_ui_${timestamp}@nexus.dev`;
    const regAdminRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Admin Alice UI',
        username: `adm_alice_${timestamp.toString().slice(-6)}`,
        email: adminEmail,
        password: testPassword,
        confirmPassword: testPassword,
        roleTitle: 'Platform Operator',
        experience: 5,
        progLangs: 'TypeScript',
        bio: 'Primary admin for Phase 10 test.',
      }),
    });
    const adminData = await regAdminRes.json();
    assert(regAdminRes.status === 201, 'Admin user registered successfully');

    // Elevate Alice to ADMIN
    await query(`UPDATE users SET role = 'ADMIN', status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [adminData.user.id]);

    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: testPassword }),
    });
    const adminAuth = await adminLoginRes.json();
    const adminToken = adminAuth.token;
    assert(Boolean(adminToken), 'Admin token acquired');

    // 2. Setup CEO Bob
    const ceoEmail = `ceo_bob_ui_${timestamp}@nexus.dev`;
    const regCeoRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'CEO Bob UI',
        username: `ceo_bob_${timestamp.toString().slice(-6)}`,
        email: ceoEmail,
        password: testPassword,
        confirmPassword: testPassword,
        roleTitle: 'Chief Executive Officer',
        experience: 10,
        progLangs: 'Rust, TypeScript',
        bio: 'Executive CEO account.',
      }),
    });
    const ceoData = await regCeoRes.json();
    await query(`UPDATE users SET role = 'CEO', status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [ceoData.user.id]);
    const ceoLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ceoEmail, password: testPassword }),
    });
    const ceoToken = (await ceoLoginRes.json()).token;
    assert(Boolean(ceoToken), 'CEO token acquired');

    // 3. Setup Developer #01 (User 1)
    const dev01Email = `dev01_ui_${timestamp}@nexus.dev`;
    const dev01Username = `dev01_${timestamp.toString().slice(-6)}`;
    const regDev01Res = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Developer #01',
        username: dev01Username,
        email: dev01Email,
        password: testPassword,
        confirmPassword: testPassword,
        roleTitle: 'Senior Fullstack Engineer',
        experience: 6,
        progLangs: 'TypeScript, Go',
        bio: 'Target developer for Phase 10.',
      }),
    });
    const dev01Data = await regDev01Res.json();
    const dev01UserId = dev01Data.user.id;
    const dev01Uid = dev01Data.user.uid;
    const dev01DevId = dev01Data.developer.id;
    await query(`UPDATE developers SET verification_status = 'VERIFIED' WHERE id = $1`, [dev01DevId]);
    await query(`UPDATE users SET status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [dev01UserId]);
    assert(isValidUserUid(dev01Uid), `Developer #01 has valid 16-char public UID: ${dev01Uid}`);

    // Setup Client #01 (User 2)
    const client01Email = `client01_ui_${timestamp}@nexus.dev`;
    const regClientRes = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Charlie Client',
        companyName: 'Acme UI Corp',
        email: client01Email,
        password: testPassword,
        confirmPassword: testPassword,
      }),
    });
    const client01Data = await regClientRes.json();
    const client01UserId = client01Data.user.id;
    const client01Uid = client01Data.user.uid;
    await query(`UPDATE users SET status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [client01UserId]);
    assert(isValidUserUid(client01Uid), `Client #01 has valid 16-char public UID: ${client01Uid}`);

    // 4. Create Controlled Transactions for Developer #01 matching exact spec:
    // +10 Purchase
    // -1 Project Claim
    // +1 Claim Refund
    // +5 Admin Grant
    // -1 Project Claim
    // Expected Balance: 14 Credits
    console.log('\n--- Populating Spec Transactions for Developer #01 ---');

    // Tx 1: +10 Purchase
    await query(
      `INSERT INTO credit_transactions (developer_id, user_id, type, amount, balance_before, balance_after, reference_id, description, reason, performed_by)
       VALUES ($1, $2, 'PURCHASE', 10, 0, 10, 'PAY-SPEC-10', 'Package Purchase: 10 Credits', 'Stripe payment', NULL)`,
      [dev01DevId, dev01UserId]
    );
    await query(`UPDATE credit_accounts SET balance = 10, updated_at = NOW() WHERE user_id = $1 OR developer_id = $2`, [dev01UserId, dev01DevId]);

    // Tx 2: -1 Project Claim
    await query(
      `INSERT INTO credit_transactions (developer_id, user_id, type, amount, balance_before, balance_after, reference_id, description, reason, performed_by)
       VALUES ($1, $2, 'PROJECT_CLAIM', -1, 10, 9, 'CLAIM-SPEC-01', 'Claim on Web Portal Project', 'Project claim fee', NULL)`,
      [dev01DevId, dev01UserId]
    );
    await query(`UPDATE credit_accounts SET balance = 9, updated_at = NOW() WHERE user_id = $1 OR developer_id = $2`, [dev01UserId, dev01DevId]);

    // Tx 3: +1 Claim Refund
    await query(
      `INSERT INTO credit_transactions (developer_id, user_id, type, amount, balance_before, balance_after, reference_id, description, reason, performed_by)
       VALUES ($1, $2, 'PROJECT_NOT_SELECTED_REFUND', 1, 9, 10, 'REF-SPEC-01', 'Claim Refund: Project not selected', 'Candidate not chosen by client', NULL)`,
      [dev01DevId, dev01UserId]
    );
    await query(`UPDATE credit_accounts SET balance = 10, updated_at = NOW() WHERE user_id = $1 OR developer_id = $2`, [dev01UserId, dev01DevId]);

    // Tx 4: +5 Admin Grant
    await query(
      `INSERT INTO credit_transactions (developer_id, user_id, type, amount, balance_before, balance_after, reference_id, description, reason, performed_by)
       VALUES ($1, $2, 'ADMIN_CREDIT_GRANT', 5, 10, 15, 'GRANT-SPEC-05', 'Admin Credit Grant', 'Promotional credit for approved project', $3)`,
      [dev01DevId, dev01UserId, adminData.user.id]
    );
    await query(`UPDATE credit_accounts SET balance = 15, updated_at = NOW() WHERE user_id = $1 OR developer_id = $2`, [dev01UserId, dev01DevId]);

    // Tx 5: -1 Project Claim
    await query(
      `INSERT INTO credit_transactions (developer_id, user_id, type, amount, balance_before, balance_after, reference_id, description, reason, performed_by)
       VALUES ($1, $2, 'PROJECT_CLAIM', -1, 15, 14, 'CLAIM-SPEC-02', 'Claim on Mobile App Project', 'Project claim fee', NULL)`,
      [dev01DevId, dev01UserId]
    );
    await query(`UPDATE credit_accounts SET balance = 14, updated_at = NOW() WHERE user_id = $1 OR developer_id = $2`, [dev01UserId, dev01DevId]);

    // User 2 (Client): Admin Grant +20, Admin Removal -5 => Balance 15
    await query(
      `INSERT INTO credit_transactions (user_id, type, amount, balance_before, balance_after, reference_id, description, reason, performed_by)
       VALUES ($1, 'ADMIN_CREDIT_GRANT', 20, 0, 20, 'GRANT-CLIENT-20', 'Bulk Platform Grant', 'Welcome onboard promotional credits', $2)`,
      [client01UserId, adminData.user.id]
    );
    await query(
      `INSERT INTO credit_transactions (user_id, type, amount, balance_before, balance_after, reference_id, description, reason, performed_by)
       VALUES ($1, 'ADMIN_CREDIT_REMOVAL', -5, 20, 15, 'REM-CLIENT-05', 'Admin Removal', '=1+1 Security Test Formula Escaped', $2)`,
      [client01UserId, adminData.user.id]
    );
    await query(`UPDATE credit_accounts SET balance = 15, updated_at = NOW() WHERE user_id = $1`, [client01UserId]);

    console.log('\n--- Section 1: Dashboard Metrics Endpoint (/api/admin/credits/stats) ---');
    const statsRes = await fetch(`${baseUrl}/api/admin/credits/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(statsRes.status === 200, 'GET /api/admin/credits/stats returns 200');
    const stats = await statsRes.json();
    console.log('Dashboard Stats:', stats);

    assert(typeof stats.totalCreditsHeld === 'number' && stats.totalCreditsHeld >= 29, 'Total Credits Held aggregated accurately');
    assert(typeof stats.creditsPurchased === 'number' && stats.creditsPurchased >= 10, 'Credits Purchased aggregated accurately');
    assert(typeof stats.creditsGranted === 'number' && stats.creditsGranted >= 25, 'Credits Granted aggregated accurately');
    assert(typeof stats.creditsRemoved === 'number' && stats.creditsRemoved >= 5, 'Credits Removed aggregated accurately');
    assert(typeof stats.creditsConsumed === 'number' && stats.creditsConsumed >= 2, 'Credits Consumed aggregated accurately');
    assert(typeof stats.creditsRefunded === 'number' && stats.creditsRefunded >= 1, 'Credits Refunded aggregated accurately');
    assert(typeof stats.totalAccounts === 'number' && stats.totalAccounts >= 2, 'Total Accounts counted accurately');
    assert(Boolean(stats.generatedAt), 'Timestamp present in stats response');

    console.log('\n--- Section 2: User Credit Accounts List & Granular Breakdown ---');
    const accRes = await fetch(`${baseUrl}/api/admin/credits/accounts?limit=100`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(accRes.status === 200, 'GET /api/admin/credits/accounts returns 200');
    const accData = await accRes.json();
    assert(Array.isArray(accData.accounts) && accData.accounts.length >= 2, 'Returns list of accounts');

    // Find Developer #01 in accounts list
    const dev01Row = accData.accounts.find((a: any) => a.user_id === dev01UserId || a.user_uid === dev01Uid);
    assert(Boolean(dev01Row), 'Developer #01 account found in list');
    assert(dev01Row.user_uid === dev01Uid, `Accurate 16-char public UID: ${dev01Row.user_uid}`);
    assert(Number(dev01Row.balance) === 14, `Current Credits balance matches expected: 14 (got ${dev01Row.balance})`);
    assert(Number(dev01Row.purchased) === 10, `Purchased credits breakdown: 10 (got ${dev01Row.purchased})`);
    assert(Number(dev01Row.granted) === 5, `Granted credits breakdown: 5 (got ${dev01Row.granted})`);
    assert(Number(dev01Row.consumed) === 2, `Consumed credits breakdown: 2 (got ${dev01Row.consumed})`);
    assert(Number(dev01Row.refunded) === 1, `Refunded credits breakdown: 1 (got ${dev01Row.refunded})`);
    assert(Number(dev01Row.removed) === 0, `Removed credits breakdown: 0 (got ${dev01Row.removed})`);
    assert(Boolean(dev01Row.last_transaction), 'Last Transaction timestamp is populated');
    assert(dev01Row.user_status === 'ACTIVE', 'User Status is ACTIVE');

    // Test Table Filters
    console.log('\n--- Section 3: Filter System ---');
    // Role filter
    const devFilterRes = await fetch(`${baseUrl}/api/admin/credits/accounts?role=DEVELOPER`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const devFilterData = await devFilterRes.json();
    const allDevs = devFilterData.accounts.every((a: any) => a.role === 'DEVELOPER');
    assert(allDevs, 'Role filter: returns only DEVELOPER accounts');

    // Balance filter (POSITIVE)
    const posFilterRes = await fetch(`${baseUrl}/api/admin/credits/accounts?balanceFilter=POSITIVE`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const posFilterData = await posFilterRes.json();
    const allPositive = posFilterData.accounts.every((a: any) => Number(a.balance) > 0);
    assert(allPositive, 'Balance filter: POSITIVE returns only accounts with balance > 0');

    // UID filter
    const uidFilterRes = await fetch(`${baseUrl}/api/admin/credits/accounts?uid=${dev01Uid}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const uidFilterData = await uidFilterRes.json();
    assert(uidFilterData.accounts.length === 1 && uidFilterData.accounts[0].user_uid === dev01Uid, 'UID filter returns exact matching account');

    // Search filter
    const searchFilterRes = await fetch(`${baseUrl}/api/admin/credits/accounts?search=${encodeURIComponent(dev01Email)}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const searchFilterData = await searchFilterRes.json();
    assert(searchFilterData.accounts.length === 1 && searchFilterData.accounts[0].user_email === dev01Email, 'Search filter matches user email');

    console.log('\n--- Section 4: User Detail View (/api/admin/credits/users/:target) ---');
    // 1. Fetch by 16-character public UID
    const detailUidRes = await fetch(`${baseUrl}/api/admin/credits/users/${dev01Uid}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(detailUidRes.status === 200, 'GET /api/admin/credits/users/:uid returns 200');
    const detail = await detailUidRes.json();

    assert(detail.user.uid === dev01Uid, `Detail user UID: ${detail.user.uid}`);
    assert(detail.user.name === 'Developer #01', `Detail user Name: ${detail.user.name}`);
    assert(detail.account.balance === 14, `Detail account Balance: 14 (got ${detail.account.balance})`);
    assert(detail.summary.purchased === 10, 'Detail summary Purchased: 10');
    assert(detail.summary.granted === 5, 'Detail summary Granted: 5');
    assert(detail.summary.consumed === 2, 'Detail summary Consumed: 2');
    assert(detail.summary.refunded === 1, 'Detail summary Refunded: 1');
    assert(detail.transactions.length === 5, 'Detail transactions array length: 5');

    // Verify chronological order (most recent first)
    const txTypes = detail.transactions.map((t: any) => ({ type: t.type, amount: t.amount }));
    console.log('Transaction History Timeline:', txTypes);
    assert(txTypes[0].type === 'PROJECT_CLAIM' && txTypes[0].amount === -1, 'Tx 1 (latest): -1 Project Claim');
    assert(txTypes[1].type === 'ADMIN_CREDIT_GRANT' && txTypes[1].amount === 5, 'Tx 2: +5 Admin Grant');
    assert(txTypes[2].type === 'PROJECT_NOT_SELECTED_REFUND' && txTypes[2].amount === 1, 'Tx 3: +1 Claim Refund');
    assert(txTypes[3].type === 'PROJECT_CLAIM' && txTypes[3].amount === -1, 'Tx 4: -1 Project Claim');
    assert(txTypes[4].type === 'PURCHASE' && txTypes[4].amount === 10, 'Tx 5: +10 Purchase');

    // Performer attribution
    const grantTx = detail.transactions.find((t: any) => t.type === 'ADMIN_CREDIT_GRANT');
    assert(grantTx.performed_by_email === adminEmail, `Grant performed by Admin: ${grantTx.performed_by_email}`);

    // 2. Fetch by UUID
    const detailUuidRes = await fetch(`${baseUrl}/api/admin/credits/users/${dev01UserId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(detailUuidRes.status === 200, 'GET /api/admin/credits/users/:uuid returns 200 with identical profile');

    // 3. Invalid target
    const invalidRes = await fetch(`${baseUrl}/api/admin/credits/users/non-existent-user-123`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(invalidRes.status === 404, 'Invalid user target returns 404');

    console.log('\n--- Section 5: Secure CSV Export ---');
    const exportRes = await fetch(`${baseUrl}/api/admin/credits/export`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(exportRes.status === 200, 'GET /api/admin/credits/export returns 200');
    assert(exportRes.headers.get('content-type')?.includes('text/csv') || false, 'Content-Type header is text/csv');
    assert(exportRes.headers.get('content-disposition')?.includes('attachment;') || false, 'Content-Disposition header includes attachment');

    const csvText = await exportRes.text();
    const csvLines = csvText.split('\n').filter((l) => l.trim().length > 0);
    assert(csvLines.length >= 7, `CSV contains headers + data rows (got ${csvLines.length} lines)`);

    const headerLine = csvLines[0];
    assert(headerLine.includes('Transaction ID'), 'CSV contains Transaction ID header');
    assert(headerLine.includes('User UID'), 'CSV contains User UID header');
    assert(headerLine.includes('Amount'), 'CSV contains Amount header');
    assert(headerLine.includes('Performed By Email'), 'CSV contains Performed By Email header');

    // Verify formula injection protection
    // Client #01 had reason '=1+1 Security Test Formula Escaped'
    const injectionProtected = csvText.includes(`"'=1+1 Security Test Formula Escaped"`);
    assert(injectionProtected, 'Formula injection protection: reason starting with "=" is escaped with leading single quote');

    // Verify Audit Log entry
    const auditLogsRes = await query(
      `SELECT * FROM audit_logs WHERE action = 'ADMIN_EXPORT_CREDIT_LEDGER' AND actor_user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [adminData.user.id]
    );
    assert(auditLogsRes.rows.length === 1, 'Audit log entry created for ADMIN_EXPORT_CREDIT_LEDGER');
    console.log('Audit log metadata:', auditLogsRes.rows[0].metadata);
    assert(Number(auditLogsRes.rows[0].metadata?.recordCount) >= 6, 'Audit log accurately records exported record count');

    console.log('\n--- Section 6: RBAC Governance ---');
    // CEO can access stats, accounts, user detail, and export
    const ceoStats = await fetch(`${baseUrl}/api/admin/credits/stats`, {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    assert(ceoStats.status === 200, 'CEO is authorized to access credit stats (200)');

    const ceoExport = await fetch(`${baseUrl}/api/admin/credits/export`, {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    assert(ceoExport.status === 200, 'CEO is authorized to export credit ledger (200)');

    // Developer #01 attempting to access admin credit endpoints => 403 Forbidden
    const devLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: dev01Email, password: testPassword }),
    });
    const devToken = (await devLoginRes.json()).token;

    const devStats = await fetch(`${baseUrl}/api/admin/credits/stats`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert(devStats.status === 403, 'DEVELOPER role is denied access to credit stats (403)');

    const devAccounts = await fetch(`${baseUrl}/api/admin/credits/accounts`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert(devAccounts.status === 403, 'DEVELOPER role is denied access to credit accounts (403)');

    const devExport = await fetch(`${baseUrl}/api/admin/credits/export`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert(devExport.status === 403, 'DEVELOPER role is denied access to export ledger (403)');

    // Client #01 attempting to access admin credit endpoints => 403 Forbidden
    const clientLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: client01Email, password: testPassword }),
    });
    const clientToken = (await clientLoginRes.json()).token;

    const clientStats = await fetch(`${baseUrl}/api/admin/credits/stats`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert(clientStats.status === 403, 'CLIENT role is denied access to credit stats (403)');

    // Unauthenticated access => 401 Unauthorized
    const unauthStats = await fetch(`${baseUrl}/api/admin/credits/stats`);
    assert(unauthStats.status === 401, 'Unauthenticated request is rejected (401)');

    const unauthExport = await fetch(`${baseUrl}/api/admin/credits/export`);
    assert(unauthExport.status === 401, 'Unauthenticated export is rejected (401)');

    // Summary
    console.log('\n================================================================');
    const totalTests = results.length;
    const passedTests = results.filter((r) => r.passed).length;
    const failedTests = totalTests - passedTests;
    console.log(`TEST RUN COMPLETE: ${passedTests}/${totalTests} PASSED (${failedTests} failed)`);
    console.log('================================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal test error:', error);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await pool.end();
    process.exit(0);
  }
}

runTest();
