/**
 * Phase 3 — Developer Login and Registration Verification Suite
 * 
 * Verifies:
 * 1. Public Developer CTA and registration requirements (Full Name, Username, Email, Phone,
 *    Password, Location, Role Title, Experience, Skills, Programming Languages, Frameworks,
 *    Databases, Cloud Tools, AI/ML, UI/UX, GitHub, LinkedIn, Portfolio, LeetCode, Kaggle, Other Links, Bio).
 * 2. Server-controlled role assignment (strictly DEVELOPER, ignoring browser manipulation).
 * 3. Initial state is PENDING_DEVELOPER_APPROVAL / PENDING.
 * 4. Pending developer access gates:
 *    - Cannot claim project slots (403 Forbidden)
 *    - Cannot post in private developer community (403 Forbidden)
 *    - Excluded from public verified developer directory
 * 5. Pending developer login:
 *    - Successfully authenticates
 *    - Receives verificationStatus: 'PENDING'
 *    - Permitted to view dashboard in pending state
 * 6. Developer support:
 *    - Platform/Account support ticket (no project required)
 *    - Credit/Payment support ticket (no project required)
 *    - Listing tickets strictly scoped to developer's own tickets (no leak of unrelated client tickets)
 * 7. Admin approval lifecycle:
 *    - Admin approves developer (verification_status: 'VERIFIED', user status: 'ACTIVE')
 *    - Verified developer appears in public directory
 *    - Verified developer can post to community and claim open marketplace slots
 * 8. Authorized project support:
 *    - Tripartite support bridge participation (Client <-> Support <-> Developer)
 *    - Authorized developer accesses assigned project support bridge
 *    - Strictly blocked from accessing unrelated project support tickets/bridges (403 Forbidden)
 * 9. Rejected and suspended developer enforcement:
 *    - Rejected developer cannot access verified privileges
 *    - Suspended developer locked out from login and API endpoints (403 ACCOUNT_SUSPENDED)
 */

import { Server } from 'http';
import app from '../server.js';
import { query, pool } from '../database/db.js';
import { ROLES } from '../config/constants.js';

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

async function runTestSuite() {
  console.log('================================================================');
  console.log('PHASE 3: DEVELOPER REGISTRATION, LOGIN & SUPPORT AUDIT SUITE');
  console.log('================================================================\n');

  let server: any = null;
  let baseUrl = '';

  try {
    // 1. Launch ephemeral live test server
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server?.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`[Harness] Test server running at ${baseUrl}`);
        resolve();
      });
    });

    const runId = Date.now().toString().slice(-6);

    // -------------------------------------------------------------------------
    // TEST 1: Developer Registration with All Extended Product Fields
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 1: Developer Registration with Extended Profile Fields ---');

    const devEmail = `dev_${runId}@nexus-testing.dev`;
    const devUsername = `dev_lead_${runId}`;
    const devPassword = 'Password2026!Secure';

    const regPayload = {
      fullName: 'Vikramaditya Sharma',
      username: devUsername,
      email: devEmail,
      phone: '+91 98765 12345',
      password: devPassword,
      role: 'ADMIN', // Malicious attempt to self-grant ADMIN role
      location: 'Hyderabad, India',
      developerRole: 'Lead Full Stack & Distributed Systems Architect',
      experience: '7',
      skills: 'System Design, Microservices, Event Sourcing, High Concurrency',
      programmingLanguages: 'TypeScript, Python, Go, Rust',
      frameworks: 'React, Next.js, Node.js, FastAPI, Gin',
      databases: 'PostgreSQL, Redis, ClickHouse',
      cloud: 'AWS, Kubernetes, Docker, Terraform',
      aiml: 'PyTorch, LangChain, OpenAI APIs',
      uiux: 'Tailwind CSS, Figma, Framer Motion',
      githubUrl: `https://github.com/${devUsername}`,
      linkedinUrl: `https://linkedin.com/in/${devUsername}`,
      portfolioUrl: `https://${devUsername}.tech`,
      leetcodeUrl: `https://leetcode.com/${devUsername}`,
      kaggleUrl: `https://kaggle.com/${devUsername}`,
      otherLinks: 'https://substack.com/@vikram',
      bio: 'Principal distributed systems engineer with 7+ years architecting high-throughput transactional backends and AI-powered platforms.',
      profilePhoto: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    };

    const regRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(regPayload),
    });

    const regData: any = await regRes.json();

    assert(regRes.status === 201, 'Developer registration returns 201 Created');
    assert(regData.status === 'PENDING_DEVELOPER_APPROVAL', 'Initial registration status is PENDING_DEVELOPER_APPROVAL');
    assert(regData.verificationStatus === 'PENDING', 'Verification status is PENDING');
    assert(regData.user?.role === ROLES.DEVELOPER, 'Server strictly controls role as DEVELOPER (ignores role=ADMIN)');
    assert(Boolean(regData.developer?.id), 'Developer ID is generated and returned');

    const devId = regData.developer.id;
    const devUserId = regData.user.id;

    // Verify database record persisted extended fields
    const dbDev = await query('SELECT * FROM developers WHERE id = $1', [devId]);
    assert(dbDev.rows.length === 1, 'Developer record exists in database');
    assert(dbDev.rows[0].verification_status === 'PENDING', 'Database verification_status is PENDING');
    assert(dbDev.rows[0].leetcode_url === regPayload.leetcodeUrl, 'LeetCode URL persisted');
    assert(dbDev.rows[0].kaggle_url === regPayload.kaggleUrl, 'Kaggle URL persisted');
    assert(Array.isArray(dbDev.rows[0].programming_languages) && dbDev.rows[0].programming_languages.includes('TypeScript'), 'Programming languages array persisted');
    assert(Array.isArray(dbDev.rows[0].frameworks) && dbDev.rows[0].frameworks.includes('Next.js'), 'Frameworks array persisted');
    assert(Array.isArray(dbDev.rows[0].databases) && dbDev.rows[0].databases.includes('PostgreSQL'), 'Databases array persisted');

    // Verify notification preferences created
    const notifPrefs = await query('SELECT * FROM notification_preferences WHERE user_id = $1', [devUserId]);
    assert(notifPrefs.rows.length === 1 && notifPrefs.rows[0].project_updates === true, 'Default notification preferences created for developer');

    // -------------------------------------------------------------------------
    // TEST 2: Pending Developer Security & Access Gates
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 2: Pending Developer Security & Capability Gates ---');

    // Setup an open marketplace project
    const projectRes = await query(`
      INSERT INTO projects (
        client_id, project_number, slug, title, description, category,
        budget_min, budget_max, timeline, max_claims,
        status, required_technologies, claim_deadline
      )
      VALUES (
        (SELECT id FROM clients LIMIT 1),
        'PRJ-TEST-GATE-${runId}',
        'prj-test-gate-${runId}',
        'Mission Critical Gateway',
        'High throughput API router in Go and TypeScript',
        'SYSTEMS',
        75000, 100000, '30 Days', 3,
        'OPEN_FOR_CLAIMS',
        '["TypeScript", "Go", "PostgreSQL"]'::jsonb,
        NOW() + INTERVAL '7 days'
      )
      RETURNING id, project_number
    `);
    const testProjectId = projectRes.rows[0].id;

    // Login as pending developer
    const devLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: devEmail, password: devPassword }),
    });
    const devLoginData: any = await devLoginRes.json();

    assert(devLoginRes.status === 200, 'Pending developer can successfully log in');
    assert(devLoginData.user?.verificationStatus === 'PENDING', 'Login response returns verificationStatus: PENDING');
    assert(devLoginData.redirectUrl === '/dashboard', 'Login redirect points to /dashboard');

    const devToken = devLoginData.token;

    // Gate 1: Claiming project slot must be blocked (403 Forbidden)
    const claimRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`,
      },
    });
    assert(claimRes.status === 403, 'Pending developer is strictly blocked from claiming project slots (403)');

    // Gate 2: Posting in private community must be blocked (403 Forbidden)
    const communityRes = await fetch(`${baseUrl}/api/community/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`,
      },
      body: JSON.stringify({
        title: 'Unauthorized Test Post',
        content: 'This post should be rejected because profile is pending verification.',
        category: 'GENERAL',
      }),
    });
    assert(communityRes.status === 403, 'Pending developer is strictly blocked from private community posts (403)');

    // Gate 3: Excluded from public developer directory
    const publicDevsRes = await fetch(`${baseUrl}/api/developers`);
    const publicDevsData: any = await publicDevsRes.json();
    const isListedPublicly = (publicDevsData.developers || []).some((d: any) => d.username === devUsername);
    assert(!isListedPublicly, 'Pending developer is excluded from public verified developer directory');

    // -------------------------------------------------------------------------
    // TEST 3: Developer Support (Platform, Account & Credit Support)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 3: Developer Support Capabilities ---');

    // 1. Developer opens platform/account support ticket
    const devTicket1Res = await fetch(`${baseUrl}/api/support/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`,
      },
      body: JSON.stringify({
        subject: 'Inquiry regarding Developer Verification Timeline',
        description: 'Hello Support Operations, I have submitted my portfolio and would like to know the review timeline.',
        category: 'PLATFORM_ACCOUNT',
        priority: 'NORMAL',
      }),
    });
    const devTicket1Data: any = await devTicket1Res.json();

    assert(devTicket1Res.status === 201, 'Developer can open general platform/account support ticket (201)');
    assert(Boolean(devTicket1Data.ticket?.ticket_number), 'Ticket number generated for developer support');
    assert(devTicket1Data.ticket?.developer_id === devId, 'Support ticket correctly associated with developerId');

    const devTicket1Id = devTicket1Data.ticket.id;

    // 2. Developer opens credit/payment support ticket
    const devTicket2Res = await fetch(`${baseUrl}/api/support/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`,
      },
      body: JSON.stringify({
        subject: 'Credit Wallet Top-up Query',
        description: 'Inquiring about bulk credit pack options once verified.',
        category: 'CREDITS_PAYMENTS',
        priority: 'LOW',
      }),
    });
    const devTicket2Data: any = await devTicket2Res.json();
    assert(devTicket2Res.status === 201, 'Developer can open credit/payment support ticket (201)');

    // 3. Developer lists tickets - must only see their own tickets
    const devTicketsListRes = await fetch(`${baseUrl}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    const devTicketsListData: any = await devTicketsListRes.json();

    assert(devTicketsListRes.status === 200, 'Developer can list their support tickets');
    const allBelongToDev = (devTicketsListData.tickets || []).every(
      (t: any) => t.developer_id === devId || t.assigned_to_user_id === devUserId
    );
    assert(allBelongToDev, 'Developer ticket list is strictly scoped (no leakage of unrelated client tickets)');
    assert(devTicketsListData.tickets.length >= 2, 'Developer sees their 2 opened support tickets');

    // -------------------------------------------------------------------------
    // TEST 4: Admin Approval Lifecycle
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 4: Admin Developer Approval Lifecycle ---');

    // Authenticate as CEO/Admin
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ritesh@nexus.dev', password: 'DevPlatform2026!Secure' }),
    });
    const adminLoginData: any = await adminLoginRes.json();
    const adminToken = adminLoginData.token;

    // Approve developer via Admin API
    const approveRes = await fetch(`${baseUrl}/api/admin/developers/${devId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const approveData: any = await approveRes.json();

    assert(approveRes.status === 200, 'Admin successfully approves developer (200)');
    assert(approveData.developer?.verification_status === 'VERIFIED', 'Developer status updated to VERIFIED');

    // Verify developer now appears in public directory
    const publicDevsAfterRes = await fetch(`${baseUrl}/api/developers`);
    const publicDevsAfterData: any = await publicDevsAfterRes.json();
    const isNowPublic = (publicDevsAfterData.developers || []).some((d: any) => d.id === devId);
    assert(isNowPublic, 'Approved developer now appears in public verified directory');

    // Verify developer can now post to private developer community
    const postRes = await fetch(`${baseUrl}/api/community/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`,
      },
      body: JSON.stringify({
        title: `Technical Architecture Showcase by ${devUsername}`,
        content: 'Sharing my distributed microservice architecture benchmarks with PostgreSQL and Redis.',
        category: 'ARCHITECTURE',
      }),
    });
    assert(postRes.status === 201, 'Approved developer can successfully post in developer community (201)');

    // -------------------------------------------------------------------------
    // TEST 5: Authorized Project Support & Tripartite Bridge
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 5: Authorized Project Support & Tripartite Bridge ---');

    // Top up developer wallet with credits for project claim
    await query('UPDATE credit_accounts SET balance = balance + 10 WHERE developer_id = $1', [devId]);

    // Claim project slot as verified developer
    const devClaimRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`,
      },
    });
    const devClaimData: any = await devClaimRes.json();
    assert(devClaimRes.status === 200, 'Verified developer successfully claims project slot');
    assert(Boolean(devClaimData.anonymousTag), 'Developer receives anonymous tag for claim');

    // Developer creates project support ticket for authorized project
    const devProjTicketRes = await fetch(`${baseUrl}/api/support/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`,
      },
      body: JSON.stringify({
        projectId: testProjectId,
        subject: 'Architecture Milestone Scoping Assistance',
        description: 'Requesting tripartite support bridge alignment on project deliverables.',
        category: 'TECHNICAL',
        priority: 'NORMAL',
      }),
    });
    const devProjTicketData: any = await devProjTicketRes.json();
    assert(devProjTicketRes.status === 201, 'Developer creates project support ticket for claimed project (201)');
    const bridgeId = devProjTicketData.ticket?.bridge_id || devProjTicketData.ticket?.bridgeId;
    assert(Boolean(bridgeId), 'Support bridge automatically created for project support');

    const projTicketId = devProjTicketData.ticket.id;

    // Developer can access their authorized project ticket
    const viewProjTicketRes = await fetch(`${baseUrl}/api/support/tickets/${projTicketId}`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert(viewProjTicketRes.status === 200, 'Developer can access their authorized project support ticket (200)');

    // Developer can access the support bridge
    const viewBridgeRes = await fetch(`${baseUrl}/api/support/bridges/${bridgeId}`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert(viewBridgeRes.status === 200, 'Developer can access their authorized tripartite support bridge (200)');

    // Security Gate: Developer CANNOT create ticket on another client's project where they have not claimed
    const foreignProjectRes = await query(`
      INSERT INTO projects (
        client_id, project_number, slug, title, description, category,
        budget_min, budget_max, timeline, max_claims,
        status, claim_deadline
      )
      VALUES (
        (SELECT id FROM clients LIMIT 1),
        'PRJ-FOREIGN-${runId}',
        'prj-foreign-${runId}',
        'Foreign Client Project',
        'Confidential system',
        'FINTECH',
        100000, 150000, '45 Days', 3,
        'OPEN_FOR_CLAIMS',
        NOW() + INTERVAL '7 days'
      )
      RETURNING id
    `);
    const foreignProjId = foreignProjectRes.rows[0].id;

    const unauthTicketRes = await fetch(`${baseUrl}/api/support/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`,
      },
      body: JSON.stringify({
        projectId: foreignProjId,
        subject: 'Unauthorized Intrusion Attempt',
        description: 'Attempting to open support ticket on unclaimed project.',
        category: 'TECHNICAL',
      }),
    });
    assert(unauthTicketRes.status === 403, 'Developer is strictly blocked (403) from creating support tickets on unclaimed projects');

    // -------------------------------------------------------------------------
    // TEST 6: Rejected and Suspended Developer Enforcement
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 6: Rejected & Suspended Developer Enforcement ---');

    // 1. Create a second developer for rejection test
    const dev2Email = `dev_rejected_${runId}@nexus-testing.dev`;
    const dev2Username = `dev_rej_${runId}`;
    const dev2Password = 'Dev2Secret2026!';

    const reg2Res = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Candidate Two',
        username: dev2Username,
        email: dev2Email,
        password: dev2Password,
        roleTitle: 'Junior Developer',
        location: 'Mumbai, India',
        experience: '1',
      }),
    });
    const reg2Data: any = await reg2Res.json();
    const dev2Id = reg2Data.developer.id;

    // Admin rejects candidate two
    const rejectRes = await fetch(`${baseUrl}/api/admin/developers/${dev2Id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const rejectData: any = await rejectRes.json();
    assert(rejectRes.status === 200, 'Admin successfully rejects developer application (200)');
    assert(rejectData.developer?.verification_status === 'REJECTED', 'Developer status is REJECTED');

    // Login as rejected developer
    const dev2LoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: dev2Email, password: dev2Password }),
    });
    const dev2LoginData: any = await dev2LoginRes.json();
    assert(dev2LoginData.user?.verificationStatus === 'REJECTED', 'Rejected developer login reflects status: REJECTED');

    // Rejected developer cannot claim projects
    const rejClaimRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev2LoginData.token}`,
      },
    });
    assert(rejClaimRes.status === 403, 'Rejected developer cannot claim project slots (403)');

    // 2. Suspend Developer One
    const suspendRes = await fetch(`${baseUrl}/api/admin/developers/${devId}/suspend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    });
    assert(suspendRes.status === 200, 'Admin successfully suspends developer (200)');

    // Suspended developer is locked out from login
    const suspendedLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: devEmail, password: devPassword }),
    });
    const suspendedLoginData: any = await suspendedLoginRes.json();

    assert(suspendedLoginRes.status === 403, 'Suspended developer login is blocked with 403');
    assert(suspendedLoginData.code === 'ACCOUNT_SUSPENDED', 'Error code ACCOUNT_SUSPENDED returned');

    // Suspended developer's existing token is blocked from APIs
    const suspendedApiRes = await fetch(`${baseUrl}/api/projects/my-projects`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    // Either 403 Forbidden due to suspended user or verification
    assert(suspendedApiRes.status === 403 || suspendedApiRes.status === 401, 'Suspended developer API calls are blocked (403/401)');

    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    await query('DELETE FROM messages WHERE conversation_id IN (SELECT conversation_id FROM support_bridges WHERE ticket_id = $1)', [projTicketId]);
    await query('DELETE FROM conversation_members WHERE conversation_id IN (SELECT conversation_id FROM support_bridges WHERE ticket_id = $1)', [projTicketId]);
    await query('DELETE FROM support_bridge_members WHERE bridge_id IN (SELECT id FROM support_bridges WHERE ticket_id = $1)', [projTicketId]);
    await query('DELETE FROM support_bridges WHERE ticket_id = $1', [projTicketId]);
    await query('DELETE FROM conversations WHERE id IN (SELECT conversation_id FROM support_bridges WHERE ticket_id = $1)', [projTicketId]);
    await query('DELETE FROM support_tickets WHERE id IN ($1, $2, $3)', [devTicket1Id, devTicket2Data.ticket.id, projTicketId]);
    await query('DELETE FROM project_claims WHERE project_id = $1', [testProjectId]);
    await query('DELETE FROM projects WHERE id IN ($1, $2)', [testProjectId, foreignProjId]);
    await query('DELETE FROM community_posts WHERE author_developer_id = $1', [devId]);
    await query('DELETE FROM developers WHERE id IN ($1, $2)', [devId, dev2Id]);
    await query('DELETE FROM users WHERE id IN ($1, $2)', [devUserId, reg2Data.user.id]);

  } catch (err: any) {
    console.error('\n[FATAL ERROR IN TEST SUITE]:', err);
    assert(false, 'Test suite execution error', err.message);
  } finally {
    if (server) {
      server.close();
    }
    await pool.end();
  }

  // -------------------------------------------------------------------------
  // FINAL REPORT
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('AUDIT SUMMARY — PHASE 3: DEVELOPER LOGIN AND REGISTRATION');
  console.log('================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`Total Checks: ${results.length} | Passed: ${passedCount} | Failed: ${failedCount}`);

  if (failedCount > 0) {
    console.error('\nFAILED CHECKS:');
    results.filter((r) => !r.passed).forEach((r) => console.error(`  - ${r.name}: ${r.details}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL PHASE 3 ACCEPTANCE CHECKS PASSED PERFECTLY!\n');
    process.exit(0);
  }
}

runTestSuite();
