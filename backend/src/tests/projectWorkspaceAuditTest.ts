import app from '../server.js';
import { query } from '../database/db.js';
import { env } from '../config/environment.js';
import { ROLES } from '../config/constants.js';
import jwt from 'jsonwebtoken';
import { Server } from 'http';
import bcrypt from 'bcryptjs';

interface AuditResults {
  accessControl: boolean;
  milestones: boolean;
  files: boolean;
  timeline: boolean;
}

export async function runProjectWorkspaceAudit(): Promise<AuditResults> {
  console.log('================================================================');
  console.log('PHASE 10: PROJECT WORKSPACE AUDIT');
  console.log('================================================================\n');

  let server: Server | null = null;
  let baseUrl = '';

  const results: AuditResults = {
    accessControl: false,
    milestones: false,
    files: false,
    timeline: false,
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

    // 1. Setup Client #001 (Owner)
    const client1Check = await query("SELECT id, user_id FROM clients WHERE client_number = 'Client #001' LIMIT 1");
    let client1Id = '';
    let client1UserId = '';
    if (client1Check.rows.length === 0) {
      const u = await query(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES ('client001.workspace@nexus.test', $1, 'CLIENT', 'ACTIVE')
         RETURNING id`,
        [passwordHash]
      );
      client1UserId = u.rows[0].id;
      const c = await query(
        `INSERT INTO clients (user_id, client_number, company_name, private_name)
         VALUES ($1, 'Client #001', 'Enterprise Aerospace Solutions', 'Sunil Mehta')
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

    // Helper to create developers cleanly
    const createDevHelper = async (tag: string, name: string) => {
      const username = `${tag}_${runId}`;
      const email = `${username}@nexus.dev`;
      const u = await query(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES ($1, $2, 'DEVELOPER', 'ACTIVE')
         RETURNING id`,
        [email, passwordHash]
      );
      const devUserId = u.rows[0].id;

      const d = await query(
        `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status)
         VALUES ($1, $2, $3, 'Principal Engineer', 6, 'VERIFIED')
         RETURNING id`,
        [devUserId, username, name]
      );
      const devId = d.rows[0].id;

      const token = jwt.sign(
        { userId: devUserId, role: ROLES.DEVELOPER, developerId: devId },
        env.JWT_SECRET,
        { expiresIn: '2h' }
      );

      return { userId: devUserId, devId, token, username };
    };

    // 2. Setup Developer #01 (Selected Lead Developer)
    const dev1 = await createDevHelper('dev01_lead', 'Rohan Sharma');
    const dev1UserId = dev1.userId;
    const dev1Id = dev1.devId;
    const tokenDev1 = dev1.token;

    // 3. Setup Developer #02 (Unselected Candidate)
    const dev2 = await createDevHelper('dev02_cand', 'Aarav Patel');
    const dev2Id = dev2.devId;
    const tokenDev2 = dev2.token;

    // 4. Setup Developer #03 (Unselected Candidate)
    const dev3 = await createDevHelper('dev03_cand', 'Vikram Sen');
    const dev3Id = dev3.devId;
    const tokenDev3 = dev3.token;

    // 5. Setup Developer #04 (Unrelated Developer - never claimed)
    const dev4 = await createDevHelper('dev04_unrel', 'Kiran Bedi');
    const tokenDev4 = dev4.token;

    // 6. Setup Client #002 (Unrelated Client)
    const client2Check = await query("SELECT id, user_id FROM clients WHERE client_number = 'Client #002' LIMIT 1");
    let client2Id = '';
    let client2UserId = '';
    if (client2Check.rows.length === 0) {
      const u = await query(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES ('client002.workspace@nexus.test', $1, 'CLIENT', 'ACTIVE')
         RETURNING id`,
        [passwordHash]
      );
      client2UserId = u.rows[0].id;
      const c = await query(
        `INSERT INTO clients (user_id, client_number, company_name, private_name)
         VALUES ($1, 'Client #002', 'Unrelated Logistics Corp', 'Rajesh Gupta')
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

    // 7. Setup Project #0001
    const pNumber = `PRJ-2026-WKSP-${Date.now().toString().slice(-4)}`;
    const pRes = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline, requirements, required_technologies,
         status, claim_cost, max_claims, claim_deadline, client_id, lead_developer_id
       ) VALUES (
         $1, $2, 'Next-Gen Satellite Telemetry Platform', 'Real-time telemetry analysis and orbit calculation engine',
         'Aerospace / Systems', 50000, 80000, '30–45 days',
         '["React", "Node.js", "PostgreSQL", "Telemetry Pipeline"]'::jsonb,
         '["React", "Node.js", "PostgreSQL", "Docker"]'::jsonb,
         'DEVELOPER_SELECTED', 1, 3, NOW() + INTERVAL '10 days', $3, $4
       ) RETURNING id`,
      [pNumber, `satellite-telemetry-${Date.now()}`, client1Id, dev1Id]
    );
    const projectId = pRes.rows[0].id;

    // Add Developer #01 as LEAD in project_members
    await query(
      `INSERT INTO project_members (project_id, developer_id, role)
       VALUES ($1, $2, 'LEAD')
       ON CONFLICT (project_id, developer_id) DO UPDATE SET role = 'LEAD'`,
      [projectId, dev1Id]
    );

    // Add unselected claims for Developer #02 and Developer #03
    await query(
      `INSERT INTO project_claims (project_id, developer_id, status, anonymous_tag)
       VALUES ($1, $2, 'NOT_SELECTED', 'Developer #02')
       ON CONFLICT (project_id, developer_id) DO UPDATE SET status = 'NOT_SELECTED'`,
      [projectId, dev2Id]
    );

    await query(
      `INSERT INTO project_claims (project_id, developer_id, status, anonymous_tag)
       VALUES ($1, $2, 'NOT_SELECTED', 'Developer #03')
       ON CONFLICT (project_id, developer_id) DO UPDATE SET status = 'NOT_SELECTED'`,
      [projectId, dev3Id]
    );

    // Create an active workspace conversation and message
    const convRes = await query(
      `INSERT INTO conversations (project_id, type, status)
       VALUES ($1, 'PROJECT_PRIVATE', 'ACTIVE')
       RETURNING id`,
      [projectId]
    );
    const conversationId = convRes.rows[0].id;

    await query(
      `INSERT INTO conversation_members (conversation_id, user_id, client_id, role)
       VALUES ($1, $2, $3, 'CLIENT')`,
      [conversationId, client1UserId, client1Id]
    );
    await query(
      `INSERT INTO conversation_members (conversation_id, user_id, developer_id, role)
       VALUES ($1, $2, $3, 'DEVELOPER')`,
      [conversationId, dev1UserId, dev1Id]
    );
    await query(
      `INSERT INTO messages (conversation_id, sender_user_id, message, message_type)
       VALUES ($1, $2, 'Welcome to the project workspace! Let us review the architecture.', 'TEXT')`,
      [conversationId, dev1UserId]
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 1: VERIFY WORKSPACE 9 OPERATIONAL SECTIONS
    // -------------------------------------------------------------------------
    console.log('[Test 1] Verifying workspace operational sections...');
    const wsRes = await fetch(`${baseUrl}/api/workspace/${projectId}`, {
      headers: { Authorization: `Bearer ${tokenClient1}` },
    });
    const wsData = (await wsRes.json()) as any;

    if (wsRes.status !== 200 || !wsData.workspace) {
      throw new Error(`Failed to load project workspace. Status ${wsRes.status}: ${JSON.stringify(wsData)}`);
    }

    const { workspace } = wsData;
    const requiredSections = [
      'overview',
      'requirements',
      'milestones',
      'tasks',
      'files',
      'messages',
      'timeline',
      'payments',
      'support',
    ];

    for (const section of requiredSections) {
      if (workspace[section] === undefined) {
        throw new Error(`Workspace section missing: "${section}"`);
      }
    }

    console.log('  ✔ All 9 workspace operational sections present:');
    console.log('    - Overview:', workspace.overview.title);
    console.log('    - Requirements count:', workspace.requirements.length);
    console.log('    - Milestones count:', workspace.milestones.length);
    console.log('    - Tasks count:', workspace.tasks.length);
    console.log('    - Files count:', workspace.files.length);
    console.log('    - Messages count:', workspace.messages.length);
    console.log('    - Timeline events count:', workspace.timeline.length);
    console.log('    - Payments count:', workspace.payments.length);
    console.log('    - Support tickets count:', workspace.support.length);

    // -------------------------------------------------------------------------
    // TEST SECTION 2: ACCESS CONTROL AUDIT
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Auditing Workspace Access Control...');

    // A. Client can access own project
    const accessClient = await fetch(`${baseUrl}/api/workspace/${projectId}`, {
      headers: { Authorization: `Bearer ${tokenClient1}` },
    });
    if (accessClient.status !== 200) {
      throw new Error(`Expected Client #001 to access own workspace (200), got ${accessClient.status}`);
    }
    console.log('  ✔ Client #001 (Owner) access: ALLOWED (200 OK)');

    // B. Selected developer can access
    const accessDev1 = await fetch(`${baseUrl}/api/workspace/${projectId}`, {
      headers: { Authorization: `Bearer ${tokenDev1}` },
    });
    if (accessDev1.status !== 200) {
      throw new Error(`Expected Selected Developer #01 to access workspace (200), got ${accessDev1.status}`);
    }
    console.log('  ✔ Developer #01 (Selected Lead) access: ALLOWED (200 OK)');

    // C. Unselected Developer #02 cannot access
    const accessDev2 = await fetch(`${baseUrl}/api/workspace/${projectId}`, {
      headers: { Authorization: `Bearer ${tokenDev2}` },
    });
    if (accessDev2.status !== 403) {
      throw new Error(`Expected Unselected Developer #02 to be blocked (403), got ${accessDev2.status}`);
    }
    console.log('  ✔ Developer #02 (Unselected Candidate) access: DENIED (403 Forbidden)');

    // D. Unselected Developer #03 cannot access
    const accessDev3 = await fetch(`${baseUrl}/api/workspace/${projectId}`, {
      headers: { Authorization: `Bearer ${tokenDev3}` },
    });
    if (accessDev3.status !== 403) {
      throw new Error(`Expected Unselected Developer #03 to be blocked (403), got ${accessDev3.status}`);
    }
    console.log('  ✔ Developer #03 (Unselected Candidate) access: DENIED (403 Forbidden)');

    // E. Unrelated Developer #04 cannot access
    const accessDev4 = await fetch(`${baseUrl}/api/workspace/${projectId}`, {
      headers: { Authorization: `Bearer ${tokenDev4}` },
    });
    if (accessDev4.status !== 403) {
      throw new Error(`Expected Unrelated Developer #04 to be blocked (403), got ${accessDev4.status}`);
    }
    console.log('  ✔ Developer #04 (Unrelated Developer) access: DENIED (403 Forbidden)');

    // F. Unrelated Client #002 cannot access
    const accessClient2 = await fetch(`${baseUrl}/api/workspace/${projectId}`, {
      headers: { Authorization: `Bearer ${tokenClient2}` },
    });
    if (accessClient2.status !== 403) {
      throw new Error(`Expected Unrelated Client #002 to be blocked (403), got ${accessClient2.status}`);
    }
    console.log('  ✔ Client #002 (Unrelated Client) access: DENIED (403 Forbidden)');

    results.accessControl = true;

    // -------------------------------------------------------------------------
    // TEST SECTION 3: MILESTONES CREATION & LIFECYCLE
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Creating and testing Milestones lifecycle...');

    const requiredMilestoneNames = [
      'Requirement Analysis',
      'UI',
      'Frontend',
      'Backend',
      'Testing',
      'Deployment',
    ];

    const createdMilestones: any[] = [];

    // Create the 6 required milestones
    for (let i = 0; i < requiredMilestoneNames.length; i++) {
      const title = requiredMilestoneNames[i];
      const createRes = await fetch(`${baseUrl}/api/workspace/${projectId}/milestones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenClient1}`,
        },
        body: JSON.stringify({
          title,
          description: `Deliverable milestone ${i + 1}: ${title} specification and artifacts`,
          orderIndex: i + 1,
        }),
      });

      const createData = (await createRes.json()) as any;
      if (createRes.status !== 201 || !createData.milestone) {
        throw new Error(`Failed to create milestone "${title}": ${JSON.stringify(createData)}`);
      }

      createdMilestones.push(createData.milestone);
      console.log(`  ✔ Milestone created: "${title}" (Status: ${createData.milestone.status})`);
    }

    if (createdMilestones.length !== 6) {
      throw new Error(`Expected 6 created milestones, got ${createdMilestones.length}`);
    }

    const testMilestone = createdMilestones[0]; // Requirement Analysis

    // 3A. Initial status is PENDING
    if (testMilestone.status !== 'PENDING') {
      throw new Error(`Expected initial milestone status PENDING, got ${testMilestone.status}`);
    }
    console.log('  ✔ Milestone initial status: PENDING');

    // 3B. Developer starts work: PENDING -> IN_PROGRESS
    const startRes = await fetch(`${baseUrl}/api/workspace/milestones/${testMilestone.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDev1}`,
      },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    const startData = (await startRes.json()) as any;
    if (startRes.status !== 200 || startData.milestone.status !== 'IN_PROGRESS') {
      throw new Error(`Failed transition to IN_PROGRESS: ${JSON.stringify(startData)}`);
    }
    console.log('  ✔ Developer starts milestone: IN_PROGRESS');

    // 3C. Developer submits milestone: IN_PROGRESS -> SUBMITTED
    const submitRes = await fetch(`${baseUrl}/api/workspace/milestones/${testMilestone.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDev1}`,
      },
      body: JSON.stringify({
        status: 'SUBMITTED',
        submissionNotes: 'Requirement analysis documentation and wireframe links ready for client review.',
      }),
    });
    const submitData = (await submitRes.json()) as any;
    if (submitRes.status !== 200 || submitData.milestone.status !== 'SUBMITTED') {
      throw new Error(`Failed transition to SUBMITTED: ${JSON.stringify(submitData)}`);
    }
    console.log('  ✔ Developer submits milestone: SUBMITTED');

    // Security check: Developer cannot self-approve their own milestone
    const devApproveAttempt = await fetch(`${baseUrl}/api/workspace/milestones/${testMilestone.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDev1}`,
      },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    if (devApproveAttempt.status !== 403) {
      throw new Error(`Developer self-approval should be rejected (403), got ${devApproveAttempt.status}`);
    }
    console.log('  ✔ Developer self-approval attempt blocked: 403 Forbidden');

    // 3D. Client requests changes: SUBMITTED -> CHANGES_REQUESTED
    console.log('\n[Test 4] Testing Client Change Request and Developer Resubmission...');
    const changeReqRes = await fetch(`${baseUrl}/api/workspace/milestones/${testMilestone.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenClient1}`,
      },
      body: JSON.stringify({
        status: 'CHANGES_REQUESTED',
        feedback: 'Please expand section 4 with high-frequency orbit telemetry edge cases.',
      }),
    });
    const changeReqData = (await changeReqRes.json()) as any;
    if (changeReqRes.status !== 200 || changeReqData.milestone.status !== 'CHANGES_REQUESTED') {
      throw new Error(`Failed transition to CHANGES_REQUESTED: ${JSON.stringify(changeReqData)}`);
    }
    console.log('  ✔ Client requests changes: CHANGES_REQUESTED');

    // 3E. Developer updates and resubmits: CHANGES_REQUESTED -> SUBMITTED
    const resubmitRes = await fetch(`${baseUrl}/api/workspace/milestones/${testMilestone.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDev1}`,
      },
      body: JSON.stringify({
        status: 'SUBMITTED',
        submissionNotes: 'Telemetry edge cases addressed in Section 4 revision.',
      }),
    });
    const resubmitData = (await resubmitRes.json()) as any;
    if (resubmitRes.status !== 200 || resubmitData.milestone.status !== 'SUBMITTED') {
      throw new Error(`Failed developer resubmission: ${JSON.stringify(resubmitData)}`);
    }
    console.log('  ✔ Developer updates and resubmits: SUBMITTED');

    // 3F. Client approves: SUBMITTED -> APPROVED
    console.log('\n[Test 5] Testing Client Approval and Completion...');
    const approveRes = await fetch(`${baseUrl}/api/workspace/milestones/${testMilestone.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenClient1}`,
      },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    const approveData = (await approveRes.json()) as any;
    if (approveRes.status !== 200 || approveData.milestone.status !== 'APPROVED') {
      throw new Error(`Failed client approval: ${JSON.stringify(approveData)}`);
    }
    if (!approveData.milestone.completed_at) {
      throw new Error('Approved milestone should record completed_at timestamp');
    }
    console.log('  ✔ Client approves milestone: APPROVED (completed_at stamped)');

    // 3G. Milestone finalized: APPROVED -> COMPLETED
    const completeRes = await fetch(`${baseUrl}/api/workspace/milestones/${testMilestone.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenClient1}`,
      },
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    const completeData = (await completeRes.json()) as any;
    if (completeRes.status !== 200 || completeData.milestone.status !== 'COMPLETED') {
      throw new Error(`Failed transition to COMPLETED: ${JSON.stringify(completeData)}`);
    }
    console.log('  ✔ Milestone finalized: COMPLETED');

    results.milestones = true;

    // -------------------------------------------------------------------------
    // TEST SECTION 4: DELIVERABLE FILES & ACCESS CONTROL
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Testing Deliverable Files Upload & Strict Access Control...');

    // A. Upload valid file by Developer #01
    const uploadRes = await fetch(`${baseUrl}/api/workspace/${projectId}/files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDev1}`,
      },
      body: JSON.stringify({
        fileName: 'Satellite_Orbit_Telemetry_Architecture_v1.pdf',
        fileUrl: 'https://storage.nexusplatform.io/projects/PRJ-2026-0001/Satellite_Orbit_Telemetry_Architecture_v1.pdf',
        fileSize: 2458112,
        mimeType: 'application/pdf',
        milestoneId: testMilestone.id,
      }),
    });
    const uploadData = (await uploadRes.json()) as any;
    if (uploadRes.status !== 201 || !uploadData.file) {
      throw new Error(`Failed to upload file: ${JSON.stringify(uploadData)}`);
    }
    const uploadedFileId = uploadData.file.id;
    console.log(`  ✔ File uploaded successfully: "${uploadData.file.file_name}" (ID: ${uploadedFileId})`);

    // B. Verify access for authorized parties
    const clientFileAccess = await fetch(`${baseUrl}/api/workspace/${projectId}/files/${uploadedFileId}`, {
      headers: { Authorization: `Bearer ${tokenClient1}` },
    });
    if (clientFileAccess.status !== 200) {
      throw new Error(`Authorized Client #001 denied file access: status ${clientFileAccess.status}`);
    }
    console.log('  ✔ Authorized Client #001 access: ALLOWED (200 OK)');

    const devFileAccess = await fetch(`${baseUrl}/api/workspace/${projectId}/files/${uploadedFileId}`, {
      headers: { Authorization: `Bearer ${tokenDev1}` },
    });
    if (devFileAccess.status !== 200) {
      throw new Error(`Authorized Developer #01 denied file access: status ${devFileAccess.status}`);
    }
    console.log('  ✔ Authorized Developer #01 access: ALLOWED (200 OK)');

    // C. Unauthorized file access attempts
    const unselectedDevAccess = await fetch(`${baseUrl}/api/workspace/${projectId}/files/${uploadedFileId}`, {
      headers: { Authorization: `Bearer ${tokenDev2}` },
    });
    if (unselectedDevAccess.status !== 403) {
      throw new Error(`Unselected Developer #02 was able to access file: status ${unselectedDevAccess.status}`);
    }
    console.log('  ✔ Unauthorized Candidate Developer #02 file access: DENIED (403 Forbidden)');

    const unrelatedDevAccess = await fetch(`${baseUrl}/api/workspace/${projectId}/files/${uploadedFileId}`, {
      headers: { Authorization: `Bearer ${tokenDev4}` },
    });
    if (unrelatedDevAccess.status !== 403) {
      throw new Error(`Unrelated Developer #04 was able to access file: status ${unrelatedDevAccess.status}`);
    }
    console.log('  ✔ Unauthorized Unrelated Developer #04 file access: DENIED (403 Forbidden)');

    const unrelatedClientAccess = await fetch(`${baseUrl}/api/workspace/${projectId}/files/${uploadedFileId}`, {
      headers: { Authorization: `Bearer ${tokenClient2}` },
    });
    if (unrelatedClientAccess.status !== 403) {
      throw new Error(`Unrelated Client #002 was able to access file: status ${unrelatedClientAccess.status}`);
    }
    console.log('  ✔ Unauthorized Unrelated Client #002 file access: DENIED (403 Forbidden)');

    results.files = true;

    // -------------------------------------------------------------------------
    // TEST SECTION 5: TIMELINE VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Verifying Project Timeline...');

    const timelineRes = await fetch(`${baseUrl}/api/workspace/${projectId}/timeline`, {
      headers: { Authorization: `Bearer ${tokenClient1}` },
    });
    const timelineData = (await timelineRes.json()) as any;

    if (timelineRes.status !== 200 || !Array.isArray(timelineData.timeline)) {
      throw new Error(`Failed to fetch timeline: ${JSON.stringify(timelineData)}`);
    }

    const { timeline: events } = timelineData;
    if (events.length === 0) {
      throw new Error('Project timeline returned zero events');
    }

    // Verify presence of milestone events and audit logs
    const milestoneEvents = events.filter((e: any) => e.type === 'MILESTONE');
    const lifecycleEvents = events.filter((e: any) => e.type === 'LIFECYCLE_EVENT');

    if (milestoneEvents.length === 0) {
      throw new Error('No milestone events found in timeline');
    }
    if (lifecycleEvents.length === 0) {
      throw new Error('No lifecycle audit events found in timeline');
    }

    // Check chronological order
    for (let i = 0; i < events.length - 1; i++) {
      const t1 = new Date(events[i].timestamp).getTime();
      const t2 = new Date(events[i + 1].timestamp).getTime();
      if (t1 > t2) {
        throw new Error(`Timeline events not sorted chronologically: ${events[i].timestamp} > ${events[i + 1].timestamp}`);
      }
    }

    console.log(`  ✔ Timeline verified with ${events.length} chronological events:`);
    console.log(`    - Milestone milestones count: ${milestoneEvents.length}`);
    console.log(`    - Lifecycle audit events count: ${lifecycleEvents.length}`);
    console.log(`    - Chronological sorting verified: OK`);

    results.timeline = true;

    console.log('\n================================================================');
    console.log('ALL PHASE 10 PROJECT WORKSPACE AUDIT TESTS PASSED');
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

if (process.argv[1]?.endsWith('projectWorkspaceAuditTest.ts')) {
  runProjectWorkspaceAudit()
    .then((results) => {
      console.log('================================================================');
      console.log('AUDIT REPORT OUTPUT');
      console.log('================================================================');
      console.log(`Access control: ${results.accessControl ? 'PASS' : 'FAIL'}`);
      console.log(`Milestones: ${results.milestones ? 'PASS' : 'FAIL'}`);
      console.log(`Files: ${results.files ? 'PASS' : 'FAIL'}`);
      console.log(`Timeline: ${results.timeline ? 'PASS' : 'FAIL'}`);
      console.log('================================================================\n');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ AUDIT FAILED:', err);
      process.exit(1);
    });
}
