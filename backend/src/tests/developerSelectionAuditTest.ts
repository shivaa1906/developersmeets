import app from '../server.js';
import { query } from '../database/db.js';
import { env } from '../config/environment.js';
import { DeveloperService } from '../services/developerService.js';
import { CreditLedgerService } from '../services/creditLedgerService.js';
import jwt from 'jsonwebtoken';
import { Server } from 'http';
import bcrypt from 'bcryptjs';

interface AuditResults {
  initialBalances: boolean;
  claimDeductions: boolean;
  developer01Selected: boolean;
  developer02NotSelectedRefunded: boolean;
  developer03NotSelectedRefunded: boolean;
  projectStatus: boolean;
  projectMemberLead: boolean;
  conversationsStatus: boolean;
  duplicateSelectionRejected: boolean;
  concurrentSelectionSafe: boolean;
  refundsExact: boolean;
  duplicateRefundSuppressed: boolean;
  auditLogVerified: boolean;
}

export async function runDeveloperSelectionAudit(): Promise<AuditResults> {
  console.log('================================================================');
  console.log('PHASE 9: DEVELOPER SELECTION & REFUND AUDIT');
  console.log('================================================================\n');

  let server: Server | null = null;
  let baseUrl = '';

  const results: AuditResults = {
    initialBalances: false,
    claimDeductions: false,
    developer01Selected: false,
    developer02NotSelectedRefunded: false,
    developer03NotSelectedRefunded: false,
    projectStatus: false,
    projectMemberLead: false,
    conversationsStatus: false,
    duplicateSelectionRejected: false,
    concurrentSelectionSafe: false,
    refundsExact: false,
    duplicateRefundSuppressed: false,
    auditLogVerified: false,
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

    const suffix = `sel_${Date.now()}`;
    const pwdHash = await bcrypt.hash('AuditedPassword2026!', 8);

    // -------------------------------------------------------------------------
    // SETUP: CLIENT #001 AND PROJECT #0001
    // -------------------------------------------------------------------------
    console.log('[Setup] Setting up Client #001 and Project #0001...');

    const clientRes = await query("SELECT id, user_id FROM clients WHERE client_number = 'Client #001' LIMIT 1");
    let clientId = '';
    let clientUserId = '';
    if (clientRes.rows.length === 0) {
      const uRes = await query(
        "INSERT INTO users (email, password_hash, role, status) VALUES ('client001@apexretail.io', $1, 'CLIENT', 'ACTIVE') RETURNING id",
        [pwdHash]
      );
      clientUserId = uRes.rows[0].id;
      const cRes = await query(
        "INSERT INTO clients (user_id, client_number, company_name, private_name, phone) VALUES ($1, 'Client #001', 'Apex Retail Labs', 'Ravi Kumar', '+91 9988776655') RETURNING id",
        [clientUserId]
      );
      clientId = cRes.rows[0].id;
    } else {
      clientId = clientRes.rows[0].id;
      clientUserId = clientRes.rows[0].user_id;
    }

    const clientToken = jwt.sign(
      { userId: clientUserId, email: 'client001@apexretail.io', role: 'CLIENT', clientId },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Check or create Project #0001
    const projectRes = await query("SELECT id FROM projects WHERE project_number = 'PRJ-2026-0001' LIMIT 1");
    let projectId = '';

    if (projectRes.rows.length === 0) {
      const pRes = await query(
        `INSERT INTO projects (
           project_number, slug, title, description, category,
           budget_min, budget_max, timeline, requirements, required_technologies,
           status, claim_cost, max_claims, claim_deadline, client_id
         ) VALUES (
           'PRJ-2026-0001', $1, 'Autonomous AI E-Commerce Engine',
           'High-throughput distributed commerce system with real-time vector search and multi-tenant billing.',
           'Full-Stack Development', 50000, 80000, '30–45 days',
           '["React", "Node.js", "PostgreSQL"]'::jsonb,
           '["React", "Node.js", "PostgreSQL"]'::jsonb,
           'OPEN_FOR_CLAIMS', 1, 3, NOW() + INTERVAL '14 days', $2
         ) RETURNING id`,
        [`autonomous-commerce-selection-${suffix}`, clientId]
      );
      projectId = pRes.rows[0].id;
    } else {
      projectId = projectRes.rows[0].id;
      // Clean previous state
      await query('DELETE FROM proposals WHERE project_claim_id IN (SELECT id FROM project_claims WHERE project_id = $1)', [projectId]);
      await query('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE project_id = $1)', [projectId]);
      await query('DELETE FROM conversation_members WHERE conversation_id IN (SELECT id FROM conversations WHERE project_id = $1)', [projectId]);
      await query('DELETE FROM conversations WHERE project_id = $1', [projectId]);
      await query('DELETE FROM project_members WHERE project_id = $1', [projectId]);
      await query('DELETE FROM project_claims WHERE project_id = $1', [projectId]);
      await query('DELETE FROM audit_logs WHERE entity_id = $1', [projectId]);
      await query(
        `UPDATE projects
         SET status = 'OPEN_FOR_CLAIMS', max_claims = 3, claim_cost = 1,
             lead_developer_id = NULL,
             requirements = '["React", "Node.js", "PostgreSQL"]'::jsonb,
             required_technologies = '["React", "Node.js", "PostgreSQL"]'::jsonb
         WHERE id = $1`,
        [projectId]
      );
    }

    console.log(`  ✔ Client #001 initialized (ID: ${clientId})`);
    console.log(`  ✔ Project #0001 initialized (ID: ${projectId})`);

    // -------------------------------------------------------------------------
    // SETUP DEVELOPERS WITH EXACT 5 CREDITS EACH
    // -------------------------------------------------------------------------
    console.log('\n[Setup] Provisioning Developers #01, #02, #03 with exactly 5 credits each...');

    const createDev = async (name: string, username: string) => {
      const uRes = await query(
        "INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'DEVELOPER', 'ACTIVE') RETURNING id",
        [`${username}@nexus.dev`, pwdHash]
      );
      const userId = uRes.rows[0].id;

      const dRes = await query(
        `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status, verified_at)
         VALUES ($1, $2, $3, 'Senior Engineer', 6, 'VERIFIED', NOW())
         RETURNING id`,
        [userId, username, name]
      );
      const devId = dRes.rows[0].id;

      await query(
        'INSERT INTO credit_accounts (developer_id, balance) VALUES ($1, 5) ON CONFLICT (developer_id) DO UPDATE SET balance = 5',
        [devId]
      );

      await DeveloperService.updateProfile(devId, { skills: ['React', 'Node.js', 'PostgreSQL'] });

      const token = jwt.sign(
        { userId, email: `${username}@nexus.dev`, role: 'DEVELOPER', developerId: devId },
        env.JWT_SECRET,
        { expiresIn: '2h' }
      );

      return { userId, devId, name, username, token };
    };

    const dev1 = await createDev('Developer #01', `dev01_${suffix}`);
    const dev2 = await createDev('Developer #02', `dev02_${suffix}`);
    const dev3 = await createDev('Developer #03', `dev03_${suffix}`);

    // Verify Initial balances: Dev 1 = 5, Dev 2 = 5, Dev 3 = 5
    const getBalance = async (devId: string) => {
      const r = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [devId]);
      return r.rows[0].balance;
    };

    const bal1Init = await getBalance(dev1.devId);
    const bal2Init = await getBalance(dev2.devId);
    const bal3Init = await getBalance(dev3.devId);

    if (bal1Init !== 5 || bal2Init !== 5 || bal3Init !== 5) {
      throw new Error(`Initial balance mismatch: dev1=${bal1Init}, dev2=${bal2Init}, dev3=${bal3Init}`);
    }
    console.log('  ✔ Initial balances verified:');
    console.log(`    Developer #01 = ${bal1Init} credits`);
    console.log(`    Developer #02 = ${bal2Init} credits`);
    console.log(`    Developer #03 = ${bal3Init} credits`);
    results.initialBalances = true;

    // -------------------------------------------------------------------------
    // STEP 1: ALL CLAIM PROJECT #0001
    // -------------------------------------------------------------------------
    console.log('\n[Step 1] All three developers claim Project #0001...');

    const claimProject = async (dev: any) => {
      const res = await fetch(`${baseUrl}/api/projects/${projectId}/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${dev.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pitch: `Claim pitch from ${dev.name}`, estimatedDays: 30 }),
      });
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`Claim failed for ${dev.name}: ${await res.text()}`);
      }
      return (await res.json()) as any;
    };

    const claim1Data = await claimProject(dev1);
    const claim2Data = await claimProject(dev2);
    const claim3Data = await claimProject(dev3);

    const conv1Id = claim1Data.conversationId;
    const conv2Id = claim2Data.conversationId;
    const conv3Id = claim3Data.conversationId;

    // Verify balances after claim: Dev 1 = 4, Dev 2 = 4, Dev 3 = 4
    const bal1PostClaim = await getBalance(dev1.devId);
    const bal2PostClaim = await getBalance(dev2.devId);
    const bal3PostClaim = await getBalance(dev3.devId);

    if (bal1PostClaim !== 4 || bal2PostClaim !== 4 || bal3PostClaim !== 4) {
      throw new Error(`Balances after claim mismatch: dev1=${bal1PostClaim}, dev2=${bal2PostClaim}, dev3=${bal3PostClaim}`);
    }
    console.log('  ✔ After claim balances verified:');
    console.log(`    Developer #01 = ${bal1PostClaim} credits`);
    console.log(`    Developer #02 = ${bal2PostClaim} credits`);
    console.log(`    Developer #03 = ${bal3PostClaim} credits`);
    results.claimDeductions = true;

    // -------------------------------------------------------------------------
    // STEP 2: CLIENT SELECTS DEVELOPER #01
    // -------------------------------------------------------------------------
    console.log('\n[Step 2] Client selects Developer #01...');

    const selectRes = await fetch(`${baseUrl}/api/projects/${projectId}/select`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ selectedDeveloperId: dev1.devId }),
    });

    if (selectRes.status !== 200) {
      throw new Error(`Select Developer #01 failed: ${await selectRes.text()}`);
    }
    const selectData = (await selectRes.json()) as any;
    console.log(`  ✔ Selection request succeeded (Refunded count: ${selectData.refundedCount})`);

    // Verify Developer #01: SELECTED, 4 credits
    const claim1Row = await query('SELECT status FROM project_claims WHERE project_id = $1 AND developer_id = $2', [
      projectId,
      dev1.devId,
    ]);
    const dev1BalPostSelect = await getBalance(dev1.devId);

    if (claim1Row.rows[0].status !== 'SELECTED' || dev1BalPostSelect !== 4) {
      throw new Error(`Developer #01 invalid: status=${claim1Row.rows[0].status}, balance=${dev1BalPostSelect}`);
    }
    console.log('  ✔ Developer #01: status = SELECTED, balance = 4 credits');
    results.developer01Selected = true;

    // Verify Developer #02: NOT_SELECTED, 5 credits
    const claim2Row = await query('SELECT status FROM project_claims WHERE project_id = $1 AND developer_id = $2', [
      projectId,
      dev2.devId,
    ]);
    const dev2BalPostSelect = await getBalance(dev2.devId);

    if (claim2Row.rows[0].status !== 'NOT_SELECTED' || dev2BalPostSelect !== 5) {
      throw new Error(`Developer #02 invalid: status=${claim2Row.rows[0].status}, balance=${dev2BalPostSelect}`);
    }
    console.log('  ✔ Developer #02: status = NOT_SELECTED, balance = 5 credits (100% refunded)');
    results.developer02NotSelectedRefunded = true;

    // Verify Developer #03: NOT_SELECTED, 5 credits
    const claim3Row = await query('SELECT status FROM project_claims WHERE project_id = $1 AND developer_id = $2', [
      projectId,
      dev3.devId,
    ]);
    const dev3BalPostSelect = await getBalance(dev3.devId);

    if (claim3Row.rows[0].status !== 'NOT_SELECTED' || dev3BalPostSelect !== 5) {
      throw new Error(`Developer #03 invalid: status=${claim3Row.rows[0].status}, balance=${dev3BalPostSelect}`);
    }
    console.log('  ✔ Developer #03: status = NOT_SELECTED, balance = 5 credits (100% refunded)');
    results.developer03NotSelectedRefunded = true;

    // Verify Project status: DEVELOPER_SELECTED
    const projCheck = await query('SELECT status, lead_developer_id FROM projects WHERE id = $1', [projectId]);
    if (projCheck.rows[0].status !== 'DEVELOPER_SELECTED') {
      throw new Error(`Expected project status DEVELOPER_SELECTED, got: ${projCheck.rows[0].status}`);
    }
    console.log('  ✔ Project status: DEVELOPER_SELECTED');
    results.projectStatus = true;

    // Verify Project member: Developer #01, Role: LEAD
    const memberCheck = await query(
      'SELECT developer_id, role FROM project_members WHERE project_id = $1',
      [projectId]
    );
    if (memberCheck.rows.length !== 1 || memberCheck.rows[0].developer_id !== dev1.devId || memberCheck.rows[0].role !== 'LEAD') {
      throw new Error(`Invalid project members: ${JSON.stringify(memberCheck.rows)}`);
    }
    if (projCheck.rows[0].lead_developer_id !== dev1.devId) {
      throw new Error(`lead_developer_id mismatch: ${projCheck.rows[0].lead_developer_id}`);
    }
    console.log('  ✔ Project member: Developer #01, Role: LEAD');
    results.projectMemberLead = true;

    // Verify Conversations:
    // Developer #01 conversation: ACTIVE
    // Developer #02: CLOSED
    // Developer #03: CLOSED
    const conv1Row = await query('SELECT status FROM conversations WHERE id = $1', [conv1Id]);
    const conv2Row = await query('SELECT status FROM conversations WHERE id = $1', [conv2Id]);
    const conv3Row = await query('SELECT status FROM conversations WHERE id = $1', [conv3Id]);

    if (conv1Row.rows[0].status !== 'ACTIVE') {
      throw new Error(`Expected Dev 1 conversation ACTIVE, got: ${conv1Row.rows[0].status}`);
    }
    if (conv2Row.rows[0].status !== 'CLOSED') {
      throw new Error(`Expected Dev 2 conversation CLOSED, got: ${conv2Row.rows[0].status}`);
    }
    if (conv3Row.rows[0].status !== 'CLOSED') {
      throw new Error(`Expected Dev 3 conversation CLOSED, got: ${conv3Row.rows[0].status}`);
    }

    console.log('  ✔ Conversation statuses verified:');
    console.log(`    Developer #01 conversation: ${conv1Row.rows[0].status}`);
    console.log(`    Developer #02 conversation: ${conv2Row.rows[0].status}`);
    console.log(`    Developer #03 conversation: ${conv3Row.rows[0].status}`);
    results.conversationsStatus = true;

    // -------------------------------------------------------------------------
    // STEP 3: DUPLICATE SELECTION DEFENSE
    // -------------------------------------------------------------------------
    console.log('\n[Step 3] Testing duplicate selection defense (Try selecting Developer #02 after #01 is selected)...');
    const dupSelectRes = await fetch(`${baseUrl}/api/projects/${projectId}/select`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ selectedDeveloperId: dev2.devId }),
    });

    if (dupSelectRes.status !== 409 && dupSelectRes.status !== 400) {
      throw new Error(`Duplicate selection was not rejected! Status: ${dupSelectRes.status}`);
    }
    const dupErrText = await dupSelectRes.text();
    console.log(`  ✔ Duplicate selection rejected (${dupSelectRes.status}): ${dupErrText}`);

    // Verify project lead developer untouched
    const projCheckDup = await query('SELECT lead_developer_id, status FROM projects WHERE id = $1', [projectId]);
    if (projCheckDup.rows[0].lead_developer_id !== dev1.devId) {
      throw new Error('Project lead was corrupted by duplicate selection attempt!');
    }
    results.duplicateSelectionRejected = true;

    // -------------------------------------------------------------------------
    // STEP 4: CONCURRENT SELECTION SIMULATION
    // -------------------------------------------------------------------------
    console.log('\n[Step 4] Simulating concurrent selection (Simulate 2 client requests: Select #01 vs Select #02)...');

    // Create a new project for concurrent selection test
    const concProjRes = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline, requirements, required_technologies,
         status, claim_cost, max_claims, claim_deadline, client_id
       ) VALUES (
         $1, $2, 'High-Concurrency Selection Test', 'Concurrency protocol testing',
         'Full-Stack Development', 60000, 90000, '30 days',
         '["React", "Node.js", "PostgreSQL"]'::jsonb,
         '["React", "Node.js", "PostgreSQL"]'::jsonb,
         'OPEN_FOR_CLAIMS', 1, 2, NOW() + INTERVAL '10 days', $3
       ) RETURNING id`,
      [`PRJ-CONC-${Date.now().toString().slice(-4)}`, `concurrent-sel-${suffix}`, clientId]
    );
    const concProjectId = concProjRes.rows[0].id;

    // Reset dev 1 and dev 2 credits for this test
    await query('UPDATE credit_accounts SET balance = 5 WHERE developer_id IN ($1, $2)', [dev1.devId, dev2.devId]);

    // Both claim project
    await fetch(`${baseUrl}/api/projects/${concProjectId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dev1.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pitch: 'Concurrent dev 1 pitch', estimatedDays: 30 }),
    });
    await fetch(`${baseUrl}/api/projects/${concProjectId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dev2.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pitch: 'Concurrent dev 2 pitch', estimatedDays: 30 }),
    });

    console.log('  - Firing two selection requests in parallel (Select Dev 1 vs Select Dev 2)...');
    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/api/projects/${concProjectId}/select`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${clientToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedDeveloperId: dev1.devId }),
      }),
      fetch(`${baseUrl}/api/projects/${concProjectId}/select`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${clientToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedDeveloperId: dev2.devId }),
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    console.log(`  - Concurrency response statuses: [${statuses[0]}, ${statuses[1]}]`);

    const hasSuccess = statuses.includes(200);
    const hasRejected = statuses.includes(400) || statuses.includes(409);

    if (!hasSuccess || !hasRejected) {
      throw new Error(`Expected exactly one 200 and one 400/409, got: [${statuses[0]}, ${statuses[1]}]`);
    }

    // Verify the project must never have two selected lead developers
    const concMembers = await query('SELECT developer_id, role FROM project_members WHERE project_id = $1 AND role = \'LEAD\'', [
      concProjectId,
    ]);
    if (concMembers.rows.length !== 1) {
      throw new Error(`CRITICAL: Project has ${concMembers.rows.length} lead developers!`);
    }

    const concProjLead = await query('SELECT lead_developer_id, status FROM projects WHERE id = $1', [concProjectId]);
    if (!concProjLead.rows[0].lead_developer_id || concProjLead.rows[0].status !== 'DEVELOPER_SELECTED') {
      throw new Error(`Invalid concurrent project lead state: ${JSON.stringify(concProjLead.rows[0])}`);
    }

    console.log('  ✔ Atomic row-locking ensured exactly ONE selection succeeded');
    console.log(`  ✔ Confirmed project has exactly ONE lead developer (${concMembers.rows[0].developer_id})`);
    results.concurrentSelectionSafe = true;

    // -------------------------------------------------------------------------
    // STEP 5: REFUND VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n[Step 5] Verifying each non-selected developer receives exactly one refund...');

    // On Project #0001:
    const dev2RefundTxs = await query(
      "SELECT id, amount, balance_after, reference_id FROM credit_transactions WHERE developer_id = $1 AND type = 'PROJECT_NOT_SELECTED_REFUND' AND project_id = $2",
      [dev2.devId, projectId]
    );
    const dev3RefundTxs = await query(
      "SELECT id, amount, balance_after, reference_id FROM credit_transactions WHERE developer_id = $1 AND type = 'PROJECT_NOT_SELECTED_REFUND' AND project_id = $2",
      [dev3.devId, projectId]
    );
    const dev1RefundTxs = await query(
      "SELECT id FROM credit_transactions WHERE developer_id = $1 AND type = 'PROJECT_NOT_SELECTED_REFUND' AND project_id = $2",
      [dev1.devId, projectId]
    );

    if (dev2RefundTxs.rows.length !== 1) {
      throw new Error(`Expected exactly 1 refund for Dev 2, found ${dev2RefundTxs.rows.length}`);
    }
    if (dev3RefundTxs.rows.length !== 1) {
      throw new Error(`Expected exactly 1 refund for Dev 3, found ${dev3RefundTxs.rows.length}`);
    }
    if (dev1RefundTxs.rows.length !== 0) {
      throw new Error('Selected Developer #01 received an illegal refund!');
    }

    console.log('  ✔ Developer #02 received exactly 1 refund (Ref: ' + dev2RefundTxs.rows[0].reference_id + ')');
    console.log('  ✔ Developer #03 received exactly 1 refund (Ref: ' + dev3RefundTxs.rows[0].reference_id + ')');
    console.log('  ✔ Selected Developer #01 received 0 refunds');
    results.refundsExact = true;

    // -------------------------------------------------------------------------
    // STEP 6: DUPLICATE REFUND PREVENTION
    // -------------------------------------------------------------------------
    console.log('\n[Step 6] Testing duplicate refund prevention (Run selection/refund process again)...');

    const rerunRefundResult = await CreditLedgerService.processSelectionRefunds(projectId, dev1.devId);
    if (rerunRefundResult.refundedDevelopersCount !== 0) {
      throw new Error(`Duplicate refund issued! Refunded count: ${rerunRefundResult.refundedDevelopersCount}`);
    }

    const dev1FinalBal = await getBalance(dev1.devId);
    const dev2FinalBal = await getBalance(dev2.devId);
    const dev3FinalBal = await getBalance(dev3.devId);

    const concLeadId = concMembers.rows[0].developer_id;
    const expectedDev1 = concLeadId === dev1.devId ? 4 : 5;
    const expectedDev2 = concLeadId === dev2.devId ? 4 : 5;

    if (dev1FinalBal !== expectedDev1 || dev2FinalBal !== expectedDev2 || dev3FinalBal !== 5) {
      throw new Error(`Balance corrupted after refund re-run: dev1=${dev1FinalBal}, dev2=${dev2FinalBal}, dev3=${dev3FinalBal}`);
    }

    console.log('  ✔ No additional credits issued:');
    console.log(`    Developer #01 = ${dev1FinalBal} credits`);
    console.log(`    Developer #02 = ${dev2FinalBal} credits`);
    console.log(`    Developer #03 = ${dev3FinalBal} credits`);
    results.duplicateRefundSuppressed = true;

    // -------------------------------------------------------------------------
    // STEP 7: AUDIT LOG VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n[Step 7] Verifying audit log recording...');
    const auditRes = await query(
      "SELECT id, actor_user_id, action, entity_type, entity_id, metadata, created_at FROM audit_logs WHERE entity_id = $1 AND action = 'DEVELOPER_SELECTED' ORDER BY created_at DESC LIMIT 1",
      [projectId]
    );

    if (auditRes.rows.length === 0) {
      throw new Error('Audit log for DEVELOPER_SELECTED not found!');
    }

    const logEntry = auditRes.rows[0];
    const meta = typeof logEntry.metadata === 'string' ? JSON.parse(logEntry.metadata) : logEntry.metadata;

    const hasClient = meta.clientId || meta.client;
    const hasProject = meta.projectId || meta.project;
    const hasSelectedDev = meta.selectedDeveloperId || meta.selected_developer;
    const hasTimestamp = meta.timestamp || logEntry.created_at;
    const hasRefunds = meta.refunds !== undefined;

    if (!hasClient || !hasProject || !hasSelectedDev || !hasTimestamp || !hasRefunds) {
      throw new Error(`Audit log metadata missing required fields: ${JSON.stringify(meta)}`);
    }

    console.log('  ✔ Audit log record verified:');
    console.log(`    - client: ${hasClient}`);
    console.log(`    - project: ${hasProject}`);
    console.log(`    - selected developer: ${hasSelectedDev}`);
    console.log(`    - timestamp: ${hasTimestamp}`);
    console.log(`    - refunds: ${meta.refunds}`);
    results.auditLogVerified = true;

    console.log('\n================================================================');
    console.log('ALL PHASE 9 DEVELOPER SELECTION & REFUND AUDIT TESTS PASSED');
    console.log('================================================================\n');

    return results;
  } finally {
    if (server) {
      await new Promise<void>((resolve) => {
        (server as Server).close(() => resolve());
      });
      console.log('[Audit Harness] Live test server shut down cleanly.');
    }
  }
}

// Allow direct execution via tsx
if (process.argv[1]?.endsWith('developerSelectionAuditTest.ts')) {
  runDeveloperSelectionAudit()
    .then((results) => {
      console.log('\n================================================================');
      console.log('AUDIT REPORT OUTPUT');
      console.log('================================================================');
      console.log(`Initial balances: ${results.initialBalances ? 'PASS' : 'FAIL'}`);
      console.log(`Claim deductions: ${results.claimDeductions ? 'PASS' : 'FAIL'}`);
      console.log(`Developer #01 (SELECTED, 4 credits): ${results.developer01Selected ? 'PASS' : 'FAIL'}`);
      console.log(`Developer #02 (NOT_SELECTED, 5 credits): ${results.developer02NotSelectedRefunded ? 'PASS' : 'FAIL'}`);
      console.log(`Developer #03 (NOT_SELECTED, 5 credits): ${results.developer03NotSelectedRefunded ? 'PASS' : 'FAIL'}`);
      console.log(`Project status (DEVELOPER_SELECTED): ${results.projectStatus ? 'PASS' : 'FAIL'}`);
      console.log(`Project member (Developer #01, LEAD): ${results.projectMemberLead ? 'PASS' : 'FAIL'}`);
      console.log(`Conversation states (Dev #01 ACTIVE, Dev #02/#03 CLOSED): ${results.conversationsStatus ? 'PASS' : 'FAIL'}`);
      console.log(`Duplicate selection: ${results.duplicateSelectionRejected ? 'PASS' : 'FAIL'}`);
      console.log(`Concurrent selection: ${results.concurrentSelectionSafe ? 'PASS' : 'FAIL'}`);
      console.log(`Refund: ${results.refundsExact ? 'PASS' : 'FAIL'}`);
      console.log(`Duplicate refund: ${results.duplicateRefundSuppressed ? 'PASS' : 'FAIL'}`);
      console.log(`Audit log: ${results.auditLogVerified ? 'PASS' : 'FAIL'}`);
      console.log('================================================================\n');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ Phase 9 Audit Test Suite Failed:', err);
      process.exit(1);
    });
}
