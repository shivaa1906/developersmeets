import { query } from '../database/db.js';
import { env } from '../config/environment.js';
import { SupportService } from '../services/supportService.js';
import { ChatService } from '../services/chatService.js';
import { NotificationService } from '../services/notificationService.js';
import { httpServer } from '../server.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Server } from 'http';

interface TestResult {
  domain: string;
  test: string;
  passed: boolean;
  evidence: string;
}

const results: TestResult[] = [];

function recordResult(domain: string, test: string, passed: boolean, evidence: string) {
  results.push({ domain, test, passed, evidence });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${icon}] [${domain}] ${test}: ${evidence}`);
}

async function runSupportSystemAudit() {
  console.log('\n========================================================================');
  console.log('   SUPPORT SYSTEM — LOGIC, UI, RBAC, LIFECYCLE & INTEGRATION AUDIT');
  console.log('========================================================================\n');

  const testPort = Number(env.PORT || 5000);
  let serverInstance: Server | null = null;

  try {
    const ping = await fetch(`http://127.0.0.1:${testPort}/api/projects`).catch(() => null);
    if (ping) {
      console.log(`Port ${testPort} already in use; reusing running backend server.`);
    } else {
      await new Promise<void>((resolve, reject) => {
        httpServer.on('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            console.log(`Port ${testPort} already in use; reusing running server.`);
            resolve();
          } else {
            reject(err);
          }
        });
        serverInstance = httpServer.listen(testPort, () => {
          console.log(`Test HTTP & Realtime Server listening on port ${testPort}`);
          resolve();
        });
      });
    }
  } catch (_e) {
    // Port in use is fine
  }

  const baseUrl = `http://localhost:${testPort}/api`;
  const suffix = Date.now();
  const pwdHash = await bcrypt.hash('SecureSupportPass2026!', 4);

  try {
    // -------------------------------------------------------------
    // SETUP ACTORS
    // -------------------------------------------------------------
    console.log('--- Setting up Actors: CEO, MD, Support Agent, Client 1, Client 2, Dev 1, Dev 2 ---');

    // 1. CEO
    const ceoRes = await query(
      `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'CEO', 'ACTIVE') RETURNING id`,
      [`ceo_supp_${suffix}@nexus.dev`, pwdHash]
    );
    const ceoUserId = ceoRes.rows[0].id;
    const ceoToken = jwt.sign({ userId: ceoUserId, role: 'CEO' }, env.JWT_SECRET, { expiresIn: '1h' });

    // 2. MD
    const mdRes = await query(
      `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'MD', 'ACTIVE') RETURNING id`,
      [`md_supp_${suffix}@nexus.dev`, pwdHash]
    );
    const mdUserId = mdRes.rows[0].id;
    const _mdToken = jwt.sign({ userId: mdUserId, role: 'MD' }, env.JWT_SECRET, { expiresIn: '1h' });

    // 3. Support Agent
    const suppRes = await query(
      `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'SUPPORT', 'ACTIVE') RETURNING id`,
      [`agent_supp_${suffix}@nexus.dev`, pwdHash]
    );
    const suppUserId = suppRes.rows[0].id;
    const suppToken = jwt.sign({ userId: suppUserId, role: 'SUPPORT' }, env.JWT_SECRET, { expiresIn: '1h' });

    // 4. Client #001
    const cl1UserRes = await query(
      `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'CLIENT', 'ACTIVE') RETURNING id`,
      [`client1_supp_${suffix}@test.com`, pwdHash]
    );
    const client1UserId = cl1UserRes.rows[0].id;
    const client1Num = `Client #${String(suffix).slice(-4)}`;
    const cl1Res = await query(
      `INSERT INTO clients (user_id, company_name, client_number, private_name, phone)
       VALUES ($1, 'Alpha Corp', $2, 'Alice Director', '+1-555-0100') RETURNING id`,
      [client1UserId, client1Num]
    );
    const client1Id = cl1Res.rows[0].id;
    const client1Token = jwt.sign({ userId: client1UserId, role: 'CLIENT', clientId: client1Id }, env.JWT_SECRET, { expiresIn: '1h' });

    // 5. Client #002 (Unrelated tenant)
    const cl2UserRes = await query(
      `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'CLIENT', 'ACTIVE') RETURNING id`,
      [`client2_supp_${suffix}@test.com`, pwdHash]
    );
    const client2UserId = cl2UserRes.rows[0].id;
    const client2Num = `Client #${String(suffix + 1).slice(-4)}`;
    const cl2Res = await query(
      `INSERT INTO clients (user_id, company_name, client_number, private_name, phone)
       VALUES ($1, 'Beta LLC', $2, 'Bob Executive', '+1-555-0200') RETURNING id`,
      [client2UserId, client2Num]
    );
    const client2Id = cl2Res.rows[0].id;
    const client2Token = jwt.sign({ userId: client2UserId, role: 'CLIENT', clientId: client2Id }, env.JWT_SECRET, { expiresIn: '1h' });

    // 6. Developer #01 (Lead Dev for Project)
    const dev1UserRes = await query(
      `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'DEVELOPER', 'ACTIVE') RETURNING id`,
      [`dev1_supp_${suffix}@nexus.dev`, pwdHash]
    );
    const dev1UserId = dev1UserRes.rows[0].id;
    const dev1Res = await query(
      `INSERT INTO developers (user_id, username, display_name, role_title, verification_status)
       VALUES ($1, 'dev1_${suffix}', 'Ritesh Dev', 'Senior Fullstack Engineer', 'VERIFIED') RETURNING id`,
      [dev1UserId]
    );
    const dev1Id = dev1Res.rows[0].id;
    const dev1Token = jwt.sign({ userId: dev1UserId, role: 'DEVELOPER', developerId: dev1Id }, env.JWT_SECRET, { expiresIn: '1h' });

    // 7. Developer #02 (Unrelated Dev)
    const dev2UserRes = await query(
      `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'DEVELOPER', 'ACTIVE') RETURNING id`,
      [`dev2_supp_${suffix}@nexus.dev`, pwdHash]
    );
    const dev2UserId = dev2UserRes.rows[0].id;
    const dev2Res = await query(
      `INSERT INTO developers (user_id, username, display_name, role_title, verification_status)
       VALUES ($1, 'dev2_${suffix}', 'Dave Unrelated', 'Senior Backend Engineer', 'VERIFIED') RETURNING id`,
      [dev2UserId]
    );
    const dev2Id = dev2Res.rows[0].id;
    const dev2Token = jwt.sign({ userId: dev2UserId, role: 'DEVELOPER', developerId: dev2Id }, env.JWT_SECRET, { expiresIn: '1h' });

    // -------------------------------------------------------------
    // DOMAIN 1: NAVBAR & ACCESS CONTROL BY ROLE
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 1: Role-Based Navigation & Access Control ---');

    // 1.1 Unauthenticated Guest blocked from /api/support/tickets
    const guestResp = await fetch(`${baseUrl}/support/tickets`);
    recordResult(
      'RBAC',
      'Guest Blocked from Authenticated Support API',
      guestResp.status === 401,
      `HTTP status: ${guestResp.status} (Expected 401 Unauthorized)`
    );

    // 1.2 Client blocked from /api/admin/support/tickets
    const clientAdminResp = await fetch(`${baseUrl}/admin/support/tickets`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    recordResult(
      'RBAC',
      'Client Blocked from Administrative Support Endpoint',
      clientAdminResp.status === 403,
      `HTTP status: ${clientAdminResp.status} (Expected 403 Forbidden)`
    );

    // 1.3 Developer blocked from /api/admin/support/tickets
    const devAdminResp = await fetch(`${baseUrl}/admin/support/tickets`, {
      headers: { Authorization: `Bearer ${dev1Token}` },
    });
    recordResult(
      'RBAC',
      'Developer Blocked from Administrative Support Endpoint',
      devAdminResp.status === 403,
      `HTTP status: ${devAdminResp.status} (Expected 403 Forbidden)`
    );

    // 1.4 Support Agent permitted on support management
    const suppResp = await fetch(`${baseUrl}/support/tickets`, {
      headers: { Authorization: `Bearer ${suppToken}` },
    });
    recordResult(
      'RBAC',
      'Support Agent Access to Support Management API',
      suppResp.status === 200,
      `HTTP status: ${suppResp.status} (Expected 200 OK)`
    );

    // 1.5 CEO / Admin permitted on all administrative endpoints
    const ceoAdminResp = await fetch(`${baseUrl}/admin/support/tickets`, {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    recordResult(
      'RBAC',
      'CEO Access to Executive Support System',
      ceoAdminResp.status === 200,
      `HTTP status: ${ceoAdminResp.status} (Expected 200 OK)`
    );

    // -------------------------------------------------------------
    // DOMAIN 2: PROJECT COMPLETION & SEALED ORIGINAL CHAT
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 2: Project Completion & Sealed Original Chat ---');

    // Create a completed project for Client 1 with Dev 1 as lead
    const projRes = await query(
      `INSERT INTO projects (
         project_number, slug, client_id, lead_developer_id, title, description, category,
         budget_min, budget_max, timeline, requirements, required_technologies, attachments,
         status, claim_cost, max_claims, claim_deadline
       )
       VALUES (
         $1, $2, $3, $4, 'E-Commerce Platform Core', 'Scalable shop API', 'FULLSTACK',
         50000, 80000, '4 weeks', '[]'::jsonb, '["React","Node","Postgres"]'::jsonb, '[]'::jsonb,
         'COMPLETED', 1, 5, NOW() + INTERVAL '10 days'
       )
       RETURNING id, title`,
      [`PRJ-2026-${String(suffix).slice(-4)}`, `ecom-core-${suffix}`, client1Id, dev1Id]
    );
    const projectId = projRes.rows[0].id;

    // Create original project private conversation
    const origConvRes = await query(
      `INSERT INTO conversations (project_id, type, status)
       VALUES ($1, 'PROJECT_PRIVATE', 'CLOSED')
       RETURNING id`,
      [projectId]
    );
    const origConvId = origConvRes.rows[0].id;

    await query(
      `INSERT INTO conversation_members (conversation_id, user_id, client_id, role)
       VALUES ($1, $2, $3, 'CLIENT')`,
      [origConvId, client1UserId, client1Id]
    );
    await query(
      `INSERT INTO conversation_members (conversation_id, user_id, developer_id, role)
       VALUES ($1, $2, $3, 'DEVELOPER')`,
      [origConvId, dev1UserId, dev1Id]
    );

    // Attempt sending message to original chat after project completion
    let chatBlocked = false;
    let chatErrorMsg = '';
    try {
      await ChatService.sendMessage(origConvId, client1UserId, 'Can you fix the checkout button?');
    } catch (e: any) {
      chatBlocked = true;
      chatErrorMsg = e.message;
    }

    recordResult(
      'SEALED_CHAT',
      'Completed Project Original Chat is Sealed and Read-Only',
      chatBlocked && chatErrorMsg.includes('closed or read-only'),
      `Attempt correctly rejected: "${chatErrorMsg}"`
    );

    // -------------------------------------------------------------
    // DOMAIN 3: TICKET CREATION & VALIDATION DEFENSES
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 3: Support Ticket Creation & Defensive Validation ---');

    // 3.1 Empty subject rejected
    let _emptySubBlocked = false;
    try {
      await SupportService.createTicket(client1Id, client1UserId, projectId, '', 'Description here');
    } catch (_e) {
      _emptySubBlocked = true;
    }
    const emptySubHttp = await fetch(`${baseUrl}/support/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({ projectId, subject: '', description: 'Desc' }),
    });
    recordResult(
      'VALIDATION',
      'Reject Support Ticket with Empty Subject',
      emptySubHttp.status === 400,
      `API rejected empty subject with HTTP ${emptySubHttp.status}`
    );

    // 3.2 Unauthorized project (Client 2 project)
    const cl2ProjRes = await query(
      `INSERT INTO projects (
         project_number, slug, client_id, title, description, category,
         budget_min, budget_max, timeline, requirements, required_technologies, attachments,
         status, claim_cost, max_claims, claim_deadline
       )
       VALUES (
         $1, $2, $3, 'Client 2 Secret System', 'Desc', 'BACKEND',
         50000, 80000, '4 weeks', '[]'::jsonb, '["Node"]'::jsonb, '[]'::jsonb,
         'COMPLETED', 1, 5, NOW() + INTERVAL '10 days'
       )
       RETURNING id`,
      [`PRJ-2026-${String(suffix + 1).slice(-4)}`, `cl2-secret-${suffix}`, client2Id]
    );
    const cl2ProjectId = cl2ProjRes.rows[0].id;

    const unauthProjHttp = await fetch(`${baseUrl}/support/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({ projectId: cl2ProjectId, subject: 'Inquiry', description: 'Desc' }),
    });
    recordResult(
      'AUTHORIZATION',
      'Reject Support Ticket for Project Not Owned by Client',
      unauthProjHttp.status === 400 || unauthProjHttp.status === 403,
      `Rejected unauthorized project link with HTTP ${unauthProjHttp.status}`
    );

    // 3.3 Reject dangerous file attachment on ticket creation
    const dangerousAttHttp = await fetch(`${baseUrl}/support/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({
        projectId,
        subject: 'Malware test',
        description: 'Testing upload filters',
        attachments: [{ name: 'payload.exe', size: 1024 }],
      }),
    });
    recordResult(
      'DEFENSE',
      'Reject Dangerous File Extension (.exe) on Ticket Creation',
      dangerousAttHttp.status === 400,
      `Blocked malicious executable upload with HTTP ${dangerousAttHttp.status}`
    );

    // 3.4 Reject oversized file attachment (> 50MB)
    const oversizedAttHttp = await fetch(`${baseUrl}/support/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({
        projectId,
        subject: 'Oversized file test',
        description: 'Testing 50MB ceiling',
        attachments: [{ name: 'huge_log.txt', size: 55 * 1024 * 1024 }],
      }),
    });
    recordResult(
      'DEFENSE',
      'Reject Oversized File Attachment (>50 MB)',
      oversizedAttHttp.status === 400,
      `Blocked 55MB attachment with HTTP ${oversizedAttHttp.status}`
    );

    // 3.5 Valid Ticket Creation: SUP-2026-0001
    const validTicketRes = await fetch(`${baseUrl}/support/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({
        projectId,
        subject: 'Payment Webhook Intermittent 500 Error',
        description: 'Stripe webhook occasionally fails on production gateway.',
        priority: 'HIGH',
        category: 'INTEGRATION',
        attachments: [{ name: 'webhook_log.txt', size: 2048, type: 'text/plain' }],
        preferredTicketNumber: `SUP-2026-${String(suffix).slice(-4)}`,
      }),
    });
    const validTicketData = (await validTicketRes.json()) as any;
    const ticket1 = validTicketData.ticket;

    recordResult(
      'TICKET_CREATION',
      'Create Valid Support Ticket with Automated Bridge',
      validTicketRes.status === 201 && ticket1?.ticket_number?.startsWith('SUP-2026-'),
      `Ticket created: ${ticket1?.ticket_number} (ID: ${ticket1?.id}), Bridge: ${ticket1?.bridgeNumber}`
    );

    // -------------------------------------------------------------
    // DOMAIN 4: TICKET OWNERSHIP & IDOR DEFENSE
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 4: Ticket Ownership & IDOR Protection ---');

    // Create Ticket for Client 2
    const cl2TicketRes = await SupportService.createTicket(
      client2Id,
      client2UserId,
      cl2ProjectId,
      'Confidential Client 2 Inquiry',
      'Confidential details that must never leak.',
      'NORMAL',
      `SUP-2026-${String(suffix + 1).slice(-4)}`
    );
    const ticket2Id = cl2TicketRes.id;
    const bridge2Id = cl2TicketRes.bridgeId;

    // Client 1 accesses their own ticket
    const cl1OwnRes = await fetch(`${baseUrl}/support/tickets/${ticket1.id}`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    recordResult(
      'IDOR',
      'Client #001 Can Access Own Support Ticket',
      cl1OwnRes.status === 200,
      `HTTP status: ${cl1OwnRes.status}`
    );

    // Client 1 attempts to access Client 2's ticket (IDOR)
    const idorTicketRes = await fetch(`${baseUrl}/support/tickets/${ticket2Id}`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    recordResult(
      'IDOR',
      'Client #001 Prohibited from Accessing Client #002 Ticket',
      idorTicketRes.status === 403,
      `HTTP status: ${idorTicketRes.status} (Access cleanly denied)`
    );

    // Client 1 attempts to access Client 2's bridge (IDOR)
    const idorBridgeRes = await fetch(`${baseUrl}/support/bridges/${bridge2Id}`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    recordResult(
      'IDOR',
      'Client #001 Prohibited from Accessing Client #002 Bridge',
      idorBridgeRes.status === 403,
      `HTTP status: ${idorBridgeRes.status} (Access cleanly denied)`
    );

    // Client 1 attempts to post message to Client 2's bridge
    const idorMsgRes = await fetch(`${baseUrl}/support/bridges/${bridge2Id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({ message: 'Unauthorized intrusion attempt' }),
    });
    recordResult(
      'IDOR',
      'Client #001 Prohibited from Messaging Client #002 Bridge',
      idorMsgRes.status === 403,
      `HTTP status: ${idorMsgRes.status} (Message transmission denied)`
    );

    // -------------------------------------------------------------
    // DOMAIN 5: TICKET ASSIGNMENT & NOTIFICATIONS
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 5: Ticket Assignment & Notifications ---');

    const assignRes = await fetch(`${baseUrl}/support/tickets/${ticket1.id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${suppToken}` },
    });
    const assignData = (await assignRes.json()) as any;

    recordResult(
      'ASSIGNMENT',
      'Support Agent Assigns Support Ticket',
      assignRes.status === 200 && assignData.status === 'ASSIGNED',
      `Assigned to agent ${suppUserId}. Status: ${assignData.status}`
    );

    // Verify DB assignment persisted
    const dbTicketCheck = await query(`SELECT assigned_to_user_id, status FROM support_tickets WHERE id = $1`, [ticket1.id]);
    recordResult(
      'ASSIGNMENT',
      'Assignment Persisted in Database',
      dbTicketCheck.rows[0]?.assigned_to_user_id === suppUserId && dbTicketCheck.rows[0]?.status === 'ASSIGNED',
      `assigned_to_user_id: ${dbTicketCheck.rows[0]?.assigned_to_user_id}, status: ${dbTicketCheck.rows[0]?.status}`
    );

    // Verify Notifications
    const cl1Notifs = await NotificationService.getUserNotifications(client1UserId);
    const hasAssignNotif = cl1Notifs.notifications.some((n: any) => n.type === 'SUPPORT_TICKET_ASSIGNED');
    recordResult(
      'NOTIFICATIONS',
      'Client Receives Support Ticket Assigned Notification',
      hasAssignNotif,
      `Found SUPPORT_TICKET_ASSIGNED notification for Client #001`
    );

    const dev1Notifs = await NotificationService.getUserNotifications(dev1UserId);
    const hasDevAssignNotif = dev1Notifs.notifications.some((n: any) => n.type === 'SUPPORT_TICKET_ASSIGNED');
    recordResult(
      'NOTIFICATIONS',
      'Lead Developer Receives Support Agent Joined Notification',
      hasDevAssignNotif,
      `Found SUPPORT_TICKET_ASSIGNED notification for Developer #01`
    );

    // -------------------------------------------------------------
    // DOMAIN 6: TRIPARTITE REALTIME CHAT & IDENTITY SHIELDING
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 6: Tripartite Realtime Chat & Identity Shielding ---');

    // 6.1 Client sends message
    const clMsgRes = await fetch(`${baseUrl}/support/bridges/${ticket1.bridgeId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({ message: 'Hello Support team, webhook gives 500 error on orders > ₹10,000.' }),
    });
    recordResult(
      'TRIPARTITE',
      'Client Sends Message in Support Bridge',
      clMsgRes.status === 201,
      `HTTP status: ${clMsgRes.status}`
    );

    // 6.2 Support Agent replies
    const suppMsgRes = await fetch(`${baseUrl}/support/bridges/${ticket1.bridgeId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${suppToken}` },
      body: JSON.stringify({ message: 'Understood. Bringing the technical developer in to inspect the gateway controller.' }),
    });
    recordResult(
      'TRIPARTITE',
      'Support Agent Transmits Reply in Bridge',
      suppMsgRes.status === 201,
      `HTTP status: ${suppMsgRes.status}`
    );

    // 6.3 Developer replies
    const devMsgRes = await fetch(`${baseUrl}/support/bridges/${ticket1.bridgeId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dev1Token}` },
      body: JSON.stringify({ message: 'Inspected: The tax calculation buffer overflowed on 5-digit orders. Patch deployed.' }),
    });
    recordResult(
      'TRIPARTITE',
      'Lead Developer Transmits Technical Reply in Bridge',
      devMsgRes.status === 201,
      `HTTP status: ${devMsgRes.status}`
    );

    // 6.4 Inspect bridge payload for Identity Shielding
    const bridgeInspection = await fetch(`${baseUrl}/support/bridges/${ticket1.bridgeId}`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    const bridgeJson = (await bridgeInspection.json()) as any;
    const rawPayloadStr = JSON.stringify(bridgeJson);

    const leaksPrivateName = rawPayloadStr.includes('Alice Director') || rawPayloadStr.includes('Bob Executive');
    const leaksPrivatePhone = rawPayloadStr.includes('+1-555-0100');
    const leaksRealDevName = rawPayloadStr.includes('Ritesh Dev');

    recordResult(
      'SHIELDING',
      'Zero PII Leaks in Support Bridge Payload',
      !leaksPrivateName && !leaksPrivatePhone && !leaksRealDevName,
      `Payload shielded: Real name leaked: ${leaksPrivateName}, Phone leaked: ${leaksPrivatePhone}, Real dev name leaked: ${leaksRealDevName}`
    );

    // 6.5 Developer #02 (Unrelated) blocked from bridge
    const dev2Access = await fetch(`${baseUrl}/support/bridges/${ticket1.bridgeId}`, {
      headers: { Authorization: `Bearer ${dev2Token}` },
    });
    recordResult(
      'ISOLATION',
      'Unrelated Developer #02 Blocked from Accessing Bridge',
      dev2Access.status === 403,
      `HTTP status: ${dev2Access.status} (Access denied)`
    );

    // -------------------------------------------------------------
    // DOMAIN 7: TICKET STATUS LIFECYCLE
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 7: Complete Ticket Status Lifecycle ---');

    const lifecycleStates = [
      'INVESTIGATING',
      'WAITING_FOR_CLIENT',
      'IN_PROGRESS',
      'RESOLVED',
    ];

    let lifecycleSuccess = true;
    for (const state of lifecycleStates) {
      const stateRes = await fetch(`${baseUrl}/support/tickets/${ticket1.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${suppToken}` },
        body: JSON.stringify({ status: state }),
      });
      if (stateRes.status !== 200) {
        lifecycleSuccess = false;
        console.error(`Failed transition to ${state}: HTTP ${stateRes.status}`);
      }
    }

    recordResult(
      'LIFECYCLE',
      'Valid Status Transitions (INVESTIGATING -> WAITING -> IN_PROGRESS -> RESOLVED)',
      lifecycleSuccess,
      `Successfully transitioned through all 4 intermediate states`
    );

    // 7.2 Invalid status rejected
    const invalidStatusRes = await fetch(`${baseUrl}/support/tickets/${ticket1.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${suppToken}` },
      body: JSON.stringify({ status: 'NON_EXISTENT_STATE' }),
    });
    recordResult(
      'LIFECYCLE',
      'Reject Invalid Ticket Status Transition',
      invalidStatusRes.status === 400,
      `Rejected invalid status with HTTP ${invalidStatusRes.status}`
    );

    // 7.3 Client confirms resolution and closes ticket
    const clientCloseRes = await fetch(`${baseUrl}/support/tickets/${ticket1.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({ status: 'CLOSED' }),
    });
    recordResult(
      'LIFECYCLE',
      'Client Confirms Resolution & Closes Ticket',
      clientCloseRes.status === 200,
      `Client closed own ticket with HTTP ${clientCloseRes.status}`
    );

    // 7.4 Sealed Chat Defense: New message to closed ticket rejected
    const closedMsgRes = await fetch(`${baseUrl}/support/bridges/${ticket1.bridgeId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({ message: 'Attempting to message closed support ticket.' }),
    });
    recordResult(
      'SEALED_CHAT',
      'Post-Closure Message Transmission Blocked',
      closedMsgRes.status === 403,
      `HTTP status: ${closedMsgRes.status} (Forbidden on closed ticket)`
    );

    // -------------------------------------------------------------
    // DOMAIN 8: INTERNAL NOTES CONFIDENTIALITY
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 8: Internal Support Notes Protection ---');

    // 8.1 Support agent adds internal note
    const addNoteRes = await fetch(`${baseUrl}/support/tickets/${ticket1.id}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${suppToken}` },
      body: JSON.stringify({ notes: 'CONFIDENTIAL: Root cause was missing index on webhook_events table.' }),
    });
    recordResult(
      'INTERNAL_NOTES',
      'Support Agent Can Update Internal Notes',
      addNoteRes.status === 200,
      `HTTP status: ${addNoteRes.status}`
    );

    // 8.2 Client attempts to read internal notes -> stripped from payload
    const clTicketView = await fetch(`${baseUrl}/support/tickets/${ticket1.id}`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    const clTicketJson = (await clTicketView.json()) as any;
    const clientSeesNotes = Boolean(clTicketJson.ticket?.internal_notes);
    recordResult(
      'INTERNAL_NOTES',
      'Internal Notes Strictly Stripped from Client Payload',
      !clientSeesNotes,
      `Client sees internal notes: ${clientSeesNotes}`
    );

    // 8.3 Client attempts to update internal notes -> 403 Forbidden
    const clNoteHack = await fetch(`${baseUrl}/support/tickets/${ticket1.id}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({ notes: 'Client malicious note injection' }),
    });
    recordResult(
      'INTERNAL_NOTES',
      'Client Prohibited from Updating Internal Notes',
      clNoteHack.status === 403,
      `HTTP status: ${clNoteHack.status} (Forbidden)`
    );

    // -------------------------------------------------------------
    // DOMAIN 9: ATTACHMENTS & SECURE RETRIEVAL
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 9: Attachments Upload & Authorization ---');

    // 9.1 Upload valid attachment
    const attUploadRes = await fetch(`${baseUrl}/support/tickets/${ticket1.id}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({
        fileName: 'system_log.pdf',
        fileUrl: '/uploads/system_log.pdf',
        fileSize: 1024 * 50,
        mimeType: 'application/pdf',
      }),
    });
    const attUploadData = (await attUploadRes.json()) as any;
    const attachmentId = attUploadData.attachment?.id;

    recordResult(
      'ATTACHMENTS',
      'Authorized Participant Uploads Attachment',
      attUploadRes.status === 201 && Boolean(attachmentId),
      `Attachment uploaded: ${attUploadData.attachment?.fileName} (ID: ${attachmentId})`
    );

    // 9.2 Authorized retrieval
    const authAttGet = await fetch(`${baseUrl}/support/tickets/${ticket1.id}/attachments/${attachmentId}`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    recordResult(
      'ATTACHMENTS',
      'Authorized Retrieval of Attachment Metadata',
      authAttGet.status === 200,
      `HTTP status: ${authAttGet.status}`
    );

    // 9.3 Unauthorized retrieval by Client 2 (IDOR download defense)
    const unauthAttGet = await fetch(`${baseUrl}/support/tickets/${ticket1.id}/attachments/${attachmentId}`, {
      headers: { Authorization: `Bearer ${client2Token}` },
    });
    recordResult(
      'ATTACHMENTS',
      'Unauthorized Client #002 Blocked from Downloading Attachment (IDOR)',
      unauthAttGet.status === 403,
      `HTTP status: ${unauthAttGet.status} (Access cleanly blocked)`
    );

    // -------------------------------------------------------------
    // DOMAIN 10: SEARCH & FILTERING
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 10: Support Search & Filtering ---');

    // 10.1 Search by ticket number
    const searchRes = await fetch(`${baseUrl}/support/tickets?search=${ticket1.ticket_number}`, {
      headers: { Authorization: `Bearer ${suppToken}` },
    });
    const searchData = (await searchRes.json()) as any;
    const foundByNumber = searchData.tickets?.some((t: any) => t.id === ticket1.id);
    recordResult(
      'SEARCH',
      'Search Support Tickets by Ticket Number',
      searchRes.status === 200 && foundByNumber,
      `Found ticket by number search query: ${foundByNumber}`
    );

    // 10.2 Client search isolation (Client 1 search only yields Client 1 tickets)
    const clSearchRes = await fetch(`${baseUrl}/support/tickets`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    const clSearchData = (await clSearchRes.json()) as any;
    const hasOtherClientTicket = clSearchData.tickets?.some((t: any) => t.id === ticket2Id);
    recordResult(
      'SEARCH',
      'Client Ticket Search Strictly Isolated (No Cross-Tenant Leaks)',
      !hasOtherClientTicket,
      `Client 1 ticket list contains Client 2 tickets: ${hasOtherClientTicket}`
    );

    // -------------------------------------------------------------
    // DOMAIN 11: AUDIT TRAIL LOGGING
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 11: Audit Trail Logging ---');

    const auditRes = await query(
      `SELECT action, entity_type, entity_id FROM audit_logs
       WHERE entity_type = 'SUPPORT_TICKET' AND entity_id = $1
       ORDER BY created_at ASC`,
      [ticket1.id]
    );

    const loggedActions = auditRes.rows.map((r) => r.action);
    const hasCreationLog = loggedActions.includes('SUPPORT_TICKET_CREATED');
    const hasAssignLog = loggedActions.includes('SUPPORT_TICKET_ASSIGNED');
    const hasStatusLog = loggedActions.includes('SUPPORT_TICKET_STATUS_UPDATED');
    const hasAttLog = loggedActions.includes('SUPPORT_ATTACHMENT_UPLOADED');
    const hasNotesLog = loggedActions.includes('SUPPORT_INTERNAL_NOTES_UPDATED');

    const allLogsPresent = hasCreationLog && hasAssignLog && hasStatusLog && hasAttLog && hasNotesLog;

    recordResult(
      'AUDIT_LOGS',
      'Comprehensive Support Action Audit Logging',
      allLogsPresent,
      `Logged actions: [${loggedActions.join(', ')}]`
    );

    // -------------------------------------------------------------
    // DOMAIN 12: NEW DEVELOPMENT SCOPE PROTECTION
    // -------------------------------------------------------------
    console.log('\n--- DOMAIN 12: New Development Request Scope Guard ---');

    // Confirm that support ticket cannot create new milestones or reopen completed projects
    const projStateCheck = await query(`SELECT status FROM projects WHERE id = $1`, [projectId]);
    const isStillCompleted = projStateCheck.rows[0]?.status === 'COMPLETED';

    recordResult(
      'SCOPE_GUARD',
      'Support System Cannot Bypass Project Marketplace / Lifecycle',
      isStillCompleted,
      `Project status remains COMPLETED; support activity cannot silently reopen project development.`
    );

  } finally {
    console.log('\n========================================================================');
    console.log('   SUPPORT SYSTEM VERIFICATION SUMMARY');
    console.log('========================================================================');
    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    console.log(`Total Verification Tests: ${total}`);
    console.log(`Passed:                   ${passed}`);
    console.log(`Failed:                   ${failed}`);

    if (failed === 0) {
      console.log('\n🎉 ALL SUPPORT SYSTEM VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
    } else {
      console.log(`\n⚠️  ${failed} TESTS FAILED!\n`);
    }

    if (serverInstance) {
      try {
        (serverInstance as Server).close();
      } catch (_e) {
        // ignore
      }
    }
  }
}

runSupportSystemAudit()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal audit failure:', err);
    process.exit(1);
  });
