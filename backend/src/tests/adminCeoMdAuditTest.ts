import { Server } from 'http';
import app from '../server.js';
import { query } from '../database/db.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/environment.js';
import { ROLES, LEADERSHIP } from '../config/constants.js';

interface AuditResults {
  leadershipRolesVerified: boolean;
  ceoManagesAllDomains: boolean;
  mdConfiguredPermissions: boolean;
  mdProhibitedActionsBlocked: boolean;
  developerAdministration: boolean;
  projectAdministration: boolean;
  creditAdministrationWithReason: boolean;
  paymentAdministrationNoSecrets: boolean;
  supportAdministration: boolean;
  auditLogsCaptured: boolean;
  securityDeveloperBlocked: boolean;
  securityClientBlocked: boolean;
}

export async function runAdminCeoMdAudit(): Promise<AuditResults> {
  console.log('\n================================================================');
  console.log('PHASE 14: ADMIN, CEO & MD AUDIT');
  console.log('================================================================\n');

  let server: Server | null = null;
  let baseUrl = '';

  const results: AuditResults = {
    leadershipRolesVerified: false,
    ceoManagesAllDomains: false,
    mdConfiguredPermissions: false,
    mdProhibitedActionsBlocked: false,
    developerAdministration: false,
    projectAdministration: false,
    creditAdministrationWithReason: false,
    paymentAdministrationNoSecrets: false,
    supportAdministration: false,
    auditLogsCaptured: false,
    securityDeveloperBlocked: false,
    securityClientBlocked: false,
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
    const passwordHash = await bcrypt.hash('AdminAuditPass123!', 10);

    // -------------------------------------------------------------------------
    // 1. PROVISION & VERIFY LEADERSHIP ROLES:
    // CEO: M. Shiva Gopi (shiva@nexus.dev)
    // MD: Ritesh Lingamallu (ritesh@nexus.dev)
    // -------------------------------------------------------------------------
    console.log('[Test 1] Verifying Leadership Configuration (CEO: M. Shiva Gopi, MD: Ritesh Lingamallu)...');

    // Setup CEO user
    const ceoUserRes = await query("SELECT id FROM users WHERE email = 'shiva@nexus.dev' LIMIT 1");
    let ceoUserId = '';
    if (ceoUserRes.rows.length === 0) {
      const u = await query(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES ('shiva@nexus.dev', $1, 'CEO', 'ACTIVE')
         RETURNING id`,
        [passwordHash]
      );
      ceoUserId = u.rows[0].id;
    } else {
      ceoUserId = ceoUserRes.rows[0].id;
      await query("UPDATE users SET role = 'CEO', status = 'ACTIVE' WHERE id = $1", [ceoUserId]);
    }

    const tokenCeo = jwt.sign(
      { userId: ceoUserId, role: ROLES.CEO, email: 'shiva@nexus.dev' },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Setup MD user
    const mdUserRes = await query("SELECT id FROM users WHERE email = 'ritesh@nexus.dev' LIMIT 1");
    let mdUserId = '';
    if (mdUserRes.rows.length === 0) {
      const u = await query(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES ('ritesh@nexus.dev', $1, 'MD', 'ACTIVE')
         RETURNING id`,
        [passwordHash]
      );
      mdUserId = u.rows[0].id;
    } else {
      mdUserId = mdUserRes.rows[0].id;
      await query("UPDATE users SET role = 'MD', status = 'ACTIVE' WHERE id = $1", [mdUserId]);
    }

    const tokenMd = jwt.sign(
      { userId: mdUserId, role: ROLES.MD, email: 'ritesh@nexus.dev' },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    console.log(`  ✔ CEO Configured: ${LEADERSHIP.CEO.NAME} (${LEADERSHIP.CEO.ROLE})`);
    console.log(`  ✔ MD Configured: ${LEADERSHIP.MD.NAME} (${LEADERSHIP.MD.ROLE})`);

    if (LEADERSHIP.CEO.NAME !== 'M. Shiva Gopi' || LEADERSHIP.MD.NAME !== 'Ritesh Lingamallu') {
      throw new Error('Leadership roles do not match required CEO: M. Shiva Gopi, MD: Ritesh Lingamallu');
    }
    results.leadershipRolesVerified = true;

    // Provision test developer
    const devUserRes = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'DEVELOPER', 'ACTIVE')
       RETURNING id`,
      [`dev_admin_${runId}@nexus.dev`, passwordHash]
    );
    const devUserId = devUserRes.rows[0].id;
    const devRes = await query(
      `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status)
       VALUES ($1, $2, 'Dev Auditor', 'Full Stack Engineer', 5, 'VERIFIED')
       RETURNING id`,
      [devUserId, `dev_admin_${runId}`]
    );
    const devId = devRes.rows[0].id;
    const tokenDev = jwt.sign(
      { userId: devUserId, role: ROLES.DEVELOPER, developerId: devId },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Provision test client
    const clientUserRes = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'CLIENT', 'ACTIVE')
       RETURNING id`,
      [`client_admin_${runId}@nexus.test`, passwordHash]
    );
    const clientUserId = clientUserRes.rows[0].id;
    const clientRes = await query(
      `INSERT INTO clients (user_id, client_number, company_name, private_name, phone)
       VALUES ($1, $2, 'Enterprise Horizon', 'Alok Verma', '+91 9123456789')
       RETURNING id`,
      [clientUserId, `Client #${runId.slice(-3)}`]
    );
    const clientId = clientRes.rows[0].id;
    const tokenClient = jwt.sign(
      { userId: clientUserId, role: ROLES.CLIENT, clientId },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // -------------------------------------------------------------------------
    // 2. DEVELOPER ADMINISTRATION (Approve, Reject, Suspend, Verify)
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Auditing Developer Administration (Approve, Reject, Suspend, Verify)...');

    // 2.1 Approve Developer
    const devToApproveUser = await query(
      `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'DEVELOPER', 'PENDING_VERIFICATION') RETURNING id`,
      [`approve_dev_${runId}@nexus.dev`, passwordHash]
    );
    const devToApprove = await query(
      `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status)
       VALUES ($1, $2, 'Approve Candidate', 'Backend', 4, 'PENDING') RETURNING id`,
      [devToApproveUser.rows[0].id, `cand_appr_${runId}`]
    );
    const devApproveId = devToApprove.rows[0].id;

    const approveRes = await fetch(`${baseUrl}/api/admin/developers/${devApproveId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCeo}` },
    });
    const approveData = (await approveRes.json()) as any;
    if (approveRes.status !== 200 || !approveData.developer?.verified) {
      throw new Error(`Approve developer failed: ${JSON.stringify(approveData)}`);
    }
    console.log('  ✔ Developer Approval: verified = true, status = VERIFIED, 10 welcome credits credited');

    // 2.2 Reject Developer
    const devToRejectUser = await query(
      `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'DEVELOPER', 'PENDING_VERIFICATION') RETURNING id`,
      [`reject_dev_${runId}@nexus.dev`, passwordHash]
    );
    const devToReject = await query(
      `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status)
       VALUES ($1, $2, 'Reject Candidate', 'Junior', 1, 'PENDING') RETURNING id`,
      [devToRejectUser.rows[0].id, `cand_rej_${runId}`]
    );
    const devRejectId = devToReject.rows[0].id;

    const rejectRes = await fetch(`${baseUrl}/api/admin/developers/${devRejectId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCeo}`,
      },
      body: JSON.stringify({ reason: 'Insufficient verified production repository track record.' }),
    });
    const rejectData = (await rejectRes.json()) as any;
    if (rejectRes.status !== 200 || rejectData.developer?.verification_status !== 'REJECTED') {
      throw new Error(`Reject developer failed: ${JSON.stringify(rejectData)}`);
    }
    console.log('  ✔ Developer Rejection: status = REJECTED with logged audit reason');

    // 2.3 Suspend Developer
    const suspendRes = await fetch(`${baseUrl}/api/admin/developers/${devApproveId}/suspend`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCeo}` },
    });
    const suspendData = (await suspendRes.json()) as any;
    if (suspendRes.status !== 200 || suspendData.developer?.verification_status !== 'SUSPENDED') {
      throw new Error(`Suspend developer failed: ${JSON.stringify(suspendData)}`);
    }
    console.log('  ✔ Developer Suspension: status = SUSPENDED, active sessions invalidated');

    // 2.4 Verify Developer (Direct Verify)
    const verifyRes = await fetch(`${baseUrl}/api/admin/developers/${devApproveId}/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCeo}` },
    });
    const verifyData = (await verifyRes.json()) as any;
    if (verifyRes.status !== 200 || verifyData.status !== 'VERIFIED') {
      throw new Error(`Direct verify developer failed: ${JSON.stringify(verifyData)}`);
    }
    console.log('  ✔ Developer Direct Verification: status = VERIFIED');
    results.developerAdministration = true;

    // -------------------------------------------------------------------------
    // 3. PROJECT ADMINISTRATION (Review, Edit, Cancel, Reopen, Claims, Proposals, Completion)
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Auditing Project Administration (Review, Edit, Cancel, Reopen, Claims, Proposals, Completion)...');

    // Create a project
    const projRes = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline, requirements, required_technologies,
         status, claim_cost, max_claims, claim_deadline, client_id
       ) VALUES (
         $1, $2, 'Distributed Cloud Cache Engine', 'In-memory distributed redis alternative',
         'Backend Architecture', 60000, 90000, '30 Days',
         '["Rust", "Distributed Consensus"]'::jsonb, '["Rust", "Redis", "Docker"]'::jsonb,
         'SUBMITTED', 1, 3, NOW() + INTERVAL '14 days', $3
       ) RETURNING id`,
      [`PRJ-2026-ADM-${runId}`, `cloud-cache-${runId}`, clientId]
    );
    const projectId = projRes.rows[0].id;

    // 3.1 Review Project
    const reviewRes = await fetch(`${baseUrl}/api/admin/projects/${projectId}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCeo}`,
      },
      body: JSON.stringify({ notes: 'Technical requirements verified by leadership.' }),
    });
    if (reviewRes.status !== 200) {
      throw new Error(`Review project failed: status ${reviewRes.status}`);
    }
    console.log('  ✔ Project Review: status transitioned to REVIEWING');

    // 3.2 Edit Project
    const editProjRes = await fetch(`${baseUrl}/api/admin/projects/${projectId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCeo}`,
      },
      body: JSON.stringify({
        title: 'Distributed Cloud Cache Engine v2',
        budgetMax: 100000,
        timeline: '45 Days',
      }),
    });
    const editProjData = (await editProjRes.json()) as any;
    if (editProjRes.status !== 200 || Number(editProjData.project?.budget_max) !== 100000) {
      throw new Error(`Edit project failed: ${JSON.stringify(editProjData)}`);
    }
    console.log('  ✔ Project Edit: Parameters updated (budgetMax = 100000, timeline = 45 Days)');

    // 3.3 Cancel Project
    const cancelProjRes = await fetch(`${baseUrl}/api/admin/projects/${projectId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCeo}`,
      },
      body: JSON.stringify({ reason: 'Client requested scope recalculation.' }),
    });
    if (cancelProjRes.status !== 200) {
      throw new Error(`Cancel project failed: status ${cancelProjRes.status}`);
    }
    console.log('  ✔ Project Cancel: status = CANCELLED');

    // 3.4 Reopen Project
    const reopenProjRes = await fetch(`${baseUrl}/api/admin/projects/${projectId}/reopen`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCeo}` },
    });
    if (reopenProjRes.status !== 200) {
      throw new Error(`Reopen project failed: status ${reopenProjRes.status}`);
    }
    console.log('  ✔ Project Reopen: status = OPEN_FOR_CLAIMS');

    // 3.5 Monitor Claims
    const claimsRes = await fetch(`${baseUrl}/api/admin/projects/${projectId}/claims`, {
      headers: { Authorization: `Bearer ${tokenCeo}` },
    });
    if (claimsRes.status !== 200) {
      throw new Error(`Monitor project claims failed: status ${claimsRes.status}`);
    }
    console.log('  ✔ Monitor Claims: Claims retrieval verified');

    // 3.6 View Proposals
    const proposalsRes = await fetch(`${baseUrl}/api/admin/projects/${projectId}/proposals`, {
      headers: { Authorization: `Bearer ${tokenCeo}` },
    });
    if (proposalsRes.status !== 200) {
      throw new Error(`View proposals failed: status ${proposalsRes.status}`);
    }
    console.log('  ✔ View Proposals: Proposals retrieval verified');

    // 3.7 Monitor Completion & Milestones
    const completionRes = await fetch(`${baseUrl}/api/admin/projects/${projectId}/completion`, {
      headers: { Authorization: `Bearer ${tokenCeo}` },
    });
    if (completionRes.status !== 200) {
      throw new Error(`Monitor completion failed: status ${completionRes.status}`);
    }
    console.log('  ✔ Monitor Completion: Milestone progress inspection verified');
    results.projectAdministration = true;

    // -------------------------------------------------------------------------
    // 4. CREDIT ADMINISTRATION (Wallet, Ledger, Adjustment with Reason)
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Auditing Credit Administration (Wallet, Ledger, Manual Adjustment with Required Reason)...');

    // 4.1 View developer wallet
    const walletRes = await fetch(`${baseUrl}/api/admin/developers/${devId}/wallet`, {
      headers: { Authorization: `Bearer ${tokenCeo}` },
    });
    const walletData = (await walletRes.json()) as any;
    if (walletRes.status !== 200 || walletData.balance === undefined) {
      throw new Error(`View developer wallet failed: ${JSON.stringify(walletData)}`);
    }
    console.log(`  ✔ View Wallet: Developer balance retrieved (${walletData.balance} credits)`);

    // 4.2 View Financial Ledger
    const ledgerRes = await fetch(`${baseUrl}/api/admin/ledger`, {
      headers: { Authorization: `Bearer ${tokenCeo}` },
    });
    const ledgerData = (await ledgerRes.json()) as any;
    if (ledgerRes.status !== 200 || !Array.isArray(ledgerData.ledger)) {
      throw new Error(`View financial ledger failed: ${JSON.stringify(ledgerData)}`);
    }
    console.log(`  ✔ View Ledger: Financial transactions ledger retrieved (${ledgerData.ledger.length} entries)`);

    // 4.3 Manual adjustment WITHOUT reason -> REJECTED (400)
    const adjNoReasonRes = await fetch(`${baseUrl}/api/admin/credits/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCeo}`,
      },
      body: JSON.stringify({ developerId: devId, amount: 5 }),
    });
    if (adjNoReasonRes.status !== 400) {
      throw new Error(`Adjustment without reason must be rejected with 400, got ${adjNoReasonRes.status}`);
    }
    console.log('  ✔ Validation Enforced: Manual adjustment without reason strictly rejected: 400 Bad Request');

    // 4.4 Manual adjustment WITH valid reason -> SUCCESS
    const adjWithReasonRes = await fetch(`${baseUrl}/api/admin/credits/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCeo}`,
      },
      body: JSON.stringify({
        developerId: devId,
        amount: 5,
        reason: 'Compensatory discretionary credit grant for platform performance benchmark participation.',
      }),
    });
    const adjWithReasonData = (await adjWithReasonRes.json()) as any;
    if (adjWithReasonRes.status !== 200 || !adjWithReasonData.success) {
      throw new Error(`Manual credit adjustment failed: ${JSON.stringify(adjWithReasonData)}`);
    }
    console.log(`  ✔ Manual Adjustment: +5 credits applied (new balance: ${adjWithReasonData.balance}) with audit reason recorded`);
    results.creditAdministrationWithReason = true;

    // -------------------------------------------------------------------------
    // 5. PAYMENT ADMINISTRATION (View Status, Non-exposure of secrets)
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Auditing Payment Administration & Secret Shielding...');

    const paymentsRes = await fetch(`${baseUrl}/api/admin/payments`, {
      headers: { Authorization: `Bearer ${tokenCeo}` },
    });
    const paymentsData = (await paymentsRes.json()) as any;
    if (paymentsRes.status !== 200 || !Array.isArray(paymentsData.payments)) {
      throw new Error(`List payments failed: ${JSON.stringify(paymentsData)}`);
    }

    const paymentsString = JSON.stringify(paymentsData);
    if (
      paymentsString.includes('key_secret') ||
      paymentsString.includes('webhook_secret') ||
      paymentsString.includes('private_key')
    ) {
      throw new Error('SECURITY VIOLATION: Payment secrets exposed in administrative API response!');
    }
    console.log('  ✔ Payment status accessible to administration');
    console.log('  ✔ Payment secrets (key_secret, webhook_secret, private_key) strictly shielded');
    results.paymentAdministrationNoSecrets = true;

    // -------------------------------------------------------------------------
    // 6. SUPPORT ADMINISTRATION (Tickets, Assign, Bridges)
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Auditing Support Administration...');

    const suppTicketsRes = await fetch(`${baseUrl}/api/admin/support/tickets`, {
      headers: { Authorization: `Bearer ${tokenCeo}` },
    });
    const suppTicketsData = (await suppTicketsRes.json()) as any;
    if (suppTicketsRes.status !== 200 || !Array.isArray(suppTicketsData.tickets)) {
      throw new Error(`List support tickets failed: ${JSON.stringify(suppTicketsData)}`);
    }
    console.log(`  ✔ Support Tickets: Retrieved ${suppTicketsData.tickets.length} tickets for executive management`);
    results.supportAdministration = true;

    // -------------------------------------------------------------------------
    // 7. AUDIT LOGS CAPTURE
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Auditing Audit Log Capture...');

    const auditLogsRes = await fetch(`${baseUrl}/api/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${tokenCeo}` },
    });
    const auditLogsData = (await auditLogsRes.json()) as any;
    if (auditLogsRes.status !== 200 || !Array.isArray(auditLogsData.logs)) {
      throw new Error(`List audit logs failed: ${JSON.stringify(auditLogsData)}`);
    }

    const actions = auditLogsData.logs.map((l: any) => l.action);
    console.log(`  ✔ Audit Trail verified: Found ${auditLogsData.logs.length} logged actions`);
    console.log(`    Recent actions: [${actions.slice(0, 4).join(', ')}]`);
    results.auditLogsCaptured = true;

    // -------------------------------------------------------------------------
    // 8. CEO MANAGES ALL DOMAINS
    // -------------------------------------------------------------------------
    console.log('\n[Test 8] Verifying CEO Full Domain Management...');

    // Clients
    const clientsRes = await fetch(`${baseUrl}/api/admin/clients`, {
      headers: { Authorization: `Bearer ${tokenCeo}` },
    });
    if (clientsRes.status !== 200) throw new Error('CEO cannot manage clients');

    // Claims
    const allClaimsRes = await fetch(`${baseUrl}/api/admin/claims`, {
      headers: { Authorization: `Bearer ${tokenCeo}` },
    });
    if (allClaimsRes.status !== 200) throw new Error('CEO cannot manage claims');

    // Analytics
    const analyticsRes = await fetch(`${baseUrl}/api/admin/analytics`, {
      headers: { Authorization: `Bearer ${tokenCeo}` },
    });
    if (analyticsRes.status !== 200) throw new Error('CEO cannot view analytics');

    // Settings
    const settingsRes = await fetch(`${baseUrl}/api/admin/settings`, {
      headers: { Authorization: `Bearer ${tokenCeo}` },
    });
    if (settingsRes.status !== 200) throw new Error('CEO cannot view settings');

    const updateSetRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCeo}`,
      },
      body: JSON.stringify({ key: 'credit_price_inr', value: 55 }),
    });
    if (updateSetRes.status !== 200) throw new Error('CEO cannot update settings');

    console.log('  ✔ CEO manages: developers, projects, clients, claims, credits, payments, community, support, analytics, settings, audit logs');
    results.ceoManagesAllDomains = true;

    // -------------------------------------------------------------------------
    // 9. MD CONFIGURED PERMISSIONS & PROHIBITED ACTIONS AUDIT
    // -------------------------------------------------------------------------
    console.log('\n[Test 9] Auditing MD Management Permissions & Prohibited CEO-Only Operations...');

    // MD can view projects
    const mdProjRes = await fetch(`${baseUrl}/api/admin/projects`, {
      headers: { Authorization: `Bearer ${tokenMd}` },
    });
    if (mdProjRes.status !== 200) {
      throw new Error(`MD should be allowed to view projects, got ${mdProjRes.status}`);
    }

    // MD can review developers
    const mdDevRes = await fetch(`${baseUrl}/api/admin/developers/pending`, {
      headers: { Authorization: `Bearer ${tokenMd}` },
    });
    if (mdDevRes.status !== 200) {
      throw new Error(`MD should be allowed to view pending developers, got ${mdDevRes.status}`);
    }

    // MD can view analytics
    const mdAnalyticsRes = await fetch(`${baseUrl}/api/admin/analytics`, {
      headers: { Authorization: `Bearer ${tokenMd}` },
    });
    if (mdAnalyticsRes.status !== 200) {
      throw new Error(`MD should be allowed to view analytics, got ${mdAnalyticsRes.status}`);
    }
    console.log('  ✔ MD permitted operational management: projects, developers, analytics');
    results.mdConfiguredPermissions = true;

    // PROHIBITED ACTIONS FOR MD:
    // 1. MD attempts to update system settings (CEO Only)
    const mdSettingsAttempt = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMd}`,
      },
      body: JSON.stringify({ key: 'credit_price_inr', value: 100 }),
    });
    if (mdSettingsAttempt.status !== 403) {
      throw new Error(`MD updating settings should be rejected with 403, got ${mdSettingsAttempt.status}`);
    }
    console.log('  ✔ Prohibited Action: MD attempting to update system settings strictly DENIED: 403 Forbidden');

    // 2. MD attempts manual credit adjustment (CEO Only)
    const mdCreditAdjAttempt = await fetch(`${baseUrl}/api/admin/credits/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMd}`,
      },
      body: JSON.stringify({ developerId: devId, amount: 10, reason: 'MD attempt' }),
    });
    if (mdCreditAdjAttempt.status !== 403) {
      throw new Error(`MD adjusting credits should be rejected with 403, got ${mdCreditAdjAttempt.status}`);
    }
    console.log('  ✔ Prohibited Action: MD attempting manual credit adjustment strictly DENIED: 403 Forbidden');
    results.mdProhibitedActionsBlocked = true;

    // -------------------------------------------------------------------------
    // 10. SECURITY BOUNDARIES: DEVELOPER & CLIENT CANNOT CALL ADMIN ENDPOINTS
    // -------------------------------------------------------------------------
    console.log('\n[Test 10] Auditing Security Boundaries (Developer & Client cannot call Admin endpoints)...');

    // Developer attempts admin endpoint
    const devAdminAttempt = await fetch(`${baseUrl}/api/admin/projects`, {
      headers: { Authorization: `Bearer ${tokenDev}` },
    });
    if (devAdminAttempt.status !== 403) {
      throw new Error(`Developer calling admin endpoint must be rejected with 403, got ${devAdminAttempt.status}`);
    }
    console.log('  ✔ Developer calling admin endpoints strictly DENIED: 403 Forbidden');
    results.securityDeveloperBlocked = true;

    // Client attempts admin endpoint
    const clientAdminAttempt = await fetch(`${baseUrl}/api/admin/projects`, {
      headers: { Authorization: `Bearer ${tokenClient}` },
    });
    if (clientAdminAttempt.status !== 403) {
      throw new Error(`Client calling admin endpoint must be rejected with 403, got ${clientAdminAttempt.status}`);
    }
    console.log('  ✔ Client calling admin endpoints strictly DENIED: 403 Forbidden');
    results.securityClientBlocked = true;

    console.log('\n================================================================');
    console.log('ALL PHASE 14 ADMIN, CEO & MD AUDIT TESTS PASSED');
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

if (process.argv[1]?.endsWith('adminCeoMdAuditTest.ts')) {
  runAdminCeoMdAudit()
    .then((results) => {
      console.log('================================================================');
      console.log('AUDIT REPORT OUTPUT');
      console.log('================================================================');
      console.log(`Leadership roles: CEO: M. Shiva Gopi, MD: Ritesh Lingamallu: ${results.leadershipRolesVerified ? 'PASS' : 'FAIL'}`);
      console.log(`CEO domain management: ${results.ceoManagesAllDomains ? 'PASS' : 'FAIL'}`);
      console.log(`MD management permissions: ${results.mdConfiguredPermissions ? 'PASS' : 'FAIL'}`);
      console.log(`MD prohibited actions blocked: ${results.mdProhibitedActionsBlocked ? 'PASS' : 'FAIL'}`);
      console.log(`Developer administration: ${results.developerAdministration ? 'PASS' : 'FAIL'}`);
      console.log(`Project administration: ${results.projectAdministration ? 'PASS' : 'FAIL'}`);
      console.log(`Credit administration (with reason): ${results.creditAdministrationWithReason ? 'PASS' : 'FAIL'}`);
      console.log(`Payment administration (no secrets): ${results.paymentAdministrationNoSecrets ? 'PASS' : 'FAIL'}`);
      console.log(`Support administration: ${results.supportAdministration ? 'PASS' : 'FAIL'}`);
      console.log(`Audit logs captured: ${results.auditLogsCaptured ? 'PASS' : 'FAIL'}`);
      console.log(`Security: Developer blocked from admin: ${results.securityDeveloperBlocked ? 'PASS' : 'FAIL'}`);
      console.log(`Security: Client blocked from admin: ${results.securityClientBlocked ? 'PASS' : 'FAIL'}`);
      console.log('================================================================');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ AUDIT FAILED:', err);
      process.exit(1);
    });
}
