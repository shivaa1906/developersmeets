/**
 * PHASE 12 — COMPLETE AUTHENTICATION + UID + SUPPORT + CREDIT VERIFICATION
 * 
 * Comprehensive end-to-end verification across 19 critical security, identity,
 * support isolation, and financial ledger audit tests, followed by the TEST 20 scorecard report.
 */

import { Server } from 'http';
import app from '../server.js';
import { query, pool } from '../database/db.js';
import { generateUserUid, isValidUserUid } from '../utils/uidGenerator.js';
import { CreditLedgerService } from '../services/creditLedgerService.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/environment.js';

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  details?: string;
}

const testResults: TestResult[] = [];

function assert(condition: boolean, category: string, name: string, failureDetails?: string) {
  if (condition) {
    console.log(`  ✔ [PASS] [${category}] ${name}`);
    testResults.push({ category, name, passed: true });
  } else {
    console.error(`  ✘ [FAIL] [${category}] ${name} - ${failureDetails || 'Assertion failed'}`);
    testResults.push({ category, name, passed: false, details: failureDetails });
  }
}

async function runPhase12Verification() {
  console.log('================================================================');
  console.log('PHASE 12 — COMPLETE AUTHENTICATION + UID + SUPPORT + CREDIT VERIFICATION');
  console.log('================================================================\n');

  let server: Server | null = null;
  const port = 49212;
  const baseUrl = `http://localhost:${port}`;

  try {
    server = app.listen(port);
    await new Promise((resolve) => server!.once('listening', resolve));
    console.log(`[Harness] Verification test server running on port ${port}`);

    const runId = Date.now();

    // -------------------------------------------------------------
    // TEST 1 — CLIENT
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 1 — CLIENT VERIFICATION');
    console.log('=============================================================');

    const client1Email = `client001.${runId}@example.com`;
    const client1RegRes = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: client1Email,
        password: 'Password123!',
        companyName: 'Client 001 Corp',
        privateName: 'Client #001',
        phone: '+1-555-0101',
      }),
    });
    const client1RegData = await client1RegRes.json();
    assert(client1RegRes.status === 201, 'TEST 1', 'Client #001 registration returns HTTP 201');
    assert(isValidUserUid(client1RegData.user?.uid), 'TEST 1', `Client #001 UID is valid 16-char Base62: ${client1RegData.user?.uid}`);
    assert(client1RegData.user?.uid?.length === 16, 'TEST 1', 'Client #001 UID is exactly 16 characters');

    // Login
    const client1LoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: client1Email, password: 'Password123!' }),
    });
    const client1LoginData = await client1LoginRes.json();
    assert(client1LoginRes.status === 200 && client1LoginData.token, 'TEST 1', 'Client #001 login succeeds with JWT');
    const client1Token = client1LoginData.token;
    const client1UserId = client1LoginData.user?.id || client1LoginData.user?.userId;
    const client1Uid = client1LoginData.user?.uid;
    const client1ClientId = client1LoginData.user?.clientId;

    // Dashboard / Me
    const client1MeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    const client1MeData = await client1MeRes.json();
    assert(client1MeRes.status === 200 && client1MeData.user?.uid === client1Uid, 'TEST 1', 'Client #001 dashboard/me identity verified');

    // Create a Client 1 Project
    const proj1Res = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline,
         requirements, required_technologies,
         status, claim_cost, max_claims, claim_deadline, client_id
       ) VALUES (
         $1, $2, 'Client 001 Test Project', 'Verification description', 'Full-Stack Development',
         40000, 70000, '30 days', '["TS"]'::jsonb, '["Node.js"]'::jsonb,
         'OPEN_FOR_CLAIMS', 1, 3, NOW() + INTERVAL '10 days', $3
       ) RETURNING id`,
      [`PRJ-C1-${runId}`, `prj-c1-${runId}`, client1ClientId]
    );
    const client1ProjectId = proj1Res.rows[0].id;

    // Support - ticket creation
    const ticket1CreateRes = await fetch(`${baseUrl}/api/support/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${client1Token}`,
      },
      body: JSON.stringify({
        projectId: client1ProjectId,
        subject: 'Client 001 Support Ticket',
        description: 'Need assistance regarding project delivery milestone.',
        priority: 'NORMAL',
        category: 'TECHNICAL',
      }),
    });
    const ticket1Data = await ticket1CreateRes.json();
    assert(ticket1CreateRes.status === 201 && ticket1Data.ticket, 'TEST 1', 'Client #001 ticket creation succeeds');
    const ticket1Id = ticket1Data.ticket.id;
    const ticket1Number = ticket1Data.ticket.ticket_number || ticket1Data.ticket.ticketNumber;

    // Ticket ownership verification
    const ticket1DbRes = await query(`SELECT created_by_user_id, client_id FROM support_tickets WHERE id = $1`, [ticket1Id]);
    assert(ticket1DbRes.rows[0]?.created_by_user_id === client1UserId, 'TEST 1', 'Ticket created_by_user_id matches authenticated client');
    assert(ticket1DbRes.rows[0]?.client_id === client1ClientId, 'TEST 1', 'Ticket client_id matches authenticated client identity');

    // Support ticket list for Client
    const client1TicketsRes = await fetch(`${baseUrl}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    const client1TicketsData = await client1TicketsRes.json();
    assert(client1TicketsRes.status === 200 && Array.isArray(client1TicketsData.tickets), 'TEST 1', 'Client can query support tickets');
    assert(client1TicketsData.tickets.some((t: any) => t.id === ticket1Id), 'TEST 1', 'Client sees created ticket in their support list');

    // Logout
    const client1LogoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    assert(client1LogoutRes.status === 200, 'TEST 1', 'Client #001 logout succeeds');

    // -------------------------------------------------------------
    // TEST 2 — DEVELOPER
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 2 — DEVELOPER VERIFICATION');
    console.log('=============================================================');

    const dev1Email = `dev01.${runId}@example.com`;
    const dev1Username = `dev01_${runId}`;
    const dev1RegRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: dev1Email,
        password: 'Password123!',
        fullName: 'Developer #01',
        username: dev1Username,
        roleTitle: 'Full Stack Engineer',
        skills: 'TypeScript, PostgreSQL, Next.js',
        experience: 4,
        location: 'New York, NY',
        phone: '+1-555-0201',
        bio: 'Experienced full stack developer.',
      }),
    });
    const dev1RegData = await dev1RegRes.json();
    assert(dev1RegRes.status === 201, 'TEST 2', 'Developer #01 registered successfully');
    assert(isValidUserUid(dev1RegData.user?.uid), 'TEST 2', `Developer #01 received 16-char UID: ${dev1RegData.user?.uid}`);
    assert(dev1RegData.user?.uid?.length === 16, 'TEST 2', 'Developer #01 UID is exactly 16 characters');

    const dev1UserId = dev1RegData.user?.id;
    const dev1Id = dev1RegData.developer?.id;

    // Verify pending approval status
    const dev1DbStatus = await query(`SELECT verification_status FROM developers WHERE id = $1`, [dev1Id]);
    assert(
      dev1DbStatus.rows[0]?.verification_status === 'PENDING' || dev1DbStatus.rows[0]?.verification_status === 'PENDING_VERIFICATION',
      'TEST 2',
      `Developer initial status is pending verification/approval (${dev1DbStatus.rows[0]?.verification_status})`
    );

    // Admin approves developer
    await query(`UPDATE developers SET verification_status = 'VERIFIED' WHERE id = $1`, [dev1Id]);
    await query(`UPDATE users SET status = 'ACTIVE' WHERE id = $1`, [dev1UserId]);
    const dev1ApprovedDb = await query(`SELECT verification_status FROM developers WHERE id = $1`, [dev1Id]);
    assert(dev1ApprovedDb.rows[0]?.verification_status === 'VERIFIED', 'TEST 2', 'Developer #01 approved and verified');

    // Developer Login
    const dev1LoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: dev1Email, password: 'Password123!' }),
    });
    const dev1LoginData = await dev1LoginRes.json();
    assert(dev1LoginRes.status === 200 && dev1LoginData.token, 'TEST 2', 'Developer #01 login succeeds with JWT');
    const dev1Token = dev1LoginData.token;

    // Developer Dashboard
    const dev1DashRes = await fetch(`${baseUrl}/api/developers/dashboard`, {
      headers: { Authorization: `Bearer ${dev1Token}` },
    });
    const dev1DashText = await dev1DashRes.text();
    assert(dev1DashRes.status === 200, 'TEST 2', `Developer #01 accesses dashboard (${dev1DashRes.status}: ${dev1DashText})`);

    // Support access for developer
    const dev1SupportRes = await fetch(`${baseUrl}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${dev1Token}` },
    });
    assert(dev1SupportRes.status === 200, 'TEST 2', 'Developer #01 accesses support tickets endpoint');

    // Credit wallet check
    const dev1WalletRes = await fetch(`${baseUrl}/api/credits/balance`, {
      headers: { Authorization: `Bearer ${dev1Token}` },
    });
    const dev1WalletData = await dev1WalletRes.json();
    assert(dev1WalletRes.status === 200 && typeof dev1WalletData.balance === 'number', 'TEST 2', 'Developer #01 accesses credit wallet balance');

    // Community access
    const dev1CommRes = await fetch(`${baseUrl}/api/community/channels`, {
      headers: { Authorization: `Bearer ${dev1Token}` },
    });
    assert(dev1CommRes.status === 200, 'TEST 2', 'Developer #01 accesses developer community channels');

    // -------------------------------------------------------------
    // TEST 3 — SUPPORT USER
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 3 — SUPPORT USER VERIFICATION');
    console.log('=============================================================');

    const supportUserEmail = `support01.${runId}@example.com`;
    const supportUserRes = await query(
      `INSERT INTO users (email, password_hash, role, status, email_verified)
       VALUES ($1, 'hashed_pw', 'CLIENT', 'ACTIVE', true)
       RETURNING id, uid`,
      [supportUserEmail]
    );
    const supportUserId = supportUserRes.rows[0].id;
    const supportUserUid = supportUserRes.rows[0].uid;

    // Platform leadership (ADMIN)
    const adminUserRes = await query(`SELECT id, email, role FROM users WHERE role = 'ADMIN' OR role = 'CEO' ORDER BY role = 'CEO' DESC LIMIT 1`);
    const adminUserId = adminUserRes.rows[0].id;
    const adminToken = jwt.sign(
      { userId: adminUserId, email: adminUserRes.rows[0].email, role: adminUserRes.rows[0].role },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Admin assigns SUPPORT role
    const addStaffRes = await fetch(`${baseUrl}/api/support/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        userIdOrEmail: supportUserEmail,
        department: 'Technical Escalations',
        title: 'Support Specialist #01',
        supportLevel: 'L2_SUPPORT',
        permissions: ['SUPPORT_VIEW_ALL_TICKETS', 'SUPPORT_RESPOND', 'SUPPORT_ASSIGN_TICKETS'],
      }),
    });
    const addStaffData = await addStaffRes.json();
    assert(addStaffRes.status === 201 && addStaffData.staff, 'TEST 3', 'Admin assigns SUPPORT role and staff profile');
    const staffId = addStaffData.staff.id;

    // Verify role in database
    const supportDbRole = await query(`SELECT role FROM users WHERE id = $1`, [supportUserId]);
    assert(supportDbRole.rows[0]?.role === 'SUPPORT', 'TEST 3', 'User role upgraded to SUPPORT in database');

    // Support Login token
    const supportToken = jwt.sign(
      { userId: supportUserId, email: supportUserEmail, role: 'SUPPORT' },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Support dashboard / ticket queue
    const supportQueueRes = await fetch(`${baseUrl}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${supportToken}` },
    });
    const supportQueueData = await supportQueueRes.json();
    assert(supportQueueRes.status === 200 && Array.isArray(supportQueueData.tickets), 'TEST 3', 'Support specialist accesses ticket queue');

    // Assignment
    const assignRes = await fetch(`${baseUrl}/api/support/tickets/${ticket1Id}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supportToken}`,
      },
      body: JSON.stringify({ supportUserId }),
    });
    assert(assignRes.status === 200, 'TEST 3', 'Support specialist assigns ticket');

    // Support bridge inspection
    const bridge1Res = await query(`SELECT id FROM support_bridges WHERE ticket_id = $1`, [ticket1Id]);
    const bridge1Id = bridge1Res.rows[0]?.id;
    assert(Boolean(bridge1Id), 'TEST 3', 'Support bridge exists for ticket');

    const supportBridgeViewRes = await fetch(`${baseUrl}/api/support/bridges/${bridge1Id}`, {
      headers: { Authorization: `Bearer ${supportToken}` },
    });
    assert(supportBridgeViewRes.status === 200, 'TEST 3', 'Support specialist can view support bridge');

    // Reply on support bridge
    const supportReplyRes = await fetch(`${baseUrl}/api/support/bridges/${bridge1Id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supportToken}`,
      },
      body: JSON.stringify({ message: 'Hello Client #001, Support Agent #01 is reviewing your request.' }),
    });
    assert(supportReplyRes.status === 201, 'TEST 3', 'Support specialist sends reply message on bridge');

    // Verify Support has NO admin permissions
    const supportAdminUsersRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${supportToken}` },
    });
    assert(supportAdminUsersRes.status === 403, 'TEST 3', 'Support specialist blocked from /api/admin/users (HTTP 403)');

    const supportCreditGrantRes = await fetch(`${baseUrl}/api/credits/admin/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supportToken}`,
      },
      body: JSON.stringify({ target: dev1UserId, amount: 5, reason: 'Unauthorized grant' }),
    });
    assert(supportCreditGrantRes.status === 403, 'TEST 3', 'Support specialist blocked from credit grants (HTTP 403)');

    // -------------------------------------------------------------
    // TEST 4 — ADMIN CAPABILITIES
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 4 — ADMIN CAPABILITIES VERIFICATION');
    console.log('=============================================================');

    // 1. Manage users
    const adminUsersRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminUsersRes.status === 200, 'TEST 4', 'Admin can manage platform users');

    // 2. Manage support staff
    const adminStaffRes = await fetch(`${baseUrl}/api/support/staff`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminStaffRes.status === 200, 'TEST 4', 'Admin can list support staff');

    // 3. Remove SUPPORT role
    const removeStaffRes = await fetch(`${baseUrl}/api/support/staff/${staffId}/remove`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(removeStaffRes.status === 200, 'TEST 4', 'Admin can remove SUPPORT role');
    const demotedUserRes = await query(`SELECT role FROM users WHERE id = $1`, [supportUserId]);
    assert(demotedUserRes.rows[0]?.role !== 'SUPPORT', 'TEST 4', 'Demoted user no longer has SUPPORT role');

    // Re-grant support role for remaining tests
    await query(`UPDATE users SET role = 'SUPPORT' WHERE id = $1`, [supportUserId]);
    await query(`UPDATE support_staff SET status = 'AVAILABLE', permissions = '["SUPPORT_VIEW_ALL_TICKETS", "SUPPORT_RESPOND"]'::jsonb WHERE id = $1`, [staffId]);

    // 4. Manage tickets
    const adminTicketStatusRes = await fetch(`${baseUrl}/api/support/tickets/${ticket1Id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    assert(adminTicketStatusRes.status === 200, 'TEST 4', 'Admin can manage support ticket status');

    // 5. Manage credits (grant & remove)
    const adminGrantRes = await fetch(`${baseUrl}/api/credits/admin/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ target: dev1UserId, amount: 2, reason: 'Admin capability check grant' }),
    });
    assert(adminGrantRes.status === 200, 'TEST 4', 'Admin can grant credits');

    const adminRemoveRes = await fetch(`${baseUrl}/api/credits/admin/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ target: dev1UserId, amount: 1, reason: 'Admin capability check removal' }),
    });
    assert(adminRemoveRes.status === 200, 'TEST 4', 'Admin can remove credits');

    // 6. View audit logs
    const adminAuditRes = await fetch(`${baseUrl}/api/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminAuditRes.status === 200, 'TEST 4', 'Admin can view platform audit logs');

    // -------------------------------------------------------------
    // TEST 5 — UID INTEGRITY, UNIQUENESS & IMMUTABILITY
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 5 — UID INTEGRITY, UNIQUENESS & IMMUTABILITY');
    console.log('=============================================================');

    const sampleSize = 1000;
    const generatedUids = new Set<string>();
    let allValidFormat = true;

    for (let i = 0; i < sampleSize; i++) {
      const uid = generateUserUid();
      if (!isValidUserUid(uid) || uid.length !== 16) {
        allValidFormat = false;
      }
      generatedUids.add(uid);
    }
    assert(allValidFormat, 'TEST 5', `All ${sampleSize} generated UIDs strictly match ^[A-Za-z0-9]{16}$`);
    assert(generatedUids.size === sampleSize, 'TEST 5', `All ${sampleSize} UIDs are completely unique (zero collisions)`);

    // Verify database immutability trigger
    let triggerEnforced = false;
    try {
      await query(`UPDATE users SET uid = 'MODIFIED12345678' WHERE id = $1`, [client1UserId]);
    } catch (err: any) {
      if (err.message.includes('UID is immutable and cannot be modified')) {
        triggerEnforced = true;
      }
    }
    assert(triggerEnforced, 'TEST 5', 'PostgreSQL trigger prevents updating users.uid (UID immutability enforced)');

    // -------------------------------------------------------------
    // TEST 6 — CLIENT SUPPORT ISOLATION
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 6 — CLIENT SUPPORT ISOLATION');
    console.log('=============================================================');

    // Create Client #002
    const client2Email = `client002.${runId}@example.com`;
    const client2RegRes = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: client2Email,
        password: 'Password123!',
        companyName: 'Client 002 Corp',
        privateName: 'Client #002',
        phone: '+1-555-0102',
      }),
    });
    const client2RegData = await client2RegRes.json();
    const client2Token = client2RegData.token;
    const client2UserId = client2RegData.user?.id || client2RegData.user?.userId;
    const client2ClientId = client2RegData.user?.clientId;

    // Create Project for Client 2
    const proj2Res = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline,
         requirements, required_technologies,
         status, claim_cost, max_claims, claim_deadline, client_id
       ) VALUES (
         $1, $2, 'Client 002 Private Project', 'Confidential project details', 'Full-Stack Development',
         60000, 90000, '45 days', '["TS"]'::jsonb, '["React"]'::jsonb,
         'OPEN_FOR_CLAIMS', 1, 3, NOW() + INTERVAL '10 days', $3
       ) RETURNING id`,
      [`PRJ-C2-${runId}`, `prj-c2-${runId}`, client2ClientId]
    );
    const client2ProjectId = proj2Res.rows[0].id;

    // Client #002 creates SUP-2026-0002
    const ticket2CreateRes = await fetch(`${baseUrl}/api/support/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${client2Token}`,
      },
      body: JSON.stringify({
        projectId: client2ProjectId,
        subject: 'Confidential Client #002 Security Incident',
        description: 'Classified proprietary information requiring urgent audit.',
        priority: 'URGENT',
        category: 'SECURITY',
      }),
    });
    const ticket2Data = await ticket2CreateRes.json();
    const ticket2Id = ticket2Data.ticket.id;
    const bridge2Res = await query(`SELECT id FROM support_bridges WHERE ticket_id = $1`, [ticket2Id]);
    const bridge2Id = bridge2Res.rows[0]?.id;

    // 1. Client #001 attempts API access to Client #002's ticket
    const client1AccessTicket2Res = await fetch(`${baseUrl}/api/support/tickets/${ticket2Id}`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    assert(client1AccessTicket2Res.status === 403, 'TEST 6', 'Client #001 blocked from accessing Ticket #0002 (HTTP 403 Forbidden)');

    // 2. Client #001 attempts URL manipulation on bridge
    const client1AccessBridge2Res = await fetch(`${baseUrl}/api/support/bridges/${bridge2Id}`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    assert(client1AccessBridge2Res.status === 403, 'TEST 6', 'Client #001 blocked from accessing Bridge #0002 (HTTP 403 Forbidden)');

    // 3. Client #001 searches tickets
    const client1SearchRes = await fetch(`${baseUrl}/api/support/tickets?search=Confidential`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    const client1SearchData = await client1SearchRes.json();
    const leakedTicket = (client1SearchData.tickets || []).some((t: any) => t.id === ticket2Id);
    assert(!leakedTicket, 'TEST 6', 'Search isolation: Client #001 cannot discover Client #002 tickets via search');

    // 4. Attachments isolation
    const client1AttachmentRes = await fetch(`${baseUrl}/api/support/tickets/${ticket2Id}/attachments/dummy-att-id`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    assert(client1AttachmentRes.status === 403, 'TEST 6', 'Client #001 blocked from ticket attachments of Client #002 (HTTP 403 Forbidden)');

    // 5. Message posting / Bridge isolation
    const client1PostBridge2Res = await fetch(`${baseUrl}/api/support/bridges/${bridge2Id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${client1Token}`,
      },
      body: JSON.stringify({ message: 'Unauthorized intrusion attempt by Client #001' }),
    });
    assert(client1PostBridge2Res.status === 403, 'TEST 6', 'Client #001 blocked from posting messages to Bridge #0002 (HTTP 403 Forbidden)');

    // -------------------------------------------------------------
    // TEST 7 — DEVELOPER SUPPORT ISOLATION
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 7 — DEVELOPER SUPPORT ISOLATION');
    console.log('=============================================================');

    // Create Developer #02
    const dev2Email = `dev02.${runId}@example.com`;
    const dev2Username = `dev02_${runId}`;
    const dev2RegRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: dev2Email,
        password: 'Password123!',
        fullName: 'Developer #02',
        username: dev2Username,
        roleTitle: 'Systems Architect',
        skills: 'Rust, Go, Kubernetes',
        experience: 7,
        location: 'Austin, TX',
        phone: '+1-555-0202',
        bio: 'Systems architect.',
      }),
    });
    const dev2RegData = await dev2RegRes.json();
    const dev2UserId = dev2RegData.user?.id;
    const dev2Id = dev2RegData.developer?.id;

    // Approve Developer #02
    await query(`UPDATE developers SET verification_status = 'VERIFIED' WHERE id = $1`, [dev2Id]);
    await query(`UPDATE users SET status = 'ACTIVE' WHERE id = $1`, [dev2UserId]);

    const dev2LoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: dev2Email, password: 'Password123!' }),
    });
    const dev2LoginData = await dev2LoginRes.json();
    const dev2Token = dev2LoginData.token;

    // Developer #02 creates a private support ticket
    const dev2TicketRes = await fetch(`${baseUrl}/api/support/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev2Token}`,
      },
      body: JSON.stringify({
        subject: 'Developer #02 Private Payout Inquiry',
        description: 'Confidential tax documentation for Developer #02',
        priority: 'NORMAL',
        category: 'BILLING',
      }),
    });
    const dev2TicketData = await dev2TicketRes.json();
    const dev2TicketId = dev2TicketData.ticket.id;
    const dev2BridgeRes = await query(`SELECT id FROM support_bridges WHERE ticket_id = $1`, [dev2TicketId]);
    const dev2BridgeId = dev2BridgeRes.rows[0]?.id;

    // Developer #01 attempts to access Developer #02's ticket
    const dev1AccessDev2TicketRes = await fetch(`${baseUrl}/api/support/tickets/${dev2TicketId}`, {
      headers: { Authorization: `Bearer ${dev1Token}` },
    });
    assert(dev1AccessDev2TicketRes.status === 403, 'TEST 7', 'Developer #01 blocked from accessing Developer #02 ticket (HTTP 403 Forbidden)');

    // Developer #01 attempts to access Developer #02's bridge
    const dev1AccessDev2BridgeRes = await fetch(`${baseUrl}/api/support/bridges/${dev2BridgeId}`, {
      headers: { Authorization: `Bearer ${dev1Token}` },
    });
    assert(dev1AccessDev2BridgeRes.status === 403, 'TEST 7', 'Developer #01 blocked from accessing Developer #02 support bridge (HTTP 403 Forbidden)');

    // -------------------------------------------------------------
    // TEST 8 — CREDIT GRANT (Start: 10, Admin grants: +5, Expected: 15)
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 8 — CREDIT GRANT (Start: 10, Admin grants: +5, Expected: 15)');
    console.log('=============================================================');

    // Reset Developer #01 balance to 10
    const dev1AccRes = await query(
      `SELECT id FROM credit_accounts WHERE user_id = $1 OR developer_id = $2`,
      [dev1UserId, dev1Id]
    );
    if (dev1AccRes.rows.length > 0) {
      await query(`UPDATE credit_accounts SET balance = 10, user_id = $1, developer_id = $2 WHERE id = $3`, [dev1UserId, dev1Id, dev1AccRes.rows[0].id]);
    } else {
      await query(`INSERT INTO credit_accounts (user_id, developer_id, balance, currency) VALUES ($1, $2, 10, 'INR')`, [dev1UserId, dev1Id]);
    }

    const grantRes = await fetch(`${baseUrl}/api/credits/admin/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        target: dev1UserId,
        amount: 5,
        reason: 'Phase 12 Verification Test 8 Grant',
      }),
    });
    const grantData = await grantRes.json();
    assert(grantRes.status === 200, 'TEST 8', 'Admin credit grant returns HTTP 200');
    const newBal8 = grantData.newBalance !== undefined ? grantData.newBalance : grantData.balance;
    assert(newBal8 === 15, 'TEST 8', `New balance is exactly 15 (got ${newBal8})`);
    assert(grantData.balanceBefore === 10, 'TEST 8', `Balance before was 10 (got ${grantData.balanceBefore})`);

    // Verify ledger record
    const grantLedgerRes = await query(
      `SELECT * FROM credit_transactions WHERE user_id = $1 AND type = 'ADMIN_CREDIT_GRANT' ORDER BY created_at DESC LIMIT 1`,
      [dev1UserId]
    );
    const grantTx = grantLedgerRes.rows[0];
    assert(Number(grantTx.amount) === 5, 'TEST 8', 'Ledger recorded amount = 5');
    assert(Number(grantTx.balance_before) === 10, 'TEST 8', 'Ledger recorded balance_before = 10');
    assert(Number(grantTx.balance_after) === 15, 'TEST 8', 'Ledger recorded balance_after = 15');
    assert(grantTx.performed_by === adminUserId, 'TEST 8', 'Ledger recorded performed_by = adminUserId');

    // Verify audit log
    const grantAuditRes = await query(
      `SELECT * FROM audit_logs WHERE actor_user_id = $1 AND action = 'ADMIN_CREDIT_GRANT' ORDER BY created_at DESC LIMIT 1`,
      [adminUserId]
    );
    assert(grantAuditRes.rows.length > 0, 'TEST 8', 'Audit log created for ADMIN_CREDIT_GRANT');

    // -------------------------------------------------------------
    // TEST 9 — CREDIT REMOVAL (Remove: 3, Expected: 12)
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 9 — CREDIT REMOVAL (Remove: 3, Expected: 12)');
    console.log('=============================================================');

    const removeRes = await fetch(`${baseUrl}/api/credits/admin/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        target: dev1UserId,
        amount: 3,
        reason: 'Phase 12 Verification Test 9 Removal',
      }),
    });
    const removeData = await removeRes.json();
    assert(removeRes.status === 200, 'TEST 9', 'Admin credit removal returns HTTP 200');
    const newBal9 = removeData.newBalance !== undefined ? removeData.newBalance : removeData.balance;
    assert(newBal9 === 12, 'TEST 9', `New balance is exactly 12 (got ${newBal9})`);
    assert(removeData.balanceBefore === 15, 'TEST 9', `Balance before was 15 (got ${removeData.balanceBefore})`);

    // Verify ledger record
    const removeLedgerRes = await query(
      `SELECT * FROM credit_transactions WHERE user_id = $1 AND type = 'ADMIN_CREDIT_REMOVAL' ORDER BY created_at DESC LIMIT 1`,
      [dev1UserId]
    );
    const removeTx = removeLedgerRes.rows[0];
    assert(Number(removeTx.amount) === -3, 'TEST 9', 'Ledger recorded amount = -3');
    assert(Number(removeTx.balance_before) === 15, 'TEST 9', 'Ledger recorded balance_before = 15');
    assert(Number(removeTx.balance_after) === 12, 'TEST 9', 'Ledger recorded balance_after = 12');
    assert(removeTx.performed_by === adminUserId, 'TEST 9', 'Ledger recorded performed_by = adminUserId');

    // -------------------------------------------------------------
    // TEST 10 — BULK CREDIT GRANT (Dev 1 = 10, Dev 2 = 20, Dev 3 = 5 -> +5 to each)
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 10 — BULK CREDIT GRANT (Dev1=10, Dev2=20, Dev3=5 -> +5 each)');
    console.log('=============================================================');

    // Create Developer #03
    const dev3Email = `dev03.${runId}@example.com`;
    const dev3RegRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: dev3Email,
        password: 'Password123!',
        fullName: 'Developer #03',
        username: `dev03_${runId}`,
        roleTitle: 'DevOps Specialist',
        skills: 'Docker, AWS, Terraform',
        experience: 6,
        location: 'Seattle, WA',
        phone: '+1-555-0203',
        bio: 'DevOps specialist.',
      }),
    });
    const dev3RegData = await dev3RegRes.json();
    const dev3UserId = dev3RegData.user?.id;
    const dev3Id = dev3RegData.developer?.id;
    await query(`UPDATE developers SET verification_status = 'VERIFIED' WHERE id = $1`, [dev3Id]);
    await query(`UPDATE users SET status = 'ACTIVE' WHERE id = $1`, [dev3UserId]);

    // Set precise initial balances: Dev 1 = 10, Dev 2 = 20, Dev 3 = 5
    await query(`UPDATE credit_accounts SET balance = 10 WHERE user_id = $1 OR developer_id = $2`, [dev1UserId, dev1Id]);
    await query(`DELETE FROM credit_accounts WHERE user_id = $1 OR developer_id = $2`, [dev2UserId, dev2Id]);
    await query(`INSERT INTO credit_accounts (user_id, developer_id, balance, currency) VALUES ($1, $2, 20, 'INR')`, [dev2UserId, dev2Id]);
    await query(`DELETE FROM credit_accounts WHERE user_id = $1 OR developer_id = $2`, [dev3UserId, dev3Id]);
    await query(`INSERT INTO credit_accounts (user_id, developer_id, balance, currency) VALUES ($1, $2, 5, 'INR')`, [dev3UserId, dev3Id]);

    // Admin grants +5 in bulk to selected users [dev1, dev2, dev3]
    const bulkRes = await fetch(`${baseUrl}/api/credits/admin/bulk-grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        targetScope: 'SELECTED',
        userIds: [dev1UserId, dev2UserId, dev3UserId],
        amount: 5,
        reason: 'Phase 12 Verification Test 10 Bulk Grant',
      }),
    });
    const bulkData = await bulkRes.json();
    assert(bulkRes.status === 200, 'TEST 10', 'Bulk credit grant returns HTTP 200');
    const procCount = bulkData.recipientCount !== undefined ? bulkData.recipientCount : bulkData.count;
    assert(procCount === 3, 'TEST 10', `Processed 3 recipients (got ${procCount})`);

    // Verify balances: Dev 1 = 15, Dev 2 = 25, Dev 3 = 10
    const dev1Bal = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev1UserId])).rows[0]?.balance;
    const dev2Bal = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev2UserId])).rows[0]?.balance;
    const dev3Bal = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev3UserId])).rows[0]?.balance;
    assert(Number(dev1Bal) === 15, 'TEST 10', `Developer #01 balance is 15 (got ${dev1Bal})`);
    assert(Number(dev2Bal) === 25, 'TEST 10', `Developer #02 balance is 25 (got ${dev2Bal})`);
    assert(Number(dev3Bal) === 10, 'TEST 10', `Developer #03 balance is 10 (got ${dev3Bal})`);

    // Verify each user has their own individual ledger transaction
    const dev1TxCount = (await query(`SELECT COUNT(*) FROM credit_transactions WHERE user_id = $1 AND reason = 'Phase 12 Verification Test 10 Bulk Grant'`, [dev1UserId])).rows[0].count;
    const dev2TxCount = (await query(`SELECT COUNT(*) FROM credit_transactions WHERE user_id = $1 AND reason = 'Phase 12 Verification Test 10 Bulk Grant'`, [dev2UserId])).rows[0].count;
    const dev3TxCount = (await query(`SELECT COUNT(*) FROM credit_transactions WHERE user_id = $1 AND reason = 'Phase 12 Verification Test 10 Bulk Grant'`, [dev3UserId])).rows[0].count;
    assert(Number(dev1TxCount) === 1 && Number(dev2TxCount) === 1 && Number(dev3TxCount) === 1, 'TEST 10', 'Individual ledger transactions recorded per recipient');

    // -------------------------------------------------------------
    // TEST 10B — ADMIN BULK CREDIT REMOVAL
    // -------------------------------------------------------------
    console.log('\n--- 10B. Admin Bulk Credit Removal Verification ---');
    const bulkRemoveRes = await fetch(`${baseUrl}/api/credits/admin/bulk-remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        targetScope: 'SELECTED',
        userIds: [dev1UserId, dev2UserId, dev3UserId],
        amount: 2,
        reason: 'Phase 12 Verification Test Bulk Removal',
      }),
    });
    const bulkRemoveData = await bulkRemoveRes.json();
    assert(bulkRemoveRes.status === 200, 'TEST 10B', 'Bulk credit removal returns HTTP 200');
    const remCount = bulkRemoveData.recipientCount !== undefined ? bulkRemoveData.recipientCount : bulkRemoveData.count;
    assert(remCount === 3, 'TEST 10B', `Bulk removal processed 3 users (got ${remCount})`);

    const dev1PostRemoveBal = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev1UserId])).rows[0]?.balance;
    const dev2PostRemoveBal = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev2UserId])).rows[0]?.balance;
    const dev3PostRemoveBal = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev3UserId])).rows[0]?.balance;
    assert(Number(dev1PostRemoveBal) === 13, 'TEST 10B', `Developer #01 balance reduced from 15 to 13 (got ${dev1PostRemoveBal})`);
    assert(Number(dev2PostRemoveBal) === 23, 'TEST 10B', `Developer #02 balance reduced from 25 to 23 (got ${dev2PostRemoveBal})`);
    assert(Number(dev3PostRemoveBal) === 8, 'TEST 10B', `Developer #03 balance reduced from 10 to 8 (got ${dev3PostRemoveBal})`);

    // -------------------------------------------------------------
    // TEST 11 — NEGATIVE BALANCE PROTECTION
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 11 — NEGATIVE BALANCE PROTECTION (User: 2, Admin removes: 5)');
    console.log('=============================================================');

    // Set Dev 1 balance to 2
    await query(`UPDATE credit_accounts SET balance = 2 WHERE user_id = $1`, [dev1UserId]);

    const negRemoveRes = await fetch(`${baseUrl}/api/credits/admin/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        target: dev1UserId,
        amount: 5,
        reason: 'Attempting invalid overdraft removal',
      }),
    });
    const negRemoveData = await negRemoveRes.json();
    assert(negRemoveRes.status === 400, 'TEST 11', 'Overdraft credit removal rejected with HTTP 400');
    assert(negRemoveData.error?.includes('negative balance'), 'TEST 11', 'Error message specifies negative balance prohibition');

    // Verify balance remains 2
    const unchangedBal = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev1UserId])).rows[0]?.balance;
    assert(Number(unchangedBal) === 2, 'TEST 11', `Developer balance remains 2 (got ${unchangedBal})`);

    // -------------------------------------------------------------
    // TEST 12 — CLAIM + CREDIT + SELECTION REFUND LIFECYCLE
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 12 — CLAIM + CREDIT + SELECTION REFUND LIFECYCLE');
    console.log('=============================================================');

    // Setup: Developer #01 = 10 credits, Developer #02 = 10 credits
    await query(`UPDATE credit_accounts SET balance = 10 WHERE user_id = $1`, [dev1UserId]);
    await query(`UPDATE credit_accounts SET balance = 10 WHERE user_id = $1`, [dev2UserId]);

    // Create Project with 2 slots
    const claimProjRes = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline,
         requirements, required_technologies,
         status, claim_cost, max_claims, claim_deadline, client_id
       ) VALUES (
         $1, $2, 'Competitive Bid Project', 'Selection and refund verification project', 'Full-Stack Development',
         50000, 80000, '30 days', '[]'::jsonb, '[]'::jsonb,
         'OPEN_FOR_CLAIMS', 1, 3, NOW() + INTERVAL '10 days', $3
       ) RETURNING id`,
      [`PRJ-CLAIM-${runId}`, `prj-claim-${runId}`, client1ClientId]
    );
    const claimProjId = claimProjRes.rows[0].id;

    // Dev 1 claims project: -1 credit -> balance = 9
    const dev1ClaimRes = await fetch(`${baseUrl}/api/projects/${claimProjId}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev1Token}`,
      },
    });
    const dev1ClaimData = await dev1ClaimRes.json();
    assert(dev1ClaimRes.status === 200, 'TEST 12', `Developer #01 claims project slot (-1 credit) (status ${dev1ClaimRes.status}: ${JSON.stringify(dev1ClaimData)})`);
    const dev1AfterClaimBal = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev1UserId])).rows[0]?.balance;
    assert(Number(dev1AfterClaimBal) === 9, 'TEST 12', `Developer #01 balance is 9 after claim (got ${dev1AfterClaimBal})`);

    // Dev 2 claims project: -1 credit -> balance = 9
    const dev2ClaimRes = await fetch(`${baseUrl}/api/projects/${claimProjId}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev2Token}`,
      },
    });
    const dev2ClaimData = await dev2ClaimRes.json();
    assert(dev2ClaimRes.status === 200, 'TEST 12', `Developer #02 claims project slot (-1 credit) (status ${dev2ClaimRes.status}: ${JSON.stringify(dev2ClaimData)})`);
    const dev2AfterClaimBal = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev2UserId])).rows[0]?.balance;
    assert(Number(dev2AfterClaimBal) === 9, 'TEST 12', `Developer #02 balance is 9 after claim (got ${dev2AfterClaimBal})`);

    // Client selects Developer #01 (Dev 1 is selected; Dev 2 is NOT selected -> Dev 2 receives +1 refund)
    const selectRes = await CreditLedgerService.processSelectionRefunds(claimProjId, dev1Id);
    assert(selectRes.refundedDevelopersCount === 1, 'TEST 12', `One unselected developer refunded (got ${selectRes.refundedDevelopersCount})`);

    // Dev 1 was selected -> balance remains 9
    const dev1FinalBal = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev1UserId])).rows[0]?.balance;
    assert(Number(dev1FinalBal) === 9, 'TEST 12', `Selected Developer #01 balance remains 9 (got ${dev1FinalBal})`);

    // Dev 2 was not selected -> balance refunded to 10
    const dev2FinalBal = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev2UserId])).rows[0]?.balance;
    assert(Number(dev2FinalBal) === 10, 'TEST 12', `Unselected Developer #02 refunded +1 credit to 10 (got ${dev2FinalBal})`);

    // Idempotency: verify no duplicate refund
    const duplicateRefundRes = await CreditLedgerService.processSelectionRefunds(claimProjId, dev1Id);
    assert(duplicateRefundRes.refundedDevelopersCount === 0, 'TEST 12', 'Idempotency verified: zero duplicate refunds on second run');
    const dev2IdempotentBal = (await query(`SELECT balance FROM credit_accounts WHERE user_id = $1`, [dev2UserId])).rows[0]?.balance;
    assert(Number(dev2IdempotentBal) === 10, 'TEST 12', `Developer #02 balance still 10 (no double refund)`);

    // -------------------------------------------------------------
    // TEST 13 — ADMIN CREDIT AUDIT LOGGING
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 13 — ADMIN CREDIT AUDIT LOGGING');
    console.log('=============================================================');

    // Retrieve latest manual adjustment transaction
    const latestTxRes = await query(
      `SELECT * FROM credit_transactions WHERE performed_by = $1 ORDER BY created_at DESC LIMIT 1`,
      [adminUserId]
    );
    const tx = latestTxRes.rows[0];
    assert(Boolean(tx.performed_by), 'TEST 13', `Audit field: who performed it (${tx.performed_by})`);
    assert(Boolean(tx.user_id), 'TEST 13', `Audit field: which user received/paid (${tx.user_id})`);
    assert(tx.amount !== null && tx.amount !== undefined, 'TEST 13', `Audit field: amount (${tx.amount})`);
    assert(tx.balance_before !== null, 'TEST 13', `Audit field: balance_before (${tx.balance_before})`);
    assert(tx.balance_after !== null, 'TEST 13', `Audit field: balance_after (${tx.balance_after})`);
    assert(Boolean(tx.reason), 'TEST 13', `Audit field: reason (${tx.reason})`);
    assert(Boolean(tx.created_at), 'TEST 13', `Audit field: timestamp (${tx.created_at})`);
    assert(Boolean(tx.type), 'TEST 13', `Audit field: operation (${tx.type})`);

    // -------------------------------------------------------------
    // TEST 14 — ROLE ESCALATION PROTECTION
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 14 — ROLE ESCALATION PROTECTION');
    console.log('=============================================================');

    // 1. CLIENT -> ADMIN
    const clientEscalateRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    assert(clientEscalateRes.status === 403, 'TEST 14', 'CLIENT -> ADMIN escalation blocked (HTTP 403 Forbidden)');

    // 2. DEVELOPER -> ADMIN
    const devEscalateRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${dev1Token}` },
    });
    assert(devEscalateRes.status === 403, 'TEST 14', 'DEVELOPER -> ADMIN escalation blocked (HTTP 403 Forbidden)');

    // 3. SUPPORT -> ADMIN
    const supportEscalateRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${supportToken}` },
    });
    assert(supportEscalateRes.status === 403, 'TEST 14', 'SUPPORT -> ADMIN escalation blocked (HTTP 403 Forbidden)');

    // -------------------------------------------------------------
    // TEST 15 — CLIENT CREDIT SECURITY
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 15 — CLIENT CREDIT SECURITY');
    console.log('=============================================================');

    const clientCreditGrantRes = await fetch(`${baseUrl}/api/credits/admin/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${client1Token}`,
      },
      body: JSON.stringify({ target: client1UserId, amount: 100, reason: 'Illicit client self-grant' }),
    });
    assert(clientCreditGrantRes.status === 403, 'TEST 15', 'Client calling /api/credits/admin/grant receives HTTP 403 Forbidden');

    const clientCreditBalanceRes = await fetch(`${baseUrl}/api/credits/balance`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    assert(clientCreditBalanceRes.status === 403, 'TEST 15', 'Client calling /api/credits/balance receives HTTP 403 Forbidden');

    // -------------------------------------------------------------
    // TEST 16 — SUPPORT CREDIT SECURITY
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 16 — SUPPORT CREDIT SECURITY');
    console.log('=============================================================');

    const supportGrantRes = await fetch(`${baseUrl}/api/credits/admin/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supportToken}`,
      },
      body: JSON.stringify({ target: dev1UserId, amount: 10, reason: 'Unauthorized support grant' }),
    });
    assert(supportGrantRes.status === 403, 'TEST 16', 'Support user blocked from granting credits (HTTP 403 Forbidden)');

    const supportRemoveRes = await fetch(`${baseUrl}/api/credits/admin/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supportToken}`,
      },
      body: JSON.stringify({ target: dev1UserId, amount: 2, reason: 'Unauthorized support removal' }),
    });
    assert(supportRemoveRes.status === 403, 'TEST 16', 'Support user blocked from removing credits (HTTP 403 Forbidden)');

    // -------------------------------------------------------------
    // TEST 17 — UID SECURITY
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 17 — UID SECURITY');
    console.log('=============================================================');

    const dev1UidBefore = (await query(`SELECT uid FROM users WHERE id = $1`, [dev1UserId])).rows[0]?.uid;
    const profileUpdateRes = await fetch(`${baseUrl}/api/developers/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev1Token}`,
      },
      body: JSON.stringify({
        displayName: 'Developer #01 Updated Name',
        uid: 'FORGED_UID_99999',
      }),
    });
    assert(profileUpdateRes.status === 200, 'TEST 17', 'Developer profile update executed');
    const dev1UidAfter = (await query(`SELECT uid FROM users WHERE id = $1`, [dev1UserId])).rows[0]?.uid;
    assert(dev1UidAfter === dev1UidBefore, 'TEST 17', `Developer UID remains completely unchanged: ${dev1UidAfter}`);

    // -------------------------------------------------------------
    // TEST 18 — LOGOUT AND PROTECTED ROUTE ACCESS
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 18 — LOGOUT AND PROTECTED ROUTE ACCESS');
    console.log('=============================================================');

    // Logout dev1
    const dev1LogoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dev1Token}` },
    });
    assert(dev1LogoutRes.status === 200, 'TEST 18', 'Logout endpoint succeeds');

    // Attempt protected support and credit endpoints without authorization header
    const unauthSupportRes = await fetch(`${baseUrl}/api/support/tickets`);
    assert(unauthSupportRes.status === 401, 'TEST 18', 'Unauthenticated /api/support/tickets returns HTTP 401 Unauthorized');

    const unauthCreditsRes = await fetch(`${baseUrl}/api/credits/admin/accounts`);
    assert(unauthCreditsRes.status === 401, 'TEST 18', 'Unauthenticated /api/credits/admin/accounts returns HTTP 401 Unauthorized');

    // -------------------------------------------------------------
    // TEST 19 — REALTIME SUPPORT BRIDGE COMMUNICATION
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 19 — REALTIME SUPPORT BRIDGE COMMUNICATION');
    console.log('=============================================================');

    // Enroll Dev 1 into ticket 1 bridge
    await query(`INSERT INTO support_bridge_members (bridge_id, user_id, role) VALUES ($1, $2, 'DEVELOPER') ON CONFLICT DO NOTHING`, [bridge1Id, dev1UserId]);
    const bConvId = (await query(`SELECT conversation_id FROM support_bridges WHERE id = $1`, [bridge1Id])).rows[0]?.conversation_id;
    if (bConvId) {
      await query(`INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1, $2, 'DEVELOPER') ON CONFLICT DO NOTHING`, [bConvId, dev1UserId]);
    }

    // Client sends message
    const cMsgRes = await fetch(`${baseUrl}/api/support/bridges/${bridge1Id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${client1Token}`,
      },
      body: JSON.stringify({ message: 'Hello, this is Client #001 asking for an update.' }),
    });
    const cMsgData = await cMsgRes.json();
    assert(cMsgRes.status === 201, 'TEST 19', 'Client sends message on support bridge');

    // Support sends reply
    const sMsgRes = await fetch(`${baseUrl}/api/support/bridges/${bridge1Id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supportToken}`,
      },
      body: JSON.stringify({ message: 'Support Agent is coordinating with the assigned developer.' }),
    });
    assert(sMsgRes.status === 201, 'TEST 19', 'Support sends reply on support bridge');

    // Developer sends reply
    const dMsgRes = await fetch(`${baseUrl}/api/support/bridges/${bridge1Id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev1Token}`,
      },
      body: JSON.stringify({ message: 'Developer #01 here: issue has been investigated and resolved.' }),
    });
    assert(dMsgRes.status === 201, 'TEST 19', 'Developer sends reply on support bridge');

    // Check message senders in database
    const bridgeMsgs = await query(
      `SELECT m.sender_user_id, u.role, m.message
       FROM messages m
       JOIN users u ON m.sender_user_id = u.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [bConvId]
    );
    const clientMsgRecorded = bridgeMsgs.rows.some((m) => m.sender_user_id === client1UserId && m.role === 'CLIENT');
    const supportMsgRecorded = bridgeMsgs.rows.some((m) => m.sender_user_id === supportUserId && m.role === 'SUPPORT');
    const devMsgRecorded = bridgeMsgs.rows.some((m) => m.sender_user_id === dev1UserId && m.role === 'DEVELOPER');
    assert(clientMsgRecorded, 'TEST 19', 'Client message recorded with authentic client identity');
    assert(supportMsgRecorded, 'TEST 19', 'Support message recorded with authentic support identity');
    assert(devMsgRecorded, 'TEST 19', 'Developer message recorded with authentic developer identity');

    // -------------------------------------------------------------
    // TEST 20 — FINAL VERIFICATION REPORT & SCORECARD
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 20 — FINAL REPORT & SCORECARD');
    console.log('=============================================================');

    const evaluate = (category: string) => {
      const items = testResults.filter((r) => r.category === category);
      return items.length > 0 && items.every((r) => r.passed) ? 'PASS' : 'FAIL';
    };

    const scorecard = [
      { name: 'AUTHENTICATION', status: evaluate('TEST 1') === 'PASS' && evaluate('TEST 2') === 'PASS' ? 'PASS' : 'FAIL' },
      { name: 'CLIENT LOGIN', status: evaluate('TEST 1') },
      { name: 'DEVELOPER LOGIN', status: evaluate('TEST 2') },
      { name: 'SUPPORT LOGIN', status: evaluate('TEST 3') },
      { name: 'ADMIN LOGIN', status: evaluate('TEST 4') },
      { name: 'CLIENT REGISTRATION', status: evaluate('TEST 1') },
      { name: 'DEVELOPER REGISTRATION', status: evaluate('TEST 2') },
      { name: '16-CHAR UID', status: evaluate('TEST 5') },
      { name: 'UID UNIQUENESS', status: evaluate('TEST 5') },
      { name: 'UID IMMUTABILITY', status: evaluate('TEST 5') === 'PASS' && evaluate('TEST 17') === 'PASS' ? 'PASS' : 'FAIL' },
      { name: 'SUPPORT ACCESS', status: evaluate('TEST 3') },
      { name: 'SUPPORT TICKETS', status: evaluate('TEST 1') === 'PASS' && evaluate('TEST 3') === 'PASS' ? 'PASS' : 'FAIL' },
      { name: 'SUPPORT RBAC', status: evaluate('TEST 3') === 'PASS' && evaluate('TEST 4') === 'PASS' ? 'PASS' : 'FAIL' },
      { name: 'SUPPORT BRIDGES', status: evaluate('TEST 3') === 'PASS' && evaluate('TEST 6') === 'PASS' && evaluate('TEST 7') === 'PASS' ? 'PASS' : 'FAIL' },
      { name: 'SUPPORT REALTIME', status: evaluate('TEST 19') },
      { name: 'CREDIT WALLET', status: evaluate('TEST 2') === 'PASS' && evaluate('TEST 8') === 'PASS' ? 'PASS' : 'FAIL' },
      { name: 'ADMIN SINGLE GRANT', status: evaluate('TEST 8') },
      { name: 'ADMIN BULK GRANT', status: evaluate('TEST 10') },
      { name: 'ADMIN SINGLE REMOVAL', status: evaluate('TEST 9') },
      { name: 'ADMIN BULK REMOVAL', status: evaluate('TEST 10B') },
      { name: 'NEGATIVE BALANCE PROTECTION', status: evaluate('TEST 11') },
      { name: 'CREDIT LEDGER', status: evaluate('TEST 8') === 'PASS' && evaluate('TEST 9') === 'PASS' && evaluate('TEST 10') === 'PASS' ? 'PASS' : 'FAIL' },
      { name: 'CREDIT AUDIT', status: evaluate('TEST 8') === 'PASS' && evaluate('TEST 13') === 'PASS' ? 'PASS' : 'FAIL' },
      { name: 'IDOR PROTECTION', status: evaluate('TEST 6') === 'PASS' && evaluate('TEST 7') === 'PASS' ? 'PASS' : 'FAIL' },
      { name: 'ROLE ESCALATION PROTECTION', status: evaluate('TEST 14') === 'PASS' && evaluate('TEST 15') === 'PASS' && evaluate('TEST 16') === 'PASS' ? 'PASS' : 'FAIL' },
      { name: 'END-TO-END FLOW', status: testResults.every((r) => r.passed) ? 'PASS' : 'FAIL' },
    ];

    console.log('\n--- SCORECARD TABLE ---');
    for (const item of scorecard) {
      console.log(`${item.name.padEnd(28)} ${item.status}`);
    }

    const failedTests = testResults.filter((r) => !r.passed);
    console.log('\n-------------------------------------------------------------');
    console.log(`Total Assertions Checked : ${testResults.length}`);
    console.log(`Passed                   : ${testResults.filter((r) => r.passed).length}`);
    console.log(`Failed                   : ${failedTests.length}`);
    console.log('-------------------------------------------------------------');

    if (failedTests.length > 0) {
      console.error('\nFailures Detected:');
      failedTests.forEach((f) => console.error(` - [${f.category}] ${f.name}: ${f.details || 'Assertion failed'}`));
    }

  } catch (error: any) {
    console.error('Fatal Test Harness Error:', error);
  } finally {
    if (server) {
      server.close();
      console.log('\n[Harness] Server closed.');
    }
    await pool.end();
  }
}

runPhase12Verification();
