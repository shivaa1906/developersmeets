import app from '../server.js';
import { query } from '../database/db.js';
import { env } from '../config/environment.js';
import { DeveloperService } from '../services/developerService.js';
import jwt from 'jsonwebtoken';
import { Server } from 'http';
import bcrypt from 'bcryptjs';

export async function runProjectClaimAudit(): Promise<{
  eligibility: boolean;
  claim: boolean;
  duplicateClaim: boolean;
  insufficientCredits: boolean;
  maximumClaims: boolean;
  raceCondition: boolean;
  deadline: boolean;
}> {
  console.log('================================================================');
  console.log('PHASE 6: PROJECT CLAIM SYSTEM AUDIT & VERIFICATION');
  console.log('================================================================\n');

  let server: Server | null = null;
  let baseUrl = '';

  const results = {
    eligibility: false,
    claim: false,
    duplicateClaim: false,
    insufficientCredits: false,
    maximumClaims: false,
    raceCondition: false,
    deadline: false,
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

    const suffix = `claim_${Date.now()}`;
    const pwdHash = await bcrypt.hash('AuditedPassword2026!', 8);

    // -------------------------------------------------------------------------
    // SETUP: CLIENT #001 AND PROJECT #0001
    // -------------------------------------------------------------------------
    console.log('[Setup] Setting up Client #001 and Project #0001 with PRD parameters...');

    let clientRes = await query("SELECT id, user_id FROM clients WHERE client_number = 'Client #001' LIMIT 1");
    if (clientRes.rows.length === 0) {
      const uRes = await query(
        "INSERT INTO users (email, password_hash, role, status) VALUES ('client001@apexretail.io', $1, 'CLIENT', 'ACTIVE') RETURNING id",
        [pwdHash]
      );
      clientRes = await query(
        "INSERT INTO clients (user_id, client_number, company_name, private_name, phone) VALUES ($1, 'Client #001', 'Apex Retail Labs', 'Ravi Kumar', '+91 9988776655') RETURNING id, user_id",
        [uRes.rows[0].id]
      );
    }
    const clientId = clientRes.rows[0].id;
    const clientUserId = clientRes.rows[0].user_id;

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
           'PRJ-2026-0001', 'autonomous-ai-ecommerce-engine-0001', 'Autonomous AI E-Commerce Engine',
           'High-throughput distributed commerce system with real-time vector search and multi-tenant billing.',
           'Full-Stack Development', 50000, 80000, '30–45 days',
           '["React", "Node.js", "PostgreSQL"]'::jsonb,
           '["React", "Node.js", "PostgreSQL"]'::jsonb,
           'OPEN_FOR_CLAIMS', 1, 3, NOW() + INTERVAL '7 days', $1
         ) RETURNING id`,
        [clientId]
      );
      projectId = pRes.rows[0].id;
    } else {
      projectId = projectRes.rows[0].id;
      // Reset Project #0001 for a clean test: requirements, max_claims = 3, claim_cost = 1, status = OPEN_FOR_CLAIMS
      await query('DELETE FROM project_milestones WHERE project_id = $1', [projectId]);
      await query('DELETE FROM project_claims WHERE project_id = $1', [projectId]);
      await query('DELETE FROM conversations WHERE project_id = $1', [projectId]);
      await query(
        `UPDATE projects
         SET status = 'OPEN_FOR_CLAIMS',
             claim_cost = 1,
             max_claims = 3,
             claim_deadline = NOW() + INTERVAL '7 days',
             requirements = '["React", "Node.js", "PostgreSQL"]'::jsonb,
             required_technologies = '["React", "Node.js", "PostgreSQL"]'::jsonb
         WHERE id = $1`,
        [projectId]
      );
    }
    console.log(`  ✔ Project #0001 initialized (ID: ${projectId}, Max claims: 3, Cost: 1 Credit)`);

    // -------------------------------------------------------------------------
    // SETUP: DEVELOPER #01, #02, #03, #04
    // -------------------------------------------------------------------------
    console.log('\n[Setup] Provisioning test developers with skill matrices & initial credits...');

    // Helper to create developer with skills & credits
    const createTestDeveloper = async (name: string, username: string, skills: string[], credits: number) => {
      const uRes = await query(
        'INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, \'DEVELOPER\', \'ACTIVE\') RETURNING id',
        [`${username}@nexus.dev`, pwdHash]
      );
      const userId = uRes.rows[0].id;

      const dRes = await query(
        `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status, verified_at)
         VALUES ($1, $2, $3, 'Senior Software Engineer', 6, 'VERIFIED', NOW())
         RETURNING id`,
        [userId, username, name]
      );
      const devId = dRes.rows[0].id;

      await query(
        'INSERT INTO credit_accounts (developer_id, balance) VALUES ($1, $2) ON CONFLICT (developer_id) DO UPDATE SET balance = $2',
        [devId, credits]
      );

      // Assign skills
      await DeveloperService.updateProfile(devId, { skills });

      const token = jwt.sign(
        { userId, email: `${username}@nexus.dev`, role: 'DEVELOPER', developerId: devId },
        env.JWT_SECRET,
        { expiresIn: '2h' }
      );

      return { userId, devId, name, username, token, skills, credits };
    }

    // Developer #01: has React, Node.js, PostgreSQL (all 3)
    const dev1 = await createTestDeveloper(
      'Developer Alpha',
      `dev01_${suffix}`,
      ['React', 'Node.js', 'PostgreSQL'],
      5
    );

    // Developer #02: has React, Node.js (lacks PostgreSQL)
    const dev2 = await createTestDeveloper(
      'Developer Beta',
      `dev02_${suffix}`,
      ['React', 'Node.js'],
      5
    );

    // Developer #03: has React, Node.js, PostgreSQL (all 3)
    const dev3 = await createTestDeveloper(
      'Developer Gamma',
      `dev03_${suffix}`,
      ['React', 'Node.js', 'PostgreSQL'],
      5
    );

    // Developer #04: has React, Node.js, PostgreSQL (all 3)
    const dev4 = await createTestDeveloper(
      'Developer Delta',
      `dev04_${suffix}`,
      ['React', 'Node.js', 'PostgreSQL'],
      5
    );

    console.log(`  ✔ Developer #01: [${dev1.skills.join(', ')}] | Credits: ${dev1.credits}`);
    console.log(`  ✔ Developer #02: [${dev2.skills.join(', ')}] (Lacks PostgreSQL) | Credits: ${dev2.credits}`);
    console.log(`  ✔ Developer #03: [${dev3.skills.join(', ')}] | Credits: ${dev3.credits}`);
    console.log(`  ✔ Developer #04: [${dev4.skills.join(', ')}] | Credits: ${dev4.credits}`);

    // -------------------------------------------------------------------------
    // TEST 1: ELIGIBILITY AUDIT
    // -------------------------------------------------------------------------
    console.log('\n[Test 1] Verifying Developer Skill Eligibility...');

    // Dev #01 check
    const elig1Res = await fetch(`${baseUrl}/api/projects/${projectId}/eligibility`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const elig1Data: any = await elig1Res.json();
    if (!elig1Data.eligible || elig1Data.missingSkills.length > 0) {
      throw new Error(`Developer #01 should be eligible, but received: ${JSON.stringify(elig1Data)}`);
    }
    console.log('  ✔ Developer #01 = eligible (has React, Node.js, PostgreSQL)');

    // Dev #02 check (lacks PostgreSQL)
    const elig2Res = await fetch(`${baseUrl}/api/projects/${projectId}/eligibility`, {
      headers: { Authorization: `Bearer ${dev2.token}` },
    });
    const elig2Data: any = await elig2Res.json();
    if (elig2Data.eligible || !elig2Data.missingSkills.includes('PostgreSQL')) {
      throw new Error(`Developer #02 should NOT be eligible, but received: ${JSON.stringify(elig2Data)}`);
    }
    console.log(`  ✔ Developer #02 = not eligible (correctly identified missing: [${elig2Data.missingSkills.join(', ')}])`);

    // Verify claim attempt by ineligible Dev #02 is blocked
    const ineligibleClaimRes = await fetch(`${baseUrl}/api/projects/${projectId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dev2.token}` },
    });
    const ineligibleClaimData: any = await ineligibleClaimRes.json();
    if (ineligibleClaimRes.status !== 400 || !ineligibleClaimData.error.includes('Missing required skills')) {
      throw new Error(`Ineligible claim was not blocked: ${JSON.stringify(ineligibleClaimData)}`);
    }
    console.log(`  ✔ Ineligible developer claim strictly rejected: "${ineligibleClaimData.error}"`);

    // Dev #03 check
    const elig3Res = await fetch(`${baseUrl}/api/projects/${projectId}/eligibility`, {
      headers: { Authorization: `Bearer ${dev3.token}` },
    });
    const elig3Data: any = await elig3Res.json();
    if (!elig3Data.eligible || elig3Data.missingSkills.length > 0) {
      throw new Error(`Developer #03 should be eligible, but received: ${JSON.stringify(elig3Data)}`);
    }
    console.log('  ✔ Developer #03 = eligible (has React, Node.js, PostgreSQL)');

    results.eligibility = true;

    // -------------------------------------------------------------------------
    // TEST 2: SUCCESSFUL CLAIM BY DEVELOPER #01
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Developer #01 Claims Project Slot...');

    const claim1Res = await fetch(`${baseUrl}/api/projects/${projectId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const claim1Data: any = await claim1Res.json();
    if (claim1Res.status !== 200 || !claim1Data.claimId) {
      throw new Error(`Developer #01 claim failed: ${JSON.stringify(claim1Data)}`);
    }

    console.log(`  ✔ Claim successfully executed. Assigned Tag: "${claim1Data.anonymousTag}"`);

    // 2a. Verify 1 credit deducted
    const dev1Account = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [dev1.devId]);
    if (dev1Account.rows[0].balance !== 4) {
      throw new Error(`Expected balance 4, got: ${dev1Account.rows[0].balance}`);
    }
    const dev1Tx = await query(
      "SELECT * FROM credit_transactions WHERE developer_id = $1 AND type = 'PROJECT_CLAIM'",
      [dev1.devId]
    );
    if (dev1Tx.rows.length !== 1 || dev1Tx.rows[0].amount !== -1) {
      throw new Error('Ledger transaction for -1 credit claim was not recorded');
    }
    console.log(`  ✔ 1 credit deducted (New balance: ${dev1Account.rows[0].balance}, Ledger entry: -1)`);

    // 2b. Verify one claim created
    const claimsCheck = await query('SELECT * FROM project_claims WHERE project_id = $1 AND developer_id = $2', [
      projectId,
      dev1.devId,
    ]);
    if (claimsCheck.rows.length !== 1) {
      throw new Error(`Expected 1 claim record, found: ${claimsCheck.rows.length}`);
    }
    console.log(`  ✔ One claim created (ID: ${claimsCheck.rows[0].id}, Tag: ${claimsCheck.rows[0].anonymous_tag})`);

    // 2c. Verify one project conversation created with members
    const convCheck = await query('SELECT * FROM conversations WHERE id = $1', [claim1Data.conversationId]);
    if (convCheck.rows.length !== 1 || convCheck.rows[0].type !== 'PROJECT_PRIVATE') {
      throw new Error('Project private conversation was not created');
    }
    const convMembers = await query('SELECT * FROM conversation_members WHERE conversation_id = $1', [
      claim1Data.conversationId,
    ]);
    if (convMembers.rows.length !== 2) {
      throw new Error(`Expected 2 conversation members (client + dev), got: ${convMembers.rows.length}`);
    }
    console.log(`  ✔ One project conversation created (ID: ${claim1Data.conversationId}, Type: PROJECT_PRIVATE)`);

    // 2d. Verify notification created for client
    const notifCheck = await query(
      "SELECT * FROM notifications WHERE user_id = $1 AND type = 'PROJECT_CLAIMED' ORDER BY created_at DESC LIMIT 1",
      [clientUserId]
    );
    if (notifCheck.rows.length !== 1) {
      throw new Error('Client notification for project claim was not generated');
    }
    console.log(`  ✔ Notification created for client: "${notifCheck.rows[0].title}"`);

    results.claim = true;

    // -------------------------------------------------------------------------
    // TEST 3: DUPLICATE CLAIM (DOUBLE-CLICK DEFENSE)
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Testing Rapid Duplicate Claim Defense...');

    // Developer #01 attempts to claim again
    const dupRes = await fetch(`${baseUrl}/api/projects/${projectId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const dupData: any = await dupRes.json();

    if (dupRes.status !== 400 || !dupData.error.includes('already claimed')) {
      throw new Error(`Duplicate claim was not rejected: ${JSON.stringify(dupData)}`);
    }
    console.log(`  ✔ Duplicate claim attempt strictly rejected: "${dupData.error}"`);

    // Verify ONE claim only
    const dupClaimsCount = await query(
      'SELECT COUNT(*) as count FROM project_claims WHERE project_id = $1 AND developer_id = $2',
      [projectId, dev1.devId]
    );
    if (parseInt(dupClaimsCount.rows[0].count, 10) !== 1) {
      throw new Error(`Duplicate claims exist! Count: ${dupClaimsCount.rows[0].count}`);
    }
    console.log('  ✔ ONE claim only in database');

    // Verify ONE credit consumed
    const dupAccountCheck = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [dev1.devId]);
    if (dupAccountCheck.rows[0].balance !== 4) {
      throw new Error(`Extra credit was consumed! Balance: ${dupAccountCheck.rows[0].balance}`);
    }
    console.log('  ✔ ONE credit consumed (Balance unchanged at 4)');

    results.duplicateClaim = true;

    // -------------------------------------------------------------------------
    // TEST 4: INSUFFICIENT CREDITS (ZERO BALANCE DEFENSE)
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Testing Zero Credits Claim Defense...');

    // Create eligible developer with 0 credits
    const zeroDev = await createTestDeveloper(
      'Developer Zero',
      `dev_zero_${suffix}`,
      ['React', 'Node.js', 'PostgreSQL'],
      0
    );

    const zeroRes = await fetch(`${baseUrl}/api/projects/${projectId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${zeroDev.token}` },
    });
    const zeroData: any = await zeroRes.json();

    if (zeroRes.status !== 400 || !zeroData.error.includes('Insufficient credits')) {
      throw new Error(`Zero credits claim was not rejected: ${JSON.stringify(zeroData)}`);
    }
    console.log(`  ✔ Claim rejected with error: "${zeroData.error}"`);

    // Verify No negative balance
    const zeroAccount = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [zeroDev.devId]);
    if (zeroAccount.rows[0].balance !== 0) {
      throw new Error(`Balance corrupted! Expected 0, got: ${zeroAccount.rows[0].balance}`);
    }
    console.log('  ✔ No negative balance (Balance preserved at 0, CHECK constraint intact)');

    // Verify No conversation created
    const zeroConv = await query(
      'SELECT c.* FROM conversations c JOIN conversation_members cm ON c.id = cm.conversation_id WHERE cm.developer_id = $1',
      [zeroDev.devId]
    );
    if (zeroConv.rows.length > 0) {
      throw new Error('Orphaned conversation was created on failed claim!');
    }
    console.log('  ✔ No conversation created');

    // Verify No partial transaction
    const zeroTx = await query('SELECT * FROM credit_transactions WHERE developer_id = $1', [zeroDev.devId]);
    if (zeroTx.rows.length > 0) {
      throw new Error('Partial credit transaction was written on failed claim!');
    }
    const zeroClaims = await query('SELECT * FROM project_claims WHERE developer_id = $1', [zeroDev.devId]);
    if (zeroClaims.rows.length > 0) {
      throw new Error('Partial project claim was written on failed claim!');
    }
    console.log('  ✔ No partial transaction or claim created (Transaction rollback complete)');

    results.insufficientCredits = true;

    // -------------------------------------------------------------------------
    // TEST 5: MAXIMUM CLAIMS & CLAIMS_CLOSED
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Testing Maximum Claims Limit (max_claims = 2) & Status Transition to CLAIMS_CLOSED...');

    // Set maximum claims to 2
    await query('UPDATE projects SET max_claims = 2 WHERE id = $1', [projectId]);

    // Developer #03 claims (the 2nd and final permitted slot)
    const claim3Res = await fetch(`${baseUrl}/api/projects/${projectId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dev3.token}` },
    });
    const claim3Data: any = await claim3Res.json();
    if (claim3Res.status !== 200) {
      throw new Error(`Developer #03 failed to claim final slot: ${JSON.stringify(claim3Data)}`);
    }
    console.log('  ✔ Developer #03 claimed final slot (2/2 claims reached)');

    // Verify project becomes CLAIMS_CLOSED
    const closedProjectCheck = await query('SELECT status FROM projects WHERE id = $1', [projectId]);
    if (closedProjectCheck.rows[0].status !== 'CLAIMS_CLOSED') {
      throw new Error(`Expected status 'CLAIMS_CLOSED', got: '${closedProjectCheck.rows[0].status}'`);
    }
    console.log(`  ✔ Project becomes: "${closedProjectCheck.rows[0].status}"`);

    // Developer #04 attempts to claim when claims are closed
    const dev4ClaimRes = await fetch(`${baseUrl}/api/projects/${projectId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dev4.token}` },
    });
    const dev4ClaimData: any = await dev4ClaimRes.json();

    if (dev4ClaimRes.status !== 400) {
      throw new Error(`Developer #04 was allowed to claim full project! Status: ${dev4ClaimRes.status}`);
    }
    console.log(`  ✔ Developer #04 cannot claim (HTTP 400: "${dev4ClaimData.error}")`);

    // Verify Developer #04 credits untouched
    const dev4Account = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [dev4.devId]);
    if (dev4Account.rows[0].balance !== 5) {
      throw new Error(`Developer #04 balance modified: ${dev4Account.rows[0].balance}`);
    }
    console.log('  ✔ Developer #04 credits untouched (5 credits intact)');

    results.maximumClaims = true;

    // -------------------------------------------------------------------------
    // TEST 6: RACE CONDITION DEFENSE (CONCURRENT ATTEMPTS ON FINAL SLOT)
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Testing High-Concurrency Race Condition Defense...');

    // Create an isolated project with max_claims = 1
    const raceProjectRes = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category, budget_min, budget_max, timeline,
         requirements, required_technologies, status, claim_cost, max_claims, claim_deadline, client_id
       ) VALUES (
         $1, $2, 'Concurrency Vault Protocol', 'High-speed distributed consensus test',
         'SECURITY', 70000, 100000, '30 Days',
         '["React", "Node.js", "PostgreSQL"]'::jsonb,
         '["React", "Node.js", "PostgreSQL"]'::jsonb,
         'OPEN_FOR_CLAIMS', 1, 1, NOW() + INTERVAL '7 days', $3
       ) RETURNING id`,
      [`PRJ-RACE-${suffix}`, `concurrency-vault-${suffix}`, clientId]
    );
    const raceProjectId = raceProjectRes.rows[0].id;

    // Provision 4 competing developers, each with 5 credits
    const competingDevs = [];
    for (let i = 1; i <= 4; i++) {
      const cDev = await createTestDeveloper(
        `Race Dev ${i}`,
        `race_dev_${i}_${suffix}`,
        ['React', 'Node.js', 'PostgreSQL'],
        5
      );
      competingDevs.push(cDev);
    }

    // Fire 4 simultaneous claim requests at the exact same moment
    console.log('  Launching 4 concurrent claim requests on 1 available slot...');
    const racePromises = competingDevs.map((dev) =>
      fetch(`${baseUrl}/api/projects/${raceProjectId}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${dev.token}` },
      }).then(async (res) => ({
        status: res.status,
        data: (await res.json()) as any,
        developerId: dev.devId,
      }))
    );

    const raceResults = await Promise.all(racePromises);

    const successfulClaims = raceResults.filter((r) => r.status === 200);
    const rejectedClaims = raceResults.filter((r) => r.status === 400);

    console.log(`  Results: ${successfulClaims.length} succeeded, ${rejectedClaims.length} rejected`);

    if (successfulClaims.length !== 1) {
      throw new Error(`RACE CONDITION FAILURE: Expected exactly 1 successful claim, got: ${successfulClaims.length}`);
    }
    if (rejectedClaims.length !== 3) {
      throw new Error(`RACE CONDITION FAILURE: Expected exactly 3 rejected claims, got: ${rejectedClaims.length}`);
    }

    // Verify database safely allows only the permitted number
    const actualClaimsCount = await query(
      'SELECT COUNT(*) as count FROM project_claims WHERE project_id = $1',
      [raceProjectId]
    );
    if (parseInt(actualClaimsCount.rows[0].count, 10) !== 1) {
      throw new Error(`Database contains ${actualClaimsCount.rows[0].count} claims! Expected exactly 1.`);
    }
    console.log('  ✔ Database safely allows only the permitted number (1 claim in table)');

    // Verify No duplicate claims
    const claimDevIds = await query('SELECT developer_id FROM project_claims WHERE project_id = $1', [raceProjectId]);
    const uniqueClaimDevs = new Set(claimDevIds.rows.map((r: any) => r.developer_id));
    if (uniqueClaimDevs.size !== 1) {
      throw new Error('Duplicate claims detected!');
    }
    console.log('  ✔ No duplicate claims');

    // Verify No negative credits & exact debit
    const winningDevId = claimDevIds.rows[0].developer_id;
    for (const dev of competingDevs) {
      const balCheck = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [dev.devId]);
      const bal = balCheck.rows[0].balance;
      if (dev.devId === winningDevId) {
        if (bal !== 4) throw new Error(`Winner expected balance 4, got: ${bal}`);
      } else {
        if (bal !== 5) throw new Error(`Loser balance corrupted: expected 5, got: ${bal}`);
      }
    }
    console.log('  ✔ No negative credits (Winner: 4 Cr, All losers: 5 Cr intact)');

    // Verify No inconsistent state (status is CLAIMS_CLOSED)
    const raceProjCheck = await query('SELECT status FROM projects WHERE id = $1', [raceProjectId]);
    if (raceProjCheck.rows[0].status !== 'CLAIMS_CLOSED') {
      throw new Error(`Expected CLAIMS_CLOSED, got: ${raceProjCheck.rows[0].status}`);
    }
    console.log(`  ✔ No inconsistent state: Project status transitioned to "${raceProjCheck.rows[0].status}"`);

    // Clean up race project
    await query('DELETE FROM project_claims WHERE project_id = $1', [raceProjectId]);
    await query('DELETE FROM conversations WHERE project_id = $1', [raceProjectId]);
    await query('DELETE FROM projects WHERE id = $1', [raceProjectId]);

    results.raceCondition = true;

    // -------------------------------------------------------------------------
    // TEST 7: CLAIM DEADLINE DEFENSE
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Testing Claim Deadline Enforcement...');

    // Create project with deadline in the past
    const expiredProjectRes = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category, budget_min, budget_max, timeline,
         requirements, required_technologies, status, claim_cost, max_claims, claim_deadline, client_id
       ) VALUES (
         $1, $2, 'Expired Protocol', 'Past-deadline validation',
         'Enterprise', 50000, 75000, '30 Days',
         '["React", "Node.js", "PostgreSQL"]'::jsonb,
         '["React", "Node.js", "PostgreSQL"]'::jsonb,
         'OPEN_FOR_CLAIMS', 1, 5, NOW() - INTERVAL '2 hours', $3
       ) RETURNING id`,
      [`PRJ-EXP-${suffix}`, `expired-protocol-${suffix}`, clientId]
    );
    const expiredProjectId = expiredProjectRes.rows[0].id;

    // Attempt claim on expired project
    const expiredClaimRes = await fetch(`${baseUrl}/api/projects/${expiredProjectId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dev4.token}` },
    });
    const expiredClaimData: any = await expiredClaimRes.json();

    if (expiredClaimRes.status !== 400 || !expiredClaimData.error.includes('deadline has passed')) {
      throw new Error(`Expired claim was not rejected: ${JSON.stringify(expiredClaimData)}`);
    }
    console.log(`  ✔ Past-deadline claim rejected: "${expiredClaimData.error}"`);

    // Verify 0 credits deducted
    const dev4BalPostExpired = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [dev4.devId]);
    if (dev4BalPostExpired.rows[0].balance !== 5) {
      throw new Error(`Credit was deducted on expired claim! Balance: ${dev4BalPostExpired.rows[0].balance}`);
    }
    console.log('  ✔ Zero credits deducted (Balance preserved at 5)');

    // Verify 0 claims created
    const expiredClaims = await query('SELECT COUNT(*) as count FROM project_claims WHERE project_id = $1', [
      expiredProjectId,
    ]);
    if (parseInt(expiredClaims.rows[0].count, 10) !== 0) {
      throw new Error('Claim was created for expired project!');
    }
    console.log('  ✔ Zero claims created in database');

    // Clean up expired project
    await query('DELETE FROM projects WHERE id = $1', [expiredProjectId]);

    results.deadline = true;

    console.log('\n================================================================');
    console.log('ALL PHASE 6 PROJECT CLAIM SYSTEM AUDIT TESTS PASSED');
    console.log('================================================================\n');

    return results;
  } finally {
    if (server) {
      await new Promise<void>((resolve) => {
        (server as Server).close(() => resolve());
      });
      console.log('[Audit Harness] Test server shut down cleanly.');
    }
  }
}

// Allow direct execution via tsx
if (process.argv[1]?.endsWith('projectClaimAuditTest.ts')) {
  runProjectClaimAudit()
    .then((results) => {
      console.log('\nRequired report:');
      console.log(`Eligibility: ${results.eligibility ? 'PASS' : 'FAIL'}`);
      console.log(`Claim: ${results.claim ? 'PASS' : 'FAIL'}`);
      console.log(`Duplicate claim: ${results.duplicateClaim ? 'PASS' : 'FAIL'}`);
      console.log(`Insufficient credits: ${results.insufficientCredits ? 'PASS' : 'FAIL'}`);
      console.log(`Maximum claims: ${results.maximumClaims ? 'PASS' : 'FAIL'}`);
      console.log(`Race condition: ${results.raceCondition ? 'PASS' : 'FAIL'}`);
      console.log(`Deadline: ${results.deadline ? 'PASS' : 'FAIL'}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ Phase 6 Audit Test Suite Failed:', err);
      process.exit(1);
    });
}
