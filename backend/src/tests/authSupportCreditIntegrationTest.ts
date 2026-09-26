/**
 * Phase 11 — Authentication + Support + Credit Integration Test Suite
 * 
 * Tests the complete tripartite ecosystem connection:
 * Authentication -> User UID + Role -> Support Ticket Identity -> Credit Wallet Governance
 * 
 * 1. CLIENT:
 *    - Client login returns permanent 16-character public UID and role CLIENT.
 *    - Client creates support ticket: ticket internally references authenticated client identity.
 *    - Ticket queries return created_by_uid (16-char), created_by_role, and created_by_name.
 *    - Client does not see or have access to developer claim-credit tools (HTTP 403 on /balance, /ledger, /claim).
 * 
 * 2. DEVELOPER:
 *    - Developer login returns permanent 16-character public UID and role DEVELOPER.
 *    - Developer queries wallet balance: identity strictly sourced from JWT session.
 *    - IDOR prevention: query params like ?userId=... or ?developerId=... are ignored.
 *    - Credit balance strictly controls project claim eligibility (-1 Credit with ledger entry including user_id and balance_before).
 *    - Insufficient credit check: claim rejected when balance < claim_cost.
 * 
 * 3. SUPPORT:
 *    - Support user login returns permanent 16-character public UID and role SUPPORT.
 *    - Support sees support queue, tickets, and bridges with creator UID and role.
 *    - Support must NOT automatically receive credit-management permissions (HTTP 403 on admin credit routes).
 * 
 * 4. ADMIN:
 *    - Admin sees users, developers, clients, projects, support, credits, payments, and audit logs.
 *    - Admin can grant credits: records ledger entry with balance_before, balance_after, reason, and performed_by.
 * 
 * 5. DATA INTEGRITY:
 *    - Credit accounts and transactions are linked to users.id and users.uid.
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
  console.log('PHASE 11: AUTH + SUPPORT + CREDIT INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  let server: Server | null = null;
  const port = 49206;
  const baseUrl = `http://localhost:${port}`;

  try {
    server = app.listen(port);
    await new Promise((resolve) => server!.once('listening', resolve));
    console.log(`[Harness] Server listening on port ${port}`);

    const timestamp = Date.now();

    // -------------------------------------------------------------
    // SETUP TEST IDENTITIES
    // -------------------------------------------------------------
    console.log('\n--- 1. Provisioning Test Identities (Client, Developer, Support, Admin) ---');

    // 1a. Client
    const clientEmail = `client.p11.${timestamp}@example.com`;
    const clientRegRes = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: clientEmail,
        password: 'Password123!',
        companyName: 'Acme Phase 11 Corp',
        privateName: 'Alice Client',
        phone: '+1-555-0111',
      }),
    });
    const clientData = await clientRegRes.json();
    assert(clientRegRes.status === 201 && clientData.token, 'Client registered successfully with JWT');
    assert(isValidUserUid(clientData.user?.uid), `Client received valid 16-char UID: ${clientData.user?.uid}`);
    assert(clientData.user?.role === 'CLIENT', 'Client role is CLIENT');
    const clientToken = clientData.token;
    const clientUserId = clientData.user?.id || clientData.user?.userId;
    const clientUid = clientData.user?.uid;
    const clientId = clientData.user?.clientId;

    // 1b. Developer
    const devEmail = `dev.p11.${timestamp}@example.com`;
    const devRegRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: devEmail,
        password: 'Password123!',
        fullName: 'Bob Developer',
        username: `bobdev_${timestamp}`,
        roleTitle: 'Senior Full Stack Engineer',
        skills: 'TypeScript, Node.js, React, PostgreSQL',
        experience: 5,
        location: 'San Francisco, CA',
        phone: '+1-555-0222',
        bio: 'Senior full-stack engineer experienced in distributed systems.',
      }),
    });
    const devData = await devRegRes.json();
    assert(devRegRes.status === 201 && devData.developer, 'Developer registered successfully (201 Created)');
    assert(isValidUserUid(devData.user?.uid), `Developer received valid 16-char UID: ${devData.user?.uid}`);
    assert(devData.user?.role === 'DEVELOPER', 'Developer role is DEVELOPER');
    const devUserId = devData.user?.id;
    const devUid = devData.user?.uid;
    const devId = devData.developer?.id;

    // Verify developer and activate account
    await query(`UPDATE developers SET verification_status = 'VERIFIED' WHERE id = $1`, [devId]);
    await query(`UPDATE users SET status = 'ACTIVE' WHERE id = $1`, [devUserId]);

    // Developer Login to obtain JWT
    const devLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: devEmail, password: 'Password123!' }),
    });
    const devLoginData = await devLoginRes.json();
    assert(devLoginRes.status === 200 && devLoginData.token, 'Developer logged in and received JWT');
    const devToken = devLoginData.token;

    // Give developer initial credit balance of 5
    const existingAcc = await query(
      `SELECT id FROM credit_accounts WHERE user_id = $1 OR developer_id = $2`,
      [devUserId, devId]
    );
    if (existingAcc.rows.length > 0) {
      await query(`UPDATE credit_accounts SET balance = 5, user_id = $1 WHERE id = $2`, [devUserId, existingAcc.rows[0].id]);
    } else {
      await query(
        `INSERT INTO credit_accounts (user_id, developer_id, balance, currency) VALUES ($1, $2, 5, 'INR')`,
        [devUserId, devId]
      );
    }

    // 1c. Support
    const supportEmail = `support.p11.${timestamp}@example.com`;
    const supportUserRes = await query(
      `INSERT INTO users (email, password_hash, role, status, email_verified)
       VALUES ($1, 'hashed_pw', 'SUPPORT', 'ACTIVE', true)
       RETURNING id, uid, role`,
      [supportEmail]
    );
    const supportUserId = supportUserRes.rows[0].id;
    const supportUid = supportUserRes.rows[0].uid;
    assert(isValidUserUid(supportUid), `Support specialist received valid 16-char UID: ${supportUid}`);

    // Create support staff profile with ticket view permissions
    await query(
      `INSERT INTO support_staff (user_id, title, department, status, permissions)
       VALUES ($1, 'L1 Support Engineer', 'Technical Support', 'AVAILABLE', $2)`,
      [supportUserId, JSON.stringify(['SUPPORT_VIEW_ALL_TICKETS', 'SUPPORT_RESPOND'])]
    );

    // Generate JWT for support user
    const jwt = (await import('jsonwebtoken')).default;
    const { env } = await import('../config/environment.js');
    const supportToken = jwt.sign(
      { userId: supportUserId, email: supportEmail, role: 'SUPPORT' },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 1d. Admin (CEO / Admin)
    const adminUserRes = await query(
      `SELECT id, uid, email, role FROM users WHERE role = 'ADMIN' OR role = 'CEO' ORDER BY role = 'CEO' DESC LIMIT 1`
    );
    let adminToken: string;
    let adminUserId: string;
    let adminUid: string;
    if (adminUserRes.rows.length > 0) {
      adminUserId = adminUserRes.rows[0].id;
      adminUid = adminUserRes.rows[0].uid;
      adminToken = jwt.sign(
        { userId: adminUserId, email: adminUserRes.rows[0].email, role: adminUserRes.rows[0].role },
        env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    } else {
      const newAdmin = await query(
        `INSERT INTO users (email, password_hash, role, status, email_verified)
         VALUES ($1, 'hashed_pw', 'ADMIN', 'ACTIVE', true)
         RETURNING id, uid, role`,
        [`admin.p11.${timestamp}@example.com`]
      );
      adminUserId = newAdmin.rows[0].id;
      adminUid = newAdmin.rows[0].uid;
      adminToken = jwt.sign(
        { userId: adminUserId, email: `admin.p11.${timestamp}@example.com`, role: 'ADMIN' },
        env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    }
    assert(isValidUserUid(adminUid), `Admin has valid 16-char UID: ${adminUid}`);

    // -------------------------------------------------------------
    // TEST SECTION 2: CLIENT IDENTITY & SUPPORT TICKET GOVERNANCE
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Client Ticket Creation and Creator Identity ---');

    // Create a client project
    const projRes = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline,
         requirements, required_technologies,
         status, claim_cost, max_claims, claim_deadline, client_id
       )
       VALUES (
         $1, $2, $3, 'Phase 11 Platform Integration Project Description', 'Full-Stack Development',
         50000, 80000, '30-45 days',
         '["TypeScript", "Node.js"]'::jsonb, '["TypeScript", "Node.js"]'::jsonb,
         'OPEN_FOR_CLAIMS', 1, 3, NOW() + INTERVAL '7 days', $4
       )
       RETURNING id, project_number`,
      [`PRJ-P11-${timestamp}`, `prj-p11-${timestamp}`, `Phase 11 Project ${timestamp}`, clientId]
    );
    const projectId = projRes.rows[0].id;

    // Client creates a support ticket
    const ticketCreateRes = await fetch(`${baseUrl}/api/support/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clientToken}`,
      },
      body: JSON.stringify({
        projectId,
        subject: 'Database schema inquiry for Phase 11',
        description: 'Need assistance with Postgres database index tuning for high load.',
        priority: 'NORMAL',
        category: 'TECHNICAL',
      }),
    });
    const ticketData = await ticketCreateRes.json();
    assert(ticketCreateRes.status === 201 && ticketData.ticket, 'Client successfully created support ticket');
    const createdTicket = ticketData.ticket;
    const ticketId = createdTicket.id;

    assert(createdTicket.created_by_user_id === clientUserId, 'Ticket internally references authenticated client user ID');
    assert(createdTicket.created_by_uid === clientUid, `Ticket exposes creator public UID (${clientUid})`);
    assert(createdTicket.created_by_role === 'CLIENT', 'Ticket exposes creator role as CLIENT');
    assert(Boolean(createdTicket.created_by_name), `Ticket exposes creator name: ${createdTicket.created_by_name}`);

    // Client fetches their tickets
    const clientTicketsRes = await fetch(`${baseUrl}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    const clientTicketsData = await clientTicketsRes.json();
    assert(clientTicketsRes.status === 200, 'Client can fetch their support tickets');
    const foundClientTicket = clientTicketsData.tickets.find((t: any) => t.id === ticketId);
    assert(Boolean(foundClientTicket), 'Client sees their created ticket in ticket list');
    assert(foundClientTicket?.created_by_uid === clientUid, 'Ticket in list contains creator 16-char UID');
    assert(foundClientTicket?.created_by_role === 'CLIENT', 'Ticket in list contains creator role CLIENT');

    // -------------------------------------------------------------
    // TEST SECTION 3: CLIENT EXCLUSION FROM DEVELOPER CREDIT TOOLS
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Client Exclusion from Developer Claim-Credit Tools ---');

    // Client calling /api/credits/balance
    const clientBalanceRes = await fetch(`${baseUrl}/api/credits/balance`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert(
      clientBalanceRes.status === 403,
      `Client calling /api/credits/balance is rejected with HTTP 403 Forbidden (got ${clientBalanceRes.status})`
    );

    // Client calling /api/credits/ledger
    const clientLedgerRes = await fetch(`${baseUrl}/api/credits/ledger`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert(
      clientLedgerRes.status === 403,
      `Client calling /api/credits/ledger is rejected with HTTP 403 Forbidden (got ${clientLedgerRes.status})`
    );

    // Client calling /api/credits/purchase
    const clientPurchaseRes = await fetch(`${baseUrl}/api/credits/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clientToken}`,
      },
      body: JSON.stringify({ packageId: 'pkg_starter' }),
    });
    assert(
      clientPurchaseRes.status === 403,
      `Client calling /api/credits/purchase is rejected with HTTP 403 Forbidden (got ${clientPurchaseRes.status})`
    );

    // Client calling project claim endpoint
    const clientClaimRes = await fetch(`${baseUrl}/api/projects/${projectId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert(
      clientClaimRes.status === 403,
      `Client calling /api/projects/:id/claim is rejected with HTTP 403 Forbidden (got ${clientClaimRes.status})`
    );

    // -------------------------------------------------------------
    // TEST SECTION 4: DEVELOPER IDENTITY, WALLET & CLAIM DEDUCTION
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing Developer Credit Identity, IDOR Immunity & Claim Deduction ---');

    // Developer queries balance
    const devBalRes = await fetch(`${baseUrl}/api/credits/balance`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    const devBalData = await devBalRes.json();
    assert(devBalRes.status === 200, 'Developer can fetch their wallet balance');
    assert(devBalData.balance === 5, `Developer initial balance is 5 (got ${devBalData.balance})`);

    // IDOR test: Developer attempts to pass another user or developer ID via query params
    const idorBalRes = await fetch(`${baseUrl}/api/credits/balance?userId=${clientUserId}&developerId=fake_dev_id`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    const idorBalData = await idorBalRes.json();
    assert(
      idorBalRes.status === 200 && idorBalData.balance === 5,
      'IDOR Protection: Browser query parameters are ignored; developer balance is strictly from session'
    );

    // Developer claims project slot (-1 Credit)
    const claimRes = await fetch(`${baseUrl}/api/projects/${projectId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${devToken}` },
    });
    const claimData = await claimRes.json();
    assert(claimRes.status === 200 && claimData.claimId, 'Developer successfully claimed project slot');
    assert(claimData.remainingCredits === 4, `Remaining credits after claim is 4 (got ${claimData.remainingCredits})`);

    // Verify ledger entry for PROJECT_CLAIM
    const txRes = await query(
      `SELECT id, user_id, developer_id, type, amount, balance_before, balance_after, performed_by, reason
       FROM credit_transactions
       WHERE developer_id = $1 AND project_id = $2 AND type = 'PROJECT_CLAIM'
       ORDER BY created_at DESC LIMIT 1`,
      [devId, projectId]
    );
    assert(txRes.rows.length > 0, 'PROJECT_CLAIM recorded in credit ledger');
    const claimTx = txRes.rows[0];
    assert(claimTx.amount === -1, 'Claim deduction amount is -1');
    assert(claimTx.balance_before === 5, `Ledger recorded balance_before = 5 (got ${claimTx.balance_before})`);
    assert(claimTx.balance_after === 4, `Ledger recorded balance_after = 4 (got ${claimTx.balance_after})`);
    assert(claimTx.user_id === devUserId, 'Ledger transaction links directly to users.id');
    assert(claimTx.performed_by === devUserId, 'Ledger transaction records performed_by as authenticated user ID');

    // Test Insufficient Credits Enforcement
    // Reduce developer balance to 0
    await query(`UPDATE credit_accounts SET balance = 0 WHERE developer_id = $1`, [devId]);

    // Create second project
    const proj2Res = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline,
         requirements, required_technologies,
         status, claim_cost, max_claims, claim_deadline, client_id
       )
       VALUES (
         $1, $2, $3, 'Phase 11 Zero Credit Project Description', 'Full-Stack Development',
         50000, 80000, '30-45 days',
         '["TypeScript", "Node.js"]'::jsonb, '["TypeScript", "Node.js"]'::jsonb,
         'OPEN_FOR_CLAIMS', 1, 3, NOW() + INTERVAL '7 days', $4
       )
       RETURNING id, project_number`,
      [`PRJ-P11-2-${timestamp}`, `prj-p11-2-${timestamp}`, `Phase 11 Project 2 ${timestamp}`, clientId]
    );
    const project2Id = proj2Res.rows[0].id;

    const zeroBalClaimRes = await fetch(`${baseUrl}/api/projects/${project2Id}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${devToken}` },
    });
    const zeroBalClaimData = await zeroBalClaimRes.json();
    assert(
      zeroBalClaimRes.status === 400 && String(zeroBalClaimData.error).includes('Insufficient credits'),
      `Claim rejected when developer has 0 credits (Error: ${zeroBalClaimData.error})`
    );

    // -------------------------------------------------------------
    // TEST SECTION 5: SUPPORT ROLE IDENTITY & PERMISSION BOUNDARIES
    // -------------------------------------------------------------
    console.log('\n--- 5. Testing Support Role Identity, Queue Access & Credit Restrictions ---');

    // Support views ticket queue
    const supportTicketsRes = await fetch(`${baseUrl}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${supportToken}` },
    });
    const supportTicketsData = await supportTicketsRes.json();
    assert(supportTicketsRes.status === 200, 'Support role can view support ticket queue');
    const queueTicket = supportTicketsData.tickets.find((t: any) => t.id === ticketId);
    assert(Boolean(queueTicket), 'Support sees the ticket in queue');
    assert(queueTicket?.created_by_uid === clientUid, `Support sees creator 16-char UID (${clientUid})`);
    assert(queueTicket?.created_by_role === 'CLIENT', 'Support sees creator role CLIENT');

    // Support accesses bridge detail
    const supportBridgeRes = await fetch(`${baseUrl}/api/support/bridges/${ticketId}`, {
      headers: { Authorization: `Bearer ${supportToken}` },
    });
    const supportBridgeData = await supportBridgeRes.json();
    assert(supportBridgeRes.status === 200, 'Support can access support bridge details');
    assert(
      supportBridgeData.bridge?.createdByUid === clientUid || supportBridgeData.bridge?.created_by_uid === clientUid,
      `Support bridge response includes creator 16-char UID: ${supportBridgeData.bridge?.createdByUid || supportBridgeData.bridge?.created_by_uid}`
    );
    assert(
      supportBridgeData.bridge?.createdByRole === 'CLIENT' || supportBridgeData.bridge?.created_by_role === 'CLIENT',
      'Support bridge response includes creator role: CLIENT'
    );

    // Support attempts to access credit management routes (MUST BE FORBIDDEN)
    const supportGrantRes = await fetch(`${baseUrl}/api/credits/admin/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supportToken}`,
      },
      body: JSON.stringify({
        target: devUid,
        amount: 10,
        reason: 'Unauthorized grant attempt by support',
      }),
    });
    assert(
      supportGrantRes.status === 403,
      `Support attempting /api/credits/admin/grant receives HTTP 403 Forbidden (got ${supportGrantRes.status})`
    );

    const supportRemoveRes = await fetch(`${baseUrl}/api/credits/admin/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supportToken}`,
      },
      body: JSON.stringify({
        target: devUid,
        amount: 2,
        reason: 'Unauthorized removal attempt by support',
      }),
    });
    assert(
      supportRemoveRes.status === 403,
      `Support attempting /api/credits/admin/remove receives HTTP 403 Forbidden (got ${supportRemoveRes.status})`
    );

    const supportHistoryRes = await fetch(`${baseUrl}/api/credits/admin/history`, {
      headers: { Authorization: `Bearer ${supportToken}` },
    });
    assert(
      supportHistoryRes.status === 403,
      `Support attempting /api/credits/admin/history receives HTTP 403 Forbidden (got ${supportHistoryRes.status})`
    );

    const supportBulkRes = await fetch(`${baseUrl}/api/credits/admin/bulk-grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supportToken}`,
      },
      body: JSON.stringify({
        targetScope: 'ALL_DEVELOPERS',
        amountPerUser: 5,
        reason: 'Unauthorized bulk grant by support',
      }),
    });
    assert(
      supportBulkRes.status === 403,
      `Support attempting /api/credits/admin/bulk-grant receives HTTP 403 Forbidden (got ${supportBulkRes.status})`
    );

    // -------------------------------------------------------------
    // TEST SECTION 6: ADMIN CREDIT MANAGEMENT & OVERSIGHT
    // -------------------------------------------------------------
    console.log('\n--- 6. Testing Admin Credit Governance & End-to-End Ledger Audit ---');

    // Admin grants credits to developer using 16-char UID
    const adminGrantRes = await fetch(`${baseUrl}/api/credits/admin/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        target: devUid,
        amount: 10,
        reason: 'Promotional project allowance granted by platform admin',
      }),
    });
    const adminGrantData = await adminGrantRes.json();
    assert(adminGrantRes.status === 200 && adminGrantData.success, 'Admin granted 10 credits to developer');
    assert(adminGrantData.newBalance === 10, `Developer balance updated to 10 (got ${adminGrantData.newBalance})`);
    assert(adminGrantData.balanceBefore === 0, `Admin grant recorded balanceBefore = 0 (got ${adminGrantData.balanceBefore})`);

    // Verify developer can claim again with new credits
    const postGrantClaimRes = await fetch(`${baseUrl}/api/projects/${project2Id}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${devToken}` },
    });
    const postGrantClaimData = await postGrantClaimRes.json();
    assert(postGrantClaimRes.status === 200, 'Developer successfully claims project slot after admin credit grant');
    assert(postGrantClaimData.remainingCredits === 9, `Developer remaining balance is 9 (got ${postGrantClaimData.remainingCredits})`);

    // Verify audit log for admin credit grant
    const auditRes = await query(
      `SELECT action, actor_user_id, entity_type FROM audit_logs
       WHERE actor_user_id = $1 AND action = 'ADMIN_CREDIT_GRANT'
       ORDER BY created_at DESC LIMIT 1`,
      [adminUserId]
    );
    assert(auditRes.rows.length > 0, 'Audit log created for ADMIN_CREDIT_GRANT with admin actor user ID');

    // -------------------------------------------------------------
    // TEST SECTION 7: DATABASE CONSTRAINTS & UID IMMUTABILITY
    // -------------------------------------------------------------
    console.log('\n--- 7. Testing Database UID Immutability & Constraint Integrity ---');

    let uidUpdateFailed = false;
    try {
      await query(`UPDATE users SET uid = 'HackedUID1234567' WHERE id = $1`, [devUserId]);
    } catch (_err) {
      uidUpdateFailed = true;
    }
    assert(uidUpdateFailed, 'Database trigger prevents modification of users.uid (Immutability enforced)');

  } catch (error: any) {
    console.error('Fatal error during test execution:', error);
    assert(false, 'Integration test run without fatal errors', error.message);
  } finally {
    if (server) {
      await new Promise((resolve) => server!.close(resolve));
      console.log('\n[Harness] Server closed.');
    }
  }

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('PHASE 11 TEST RESULTS SUMMARY');
  console.log('================================================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Total Tests : ${results.length}`);
  console.log(`Passed      : ${passed}`);
  console.log(`Failed      : ${failed}`);

  if (failed > 0) {
    console.error('\nFailed tests:');
    results.filter((r) => !r.passed).forEach((r) => console.error(` - ${r.name}: ${r.details || 'Assertion failed'}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL PHASE 11 INTEGRATION TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  }
}

runTest().catch((err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});
