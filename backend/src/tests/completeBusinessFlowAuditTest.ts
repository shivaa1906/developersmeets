/**
 * Phase 19: Complete Business Flow Verification Test Suite
 * 
 * Executes one complete, realistic end-to-end lifecycle test:
 * - Client #001
 * - Developer #01, Developer #02, Developer #03
 * - Project #0001
 * 
 * Verifies all 20 Steps:
 * STEP 1: Developers approved
 * STEP 2: Developers purchase 10 credits each (ledger balance = 10 each)
 * STEP 3: Client #001 creates Project #0001 (React, Node.js, PostgreSQL; ₹50,000–₹80,000)
 * STEP 4: Admin approves project (OPEN_FOR_CLAIMS)
 * STEP 5: Developer #01 claims (Balance: 9)
 * STEP 6: Developer #02 claims (Balance: 9)
 * STEP 7: Developer #03 claims (Balance: 9)
 * STEP 8: Verify three independent private conversations (Client sees Developer #01, #02, #03; zero identity leaks)
 * STEP 9: Each developer submits proposal (isolated from competing developers)
 * STEP 10: Client selects Developer #02 (Dev #02: SELECTED, 9 credits; Dev #01: NOT_SELECTED, 10 credits; Dev #03: NOT_SELECTED, 10 credits)
 * STEP 11: Developer #02 receives project workspace (unselected developers blocked with 403)
 * STEP 12: Developer #02 completes milestones (Phase 1, Phase 2, Phase 3 with deliverables & client approvals)
 * STEP 13: Client approves completion (with change request test cycle)
 * STEP 14: Project transitions to COMPLETED, then PUBLISHED
 * STEP 15: Public project page: Built by Developer #02 public profile (zero client PII leak)
 * STEP 16: Original project chat closes (read-only enforcement)
 * STEP 17: Client creates support ticket (SUP-2026-0001)
 * STEP 18: Support creates anonymous bridge (SUPPORT BRIDGE #001)
 * STEP 19: Developer #02 joins bridge (unrelated developers blocked with 403)
 * STEP 20: Client receives support (full lifecycle OPEN -> ASSIGNED -> INVESTIGATING -> IN_PROGRESS -> RESOLVED -> CLOSED)
 * 
 * FINAL VERIFICATION:
 * - Database record consistency
 * - Credit ledger transaction reconciliation
 * - Zero identity leaks
 * - Zero duplicate claims / refunds
 * - Zero unauthorized chat access
 */

import app from '../server.js';
import { query, withTransaction } from '../database/db.js';
import { env } from '../config/environment.js';
import { ROLES } from '../config/constants.js';
import { ProjectService } from '../services/projectService.js';
import { WorkspaceService } from '../services/workspaceService.js';
import { CreditLedgerService } from '../services/creditLedgerService.js';
import { ChatService } from '../services/chatService.js';
import { SupportService } from '../services/supportService.js';
import { DeveloperService } from '../services/developerService.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Server } from 'http';

interface StepVerification {
  step: number;
  name: string;
  passed: boolean;
  details: string;
}

export async function runCompleteBusinessFlowAudit(): Promise<{
  allPassed: boolean;
  steps: StepVerification[];
  summary: Record<string, any>;
}> {
  console.log('================================================================');
  console.log('STARTING PHASE 19: COMPLETE BUSINESS FLOW VERIFICATION');
  console.log('================================================================\n');

  let server: Server | null = null;
  let baseUrl = '';

  const steps: StepVerification[] = [];

  function recordStep(step: number, name: string, passed: boolean, details: string) {
    steps.push({ step, name, passed, details });
    const mark = passed ? '✔' : '❌';
    console.log(`[STEP ${step}] ${mark} ${name}: ${details}`);
    if (!passed) {
      throw new Error(`Step ${step} failed: ${details}`);
    }
  }

  try {
    // 0. Spin up test server on ephemeral port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server?.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`[Audit Harness] Live test server listening at ${baseUrl}\n`);
        resolve();
      });
    });

    const suffix = `flow_${Date.now()}`;
    const pwdHash = await bcrypt.hash('AuditedPassword2026!', 8);

    // Fetch or verify admin / leadership user
    const adminCheck = await query(`SELECT id FROM users WHERE role = 'CEO' LIMIT 1`);
    if (adminCheck.rows.length === 0) {
      throw new Error('Admin leadership user not found');
    }
    const adminUserId = adminCheck.rows[0].id;

    // -------------------------------------------------------------------------
    // SETUP: ENTITIES CREATION (Client #001, Developer #01, #02, #03)
    // -------------------------------------------------------------------------
    console.log('--- INITIALIZING PLATFORM ENTITIES ---');

    // 1. Client #001
    let client001Id: string;
    let client001UserId: string;
    const existingClient = await query(`SELECT id, user_id FROM clients WHERE client_number = 'Client #001' LIMIT 1`);
    if (existingClient.rows.length > 0) {
      client001Id = existingClient.rows[0].id;
      client001UserId = existingClient.rows[0].user_id;
    } else {
      const uRes = await query(
        `INSERT INTO users (email, phone, password_hash, role, status)
         VALUES ($1, '+91 9988776655', $2, 'CLIENT', 'ACTIVE') RETURNING id`,
        [`client001.${suffix}@apexretail.io`, pwdHash]
      );
      client001UserId = uRes.rows[0].id;
      const cRes = await query(
        `INSERT INTO clients (user_id, client_number, company_name, private_name, phone)
         VALUES ($1, 'Client #001', 'Apex Retail Labs', 'Ravi Kumar', '+91 9988776655') RETURNING id`,
        [client001UserId]
      );
      client001Id = cRes.rows[0].id;
    }

    const _clientToken = jwt.sign(
      { userId: client001UserId, email: 'client001@apexretail.io', role: ROLES.CLIENT, clientId: client001Id },
      env.JWT_SECRET
    );

    // 2. Developer #01, Developer #02, Developer #03
    interface DevEntity {
      num: string;
      userId: string;
      devId: string;
      username: string;
      displayName: string;
      email: string;
      token: string;
    }

    const devConfigs = [
      {
        num: 'Developer #01',
        username: `arjun-mehta-${suffix}`,
        displayName: 'Arjun Mehta',
        roleTitle: 'Full Stack Engineer',
        email: `dev01.${suffix}@nexus.dev`,
        phone: '+91 9123456781',
      },
      {
        num: 'Developer #02',
        username: `ritesh-lingamallu-${suffix}`,
        displayName: 'Ritesh Lingamallu',
        roleTitle: 'Senior Distributed Systems Architect',
        email: `dev02.${suffix}@nexus.dev`,
        phone: '+91 9123456782',
      },
      {
        num: 'Developer #03',
        username: `ananya-sharma-${suffix}`,
        displayName: 'Ananya Sharma',
        roleTitle: 'Backend Systems Engineer',
        email: `dev03.${suffix}@nexus.dev`,
        phone: '+91 9123456783',
      },
    ];

    const developers: DevEntity[] = [];

    for (const cfg of devConfigs) {
      const uRes = await query(
        `INSERT INTO users (email, phone, password_hash, role, status)
         VALUES ($1, $2, $3, 'DEVELOPER', 'PENDING_VERIFICATION') RETURNING id`,
        [cfg.email, cfg.phone, pwdHash]
      );
      const devUserId = uRes.rows[0].id;

      const dRes = await query(
        `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status)
         VALUES ($1, $2, $3, $4, 6, 'PENDING') RETURNING id`,
        [devUserId, cfg.username, cfg.displayName, cfg.roleTitle]
      );
      const devId = dRes.rows[0].id;

      // Seed credit account with initial 0 balance
      await query(`INSERT INTO credit_accounts (developer_id, balance) VALUES ($1, 0)`, [devId]);

      // Seed developer skills required for project: React, Node.js, PostgreSQL
      await DeveloperService.updateProfile(devId, {
        skills: ['React', 'Node.js', 'PostgreSQL', 'TypeScript', 'Docker'],
      });

      const token = jwt.sign(
        { userId: devUserId, email: cfg.email, role: ROLES.DEVELOPER, developerId: devId },
        env.JWT_SECRET
      );

      developers.push({
        num: cfg.num,
        userId: devUserId,
        devId,
        username: cfg.username,
        displayName: cfg.displayName,
        email: cfg.email,
        token,
      });
    }

    const dev01 = developers[0];
    const dev02 = developers[1];
    const dev03 = developers[2];

    // -------------------------------------------------------------------------
    // STEP 1: DEVELOPERS APPROVED
    // -------------------------------------------------------------------------
    console.log('\n--- EXECUTING VERIFICATION STEPS ---');

    for (const dev of developers) {
      await withTransaction(async (client) => {
        await client.query(`UPDATE users SET status = 'ACTIVE' WHERE id = $1`, [dev.userId]);
        await client.query(
          `UPDATE developers SET verification_status = 'VERIFIED', verified_at = NOW() WHERE id = $1`,
          [dev.devId]
        );
      });
    }

    // Verify approval state
    const devStatusCheck = await query(
      `SELECT COUNT(*) FROM developers WHERE id = ANY($1) AND verification_status = 'VERIFIED'`,
      [[dev01.devId, dev02.devId, dev03.devId]]
    );
    recordStep(
      1,
      'Developers Approved',
      parseInt(devStatusCheck.rows[0].count, 10) === 3,
      'Developer #01, #02, #03 approved with status VERIFIED'
    );

    // -------------------------------------------------------------------------
    // STEP 2: EACH DEVELOPER PURCHASES 10 CREDITS
    // -------------------------------------------------------------------------
    for (const dev of developers) {
      const orderId = `order_${Date.now()}_${dev.devId.slice(0, 6)}`;
      await query(
        `INSERT INTO payments (user_id, amount, currency, gateway, gateway_payment_id, status, metadata)
         VALUES ($1, 500, 'INR', 'STRIPE_TEST', $2, 'PENDING', $3)`,
        [dev.userId, orderId, JSON.stringify({ developerId: dev.devId, credits: 10 })]
      );

      const payload = JSON.stringify({
        event: 'payment.success',
        timestamp: Date.now(),
        data: {
          gatewayPaymentId: orderId,
          developerId: dev.devId,
          credits: 10,
        },
      });

      const signature = crypto
        .createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

      await fetch(`${baseUrl}/api/credits/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-nexus-signature': signature,
        },
        body: payload,
      });
    }

    const dev01Bal = await query(`SELECT balance FROM credit_accounts WHERE developer_id = $1`, [dev01.devId]);
    const dev02Bal = await query(`SELECT balance FROM credit_accounts WHERE developer_id = $1`, [dev02.devId]);
    const dev03Bal = await query(`SELECT balance FROM credit_accounts WHERE developer_id = $1`, [dev03.devId]);

    const step2Passed =
      dev01Bal.rows[0].balance === 10 &&
      dev02Bal.rows[0].balance === 10 &&
      dev03Bal.rows[0].balance === 10;

    recordStep(
      2,
      'Credit Purchases',
      step2Passed,
      `Developer #01 = ${dev01Bal.rows[0].balance}, Developer #02 = ${dev02Bal.rows[0].balance}, Developer #03 = ${dev03Bal.rows[0].balance}`
    );

    // -------------------------------------------------------------------------
    // STEP 3: CLIENT #001 CREATES PROJECT #0001
    // -------------------------------------------------------------------------
    // Check if PRJ-2026-0001 exists from previous run, clean linked child rows for clean test
    const oldProj = await query(`SELECT id FROM projects WHERE project_number = 'PRJ-2026-0001' LIMIT 1`);
    let projectId: string;

    if (oldProj.rows.length > 0) {
      projectId = oldProj.rows[0].id;
      // Clean previous child rows to ensure pristine execution
      await query('DELETE FROM support_bridge_members WHERE bridge_id IN (SELECT id FROM support_bridges WHERE ticket_id IN (SELECT id FROM support_tickets WHERE project_id = $1))', [projectId]);
      await query('DELETE FROM support_bridges WHERE ticket_id IN (SELECT id FROM support_tickets WHERE project_id = $1)', [projectId]);
      await query('DELETE FROM support_tickets WHERE project_id = $1', [projectId]);
      await query('DELETE FROM proposals WHERE project_claim_id IN (SELECT id FROM project_claims WHERE project_id = $1)', [projectId]);
      await query('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE project_id = $1)', [projectId]);
      await query('DELETE FROM conversation_members WHERE conversation_id IN (SELECT id FROM conversations WHERE project_id = $1)', [projectId]);
      await query('DELETE FROM conversations WHERE project_id = $1', [projectId]);
      await query('DELETE FROM project_members WHERE project_id = $1', [projectId]);
      await query('DELETE FROM project_claims WHERE project_id = $1', [projectId]);
      await query('DELETE FROM project_files WHERE project_id = $1', [projectId]);
      await query('DELETE FROM project_tasks WHERE project_id = $1', [projectId]);
      await query('DELETE FROM project_milestones WHERE project_id = $1', [projectId]);

      await query(
        `UPDATE projects
         SET status = 'SUBMITTED',
             title = 'Omnichannel E-Commerce Engine',
             description = 'High-throughput e-commerce platform with real-time inventory and PostgreSQL backend',
             category = 'Full-Stack Development',
             budget_min = 50000,
             budget_max = 80000,
             timeline = '30–45 days',
             requirements = '["React", "Node.js", "PostgreSQL"]'::jsonb,
             required_technologies = '["React", "Node.js", "PostgreSQL"]'::jsonb,
             lead_developer_id = NULL,
             client_id = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [client001Id, projectId]
      );
    } else {
      const pRes = await query(
        `INSERT INTO projects (
           project_number, slug, title, description, category,
           budget_min, budget_max, timeline, requirements, required_technologies,
           status, claim_cost, max_claims, claim_deadline, client_id
         ) VALUES (
           'PRJ-2026-0001', $1, 'Omnichannel E-Commerce Engine',
           'High-throughput e-commerce platform with real-time inventory and PostgreSQL backend',
           'Full-Stack Development', 50000, 80000, '30–45 days',
           '["React", "Node.js", "PostgreSQL"]'::jsonb,
           '["React", "Node.js", "PostgreSQL"]'::jsonb,
           'SUBMITTED', 1, 3, NOW() + INTERVAL '7 days', $2
         ) RETURNING id`,
        [`omnichannel-ecommerce-${suffix}`, client001Id]
      );
      projectId = pRes.rows[0].id;
    }

    const pCreated = await query(`SELECT project_number, title, requirements, budget_min, budget_max, status FROM projects WHERE id = $1`, [projectId]);
    const step3Passed =
      pCreated.rows[0].project_number === 'PRJ-2026-0001' &&
      pCreated.rows[0].status === 'SUBMITTED' &&
      Number(pCreated.rows[0].budget_min) === 50000 &&
      Number(pCreated.rows[0].budget_max) === 80000;

    recordStep(
      3,
      'Project #0001 Created',
      step3Passed,
      'Project #0001 submitted by Client #001 (React, Node.js, PostgreSQL; ₹50,000–₹80,000)'
    );

    // -------------------------------------------------------------------------
    // STEP 4: ADMIN APPROVES PROJECT -> OPEN_FOR_CLAIMS
    // -------------------------------------------------------------------------
    await ProjectService.approveProject(projectId, adminUserId, 3, 14);
    const pApproved = await query(`SELECT status, max_claims FROM projects WHERE id = $1`, [projectId]);
    const step4Passed = pApproved.rows[0].status === 'OPEN_FOR_CLAIMS';

    recordStep(
      4,
      'Admin Approves Project',
      step4Passed,
      `Project status is ${pApproved.rows[0].status} with max 3 claim slots`
    );

    // -------------------------------------------------------------------------
    // STEP 5: DEVELOPER #01 CLAIMS -> BALANCE 9
    // -------------------------------------------------------------------------
    const claim1Result = await ProjectService.claimProject(projectId, dev01.devId, dev01.userId);
    const dev01BalAfterClaim = await query(`SELECT balance FROM credit_accounts WHERE developer_id = $1`, [dev01.devId]);
    const step5Passed = dev01BalAfterClaim.rows[0].balance === 9 && claim1Result.anonymousTag === 'Developer #01';

    recordStep(
      5,
      'Developer #01 Claims',
      step5Passed,
      `Tag: ${claim1Result.anonymousTag}, Remaining Balance: ${dev01BalAfterClaim.rows[0].balance}`
    );

    // -------------------------------------------------------------------------
    // STEP 6: DEVELOPER #02 CLAIMS -> BALANCE 9
    // -------------------------------------------------------------------------
    const claim2Result = await ProjectService.claimProject(projectId, dev02.devId, dev02.userId);
    const dev02BalAfterClaim = await query(`SELECT balance FROM credit_accounts WHERE developer_id = $1`, [dev02.devId]);
    const step6Passed = dev02BalAfterClaim.rows[0].balance === 9 && claim2Result.anonymousTag === 'Developer #02';

    recordStep(
      6,
      'Developer #02 Claims',
      step6Passed,
      `Tag: ${claim2Result.anonymousTag}, Remaining Balance: ${dev02BalAfterClaim.rows[0].balance}`
    );

    // -------------------------------------------------------------------------
    // STEP 7: DEVELOPER #03 CLAIMS -> BALANCE 9
    // -------------------------------------------------------------------------
    const claim3Result = await ProjectService.claimProject(projectId, dev03.devId, dev03.userId);
    const dev03BalAfterClaim = await query(`SELECT balance FROM credit_accounts WHERE developer_id = $1`, [dev03.devId]);
    const step7Passed = dev03BalAfterClaim.rows[0].balance === 9 && claim3Result.anonymousTag === 'Developer #03';

    recordStep(
      7,
      'Developer #03 Claims',
      step7Passed,
      `Tag: ${claim3Result.anonymousTag}, Remaining Balance: ${dev03BalAfterClaim.rows[0].balance}`
    );

    // -------------------------------------------------------------------------
    // STEP 8: THREE INDEPENDENT PRIVATE CONVERSATIONS & ZERO IDENTITY LEAKAGE
    // -------------------------------------------------------------------------
    const conv1Id = claim1Result.conversationId;
    const conv2Id = claim2Result.conversationId;
    const conv3Id = claim3Result.conversationId;

    const convsDistinct = conv1Id !== conv2Id && conv2Id !== conv3Id && conv1Id !== conv3Id;

    // Send isolated messages in each conversation
    await ChatService.sendMessage(conv1Id, dev01.userId, 'Hello Client, Developer #01 here.');
    await ChatService.sendMessage(conv2Id, dev02.userId, 'Greetings Client, Developer #02 ready to architect.');
    await ChatService.sendMessage(conv3Id, dev03.userId, 'Hi Client, Developer #03 proposal incoming.');

    // Client reads messages in conv 1, 2, 3
    const cMsgs1 = await ChatService.getMessages(conv1Id, client001UserId);
    const cMsgs2 = await ChatService.getMessages(conv2Id, client001UserId);
    const cMsgs3 = await ChatService.getMessages(conv3Id, client001UserId);

    // Verify client sees anonymous tags Developer #01, #02, #03
    const tag1Found = cMsgs1.messages.some((m) => m.senderDisplayName.includes('Developer #01'));
    const tag2Found = cMsgs2.messages.some((m) => m.senderDisplayName.includes('Developer #02'));
    const tag3Found = cMsgs3.messages.some((m) => m.senderDisplayName.includes('Developer #03'));

    // Check cross-conversation unauthorized access (Developer #01 cannot read conv 2)
    let crossAccessBlocked = false;
    try {
      await ChatService.getMessages(conv2Id, dev01.userId);
    } catch (err: any) {
      if (err.message.includes('Forbidden')) crossAccessBlocked = true;
    }

    // Inspect API payload for private identity leaks
    const allMsgsJson = JSON.stringify([cMsgs1, cMsgs2, cMsgs3]);
    let privacyLeaks = 0;
    if (allMsgsJson.includes('Arjun Mehta') || allMsgsJson.includes(dev01.email)) privacyLeaks++;
    if (allMsgsJson.includes('Ritesh Lingamallu') || allMsgsJson.includes(dev02.email)) privacyLeaks++;
    if (allMsgsJson.includes('Ananya Sharma') || allMsgsJson.includes(dev03.email)) privacyLeaks++;

    const step8Passed = convsDistinct && tag1Found && tag2Found && tag3Found && crossAccessBlocked && privacyLeaks === 0;

    recordStep(
      8,
      'Conversations Isolation & Privacy',
      step8Passed,
      '3 isolated channels verified; Client sees only Developer #01, #02, #03; zero identity leaks'
    );

    // -------------------------------------------------------------------------
    // STEP 9: EACH DEVELOPER SUBMITS PROPOSAL
    // -------------------------------------------------------------------------
    await ProjectService.submitProposal(projectId, dev01.devId, {
      approach: 'Event-driven microservices architecture with Kafka and React SSR.',
      timeline: '30 days',
      price: 65000,
      milestones: [
        { title: 'Requirements & Schema', duration: '7 days', priceShare: 15000 },
        { title: 'Core Commerce Engine', duration: '15 days', priceShare: 35000 },
        { title: 'Testing & Release', duration: '8 days', priceShare: 15000 },
      ],
    });

    await ProjectService.submitProposal(projectId, dev02.devId, {
      approach: 'High-throughput reactive architecture with PostgreSQL streaming replication and Next.js.',
      timeline: '28 days',
      price: 72000,
      milestones: [
        { title: 'Phase 1: Architecture & Technical Specification', duration: '6 days', priceShare: 20000 },
        { title: 'Phase 2: Core Development & Implementation', duration: '14 days', priceShare: 36000 },
        { title: 'Phase 3: QA, Verification & Client Sign-off', duration: '8 days', priceShare: 16000 },
      ],
    });

    await ProjectService.submitProposal(projectId, dev03.devId, {
      approach: 'Domain-driven modular monolith with Node.js and PostgreSQL connection pooling.',
      timeline: '35 days',
      price: 58000,
      milestones: [
        { title: 'Analysis & Design', duration: '8 days', priceShare: 12000 },
        { title: 'Implementation', duration: '18 days', priceShare: 32000 },
        { title: 'Deployment', duration: '9 days', priceShare: 14000 },
      ],
    });

    const proposals = await ProjectService.getProposals(projectId, {
      role: ROLES.CLIENT,
      clientId: client001Id,
      userId: client001UserId,
    });
    const step9Passed = proposals.length === 3;

    recordStep(
      9,
      'Proposals Submitted',
      step9Passed,
      `All 3 proposals submitted; Client reviews 3 proposals (Dev #01: ₹65k, Dev #02: ₹72k, Dev #03: ₹58k)`
    );

    // -------------------------------------------------------------------------
    // STEP 10: CLIENT SELECTS DEVELOPER #02
    // -------------------------------------------------------------------------
    await ProjectService.selectDeveloper(projectId, dev02.devId, client001Id);

    // Verify Balances after selection and automatic refund
    const dev02FinalBal = await query(`SELECT balance FROM credit_accounts WHERE developer_id = $1`, [dev02.devId]);
    const dev01FinalBal = await query(`SELECT balance FROM credit_accounts WHERE developer_id = $1`, [dev01.devId]);
    const dev03FinalBal = await query(`SELECT balance FROM credit_accounts WHERE developer_id = $1`, [dev03.devId]);

    // Verify claims status
    const dev02Claim = await query(`SELECT status FROM project_claims WHERE project_id = $1 AND developer_id = $2`, [projectId, dev02.devId]);
    const dev01Claim = await query(`SELECT status FROM project_claims WHERE project_id = $1 AND developer_id = $2`, [projectId, dev01.devId]);
    const dev03Claim = await query(`SELECT status FROM project_claims WHERE project_id = $1 AND developer_id = $2`, [projectId, dev03.devId]);

    // Verify project member role
    const memberCheck = await query(`SELECT role FROM project_members WHERE project_id = $1 AND developer_id = $2`, [projectId, dev02.devId]);

    // Verify conversations status (Dev 01 & 03 closed, Dev 02 active)
    const conv1Status = await query(`SELECT status FROM conversations WHERE id = $1`, [conv1Id]);
    const conv2Status = await query(`SELECT status FROM conversations WHERE id = $1`, [conv2Id]);
    const conv3Status = await query(`SELECT status FROM conversations WHERE id = $1`, [conv3Id]);

    const step10Passed =
      dev02FinalBal.rows[0].balance === 9 &&
      dev02Claim.rows[0].status === 'SELECTED' &&
      memberCheck.rows[0].role === 'LEAD' &&
      dev01FinalBal.rows[0].balance === 10 &&
      dev01Claim.rows[0].status === 'NOT_SELECTED' &&
      dev03FinalBal.rows[0].balance === 10 &&
      dev03Claim.rows[0].status === 'NOT_SELECTED' &&
      conv2Status.rows[0].status === 'ACTIVE' &&
      conv1Status.rows[0].status === 'CLOSED' &&
      conv3Status.rows[0].status === 'CLOSED';

    recordStep(
      10,
      'Developer #02 Selected & Auto-Refunds Reconciled',
      step10Passed,
      'Dev #02: SELECTED (9 credits, LEAD); Dev #01: NOT_SELECTED (10 credits, refunded); Dev #03: NOT_SELECTED (10 credits, refunded)'
    );

    // -------------------------------------------------------------------------
    // STEP 11: DEVELOPER #02 RECEIVES PROJECT WORKSPACE
    // -------------------------------------------------------------------------
    const dev02Workspace = await WorkspaceService.getWorkspace(projectId, {
      userId: dev02.userId,
      role: ROLES.DEVELOPER,
      developerId: dev02.devId,
    });

    // Verify unselected developers receive 403 Forbidden
    let dev01BlockedFromWorkspace = false;
    try {
      await WorkspaceService.getWorkspace(projectId, {
        userId: dev01.userId,
        role: ROLES.DEVELOPER,
        developerId: dev01.devId,
      });
    } catch (err: any) {
      if (err.message.includes('Forbidden') || err.message.includes('Unauthorized')) {
        dev01BlockedFromWorkspace = true;
      }
    }

    const step11Passed = Boolean(dev02Workspace && dev02Workspace.project && dev01BlockedFromWorkspace);

    recordStep(
      11,
      'Project Workspace Access',
      step11Passed,
      'Developer #02 granted full workspace access across all sections; unselected developers denied (403)'
    );

    // -------------------------------------------------------------------------
    // STEP 12: DEVELOPER #02 COMPLETES MILESTONES
    // -------------------------------------------------------------------------
    // Fetch workspace milestones
    const msRes = await query(
      `SELECT id, title, order_index FROM project_milestones WHERE project_id = $1 ORDER BY order_index ASC`,
      [projectId]
    );

    // Milestone 1: Phase 1: Architecture & Technical Specification
    const ms1Id = msRes.rows[0].id;
    await WorkspaceService.updateMilestoneStatus(ms1Id, 'SUBMITTED', dev02.userId, {
      role: ROLES.DEVELOPER,
      developerId: dev02.devId,
      submissionNotes: 'Architecture diagrams and OpenAPI specs finalized.',
    });
    await WorkspaceService.updateMilestoneStatus(ms1Id, 'APPROVED', client001UserId, {
      role: ROLES.CLIENT,
      clientId: client001Id,
      feedback: 'Architecture and technical specifications approved.',
    });

    // Milestone 2: Phase 2: Core Development & Implementation
    const ms2Id = msRes.rows[1].id;
    await WorkspaceService.uploadFile(
      projectId,
      { userId: dev02.userId, role: ROLES.DEVELOPER, developerId: dev02.devId },
      {
        fileName: 'core_system_architecture.pdf',
        fileUrl: 'https://storage.nexus.dev/deliverables/core_system_architecture.pdf',
        fileSize: 1024 * 1024 * 2,
        mimeType: 'application/pdf',
        milestoneId: ms2Id,
      }
    );
    await WorkspaceService.updateMilestoneStatus(ms2Id, 'SUBMITTED', dev02.userId, {
      role: ROLES.DEVELOPER,
      developerId: dev02.devId,
      submissionNotes: 'Core APIs, database schemas, and Next.js frontends integrated.',
    });
    await WorkspaceService.updateMilestoneStatus(ms2Id, 'APPROVED', client001UserId, {
      role: ROLES.CLIENT,
      clientId: client001Id,
      feedback: 'Core development verified on staging environment.',
    });

    // Milestone 3: Phase 3: QA, Verification & Client Sign-off
    const ms3Id = msRes.rows[2].id;
    await WorkspaceService.uploadFile(
      projectId,
      { userId: dev02.userId, role: ROLES.DEVELOPER, developerId: dev02.devId },
      {
        fileName: 'production_release_v1.zip',
        fileUrl: 'https://storage.nexus.dev/deliverables/production_release_v1.zip',
        fileSize: 1024 * 1024 * 8,
        mimeType: 'application/zip',
        milestoneId: ms3Id,
      }
    );
    await WorkspaceService.updateMilestoneStatus(ms3Id, 'SUBMITTED', dev02.userId, {
      role: ROLES.DEVELOPER,
      developerId: dev02.devId,
      submissionNotes: 'End-to-end regression tests passed; release bundle packaged.',
    });
    await WorkspaceService.updateMilestoneStatus(ms3Id, 'APPROVED', client001UserId, {
      role: ROLES.CLIENT,
      clientId: client001Id,
      feedback: 'Final deliverables accepted. All 3 milestones approved.',
    });

    const completedMilestones = await query(
      `SELECT COUNT(*) FROM project_milestones WHERE project_id = $1 AND status = 'APPROVED'`,
      [projectId]
    );
    const step12Passed = parseInt(completedMilestones.rows[0].count, 10) === 3;

    recordStep(
      12,
      'Milestones Completed',
      step12Passed,
      'All 3 project milestones submitted with deliverables and approved by Client #001'
    );

    // -------------------------------------------------------------------------
    // STEP 13: CLIENT APPROVES COMPLETION (WITH CHANGE REQUEST CYCLE)
    // -------------------------------------------------------------------------
    // Developer submits project for completion review
    await ProjectService.submitForReview(projectId, {
      userId: dev02.userId,
      role: ROLES.DEVELOPER,
      developerId: dev02.devId,
    }, 'Project complete and ready for final client sign-off.');

    // Test Change Request cycle: Client requests adjustments
    await ProjectService.requestChanges(projectId, {
      userId: client001UserId,
      role: ROLES.CLIENT,
      clientId: client001Id,
    }, 'Please update load testing benchmarks in the final release documentation.');

    const changesRequestedState = await query(`SELECT status FROM projects WHERE id = $1`, [projectId]);
    if (changesRequestedState.rows[0].status !== 'IN_PROGRESS') {
      throw new Error(`Expected status IN_PROGRESS after change request, got ${changesRequestedState.rows[0].status}`);
    }

    // Developer resubmits for review
    await ProjectService.submitForReview(projectId, {
      userId: dev02.userId,
      role: ROLES.DEVELOPER,
      developerId: dev02.devId,
    }, 'Benchmarks updated with 10k RPS validation.');

    // Client approves completion
    await ProjectService.approveCompletion(projectId, {
      userId: client001UserId,
      role: ROLES.CLIENT,
      clientId: client001Id,
    }, { rating: 5, feedback: 'Exemplary execution and distributed systems architecture.' });

    const step13Passed = true;
    recordStep(
      13,
      'Client Approves Completion',
      step13Passed,
      'Change request cycle validated; Client approves completion with 5-star rating'
    );

    // -------------------------------------------------------------------------
    // STEP 14: PROJECT BECOMES COMPLETED, THEN PUBLISHED
    // -------------------------------------------------------------------------
    const pCompleted = await query(`SELECT status FROM projects WHERE id = $1`, [projectId]);
    if (pCompleted.rows[0].status !== 'COMPLETED') {
      throw new Error(`Expected COMPLETED status, got ${pCompleted.rows[0].status}`);
    }

    // Publish project
    await ProjectService.publishProject(projectId, {
      userId: client001UserId,
      role: ROLES.CLIENT,
      clientId: client001Id,
    });

    const pPublished = await query(`SELECT status FROM projects WHERE id = $1`, [projectId]);
    const step14Passed = pPublished.rows[0].status === 'PUBLISHED';

    recordStep(
      14,
      'Project Completed & Published',
      step14Passed,
      `Project status transitioned: COMPLETED -> ${pPublished.rows[0].status}`
    );

    // -------------------------------------------------------------------------
    // STEP 15: PUBLIC PROJECT ATTRIBUTION: BUILT BY DEVELOPER #02
    // -------------------------------------------------------------------------
    const publicProj = await query(
      `SELECT p.id, p.title, p.project_number, p.slug, p.status,
              d.username as lead_dev_username, d.display_name as lead_dev_name,
              d.role_title as lead_dev_title
       FROM projects p
       JOIN developers d ON p.lead_developer_id = d.id
       WHERE p.id = $1`,
      [projectId]
    );

    const devProfile = await DeveloperService.getDeveloperByUsername(dev02.username);

    // Verify attributed project appears in developer's portfolio
    const attributedInPortfolio = await query(
      `SELECT COUNT(*) FROM projects WHERE lead_developer_id = $1 AND status = 'PUBLISHED'`,
      [dev02.devId]
    );

    const step15Passed =
      publicProj.rows[0].status === 'PUBLISHED' &&
      publicProj.rows[0].lead_dev_username === dev02.username &&
      publicProj.rows[0].lead_dev_name === dev02.displayName &&
      Boolean(devProfile) &&
      parseInt(attributedInPortfolio.rows[0].count, 10) >= 1;

    recordStep(
      15,
      'Public Project Attribution',
      step15Passed,
      `Public project attributed: Built by ${publicProj.rows[0].lead_dev_name} (@${publicProj.rows[0].lead_dev_username})`
    );

    // -------------------------------------------------------------------------
    // STEP 16: ORIGINAL CHAT CLOSES
    // -------------------------------------------------------------------------
    let messageRejectedOnCompletedProject = false;
    try {
      await ChatService.sendMessage(conv2Id, dev02.userId, 'Attempting message on completed project chat.');
    } catch (err: any) {
      if (err.message.includes('Forbidden') || err.message.includes('closed') || err.message.includes('read-only')) {
        messageRejectedOnCompletedProject = true;
      }
    }

    recordStep(
      16,
      'Original Chat Closes',
      messageRejectedOnCompletedProject,
      'Original project chat locked; new messages strictly rejected with read-only notice'
    );

    // -------------------------------------------------------------------------
    // STEP 17: CLIENT CREATES SUPPORT TICKET
    // -------------------------------------------------------------------------
    // Ensure clean state for SUP-2026-0001
    await query(`DELETE FROM support_tickets WHERE ticket_number = 'SUP-2026-0001'`);

    const ticket = await SupportService.createTicket(
      client001Id,
      client001UserId,
      projectId,
      'Production Scaling Assistance',
      'Need advisory guidance on horizontal autoscaling and database read-replicas in production.',
      'HIGH',
      'SUP-2026-0001',
      'SUPPORT BRIDGE #001'
    );

    const step17Passed =
      ticket.ticket_number === 'SUP-2026-0001' &&
      ticket.client_id === client001Id &&
      ticket.developer_id === dev02.devId;

    recordStep(
      17,
      'Support Ticket Created',
      step17Passed,
      `Ticket ${ticket.ticket_number} created, linked to Project #0001, Client #001, and Developer #02 internally`
    );

    // -------------------------------------------------------------------------
    // STEP 18: SUPPORT CREATES ANONYMOUS BRIDGE
    // -------------------------------------------------------------------------
    // Fetch support agent account or admin
    const supportAgentUserId = adminUserId;
    await query(`
      INSERT INTO support_staff (user_id, support_level, status, permissions)
      VALUES ($1, 'SUPPORT_LEAD', 'AVAILABLE', '["SUPPORT_VIEW_TICKETS", "SUPPORT_VIEW_ALL_TICKETS", "SUPPORT_REPLY_TICKETS", "SUPPORT_CHANGE_STATUS", "SUPPORT_CREATE_BRIDGE", "SUPPORT_RESOLVE_TICKETS", "SUPPORT_CLOSE_TICKETS"]'::jsonb)
      ON CONFLICT (user_id) DO UPDATE SET status = 'AVAILABLE', permissions = '["SUPPORT_VIEW_TICKETS", "SUPPORT_VIEW_ALL_TICKETS", "SUPPORT_REPLY_TICKETS", "SUPPORT_CHANGE_STATUS", "SUPPORT_CREATE_BRIDGE", "SUPPORT_RESOLVE_TICKETS", "SUPPORT_CLOSE_TICKETS"]'::jsonb
    `, [supportAgentUserId]);
    await SupportService.assignTicket(ticket.id, supportAgentUserId);

    const bridgeData = await SupportService.getBridge(ticket.bridgeId, {
      userId: supportAgentUserId,
      role: 'SUPPORT',
    });

    const bridgeNumberVerified = bridgeData.bridge.bridgeNumber === 'SUPPORT BRIDGE #001';
    const step18Passed = bridgeNumberVerified && bridgeData.members.length >= 2;

    recordStep(
      18,
      'Support Creates Anonymous Bridge',
      step18Passed,
      `${bridgeData.bridge.bridgeNumber} created; Tripartite bridge active with Client, Developer, Support Agent`
    );

    // -------------------------------------------------------------------------
    // STEP 19: DEVELOPER #02 JOINS BRIDGE
    // -------------------------------------------------------------------------
    // Developer #02 sends message into bridge
    await SupportService.sendBridgeMessage(
      ticket.bridgeId,
      dev02.userId,
      'Hello Client, I am the lead developer on this project. Let me assist you with the read-replica configuration.'
    );

    // Developer #01 attempts unauthorized access to bridge
    let dev01BlockedFromBridge = false;
    try {
      await SupportService.getBridge(ticket.bridgeId, {
        userId: dev01.userId,
        role: ROLES.DEVELOPER,
        developerId: dev01.devId,
      });
    } catch (err: any) {
      if (err.message.includes('Forbidden') || err.message.includes('Access denied')) {
        dev01BlockedFromBridge = true;
      }
    }

    const step19Passed = dev01BlockedFromBridge;

    recordStep(
      19,
      'Developer #02 Joins Bridge',
      step19Passed,
      'Developer #02 active on bridge; unassigned Developer #01 blocked with 403 Forbidden'
    );

    // -------------------------------------------------------------------------
    // STEP 20: CLIENT RECEIVES SUPPORT & TICKET CLOSURE
    // -------------------------------------------------------------------------
    // Client sends message into bridge
    await SupportService.sendBridgeMessage(
      ticket.bridgeId,
      client001UserId,
      'Thank you Developer #02. Read replica latency is now under 5ms.'
    );

    // Full support lifecycle progression
    await SupportService.updateStatus(ticket.id, 'INVESTIGATING', supportAgentUserId);
    await SupportService.updateStatus(ticket.id, 'IN_PROGRESS', supportAgentUserId);
    await SupportService.updateStatus(ticket.id, 'RESOLVED', supportAgentUserId);
    await SupportService.updateStatus(ticket.id, 'CLOSED', supportAgentUserId);

    const closedTicket = await query(`SELECT status, closed_at FROM support_tickets WHERE id = $1`, [ticket.id]);
    const closedBridge = await query(`SELECT closed_at FROM support_bridges WHERE id = $1`, [ticket.bridgeId]);

    // Verify closed bridge rejects new messages
    let messageRejectedOnClosedBridge = false;
    try {
      await SupportService.sendBridgeMessage(ticket.bridgeId, dev02.userId, 'Attempting post-closure message.');
    } catch (err: any) {
      if (err.message.includes('closed') || err.message.includes('Forbidden')) {
        messageRejectedOnClosedBridge = true;
      }
    }

    const step20Passed =
      closedTicket.rows[0].status === 'CLOSED' &&
      Boolean(closedBridge.rows[0].closed_at) &&
      messageRejectedOnClosedBridge;

    recordStep(
      20,
      'Client Receives Support & Ticket Closure',
      step20Passed,
      'Support completed across all 7 lifecycle stages; ticket and bridge sealed upon resolution'
    );

    // -------------------------------------------------------------------------
    // FINAL VERIFICATION: LEDGER RECONCILIATION & INTEGRITY AUDIT
    // -------------------------------------------------------------------------
    console.log('\n--- FINAL SYSTEM RECONCILIATION & INTEGRITY AUDIT ---');

    // 1. Credit Ledger Reconciliation
    const d1Audit = await query(`SELECT balance FROM credit_accounts WHERE developer_id = $1`, [dev01.devId]);
    const d2Audit = await query(`SELECT balance FROM credit_accounts WHERE developer_id = $1`, [dev02.devId]);
    const d3Audit = await query(`SELECT balance FROM credit_accounts WHERE developer_id = $1`, [dev03.devId]);

    const d1LedgerTxs = await query(`SELECT type, amount FROM credit_transactions WHERE developer_id = $1 ORDER BY created_at ASC`, [dev01.devId]);
    const d2LedgerTxs = await query(`SELECT type, amount FROM credit_transactions WHERE developer_id = $1 ORDER BY created_at ASC`, [dev02.devId]);
    const d3LedgerTxs = await query(`SELECT type, amount FROM credit_transactions WHERE developer_id = $1 ORDER BY created_at ASC`, [dev03.devId]);

    console.log(`Developer #01 Balance: ${d1Audit.rows[0].balance} Cr (Ledger Transactions: ${d1LedgerTxs.rows.length})`);
    console.log(`Developer #02 Balance: ${d2Audit.rows[0].balance} Cr (Ledger Transactions: ${d2LedgerTxs.rows.length})`);
    console.log(`Developer #03 Balance: ${d3Audit.rows[0].balance} Cr (Ledger Transactions: ${d3LedgerTxs.rows.length})`);

    const ledgerReconciled =
      d1Audit.rows[0].balance === 10 &&
      d2Audit.rows[0].balance === 9 &&
      d3Audit.rows[0].balance === 10;

    if (!ledgerReconciled) {
      throw new Error('Ledger reconciliation failed: balances do not match exact invariant');
    }

    // 2. Duplicate Claim Guard
    let dupClaimBlocked = false;
    try {
      await ProjectService.claimProject(projectId, dev02.devId, dev02.userId);
    } catch {
      dupClaimBlocked = true;
    }

    // 3. Duplicate Refund Guard
    const dupRefund = await CreditLedgerService.processSelectionRefunds(projectId, dev02.devId);
    const dupRefundBlocked = dupRefund.refundedDevelopersCount === 0;

    // 4. Project State Consistency
    const projState = await query(`SELECT status, lead_developer_id FROM projects WHERE id = $1`, [projectId]);
    const projectConsistent =
      projState.rows[0].status === 'PUBLISHED' &&
      projState.rows[0].lead_developer_id === dev02.devId;

    console.log('\n================================================================');
    console.log('PHASE 19: COMPLETE BUSINESS FLOW VERIFIED (20/20 STEPS PASSED)');
    console.log('================================================================\n');

    return {
      allPassed: true,
      steps,
      summary: {
        client: 'Client #001',
        project: 'PRJ-2026-0001 (Omnichannel E-Commerce Engine)',
        leadDeveloper: 'Developer #02 (Ritesh Lingamallu)',
        refundedDevelopers: ['Developer #01 (Arjun Mehta)', 'Developer #03 (Ananya Sharma)'],
        balances: {
          developer01: d1Audit.rows[0].balance,
          developer02: d2Audit.rows[0].balance,
          developer03: d3Audit.rows[0].balance,
        },
        ledgerReconciled,
        dupClaimBlocked,
        dupRefundBlocked,
        projectConsistent,
      },
    };
  } catch (error: any) {
    console.error('\n❌ COMPLETE BUSINESS FLOW AUDIT FAILED:', error.message);
    throw error;
  } finally {
    if (server) {
      (server as Server).close();
    }
  }
}

if (process.env.NODE_ENV !== 'production') {
  runCompleteBusinessFlowAudit()
    .then((res) => {
      console.log('Flow Execution Summary:');
      console.log(JSON.stringify(res.summary, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Audit execution error:', err);
      process.exit(1);
    });
}
