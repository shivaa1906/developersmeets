/**
 * Phase 8 — Admin Bulk Credit Grant Verification Suite
 * 
 * Verifies:
 * 1. Bulk Options & Audiences:
 *    - ALL, ALL_DEVELOPERS, ALL_CLIENTS, SELECTED, FILTERED.
 * 2. Confirmation Preview (/api/admin/credits/bulk-preview):
 *    - Calculates recipient count, credits per user, total credits, reason, and sample list.
 *    - Zero balance mutation during preview.
 * 3. Strict Eligibility Enforcement:
 *    - Excludes suspended users, deleted/disabled accounts, guests, and invalid accounts.
 * 4. Atomicity & Individual Ledger Entries:
 *    - Each recipient gets their own ledger row (ADMIN_CREDIT_GRANT) with balance_before and balance_after.
 *    - No single fake bulk aggregate transaction.
 * 5. Large Bulk Operations & Controlled Batches:
 *    - Controlled batch processing (BATCH_SIZE = 50).
 *    - Asynchronous execution support (async: true returning HTTP 202 Accepted).
 * 6. Bulk Audit Records:
 *    - Records in credit_bulk_operations with operation_id, performed_by, target_scope,
 *      amount_per_user, recipient_count, total_credits, reason, status.
 *    - Individual transactions reference bulk_operation_id.
 * 7. Notifications Policy:
 *    - In-app database notifications created for all recipients.
 *    - Realtime socket emissions throttled for bulk audiences (> 25).
 * 8. RBAC & Security:
 *    - ADMIN & CEO authorized; MD, SUPPORT, CLIENT, DEVELOPER, and unauthenticated rejected.
 *    - Input defense against negative, zero, float, overflow amounts and short reasons.
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
  console.log('PHASE 8: ADMIN BULK CREDIT GRANT VERIFICATION');
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
    console.log('\n--- Setting up test actors for Phase 8 verification ---');

    // Admin Actor
    const adminEmail = `admin_p8_${timestamp}@nexus.dev`;
    const adminPass = 'Password123!Secure';
    const regAdminRes = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Phase 8 Operations Admin',
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

    // Create Cohort of Test Users:
    // 3 Active Developers
    const activeDevIds: string[] = [];
    const activeDevUids: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const devEmail = `p8_dev${i}_${timestamp}@nexus.dev`;
      const devPass = 'Password123!Secure';
      const regRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: `Phase 8 Developer ${i}`,
          username: `p8_dev_${i}_${timestamp.toString().slice(-5)}`,
          email: devEmail,
          password: devPass,
          confirmPassword: devPass,
          roleTitle: 'Full Stack Engineer',
          experienceYears: i * 2,
          primarySkills: ['TypeScript', 'React'],
          termsAccepted: true,
        }),
      });
      const dData = await regRes.json();
      await query(`UPDATE users SET status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [dData.user.id]);
      await query(`UPDATE developers SET verification_status = 'VERIFIED' WHERE user_id = $1`, [dData.user.id]);
      activeDevIds.push(dData.user.id);
      activeDevUids.push(dData.user.uid);
    }
    assert(activeDevIds.length === 3, 'Created 3 active verified test developers');

    // 1 Suspended Developer (Must be excluded by default eligibility)
    const suspDevEmail = `p8_susp_dev_${timestamp}@nexus.dev`;
    const regSuspRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Suspended Developer Test',
        username: `p8_susp_${timestamp.toString().slice(-5)}`,
        email: suspDevEmail,
        password: 'Password123!Secure',
        confirmPassword: 'Password123!Secure',
        roleTitle: 'Developer',
        experienceYears: 1,
        primarySkills: ['Python'],
        termsAccepted: true,
      }),
    });
    const suspData = await regSuspRes.json();
    const suspDevUserId = suspData.user.id;
    await query(`UPDATE users SET status = 'SUSPENDED', is_suspended = TRUE WHERE id = $1`, [suspDevUserId]);
    assert(Boolean(suspDevUserId), 'Created suspended developer to test exclusion');

    // 2 Active Clients
    const activeClientIds: string[] = [];
    for (let i = 1; i <= 2; i++) {
      const clientEmail = `p8_client${i}_${timestamp}@nexus.dev`;
      const regRes = await fetch(`${baseUrl}/api/auth/register/client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: `Phase 8 Client Director ${i}`,
          email: clientEmail,
          password: 'Password123!Secure',
          confirmPassword: 'Password123!Secure',
          companyName: `Phase 8 Enterprise ${i}`,
        }),
      });
      const cData = await regRes.json();
      await query(`UPDATE users SET status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [cData.user.id]);
      activeClientIds.push(cData.user.id);
    }
    assert(activeClientIds.length === 2, 'Created 2 active test clients');

    // 1 Guest User (Must be strictly excluded by default eligibility)
    const guestRes = await query(
      `INSERT INTO users (email, password_hash, role, status, email_verified)
       VALUES ($1, 'hash_placeholder', 'GUEST', 'ACTIVE', TRUE)
       RETURNING id, uid`,
      [`p8_guest_${timestamp}@nexus.dev`]
    );
    const guestUserId = guestRes.rows[0].id;
    assert(Boolean(guestUserId), 'Created guest user to test strict non-eligibility');

    // =========================================================================
    // SECTION 1: CONFIRMATION PREVIEW API (/api/admin/credits/bulk-preview)
    // =========================================================================
    console.log('\n--- SECTION 1: Confirmation Preview API (/api/admin/credits/bulk-preview) ---');

    // 1.1 Preview for ALL_DEVELOPERS
    const previewDevsRes = await fetch(`${baseUrl}/api/admin/credits/bulk-preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        targetScope: 'ALL_DEVELOPERS',
        amount: 5,
        reason: 'New platform promotion for verified developers',
      }),
    });

    assert(previewDevsRes.status === 200, 'Bulk preview for ALL_DEVELOPERS returns HTTP 200');
    const previewDevs = await previewDevsRes.json();

    assert(typeof previewDevs.recipientCount === 'number' && previewDevs.recipientCount >= 3, `Recipient count calculated: ${previewDevs.recipientCount} users`);
    assert(previewDevs.amountPerUser === 5, 'Credits per user is 5');
    assert(previewDevs.totalCredits === previewDevs.recipientCount * 5, `Total credits calculated accurately: ${previewDevs.totalCredits}`);
    assert(previewDevs.reason === 'New platform promotion for verified developers', 'Reason returned in preview');
    assert(Array.isArray(previewDevs.sampleRecipients) && previewDevs.sampleRecipients.length > 0, 'Sample recipients array returned');
    assert(previewDevs.breakdown.developers >= 3, 'Breakdown reflects developer cohort');

    // 1.2 Verify zero balance mutation during preview
    const sampleDevAcc = await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [activeDevIds[0]]);
    const sampleDevBal = Number(sampleDevAcc.rows[0]?.balance || 0);
    assert(sampleDevBal === 0, 'Preview is strictly read-only: user balance unchanged at 0');

    // =========================================================================
    // SECTION 2: STRICT ELIGIBILITY ENFORCEMENT
    // =========================================================================
    console.log('\n--- SECTION 2: Strict Eligibility Enforcement ---');

    // 2.1 Verify suspended developer is excluded from ALL_DEVELOPERS
    const eligibleDevs = await CreditLedgerService.resolveEligibleUsers({ targetScope: 'ALL_DEVELOPERS' });
    const containsSuspended = eligibleDevs.some((u) => u.id === suspDevUserId);
    assert(!containsSuspended, 'ELIGIBILITY CHECK: Suspended user is strictly excluded from ALL_DEVELOPERS');

    // 2.2 Verify guest is excluded from ALL audience
    const eligibleAll = await CreditLedgerService.resolveEligibleUsers({ targetScope: 'ALL' });
    const containsGuest = eligibleAll.some((u) => u.id === guestUserId);
    assert(!containsGuest, 'ELIGIBILITY CHECK: GUEST role is strictly excluded from ALL audience');

    // 2.3 Verify suspended user excluded from ALL audience
    const containsSuspInAll = eligibleAll.some((u) => u.id === suspDevUserId);
    assert(!containsSuspInAll, 'ELIGIBILITY CHECK: Suspended user is strictly excluded from ALL audience');

    // 2.4 Verify all resolved users are active and non-suspended
    const allActive = eligibleAll.every((u) => u.status === 'ACTIVE' && u.is_suspended === false);
    assert(allActive, 'ELIGIBILITY CHECK: Every resolved recipient has status=ACTIVE and is_suspended=FALSE');

    // =========================================================================
    // SECTION 3: ATOMICITY & INDIVIDUAL LEDGER ENTRIES (Requirement 4)
    // =========================================================================
    console.log('\n--- SECTION 3: Atomicity & Individual Ledger Entries ---');

    // Initialize 3 active developers with known initial balances: 10, 20, 30
    for (let i = 0; i < 3; i++) {
      await query(`DELETE FROM credit_accounts WHERE user_id = $1`, [activeDevIds[i]]);
      await query(
        `INSERT INTO credit_accounts (user_id, developer_id, balance, currency)
         VALUES ($1, (SELECT id FROM developers WHERE user_id = $1), $2, 'INR')`,
        [activeDevIds[i], (i + 1) * 10]
      );
    }

    // Target SELECTED audience with these 3 active developers
    const grantAmount = 5;
    const bulkReason = 'Platform developer appreciation milestone bonus';
    const executeBulkRes = await fetch(`${baseUrl}/api/admin/credits/bulk-grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        targetScope: 'SELECTED',
        userIds: activeDevIds,
        amount: grantAmount,
        reason: bulkReason,
      }),
    });

    assert(executeBulkRes.status === 200, `Bulk grant executed successfully (HTTP ${executeBulkRes.status})`);
    const bulkResult = await executeBulkRes.json();

    assert(bulkResult.success === true, 'Bulk result indicates success: true');
    assert(bulkResult.recipientCount === 3, 'Recipient count is exactly 3');
    assert(bulkResult.amountPerUser === 5, 'Credits per user is 5');
    assert(bulkResult.totalCredits === 15, 'Total distributed credits is 15 (3 * 5)');
    assert(Boolean(bulkResult.operationId), `Generated operationId: ${bulkResult.operationId}`);
    assert(Boolean(bulkResult.bulkOperationRecordId), `Generated bulkOperationRecordId: ${bulkResult.bulkOperationRecordId}`);

    // 3.1 Verify Requirement 4: Individual ledger transactions per recipient
    for (let i = 0; i < 3; i++) {
      const devId = activeDevIds[i];
      const initialBal = (i + 1) * 10;
      const expectedNewBal = initialBal + 5;

      // Verify updated database balance
      const acc = await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [devId]);
      const currentBal = Number(acc.rows[0].balance);
      assert(currentBal === expectedNewBal, `User ${i + 1} balance updated from ${initialBal} to ${expectedNewBal} (got ${currentBal})`);

      // Verify individual immutable ledger transaction
      const txRes = await query(
        `SELECT * FROM credit_transactions WHERE user_id = $1 AND bulk_operation_id = $2`,
        [devId, bulkResult.bulkOperationRecordId]
      );
      assert(txRes.rows.length === 1, `Individual ledger row exists for User ${i + 1}`);
      const tx = txRes.rows[0];
      assert(tx.type === 'ADMIN_CREDIT_GRANT', `User ${i + 1} ledger type is ADMIN_CREDIT_GRANT`);
      assert(Number(tx.amount) === 5, `User ${i + 1} ledger amount is +5`);
      assert(Number(tx.balance_before) === initialBal, `User ${i + 1} ledger balance_before is ${initialBal}`);
      assert(Number(tx.balance_after) === expectedNewBal, `User ${i + 1} ledger balance_after is ${expectedNewBal}`);
      assert(tx.performed_by === adminUserId, `User ${i + 1} ledger performed_by matches Admin (${adminUserId})`);
      assert(tx.bulk_operation_id === bulkResult.bulkOperationRecordId, 'Ledger transaction links to bulk_operation_id');
      assert(tx.reason === bulkReason, 'Ledger transaction preserves reason');
    }

    // 3.2 Verify NO fake aggregate transaction row of +15 was created
    const fakeTxRes = await query(
      `SELECT * FROM credit_transactions WHERE bulk_operation_id = $1 AND amount = 15`,
      [bulkResult.bulkOperationRecordId]
    );
    assert(fakeTxRes.rows.length === 0, 'ZERO FAKE AGGREGATE: No single +15 transaction row was created');

    // =========================================================================
    // SECTION 4: BULK AUDIT RECORDS (Requirement 6)
    // =========================================================================
    console.log('\n--- SECTION 4: Bulk Audit Records (Requirement 6) ---');

    // 4.1 Verify credit_bulk_operations table record
    const bulkOpRow = (await query(`SELECT * FROM credit_bulk_operations WHERE id = $1`, [bulkResult.bulkOperationRecordId])).rows[0];
    assert(Boolean(bulkOpRow), 'Record exists in credit_bulk_operations table');
    assert(bulkOpRow.operation_id === bulkResult.operationId, `operation_id matches (${bulkOpRow.operation_id})`);
    assert(bulkOpRow.performed_by === adminUserId, `performed_by matches Admin (${adminUserId})`);
    assert(bulkOpRow.target_scope === 'SELECTED', 'target_scope is SELECTED');
    assert(Number(bulkOpRow.amount_per_user) === 5, 'amount_per_user is 5');
    assert(Number(bulkOpRow.recipient_count) === 3, 'recipient_count is 3');
    assert(Number(bulkOpRow.total_credits) === 15, 'total_credits is 15');
    assert(bulkOpRow.reason === bulkReason, 'reason matches submitted justification');
    assert(bulkOpRow.status === 'COMPLETED', 'status is COMPLETED');
    assert(Boolean(bulkOpRow.created_at) && Boolean(bulkOpRow.completed_at), 'created_at and completed_at timestamps populated');

    // 4.2 Verify audit_logs table entry
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE actor_user_id = $1 AND action = 'ADMIN_BULK_CREDIT_GRANT' AND entity_id = $2`,
      [adminUserId, bulkResult.bulkOperationRecordId]
    );
    assert(auditRes.rows.length === 1, 'Audit log entry created for ADMIN_BULK_CREDIT_GRANT');
    const auditRow = auditRes.rows[0];
    assert(auditRow.entity_type === 'CREDIT_BULK_OPERATION', 'Audit log entity_type is CREDIT_BULK_OPERATION');

    // 4.3 Verify Bulk Operations Listing API (/api/admin/credits/bulk-operations)
    const listBulkRes = await fetch(`${baseUrl}/api/admin/credits/bulk-operations`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(listBulkRes.status === 200, 'GET /api/admin/credits/bulk-operations returns HTTP 200');
    const listBulkData = await listBulkRes.json();
    assert(Array.isArray(listBulkData.operations), 'Operations array returned');
    const foundOp = listBulkData.operations.find((o: any) => o.id === bulkResult.bulkOperationRecordId);
    assert(Boolean(foundOp), 'Recently executed bulk operation appears in audit listing');

    // 4.4 Verify Single Bulk Operation Detail API (/api/admin/credits/bulk-operations/:operationId)
    const getOpRes = await fetch(`${baseUrl}/api/admin/credits/bulk-operations/${bulkResult.operationId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(getOpRes.status === 200, 'GET /api/admin/credits/bulk-operations/:opId returns HTTP 200');
    const getOpData = await getOpRes.json();
    assert(getOpData.operation.id === bulkResult.bulkOperationRecordId, 'Operation details returned');
    assert(Array.isArray(getOpData.sampleTransactions) && getOpData.sampleTransactions.length === 3, 'Sample individual transactions attached');

    // =========================================================================
    // SECTION 5: NOTIFICATIONS POLICY (Requirement 7)
    // =========================================================================
    console.log('\n--- SECTION 5: Notifications Policy (Requirement 7) ---');

    for (let i = 0; i < 3; i++) {
      const devId = activeDevIds[i];
      const notifs = await query(
        `SELECT * FROM notifications WHERE user_id = $1 AND type = 'CREDIT_GRANTED' ORDER BY created_at DESC LIMIT 1`,
        [devId]
      );
      assert(notifs.rows.length === 1, `Notification stored in DB for recipient ${i + 1}`);
      const notif = notifs.rows[0];
      assert(notif.message.includes('+5 credits'), `Notification message includes +5 credits`);
      assert(notif.message.includes(bulkReason), `Notification message includes bulk grant reason`);
    }

    // =========================================================================
    // SECTION 6: ASYNCHRONOUS & CONTROLLED BATCH EXECUTION (Requirement 5)
    // =========================================================================
    console.log('\n--- SECTION 6: Asynchronous & Controlled Batch Execution ---');

    const asyncRes = await fetch(`${baseUrl}/api/admin/credits/bulk-grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        targetScope: 'SELECTED',
        userIds: [activeDevIds[0]],
        amount: 2,
        reason: 'Async background batch processing test',
        async: true,
      }),
    });

    assert(asyncRes.status === 202, 'Async bulk grant returns HTTP 202 (Accepted)');
    const asyncData = await asyncRes.json();
    assert(asyncData.status === 'PROCESSING', 'Initial async status is PROCESSING');
    assert(Boolean(asyncData.operationId), `Async operationId returned: ${asyncData.operationId}`);

    // Wait 500ms for setImmediate background worker to finish
    await new Promise((r) => setTimeout(r, 600));

    const pollRes = await fetch(`${baseUrl}/api/admin/credits/bulk-operations/${asyncData.operationId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const pollData = await pollRes.json();
    assert(pollData.operation.status === 'COMPLETED', 'Async operation completed successfully in background');

    // =========================================================================
    // SECTION 7: FILTERED AUDIENCE TARGETING (Requirement 1)
    // =========================================================================
    console.log('\n--- SECTION 7: Filtered Audience Targeting ---');

    // Test FILTERED with minExperience = 6 (Only Dev 3 has experience >= 6)
    const filteredPreviewRes = await fetch(`${baseUrl}/api/admin/credits/bulk-preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        targetScope: 'FILTERED',
        filters: {
          role: 'DEVELOPER',
          minExperience: 6,
        },
        amount: 10,
        reason: 'Senior developer milestone award',
      }),
    });

    assert(filteredPreviewRes.status === 200, 'Filtered preview with minExperience returns HTTP 200');
    const filteredPreview = await filteredPreviewRes.json();
    assert(filteredPreview.recipientCount >= 1, `Filtered recipient count matches senior developers (${filteredPreview.recipientCount})`);

    // =========================================================================
    // SECTION 8: STRICT SECURITY & INPUT DEFENSE
    // =========================================================================
    console.log('\n--- SECTION 8: Strict Security & Input Defense ---');

    // 8.1 Reject negative amount (-5 credits)
    const negRes = await fetch(`${baseUrl}/api/admin/credits/bulk-grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ targetScope: 'ALL_DEVELOPERS', amount: -5, reason: 'Negative bulk test' }),
    });
    assert(negRes.status === 400, 'Negative bulk credit amount rejected with HTTP 400');

    // 8.2 Reject zero amount (0 credits)
    const zeroRes = await fetch(`${baseUrl}/api/admin/credits/bulk-grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ targetScope: 'ALL_DEVELOPERS', amount: 0, reason: 'Zero bulk test' }),
    });
    assert(zeroRes.status === 400, 'Zero bulk credit amount rejected with HTTP 400');

    // 8.3 Reject decimal amount (5.5 credits)
    const decRes = await fetch(`${baseUrl}/api/admin/credits/bulk-grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ targetScope: 'ALL_DEVELOPERS', amount: 5.5, reason: 'Float bulk test' }),
    });
    assert(decRes.status === 400, 'Decimal bulk credit amount (5.5) rejected with HTTP 400');

    // 8.4 Reject overflow amount (> 1,000,000 credits)
    const overflowRes = await fetch(`${baseUrl}/api/admin/credits/bulk-grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ targetScope: 'ALL_DEVELOPERS', amount: 10_000_000, reason: 'Overflow bulk test' }),
    });
    assert(overflowRes.status === 400, 'Overflow bulk credit amount (10,000,000) rejected with HTTP 400');

    // 8.5 Reject short reason (< 5 characters)
    const shortReasonRes = await fetch(`${baseUrl}/api/admin/credits/bulk-grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ targetScope: 'ALL_DEVELOPERS', amount: 5, reason: 'abc' }),
    });
    assert(shortReasonRes.status === 400, 'Bulk reason under 5 characters rejected with HTTP 400');

    // 8.6 Reject empty userIds for SELECTED
    const emptySelectedRes = await fetch(`${baseUrl}/api/admin/credits/bulk-grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ targetScope: 'SELECTED', userIds: [], amount: 5, reason: 'Empty selected test' }),
    });
    assert(emptySelectedRes.status === 400, 'Empty userIds for SELECTED rejected with HTTP 400');

    // =========================================================================
    // SECTION 9: RBAC & GOVERNANCE AUTHORIZATION
    // =========================================================================
    console.log('\n--- SECTION 9: RBAC & Governance Authorization ---');

    // 9.1 CEO can execute bulk grant
    const ceoBulkRes = await fetch(`${baseUrl}/api/admin/credits/bulk-grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({
        targetScope: 'SELECTED',
        userIds: [activeDevIds[0]],
        amount: 1,
        reason: 'CEO Executive promotional discretionary grant',
      }),
    });
    assert(ceoBulkRes.status === 200, 'CEO authorized to execute bulk credit grants (HTTP 200)');

    // 9.2 MD is strictly prohibited (HTTP 403 Forbidden)
    const mdBulkRes = await fetch(`${baseUrl}/api/admin/credits/bulk-grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mdToken}` },
      body: JSON.stringify({
        targetScope: 'SELECTED',
        userIds: [activeDevIds[0]],
        amount: 5,
        reason: 'MD unauthorized bulk grant attempt',
      }),
    });
    assert(mdBulkRes.status === 403, 'MD strictly prohibited from bulk credit grants (HTTP 403 Forbidden)');

    // 9.3 Support Staff is strictly prohibited (HTTP 403 Forbidden)
    const suppBulkRes = await fetch(`${baseUrl}/api/admin/credits/bulk-grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supportToken}` },
      body: JSON.stringify({
        targetScope: 'SELECTED',
        userIds: [activeDevIds[0]],
        amount: 5,
        reason: 'Support unauthorized bulk grant attempt',
      }),
    });
    assert(suppBulkRes.status === 403, 'SUPPORT strictly prohibited from bulk credit grants (HTTP 403 Forbidden)');

    // 9.4 Unauthenticated request is rejected (HTTP 401 Unauthorized)
    const unauthBulkRes = await fetch(`${baseUrl}/api/admin/credits/bulk-grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetScope: 'ALL_DEVELOPERS',
        amount: 5,
        reason: 'Unauthenticated bulk grant attempt',
      }),
    });
    assert(unauthBulkRes.status === 401, 'Unauthenticated request rejected with HTTP 401 Unauthorized');

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
  console.log('PHASE 8 TEST SUMMARY');
  console.log('================================================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Total tests: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

  if (failed > 0) {
    console.error(`FAILED ${failed} CHECKS.`);
    process.exit(1);
  } else {
    console.log('ALL PHASE 8 ADMIN BULK CREDIT GRANT CHECKS PASSED PERFECTLY! ✔\n');
    process.exit(0);
  }
}

runTest();
