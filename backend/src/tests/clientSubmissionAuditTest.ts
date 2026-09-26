import app from '../server.js';
import { query } from '../database/db.js';
import { env } from '../config/environment.js';
import jwt from 'jsonwebtoken';
import { Server } from 'http';

export async function runClientSubmissionAudit(): Promise<{
  projectSubmission: boolean;
  validation: boolean;
  privacy: boolean;
  ownership: boolean;
  stateProtection: boolean;
}> {
  console.log('================================================================');
  console.log('PHASE 5: CLIENT PROJECT SUBMISSION AUDIT & VERIFICATION');
  console.log('================================================================\n');

  let server: Server | null = null;
  let baseUrl = '';

  const results = {
    projectSubmission: false,
    validation: false,
    privacy: false,
    ownership: false,
    stateProtection: false,
  };

  try {
    // 0. Start ephemeral HTTP server for live API tests
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server?.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`[Audit Harness] Live test server listening at ${baseUrl}`);
        resolve();
      });
    });

    // Clean up any old references so that Client #001, Client #002, and PRJ-2026-0001 are freshly created
    console.log('[Setup] Preparing pristine database environment for sequence verification...');
    const oldProj = await query("SELECT id FROM projects WHERE project_number = 'PRJ-2026-0001'");
    if (oldProj.rows.length > 0) {
      const pid = oldProj.rows[0].id;
      await query('DELETE FROM project_milestones WHERE project_id = $1', [pid]);
      await query('DELETE FROM project_members WHERE project_id = $1', [pid]);
      await query('DELETE FROM project_claims WHERE project_id = $1', [pid]);
      await query('DELETE FROM projects WHERE id = $1', [pid]);
    }

    const oldClients = await query(
      "SELECT id, user_id FROM clients WHERE client_number IN ('Client #001', 'Client #002')"
    );
    for (const c of oldClients.rows) {
      await query('DELETE FROM clients WHERE id = $1', [c.id]);
      await query('DELETE FROM users WHERE id = $1', [c.user_id]);
    }

    // Ensure Admin token is available
    let adminUser = await query("SELECT id, email, role FROM users WHERE role = 'ADMIN' OR role = 'CEO' LIMIT 1");
    if (adminUser.rows.length === 0) {
      adminUser = await query(
        "INSERT INTO users (email, password_hash, role, status) VALUES ('admin_p5@nexus.dev', 'hash', 'ADMIN', 'ACTIVE') RETURNING id, email, role"
      );
    }
    const adminToken = jwt.sign(
      { userId: adminUser.rows[0].id, email: adminUser.rows[0].email, role: adminUser.rows[0].role },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // -------------------------------------------------------------------------
    // TEST 1: CREATE CLIENT #001 AND CLIENT #002
    // -------------------------------------------------------------------------
    console.log('\n[Test 1] Creating Client #001 & Client #002 via Registration API...');

    // Register Client #001
    const regRes1 = await fetch(`${baseUrl}/api/auth/register-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'client001@apexretail.io',
        password: 'ClientPassword2026!',
        companyName: 'Apex Retail Labs',
        privateName: 'Ravi Kumar',
        phone: '+91 9988776655',
      }),
    });

    const regData1: any = await regRes1.json();
    if (regRes1.status !== 201) {
      throw new Error(`Failed to register Client #001: ${JSON.stringify(regData1)}`);
    }

    const client1Token = regData1.token;
    const client1Tag = regData1.client.client_number;
    const client1Id = regData1.client.id;

    if (client1Tag !== 'Client #001') {
      throw new Error(`Expected client_number 'Client #001', but received '${client1Tag}'`);
    }
    console.log(`  ✔ Client #001 registered successfully with tag: "${client1Tag}"`);

    // Register Client #002
    const regRes2 = await fetch(`${baseUrl}/api/auth/register-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'client002@acmerobotics.io',
        password: 'ClientPassword2026!',
        companyName: 'Acme Robotics Global',
        privateName: 'Sarah Connor',
        phone: '+91 9911223344',
      }),
    });

    const regData2: any = await regRes2.json();
    if (regRes2.status !== 201) {
      throw new Error(`Failed to register Client #002: ${JSON.stringify(regData2)}`);
    }

    const client2Token = regData2.token;
    const client2Tag = regData2.client.client_number;
    const _client2Id = regData2.client.id;

    if (client2Tag !== 'Client #002') {
      throw new Error(`Expected client_number 'Client #002', but received '${client2Tag}'`);
    }
    console.log(`  ✔ Client #002 registered successfully with tag: "${client2Tag}"`);

    // -------------------------------------------------------------------------
    // TEST 2: SUBMIT PROJECT #0001 (RECEIVES PRJ-2026-0001)
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Client #001 Submitting Project #0001 with PRD Specifications...');

    const projectPayload = {
      title: 'Autonomous AI E-Commerce Engine',
      category: 'Full-Stack Development',
      description:
        'High-throughput distributed commerce system with real-time vector search and multi-tenant billing.',
      requirements: ['React', 'Node.js', 'PostgreSQL'],
      requiredTechnologies: ['React', 'Node.js', 'PostgreSQL', 'Next.js', 'Redis'],
      budgetMin: 50000,
      budgetMax: 80000,
      timeline: '30–45 days',
    };

    const submitRes = await fetch(`${baseUrl}/api/projects/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${client1Token}`,
      },
      body: JSON.stringify(projectPayload),
    });

    const submitData: any = await submitRes.json();
    if (submitRes.status !== 201) {
      throw new Error(`Failed to submit project: ${JSON.stringify(submitData)}`);
    }

    const projectId = submitData.projectId;
    const projectNumber = submitData.projectNumber;
    const projectStatus = submitData.status;

    if (projectNumber !== 'PRJ-2026-0001') {
      throw new Error(`Expected project number 'PRJ-2026-0001', but received '${projectNumber}'`);
    }
    if (projectStatus !== 'SUBMITTED') {
      throw new Error(`Expected initial status 'SUBMITTED', but received '${projectStatus}'`);
    }

    console.log(`  ✔ Project successfully created with unique number: "${projectNumber}"`);
    console.log(`  ✔ Requirements validated: ${JSON.stringify(projectPayload.requirements)}`);
    console.log(`  ✔ Budget validated: ₹50,000–₹80,000 (Min: ${projectPayload.budgetMin}, Max: ${projectPayload.budgetMax})`);
    console.log(`  ✔ Timeline validated: "${projectPayload.timeline}"`);
    console.log(`  ✔ Initial status verified: "${projectStatus}"`);

    results.projectSubmission = true;

    // -------------------------------------------------------------------------
    // TEST 3: ADMIN REVIEW LIFECYCLE: SUBMITTED -> REVIEWING -> OPEN_FOR_CLAIMS
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Admin Review Lifecycle: SUBMITTED -> REVIEWING -> OPEN_FOR_CLAIMS...');

    // Step 3a: Transition SUBMITTED -> REVIEWING
    const reviewRes = await fetch(`${baseUrl}/api/projects/${projectId}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ notes: 'Technical feasibility and budget verified by administration' }),
    });

    const reviewData: any = await reviewRes.json();
    if (reviewRes.status !== 200 || reviewData.status !== 'REVIEWING') {
      throw new Error(`Failed to transition project to REVIEWING: ${JSON.stringify(reviewData)}`);
    }
    console.log('  ✔ State transition SUBMITTED -> REVIEWING successful');

    // Verify DB state for REVIEWING
    const dbReviewCheck = await query('SELECT status FROM projects WHERE id = $1', [projectId]);
    if (dbReviewCheck.rows[0].status !== 'REVIEWING') {
      throw new Error(`Database status mismatch: expected 'REVIEWING', got '${dbReviewCheck.rows[0].status}'`);
    }

    // Step 3b: Transition REVIEWING -> OPEN_FOR_CLAIMS
    const approveRes = await fetch(`${baseUrl}/api/projects/${projectId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ maxClaims: 5, deadlineDays: 7 }),
    });

    const approveData: any = await approveRes.json();
    if (approveRes.status !== 200 || approveData.status !== 'OPEN_FOR_CLAIMS') {
      throw new Error(`Failed to approve project: ${JSON.stringify(approveData)}`);
    }
    console.log('  ✔ State transition REVIEWING -> OPEN_FOR_CLAIMS successful');

    // Verify DB state for OPEN_FOR_CLAIMS and claim deadline
    const dbApproveCheck = await query('SELECT status, claim_deadline, max_claims FROM projects WHERE id = $1', [
      projectId,
    ]);
    if (dbApproveCheck.rows[0].status !== 'OPEN_FOR_CLAIMS') {
      throw new Error(`Database status mismatch: expected 'OPEN_FOR_CLAIMS', got '${dbApproveCheck.rows[0].status}'`);
    }
    if (!dbApproveCheck.rows[0].claim_deadline) {
      throw new Error('Claim deadline was not set upon project approval');
    }
    console.log(`  ✔ Project opened for claims with deadline: ${dbApproveCheck.rows[0].claim_deadline}`);

    // Verify Audit Logs
    const auditLogs = await query(
      "SELECT action FROM audit_logs WHERE entity_id = $1 ORDER BY created_at ASC",
      [projectId]
    );
    const actions = auditLogs.rows.map((r: any) => r.action);
    if (!actions.includes('PROJECT_SUBMITTED') || !actions.includes('PROJECT_REVIEW_STARTED') || !actions.includes('PROJECT_APPROVED_FOR_CLAIMS')) {
      throw new Error(`Incomplete audit trail: ${JSON.stringify(actions)}`);
    }
    console.log('  ✔ Complete audit trail verified: PROJECT_SUBMITTED -> PROJECT_REVIEW_STARTED -> PROJECT_APPROVED_FOR_CLAIMS');

    // -------------------------------------------------------------------------
    // TEST 4: VALIDATION TESTS (REJECT ALL INVALID INPUTS)
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Testing Comprehensive Input & Attachment Validation...');

    const validationCases = [
      {
        name: 'empty title',
        payload: { ...projectPayload, title: '' },
        expectedErrorSubstring: 'title',
      },
      {
        name: 'whitespace title',
        payload: { ...projectPayload, title: '   ' },
        expectedErrorSubstring: 'title',
      },
      {
        name: 'empty requirements',
        payload: { ...projectPayload, requirements: [] },
        expectedErrorSubstring: 'Requirements',
      },
      {
        name: 'invalid budget (min > max)',
        payload: { ...projectPayload, budgetMin: 90000, budgetMax: 50000 },
        expectedErrorSubstring: 'budget',
      },
      {
        name: 'negative budget',
        payload: { ...projectPayload, budgetMin: -50000, budgetMax: 80000 },
        expectedErrorSubstring: 'budget',
      },
      {
        name: 'zero budget',
        payload: { ...projectPayload, budgetMin: 0, budgetMax: 0 },
        expectedErrorSubstring: 'budget',
      },
      {
        name: 'empty timeline',
        payload: { ...projectPayload, timeline: '' },
        expectedErrorSubstring: 'timeline',
      },
      {
        name: 'invalid timeline duration',
        payload: { ...projectPayload, timeline: '-15 days' },
        expectedErrorSubstring: 'timeline',
      },
      {
        name: 'huge file (> 10MB)',
        payload: {
          ...projectPayload,
          attachments: [{ name: 'spec_document.pdf', size: 15 * 1024 * 1024 }],
        },
        expectedErrorSubstring: '10MB',
      },
      {
        name: 'unsupported file (.exe executable)',
        payload: {
          ...projectPayload,
          attachments: [{ name: 'trojan_installer.exe', size: 1024 }],
        },
        expectedErrorSubstring: 'Unsupported file format',
      },
      {
        name: 'unsupported file (.sh shell script)',
        payload: {
          ...projectPayload,
          attachments: [{ name: 'exploit.sh', size: 512 }],
        },
        expectedErrorSubstring: 'Unsupported file format',
      },
    ];

    let allRejected = true;
    for (const testCase of validationCases) {
      const res = await fetch(`${baseUrl}/api/projects/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${client1Token}`,
        },
        body: JSON.stringify(testCase.payload),
      });

      const data: any = await res.json();
      if (res.status === 400) {
        console.log(`  ✔ Correctly rejected ${testCase.name} (HTTP 400: "${data.error}")`);
      } else {
        console.error(`  ❌ FAILED: ${testCase.name} was NOT rejected! Status: ${res.status}`);
        allRejected = false;
      }
    }

    if (!allRejected) {
      throw new Error('One or more invalid input validation tests failed to reject');
    }
    results.validation = true;

    // -------------------------------------------------------------------------
    // TEST 5: PRIVACY SHIELDING (DEVELOPER CANNOT SEE CLIENT PII)
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Verifying Developer Privacy Shielding & Identity Masking...');

    // Find or create an approved developer for querying
    let devRes = await query("SELECT id, user_id FROM developers WHERE verification_status = 'VERIFIED' LIMIT 1");
    if (devRes.rows.length === 0) {
      const uRes = await query(
        "INSERT INTO users (email, password_hash, role, status) VALUES ('dev_p5@nexus.dev', 'hash', 'DEVELOPER', 'ACTIVE') RETURNING id"
      );
      devRes = await query(
        "INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status) VALUES ($1, 'dev_p5_user', 'Auditor Dev', 'Lead Engineer', 5, 'VERIFIED') RETURNING id, user_id",
        [uRes.rows[0].id]
      );
    }
    const devUserId = devRes.rows[0].user_id;
    const devId = devRes.rows[0].id;
    const devToken = jwt.sign(
      { userId: devUserId, email: 'dev_p5@nexus.dev', role: 'DEVELOPER', developerId: devId },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Developer requests Project #0001 details
    const devProjectRes = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });

    const devProjectData: any = await devProjectRes.json();
    if (devProjectRes.status !== 200) {
      throw new Error(`Developer failed to fetch project: ${JSON.stringify(devProjectData)}`);
    }

    const p = devProjectData.project;

    // Verify Anonymous Identifier is present
    if (p.client_number !== 'Client #001') {
      throw new Error(`Expected anonymous client_number 'Client #001', got: ${p.client_number}`);
    }
    console.log(`  ✔ Developer sees anonymous identifier: "${p.client_number}"`);

    // Verify Real Client Name is NOT present
    if (p.private_name) {
      throw new Error(`SECURITY LEAK: Real client private_name exposed to developer: "${p.private_name}"`);
    }
    console.log('  ✔ Real client name (private_name) is shielded from developer view');

    // Verify Client Email is NOT present
    if (p.client_email) {
      throw new Error(`SECURITY LEAK: Client email exposed to developer: "${p.client_email}"`);
    }
    console.log('  ✔ Client email is shielded from developer view');

    // Verify Client Phone is NOT present
    if (p.phone) {
      throw new Error(`SECURITY LEAK: Client phone exposed to developer: "${p.phone}"`);
    }
    console.log('  ✔ Client phone is shielded from developer view');

    // Verify Private Company Information is NOT present (project is OPEN_FOR_CLAIMS, not PUBLISHED)
    if (p.company_name) {
      throw new Error(`SECURITY LEAK: Private company name exposed to developer: "${p.company_name}"`);
    }
    console.log('  ✔ Private company name is shielded from developer view');

    results.privacy = true;

    // -------------------------------------------------------------------------
    // TEST 6: CLIENT MULTI-TENANT OWNERSHIP
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Verifying Multi-Tenant Client Ownership & Isolation...');

    // Client #001 requests their projects: must see Project #0001
    const c1ProjRes = await fetch(`${baseUrl}/api/projects/my-projects`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    const c1ProjData: any = await c1ProjRes.json();
    const c1ProjectNumbers = c1ProjData.projects.map((pr: any) => pr.project_number);

    if (!c1ProjectNumbers.includes('PRJ-2026-0001')) {
      throw new Error(`Client #001 cannot see their own Project #0001: ${JSON.stringify(c1ProjectNumbers)}`);
    }
    console.log(`  ✔ Client #001 sees Project #0001 in their private project list`);

    // Client #002 requests their projects: must NOT see Project #0001
    const c2ProjRes = await fetch(`${baseUrl}/api/projects/my-projects`, {
      headers: { Authorization: `Bearer ${client2Token}` },
    });
    const c2ProjData: any = await c2ProjRes.json();
    const c2ProjectNumbers = c2ProjData.projects.map((pr: any) => pr.project_number);

    if (c2ProjectNumbers.includes('PRJ-2026-0001')) {
      throw new Error(`SECURITY LEAK: Client #002 can see Client #001's Project #0001!`);
    }
    console.log(`  ✔ Client #002 strictly CANNOT see Project #0001 in their private project list`);

    // Client #002 attempts to view another client's unapproved project under review
    // Let's create an unapproved submitted project for Client #001
    const draftRes = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category, budget_min, budget_max, timeline,
         status, claim_deadline, client_id
       ) VALUES (
         'PRJ-2026-0999', 'confidential-prototype', 'Confidential Prototype', 'Trade secret specs',
         'SECURITY', 100000, 200000, '30 Days', 'SUBMITTED', NOW() + INTERVAL '7 days', $1
       ) RETURNING id`,
      [client1Id]
    );
    const draftProjId = draftRes.rows[0].id;

    const crossAccessRes = await fetch(`${baseUrl}/api/projects/${draftProjId}`, {
      headers: { Authorization: `Bearer ${client2Token}` },
    });
    if (crossAccessRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for cross-client project access, got ${crossAccessRes.status}`);
    }
    console.log(`  ✔ Client #002 strictly blocked (HTTP 403) from inspecting Client #001's unapproved project`);

    // Clean up draft project
    await query('DELETE FROM projects WHERE id = $1', [draftProjId]);

    results.ownership = true;

    // -------------------------------------------------------------------------
    // TEST 7: STATUS PROTECTION (CLIENT CANNOT MANUALLY SET PROTECTED STATUSES)
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Verifying State Protection Against Client-Side Tampering...');

    const illegalStatuses = ['DEVELOPER_SELECTED', 'COMPLETED', 'PUBLISHED'];

    for (const illegalStatus of illegalStatuses) {
      const patchRes = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${client1Token}`,
        },
        body: JSON.stringify({ status: illegalStatus }),
      });

      const patchData: any = await patchRes.json();
      if (patchRes.status === 403) {
        console.log(`  ✔ Client attempt to set status to "${illegalStatus}" correctly blocked with HTTP 403: "${patchData.error}"`);
      } else {
        throw new Error(
          `SECURITY FAILURE: Client was able to patch status to "${illegalStatus}"! Status: ${patchRes.status}`
        );
      }
    }

    // Verify DB status remains uncorrupted
    const postCheck = await query('SELECT status FROM projects WHERE id = $1', [projectId]);
    if (postCheck.rows[0].status !== 'OPEN_FOR_CLAIMS') {
      throw new Error(`Status corruption detected: expected 'OPEN_FOR_CLAIMS', got '${postCheck.rows[0].status}'`);
    }
    console.log(`  ✔ Project status in database verified uncorrupted: "${postCheck.rows[0].status}"`);

    results.stateProtection = true;

    console.log('\n================================================================');
    console.log('ALL PHASE 5 VERIFICATION AUDIT TESTS PASSED SUCCESSFULLY');
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
if (process.argv[1]?.endsWith('clientSubmissionAuditTest.ts')) {
  runClientSubmissionAudit()
    .then((results) => {
      console.log('\nAudit Summary:');
      console.log(`Project submission: ${results.projectSubmission ? 'PASS' : 'FAIL'}`);
      console.log(`Validation: ${results.validation ? 'PASS' : 'FAIL'}`);
      console.log(`Privacy: ${results.privacy ? 'PASS' : 'FAIL'}`);
      console.log(`Ownership: ${results.ownership ? 'PASS' : 'FAIL'}`);
      console.log(`State protection: ${results.stateProtection ? 'PASS' : 'FAIL'}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ Audit Test Suite Failed:', err);
      process.exit(1);
    });
}
