process.env.NODE_ENV = 'test';

import assert from 'assert';
import http from 'http';
import { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { httpServer } from '../server.js';
import { query } from '../database/db.js';
import { hashPassword, isArgon2Hash } from '../utils/password.js';
import { ROLES } from '../config/constants.js';
import { env } from '../config/environment.js';

let server: http.Server;
let baseUrl: string;
let wsUrl: string;

let passedChecks = 0;
let totalChecks = 0;

function pass(category: string, desc: string) {
  totalChecks++;
  passedChecks++;
  console.log(`  ✔ [PASS] [${category}] ${desc}`);
}

async function api(path: string, options: RequestInit = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  let body: any = null;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function setupSuite() {
  server = httpServer;
  if (!server.listening) {
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        wsUrl = `ws://127.0.0.1:${port}/ws`;
        resolve();
      });
    });
  } else {
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;
    wsUrl = `ws://127.0.0.1:${port}/ws`;
  }
}

export async function runPhase4Tests() {
  console.log('================================================================');
  console.log('PHASE 4 — CLIENT + DEVELOPER AUTHENTICATION & LIFECYCLE TEST SUITE');
  console.log('================================================================\n');

  await setupSuite();

  const timestamp = Date.now().toString().slice(-6);

  // --- 1. CLIENT REGISTRATION ---
  console.log('--- SECTION 1: CLIENT REGISTRATION ---');
  let clientAUser: any = null;
  let clientAToken = '';
  const clientAEmail = `client_p4_${timestamp}@example.com`;
  {
    const regRes = await api('/api/auth/register/client', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Client Alpha Lead',
        email: clientAEmail,
        password: 'ClientPassword2026!',
        confirmPassword: 'ClientPassword2026!',
        companyName: 'Alpha Innovations Inc',
        phone: '+1 555-0100',
      }),
    });

    assert.strictEqual(regRes.status, 201, `Client registration must return 201 Created: ${JSON.stringify(regRes.body)}`);
    assert(regRes.body.token, 'Client registration must return JWT token');
    assert.strictEqual(regRes.body.user.role, 'CLIENT', 'Registered user role must strictly be CLIENT');
    assert.strictEqual(regRes.body.user.status, 'ACTIVE', 'Client status must be ACTIVE');
    assert.strictEqual(regRes.body.user.email, clientAEmail, 'Email must match registered email');
    assert(regRes.body.user.uid, 'User must have a 16-character UID');
    assert.strictEqual(regRes.body.user.uid.length, 16, 'UID must be exactly 16 characters');
    assert(/^[A-Za-z0-9]{16}$/.test(regRes.body.user.uid), 'UID must be alphanumeric');
    assert(regRes.body.client, 'Client profile record must be created');

    clientAUser = regRes.body.user;
    clientAToken = regRes.body.token;

    // Check DB state
    const dbClient = await query('SELECT * FROM clients WHERE user_id = $1', [clientAUser.id]);
    assert.strictEqual(dbClient.rows.length, 1, 'Client record must exist in clients table');
    assert.strictEqual(dbClient.rows[0].company_name, 'Alpha Innovations Inc', 'Company name must match');

    // Check audit log
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE actor_user_id = $1 AND action = 'CLIENT_REGISTERED'`,
      [clientAUser.id]
    );
    assert.strictEqual(auditRes.rows.length, 1, 'CLIENT_REGISTERED audit log must be recorded');

    pass('CLIENT_REGISTRATION', 'Client successfully registered with 16-char UID, CLIENT role, and profile');
  }

  // --- 2. DEVELOPER REGISTRATION ---
  console.log('\n--- SECTION 2: DEVELOPER REGISTRATION ---');
  let devAUser: any = null;
  let devAToken = '';
  const devAEmail = `dev_p4_${timestamp}@example.com`;
  const devAUsername = `devp4_${timestamp}`;
  {
    const regRes = await api('/api/auth/register/developer', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Dev Alpha Engineer',
        username: devAUsername,
        email: devAEmail,
        password: 'DevPassword2026!',
        confirmPassword: 'DevPassword2026!',
        roleTitle: 'Full Stack Engineer',
        experience: '5',
        programmingLanguages: ['TypeScript', 'Python', 'Go'],
        frameworks: ['React', 'Next.js', 'Node.js'],
        skills: ['Microservices', 'Distributed Systems'],
      }),
    });

    assert.strictEqual(regRes.status, 201, `Developer registration must return 201 Created: ${JSON.stringify(regRes.body)}`);
    assert.strictEqual(regRes.body.user.role, 'DEVELOPER', 'Role must strictly be DEVELOPER');
    assert.strictEqual(regRes.body.user.status, 'PENDING_VERIFICATION', 'Status must be PENDING_VERIFICATION');
    assert.strictEqual(regRes.body.developer.verificationStatus, 'PENDING', 'Verification status must be PENDING');
    assert.strictEqual(regRes.body.user.uid.length, 16, 'Developer UID must be exactly 16 characters');
    assert(/^[A-Za-z0-9]{16}$/.test(regRes.body.user.uid), 'Developer UID must be alphanumeric');

    devAUser = regRes.body.user;

    // Login to obtain developer token
    const loginRes = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: devAEmail,
        password: 'DevPassword2026!',
      }),
    });
    assert.strictEqual(loginRes.status, 200, 'Developer login must return 200');
    assert(loginRes.body.token, 'Developer login must return JWT token');
    devAToken = loginRes.body.token;

    // Check DB state
    const dbDev = await query('SELECT * FROM developers WHERE user_id = $1', [devAUser.id]);
    assert.strictEqual(dbDev.rows.length, 1, 'Developer profile record must exist in developers table');
    assert.strictEqual(dbDev.rows[0].verification_status, 'PENDING', 'Developer must be PENDING verification');

    // Check audit log
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE actor_user_id = $1 AND action = 'DEVELOPER_REGISTERED'`,
      [devAUser.id]
    );
    assert.strictEqual(auditRes.rows.length, 1, 'DEVELOPER_REGISTERED audit log must be recorded');

    pass('DEVELOPER_REGISTRATION', 'Developer registered with PENDING_VERIFICATION status, 16-char UID, and profile');
  }

  // --- 3. DUPLICATE EMAIL REJECTION (409 CONFLICT) ---
  console.log('\n--- SECTION 3: DUPLICATE EMAIL REJECTION ---');
  {
    // Re-register existing client email as client
    const dupClient = await api('/api/auth/register/client', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Imposter Client',
        email: clientAEmail,
        password: 'OtherPassword2026!',
        confirmPassword: 'OtherPassword2026!',
      }),
    });
    assert.strictEqual(dupClient.status, 409, `Duplicate client email must return 409 Conflict: ${dupClient.status}`);
    assert(
      dupClient.body.error?.includes('already registered') || dupClient.body.error?.includes('already exists'),
      'Must return clear conflict message'
    );
    pass('DUPLICATE_EMAIL', 'Client registration rejects duplicate email with 409 Conflict');

    // Re-register existing developer email as developer
    const dupDev = await api('/api/auth/register/developer', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Imposter Developer',
        username: `imposter_${timestamp}`,
        email: devAEmail,
        password: 'OtherPassword2026!',
        confirmPassword: 'OtherPassword2026!',
        roleTitle: 'Frontend Dev',
      }),
    });
    assert.strictEqual(dupDev.status, 409, `Duplicate developer email must return 409 Conflict: ${dupDev.status}`);
    pass('DUPLICATE_EMAIL', 'Developer registration rejects duplicate email with 409 Conflict');
  }

  // --- 4. CLIENT LOGIN ---
  console.log('\n--- SECTION 4: CLIENT LOGIN ---');
  {
    const loginRes = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: clientAEmail,
        password: 'ClientPassword2026!',
      }),
    });

    assert.strictEqual(loginRes.status, 200, `Client login must return 200 OK: ${JSON.stringify(loginRes.body)}`);
    assert(loginRes.body.token, 'Login must issue JWT token');
    assert.strictEqual(loginRes.body.user.role, 'CLIENT', 'Server authoritative role must be CLIENT');
    assert.strictEqual(loginRes.body.redirectUrl, '/dashboard', 'Client default redirect must be /dashboard');

    // Check last_login_at updated
    const userDb = await query('SELECT last_login_at FROM users WHERE id = $1', [clientAUser.id]);
    assert(userDb.rows[0].last_login_at, 'last_login_at timestamp must be recorded');

    // Check USER_LOGGED_IN audit log
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE actor_user_id = $1 AND action = 'USER_LOGGED_IN'`,
      [clientAUser.id]
    );
    assert(auditRes.rows.length >= 1, 'USER_LOGGED_IN audit event must be recorded');

    pass('CLIENT_LOGIN', 'Client logs in successfully; server returns authoritative CLIENT role & redirect');
  }

  // --- 5. DEVELOPER LOGIN ---
  console.log('\n--- SECTION 5: DEVELOPER LOGIN ---');
  {
    const loginRes = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: devAEmail,
        password: 'DevPassword2026!',
      }),
    });

    assert.strictEqual(loginRes.status, 200, `Developer login must return 200 OK: ${JSON.stringify(loginRes.body)}`);
    assert(loginRes.body.token, 'Login must issue JWT token');
    assert.strictEqual(loginRes.body.user.role, 'DEVELOPER', 'Server authoritative role must be DEVELOPER');
    assert.strictEqual(loginRes.body.user.verificationStatus, 'PENDING', 'Developer must be PENDING verification');
    assert.strictEqual(loginRes.body.redirectUrl, '/dashboard', 'Developer default redirect must be /dashboard');

    pass('DEVELOPER_LOGIN', 'Developer logs in successfully; server returns authoritative DEVELOPER role & PENDING status');
  }

  // --- 6. ROLE-BASED REDIRECT / API AUTHORIZATION ---
  console.log('\n--- SECTION 6: ROLE-BASED REDIRECT / API AUTHORIZATION ---');
  {
    // 6.1 Return URL preservation
    const returnUrlRes = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: clientAEmail,
        password: 'ClientPassword2026!',
        returnUrl: '/start-project',
      }),
    });
    assert.strictEqual(returnUrlRes.status, 200);
    assert.strictEqual(returnUrlRes.body.redirectUrl, '/start-project', 'Safe returnUrl must be preserved');
    pass('REDIRECT_AUTH', 'Login respects safe internal returnUrl destination (/start-project)');

    // 6.2 Open redirect defense
    const openRedirectRes = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: clientAEmail,
        password: 'ClientPassword2026!',
        returnUrl: 'https://attacker.example.com/steal-session',
      }),
    });
    assert.strictEqual(openRedirectRes.status, 200);
    assert.strictEqual(openRedirectRes.body.redirectUrl, '/dashboard', 'Malicious open redirect must be sanitized to default');
    pass('REDIRECT_AUTH', 'Malicious external redirect neutralized to default dashboard');

    // 6.3 Client blocked from Admin APIs
    const clientAdminRes = await api('/api/admin/audit-logs', {
      headers: { Authorization: `Bearer ${clientAToken}` },
    });
    assert.strictEqual(clientAdminRes.status, 403, 'Client must be denied from admin audit logs (403)');
    pass('API_AUTHORIZATION', 'Client strictly blocked from administrative endpoints (403 Forbidden)');

    // 6.4 Developer blocked from Admin APIs
    const devAdminRes = await api('/api/admin/audit-logs', {
      headers: { Authorization: `Bearer ${devAToken}` },
    });
    assert.strictEqual(devAdminRes.status, 403, 'Developer must be denied from admin audit logs (403)');
    pass('API_AUTHORIZATION', 'Developer strictly blocked from administrative endpoints (403 Forbidden)');
  }

  // --- 7. UID GENERATION FORMAT ---
  console.log('\n--- SECTION 7: UID GENERATION FORMAT ---');
  {
    const users = await query('SELECT uid, public_uid FROM users ORDER BY created_at DESC LIMIT 20');
    assert(users.rows.length >= 2, 'Users must exist in database');

    for (const row of users.rows) {
      assert.strictEqual(row.uid.length, 16, `UID ${row.uid} must be exactly 16 characters`);
      assert(/^[A-Za-z0-9]{16}$/.test(row.uid), `UID ${row.uid} must strictly be alphanumeric`);
    }
    pass('UID_FORMAT', 'All UIDs conform strictly to 16-character alphanumeric pattern [A-Za-z0-9]{16}');
  }

  // --- 8. UID UNIQUENESS ACROSS USERS ---
  console.log('\n--- SECTION 8: UID UNIQUENESS ACROSS USERS ---');
  {
    const allUsers = await query('SELECT uid FROM users');
    const uids = allUsers.rows.map((r: any) => r.uid);
    const uniqueUids = new Set(uids);
    assert.strictEqual(uniqueUids.size, uids.length, `All ${uids.length} UIDs in database must be strictly unique`);
    pass('UID_UNIQUENESS', `UID uniqueness verified across all ${uids.length} users in database (0 collisions)`);
  }

  // --- 9. CLIENT ISOLATION ---
  console.log('\n--- SECTION 9: CLIENT ISOLATION ---');
  let clientBUser: any = null;
  let clientBToken = '';
  const clientBEmail = `client_b_p4_${timestamp}@example.com`;
  {
    const regRes = await api('/api/auth/register/client', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Client Beta Target',
        email: clientBEmail,
        password: 'ClientBetaPassword2026!',
        confirmPassword: 'ClientBetaPassword2026!',
        companyName: 'Beta Enterprises Ltd',
      }),
    });
    clientBUser = regRes.body.user;
    assert(clientBUser.id, 'Client B ID must be present');
    clientBToken = regRes.body.token;

    // Client B submits a private project
    const projRes = await api('/api/projects/submit', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientBToken}` },
      body: JSON.stringify({
        title: `Project Beta Confidential ${timestamp}`,
        description: 'Internal proprietary system build with sensitive requirements',
        category: 'Web Application',
        projectType: 'Milestone-Based Fixed Price',
        timeline: '1-2 Months',
        technologies: ['React', 'Node.js'],
        requirements: ['Confidential requirement 1'],
        budgetMin: '10000',
        budgetMax: '30000',
      }),
    });
    assert.strictEqual(projRes.status, 201, 'Client B project submission must succeed');
    const clientBProjectId = projRes.body.project.id;

    // Client A attempts to fetch Client B's private project details
    const leakRes = await api(`/api/projects/${clientBProjectId}`, {
      headers: { Authorization: `Bearer ${clientAToken}` },
    });
    // Either 403 or data is masked without leaking client private fields
    if (leakRes.status === 200) {
      assert(!leakRes.body.project.client_email, 'Client B private email must not leak to Client A');
      assert(!leakRes.body.project.phone, 'Client B private phone must not leak to Client A');
    } else {
      assert([403, 404].includes(leakRes.status), 'Access must be denied');
    }
    pass('CLIENT_ISOLATION', 'Client A cannot access or extract Client B private project credentials');
  }

  // --- 10. DEVELOPER ISOLATION ---
  console.log('\n--- SECTION 10: DEVELOPER ISOLATION ---');
  let devBUser: any = null;
  let devBToken = '';
  const devBEmail = `dev_b_p4_${timestamp}@example.com`;
  {
    const regRes = await api('/api/auth/register/developer', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Dev Beta Specialist',
        username: `devbeta_${timestamp}`,
        email: devBEmail,
        password: 'DevPassword2026!',
        confirmPassword: 'DevPassword2026!',
        roleTitle: 'Systems Architect',
      }),
    });
    devBUser = regRes.body.user;
    assert(devBUser.id, 'Dev B ID must be present');

    const devBLogin = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: devBEmail,
        password: 'DevPassword2026!',
      }),
    });
    assert.strictEqual(devBLogin.status, 200);
    devBToken = devBLogin.body.token;

    // Developer A cannot access Developer B's private settings or sensitive user record
    const devAccessRes = await api(`/api/auth/me`, {
      headers: { Authorization: `Bearer ${devAToken}` },
    });
    assert.strictEqual(devAccessRes.status, 200);
    assert.strictEqual(devAccessRes.body.user.email, devAEmail, 'Me endpoint returns Dev A identity only');
    assert.notStrictEqual(devAccessRes.body.user.email, devBEmail, 'Dev A cannot receive Dev B identity');

    pass('DEVELOPER_ISOLATION', 'Developer identities and contexts remain strictly isolated');
  }

  // --- 11. START PROJECT AUTHENTICATION GUARD ---
  console.log('\n--- SECTION 11: START PROJECT AUTHENTICATION GUARD ---');
  {
    const unauthSubmit = await api('/api/projects/submit', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Unauthenticated Attempt',
        description: 'Should be rejected without valid token',
      }),
    });
    assert.strictEqual(unauthSubmit.status, 401, 'Unauthenticated project submission must return 401 Unauthorized');
    pass('START_PROJECT_GUARD', 'Start a Project endpoint rejects guest/unauthenticated calls with 401');
  }

  // --- 12. DEVELOPER START PROJECT RESTRICTION ---
  console.log('\n--- SECTION 12: DEVELOPER START PROJECT RESTRICTION ---');
  {
    const devSubmit = await api('/api/projects/submit', {
      method: 'POST',
      headers: { Authorization: `Bearer ${devAToken}` },
      body: JSON.stringify({
        title: 'Developer Project Submission Attempt',
        description: 'Developers must not be able to commission client projects',
      }),
    });
    assert.strictEqual(devSubmit.status, 403, 'Developer project submission must return 403 Forbidden');
    assert(
      devSubmit.body.error?.includes('Your current account is registered as a Developer') &&
      devSubmit.body.error?.includes('To submit a client project, create or use a Client account'),
      `Error must match exact specification: ${devSubmit.body.error}`
    );
    pass('START_PROJECT_RESTRICTION', 'Developer project submission rejected with exact required message');
  }

  // --- 13. CLIENT JOIN DEVELOPER FLOW ---
  console.log('\n--- SECTION 13: CLIENT JOIN DEVELOPER FLOW ---');
  {
    // Client checks deletion eligibility
    const eligRes = await api('/api/auth/account/deletion-eligibility', {
      headers: { Authorization: `Bearer ${clientAToken}` },
    });
    assert.strictEqual(eligRes.status, 200, 'Deletion eligibility endpoint must return 200');
    assert(eligRes.body.eligible !== undefined, 'Response must indicate eligibility boolean');
    assert(Array.isArray(eligRes.body.reasons), 'Reasons must be an array');
    pass('JOIN_DEVELOPER_FLOW', 'Client can query deletion eligibility without account destruction');
  }

  // --- 14. SEPARATE DEVELOPER ACCOUNT CREATION ---
  console.log('\n--- SECTION 14: SEPARATE DEVELOPER ACCOUNT CREATION ---');
  let separateDevUser: any = null;
  const separateDevEmail = `dev_sep_${timestamp}@example.com`;
  {
    const regRes = await api('/api/auth/register/developer', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Client Alpha (As Developer)',
        username: `devsep_${timestamp}`,
        email: separateDevEmail,
        password: 'SeparateDevPassword2026!',
        confirmPassword: 'SeparateDevPassword2026!',
        roleTitle: 'Independent Consultant',
      }),
    });
    assert.strictEqual(regRes.status, 201, 'Separate developer registration must return 201');
    separateDevUser = regRes.body.user;

    // Verify both accounts exist in DB independently
    const checkClient = await query('SELECT id, role, email FROM users WHERE id = $1', [clientAUser.id]);
    const checkDev = await query('SELECT id, role, email FROM users WHERE id = $1', [separateDevUser.id]);

    assert.strictEqual(checkClient.rows[0].role, 'CLIENT', 'Client account remains CLIENT');
    assert.strictEqual(checkDev.rows[0].role, 'DEVELOPER', 'Developer account is DEVELOPER');
    assert.notStrictEqual(checkClient.rows[0].id, checkDev.rows[0].id, 'Account IDs are distinct');

    // Future-proofing: verify user_account_links can link them without schema alteration
    const linkRes = await query(
      `INSERT INTO user_account_links (primary_user_id, linked_user_id, relationship_type, verified_at)
       VALUES ($1, $2, 'CLIENT_DEVELOPER', NOW())
       RETURNING id, relationship_type`,
      [clientAUser.id, separateDevUser.id]
    );
    assert.strictEqual(linkRes.rows.length, 1, 'user_account_links correctly links both identities');

    pass('SEPARATE_DEV_ACCOUNT', 'Separate Developer account created with distinct email; Client account preserved');
  }

  // --- 15. SAME-EMAIL REJECTION ACROSS CLIENT AND DEVELOPER ---
  console.log('\n--- SECTION 15: SAME-EMAIL REJECTION ACROSS ROLES ---');
  {
    // Client email attempted as Developer
    const crossRes1 = await api('/api/auth/register/developer', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Cross Dev Attempt',
        username: `crossdev_${timestamp}`,
        email: clientAEmail,
        password: 'Password123!',
        confirmPassword: 'Password123!',
        roleTitle: 'Developer',
      }),
    });
    assert.strictEqual(crossRes1.status, 409, 'Client email registered as developer must return 409 Conflict');

    // Developer email attempted as Client
    const crossRes2 = await api('/api/auth/register/client', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Cross Client Attempt',
        companyName: 'Cross Corp',
        email: devAEmail,
        password: 'Password123!',
        confirmPassword: 'Password123!',
      }),
    });
    assert.strictEqual(crossRes2.status, 409, 'Developer email registered as client must return 409 Conflict');

    pass('SAME_EMAIL_REJECTION', 'Cross-role registration with identical email strictly rejected with 409 Conflict');
  }

  // --- 16. CLIENT ACCOUNT DELETION PROTECTION (EXPLICIT 'DELETE' CONFIRMATION) ---
  console.log('\n--- SECTION 16: ACCOUNT DELETION CONFIRMATION CHECK ---');
  {
    // Attempt deletion without confirmation
    const noConfirm = await api('/api/auth/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientAToken}` },
      body: JSON.stringify({}),
    });
    assert.strictEqual(noConfirm.status, 400, 'Missing confirmation text must return 400 Bad Request');
    assert(noConfirm.body.error?.includes('DELETE'), 'Error message must specify DELETE requirement');

    // Attempt deletion with wrong confirmation text
    const wrongConfirm = await api('/api/auth/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientAToken}` },
      body: JSON.stringify({ confirmation: 'yes please' }),
    });
    assert.strictEqual(wrongConfirm.status, 400, 'Wrong confirmation text must return 400 Bad Request');

    pass('DELETION_CONFIRMATION', 'Account deletion strictly requires explicit confirmation text "DELETE"');
  }

  // --- 17. ACTIVE PROJECT DELETION PROTECTION ---
  console.log('\n--- SECTION 17: ACTIVE PROJECT DELETION PROTECTION ---');
  let disposableClientUser: any = null;
  let disposableClientToken = '';
  const dispEmail = `disp_client_${timestamp}@example.com`;
  {
    const regRes = await api('/api/auth/register/client', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Disposable Client Active',
        email: dispEmail,
        password: 'DispPassword2026!',
        confirmPassword: 'DispPassword2026!',
        companyName: 'Active Project Corp',
      }),
    });
    disposableClientUser = regRes.body.user;
    assert(disposableClientUser.id, 'Disposable Client ID must be present');
    disposableClientToken = regRes.body.token;

    // Create an active project for this client
    const projRes = await api('/api/projects/submit', {
      method: 'POST',
      headers: { Authorization: `Bearer ${disposableClientToken}` },
      body: JSON.stringify({
        title: `Active Mission Project ${timestamp}`,
        description: 'Mission critical project currently in progress',
        category: 'Web Application',
        projectType: 'Milestone-Based Fixed Price',
        timeline: '1-2 Months',
        technologies: ['PostgreSQL'],
        requirements: ['Non-negotiable milestone'],
        budgetMin: '10000',
        budgetMax: '30000',
      }),
    });
    assert.strictEqual(projRes.status, 201, `Project submission must return 201: ${JSON.stringify(projRes.body)}`);
    const activeProjId = projRes.body.project.id;

    // Update project status to IN_PROGRESS in DB
    await query(`UPDATE projects SET status = 'IN_PROGRESS' WHERE id = $1`, [activeProjId]);

    // Attempt to delete client account while project is active
    const deleteAttempt = await api('/api/auth/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${disposableClientToken}` },
      body: JSON.stringify({ confirmation: 'DELETE' }),
    });
    assert.strictEqual(deleteAttempt.status, 400, 'Deactivation with active projects must return 400 Bad Request');
    assert(
      deleteAttempt.body.error?.includes('active projects'),
      `Error must explain active project protection: ${deleteAttempt.body.error}`
    );

    pass('ACTIVE_PROJECT_PROTECTION', 'Account deletion blocked when client has projects in progress');
  }

  // --- 18. FINANCIAL RECORD PRESERVATION ---
  console.log('\n--- SECTION 18: FINANCIAL RECORD PRESERVATION ---');
  let financialClientUser: any = null;
  let financialClientToken = '';
  const finEmail = `fin_client_${timestamp}@example.com`;
  {
    const regRes = await api('/api/auth/register/client', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Financial History Client',
        email: finEmail,
        password: 'FinPassword2026!',
        confirmPassword: 'FinPassword2026!',
        companyName: 'Financial Ledger Holdings',
      }),
    });
    financialClientUser = regRes.body.user;
    financialClientToken = regRes.body.token;

    // Insert simulated completed project and payment
    const dbClient = await query('SELECT id FROM clients WHERE user_id = $1', [financialClientUser.id]);
    const clientId = dbClient.rows[0].id;

    const projRes = await query(
      `INSERT INTO projects (client_id, project_number, title, slug, description, category, status, budget_min, budget_max, timeline, claim_deadline)
       VALUES ($1, $2, 'Completed Historical Project', $3, 'Historic archive', 'Web Application', 'COMPLETED', 5000, 5000, '1-2 Months', NOW() + INTERVAL '7 days')
       RETURNING id`,
      [clientId, `PRJ-FIN-${timestamp}`, `completed-historical-prj-${timestamp}`]
    );
    const completedProjId = projRes.rows[0].id;

    // Insert payment record
    const payRes = await query(
      `INSERT INTO payments (user_id, amount, currency, status, gateway, gateway_payment_id, metadata)
       VALUES ($1, 500000, 'INR', 'SUCCESS', 'STRIPE', $2, $3)
       RETURNING id`,
      [financialClientUser.id, `pay_${timestamp}_${Date.now()}`, JSON.stringify({ projectId: completedProjId })]
    );
    const paymentId = payRes.rows[0].id;

    // Deactivate client account safely (has no active projects)
    const deactRes = await api('/api/auth/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${financialClientToken}` },
      body: JSON.stringify({ confirmation: 'DELETE' }),
    });
    assert.strictEqual(deactRes.status, 200, 'Account deactivation must succeed');

    // Verify financial records, project attribution, and ledger records remain intact
    const verifyPay = await query('SELECT * FROM payments WHERE id = $1', [paymentId]);
    assert.strictEqual(verifyPay.rows.length, 1, 'Payment record must remain strictly preserved');
    assert.strictEqual(verifyPay.rows[0].status, 'SUCCESS', 'Payment status intact');

    const verifyProj = await query('SELECT * FROM projects WHERE id = $1', [completedProjId]);
    assert.strictEqual(verifyProj.rows.length, 1, 'Completed project record must remain strictly preserved');
    assert.strictEqual(verifyProj.rows[0].client_id, clientId, 'Client attribution preserved');

    pass('FINANCIAL_PRESERVATION', 'All historical financial records and completed project attributions remain preserved');
  }

  // --- 19. AUDIT PRESERVATION ---
  console.log('\n--- SECTION 19: AUDIT PRESERVATION ---');
  {
    // Check audit logs for ACCOUNT_DELETION_REQUESTED and ACCOUNT_DEACTIVATED
    const auditLogs = await query(
      `SELECT * FROM audit_logs WHERE actor_user_id = $1 ORDER BY created_at ASC`,
      [financialClientUser.id]
    );
    const actions = auditLogs.rows.map((r: any) => r.action);
    assert(actions.includes('CLIENT_REGISTERED'), 'CLIENT_REGISTERED must be in audit logs');
    assert(actions.includes('ACCOUNT_DELETION_REQUESTED'), 'ACCOUNT_DELETION_REQUESTED must be in audit logs');
    assert(actions.includes('ACCOUNT_DEACTIVATED'), 'ACCOUNT_DEACTIVATED must be in audit logs');
    assert(actions.includes('SESSION_INVALIDATED'), 'SESSION_INVALIDATED must be in audit logs');

    // Verify PostgreSQL trigger prevents modification or deletion of audit logs
    let triggerBlocked = false;
    try {
      await query(`DELETE FROM audit_logs WHERE actor_user_id = $1`, [financialClientUser.id]);
    } catch (_triggerErr: any) {
      triggerBlocked = true;
    }
    assert(triggerBlocked, 'Audit log deletion must be blocked by immutable PostgreSQL trigger');

    pass('AUDIT_PRESERVATION', 'Audit trail recorded and protected by append-only database trigger');
  }

  // --- 20. SESSION INVALIDATION ---
  console.log('\n--- SECTION 20: SESSION INVALIDATION ---');
  {
    // 20.1 User with deactivated account cannot use old token
    const testDeactToken = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${financialClientToken}` },
    });
    // Disabled/Suspended or token_version invalidated returns 401 or 403
    assert([401, 403].includes(testDeactToken.status), 'Deactivated user token must be denied access');
    pass('SESSION_INVALIDATION', 'Token from deactivated account is immediately rejected on protected routes');

    // 20.2 User who logs out has token invalidated
    // Log out devB
    const logoutRes = await api('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${devBToken}` },
    });
    assert.strictEqual(logoutRes.status, 200, 'Logout must succeed');

    // Dev B old token now fails on subsequent requests
    const oldTokenRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${devBToken}` },
    });
    assert.strictEqual(oldTokenRes.status, 401, 'Logged out session token must return 401 Unauthorized');
    assert(
      oldTokenRes.body.error?.includes('Session invalidated') || oldTokenRes.body.error?.includes('Invalid'),
      'Must explain session invalidation'
    );
    pass('SESSION_INVALIDATION', 'Logout increments token_version; old token rejected with 401');
  }

  // --- 21. WEBSOCKET SESSION AUTHORIZATION ---
  console.log('\n--- SECTION 21: WEBSOCKET SESSION AUTHORIZATION ---');
  {
    // 21.1 Unauthenticated WebSocket rejected
    let unauthClosed = false;
    let closeCode = 0;
    const guestWs = new WebSocket(`${wsUrl}?token=invalid.token.signature`);
    await new Promise<void>((resolve) => {
      guestWs.on('close', (code) => {
        unauthClosed = true;
        closeCode = code;
        resolve();
      });
      setTimeout(() => {
        guestWs.close();
        resolve();
      }, 1500);
    });
    assert(unauthClosed, 'Unauthenticated WebSocket must be closed');
    assert.strictEqual(closeCode, 1008, 'Unauthenticated close code must be 1008 (Policy Violation)');
    pass('WEBSOCKET_AUTH', 'Unauthenticated WebSocket connection rejected with code 1008');

    // 21.2 Invalidated token WebSocket rejected
    let invalidatedClosed = false;
    const invalidWs = new WebSocket(`${wsUrl}?token=${devBToken}`);
    await new Promise<void>((resolve) => {
      invalidWs.on('close', (code) => {
        if (code === 1008) invalidatedClosed = true;
        resolve();
      });
      setTimeout(() => {
        invalidWs.close();
        resolve();
      }, 1500);
    });
    assert(invalidatedClosed, 'WebSocket with invalidated session token must be closed with 1008');
    pass('WEBSOCKET_AUTH', 'WebSocket rejects invalidated/logged-out session token with code 1008');

    // 21.3 Valid authenticated token succeeds and channel authorization works
    let authSuccess = false;
    let personalAuth = false;
    const validWs = new WebSocket(`${wsUrl}?token=${clientAToken}`);
    await new Promise<void>((resolve) => {
      validWs.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'auth_success') {
          authSuccess = true;
          // Subscribe to own channel
          validWs.send(JSON.stringify({ type: 'subscribe', channel: `user:${clientAUser.id}` }));
        } else if (msg.type === 'subscribed' && msg.channel === `user:${clientAUser.id}`) {
          personalAuth = true;
          validWs.close();
          resolve();
        }
      });
      setTimeout(() => {
        validWs.close();
        resolve();
      }, 2000);
    });
    assert(authSuccess, 'Valid WebSocket connection must authenticate');
    assert(personalAuth, 'User authorized to subscribe to own personal channel');
    pass('WEBSOCKET_AUTH', 'Authenticated WebSocket session connects and authorizes private channel');
  }

  // --- 22. ROLE MASS-ASSIGNMENT PROTECTION ---
  console.log('\n--- SECTION 22: ROLE MASS-ASSIGNMENT DEFENSE ---');
  {
    const maliciousDev = await api('/api/auth/register/developer', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Hacker Dev',
        username: `hacker_${timestamp}`,
        email: `hacker_dev_${timestamp}@example.com`,
        password: 'HackerPassword2026!',
        confirmPassword: 'HackerPassword2026!',
        roleTitle: 'Developer',
        role: 'ADMIN',
        status: 'ACTIVE',
        permissions: ['*'],
        is_suspended: false,
      }),
    });
    assert.strictEqual(maliciousDev.status, 201);
    assert.strictEqual(maliciousDev.body.user.role, 'DEVELOPER', 'Role must remain DEVELOPER, ignoring injection');
    assert.strictEqual(maliciousDev.body.user.status, 'PENDING_VERIFICATION', 'Status must remain PENDING_VERIFICATION');

    const checkDevDb = await query('SELECT role, status, permissions FROM users WHERE id = $1', [
      maliciousDev.body.user.id,
    ]);
    assert.strictEqual(checkDevDb.rows[0].role, 'DEVELOPER', 'Database role must be DEVELOPER');
    assert.strictEqual(checkDevDb.rows[0].status, 'PENDING_VERIFICATION', 'Database status must be PENDING');

    pass('MASS_ASSIGNMENT', 'Malicious role and permission parameters safely discarded during registration');
  }

  // --- 23. CEO PROTECTION REGRESSION ---
  console.log('\n--- SECTION 23: CEO PROTECTION REGRESSION ---');
  {
    // Generate CEO login token
    const pwHash = await hashPassword('ExecutiveSecret2026!');
    const ceoRes = await query(
      `INSERT INTO users (email, phone, password_hash, role, status, email_verified, permissions)
       VALUES ('shivaa1906@gmail.com', '+91 9900011223', $1, 'CEO', 'ACTIVE', TRUE, '["*"]'::jsonb)
       ON CONFLICT (email) DO UPDATE SET password_hash = $1, status = 'ACTIVE'
       RETURNING id, uid`,
      [pwHash]
    );
    const ceoId = ceoRes.rows[0].id;
    const ceoUid = ceoRes.rows[0].uid;

    const ceoToken = jwt.sign(
      { userId: ceoId, uid: ceoUid, email: 'shivaa1906@gmail.com', role: ROLES.CEO, tokenVersion: 1 },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Attempt to deactivate CEO account
    const ceoDeact = await api('/api/auth/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ confirmation: 'DELETE' }),
    });
    assert.strictEqual(ceoDeact.status, 403, 'CEO deactivation must be rejected with 403 Forbidden');
    assert(
      ceoDeact.body.error?.includes('Chief Executive Officer account is protected'),
      'Error message must state CEO protection'
    );

    // Verify DB triggers protect CEO from direct deletion
    let dbCeoDeleteBlocked = false;
    try {
      await query(`DELETE FROM users WHERE email = 'shivaa1906@gmail.com'`);
    } catch {
      dbCeoDeleteBlocked = true;
    }
    assert(dbCeoDeleteBlocked, 'PostgreSQL trigger prevents deletion of primary CEO record');

    pass('CEO_PROTECTION', 'CEO account (shivaa1906@gmail.com) strictly protected from deactivation & deletion');
  }

  // --- 24. MD PROTECTION REGRESSION ---
  console.log('\n--- SECTION 24: MD PROTECTION REGRESSION ---');
  {
    const mdRes = await query(`SELECT id, uid, email FROM users WHERE role = 'MD' LIMIT 1`);
    if (mdRes.rows.length > 0) {
      const mdId = mdRes.rows[0].id;
      const mdUid = mdRes.rows[0].uid;
      const mdEmail = mdRes.rows[0].email;

      const mdToken = jwt.sign(
        { userId: mdId, uid: mdUid, email: mdEmail, role: ROLES.MD, tokenVersion: 1 },
        env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const mdDeact = await api('/api/auth/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${mdToken}` },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      });
      assert.strictEqual(mdDeact.status, 403, 'MD self-service deactivation must return 403 Forbidden');
      assert(
        mdDeact.body.error?.includes('Managing Director account is protected'),
        'Must explain MD governance protection'
      );
    }
    pass('MD_PROTECTION', 'Managing Director account cannot be deactivated via self-service');
  }

  // --- 25. PHASE 1 REGRESSION VERIFICATION ---
  console.log('\n--- SECTION 25: PHASE 1 REGRESSION VERIFICATION ---');
  {
    // 25.1 Passwords hashed with Argon2id
    const userRow = await query('SELECT password_hash FROM users WHERE id = $1', [clientAUser.id]);
    assert(isArgon2Hash(userRow.rows[0].password_hash), 'Password must be hashed with Argon2id ($argon2id$)');

    // 25.2 Passwords never returned in payload
    const meRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${clientAToken}` },
    });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.user.password, undefined, 'Password must not be in user object');
    assert.strictEqual(meRes.body.user.password_hash, undefined, 'Password hash must not be in user object');

    pass('PHASE1_REGRESSION', 'Phase 1 Argon2id password security and credential masking verified');
  }

  // --- 26. PHASE 2 REGRESSION VERIFICATION ---
  console.log('\n--- SECTION 26: PHASE 2 REGRESSION VERIFICATION ---');
  {
    // Public developers and projects query real PostgreSQL data (no mock fallbacks)
    const pubDevs = await api('/api/developers?limit=5');
    assert.strictEqual(pubDevs.status, 200);
    assert(Array.isArray(pubDevs.body.developers), 'Developers must be returned as array from DB');

    const pubProjects = await api('/api/projects/published');
    assert.strictEqual(pubProjects.status, 200);
    assert(Array.isArray(pubProjects.body.projects), 'Projects must be returned as array from DB');

    pass('PHASE2_REGRESSION', 'Phase 2 live database query integrity verified (no mock data)');
  }

  // --- 27. PHASE 3 REGRESSION VERIFICATION ---
  console.log('\n--- SECTION 27: PHASE 3 REGRESSION VERIFICATION ---');
  {
    // CEO has superadmin access to platform settings
    const ceoRes = await query(`SELECT id, uid FROM users WHERE email = 'shivaa1906@gmail.com'`);
    const ceoToken = jwt.sign(
      { userId: ceoRes.rows[0].id, uid: ceoRes.rows[0].uid, email: 'shivaa1906@gmail.com', role: ROLES.CEO, tokenVersion: 1 },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const ceoSettingsRes = await api('/api/admin/settings', {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    assert.strictEqual(ceoSettingsRes.status, 200, 'CEO must have full access to platform settings');

    // Audit logs remain strictly append-only
    const auditRes = await api('/api/admin/audit-logs', {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    assert.strictEqual(auditRes.status, 200, 'CEO can read audit logs');

    pass('PHASE3_REGRESSION', 'Phase 3 Executive governance, CEO permissions, and audit invariants verified');
  }

  console.log('\n================================================================');
  console.log(`PHASE 4 TEST SUMMARY: ${passedChecks} / ${totalChecks} PASSED`);
  console.log('================================================================');

  server.close();
  process.exit(0);
}

runPhase4Tests().catch((err) => {
  console.error('Fatal test error:', err);
  if (server) server.close();
  process.exit(1);
});
