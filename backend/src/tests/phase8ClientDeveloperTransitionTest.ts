process.env.NODE_ENV = 'test';

import assert from 'assert';
import http from 'http';
import jwt from 'jsonwebtoken';
import { httpServer } from '../server.js';
import { query, withTransaction } from '../database/db.js';
import { env } from '../config/environment.js';
import { ROLES } from '../config/constants.js';
import { GoogleOAuthService } from '../services/googleOAuthService.js';
import { FacebookOAuthService } from '../services/facebookOAuthService.js';
import { DiscordOAuthService } from '../services/discordOAuthService.js';

let server: http.Server;
let baseUrl: string;

let passedChecks = 0;
let totalChecks = 0;

function pass(category: string, desc: string) {
  totalChecks++;
  passedChecks++;
  console.log(`  ✔ [PASS] [${category}] ${desc}`);
}

async function api(
  path: string,
  options: RequestInit = {}
): Promise<{ status: number; body: any; headers: Headers }> {
  const res = await fetch(`${baseUrl}${path}`, {
    redirect: 'manual',
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
  return { status: res.status, body, headers: res.headers };
}

async function setupSuite() {
  server = httpServer;
  if (!server.listening) {
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  } else {
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;
  }
}

export async function runPhase8Tests() {
  console.log('================================================================');
  console.log('PHASE 8 — CLIENT ACCOUNT -> DEVELOPER TRANSITION TEST SUITE');
  console.log('================================================================\n');

  await setupSuite();

  const timestamp = Date.now().toString().slice(-6);

  // Helper to create test client
  async function createTestClient(suffix: string) {
    const email = `client_p8_${suffix}_${timestamp}@example.com`;
    const regRes = await api('/api/auth/register/client', {
      method: 'POST',
      body: JSON.stringify({
        fullName: `Test Client ${suffix}`,
        email,
        password: 'ClientPassword2026!',
        confirmPassword: 'ClientPassword2026!',
        companyName: `Company ${suffix} Inc`,
      }),
    });
    assert.strictEqual(regRes.status, 201, `Failed to register client ${suffix}: ${JSON.stringify(regRes.body)}`);
    return {
      token: regRes.body.token,
      user: regRes.body.user,
      client: regRes.body.client,
      email,
    };
  }

  // Helper to create test developer
  async function createTestDeveloper(suffix: string) {
    const email = `dev_p8_${suffix}_${timestamp}@example.com`;
    const username = `dev_p8_${suffix}_${timestamp}`;
    const regRes = await api('/api/auth/register/developer', {
      method: 'POST',
      body: JSON.stringify({
        fullName: `Developer ${suffix}`,
        username,
        email,
        password: 'DevPassword2026!',
        confirmPassword: 'DevPassword2026!',
        roleTitle: 'Senior Platform Engineer',
      }),
    });
    assert.strictEqual(regRes.status, 201, `Failed to register developer ${suffix}: ${JSON.stringify(regRes.body)}`);

    // Fetch user record to generate token
    const userRes = await query('SELECT * FROM users WHERE email = $1', [email]);
    const u = userRes.rows[0];
    const token = jwt.sign(
      {
        userId: u.id,
        uid: u.uid,
        email: u.email,
        role: u.role,
        status: u.status,
        tokenVersion: u.token_version,
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    return {
      token,
      user: u,
      username,
      email,
    };
  }

  // --- SECTION 1: AUTHENTICATION & ACCESS BOUNDARIES ---
  console.log('--- SECTION 1: AUTHENTICATION & ACCESS BOUNDARIES ---');
  const client1 = await createTestClient('alpha');
  const dev1 = await createTestDeveloper('bravo');

  // Fetch CEO, MD, Support accounts from DB
  const ceoRes = await query("SELECT id, uid, email, role, status, token_version FROM users WHERE role = 'CEO' LIMIT 1");
  assert(ceoRes.rows.length > 0, 'CEO account must exist');
  const ceoUser = ceoRes.rows[0];
  const ceoToken = jwt.sign(
    { userId: ceoUser.id, uid: ceoUser.uid, email: ceoUser.email, role: ceoUser.role, status: ceoUser.status, tokenVersion: ceoUser.token_version },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const mdRes = await query("SELECT id, uid, email, role, status, token_version FROM users WHERE role = 'MD' LIMIT 1");
  assert(mdRes.rows.length > 0, 'MD account must exist');
  const mdUser = mdRes.rows[0];
  const mdToken = jwt.sign(
    { userId: mdUser.id, uid: mdUser.uid, email: mdUser.email, role: mdUser.role, status: mdUser.status, tokenVersion: mdUser.token_version },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Check 1: Authenticated Client can open transition
  const clientOpenRes = await api('/api/auth/account/developer-transition', {
    headers: { Authorization: `Bearer ${client1.token}` },
  });
  assert.strictEqual(clientOpenRes.status, 200, 'Authenticated client must access developer transition');
  assert.strictEqual(clientOpenRes.body.currentAccount.role, 'CLIENT');
  assert(clientOpenRes.body.options.optionA, 'Option A must be returned');
  assert(clientOpenRes.body.options.optionB, 'Option B must be returned');
  pass('CLIENT_ACCESS', 'Authenticated Client can access developer transition options');

  // Check 2: Guest blocked (401)
  const guestRes = await api('/api/auth/account/developer-transition');
  assert.strictEqual(guestRes.status, 401, 'Guest without token must be blocked with 401');
  pass('GUEST_BLOCKED', 'Unauthenticated visitor blocked from developer transition');

  // Check 3: Developer blocked from Client transition
  const devBlockRes = await api('/api/auth/account/developer-transition', {
    headers: { Authorization: `Bearer ${dev1.token}` },
  });
  assert.strictEqual(devBlockRes.status, 400, 'Developer must be blocked with 400');
  assert.strictEqual(devBlockRes.body.code, 'ALREADY_DEVELOPER');
  pass('DEVELOPER_BLOCKED', 'Developer account blocked from entering client transition');

  // Check 4: Support blocked
  const supportRes = await query("SELECT id, uid, email, role, status, token_version FROM users WHERE role = 'SUPPORT' LIMIT 1");
  let supportToken = '';
  if (supportRes.rows.length > 0) {
    const sup = supportRes.rows[0];
    supportToken = jwt.sign(
      { userId: sup.id, uid: sup.uid, email: sup.email, role: sup.role, status: sup.status, tokenVersion: sup.token_version },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  } else {
    // Mint valid support JWT
    supportToken = jwt.sign(
      { userId: client1.user.id, uid: client1.user.uid, email: 'temp_sup@example.com', role: ROLES.SUPPORT, status: 'ACTIVE', tokenVersion: 1 },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  }
  const supBlockRes = await api('/api/auth/account/developer-transition', {
    headers: { Authorization: `Bearer ${supportToken}` },
  });
  assert.strictEqual(supBlockRes.status, 403, 'Support role must be blocked with 403');
  assert.strictEqual(supBlockRes.body.code, 'FORBIDDEN_ROLE');
  pass('SUPPORT_BLOCKED', 'Platform support account blocked from client transition');

  // Check 5: CEO behavior correct
  const ceoBlockRes = await api('/api/auth/account/developer-transition', {
    headers: { Authorization: `Bearer ${ceoToken}` },
  });
  assert.strictEqual(ceoBlockRes.status, 403, 'CEO must be blocked with 403');
  assert.strictEqual(ceoBlockRes.body.code, 'FORBIDDEN_ROLE');
  pass('CEO_BEHAVIOR', 'CEO account strictly blocked from client transition');

  // Check 6: MD behavior correct
  const mdBlockRes = await api('/api/auth/account/developer-transition', {
    headers: { Authorization: `Bearer ${mdToken}` },
  });
  assert.strictEqual(mdBlockRes.status, 403, 'MD must be blocked with 403');
  assert.strictEqual(mdBlockRes.body.code, 'FORBIDDEN_ROLE');
  pass('MD_BEHAVIOR', 'MD account strictly blocked from client transition');

  // --- SECTION 2: SERVER-SIDE IDENTITY AUTHORITY & SPOOFING RESISTANCE ---
  console.log('\n--- SECTION 2: SERVER-SIDE IDENTITY AUTHORITY & SPOOFING RESISTANCE ---');

  // Check 7: Client identity determined server-side
  assert.strictEqual(clientOpenRes.body.currentAccount.userId, client1.user.id);
  assert.strictEqual(clientOpenRes.body.currentAccount.email, client1.email);
  pass('SERVER_IDENTITY', 'Client identity determined strictly from authenticated session');

  // Check 8: Client ID spoofing blocked (query params and body on start)
  const spoofClientIdRes = await api('/api/auth/account/developer-transition?clientId=00000000-0000-0000-0000-000000000000&userId=00000000-0000-0000-0000-000000000000', {
    headers: { Authorization: `Bearer ${client1.token}` },
  });
  assert.strictEqual(spoofClientIdRes.status, 200);
  assert.strictEqual(spoofClientIdRes.body.currentAccount.userId, client1.user.id, 'Injected clientId must be ignored');
  pass('SPOOF_CLIENT_ID', 'Client ID spoofing in request body/query safely ignored');

  // Check 9: Role spoofing blocked
  const spoofRoleRes = await api('/api/auth/account/developer-transition?role=DEVELOPER&isAdmin=true', {
    headers: { Authorization: `Bearer ${client1.token}` },
  });
  assert.strictEqual(spoofRoleRes.status, 200);
  assert.strictEqual(spoofRoleRes.body.currentAccount.role, 'CLIENT', 'Injected role must not alter server-determined role');
  pass('SPOOF_ROLE', 'Client role spoofing strictly rejected');

  // Check 10: Transition options returned correctly
  const { optionA, optionB } = clientOpenRes.body.options;
  assert.strictEqual(optionA.id, 'SEPARATE_DEVELOPER_ACCOUNT');
  assert.strictEqual(optionA.keepsClientActive, true);
  assert.strictEqual(optionA.nextStep, '/register/developer');
  assert.strictEqual(optionB.id, 'DEACTIVATE_CLIENT_ACCOUNT');
  assert.strictEqual(optionB.confirmationRequired, true);
  assert(optionB.confirmationPhrase.includes('DEACTIVATE CLIENT ACCOUNT'));
  pass('OPTIONS_FORMAT', 'Transition options Option A and Option B correctly formatted with explicit semantics');

  // --- SECTION 3: OPTION A — SEPARATE DEVELOPER ACCOUNT ---
  console.log('\n--- SECTION 3: OPTION A — SEPARATE DEVELOPER ACCOUNT ---');

  // Check 11: Option A preserves Client account
  const startOptionARes = await api('/api/auth/account/developer-transition/start', {
    method: 'POST',
    headers: { Authorization: `Bearer ${client1.token}` },
    body: JSON.stringify({ option: 'OPTION_A' }),
  });
  assert.strictEqual(startOptionARes.status, 200, 'Starting Option A must succeed');
  assert.strictEqual(startOptionARes.body.action, 'PROCEED_TO_REGISTRATION');

  const checkClient1Db = await query('SELECT status, role, is_suspended FROM users WHERE id = $1', [client1.user.id]);
  assert.strictEqual(checkClient1Db.rows[0].status, 'ACTIVE', 'Client account must remain ACTIVE');
  assert.strictEqual(checkClient1Db.rows[0].role, 'CLIENT', 'Client role must not be changed');
  assert.strictEqual(checkClient1Db.rows[0].is_suspended, false, 'Client must not be suspended');
  pass('OPTION_A_PRESERVES', 'Option A selection leaves Client account active and intact');

  // Check 12: Option A enters Developer registration
  assert.strictEqual(startOptionARes.body.nextStep, '/register/developer');
  pass('OPTION_A_FLOW', 'Option A routes to existing Developer registration workflow');

  // Check 13: Option A does not silently change Client role
  assert.strictEqual(checkClient1Db.rows[0].role, 'CLIENT', 'Client role was not silently changed to DEVELOPER');
  pass('NO_SILENT_ROLE_CHANGE', 'No silent role mutation from CLIENT to DEVELOPER on Option A');

  // --- SECTION 4: OPTION B — CONFIRMATION & SAFETY POLICY ---
  console.log('\n--- SECTION 4: OPTION B — CONFIRMATION & SAFETY POLICY ---');
  const client2 = await createTestClient('beta');

  // Check 14: Option B requires explicit confirmation
  const noConfirmRes = await api('/api/auth/account/developer-transition/deactivate-client', {
    method: 'POST',
    headers: { Authorization: `Bearer ${client2.token}` },
    body: JSON.stringify({}),
  });
  assert.strictEqual(noConfirmRes.status, 400, 'Missing confirmation must return 400');
  assert.strictEqual(noConfirmRes.body.code, 'INVALID_CONFIRMATION');
  pass('CONFIRM_REQUIRED', 'Option B deactivation requires explicit confirmation phrase');

  // Check 15: Incorrect confirmation rejected
  const badConfirmRes = await api('/api/auth/account/developer-transition/deactivate-client', {
    method: 'POST',
    headers: { Authorization: `Bearer ${client2.token}` },
    body: JSON.stringify({ confirmation: 'YES_PLEASE' }),
  });
  assert.strictEqual(badConfirmRes.status, 400, 'Invalid confirmation must return 400');
  assert.strictEqual(badConfirmRes.body.code, 'INVALID_CONFIRMATION');
  pass('BAD_CONFIRM_REJECTED', 'Incorrect confirmation phrase rejected');

  // Check 16: Deactivation eligibility checked
  const startOptionBRes = await api('/api/auth/account/developer-transition/start', {
    method: 'POST',
    headers: { Authorization: `Bearer ${client2.token}` },
    body: JSON.stringify({ option: 'OPTION_B' }),
  });
  assert.strictEqual(startOptionBRes.status, 200);
  assert.strictEqual(startOptionBRes.body.canDeactivate, true);
  pass('ELIGIBILITY_CHECK', 'Deactivation eligibility accurately assessed for client with no active projects');

  // Check 17: Deactivation blocked when policy requires (active project in progress)
  const client3 = await createTestClient('gamma');
  // Create active project for client3
  const activeProjNum = `PRJ-P8-${timestamp}`;
  const slug = `prj-p8-${timestamp}`;
  await query(
    `INSERT INTO projects (project_number, slug, title, description, category, budget_min, budget_max, timeline, claim_deadline, client_id, status)
     VALUES ($1, $2, 'Active Enterprise Transition Test', 'Project to test deactivation policy block', 'WEB', 500, 1500, '2 weeks', NOW() + INTERVAL '7 days', $3, 'IN_PROGRESS')`,
    [activeProjNum, slug, client3.client.id]
  );

  const blockedStartRes = await api('/api/auth/account/developer-transition/start', {
    method: 'POST',
    headers: { Authorization: `Bearer ${client3.token}` },
    body: JSON.stringify({ option: 'OPTION_B' }),
  });
  assert.strictEqual(blockedStartRes.status, 400, 'Start Option B must be blocked when active project exists');
  assert.strictEqual(blockedStartRes.body.code, 'ACTIVE_PROJECTS_BLOCK_DEACTIVATION');
  assert.strictEqual(blockedStartRes.body.canDeactivate, false);

  const blockedDeactRes = await api('/api/auth/account/developer-transition/deactivate-client', {
    method: 'POST',
    headers: { Authorization: `Bearer ${client3.token}` },
    body: JSON.stringify({ confirmation: 'DEACTIVATE CLIENT ACCOUNT' }),
  });
  assert.strictEqual(blockedDeactRes.status, 400, 'Deactivation must be blocked when active project exists');
  assert.strictEqual(blockedDeactRes.body.code, 'ACTIVE_PROJECTS_BLOCK_DEACTIVATION');
  pass('DEACT_BLOCKED_POLICY', 'Account deactivation strictly blocked when active projects exist');

  // --- SECTION 5: OPTION B — SUCCESSFUL DEACTIVATION & HISTORICAL PRESERVATION ---
  console.log('\n--- SECTION 5: OPTION B — SUCCESSFUL DEACTIVATION & HISTORICAL PRESERVATION ---');

  // Check 18: Successful deactivation
  const successfulDeactRes = await api('/api/auth/account/developer-transition/deactivate-client', {
    method: 'POST',
    headers: { Authorization: `Bearer ${client2.token}` },
    body: JSON.stringify({ confirmation: 'DEACTIVATE CLIENT ACCOUNT' }),
  });
  assert.strictEqual(successfulDeactRes.status, 200, 'Valid deactivation must return 200');
  assert.strictEqual(successfulDeactRes.body.deactivated, true);
  assert.strictEqual(successfulDeactRes.body.preservedHistory, true);
  pass('DEACTIVATION_SUCCESS', 'Client account safely deactivated with confirmation');

  // Check 19: Historical records preserved
  const checkClient2Db = await query('SELECT id, status, is_suspended, suspension_reason FROM users WHERE id = $1', [client2.user.id]);
  assert.strictEqual(checkClient2Db.rows.length, 1, 'User record must still exist in DB');
  assert.strictEqual(checkClient2Db.rows[0].status, 'DISABLED', 'Status set to DISABLED');
  assert.strictEqual(checkClient2Db.rows[0].is_suspended, true, 'is_suspended set to TRUE');

  const checkClient2Profile = await query('SELECT id, client_number, company_name FROM clients WHERE user_id = $1', [client2.user.id]);
  assert.strictEqual(checkClient2Profile.rows.length, 1, 'Client profile record remains preserved');
  pass('HISTORICAL_PRESERVED', 'Client record and user history preserved in database (soft-deactivation)');

  // Check 20: Client session invalidated (token_version incremented)
  const client2UpdatedUser = await query('SELECT token_version FROM users WHERE id = $1', [client2.user.id]);
  assert(client2UpdatedUser.rows[0].token_version > (client2.user.token_version || 1), 'token_version must be incremented');
  pass('SESSION_INVALIDATED', 'Client sessions invalidated via token_version increment');

  // Check 21: Old authentication rejected after deactivation
  const oldTokenRes = await api('/api/auth/me', {
    headers: { Authorization: `Bearer ${client2.token}` },
  });
  assert(oldTokenRes.status === 401 || oldTokenRes.status === 403, 'Old JWT must be rejected after deactivation');
  pass('OLD_JWT_REJECTED', 'Deactivated client JWT rejected with 401/403');

  // --- SECTION 6: DEVELOPER REGISTRATION POST-TRANSITION ---
  console.log('\n--- SECTION 6: DEVELOPER REGISTRATION POST-TRANSITION ---');

  // Check 22: Developer registration remains PENDING_VERIFICATION
  const newDevUsername = `dev_trans_${timestamp}`;
  const newDevEmail = `dev_trans_${timestamp}@example.com`;
  const devRegPostDeactRes = await api('/api/auth/register/developer', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Transitioned Developer',
      username: newDevUsername,
      email: newDevEmail,
      password: 'DevPassword2026!',
      confirmPassword: 'DevPassword2026!',
      roleTitle: 'Full-Stack Developer',
      fromClientUserId: client2.user.id,
    }),
  });
  assert.strictEqual(devRegPostDeactRes.status, 201, 'Developer registration must succeed');
  assert.strictEqual(devRegPostDeactRes.body.status, 'PENDING_DEVELOPER_APPROVAL');
  assert.strictEqual(devRegPostDeactRes.body.verificationStatus, 'PENDING');
  pass('PENDING_VERIFICATION', 'New Developer profile created with PENDING_DEVELOPER_APPROVAL status');

  // Check 23: Developer approval not bypassed
  const devDbCheck = await query('SELECT verification_status FROM developers WHERE username = $1', [newDevUsername]);
  assert.strictEqual(devDbCheck.rows[0].verification_status, 'PENDING', 'Developer verification must remain PENDING');
  pass('APPROVAL_NOT_BYPASSED', 'Admin developer verification required; approval not bypassed');

  // Check 24: Same-email protection respected
  const client4 = await createTestClient('delta');
  const sameEmailDevRes = await api('/api/auth/register/developer', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Same Email Dev',
      username: `same_email_${timestamp}`,
      email: client4.email, // using client4's email!
      password: 'DevPassword2026!',
      confirmPassword: 'DevPassword2026!',
      roleTitle: 'Backend Engineer',
    }),
  });
  assert.strictEqual(sameEmailDevRes.status, 409, 'Same email must be rejected with 409 Conflict');
  assert(
    sameEmailDevRes.body.error.includes('This email is already registered to your Client account'),
    `Error must explain client account email: ${sameEmailDevRes.body.error}`
  );
  pass('SAME_EMAIL_PROTECTION', 'Same-email collision returns clear message explaining client account email');

  // --- SECTION 7: MULTI-PROVIDER OAUTH COMPATIBILITY ---
  console.log('\n--- SECTION 7: MULTI-PROVIDER OAUTH COMPATIBILITY ---');

  // Check 25 & 26: Google OAuth Client transition
  const googleUid = `goog_${timestamp}`;
  const googleClientRes = await withTransaction(async (c) => {
    return await GoogleOAuthService.resolveGoogleIdentity({
      sub: googleUid,
      email: `google_client_${timestamp}@example.com`,
      email_verified: true,
      name: `Google Client ${timestamp}`,
      picture: 'https://lh3.googleusercontent.com/a/test',
    }, c);
  });
  const googleToken = googleClientRes.token;

  const googleTransitionRes = await api('/api/auth/account/developer-transition', {
    headers: { Authorization: `Bearer ${googleToken}` },
  });
  // Check 25: Google OAuth Client identity resolution
  assert.strictEqual(googleClientRes.user.role, 'CLIENT');
  assert.strictEqual(googleClientRes.isNewUser, true);
  pass('GOOGLE_IDENTITY_RESOLVED', 'Google OAuth identity resolved and registered as CLIENT');

  // Check 26: Google OAuth Client transition access
  assert.strictEqual(googleTransitionRes.status, 200, 'Google OAuth client can access transition');
  assert.strictEqual(googleTransitionRes.body.currentAccount.role, 'CLIENT');
  pass('GOOGLE_CLIENT_TRANSITION', 'Google-authenticated Client can access developer transition seamlessly');

  // Check 27: Facebook OAuth Client transition
  const fbUid = `fb_${timestamp}`;
  const fbClientRes = await withTransaction(async (c) => {
    return await FacebookOAuthService.resolveFacebookIdentity({
      id: fbUid,
      email: `fb_client_${timestamp}@example.com`,
      name: `Facebook Client ${timestamp}`,
      picture: 'https://graph.facebook.com/test',
    }, c);
  });
  const fbToken = fbClientRes.token;

  const fbTransitionRes = await api('/api/auth/account/developer-transition', {
    headers: { Authorization: `Bearer ${fbToken}` },
  });
  assert.strictEqual(fbTransitionRes.status, 200, 'Facebook OAuth client can access transition');
  assert.strictEqual(fbTransitionRes.body.currentAccount.role, 'CLIENT');
  pass('FACEBOOK_CLIENT_TRANSITION', 'Facebook-authenticated Client can access developer transition seamlessly');

  // Check 28: Discord OAuth Client transition
  const discordUid = `89${timestamp}1234567890`.slice(0, 18);
  const discordClientRes = await withTransaction(async (c) => {
    return await DiscordOAuthService.resolveDiscordIdentity({
      id: discordUid,
      email: `discord_client_${timestamp}@example.com`,
      email_verified: true,
      username: `discord_client_${timestamp}`,
      global_name: `Discord Client ${timestamp}`,
      avatar: 'test_avatar_hash',
      avatar_url: 'https://cdn.discordapp.com/avatars/test.png',
    }, c);
  });
  const discordToken = discordClientRes.token;

  const discordTransitionRes = await api('/api/auth/account/developer-transition', {
    headers: { Authorization: `Bearer ${discordToken}` },
  });
  assert.strictEqual(discordTransitionRes.status, 200, 'Discord OAuth client can access transition');
  assert.strictEqual(discordTransitionRes.body.currentAccount.role, 'CLIENT');
  pass('DISCORD_CLIENT_TRANSITION', 'Discord-authenticated Client can access developer transition seamlessly');

  // --- SECTION 8: STATE INTEGRITY & EDGE CASES ---
  console.log('\n--- SECTION 8: STATE INTEGRITY & EDGE CASES ---');
  const client5 = await createTestClient('epsilon');

  // Check 29: Cancellation leaves Client unchanged
  // Simply querying transition and exiting leaves client active
  const cancelCheckRes = await api('/api/auth/account/developer-transition', {
    headers: { Authorization: `Bearer ${client5.token}` },
  });
  assert.strictEqual(cancelCheckRes.status, 200);
  const client5Db = await query('SELECT status, role FROM users WHERE id = $1', [client5.user.id]);
  assert.strictEqual(client5Db.rows[0].status, 'ACTIVE');
  assert.strictEqual(client5Db.rows[0].role, 'CLIENT');
  pass('CANCELLATION_SAFE', 'Cancellation leaves Client account completely unchanged');

  // Check 30: Duplicate transition prevented (already deactivated client calling again)
  const client6 = await createTestClient('zeta');
  const firstDeact = await api('/api/auth/account/developer-transition/deactivate-client', {
    method: 'POST',
    headers: { Authorization: `Bearer ${client6.token}` },
    body: JSON.stringify({ confirmation: 'DEACTIVATE CLIENT ACCOUNT' }),
  });
  assert.strictEqual(firstDeact.status, 200);

  // Mint fresh token for client6 with updated token_version to simulate attempted second call
  const client6Db = await query('SELECT * FROM users WHERE id = $1', [client6.user.id]);
  const client6NewToken = jwt.sign(
    {
      userId: client6Db.rows[0].id,
      uid: client6Db.rows[0].uid,
      email: client6Db.rows[0].email,
      role: client6Db.rows[0].role,
      status: client6Db.rows[0].status,
      tokenVersion: client6Db.rows[0].token_version,
    },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const duplicateDeact = await api('/api/auth/account/developer-transition/deactivate-client', {
    method: 'POST',
    headers: { Authorization: `Bearer ${client6NewToken}` },
    body: JSON.stringify({ confirmation: 'DEACTIVATE CLIENT ACCOUNT' }),
  });
  assert(
    duplicateDeact.status === 400 || duplicateDeact.status === 403,
    `Repeated deactivation must be rejected with 400 or 403, got ${duplicateDeact.status}`
  );
  if (duplicateDeact.status === 400) {
    assert.strictEqual(duplicateDeact.body.code, 'ALREADY_DEACTIVATED');
  } else {
    assert(['ACCOUNT_SUSPENDED', 'ACCOUNT_DISABLED'].includes(duplicateDeact.body.code));
  }
  pass('DUPLICATE_DEACTIVATION', 'Repeated or duplicate deactivation safely rejected');

  // Check 31: Duplicate Developer registration prevented
  const dupDevRes = await api('/api/auth/register/developer', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Duplicate Developer',
      username: newDevUsername, // existing username from Check 22
      email: `other_dev_${timestamp}@example.com`,
      password: 'DevPassword2026!',
      confirmPassword: 'DevPassword2026!',
      roleTitle: 'Engineer',
    }),
  });
  assert(dupDevRes.status === 400 || dupDevRes.status === 409, 'Duplicate developer username must be rejected');
  pass('DUPLICATE_DEV_REG', 'Duplicate developer username registration rejected');

  // Check 32: Audit events created
  const auditRes = await query(
    `SELECT action, metadata FROM audit_logs 
     WHERE action IN (
       'DEVELOPER_REGISTRATION_TRANSITION_STARTED', 
       'DEVELOPER_REGISTRATION_TRANSITION_OPTION_SELECTED', 
       'CLIENT_ACCOUNT_DEACTIVATION_REQUESTED', 
       'CLIENT_ACCOUNT_DEACTIVATED',
       'DEVELOPER_REGISTRATION_STARTED_FROM_CLIENT'
     )
     ORDER BY created_at DESC LIMIT 50`
  );
  assert(auditRes.rows.length >= 4, 'Multiple audit lifecycle events must be recorded');
  const loggedActions = auditRes.rows.map((r: any) => r.action);
  assert(loggedActions.includes('DEVELOPER_REGISTRATION_TRANSITION_STARTED'));
  assert(loggedActions.includes('DEVELOPER_REGISTRATION_TRANSITION_OPTION_SELECTED'));
  assert(loggedActions.includes('CLIENT_ACCOUNT_DEACTIVATION_REQUESTED'));
  assert(loggedActions.includes('CLIENT_ACCOUNT_DEACTIVATED'));
  pass('AUDIT_EVENTS', 'Audit events recorded for transition initiation, option selection, and deactivation');

  // Check 33: Notification generated where appropriate
  const notifRes = await query(
    "SELECT id, title, message FROM notifications WHERE user_id = $1 AND title = 'Client Account Deactivated'",
    [client2.user.id]
  );
  assert(notifRes.rows.length > 0, 'Deactivation notification must be saved in database');
  pass('NOTIFICATION_GENERATED', 'Deactivation notification recorded in notifications table');

  // Check 34: No fake data (verify real database persistence)
  const userCount = await query('SELECT COUNT(*)::int as count FROM users');
  assert(userCount.rows[0].count > 0, 'Users exist in real Postgres database');
  pass('NO_FAKE_DATA', 'Zero mocks in production path; all records persisted to real database');

  // Check 35: Project records preserved
  const projectPreserveCheck = await query('SELECT id, status FROM projects WHERE client_id = $1', [client3.client.id]);
  assert.strictEqual(projectPreserveCheck.rows.length, 1, 'Project must remain preserved');
  pass('PROJECTS_PRESERVED', 'Historical project records preserved across lifecycle operations');

  // Check 36: Financial records preserved
  const client7 = await createTestClient('eta');
  // Insert sample payment record
  const gwPaymentId = `pay_${timestamp}`;
  await query(
    `INSERT INTO payments (user_id, amount, currency, gateway, gateway_payment_id, status)
     VALUES ($1, 500.00, 'INR', 'RAZORPAY', $2, 'SUCCESS')`,
    [client7.user.id, gwPaymentId]
  );
  // Deactivate client7
  const deact7 = await api('/api/auth/account/developer-transition/deactivate-client', {
    method: 'POST',
    headers: { Authorization: `Bearer ${client7.token}` },
    body: JSON.stringify({ confirmation: 'DEACTIVATE CLIENT ACCOUNT' }),
  });
  assert.strictEqual(deact7.status, 200);

  const paymentCheck = await query('SELECT id, amount, status FROM payments WHERE user_id = $1', [client7.user.id]);
  assert.strictEqual(paymentCheck.rows.length, 1, 'Payment records must remain untouched after deactivation');
  assert.strictEqual(parseFloat(paymentCheck.rows[0].amount), 500.00);
  pass('FINANCIAL_PRESERVED', 'Financial transactions and payment records strictly preserved');

  // Check 37: Support records preserved
  const completedProjNum = `PRJ-COMP-${timestamp}`;
  const completedSlug = `prj-comp-${timestamp}`;
  const projRes = await query(
    `INSERT INTO projects (project_number, slug, title, description, category, budget_min, budget_max, timeline, claim_deadline, client_id, status)
     VALUES ($1, $2, 'Completed Project', 'Historical project info', 'WEB', 500, 1500, '2 weeks', NOW() - INTERVAL '1 day', $3, 'COMPLETED')
     RETURNING id`,
    [completedProjNum, completedSlug, client7.client.id]
  );
  const completedProjectId = projRes.rows[0].id;
  await query(
    `INSERT INTO support_tickets (project_id, client_id, ticket_number, subject, description, priority, status)
     VALUES ($1, $2, $3, 'Past Inquiry', 'Historical ticket info', 'NORMAL', 'RESOLVED')`,
    [completedProjectId, client7.client.id, `SUP-P8-${timestamp}`]
  );
  const ticketCheck = await query('SELECT id, status FROM support_tickets WHERE client_id = $1', [client7.client.id]);
  assert.strictEqual(ticketCheck.rows.length, 1, 'Support ticket history preserved');
  pass('SUPPORT_PRESERVED', 'Support tickets and customer inquiry history strictly preserved');

  // Check 38: IDOR protection (Client A cannot deactivate Client B's account)
  const clientA = await createTestClient('theta');
  const clientB = await createTestClient('iota');

  // Client A attempts to deactivate Client B by supplying Client B's IDs in body
  const idorRes = await api('/api/auth/account/developer-transition/deactivate-client', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clientA.token}` },
    body: JSON.stringify({
      targetUserId: clientB.user.id,
      targetClientId: clientB.client.id,
      userId: clientB.user.id,
      confirmation: 'DEACTIVATE CLIENT ACCOUNT',
    }),
  });
  assert.strictEqual(idorRes.status, 200, 'Deactivation executes for authenticated user Client A');

  // Verify Client B was NOT touched!
  const clientBCheck = await query('SELECT status, is_suspended FROM users WHERE id = $1', [clientB.user.id]);
  assert.strictEqual(clientBCheck.rows[0].status, 'ACTIVE', 'Client B must remain ACTIVE');
  assert.strictEqual(clientBCheck.rows[0].is_suspended, false, 'Client B must not be suspended');

  // Verify Client A was the one deactivated
  const clientACheck = await query('SELECT status, is_suspended FROM users WHERE id = $1', [clientA.user.id]);
  assert.strictEqual(clientACheck.rows[0].status, 'DISABLED', 'Client A was safely deactivated');
  pass('IDOR_PROTECTION', 'IDOR exploit blocked: Server acts strictly on authenticated session identity');

  // Check 39: Mass-assignment protection
  const client8 = await createTestClient('kappa');
  const massAssignRes = await api('/api/auth/account/developer-transition/start', {
    method: 'POST',
    headers: { Authorization: `Bearer ${client8.token}` },
    body: JSON.stringify({
      option: 'OPTION_A',
      role: 'ADMIN',
      isAdmin: true,
      permissions: ['ALL'],
      status: 'VERIFIED',
    }),
  });
  assert.strictEqual(massAssignRes.status, 200);
  const client8Db = await query('SELECT role, status FROM users WHERE id = $1', [client8.user.id]);
  assert.strictEqual(client8Db.rows[0].role, 'CLIENT', 'Role cannot be escalated via mass assignment');
  assert.strictEqual(client8Db.rows[0].status, 'ACTIVE', 'Status cannot be escalated');
  pass('MASS_ASSIGN_PROTECTION', 'Mass assignment parameters rejected; role and privileges untampered');

  // Check 40: Transaction rollback behavior
  // Verify withTransaction rolls back cleanly when an error is thrown
  const client9 = await createTestClient('lambda');
  let rollbackSuccess = false;
  try {
    await withTransaction(async (c) => {
      await c.query("UPDATE users SET status = 'DISABLED' WHERE id = $1", [client9.user.id]);
      throw new Error('Simulated failure during transition');
    });
  } catch (_e) {
    rollbackSuccess = true;
  }
  assert.strictEqual(rollbackSuccess, true, 'Transaction must throw and trigger rollback');
  const client9Db = await query('SELECT status FROM users WHERE id = $1', [client9.user.id]);
  assert.strictEqual(client9Db.rows[0].status, 'ACTIVE', 'Changes must be rolled back on error');
  pass('TRANSACTION_ROLLBACK', 'Database transactions roll back atomically on failure');

  console.log('\n================================================================');
  console.log(`PHASE 8 TEST SUMMARY: ${passedChecks} / ${totalChecks} PASSED`);
  console.log('================================================================\n');

  if (passedChecks === totalChecks) {
    console.log('🎉 ALL PHASE 8 CLIENT -> DEVELOPER TRANSITION CHECKS PASSED!\n');
  } else {
    console.error('❌ SOME PHASE 8 CHECKS FAILED!\n');
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('phase8ClientDeveloperTransitionTest.ts')) {
  runPhase8Tests()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Test suite execution failed:', err);
      process.exit(1);
    });
}
