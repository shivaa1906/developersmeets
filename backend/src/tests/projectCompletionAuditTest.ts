import app from '../server.js';
import { query } from '../database/db.js';
import { env } from '../config/environment.js';
import { ROLES } from '../config/constants.js';
import jwt from 'jsonwebtoken';
import { Server } from 'http';
import bcrypt from 'bcryptjs';

interface AuditResults {
  completion: boolean;
  publication: boolean;
  attribution: boolean;
  privacy: boolean;
}

export async function runProjectCompletionAudit(): Promise<AuditResults> {
  console.log('================================================================');
  console.log('PHASE 11: PROJECT COMPLETION & ATTRIBUTION AUDIT');
  console.log('================================================================\n');

  let server: Server | null = null;
  let baseUrl = '';

  const results: AuditResults = {
    completion: false,
    publication: false,
    attribution: false,
    privacy: false,
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
         VALUES ('client001.completion@nexus.test', $1, 'CLIENT', 'ACTIVE')
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

    // 2. Provision Developer #01 (e.g. Ritesh Lingamallu)
    const devUsername = `ritesh-lingamallu-${runId}`;
    const devName = 'Ritesh Lingamallu';
    const devEmail = `${devUsername}@nexus.dev`;
    const uDev = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'DEVELOPER', 'ACTIVE')
       RETURNING id`,
      [devEmail, passwordHash]
    );
    const dev1UserId = uDev.rows[0].id;

    const dDev = await query(
      `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status, verified_at, bio)
       VALUES ($1, $2, $3, 'Lead Systems Architect', 9, 'VERIFIED', NOW(), 'Enterprise systems & AI infrastructure architect.')
       RETURNING id`,
      [dev1UserId, devUsername, devName]
    );
    const dev1Id = dDev.rows[0].id;

    const tokenDev1 = jwt.sign(
      { userId: dev1UserId, role: ROLES.DEVELOPER, developerId: dev1Id },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // 3. Setup Project #0001 (PRJ-2026-0001)
    const pSlug = `ai-ecommerce-engine-${runId}`;
    const pNumber = `PRJ-2026-COMP-${runId}`;
    const pRes = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline, requirements, required_technologies,
         attachments, status, claim_cost, max_claims, claim_deadline, client_id, lead_developer_id
       ) VALUES (
         $1, $2, 'Autonomous AI E-Commerce Engine',
         'A scalable distributed commerce engine with real-time vector search and multi-tenant ledger.',
         'AI/ML', 50000, 80000, '45 Days',
         '["Vector Search", "Realtime Inventory", "Multi-tenant Ledger"]'::jsonb,
         '["Next.js 14", "Python", "PostgreSQL", "FastAPI", "Redis", "Docker"]'::jsonb,
         '[{"name": "Architecture Overview", "url": "https://storage.nexusplatform.io/shots/arch.png"}]'::jsonb,
         'IN_PROGRESS', 1, 3, NOW() + INTERVAL '10 days', $3, $4
       ) RETURNING id`,
      [pNumber, pSlug, client1Id, dev1Id]
    );
    const projectId = pRes.rows[0].id;

    // Add Developer #01 as LEAD in project_members
    await query(
      `INSERT INTO project_members (project_id, developer_id, role)
       VALUES ($1, $2, 'LEAD')
       ON CONFLICT (project_id, developer_id) DO UPDATE SET role = 'LEAD'`,
      [projectId, dev1Id]
    );

    // Create 3 project milestones
    await query(
      `INSERT INTO project_milestones (project_id, title, description, status, order_index)
       VALUES ($1, 'Architecture & Schema', 'Database schema & core services', 'APPROVED', 1) RETURNING id`,
      [projectId]
    );
    await query(
      `INSERT INTO project_milestones (project_id, title, description, status, order_index)
       VALUES ($1, 'Core Engine & Search', 'Vector search microservice', 'APPROVED', 2)`,
      [projectId]
    );
    await query(
      `INSERT INTO project_milestones (project_id, title, description, status, order_index)
       VALUES ($1, 'Final Integration & Hardening', 'E2E testing and performance benchmark', 'SUBMITTED', 3)`,
      [projectId]
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 1: PRE-COMPLETION PRIVACY AUDIT
    // -------------------------------------------------------------------------
    console.log('[Test 1] Auditing Pre-Completion Privacy Guard...');
    // While project is IN_PROGRESS, public endpoint must NOT return or index the project
    const prePubRes = await fetch(`${baseUrl}/api/projects/public/${pSlug}`);
    if (prePubRes.status !== 404) {
      throw new Error(`Pre-completion project should return 404 on public route, got ${prePubRes.status}`);
    }
    console.log('  ✔ Pre-completion project is NOT indexed or accessible on public showcase (404 Not Found)');

    // -------------------------------------------------------------------------
    // TEST SECTION 2: SUBMIT FOR REVIEW
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Developer submits project for completion review (SUBMITTED_FOR_REVIEW)...');
    const submitReviewRes = await fetch(`${baseUrl}/api/projects/${projectId}/submit-for-review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDev1}`,
      },
      body: JSON.stringify({ notes: 'All 3 delivery milestones implemented and benchmarked.' }),
    });

    const submitReviewData = (await submitReviewRes.json()) as any;
    if (submitReviewRes.status !== 200 || submitReviewData.status !== 'SUBMITTED_FOR_REVIEW') {
      throw new Error(`Failed to submit project for review: ${JSON.stringify(submitReviewData)}`);
    }

    const checkP1 = await query('SELECT status FROM projects WHERE id = $1', [projectId]);
    if (checkP1.rows[0].status !== 'SUBMITTED_FOR_REVIEW') {
      throw new Error(`Expected project status SUBMITTED_FOR_REVIEW, got ${checkP1.rows[0].status}`);
    }
    console.log('  ✔ Project status transitioned to: SUBMITTED_FOR_REVIEW');

    // -------------------------------------------------------------------------
    // TEST SECTION 3: CLIENT CHANGE REQUEST
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Client requests adjustments during completion review...');
    const changeReqRes = await fetch(`${baseUrl}/api/projects/${projectId}/request-changes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenClient1}`,
      },
      body: JSON.stringify({ feedback: 'Please verify load testing with 500 concurrent vector queries.' }),
    });

    const changeReqData = (await changeReqRes.json()) as any;
    if (changeReqRes.status !== 200 || changeReqData.status !== 'IN_PROGRESS') {
      throw new Error(`Failed to request changes: ${JSON.stringify(changeReqData)}`);
    }

    const checkP2 = await query('SELECT status FROM projects WHERE id = $1', [projectId]);
    if (checkP2.rows[0].status !== 'IN_PROGRESS') {
      throw new Error(`Expected project status IN_PROGRESS after change request, got ${checkP2.rows[0].status}`);
    }
    console.log('  ✔ Project status safely reverted to: IN_PROGRESS');

    // Developer addresses feedback and resubmits
    const resubmitRes = await fetch(`${baseUrl}/api/projects/${projectId}/submit-for-review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDev1}`,
      },
      body: JSON.stringify({ notes: '500 concurrent query load tests passed with p99 < 42ms.' }),
    });
    if (resubmitRes.status !== 200) {
      throw new Error('Failed to resubmit project for review');
    }
    console.log('  ✔ Developer addressed adjustments and resubmitted (SUBMITTED_FOR_REVIEW)');

    // -------------------------------------------------------------------------
    // TEST SECTION 4: CLIENT APPROVE COMPLETION
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Client approves completion (COMPLETED)...');
    const approveCompRes = await fetch(`${baseUrl}/api/projects/${projectId}/approve-completion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenClient1}`,
      },
      body: JSON.stringify({ feedback: 'Outstanding execution. All specs delivered.', rating: 5 }),
    });

    const approveCompData = (await approveCompRes.json()) as any;
    if (approveCompRes.status !== 200 || approveCompData.status !== 'COMPLETED') {
      throw new Error(`Failed to approve completion: ${JSON.stringify(approveCompData)}`);
    }

    const checkP3 = await query('SELECT status FROM projects WHERE id = $1', [projectId]);
    if (checkP3.rows[0].status !== 'COMPLETED') {
      throw new Error(`Expected project status COMPLETED, got ${checkP3.rows[0].status}`);
    }

    // Verify all milestones are marked COMPLETED
    const msStatusCheck = await query('SELECT status FROM project_milestones WHERE project_id = $1', [projectId]);
    for (const m of msStatusCheck.rows) {
      if (m.status !== 'COMPLETED') {
        throw new Error(`Expected milestone status COMPLETED, got ${m.status}`);
      }
    }
    console.log('  ✔ Client sign-off verified: Status = COMPLETED');
    console.log('  ✔ All project milestones marked: COMPLETED');

    results.completion = true;

    // -------------------------------------------------------------------------
    // TEST SECTION 5: PUBLICATION & PUBLIC PROJECT PAGE ACCESSIBILITY
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Publishing project to showcase (PUBLISHED)...');
    const pubRes = await fetch(`${baseUrl}/api/projects/${projectId}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenClient1}`,
      },
    });

    const pubData = (await pubRes.json()) as any;
    if (pubRes.status !== 200 || pubData.status !== 'PUBLISHED') {
      throw new Error(`Failed to publish project: ${JSON.stringify(pubData)}`);
    }

    const checkP4 = await query('SELECT status FROM projects WHERE id = $1', [projectId]);
    if (checkP4.rows[0].status !== 'PUBLISHED') {
      throw new Error(`Expected project status PUBLISHED, got ${checkP4.rows[0].status}`);
    }
    console.log('  ✔ Project status transitioned to: PUBLISHED');

    // Access public project page
    const publicPageRes = await fetch(`${baseUrl}/api/projects/public/${pSlug}`);
    const publicPageData = (await publicPageRes.json()) as any;

    if (publicPageRes.status !== 200 || !publicPageData.project) {
      throw new Error(`Public project page should be accessible after publication, got ${publicPageRes.status}`);
    }

    const pubProj = publicPageData.project;
    console.log('  ✔ Public project page is live and accessible');
    console.log('    - Title:', pubProj.title);
    console.log('    - Description:', pubProj.description);
    console.log('    - Status:', pubProj.status);
    console.log('    - Technology:', pubProj.technology);
    console.log('    - Screenshots count:', pubProj.screenshots.length);
    console.log('    - Attribution:', pubProj.attribution);
    console.log('    - Developer Link:', pubProj.developerLink);

    if (!pubProj.title || !pubProj.description || !pubProj.technology || !pubProj.status) {
      throw new Error('Public project missing core fields');
    }
    if (pubProj.status !== 'PUBLISHED') {
      throw new Error(`Expected status PUBLISHED, got ${pubProj.status}`);
    }

    results.publication = true;

    // -------------------------------------------------------------------------
    // TEST SECTION 6: DEVELOPER ATTRIBUTION & PORTFOLIO INTEGRATION
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Verifying Developer Attribution and Portfolio Showcase...');
    if (pubProj.attribution !== `Built by ${devName}`) {
      throw new Error(`Expected attribution "Built by ${devName}", got "${pubProj.attribution}"`);
    }
    if (pubProj.developerLink !== `/developers/${devUsername}`) {
      throw new Error(`Expected developer link "/developers/${devUsername}", got "${pubProj.developerLink}"`);
    }
    console.log(`  ✔ Verified Attribution Banner: "${pubProj.attribution}"`);
    console.log(`  ✔ Verified Developer Profile Link: "${pubProj.developerLink}"`);

    // Fetch Developer Public Profile to ensure project appears in portfolio
    const devProfileRes = await fetch(`${baseUrl}/api/developers/${devUsername}`);
    const devProfileData = (await devProfileRes.json()) as any;

    if (devProfileRes.status !== 200 || !devProfileData.developer) {
      throw new Error(`Failed to load developer public profile for ${devUsername}`);
    }

    const { developer } = devProfileData;
    const portfolioProjects = developer.attributedProjects || [];
    const foundProject = portfolioProjects.find((p: any) => p.id === projectId || p.slug === pSlug);

    if (!foundProject) {
      throw new Error(`Published project "${pSlug}" did not appear in developer portfolio attributedProjects`);
    }

    console.log(`  ✔ Developer public portfolio successfully displays project "${foundProject.title}" (Role: ${foundProject.project_role})`);

    results.attribution = true;

    // -------------------------------------------------------------------------
    // TEST SECTION 7: CLIENT PRIVACY SANITIZATION
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Auditing Client Privacy Protection in Public Response...');

    // Public response must NEVER reveal:
    // client real name, client email, client phone, private messages, private files
    const stringifiedPub = JSON.stringify(pubProj).toLowerCase();

    if (stringifiedPub.includes('sunil mehta')) {
      throw new Error('PRIVACY VIOLATION: Client real name leaked in public project response!');
    }
    if (stringifiedPub.includes('client001.completion@nexus.test')) {
      throw new Error('PRIVACY VIOLATION: Client email leaked in public project response!');
    }
    if (stringifiedPub.includes('9876543210')) {
      throw new Error('PRIVACY VIOLATION: Client phone number leaked in public project response!');
    }
    if (pubProj.messages || pubProj.privateMessages) {
      throw new Error('PRIVACY VIOLATION: Private project messages leaked in public response!');
    }
    if (pubProj.privateFiles) {
      throw new Error('PRIVACY VIOLATION: Private project files leaked in public response!');
    }

    console.log('  ✔ Client real name ("Sunil Mehta"): SHIELDED');
    console.log('  ✔ Client email ("client001.completion@nexus.test"): SHIELDED');
    console.log('  ✔ Client phone ("+91 9876543210"): SHIELDED');
    console.log('  ✔ Private chat messages: STRICTLY PROTECTED');
    console.log('  ✔ Private project files: STRICTLY PROTECTED');

    results.privacy = true;

    console.log('\n================================================================');
    console.log('ALL PHASE 11 PROJECT COMPLETION & ATTRIBUTION AUDIT TESTS PASSED');
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

if (process.argv[1]?.endsWith('projectCompletionAuditTest.ts')) {
  runProjectCompletionAudit()
    .then((results) => {
      console.log('================================================================');
      console.log('AUDIT REPORT OUTPUT');
      console.log('================================================================');
      console.log(`Completion: ${results.completion ? 'PASS' : 'FAIL'}`);
      console.log(`Publication: ${results.publication ? 'PASS' : 'FAIL'}`);
      console.log(`Attribution: ${results.attribution ? 'PASS' : 'FAIL'}`);
      console.log(`Privacy: ${results.privacy ? 'PASS' : 'FAIL'}`);
      console.log('================================================================\n');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ AUDIT FAILED:', err);
      process.exit(1);
    });
}
