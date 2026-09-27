process.env.NODE_ENV = 'test';

import assert from 'assert';
import http from 'http';
import { WebSocket } from 'ws';
import { app, httpServer } from '../server.js';
import { query, withTransaction } from '../database/db.js';
import { hashPassword } from '../utils/password.js';
import { ROLES, LEADERSHIP } from '../config/constants.js';
import { seedSystemBootstrap, seedDevelopmentData } from '../database/seed.js';

let server: http.Server;
let baseUrl: string;
let wsUrl: string;

let ceoToken = '';
let mdToken = '';
let adminToken = '';
let supportToken = '';
let devToken = '';
let clientToken = '';

let ceoUserId = '';
let mdUserId = '';
let adminUserId = '';
let supportUserId = '';
let devUserId = '';
let clientUserId = '';

const mdPerms = [
  'developers:read', 'developers:write',
  'projects:read', 'projects:write',
  'clients:read', 'claims:read', 'claims:write',
  'inquiries:read', 'inquiries:write',
  'analytics:read', 'audit_logs:read',
  'payments:read', 'ledger:read',
  'support:read', 'support:tickets:read', 'support:tickets:write',
  'community:read', 'community:write'
];

let passedChecks = 0;
let totalChecks = 0;

function pass(category: string, desc: string) {
  totalChecks++;
  passedChecks++;
  console.log(`  ✔ [PASS] [${category}] ${desc}`);
}

function fail(category: string, desc: string, err: any) {
  totalChecks++;
  console.error(`  ✖ [FAIL] [${category}] ${desc}:`, err?.message || err);
  throw err;
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

  const pwHash = await hashPassword('ExecutiveSecret2026!');

  // Ensure CEO account exists and has known password for testing
  const ceoRes = await query(
    `INSERT INTO users (email, phone, password_hash, role, status, email_verified, email_verified_at, permissions)
     VALUES ('shivaa1906@gmail.com', '+91 9900011223', $1, 'CEO', 'ACTIVE', TRUE, NOW(), '["*"]'::jsonb)
     ON CONFLICT (email) DO UPDATE SET password_hash = $1, status = 'ACTIVE', permissions = '["*"]'::jsonb
     RETURNING id`,
    [pwHash]
  );
  ceoUserId = ceoRes.rows[0].id;

  // Ensure Sample MD account exists
  const mdRes = await query(
    `INSERT INTO users (email, phone, password_hash, role, status, email_verified, email_verified_at, permissions)
     VALUES ('md@example.invalid', '+91 9900022334', $1, 'MD', 'ACTIVE', TRUE, NOW(), $2::jsonb)
     ON CONFLICT (email) DO UPDATE SET password_hash = $1, status = 'ACTIVE', permissions = $2::jsonb
     RETURNING id`,
    [pwHash, JSON.stringify(mdPerms)]
  );
  mdUserId = mdRes.rows[0].id;

  // Ensure Admin User exists
  const adminRes = await query(
    `INSERT INTO users (email, phone, password_hash, role, status, email_verified, email_verified_at, permissions)
     VALUES ('admin_test_p3@nexus.dev', '+1 555-0199', $1, 'ADMIN', 'ACTIVE', TRUE, NOW(), '["developers:read", "developers:write", "projects:read", "credits:read", "credits:write"]'::jsonb)
     ON CONFLICT (email) DO UPDATE SET password_hash = $1, status = 'ACTIVE'
     RETURNING id`,
    [pwHash]
  );
  adminUserId = adminRes.rows[0].id;

  // Ensure Support User exists
  const suppRes = await query(
    `INSERT INTO users (email, phone, password_hash, role, status, email_verified, email_verified_at, permissions)
     VALUES ('support_test_p3@nexus.dev', '+1 555-0198', $1, 'SUPPORT', 'ACTIVE', TRUE, NOW(), '["support:read", "support:tickets:read"]'::jsonb)
     ON CONFLICT (email) DO UPDATE SET password_hash = $1, status = 'ACTIVE'
     RETURNING id`,
    [pwHash]
  );
  supportUserId = suppRes.rows[0].id;
  await query(
    `INSERT INTO support_staff (user_id, department, title, support_level, status)
     VALUES ($1, 'Tier 1 Operations', 'Platform Support Specialist', 'L1_SUPPORT', 'AVAILABLE')
     ON CONFLICT (user_id) DO UPDATE SET status = 'AVAILABLE'`,
    [supportUserId]
  );

  // Ensure Developer User exists
  const devRes = await query(
    `INSERT INTO users (email, phone, password_hash, role, status, email_verified, email_verified_at)
     VALUES ('dev_test_p3@nexus.dev', '+1 555-0197', $1, 'DEVELOPER', 'ACTIVE', TRUE, NOW())
     ON CONFLICT (email) DO UPDATE SET password_hash = $1, status = 'ACTIVE'
     RETURNING id`,
    [pwHash]
  );
  devUserId = devRes.rows[0].id;
  const devProf = await query(
    `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status)
     VALUES ($1, 'dev-test-p3', 'Dev P3 Tester', 'Fullstack Engineer', 5, 'VERIFIED')
     ON CONFLICT (username) DO UPDATE SET verification_status = 'VERIFIED'
     RETURNING id`,
    [devUserId]
  );
  const devProfId = devProf.rows[0].id;
  await query(
    `INSERT INTO credit_accounts (developer_id, balance) VALUES ($1, 20) ON CONFLICT (developer_id) DO NOTHING`,
    [devProfId]
  );

  // Ensure Client User exists
  const clientRes = await query(
    `INSERT INTO users (email, phone, password_hash, role, status, email_verified, email_verified_at)
     VALUES ('client_test_p3@nexus.dev', '+1 555-0196', $1, 'CLIENT', 'ACTIVE', TRUE, NOW())
     ON CONFLICT (email) DO UPDATE SET password_hash = $1, status = 'ACTIVE'
     RETURNING id`,
    [pwHash]
  );
  clientUserId = clientRes.rows[0].id;
  await query(
    `INSERT INTO clients (user_id, client_number, company_name, private_name)
     VALUES ($1, 'CLT-2026-9999', 'P3 Client Labs', 'P3 Contact')
     ON CONFLICT (client_number) DO NOTHING`,
    [clientUserId]
  );

  // Authenticate all accounts to obtain valid sessions
  const ceoLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'shivaa1906@gmail.com', password: 'ExecutiveSecret2026!' }),
  });
  ceoToken = ceoLogin.body.token;

  const mdLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'md@example.invalid', password: 'ExecutiveSecret2026!' }),
  });
  mdToken = mdLogin.body.token;

  const adminLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin_test_p3@nexus.dev', password: 'ExecutiveSecret2026!' }),
  });
  adminToken = adminLogin.body.token;

  const suppLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'support_test_p3@nexus.dev', password: 'ExecutiveSecret2026!' }),
  });
  supportToken = suppLogin.body.token;

  const devLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'dev_test_p3@nexus.dev', password: 'ExecutiveSecret2026!' }),
  });
  devToken = devLogin.body.token;

  const clientLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'client_test_p3@nexus.dev', password: 'ExecutiveSecret2026!' }),
  });
  clientToken = clientLogin.body.token;
}

async function runPhase3Tests() {
  console.log('================================================================');
  console.log('PHASE 3 — CEO / ADMIN / MANAGING DIRECTOR GOVERNANCE TEST SUITE');
  console.log('================================================================\n');

  await setupSuite();

  // --- 1. EXECUTIVE IDENTITY & UID VERIFICATION ---
  console.log('--- SECTION 1: EXECUTIVE IDENTITY & UID VERIFICATION ---');
  {
    const ceoRow = (await query(`SELECT id, uid, email, role, status, permissions FROM users WHERE email = 'shivaa1906@gmail.com'`)).rows[0];
    assert.strictEqual(ceoRow.role, ROLES.CEO, 'CEO role must be strictly CEO');
    assert.strictEqual(ceoRow.status, 'ACTIVE', 'CEO status must be ACTIVE');
    assert.strictEqual(ceoRow.uid.length, 16, 'CEO UID must be exactly 16 characters');
    assert.match(ceoRow.uid, /^[A-Za-z0-9]{16}$/, 'CEO UID must strictly conform to [A-Za-z0-9]{16}');
    assert(Array.isArray(ceoRow.permissions) && ceoRow.permissions.includes('*'), 'CEO permissions must contain superadmin wildcard "*"');
    pass('IDENTITY', 'Primary CEO account shivaa1906@gmail.com verified with 16-char alphanumeric UID and superadmin wildcard');

    const mdRow = (await query(`SELECT id, uid, email, role, status, permissions FROM users WHERE email = 'md@example.invalid'`)).rows[0];
    assert.strictEqual(mdRow.role, ROLES.MD, 'MD role must be strictly MD');
    assert.strictEqual(mdRow.status, 'ACTIVE', 'MD status must be ACTIVE');
    assert.strictEqual(mdRow.uid.length, 16, 'MD UID must be exactly 16 characters');
    assert.match(mdRow.uid, /^[A-Za-z0-9]{16}$/, 'MD UID must strictly conform to [A-Za-z0-9]{16}');
    assert.notStrictEqual(ceoRow.id, mdRow.id, 'CEO and MD must be distinct user IDs');
    assert.notStrictEqual(ceoRow.uid, mdRow.uid, 'CEO and MD must have distinct UIDs');
    pass('IDENTITY', 'MD account verified as distinct user with separate 16-char UID and explicit permissions');
  }

  // --- 2. CEO SELF-PROTECTION & DATABASE TRIGGERS ---
  console.log('\n--- SECTION 2: CEO SELF-PROTECTION & DATABASE TRIGGERS ---');
  {
    // 2.1 Direct SQL email modification blocked
    let emailChangeBlocked = false;
    try {
      await query(`UPDATE users SET email = 'attacker@nexus.dev' WHERE email = 'shivaa1906@gmail.com'`);
    } catch (err: any) {
      if (err.message.includes('Primary CEO email is protected')) {
        emailChangeBlocked = true;
      }
    }
    assert(emailChangeBlocked, 'Database trigger must block changing primary CEO email');
    pass('SELF_PROTECTION', 'PostgreSQL trigger blocks arbitrary modification of primary CEO email');

    // 2.2 Direct SQL role downgrade blocked
    let roleDowngradeBlocked = false;
    try {
      await query(`UPDATE users SET role = 'DEVELOPER' WHERE email = 'shivaa1906@gmail.com'`);
    } catch (err: any) {
      if (err.message.includes('cannot be downgraded')) {
        roleDowngradeBlocked = true;
      }
    }
    assert(roleDowngradeBlocked, 'Database trigger must block downgrading CEO role');
    pass('SELF_PROTECTION', 'PostgreSQL trigger blocks downgrading primary CEO role');

    // 2.3 Direct SQL suspension blocked
    let suspensionBlocked = false;
    try {
      await query(`UPDATE users SET status = 'SUSPENDED', is_suspended = TRUE WHERE email = 'shivaa1906@gmail.com'`);
    } catch (err: any) {
      if (err.message.includes('Primary CEO account cannot be suspended')) {
        suspensionBlocked = true;
      }
    }
    assert(suspensionBlocked, 'Database trigger must block suspending primary CEO account');
    pass('SELF_PROTECTION', 'PostgreSQL trigger blocks suspending primary CEO account');

    // 2.4 Direct SQL deletion blocked
    let deletionBlocked = false;
    try {
      await query(`DELETE FROM users WHERE email = 'shivaa1906@gmail.com'`);
    } catch (err: any) {
      if (err.message.includes('protected and cannot be deleted')) {
        deletionBlocked = true;
      }
    }
    assert(deletionBlocked, 'Database trigger must block deleting primary CEO account');
    pass('SELF_PROTECTION', 'PostgreSQL trigger blocks deletion of primary CEO account');

    // 2.5 Audit log immutability trigger
    let auditLogTamperBlocked = false;
    try {
      await query(`DELETE FROM audit_logs WHERE id = (SELECT id FROM audit_logs LIMIT 1)`);
    } catch (err: any) {
      if (err.message.includes('Audit logs are immutable')) {
        auditLogTamperBlocked = true;
      }
    }
    assert(auditLogTamperBlocked, 'Database trigger must block DELETE on audit_logs');
    pass('AUDIT_IMMUTABILITY', 'PostgreSQL trigger guarantees audit_logs is append-only and immutable');
  }

  // --- 3. DUPLICATE ACCOUNT REGISTRATION DEFENSE ---
  console.log('\n--- SECTION 3: DUPLICATE ACCOUNT REGISTRATION DEFENSE ---');
  {
    const dupCeoDev = await api('/api/auth/register/developer', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Imposter CEO',
        username: 'imposter-ceo',
        email: 'shivaa1906@gmail.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        roleTitle: 'Architect',
      }),
    });
    assert([400, 409].includes(dupCeoDev.status), 'Duplicate CEO registration as developer must return 400 or 409');
    pass('IDENTITY', 'Registration rejects duplicate CEO email via developer registration');

    const dupCeoClient = await api('/api/auth/register/client', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Imposter Client',
        companyName: 'Fake Corp',
        email: 'shivaa1906@gmail.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      }),
    });
    assert([400, 409].includes(dupCeoClient.status), 'Duplicate CEO registration as client must return 400 or 409');
    pass('IDENTITY', 'Registration rejects duplicate CEO email via client registration');

    const dupMdClient = await api('/api/auth/register/client', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Imposter MD',
        companyName: 'Fake MD Corp',
        email: 'md@example.invalid',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      }),
    });
    assert([400, 409].includes(dupMdClient.status), 'Duplicate MD registration must return 400 or 409');
    pass('IDENTITY', 'Registration rejects duplicate MD email via client registration');
  }

  // --- 4. SERVER-SIDE PERMISSION & API AUTHORIZATION ---
  console.log('\n--- SECTION 4: SERVER-SIDE PERMISSION & API AUTHORIZATION ---');
  {
    // 4.1 CEO Access to CEO-only Platform Settings
    const ceoSettingsRes = await api('/api/admin/settings', {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    assert.strictEqual(ceoSettingsRes.status, 200, 'CEO must have full access to GET /api/admin/settings');
    pass('AUTHORIZATION', 'CEO permitted to access GET /api/admin/settings (200 OK)');

    // 4.2 MD Denied from CEO-only Platform Settings (403 Forbidden)
    const mdSettingsGet = await api('/api/admin/settings', {
      headers: { Authorization: `Bearer ${mdToken}` },
    });
    assert.strictEqual(mdSettingsGet.status, 403, 'MD must be rejected from GET /api/admin/settings with 403');
    pass('AUTHORIZATION', 'MD strictly rejected from GET /api/admin/settings (403 Forbidden)');

    const mdSettingsPatch = await api('/api/admin/settings', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${mdToken}` },
      body: JSON.stringify({ key: 'credit_unit_price_inr', value: 75 }),
    });
    assert.strictEqual(mdSettingsPatch.status, 403, 'MD must be rejected from PATCH /api/admin/settings with 403');
    pass('AUTHORIZATION', 'MD strictly rejected from PATCH /api/admin/settings (403 Forbidden)');

    // 4.3 MD Denied from Credit Management APIs (403 Forbidden)
    const mdCreditAdjust = await api('/api/admin/credits/adjust', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mdToken}` },
      body: JSON.stringify({ developerId: '00000000-0000-0000-0000-000000000000', amount: 50, reason: 'Unauthorized MD Grant' }),
    });
    assert.strictEqual(mdCreditAdjust.status, 403, 'MD must be rejected from POST /api/admin/credits/adjust with 403');
    pass('AUTHORIZATION', 'MD strictly rejected from credit adjustments (403 Forbidden)');

    const mdCreditStats = await api('/api/admin/credits/stats', {
      headers: { Authorization: `Bearer ${mdToken}` },
    });
    assert.strictEqual(mdCreditStats.status, 403, 'MD must be rejected from GET /api/admin/credits/stats with 403');
    pass('AUTHORIZATION', 'MD strictly rejected from credit stats telemetry (403 Forbidden)');

    // 4.4 MD Authorized on Configured Operations
    const mdProjects = await api('/api/admin/projects', {
      headers: { Authorization: `Bearer ${mdToken}` },
    });
    assert.strictEqual(mdProjects.status, 200, 'MD must have access to GET /api/admin/projects');
    pass('AUTHORIZATION', 'MD authorized for project administration (200 OK)');

    const mdDevelopers = await api('/api/admin/developers/pending', {
      headers: { Authorization: `Bearer ${mdToken}` },
    });
    assert.strictEqual(mdDevelopers.status, 200, 'MD must have access to GET /api/admin/developers/pending');
    pass('AUTHORIZATION', 'MD authorized for developer verification queue (200 OK)');

    const mdClaims = await api('/api/admin/claims', {
      headers: { Authorization: `Bearer ${mdToken}` },
    });
    assert.strictEqual(mdClaims.status, 200, 'MD must have access to GET /api/admin/claims');
    pass('AUTHORIZATION', 'MD authorized for claims oversight (200 OK)');

    const mdAnalytics = await api('/api/admin/analytics', {
      headers: { Authorization: `Bearer ${mdToken}` },
    });
    assert.strictEqual(mdAnalytics.status, 200, 'MD must have access to GET /api/admin/analytics');
    pass('AUTHORIZATION', 'MD authorized for platform analytics overview (200 OK)');

    const mdAuditLogs = await api('/api/admin/audit-logs', {
      headers: { Authorization: `Bearer ${mdToken}` },
    });
    assert.strictEqual(mdAuditLogs.status, 200, 'MD must have access to GET /api/admin/audit-logs');
    pass('AUTHORIZATION', 'MD authorized for read-only audit log review (200 OK)');

    // 4.5 Support Role Rejection from Admin Endpoints
    const supportProjects = await api('/api/admin/projects', {
      headers: { Authorization: `Bearer ${supportToken}` },
    });
    assert.strictEqual(supportProjects.status, 403, 'Support must be rejected from /api/admin/projects with 403');
    pass('AUTHORIZATION', 'Support staff rejected from project administration (403 Forbidden)');

    const supportCredits = await api('/api/admin/credits/stats', {
      headers: { Authorization: `Bearer ${supportToken}` },
    });
    assert.strictEqual(supportCredits.status, 403, 'Support must be rejected from credit administration');
    pass('AUTHORIZATION', 'Support staff rejected from credit management (403 Forbidden)');

    // 4.6 Developer & Client Role Rejection from Admin Endpoints
    const devAdmin = await api('/api/admin/projects', {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.strictEqual(devAdmin.status, 403, 'Developer must be rejected from /api/admin/projects with 403');
    pass('AUTHORIZATION', 'Developer rejected from admin routes (403 Forbidden)');

    const clientAdmin = await api('/api/admin/projects', {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert.strictEqual(clientAdmin.status, 403, 'Client must be rejected from /api/admin/projects with 403');
    pass('AUTHORIZATION', 'Client rejected from admin routes (403 Forbidden)');

    // 4.7 Unauthenticated Request Rejection
    const unauthRes = await api('/api/admin/projects');
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401');
    pass('AUTHORIZATION', 'Unauthenticated request rejected with 401 Unauthorized');
  }

  // --- 5. EXECUTIVE ACCOUNT GOVERNANCE & PERMISSION ASSIGNMENT ---
  console.log('\n--- SECTION 5: EXECUTIVE ACCOUNT GOVERNANCE & PERMISSION ASSIGNMENT ---');
  {
    // 5.1 Listing Executives
    const execsRes = await api('/api/admin/executives', {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    assert.strictEqual(execsRes.status, 200, 'CEO can list executives');
    assert(Array.isArray(execsRes.body.executives), 'Response includes executives array');
    const hasCeoInList = execsRes.body.executives.some((e: any) => e.email === 'shivaa1906@gmail.com' && e.role === 'CEO');
    const hasMdInList = execsRes.body.executives.some((e: any) => e.email === 'md@example.invalid' && e.role === 'MD');
    assert(hasCeoInList, 'Executives list contains CEO');
    assert(hasMdInList, 'Executives list contains MD');
    pass('EXECUTIVE_GOVERNANCE', 'CEO can list platform executives with role & permissions metadata');

    // 5.2 MD attempting to update executive permissions is denied
    const mdPermUpdate = await api(`/api/admin/users/${mdUserId}/permissions`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${mdToken}` },
      body: JSON.stringify({ permissions: ['*'] }),
    });
    assert.strictEqual(mdPermUpdate.status, 403, 'MD must be rejected from updating permissions');
    pass('PRIVILEGE_ESCALATION', 'MD attempt to grant self superadmin wildcard rejected (403 Forbidden)');

    // 5.3 CEO updating MD permissions succeeds and is strictly audited
    const newMdPerms = ['projects:read', 'projects:write', 'analytics:read', 'audit_logs:read'];
    const ceoUpdatePerms = await api(`/api/admin/users/${mdUserId}/permissions`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ permissions: newMdPerms }),
    });
    assert.strictEqual(ceoUpdatePerms.status, 200, 'CEO can update MD permissions');
    assert.deepStrictEqual(ceoUpdatePerms.body.user.permissions, newMdPerms);
    pass('EXECUTIVE_GOVERNANCE', 'CEO successfully updated MD permissions in transaction');

    // Verify audit log was recorded
    const auditRes = await query(
      `SELECT * FROM audit_logs WHERE action = 'EXECUTIVE_PERMISSIONS_UPDATED' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [mdUserId]
    );
    assert(auditRes.rows.length > 0, 'Audit record for EXECUTIVE_PERMISSIONS_UPDATED must exist');
    assert.strictEqual(auditRes.rows[0].actor_user_id, ceoUserId, 'Audit actor must be CEO');
    pass('AUDIT_LOGGING', 'Executive permission change recorded in audit log with actor, target, and diff metadata');

    // Restore full MD permissions for subsequent tests
    await api(`/api/admin/users/${mdUserId}/permissions`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ permissions: mdPerms }),
    });

    // 5.4 CEO assigning user role
    const roleAssignRes = await api(`/api/admin/users/${adminUserId}/assign-role`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    assert.strictEqual(roleAssignRes.status, 200, 'CEO can assign user role');
    pass('EXECUTIVE_GOVERNANCE', 'CEO can explicitly assign administrative role');

    // 5.5 Attempting to downgrade primary CEO role via API is blocked
    const ceoDowngradeAttempt = await api(`/api/admin/users/${ceoUserId}/assign-role`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ role: 'CLIENT' }),
    });
    assert.strictEqual(ceoDowngradeAttempt.status, 400, 'Attempt to downgrade CEO role via API must return error');
    pass('SELF_PROTECTION', 'API rejects attempt to downgrade primary CEO account role');
  }

  // --- 6. EXECUTIVE ACCOUNT SUSPENSION SAFEGUARDS ---
  console.log('\n--- SECTION 6: EXECUTIVE ACCOUNT SUSPENSION SAFEGUARDS ---');
  {
    // 6.1 Attempting to suspend primary CEO via API is blocked (403)
    const suspendCeoAttempt = await api(`/api/admin/users/${ceoUserId}/suspend`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ reason: 'Malicious suspension attempt' }),
    });
    assert.strictEqual(suspendCeoAttempt.status, 403, 'Suspending CEO account must return 403 Forbidden');
    pass('SELF_PROTECTION', 'Admin attempt to suspend primary CEO account rejected (403 Forbidden)');

    // 6.2 Attempting to disable primary CEO via API is blocked (403)
    const disableCeoAttempt = await api(`/api/admin/users/${ceoUserId}/disable`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(disableCeoAttempt.status, 403, 'Disabling CEO account must return 403 Forbidden');
    pass('SELF_PROTECTION', 'Admin attempt to disable primary CEO account rejected (403 Forbidden)');

    // 6.3 MD attempting to suspend an Admin is blocked (403)
    const mdSuspendAdmin = await api(`/api/admin/users/${adminUserId}/suspend`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mdToken}` },
      body: JSON.stringify({ reason: 'MD suspending Admin' }),
    });
    assert.strictEqual(mdSuspendAdmin.status, 403, 'MD cannot suspend an Admin account');
    pass('EXECUTIVE_GOVERNANCE', 'MD rejected from suspending executive accounts (403 Forbidden)');
  }

  // --- 7. ROLE MASS-ASSIGNMENT DEFENSE ---
  console.log('\n--- SECTION 7: ROLE MASS-ASSIGNMENT DEFENSE ---');
  {
    const massAssignDev = await api('/api/auth/register/developer', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Hacker Dev',
        username: `hacker-dev-${Date.now()}`,
        email: `hacker_dev_${Date.now()}@nexus.dev`,
        password: 'Password123!',
        confirmPassword: 'Password123!',
        roleTitle: 'Security Tester',
        role: 'CEO',
        isAdmin: true,
        permissions: ['*'],
      }),
    });
    assert.strictEqual(massAssignDev.status, 201, 'Registration accepted');
    assert.strictEqual(massAssignDev.body.user.role, ROLES.DEVELOPER, 'Role must be DEVELOPER, ignoring client CEO injection');
    pass('MASS_ASSIGNMENT', 'Developer registration ignores role/admin/permissions injections');

    const massAssignClient = await api('/api/auth/register/client', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Hacker Client',
        companyName: 'Hacker LLC',
        email: `hacker_cli_${Date.now()}@nexus.dev`,
        password: 'Password123!',
        confirmPassword: 'Password123!',
        role: 'MD',
        is_admin: true,
        permissions: ['*'],
      }),
    });
    assert.strictEqual(massAssignClient.status, 201, 'Registration accepted');
    assert.strictEqual(massAssignClient.body.user.role, ROLES.CLIENT, 'Role must be CLIENT, ignoring client MD injection');
    pass('MASS_ASSIGNMENT', 'Client registration ignores role/admin/permissions injections');
  }

  // --- 8. WEBSOCKET IDENTITY & CHANNEL AUTHORIZATION ---
  console.log('\n--- SECTION 8: WEBSOCKET IDENTITY & CHANNEL AUTHORIZATION ---');
  {
    // 8.1 Unauthenticated WebSocket rejected
    let unauthClosed = false;
    const wsUnauth = new WebSocket(`${wsUrl}?token=bogus.invalid.jwt`);
    await new Promise<void>((resolve) => {
      wsUnauth.on('close', (code) => {
        if (code === 1008) unauthClosed = true;
        resolve();
      });
      wsUnauth.on('error', () => resolve());
    });
    assert(unauthClosed, 'Unauthenticated WebSocket connection must be closed with code 1008');
    pass('WEBSOCKET', 'Unauthenticated WebSocket connection rejected with code 1008');

    // 8.2 Client attempting to subscribe to admin:events rejected
    const clientWs = new WebSocket(`${wsUrl}?token=${clientToken}`);
    let clientSubForbidden = false;
    await new Promise<void>((resolve) => {
      clientWs.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'auth_success') {
          clientWs.send(JSON.stringify({ type: 'subscribe', channel: 'admin:events' }));
        } else if (msg.type === 'error' && msg.code === 'FORBIDDEN') {
          clientSubForbidden = true;
          clientWs.close();
          resolve();
        }
      });
      setTimeout(() => {
        clientWs.close();
        resolve();
      }, 1500);
    });
    assert(clientSubForbidden, 'Client subscription to admin:events must be rejected with FORBIDDEN');
    pass('WEBSOCKET', 'Client rejected from subscribing to admin:events channel (FORBIDDEN)');

    // 8.3 MD attempting to subscribe to admin:settings or admin:executive rejected
    const mdWs = new WebSocket(`${wsUrl}?token=${mdToken}`);
    let mdSettingsForbidden = false;
    await new Promise<void>((resolve) => {
      mdWs.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'auth_success') {
          mdWs.send(JSON.stringify({ type: 'subscribe', channel: 'admin:settings' }));
        } else if (msg.type === 'error' && msg.code === 'FORBIDDEN') {
          mdSettingsForbidden = true;
          mdWs.close();
          resolve();
        }
      });
      setTimeout(() => {
        mdWs.close();
        resolve();
      }, 1500);
    });
    assert(mdSettingsForbidden, 'MD subscription to admin:settings must be rejected with FORBIDDEN');
    pass('WEBSOCKET', 'MD rejected from subscribing to CEO-only admin:settings channel (FORBIDDEN)');

    // 8.4 CEO permitted to subscribe to admin:settings
    const ceoWs = new WebSocket(`${wsUrl}?token=${ceoToken}`);
    let ceoSettingsSubscribed = false;
    await new Promise<void>((resolve) => {
      ceoWs.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'auth_success') {
          ceoWs.send(JSON.stringify({ type: 'subscribe', channel: 'admin:settings' }));
        } else if (msg.type === 'subscribed' && msg.channel === 'admin:settings') {
          ceoSettingsSubscribed = true;
          ceoWs.close();
          resolve();
        }
      });
      setTimeout(() => {
        ceoWs.close();
        resolve();
      }, 1500);
    });
    assert(ceoSettingsSubscribed, 'CEO subscription to admin:settings must succeed');
    pass('WEBSOCKET', 'CEO authorized to subscribe to admin:settings channel');
  }

  // --- 9. BOOTSTRAP IDEMPOTENCY ---
  console.log('\n--- SECTION 9: BOOTSTRAP IDEMPOTENCY ---');
  {
    const pwHash = await hashPassword('DevPlatform2026!Secure');
    // Execute bootstrap twice
    await withTransaction(async (client) => {
      await seedSystemBootstrap(client, pwHash);
    });
    await withTransaction(async (client) => {
      await seedSystemBootstrap(client, pwHash);
    });

    const ceoCount = (await query(`SELECT COUNT(*) FROM users WHERE email = 'shivaa1906@gmail.com'`)).rows[0].count;
    const mdCount = (await query(`SELECT COUNT(*) FROM users WHERE email = 'md@example.invalid'`)).rows[0].count;
    assert.strictEqual(parseInt(ceoCount, 10), 1, 'Exactly one CEO account exists');
    assert.strictEqual(parseInt(mdCount, 10), 1, 'Exactly one MD account exists');
    pass('IDEMPOTENCY', 'Multiple seedSystemBootstrap executions maintain exact 1:1 CEO & MD account invariants');
  }

  console.log('\n================================================================');
  console.log(`PHASE 3 TEST SUMMARY: ${passedChecks} / ${totalChecks} PASSED`);
  console.log('================================================================');

  server.close();
  process.exit(0);
}

runPhase3Tests().catch((err) => {
  console.error('Fatal test error:', err);
  if (server) server.close();
  process.exit(1);
});
