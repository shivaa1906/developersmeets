/**
 * EXECUTIVE BYPASS & START-A-PROJECT VERIFICATION TEST
 * 
 * Verifies:
 * 1. CEO and MD leadership developer capability bypass (no verified developer profile needed)
 * 2. Unrestricted claim eligibility for executive leadership
 * 3. Atomic project claim and proposal submission by CEO & MD
 * 4. Executive community post creation without developer restriction
 * 5. Start a Project flow authorization:
 *    - Guest rejected (401)
 *    - Developer rejected (403: "Start a project is available to client accounts.")
 *    - Support rejected (403: "Start a project is available to client accounts.")
 *    - Client permitted (201, prefilled identity, project created)
 *    - Executive leadership permitted (201, auto-provisioned client record)
 * 6. Both POST /api/projects and POST /api/projects/submit endpoints work seamlessly
 */

import { Server } from 'http';
import app from '../server.js';
import { query, pool } from '../database/db.js';

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

async function runVerification() {
  console.log('================================================================');
  console.log('EXECUTIVE BYPASS & START-A-PROJECT FLOW VERIFICATION');
  console.log('================================================================\n');

  let server: Server | null = null;
  const port = 49215;
  const baseUrl = `http://localhost:${port}`;

  try {
    server = app.listen(port);
    await new Promise((resolve) => server!.once('listening', resolve));
    console.log(`[Harness] Test server running on port ${port}`);

    const runId = Date.now();

    // -------------------------------------------------------------
    // PART 1 — LOGIN AUTHENTICATION TOKENS
    // -------------------------------------------------------------
    console.log('\n--- 1. Authenticating Accounts ---');

    // 1.1 CEO Login
    const ceoLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ritesh@nexus.dev', password: 'DevPlatform2026!Secure' }),
    });
    const ceoData = await ceoLoginRes.json();
    assert(ceoLoginRes.status === 200, 'AUTH', 'CEO login succeeds');
    assert(!!ceoData.user.developerId, 'AUTH', 'CEO profile auto-resolves developerId on login');
    assert(ceoData.user.verificationStatus === 'VERIFIED', 'AUTH', 'CEO profile verificationStatus is VERIFIED');
    const ceoToken = ceoData.token;

    // 1.2 MD Login
    const mdLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'shiva@nexus.dev', password: 'DevPlatform2026!Secure' }),
    });
    const mdData = await mdLoginRes.json();
    assert(mdLoginRes.status === 200, 'AUTH', 'MD login succeeds');
    assert(!!mdData.user.developerId, 'AUTH', 'MD profile auto-resolves developerId on login');
    assert(mdData.user.verificationStatus === 'VERIFIED', 'AUTH', 'MD profile verificationStatus is VERIFIED');
    const mdToken = mdData.token;

    // 1.3 Developer Login
    const devLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rahul@nexus.dev', password: 'DevPlatform2026!Secure' }),
    });
    const devData = await devLoginRes.json();
    assert(devLoginRes.status === 200, 'AUTH', 'Developer login succeeds');
    const devToken = devData.token;

    // 1.4 Support Login
    const supportLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'support@nexus.dev', password: 'DevPlatform2026!Secure' }),
    });
    const supportData = await supportLoginRes.json();
    assert(supportLoginRes.status === 200, 'AUTH', 'Support login succeeds');
    const supportToken = supportData.token;

    // 1.5 Client Login
    const clientLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'client001@apexretail.io', password: 'DevPlatform2026!Secure' }),
    });
    const clientData = await clientLoginRes.json();
    assert(clientLoginRes.status === 200, 'AUTH', 'Client login succeeds');
    assert(!!clientData.user.clientId, 'AUTH', 'Client login resolves clientId');
    const clientToken = clientData.token;

    // -------------------------------------------------------------
    // PART 2 — CEO / MD DEVELOPER CAPABILITY BYPASS
    // -------------------------------------------------------------
    console.log('\n--- 2. Executive Leadership Developer Capability Bypass ---');

    // Create an open marketplace project with exotic required skills
    const clientDbRes = await query(`SELECT id FROM clients LIMIT 1`);
    const testClientId = clientDbRes.rows[0].id;
    const projectInsertRes = await query(
      `INSERT INTO projects (
        project_number, slug, title, description, category,
        budget_min, budget_max, timeline, requirements, required_technologies,
        status, claim_cost, max_claims, claim_deadline, client_id
      ) VALUES (
        $1, $2, $3, $4, $5,
        100000, 250000, '2-4 Weeks', '["Cobol Legacy System Migration", "Fortran Matrix Computation"]'::jsonb,
        '["COBOL", "Fortran", "QuantumComputing"]'::jsonb,
        'OPEN_FOR_CLAIMS', 1, 5, NOW() + INTERVAL '7 days', $6
      ) RETURNING id`,
      [
        `PRJ-2026-EX${runId.toString().slice(-4)}`,
        `exec-bypass-test-${runId}`,
        `Exotic Tech Migration Project ${runId}`,
        'High complexity project testing executive claim bypass without verified developer requirement.',
        'Enterprise Software',
        testClientId,
      ]
    );
    const testProjectId = projectInsertRes.rows[0].id;

    // 2.1 Developer Skill Mismatch Check
    const devEligRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/eligibility`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    const devEligData = await devEligRes.json();
    assert(
      devEligData.eligible === false,
      'EXECUTIVE_BYPASS',
      'Normal developer without exotic skills is marked ineligible'
    );

    // 2.2 CEO Eligibility Check (Bypass)
    const ceoEligRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/eligibility`, {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    const ceoEligData = await ceoEligRes.json();
    assert(ceoEligRes.status === 200, 'EXECUTIVE_BYPASS', 'CEO checkEligibility returns HTTP 200');
    assert(ceoEligData.eligible === true, 'EXECUTIVE_BYPASS', 'CEO is eligible despite exotic skills');
    assert(
      ceoEligData.reason === 'Executive leadership unrestricted eligibility',
      'EXECUTIVE_BYPASS',
      'CEO eligibility reason specifies executive leadership unrestricted eligibility'
    );

    // 2.3 MD Eligibility Check (Bypass)
    const mdEligRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/eligibility`, {
      headers: { Authorization: `Bearer ${mdToken}` },
    });
    const mdEligData = await mdEligRes.json();
    assert(mdEligRes.status === 200, 'EXECUTIVE_BYPASS', 'MD checkEligibility returns HTTP 200');
    assert(mdEligData.eligible === true, 'EXECUTIVE_BYPASS', 'MD is eligible despite exotic skills');

    // 2.4 CEO Project Claim (No "Verified developer profile required" error)
    const ceoClaimRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    const ceoClaimData = await ceoClaimRes.json();
    assert(ceoClaimRes.status === 200, 'EXECUTIVE_BYPASS', 'CEO claims project slot successfully (HTTP 200)');
    assert(
      !ceoClaimData.error || !ceoClaimData.error.includes('Verified developer profile required'),
      'EXECUTIVE_BYPASS',
      'CEO claim is NOT blocked by "Verified developer profile required"'
    );
    assert(!!ceoClaimData.anonymousTag, 'EXECUTIVE_BYPASS', 'CEO received anonymous tag');

    // 2.5 MD Project Claim (No "Verified developer profile required" error)
    const mdClaimRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mdToken}` },
    });
    const mdClaimData = await mdClaimRes.json();
    assert(mdClaimRes.status === 200, 'EXECUTIVE_BYPASS', 'MD claims project slot successfully (HTTP 200)');
    assert(
      !mdClaimData.error || !mdClaimData.error.includes('Verified developer profile required'),
      'EXECUTIVE_BYPASS',
      'MD claim is NOT blocked by "Verified developer profile required"'
    );

    // 2.6 CEO Proposal Submission
    const ceoProposalRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/proposals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ceoToken}`,
      },
      body: JSON.stringify({
        approach: 'Executive high-level architecture execution strategy with fault tolerance.',
        timeline: '2 Weeks',
        price: 150000,
      }),
    });
    const ceoProposalData = await ceoProposalRes.json();
    assert(
      ceoProposalRes.status === 200 || ceoProposalRes.status === 201,
      'EXECUTIVE_BYPASS',
      'CEO submits proposal without developer verification block'
    );

    // 2.7 CEO Community Post Creation
    const channelRes = await query(`SELECT id FROM channels LIMIT 1`);
    const channelId = channelRes.rows[0].id;
    const postRes = await fetch(`${baseUrl}/api/community/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ceoToken}`,
      },
      body: JSON.stringify({
        channelId,
        title: `Executive Tech Announcement ${runId}`,
        content: 'Engineering principles and platform roadmap guidance from leadership.',
        tags: ['architecture', 'leadership'],
      }),
    });
    const postData = await postRes.json();
    assert(postRes.status === 201, 'EXECUTIVE_BYPASS', 'CEO creates community post without developer restriction');

    // -------------------------------------------------------------
    // PART 3 — START A PROJECT FLOW AUTHORIZATION & SUBMISSION
    // -------------------------------------------------------------
    console.log('\n--- 3. Start A Project Flow Authorization & Submission ---');

    const projectPayload = {
      title: `Enterprise Cloud Platform ${runId}`,
      category: 'Cloud & Infrastructure',
      description: 'Distributed microservices platform on Kubernetes with multi-region failover.',
      budgetMin: 80000,
      budgetMax: 200000,
      timeline: '2-3 Months',
      requirements: [
        'Zero-downtime deployment pipeline',
        'Automatic horizontal pod autoscaling',
      ],
      requiredTechnologies: ['Kubernetes', 'Docker', 'Go', 'PostgreSQL'],
    };

    // 3.1 Unauthenticated Guest Attempt (Rejection)
    const guestSubRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectPayload),
    });
    assert(guestSubRes.status === 401, 'START_PROJECT', 'Unauthenticated guest submission rejected with HTTP 401');

    // 3.2 Developer Submission Attempt (Option B Rejection)
    const devSubRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`,
      },
      body: JSON.stringify(projectPayload),
    });
    const devSubData = await devSubRes.json();
    assert(devSubRes.status === 403, 'START_PROJECT', 'Developer submission rejected with HTTP 403');
    assert(
      devSubData.error === 'Start a project is available to client accounts.',
      'START_PROJECT',
      'Developer receives exact notice: "Start a project is available to client accounts."'
    );

    // 3.3 Support Specialist Submission Attempt (Rejection)
    const supportSubRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supportToken}`,
      },
      body: JSON.stringify(projectPayload),
    });
    const supportSubData = await supportSubRes.json();
    assert(supportSubRes.status === 403, 'START_PROJECT', 'Support submission rejected with HTTP 403');
    assert(
      supportSubData.error === 'Start a project is available to client accounts.',
      'START_PROJECT',
      'Support receives exact notice: "Start a project is available to client accounts."'
    );

    // 3.4 Client Submission on POST /api/projects (Canonical Route)
    const clientSubRes1 = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clientToken}`,
      },
      body: JSON.stringify(projectPayload),
    });
    const clientSubData1 = await clientSubRes1.json();
    if (clientSubRes1.status !== 201) {
      console.log('clientSubRes1 failed:', clientSubRes1.status, clientSubData1);
    }
    assert(clientSubRes1.status === 201, 'START_PROJECT', 'Client POST /api/projects succeeds with HTTP 201');
    assert(!!clientSubData1.projectNumber, 'START_PROJECT', 'Client project assigned official projectNumber');
    assert(clientSubData1.status === 'SUBMITTED', 'START_PROJECT', 'Client project initial status is SUBMITTED');

    // 3.5 Client Submission on POST /api/projects/submit (Alias Route)
    const clientSubRes2 = await fetch(`${baseUrl}/api/projects/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clientToken}`,
      },
      body: JSON.stringify({
        ...projectPayload,
        title: `Enterprise Mobile Banking App ${runId}`,
      }),
    });
    const clientSubData2 = await clientSubRes2.json();
    assert(clientSubRes2.status === 201, 'START_PROJECT', 'Client POST /api/projects/submit succeeds with HTTP 201');
    assert(!!clientSubData2.projectNumber, 'START_PROJECT', 'Alias route project assigned official projectNumber');

    // 3.6 CEO Submission on POST /api/projects (Executive Leadership Permitted)
    const ceoSubRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ceoToken}`,
      },
      body: JSON.stringify({
        ...projectPayload,
        title: `CEO Internal Flagship Initiative ${runId}`,
      }),
    });
    const ceoSubData = await ceoSubRes.json();
    assert(ceoSubRes.status === 201, 'START_PROJECT', 'CEO can commission projects directly (HTTP 201)');
    assert(!!ceoSubData.projectNumber, 'START_PROJECT', 'CEO project assigned official projectNumber');

    // 3.7 MD Submission on POST /api/projects/submit (Managing Director Permitted)
    const mdSubRes = await fetch(`${baseUrl}/api/projects/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mdToken}`,
      },
      body: JSON.stringify({
        ...projectPayload,
        title: `MD Operations Modernization Project ${runId}`,
      }),
    });
    const mdSubData = await mdSubRes.json();
    assert(mdSubRes.status === 201, 'START_PROJECT', 'MD can commission projects directly (HTTP 201)');
    assert(!!mdSubData.projectNumber, 'START_PROJECT', 'MD project assigned official projectNumber');

    // 3.8 Validate Identity Isolation in DB (Client ID was derived from session, not client payload)
    const checkDbRes = await query(
      `SELECT client_id FROM projects WHERE id = $1`,
      [clientSubData1.projectId]
    );
    assert(
      checkDbRes.rows[0].client_id === clientData.user.clientId,
      'START_PROJECT',
      'Database verifies client_id derived securely from JWT session (no client spoofing)'
    );

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('SCORECARD SUMMARY');
    console.log('=============================================================');
    const total = testResults.length;
    const passed = testResults.filter((r) => r.passed).length;
    const failed = testResults.filter((r) => !r.passed).length;

    console.log(`Total Assertions : ${total}`);
    console.log(`Passed           : ${passed}`);
    console.log(`Failed           : ${failed}`);
    console.log(`Success Rate     : ${Math.round((passed / total) * 100)}%`);

    if (failed > 0) {
      console.error('\nFailed tests:');
      testResults.filter((r) => !r.passed).forEach((r) => console.error(`  - [${r.category}] ${r.name}: ${r.details}`));
      process.exit(1);
    } else {
      console.log('\nAll tests PASSED successfully!');
      process.exit(0);
    }
  } catch (err: any) {
    console.error('Fatal error during test run:', err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await pool.end();
  }
}

runVerification();
