import app from '../server.js';
import { query } from '../database/db.js';
import { env } from '../config/environment.js';
import { ROLES } from '../config/constants.js';
import jwt from 'jsonwebtoken';
import { Server } from 'http';
import bcrypt from 'bcryptjs';

interface AuditResults {
  originalChatClosed: boolean;
  ticketCreatedAndLinked: boolean;
  privacyShielded: boolean;
  supportAssigned: boolean;
  bridgeCreated: boolean;
  bridgeChatRealtime: boolean;
  developerAccessControl: boolean;
  clientAccessControl: boolean;
  supportClosureLifecycle: boolean;
  newWorkCreatesNewProject: boolean;
}

export async function runSupportTicketBridgeAudit(): Promise<AuditResults> {
  console.log('================================================================');
  console.log('PHASE 12: SUPPORT TICKET & BRIDGE AUDIT');
  console.log('================================================================\n');

  let server: Server | null = null;
  let baseUrl = '';

  const results: AuditResults = {
    originalChatClosed: false,
    ticketCreatedAndLinked: false,
    privacyShielded: false,
    supportAssigned: false,
    bridgeCreated: false,
    bridgeChatRealtime: false,
    developerAccessControl: false,
    clientAccessControl: false,
    supportClosureLifecycle: false,
    newWorkCreatesNewProject: false,
  };

  try {
    // 0. Start live test server
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server?.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`[Audit Harness] Live test server listening at ${baseUrl}`);
        resolve();
      });
    });

    const runId = Date.now().toString().slice(-6);
    const passwordHash = await bcrypt.hash('TestSecurePass123!', 10);

    // 1. Provision Client #001
    const client1Check = await query("SELECT id, user_id FROM clients WHERE client_number = 'Client #001' LIMIT 1");
    let client1Id = '';
    let client1UserId = '';
    if (client1Check.rows.length === 0) {
      const u = await query(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES ('client001.support@nexus.test', $1, 'CLIENT', 'ACTIVE')
         RETURNING id`,
        [passwordHash]
      );
      client1UserId = u.rows[0].id;
      const c = await query(
        `INSERT INTO clients (user_id, client_number, company_name, private_name, phone)
         VALUES ($1, 'Client #001', 'Enterprise AI Solutions Ltd', 'Sunil Mehta', '+91 9876543210')
         RETURNING id`,
        [client1UserId]
      );
      client1Id = c.rows[0].id;
    } else {
      client1Id = client1Check.rows[0].id;
      client1UserId = client1Check.rows[0].user_id;
    }

    const tokenClient1 = jwt.sign(
      { userId: client1UserId, role: ROLES.CLIENT, clientId: client1Id },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // 2. Provision Client #002 (Unrelated Client)
    const client2Check = await query("SELECT id, user_id FROM clients WHERE client_number = 'Client #002' LIMIT 1");
    let client2Id = '';
    let client2UserId = '';
    if (client2Check.rows.length === 0) {
      const u = await query(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES ('client002.support@nexus.test', $1, 'CLIENT', 'ACTIVE')
         RETURNING id`,
        [passwordHash]
      );
      client2UserId = u.rows[0].id;
      const c = await query(
        `INSERT INTO clients (user_id, client_number, company_name, private_name, phone)
         VALUES ($1, 'Client #002', 'Global Logistics Corp', 'Rajesh Gupta', '+91 9988776655')
         RETURNING id`,
        [client2UserId]
      );
      client2Id = c.rows[0].id;
    } else {
      client2Id = client2Check.rows[0].id;
      client2UserId = client2Check.rows[0].user_id;
    }

    const tokenClient2 = jwt.sign(
      { userId: client2UserId, role: ROLES.CLIENT, clientId: client2Id },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // 3. Provision Developer #01 (Lead Developer)
    const dev1User = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'DEVELOPER', 'ACTIVE')
       RETURNING id`,
      [`dev01_supp_${runId}@nexus.dev`, passwordHash]
    );
    const dev1UserId = dev1User.rows[0].id;

    const dev1Res = await query(
      `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status)
       VALUES ($1, $2, 'Rohan Sharma', 'Principal Engineer', 8, 'VERIFIED')
       RETURNING id`,
      [dev1UserId, `dev01_supp_${runId}`]
    );
    const dev1Id = dev1Res.rows[0].id;

    const tokenDev1 = jwt.sign(
      { userId: dev1UserId, role: ROLES.DEVELOPER, developerId: dev1Id },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // 4. Provision Developer #02 (Unrelated Developer)
    const dev2User = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'DEVELOPER', 'ACTIVE')
       RETURNING id`,
      [`dev02_supp_${runId}@nexus.dev`, passwordHash]
    );
    const dev2UserId = dev2User.rows[0].id;

    const dev2Res = await query(
      `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status)
       VALUES ($1, $2, 'Vikram Sen', 'Backend Engineer', 5, 'VERIFIED')
       RETURNING id`,
      [dev2UserId, `dev02_supp_${runId}`]
    );
    const dev2Id = dev2Res.rows[0].id;

    const tokenDev2 = jwt.sign(
      { userId: dev2UserId, role: ROLES.DEVELOPER, developerId: dev2Id },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // 5. Provision Support Agent
    const suppUser = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'SUPPORT', 'ACTIVE')
       RETURNING id`,
      [`support_agent_${runId}@nexus.internal`, passwordHash]
    );
    const supportUserId = suppUser.rows[0].id;

    const tokenSupport = jwt.sign(
      { userId: supportUserId, role: ROLES.SUPPORT },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // 6. Setup Completed Project #0001
    const pNumber = `PRJ-2026-0001`;
    // Clean up any old PRJ-2026-0001 for this test run if necessary or create
    const projectRow = await query("SELECT id FROM projects WHERE project_number = $1 LIMIT 1", [pNumber]);
    let projectId = '';
    if (projectRow.rows.length === 0) {
      const pRes = await query(
        `INSERT INTO projects (
           project_number, slug, title, description, category,
           budget_min, budget_max, timeline, requirements, required_technologies,
           status, claim_cost, max_claims, claim_deadline, client_id, lead_developer_id
         ) VALUES (
           $1, $2, 'Autonomous AI E-Commerce Engine',
           'High-throughput distributed commerce system with real-time vector search and multi-tenant billing.',
           'Full-Stack Development', 50000, 80000, '45 Days',
           '["React", "Node.js", "PostgreSQL"]'::jsonb,
           '["React", "Node.js", "PostgreSQL"]'::jsonb,
           'COMPLETED', 1, 3, NOW() + INTERVAL '14 days', $3, $4
         ) RETURNING id`,
        [pNumber, `ai-ecommerce-${runId}`, client1Id, dev1Id]
      );
      projectId = pRes.rows[0].id;
    } else {
      projectId = projectRow.rows[0].id;
      await query(
        `UPDATE projects SET status = 'COMPLETED', client_id = $1, lead_developer_id = $2 WHERE id = $3`,
        [client1Id, dev1Id, projectId]
      );
    }

    // Create original project chat conversation (CLOSED / READ_ONLY)
    const convRes = await query(
      `INSERT INTO conversations (project_id, type, status, closed_at)
       VALUES ($1, 'PROJECT_PRIVATE', 'CLOSED', NOW())
       RETURNING id`,
      [projectId]
    );
    const originalConversationId = convRes.rows[0].id;

    await query(
      `INSERT INTO conversation_members (conversation_id, user_id, client_id, role)
       VALUES ($1, $2, $3, 'CLIENT')`,
      [originalConversationId, client1UserId, client1Id]
    );
    await query(
      `INSERT INTO conversation_members (conversation_id, user_id, developer_id, role)
       VALUES ($1, $2, $3, 'DEVELOPER')`,
      [originalConversationId, dev1UserId, dev1Id]
    );

    // Clean up any existing SUP-2026-0001 ticket or SUPPORT BRIDGE #001 before test
    await query(`
      DELETE FROM support_bridge_members 
      WHERE bridge_id IN (
        SELECT id FROM support_bridges 
        WHERE bridge_number = 'SUPPORT BRIDGE #001' 
           OR ticket_id IN (SELECT id FROM support_tickets WHERE ticket_number = 'SUP-2026-0001')
      )
    `);
    await query(`
      DELETE FROM support_bridges 
      WHERE bridge_number = 'SUPPORT BRIDGE #001' 
         OR ticket_id IN (SELECT id FROM support_tickets WHERE ticket_number = 'SUP-2026-0001')
    `);
    await query(`DELETE FROM support_tickets WHERE ticket_number = 'SUP-2026-0001'`);

    // -------------------------------------------------------------------------
    // TEST SECTION 1: VERIFY ORIGINAL CHAT IS CLOSED / READ-ONLY
    // -------------------------------------------------------------------------
    console.log('[Test 1] Verifying original completed project chat is CLOSED / READ_ONLY...');
    const chatAttemptRes = await fetch(`${baseUrl}/api/chat/${originalConversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenClient1}`,
      },
      body: JSON.stringify({ message: 'Can you implement an extra payment gateway here?' }),
    });

    const chatAttemptData = (await chatAttemptRes.json()) as any;
    if (chatAttemptRes.status !== 403) {
      throw new Error(`Expected sending message to closed project chat to be rejected (403), got ${chatAttemptRes.status}`);
    }
    console.log('  ✔ Normal message to completed project chat strictly rejected: 403 Forbidden');
    console.log(`    Response error: "${chatAttemptData.error}"`);
    results.originalChatClosed = true;

    // -------------------------------------------------------------------------
    // TEST SECTION 2: CREATE SUPPORT TICKET
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Client #001 creates Support Ticket SUP-2026-0001...');
    const ticketCreateRes = await fetch(`${baseUrl}/api/support/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenClient1}`,
      },
      body: JSON.stringify({
        projectId,
        subject: 'Post-Deployment Vector Index Tuning Assistance',
        description: 'Need technical review of vector search latency metrics under production traffic.',
        priority: 'NORMAL',
        preferredTicketNumber: 'SUP-2026-0001',
        preferredBridgeNumber: 'SUPPORT BRIDGE #001',
      }),
    });

    const ticketCreateData = (await ticketCreateRes.json()) as any;
    if (ticketCreateRes.status !== 201 || !ticketCreateData.ticket) {
      throw new Error(`Failed to create support ticket: ${JSON.stringify(ticketCreateData)}`);
    }

    const ticket = ticketCreateData.ticket;
    console.log('  ✔ Support ticket successfully created:');
    console.log('    - Ticket Number:', ticket.ticket_number);
    console.log('    - Status:', ticket.status);
    console.log('    - Project Linked:', ticket.project_id === projectId);
    console.log('    - Client Linked:', ticket.client_id === client1Id);
    console.log('    - Developer Linked Internally:', ticket.developer_id === dev1Id);
    console.log('    - Support Bridge Generated:', ticket.bridgeNumber || 'SUPPORT BRIDGE #001');

    if (ticket.ticket_number !== 'SUP-2026-0001') {
      throw new Error(`Expected ticket number "SUP-2026-0001", got "${ticket.ticket_number}"`);
    }
    if (ticket.project_id !== projectId || ticket.client_id !== client1Id || ticket.developer_id !== dev1Id) {
      throw new Error('Ticket links mismatch');
    }
    results.ticketCreatedAndLinked = true;

    const ticketId = ticket.id;
    const bridgeId = ticket.bridgeId;

    // -------------------------------------------------------------------------
    // TEST SECTION 3: PRIVACY SHIELDING
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Auditing Client Privacy Shielding in Support Ticket View...');
    const listTicketsRes = await fetch(`${baseUrl}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${tokenClient1}` },
    });
    const listTicketsData = (await listTicketsRes.json()) as any;
    const clientTickets = listTicketsData.tickets || [];
    const myTicket = clientTickets.find((t: any) => t.id === ticketId);

    if (!myTicket) {
      throw new Error('Created support ticket not found in client tickets list');
    }

    console.log('  ✔ Ticket participant identities verified:');
    console.log(`    - Support: "${myTicket.supportAgent}"`);
    console.log(`    - Developer: "${myTicket.developerIdentity}"`);

    const stringifiedTicket = JSON.stringify(myTicket);
    if (stringifiedTicket.includes('rohan sharma') || stringifiedTicket.includes('@nexus.dev') || stringifiedTicket.includes('9876543210')) {
      throw new Error('PRIVACY VIOLATION: Unnecessary private identity details leaked in support ticket!');
    }
    console.log('  ✔ Private email, personal phone, and identity identifiers shielded.');
    results.privacyShielded = true;

    // -------------------------------------------------------------------------
    // TEST SECTION 4: SUPPORT AGENT ASSIGNMENT & BRIDGE CREATION
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Support Agent opens and assigns ticket...');
    const assignRes = await fetch(`${baseUrl}/api/support/tickets/${ticketId}/assign`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSupport}` },
    });
    const assignData = (await assignRes.json()) as any;
    if (assignRes.status !== 200 || assignData.status !== 'ASSIGNED') {
      throw new Error(`Failed to assign ticket: ${JSON.stringify(assignData)}`);
    }
    console.log('  ✔ Ticket status updated to: ASSIGNED');
    results.supportAssigned = true;

    // Verify bridge members
    const bridgeRes = await fetch(`${baseUrl}/api/support/bridges/${bridgeId}`, {
      headers: { Authorization: `Bearer ${tokenSupport}` },
    });
    const bridgeData = (await bridgeRes.json()) as any;
    if (bridgeRes.status !== 200 || !bridgeData.bridge) {
      throw new Error(`Failed to get bridge: ${JSON.stringify(bridgeData)}`);
    }

    const { bridge, members } = bridgeData;
    console.log(`  ✔ Bridge verified: "${bridge.bridgeNumber}" (Ticket: ${bridge.ticketNumber})`);
    console.log('  ✔ Bridge Members count:', members.length);
    const memberRoles = members.map((m: any) => m.role);
    if (!memberRoles.includes('CLIENT') || !memberRoles.includes('DEVELOPER') || !memberRoles.includes('SUPPORT')) {
      throw new Error(`Expected bridge members [CLIENT, DEVELOPER, SUPPORT], got [${memberRoles.join(', ')}]`);
    }
    console.log('  ✔ Confirmed Tripartite Members: [Client, Technical Developer, Support Agent]');
    results.bridgeCreated = true;

    // -------------------------------------------------------------------------
    // TEST SECTION 5: SUPPORT BRIDGE CHAT REALTIME MESSAGING
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Testing Realtime Messaging in Support Bridge...');

    // 1. Support agent sends message
    const msg1Res = await fetch(`${baseUrl}/api/support/bridges/${bridgeId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenSupport}`,
      },
      body: JSON.stringify({ message: 'Welcome to Support Bridge #001. I am your support agent. Developer #01 is present.' }),
    });
    if (msg1Res.status !== 201) {
      throw new Error(`Support agent message failed: status ${msg1Res.status}`);
    }

    // 2. Developer #01 sends reply
    const msg2Res = await fetch(`${baseUrl}/api/support/bridges/${bridgeId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDev1}`,
      },
      body: JSON.stringify({ message: 'Developer here. Checked the vector index telemetry: we recommend increasing shard memory.' }),
    });
    if (msg2Res.status !== 201) {
      throw new Error(`Developer #01 message failed: status ${msg2Res.status}`);
    }

    // 3. Client reads messages
    const clientBridgeView = await fetch(`${baseUrl}/api/support/bridges/${bridgeId}`, {
      headers: { Authorization: `Bearer ${tokenClient1}` },
    });
    const clientBridgeData = (await clientBridgeView.json()) as any;
    const bridgeMsgs = clientBridgeData.messages || [];

    if (bridgeMsgs.length < 2) {
      throw new Error(`Expected at least 2 messages in support bridge, got ${bridgeMsgs.length}`);
    }
    console.log(`  ✔ Realtime messages delivered and retrieved in Support Bridge (count: ${bridgeMsgs.length})`);
    results.bridgeChatRealtime = true;

    // -------------------------------------------------------------------------
    // TEST SECTION 6: DEVELOPER ACCESS CONTROL
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Auditing Developer Access Control on Support Bridge...');

    // Developer #01 can access
    const dev1Access = await fetch(`${baseUrl}/api/support/bridges/${bridgeId}`, {
      headers: { Authorization: `Bearer ${tokenDev1}` },
    });
    if (dev1Access.status !== 200) {
      throw new Error(`Developer #01 should have access to support bridge, got ${dev1Access.status}`);
    }
    console.log('  ✔ Developer #01 (Lead Developer) access: ALLOWED (200 OK)');

    // Developer #02 cannot access
    const dev2Access = await fetch(`${baseUrl}/api/support/bridges/${bridgeId}`, {
      headers: { Authorization: `Bearer ${tokenDev2}` },
    });
    if (dev2Access.status !== 403) {
      throw new Error(`Developer #02 should be denied access to support bridge, got ${dev2Access.status}`);
    }
    console.log('  ✔ Developer #02 (Unrelated Developer) access: DENIED (403 Forbidden)');

    results.developerAccessControl = true;

    // -------------------------------------------------------------------------
    // TEST SECTION 7: CLIENT ACCESS CONTROL
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Auditing Client Access Control on Support Bridge...');

    // Client #001 can access
    const client1Access = await fetch(`${baseUrl}/api/support/bridges/${bridgeId}`, {
      headers: { Authorization: `Bearer ${tokenClient1}` },
    });
    if (client1Access.status !== 200) {
      throw new Error(`Client #001 should have access to support bridge, got ${client1Access.status}`);
    }
    console.log('  ✔ Client #001 (Project Owner) access: ALLOWED (200 OK)');

    // Client #002 cannot access
    const client2Access = await fetch(`${baseUrl}/api/support/bridges/${bridgeId}`, {
      headers: { Authorization: `Bearer ${tokenClient2}` },
    });
    if (client2Access.status !== 403) {
      throw new Error(`Client #002 should be denied access to support bridge, got ${client2Access.status}`);
    }
    console.log('  ✔ Client #002 (Unrelated Client) access: DENIED (403 Forbidden)');

    results.clientAccessControl = true;

    // -------------------------------------------------------------------------
    // TEST SECTION 8: SUPPORT CLOSURE LIFECYCLE
    // -------------------------------------------------------------------------
    console.log('\n[Test 8] Testing Complete Support Ticket Closure Lifecycle...');
    const lifecycleStatuses = [
      'OPEN',
      'ASSIGNED',
      'INVESTIGATING',
      'WAITING_FOR_CLIENT',
      'IN_PROGRESS',
      'RESOLVED',
      'CLOSED',
    ];

    for (const status of lifecycleStatuses) {
      const updateRes = await fetch(`${baseUrl}/api/support/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenSupport}`,
        },
        body: JSON.stringify({ status }),
      });

      const updateData = (await updateRes.json()) as any;
      if (updateRes.status !== 200 || updateData.ticket?.status !== status) {
        throw new Error(`Failed to update ticket status to "${status}": ${JSON.stringify(updateData)}`);
      }
      console.log(`  ✔ Status transition verified: ${status}`);
    }

    // Verify ticket is closed and closed_at is set
    const closedCheck = await query('SELECT status, closed_at FROM support_tickets WHERE id = $1', [ticketId]);
    if (closedCheck.rows[0].status !== 'CLOSED' || !closedCheck.rows[0].closed_at) {
      throw new Error('Support ticket did not record closed_at timestamp upon CLOSED status');
    }
    console.log('  ✔ Support ticket successfully closed (closed_at stamped)');
    results.supportClosureLifecycle = true;

    // -------------------------------------------------------------------------
    // TEST SECTION 9: NEW WORK REQUEST AUDIT
    // -------------------------------------------------------------------------
    console.log('\n[Test 9] Verifying New Development creates a New Project (never reopening completed chat)...');

    // 1. Verify original project chat remains strictly closed
    const retryOriginalChat = await fetch(`${baseUrl}/api/chat/${originalConversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenClient1}`,
      },
      body: JSON.stringify({ message: 'Let us reopen this project chat for new features.' }),
    });
    if (retryOriginalChat.status !== 403) {
      throw new Error(`Attempting to send new work message to completed project chat should be rejected (403), got ${retryOriginalChat.status}`);
    }
    console.log('  ✔ Attempt to reopen completed project chat rejected: 403 Forbidden');

    // 2. Client submits new project for additional development scope
    const newProjectRes = await fetch(`${baseUrl}/api/projects/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenClient1}`,
      },
      body: JSON.stringify({
        title: 'Autonomous AI E-Commerce Engine — Phase 2 Sharding & Multi-Region',
        category: 'AI/ML',
        description: 'New project scope: Multi-region active-active database replication and shard autoscaling.',
        budgetMin: 60000,
        budgetMax: 95000,
        timeline: '30 Days',
        requirements: ['Multi-region postgres replication', 'Shard health telemetry', 'Automated failover'],
        requiredTechnologies: ['PostgreSQL', 'Docker', 'Go', 'Redis'],
      }),
    });

    const newProjectData = (await newProjectRes.json()) as any;
    if (newProjectRes.status !== 201 || !newProjectData.projectId) {
      throw new Error(`Failed to submit new project: ${JSON.stringify(newProjectData)}`);
    }

    console.log('  ✔ New development successfully created as independent project:');
    console.log('    - New Project Number:', newProjectData.projectNumber);
    console.log('    - New Project ID:', newProjectData.projectId);
    console.log('    - Status:', newProjectData.status);

    if (newProjectData.projectId === projectId) {
      throw new Error('New development must NOT reuse existing completed project ID!');
    }
    results.newWorkCreatesNewProject = true;

    console.log('\n================================================================');
    console.log('ALL PHASE 12 SUPPORT TICKET & BRIDGE AUDIT TESTS PASSED');
    console.log('================================================================\n');

    return results;
  } finally {
    if (server) {
      await new Promise<void>((resolve) => {
        (server as Server).close(() => {
          console.log('[Audit Harness] Live test server shut down cleanly.');
          resolve();
        });
      });
    }
  }
}

if (process.argv[1]?.endsWith('supportTicketBridgeAuditTest.ts')) {
  runSupportTicketBridgeAudit()
    .then((results) => {
      console.log('================================================================');
      console.log('AUDIT REPORT OUTPUT');
      console.log('================================================================');
      console.log(`Original chat closed/read-only: ${results.originalChatClosed ? 'PASS' : 'FAIL'}`);
      console.log(`Support ticket created & linked: ${results.ticketCreatedAndLinked ? 'PASS' : 'FAIL'}`);
      console.log(`Privacy shielded: ${results.privacyShielded ? 'PASS' : 'FAIL'}`);
      console.log(`Support assigned: ${results.supportAssigned ? 'PASS' : 'FAIL'}`);
      console.log(`Bridge created: ${results.bridgeCreated ? 'PASS' : 'FAIL'}`);
      console.log(`Bridge chat realtime: ${results.bridgeChatRealtime ? 'PASS' : 'FAIL'}`);
      console.log(`Developer access control: ${results.developerAccessControl ? 'PASS' : 'FAIL'}`);
      console.log(`Client access control: ${results.clientAccessControl ? 'PASS' : 'FAIL'}`);
      console.log(`Support closure lifecycle: ${results.supportClosureLifecycle ? 'PASS' : 'FAIL'}`);
      console.log(`New work creates new project: ${results.newWorkCreatesNewProject ? 'PASS' : 'FAIL'}`);
      console.log('================================================================\n');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ AUDIT FAILED:', err);
      process.exit(1);
    });
}
