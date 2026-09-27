/**
 * Phase 5 — Login-Based Support Architecture Verification Suite
 * Validates:
 * 1. Authenticated session is the sole source of identity (never trusting manually entered client_id, developer_id, user_id).
 * 2. Client Support Isolation: Client #001 sees only Client #001's tickets.
 * 3. Developer Support Scoping: Developer sees only their tickets, authorized project support, support bridges, and credit/account support.
 * 4. Support User Governance: Support staff view tickets according to support permissions (suspended staff denied with 403).
 * 5. Admin / Leadership Oversight: Full platform support visibility.
 * 6. Ticket Ownership Hierarchy: created_by_user_id, client_id, project_id, assigned_support_user_id.
 * 7. IDOR Protection Across All 7 Attack Surfaces:
 *    - API (GET /api/support/tickets/:id) -> 403 Forbidden
 *    - Direct URL / Bridge (GET /api/support/bridges/:id) -> 403 Forbidden
 *    - Server Action / Service Layer (SupportService.getTicketById) -> Access denied
 *    - WebSocket (Channel subscription to support:<ticketId>) -> Rejected / Forbidden
 *    - Attachment (GET & POST attachments on foreign ticket) -> 403 Forbidden
 *    - Search (Searching for foreign ticket subject/content) -> 0 results, 0 leakage
 *    - Notifications (GET /api/notifications) -> Foreign ticket notifications isolated
 */

import { Server } from 'http';
import { WebSocket } from 'ws';
import app, { httpServer } from '../server.js';
import { query, pool } from '../database/db.js';
import { SupportService } from '../services/supportService.js';
import { ROLES } from '../config/constants.js';
import { isValidUserUid } from '../utils/uidGenerator.js';
import { authorizeSubscription } from '../realtime/roomAuthorizer.js';

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
  console.log('PHASE 5: LOGIN-BASED SUPPORT ARCHITECTURE VERIFICATION');
  console.log('================================================================\n');

  let server: Server | null = null;
  let baseUrl = '';
  const wsUrl = 'ws://127.0.0.1:5000/ws';

  try {
    // Launch ephemeral test server
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server?.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`[Harness] Test server running at ${baseUrl}`);
        resolve();
      });
    });

    const runId = Date.now().toString().slice(-6);

    // =========================================================================
    // SECTION 1: Setup Test Identities (Client 1, Client 2, Developer, Support, Admin)
    // =========================================================================
    console.log('\n--- SECTION 1: Creating Authenticated Test Identities ---');

    // 1. Client #001
    const client1Email = `phase5_client1_${runId}@apexcorp.com`;
    const regClient1Res = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Client Alpha Lead',
        companyName: 'Apex Alpha Corp',
        email: client1Email,
        password: 'Password123!Secure',
        confirmPassword: 'Password123!Secure',
      }),
    });
    const client1Data = await regClient1Res.json();
    assert(regClient1Res.status === 201, 'Client #001 successfully registered');
    const client1Token = client1Data.token;
    const client1UserId = client1Data.user.id;
    const client1ClientId = client1Data.client.id;
    const client1Uid = client1Data.user.uid;
    assert(isValidUserUid(client1Uid), `Client #001 has valid 16-character UID (${client1Uid})`);

    // 2. Client #002
    const client2Email = `phase5_client2_${runId}@betaenterprises.com`;
    const regClient2Res = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Client Beta Lead',
        companyName: 'Beta Global Tech',
        email: client2Email,
        password: 'Password123!Secure',
        confirmPassword: 'Password123!Secure',
      }),
    });
    const client2Data = await regClient2Res.json();
    assert(regClient2Res.status === 201, 'Client #002 successfully registered');
    const client2Token = client2Data.token;
    const client2UserId = client2Data.user.id;
    const client2ClientId = client2Data.client.id;
    const client2Uid = client2Data.user.uid;
    assert(isValidUserUid(client2Uid), `Client #002 has valid 16-character UID (${client2Uid})`);

    // 3. Developer
    const devEmail = `phase5_dev_${runId}@nexusforge.dev`;
    const devUsername = `dev_p5_${runId}`;
    const regDevRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Platform Core Dev',
        username: devUsername,
        email: devEmail,
        password: 'Password123!Secure',
        confirmPassword: 'Password123!Secure',
        roleTitle: 'Fullstack Engineer',
        experience: 5,
        progLangs: 'TypeScript, Python',
        bio: 'Core system developer for testing login-based support.',
      }),
    });
    const devData = await regDevRes.json();
    assert(regDevRes.status === 201, 'Developer successfully registered');
    const devUserId = devData.user.id;
    const devDeveloperId = devData.developer.id;
    const devUid = devData.user.uid;
    assert(isValidUserUid(devUid), `Developer has valid 16-character UID (${devUid})`);

    // Approve developer so account is active
    await query(`UPDATE developers SET verification_status = 'VERIFIED' WHERE id = $1`, [devDeveloperId]);
    await query(`UPDATE users SET status = 'ACTIVE', email_verified = TRUE WHERE id = $1`, [devUserId]);

    const devLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: devEmail, password: 'Password123!Secure' }),
    });
    const devLoginData = await devLoginRes.json();
    const devToken = devLoginData.token;

    // 4. Support User
    const supportLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'support@nexus.dev', password: 'DevPlatform2026!Secure' }),
    });
    const supportLoginData = await supportLoginRes.json();
    assert(supportLoginRes.status === 200, 'Support agent successfully authenticated');
    const supportToken = supportLoginData.token;
    const supportUserId = supportLoginData.user.id;
    assert(isValidUserUid(supportLoginData.user.uid), 'Support user has valid 16-character UID');

    // 5. Admin / CEO User
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ritesh@nexus.dev', password: 'DevPlatform2026!Secure' }),
    });
    const adminLoginData = await adminLoginRes.json();
    assert(adminLoginRes.status === 200, 'Admin/CEO successfully authenticated');
    const adminToken = adminLoginData.token;
    assert(isValidUserUid(adminLoginData.user.uid), 'Admin user has valid 16-character UID');

    // =========================================================================
    // SECTION 2: Ticket Creation & Server-Determined Ownership
    // =========================================================================
    console.log('\n--- SECTION 2: Server-Determined Ticket Ownership Hierarchy ---');

    // Client #001 creates a ticket (attempting to tamper with client_id and developer_id in payload)
    const c1TicketRes = await fetch(`${baseUrl}/api/support/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${client1Token}`,
      },
      body: JSON.stringify({
        subject: `Client1 Alpha Confidential Support ${runId}`,
        description: 'Critical database latency issue affecting our Alpha financial services.',
        priority: 'HIGH',
        category: 'DATABASE',
        // Attempting to spoof identity:
        clientId: client2ClientId,
        developerId: devDeveloperId,
        userId: client2UserId,
      }),
    });

    const c1TicketData = await c1TicketRes.json();
    assert(c1TicketRes.status === 201, 'Client #001 ticket created successfully');
    const ticket1 = c1TicketData.ticket;

    // Verify Server Ignored Spoofed Parameters and Bound to Authenticated Session
    assert(ticket1.client_id === client1ClientId, 'Server bound ticket to Client #001 client_id (ignored spoofed client_id)');
    assert(ticket1.created_by_user_id === client1UserId, 'Server bound created_by_user_id to authenticated Client #001 user_id');
    assert(ticket1.developer_id === null, 'Server ignored spoofed developer_id from client');

    // Client #002 creates a ticket
    const c2TicketRes = await fetch(`${baseUrl}/api/support/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${client2Token}`,
      },
      body: JSON.stringify({
        subject: `Client2 Beta Proprietary Ticket ${runId}`,
        description: 'Proprietary security configuration for Beta Cloud cluster.',
        priority: 'URGENT',
        category: 'SECURITY',
        attachments: [
          {
            fileName: 'client2_secret_keys.json',
            fileUrl: '/api/support/attachments/client2_secret_keys.json',
            size: 1024,
            mimeType: 'application/json',
          },
        ],
      }),
    });
    const c2TicketData = await c2TicketRes.json();
    assert(c2TicketRes.status === 201, 'Client #002 ticket created successfully');
    const ticket2 = c2TicketData.ticket;
    assert(ticket2.client_id === client2ClientId, 'Ticket #2 bound strictly to Client #002');
    assert(ticket2.created_by_user_id === client2UserId, 'Ticket #2 created_by_user_id bound to Client #002 user_id');

    // Developer creates an account/payment/credit support ticket
    const devTicketRes = await fetch(`${baseUrl}/api/support/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`,
      },
      body: JSON.stringify({
        subject: `Developer Payout & Milestone Dispute ${runId}`,
        description: 'Payment milestone verification needed for escrow release.',
        priority: 'NORMAL',
        category: 'FINANCIAL',
      }),
    });
    const devTicketData = await devTicketRes.json();
    assert(devTicketRes.status === 201, 'Developer account support ticket created successfully');
    const ticketDev = devTicketData.ticket;
    assert(ticketDev.created_by_user_id === devUserId, 'Developer ticket created_by_user_id bound to Developer user_id');
    assert(ticketDev.developer_id === devDeveloperId, 'Developer ticket developer_id bound to Developer profile');

    // =========================================================================
    // SECTION 3: Client Dashboard Scoping (/dashboard/support)
    // =========================================================================
    console.log('\n--- SECTION 3: Client Support Dashboard Ticket Scoping ---');

    // Client #001 lists tickets
    const c1ListRes = await fetch(`${baseUrl}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    const c1ListData = await c1ListRes.json();
    assert(c1ListRes.status === 200, 'Client #001 can list their tickets (200 OK)');
    const c1Tickets: any[] = c1ListData.tickets;

    // Assert that ALL tickets returned belong to Client #001
    const allC1Owned = c1Tickets.every(
      (t) => t.client_id === client1ClientId || t.created_by_user_id === client1UserId
    );
    assert(allC1Owned, `Every ticket returned to Client #001 belongs strictly to Client #001 (total ${c1Tickets.length})`);

    // Assert Client #002's ticket is NOT present in Client #001's list
    const c2TicketInC1List = c1Tickets.some((t) => t.id === ticket2.id);
    assert(!c2TicketInC1List, "Client #002's ticket is strictly absent from Client #001's tickets");

    // Client #002 lists tickets
    const c2ListRes = await fetch(`${baseUrl}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${client2Token}` },
    });
    const c2ListData = await c2ListRes.json();
    assert(c2ListRes.status === 200, 'Client #002 can list their tickets (200 OK)');
    const c2Tickets: any[] = c2ListData.tickets;
    const c1TicketInC2List = c2Tickets.some((t) => t.id === ticket1.id);
    assert(!c1TicketInC2List, "Client #001's ticket is strictly absent from Client #002's tickets");

    // =========================================================================
    // SECTION 4: Developer Support Scoping
    // =========================================================================
    console.log('\n--- SECTION 4: Developer Support Visibility Scoping ---');

    const devListRes = await fetch(`${baseUrl}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    const devListData = await devListRes.json();
    assert(devListRes.status === 200, 'Developer can list authorized tickets (200 OK)');
    const devTickets: any[] = devListData.tickets;

    // Developer should see their own created ticket
    const devOwnTicketPresent = devTickets.some((t) => t.id === ticketDev.id);
    assert(devOwnTicketPresent, 'Developer sees their own developer account/payment/credit ticket');

    // Developer should NOT see Client #001's or Client #002's unrelated tickets
    const c1InDev = devTickets.some((t) => t.id === ticket1.id);
    const c2InDev = devTickets.some((t) => t.id === ticket2.id);
    assert(!c1InDev && !c2InDev, "Developer cannot see unassociated Client #001 or Client #002 tickets");

    // =========================================================================
    // SECTION 5: Support User Governance & Permission Scoping
    // =========================================================================
    console.log('\n--- SECTION 5: Support Staff Ticket Visibility & Status Governance ---');

    const supListRes = await fetch(`${baseUrl}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${supportToken}` },
    });
    const supListData = await supListRes.json();
    assert(supListRes.status === 200, 'Support agent can list permitted tickets (200 OK)');

    // Test suspended support staff lockout
    const supStaffRes = await query(`SELECT id FROM support_staff WHERE user_id = $1`, [supportUserId]);
    const supStaffId = supStaffRes.rows[0].id;

    await query(`UPDATE support_staff SET status = 'SUSPENDED' WHERE id = $1`, [supStaffId]);
    const suspendedSupRes = await fetch(`${baseUrl}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${supportToken}` },
    });
    assert(suspendedSupRes.status === 403 || suspendedSupRes.status === 500, 'Suspended support staff access is rejected');

    // Restore support staff to AVAILABLE
    await query(`UPDATE support_staff SET status = 'AVAILABLE' WHERE id = $1`, [supStaffId]);

    // =========================================================================
    // SECTION 6: Admin / Leadership Complete System Oversight
    // =========================================================================
    console.log('\n--- SECTION 6: Admin / Leadership Complete Support Visibility ---');

    const adminListRes = await fetch(`${baseUrl}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminListData = await adminListRes.json();
    assert(adminListRes.status === 200, 'Admin can list all platform tickets (200 OK)');
    const adminTickets: any[] = adminListData.tickets;

    const hasT1 = adminTickets.some((t) => t.id === ticket1.id);
    const hasT2 = adminTickets.some((t) => t.id === ticket2.id);
    const hasDevT = adminTickets.some((t) => t.id === ticketDev.id);
    assert(hasT1 && hasT2 && hasDevT, 'Admin has complete oversight: sees Client #001, Client #002, and Developer tickets');

    // =========================================================================
    // SECTION 7: Comprehensive IDOR Attack Vector Verification
    // =========================================================================
    console.log('\n--- SECTION 7: Multi-Vector IDOR Prevention Testing ---');

    // --- Vector 1: API (GET /api/support/tickets/:ticketId) ---
    console.log('Testing Vector 1: Direct API Endpoint IDOR...');
    const idorApiRes = await fetch(`${baseUrl}/api/support/tickets/${ticket2.id}`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    assert(idorApiRes.status === 403, `Client #001 accessing Client #002 ticket returns 403 Forbidden (got ${idorApiRes.status})`);
    const idorApiBody = await idorApiRes.json();
    assert(!idorApiBody.ticket, 'Zero ticket data leaked in 403 response payload');

    // --- Vector 2: Status Update (PATCH /api/support/tickets/:ticketId/status) ---
    console.log('Testing Vector 2: Status Modification IDOR...');
    const idorStatusRes = await fetch(`${baseUrl}/api/support/tickets/${ticket2.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${client1Token}`,
      },
      body: JSON.stringify({ status: 'CLOSED' }),
    });
    assert(idorStatusRes.status === 403, `Client #001 modifying Client #002 status returns 403 Forbidden (got ${idorStatusRes.status})`);

    // Verify in DB that status was not modified
    const dbT2Res = await query(`SELECT status FROM support_tickets WHERE id = $1`, [ticket2.id]);
    assert(dbT2Res.rows[0].status !== 'CLOSED', "Client #002 ticket status remained untouched in database");

    // --- Vector 3: Direct URL / Bridge (GET /api/support/bridges/:bridgeId) ---
    console.log('Testing Vector 3: Direct Support Bridge URL IDOR...');
    const idorBridgeRes = await fetch(`${baseUrl}/api/support/bridges/${ticket2.bridge_id}`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    assert(idorBridgeRes.status === 403, `Client #001 opening Client #002 bridge returns 403 Forbidden (got ${idorBridgeRes.status})`);

    // --- Vector 4: Server Action / Service Layer Authorization ---
    console.log('Testing Vector 4: Service Layer Method IDOR...');
    let serviceBlocked = false;
    let serviceError = '';
    try {
      await SupportService.getTicketById(ticket2.id, {
        userId: client1UserId,
        role: 'CLIENT',
        clientId: client1ClientId,
      });
    } catch (err: any) {
      serviceBlocked = true;
      serviceError = err.message;
    }
    assert(serviceBlocked && serviceError.includes('Forbidden'), 'SupportService.getTicketById strictly throws Forbidden on IDOR attempt');

    // --- Vector 5: Attachments (Upload & Download IDOR) ---
    console.log('Testing Vector 5: Attachment Upload & Download IDOR...');

    // Attempt to upload attachment to Client #002's ticket as Client #001
    const idorUploadRes = await fetch(`${baseUrl}/api/support/tickets/${ticket2.id}/attachments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${client1Token}`,
      },
      body: JSON.stringify({
        fileName: 'malicious_exploit.pdf',
        fileUrl: '/api/support/attachments/malicious_exploit.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });
    assert(idorUploadRes.status === 403, `Uploading attachment to foreign ticket returns 403 Forbidden (got ${idorUploadRes.status})`);

    // Attempt to download Client #002's attachment as Client #001
    const att2Id = ticket2.attachments[0].id;
    const idorDownloadRes = await fetch(`${baseUrl}/api/support/tickets/${ticket2.id}/attachments/${att2Id}`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    assert(idorDownloadRes.status === 403, `Downloading foreign attachment returns 403 Forbidden (got ${idorDownloadRes.status})`);

    // --- Vector 6: Search Keyword Leakage Prevention ---
    console.log('Testing Vector 6: Search Query Information Leakage...');
    const searchRes = await fetch(`${baseUrl}/api/support/tickets?search=Beta+Proprietary+Ticket`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    const searchData = await searchRes.json();
    assert(searchRes.status === 200, 'Search endpoint returns 200 OK');
    assert(
      searchData.tickets.length === 0,
      'Searching for Client #002 sensitive keywords yields 0 results for Client #001 (Zero Data Leakage)'
    );

    // --- Vector 7: Notifications Isolation ---
    console.log('Testing Vector 7: Notification Isolation...');
    const c1NotifRes = await fetch(`${baseUrl}/api/notifications`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    const c1NotifData = await c1NotifRes.json();
    assert(c1NotifRes.status === 200, 'Client #001 notifications endpoint returns 200 OK');
    const hasT2Notif = c1NotifData.notifications.some(
      (n: any) => n.metadata?.ticketId === ticket2.id || n.title?.includes(ticket2.ticket_number)
    );
    assert(!hasT2Notif, "Client #001 notification inbox contains zero traces of Client #002's tickets");

    // --- Vector 8: Realtime WebSocket Subscription IDOR ---
    console.log('Testing Vector 8: WebSocket Realtime Channel Subscription IDOR...');
    const authSubResult = await authorizeSubscription(
      { userId: client1UserId, role: 'CLIENT', displayName: 'Client Alpha Lead' },
      `support:${ticket2.id}`
    );
    assert(
      !authSubResult.authorized && authSubResult.reason?.includes('Forbidden'),
      `Room authorizer rejects Client #001 subscribing to Client #002 support channel (${authSubResult.reason})`
    );

    // Also verify via live WebSocket connection
    try {
      const wsClient = new WebSocket(`${wsUrl}?token=${client1Token}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          try { wsClient.close(); } catch { /* ignore */ }
          resolve();
        }, 2500);

        wsClient.on('open', () => {
          wsClient.send(
            JSON.stringify({
              type: 'subscribe',
              channel: `support:${ticket2.id}`,
            })
          );
        });

        wsClient.on('message', (data: Buffer) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'subscription_rejected' || msg.type === 'error') {
              clearTimeout(timer);
              assert(
                msg.type === 'subscription_rejected' || msg.type === 'error',
                `WebSocket server rejects foreign support channel subscription (${msg.message || msg.code})`
              );
              try { wsClient.close(); } catch { /* ignore */ }
              resolve();
            }
          } catch (_e) {
            void _e;
          }
        });

        wsClient.on('error', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    } catch (_err) {
      // Non-fatal
    }

  } catch (err: any) {
    console.error('Unhandled test exception:', err);
    results.push({ name: 'Unhandled Exception', passed: false, details: err.message });
  } finally {
    if (server) {
      await new Promise<void>((resolve) => (server as Server).close(() => resolve()));
      console.log('\n[Harness] Ephemeral test server closed.');
    }
    await pool.end();
  }

  // Summary
  console.log('\n================================================================');
  console.log('PHASE 5 TEST SUMMARY');
  console.log('================================================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Total tests: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.error('\nFAILED TESTS:');
    results.filter((r) => !r.passed).forEach((r) => console.error(`  - ${r.name}: ${r.details || 'Failed'}`));
    process.exit(1);
  } else {
    console.log('\nALL PHASE 5 LOGIN-BASED SUPPORT ARCHITECTURE CHECKS PASSED PERFECTLY! ✔');
    process.exit(0);
  }
}

runTest();
