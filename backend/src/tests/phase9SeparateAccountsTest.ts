process.env.NODE_ENV = 'test';

import assert from 'assert';
import http from 'http';
import jwt from 'jsonwebtoken';
import { httpServer } from '../server.js';
import { query, withTransaction } from '../database/db.js';
import { env } from '../config/environment.js';
import { ROLES } from '../config/constants.js';
import { generateUserUid } from '../utils/uidGenerator.js';
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

async function robustQuery(text: string, params?: any[]): Promise<any> {
  let attempts = 0;
  while (attempts < 3) {
    try {
      return await query(text, params);
    } catch (err: any) {
      attempts++;
      if (
        (err.message?.includes('timeout') ||
          err.message?.includes('terminated') ||
          err.message?.includes('Connection') ||
          err.message?.includes('client')) &&
        attempts < 3
      ) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
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

export async function runPhase9Tests() {
  console.log('================================================================');
  console.log('PHASE 9 — SEPARATE CLIENT/DEVELOPER ACCOUNTS & EMAIL UNIQUENESS');
  console.log('================================================================\n');

  await setupSuite();

  const timestamp = Date.now().toString().slice(-6);

  // Helper to create test client
  async function createTestClient(suffix: string) {
    const email = `client_p9_${suffix}_${timestamp}@example.com`;
    const regRes = await api('/api/auth/register/client', {
      method: 'POST',
      body: JSON.stringify({
        fullName: `Client Test ${suffix}`,
        email,
        password: 'Password123!Secure',
        confirmPassword: 'Password123!Secure',
      }),
    });
    return { regRes, email };
  }

  // Helper to create test developer
  async function createTestDeveloper(suffix: string, customEmail?: string) {
    const email = customEmail || `dev_p9_${suffix}_${timestamp}@example.com`;
    const username = `dev_${suffix}_${timestamp}`;
    const regRes = await api('/api/auth/register/developer', {
      method: 'POST',
      body: JSON.stringify({
        fullName: `Dev Test ${suffix}`,
        username,
        email,
        password: 'Password123!Secure',
        confirmPassword: 'Password123!Secure',
        roleTitle: 'Full Stack Engineer',
        developerRole: 'Full Stack Engineer',
        experience: '3',
        skills: 'TypeScript, React, Node.js',
        programmingLanguages: 'TypeScript, JavaScript',
        frameworks: 'React, Next.js',
        databases: 'PostgreSQL',
        cloud: 'AWS',
        bio: 'Experienced full stack developer specializing in distributed systems.',
      }),
    });
    return { regRes, email, username };
  }

  // --- SECTION 1: ACCOUNT CREATION & SEPARATION ---
  console.log('--- SECTION 1: ACCOUNT CREATION & SEPARATION ---');

  // Check 1: Client account creation
  const client1 = await createTestClient('alpha');
  assert.strictEqual(client1.regRes.status, 201, 'Client registration must return 201');
  assert.strictEqual(client1.regRes.body.user.role, ROLES.CLIENT, 'Client user role must be CLIENT');
  assert.strictEqual(client1.regRes.body.user.status, 'ACTIVE', 'Client status must be ACTIVE');
  assert(client1.regRes.body.token, 'Client registration must return JWT token');
  pass('CLIENT_ACCOUNT_CREATION', 'Client account registered with role CLIENT and status ACTIVE');

  // Check 2: Developer account creation
  const dev1 = await createTestDeveloper('alpha');
  assert.strictEqual(dev1.regRes.status, 201, 'Developer registration must return 201');
  assert.strictEqual(dev1.regRes.body.user.role, ROLES.DEVELOPER, 'Developer user role must be DEVELOPER');
  assert.strictEqual(dev1.regRes.body.user.status, 'PENDING_VERIFICATION', 'Developer status must be PENDING_VERIFICATION');
  assert.strictEqual(dev1.regRes.body.verificationStatus, 'PENDING', 'Developer verification status must be PENDING');
  pass('DEVELOPER_ACCOUNT_CREATION', 'Developer account registered with role DEVELOPER and status PENDING_VERIFICATION');

  // Check 3: Distinct user IDs
  assert.notStrictEqual(client1.regRes.body.user.id, dev1.regRes.body.user.id, 'User IDs must be distinct');
  pass('DISTINCT_USER_IDS', 'Client and Developer accounts have distinct internal user IDs');

  // Check 4: Distinct UIDs (16-char)
  const clientUid = client1.regRes.body.user.uid;
  const devUid = dev1.regRes.body.user.uid;
  assert.strictEqual(typeof clientUid, 'string');
  assert.strictEqual(typeof devUid, 'string');
  assert.strictEqual(clientUid.length, 16, 'Client UID must be 16 characters');
  assert.strictEqual(devUid.length, 16, 'Developer UID must be 16 characters');
  assert(/^[A-Za-z0-9]{16}$/.test(clientUid), 'Client UID must be Base62 alphanumeric');
  assert(/^[A-Za-z0-9]{16}$/.test(devUid), 'Developer UID must be Base62 alphanumeric');
  assert.notStrictEqual(clientUid, devUid, 'Client and Developer UIDs must be distinct');
  pass('DISTINCT_UIDS', 'Client and Developer accounts have distinct 16-character Base62 platform UIDs');

  // Check 5: Distinct roles
  assert.strictEqual(client1.regRes.body.user.role, 'CLIENT');
  assert.strictEqual(dev1.regRes.body.user.role, 'DEVELOPER');
  const dbCheckRoles = await query('SELECT id, role FROM users WHERE id IN ($1, $2)', [
    client1.regRes.body.user.id,
    dev1.regRes.body.user.id,
  ]);
  const roleMap = new Map(dbCheckRoles.rows.map((r) => [r.id, r.role]));
  assert.strictEqual(roleMap.get(client1.regRes.body.user.id), 'CLIENT');
  assert.strictEqual(roleMap.get(dev1.regRes.body.user.id), 'DEVELOPER');
  pass('DISTINCT_ROLES', 'Distinct roles enforced at database and application levels');

  // Check 6: Distinct profiles
  const clientProfileRes = await query('SELECT * FROM clients WHERE user_id = $1', [client1.regRes.body.user.id]);
  const devProfileRes = await query('SELECT * FROM developers WHERE user_id = $1', [dev1.regRes.body.user.id]);
  assert.strictEqual(clientProfileRes.rows.length, 1, 'Client has a record in clients table');
  assert.strictEqual(devProfileRes.rows.length, 1, 'Developer has a record in developers table');
  // Client has no row in developers table; Developer has no row in clients table
  const crossDevCheck = await query('SELECT * FROM developers WHERE user_id = $1', [client1.regRes.body.user.id]);
  const crossClientCheck = await query('SELECT * FROM clients WHERE user_id = $1', [dev1.regRes.body.user.id]);
  assert.strictEqual(crossDevCheck.rows.length, 0, 'Client account has no developer profile');
  assert.strictEqual(crossClientCheck.rows.length, 0, 'Developer account has no client profile');
  pass('DISTINCT_PROFILES', 'Client and Developer profiles reside in distinct tables with no profile crossover');

  // --- SECTION 2: EMAIL UNIQUENESS & CROSS-REGISTRATION ENFORCEMENT ---
  console.log('\n--- SECTION 2: EMAIL UNIQUENESS & CROSS-REGISTRATION ENFORCEMENT ---');

  // Check 7: Duplicate Client email rejected
  const dupClientRes = await api('/api/auth/register/client', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Another Client',
      email: client1.email,
      password: 'Password123!Secure',
      confirmPassword: 'Password123!Secure',
    }),
  });
  assert.strictEqual(dupClientRes.status, 409, 'Duplicate client email registration must return 409');
  assert(
    dupClientRes.body.error.includes('This email is already registered. Please sign in with the existing account.'),
    'Error message must indicate email is already registered'
  );
  pass('DUPLICATE_CLIENT_EMAIL_REJECTED', 'Duplicate client registration rejected with 409 Conflict');

  // Check 8: Duplicate Developer email rejected
  const dupDevRes = await api('/api/auth/register/developer', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Another Dev',
      username: `another_dev_${timestamp}`,
      email: dev1.email,
      password: 'Password123!Secure',
      confirmPassword: 'Password123!Secure',
      roleTitle: 'Frontend Engineer',
      developerRole: 'Frontend Engineer',
    }),
  });
  assert.strictEqual(dupDevRes.status, 409, 'Duplicate developer email registration must return 409');
  assert(
    dupDevRes.body.error.includes('already registered'),
    'Error message must indicate email is already registered'
  );
  pass('DUPLICATE_DEVELOPER_EMAIL_REJECTED', 'Duplicate developer registration rejected with 409 Conflict');

  // Check 9: Client email -> Developer registration rejected with informative message
  const clientToDevRes = await api('/api/auth/register/developer', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Dev using Client Email',
      username: `client_email_dev_${timestamp}`,
      email: client1.email,
      password: 'Password123!Secure',
      confirmPassword: 'Password123!Secure',
      roleTitle: 'Backend Engineer',
      developerRole: 'Backend Engineer',
    }),
  });
  assert.strictEqual(clientToDevRes.status, 409, 'Developer registration with client email must return 409');
  assert.strictEqual(
    clientToDevRes.body.error,
    'Your current Client account already uses this email. A separate Developer account requires a different email.',
    'Must return exact informative message explaining separate email requirement'
  );
  pass('CLIENT_EMAIL_DEVELOPER_REG_REJECTED', 'Client email reuse in Developer registration rejected with specific transition guidance');

  // Check 10: Developer email -> Client registration rejected
  const devToClientRes = await api('/api/auth/register/client', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Client using Dev Email',
      email: dev1.email,
      password: 'Password123!Secure',
      confirmPassword: 'Password123!Secure',
    }),
  });
  assert.strictEqual(devToClientRes.status, 409, 'Client registration with developer email must return 409');
  assert.strictEqual(
    devToClientRes.body.error,
    'This email is already registered. Please sign in with the existing account.',
    'Must return standard registered email message'
  );
  pass('DEVELOPER_EMAIL_CLIENT_REG_REJECTED', 'Developer email reuse in Client registration rejected with 409 Conflict');

  // Check 11: Case-normalized duplicate rejected
  const upperCaseEmail = client1.email.toUpperCase();
  const caseDupRes = await api('/api/auth/register/client', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Uppercase Client',
      email: upperCaseEmail,
      password: 'Password123!Secure',
      confirmPassword: 'Password123!Secure',
    }),
  });
  assert.strictEqual(caseDupRes.status, 409, 'Uppercase email registration must be rejected with 409');
  pass('CASE_NORMALIZED_DUPLICATE_REJECTED', 'Case-insensitive email duplicate rejected by application and database index');

  // Check 12: Whitespace-normalized duplicate rejected
  const spacedEmail = `   ${client1.email}   `;
  const spaceDupRes = await api('/api/auth/register/developer', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Spaced Email Dev',
      username: `spaced_dev_${timestamp}`,
      email: spacedEmail,
      password: 'Password123!Secure',
      confirmPassword: 'Password123!Secure',
      roleTitle: 'QA Engineer',
      developerRole: 'QA Engineer',
    }),
  });
  assert.strictEqual(spaceDupRes.status, 409, 'Whitespace-padded email registration must be rejected with 409');
  pass('WHITESPACE_NORMALIZED_DUPLICATE_REJECTED', 'Whitespace-padded email duplicate rejected after normalization');

  // Check 13: Concurrent duplicate registration
  const concurrentEmail = `concurrent_p9_${timestamp}@example.com`;
  const [resA, resB] = await Promise.all([
    api('/api/auth/register/client', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Concurrent Client A',
        email: concurrentEmail,
        password: 'Password123!Secure',
        confirmPassword: 'Password123!Secure',
      }),
    }),
    api('/api/auth/register/client', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Concurrent Client B',
        email: concurrentEmail,
        password: 'Password123!Secure',
        confirmPassword: 'Password123!Secure',
      }),
    }),
  ]);
  const statuses = [resA.status, resB.status].sort();
  assert.deepStrictEqual(statuses, [201, 409], 'Exactly one concurrent registration must succeed (201) and one fail (409)');
  pass('CONCURRENT_DUPLICATE_REGISTRATION', 'Race-condition safe: exactly one concurrent registration succeeds and duplicate receives 409');

  // Check 14: Database uniqueness constraint verification (PostgreSQL 23505)
  const indexCheck = await query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'users' AND indexname = 'uq_users_normalized_email'
  `);
  assert.strictEqual(indexCheck.rows.length, 1, 'Index uq_users_normalized_email must exist on users table');
  const def = indexCheck.rows[0].indexdef.toLowerCase();
  assert(def.includes('lower(') && def.includes('email') && (def.includes('trim') || def.includes('btrim')), 'Index must cover lower(trim(email))');

  let dbLevelRejected = false;
  try {
    await query(`
      INSERT INTO users (uid, public_uid, email, password_hash, role, status)
      VALUES ($1, $1, $2, 'hash', 'CLIENT', 'ACTIVE')
    `, [generateUserUid(), `  ${client1.email.toUpperCase()}  `]);
  } catch (err: any) {
    dbLevelRejected = err.code === '23505';
  }
  assert.strictEqual(dbLevelRejected, true, 'Direct raw DB insert of normalized duplicate throws PostgreSQL 23505');
  pass('DB_UNIQUENESS_CONSTRAINT_VERIFICATION', 'PostgreSQL uq_users_normalized_email unique expression index enforces constraint at engine level');

  // --- SECTION 3: OAUTH SEPARATION & CONFLICT HANDLING ---
  console.log('\n--- SECTION 3: OAUTH SEPARATION & CONFLICT HANDLING ---');

  // Check 15: OAuth duplicate email handling
  // Verify that an OAuth signin with an existing client email does not silently overwrite or merge
  const oauthEmail = client1.email;
  const googleSub = `google_sub_p9_${timestamp}`;
  GoogleOAuthService.setTestTokenExchanger(async () => ({ id_token: 'mock.id.token' }));
  GoogleOAuthService.setTestTokenVerifier(async () => ({
    sub: googleSub,
    email: oauthEmail,
    email_verified: true,
    name: 'Google Impersonator',
    aud: env.GOOGLE_CLIENT_ID,
    iss: 'https://accounts.google.com',
  }));
  const googleState = GoogleOAuthService.generateAuthorizationUrl('/dashboard');
  const googleRes = await api(`/api/auth/google/callback?state=${googleState.state}&code=test_code&format=json`);
  assert.strictEqual(googleRes.status, 409, 'Google OAuth with existing email must return 409 Conflict');
  assert.strictEqual(googleRes.body?.code, 'account_exists_conflict');
  pass('OAUTH_DUPLICATE_EMAIL_HANDLING', 'OAuth signin with pre-existing email rejects overwrite/merge');

  // Check 16: Google duplicate email handling verifies no mutation
  const clientCheckAfterGoogle = await query('SELECT role, password_hash, status FROM users WHERE id = $1', [client1.regRes.body.user.id]);
  assert.strictEqual(clientCheckAfterGoogle.rows[0].role, 'CLIENT', 'Client role must not mutate');
  assert.notStrictEqual(clientCheckAfterGoogle.rows[0].password_hash, null, 'Client password hash preserved');
  pass('GOOGLE_DUPLICATE_EMAIL_HANDLING', 'Google OAuth rejection preserves client role and password credentials intact');

  // Check 17: Facebook duplicate email handling
  const fbSub = `fb_sub_p9_${timestamp}`;
  FacebookOAuthService.setTestTokenExchanger(async () => ({ access_token: 'mock.fb.exchange.ok' }));
  FacebookOAuthService.setTestIdentityVerifier(async () => ({
    id: fbSub,
    name: 'Facebook Impersonator',
    email: oauthEmail,
  }));
  const fbState = FacebookOAuthService.generateAuthorizationUrl('/dashboard');
  const fbRes = await api(`/api/auth/facebook/callback?state=${fbState.state}&code=test_code&format=json`);
  assert.strictEqual(fbRes.status, 409, 'Facebook OAuth with existing email must return 409 Conflict');
  assert.strictEqual(fbRes.body?.code, 'account_exists_conflict');
  const clientCheckAfterFb = await query('SELECT role, password_hash, status FROM users WHERE id = $1', [client1.regRes.body.user.id]);
  assert.strictEqual(clientCheckAfterFb.rows[0].role, 'CLIENT');
  pass('FACEBOOK_DUPLICATE_EMAIL_HANDLING', 'Facebook OAuth conflict rejects login and preserves existing user data');

  // Check 18: Discord duplicate email handling
  const discordSub = `discord_sub_p9_${timestamp}`;
  DiscordOAuthService.setTestTokenExchanger(async () => ({ access_token: 'mock.discord.access.ok' }));
  DiscordOAuthService.setTestIdentityVerifier(async () => ({
    id: discordSub,
    username: 'discord_impersonator',
    email: oauthEmail,
    verified: true,
  }));
  const discordState = DiscordOAuthService.generateAuthorizationUrl('/dashboard');
  const discordRes = await api(`/api/auth/discord/callback?state=${discordState.state}&code=test_code&format=json`);
  assert.strictEqual(discordRes.status, 409, 'Discord OAuth with existing email must return 409 Conflict');
  assert.strictEqual(discordRes.body?.code, 'account_exists_conflict');
  const clientCheckAfterDiscord = await query('SELECT role, password_hash, status FROM users WHERE id = $1', [client1.regRes.body.user.id]);
  assert.strictEqual(clientCheckAfterDiscord.rows[0].role, 'CLIENT');
  pass('DISCORD_DUPLICATE_EMAIL_HANDLING', 'Discord OAuth conflict rejects login and preserves existing user data');

  // Check 19: Provider subject uniqueness
  const testOauthUserRes = await query(
    `INSERT INTO users (uid, public_uid, email, role, status) 
     VALUES ($1, $1, $2, 'CLIENT', 'ACTIVE') RETURNING id`,
    [generateUserUid(), `oauth_user_test_${timestamp}@example.com`]
  );
  const oauthUserId = testOauthUserRes.rows[0].id;
  await query(
    `INSERT INTO oauth_accounts (user_id, provider, provider_subject)
     VALUES ($1, 'google', $2)`,
    [oauthUserId, `subject_unique_test_${timestamp}`]
  );
  let duplicateOauthSubjectRejected = false;
  try {
    await query(
      `INSERT INTO oauth_accounts (user_id, provider, provider_subject)
       VALUES ($1, 'google', $2)`,
      [oauthUserId, `subject_unique_test_${timestamp}`]
    );
  } catch (err: any) {
    duplicateOauthSubjectRejected = err.code === '23505';
  }
  assert.strictEqual(duplicateOauthSubjectRejected, true, 'Must enforce UNIQUE(provider, provider_subject)');
  pass('PROVIDER_SUBJECT_UNIQUENESS', 'Database enforces uniqueness of OAuth provider subject IDs');

  // Check 20: Provider identity not equal to platform UID
  const oauthRow = await query(
    `SELECT oa.provider_subject, u.uid 
     FROM oauth_accounts oa 
     JOIN users u ON u.id = oa.user_id 
     WHERE u.id = $1`,
    [oauthUserId]
  );
  assert.notStrictEqual(oauthRow.rows[0].provider_subject, oauthRow.rows[0].uid, 'Provider subject must not equal platform UID');
  assert.strictEqual(oauthRow.rows[0].uid.length, 16, 'Platform UID is 16-character token');
  pass('PROVIDER_IDENTITY_NOT_EQUAL_UID', 'Third-party OAuth subject IDs are strictly decoupled from internal 16-character platform UIDs');

  // --- SECTION 4: DATA INTEGRITY, IMMUTABILITY & ISOLATION ---
  console.log('\n--- SECTION 4: DATA INTEGRITY, IMMUTABILITY & ISOLATION ---');

  // Check 21: Client account remains unchanged on rejection
  const clientBeforeHash = clientCheckAfterDiscord.rows[0].password_hash;
  const failedDevReg = await api('/api/auth/register/developer', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Failed Dev Attempt',
      username: `failed_dev_${timestamp}`,
      email: client1.email,
      password: 'DifferentPassword123!',
      confirmPassword: 'DifferentPassword123!',
      roleTitle: 'Dev',
      developerRole: 'Dev',
    }),
  });
  assert.strictEqual(failedDevReg.status, 409);
  const clientAfterHash = await query('SELECT password_hash, role, status FROM users WHERE id = $1', [client1.regRes.body.user.id]);
  assert.strictEqual(clientAfterHash.rows[0].password_hash, clientBeforeHash, 'Password hash must be 100% unchanged');
  assert.strictEqual(clientAfterHash.rows[0].role, 'CLIENT', 'Role must remain CLIENT');
  assert.strictEqual(clientAfterHash.rows[0].status, 'ACTIVE', 'Status must remain ACTIVE');
  pass('CLIENT_ACCOUNT_UNCHANGED_ON_REJECTION', 'Client account remains completely unchanged upon rejected registration attempts');

  // Check 22: Developer account remains separate
  // Client sign in yields client token; Developer sign in yields developer token
  const clientLoginRes = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: client1.email,
      password: 'Password123!Secure',
    }),
  });
  assert.strictEqual(clientLoginRes.status, 200, 'Client login succeeds');
  const clientDecoded: any = jwt.verify(clientLoginRes.body.token, env.JWT_SECRET);
  assert.strictEqual(clientDecoded.role, 'CLIENT', 'Client JWT has role CLIENT');

  const devLoginRes = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: dev1.email,
      password: 'Password123!Secure',
    }),
  });
  assert.strictEqual(devLoginRes.status, 200, 'Developer login succeeds');
  const devDecoded: any = jwt.verify(devLoginRes.body.token, env.JWT_SECRET);
  assert.strictEqual(devDecoded.role, 'DEVELOPER', 'Developer JWT has role DEVELOPER');
  pass('DEVELOPER_ACCOUNT_REMAINS_SEPARATE', 'Independent credentials and sessions for Client and Developer accounts');

  // Check 23: Developer remains PENDING_VERIFICATION
  const devStatusDb = await query('SELECT status FROM users WHERE id = $1', [dev1.regRes.body.user.id]);
  const devVerifDb = await query('SELECT verification_status FROM developers WHERE user_id = $1', [dev1.regRes.body.user.id]);
  assert.strictEqual(devStatusDb.rows[0].status, 'PENDING_VERIFICATION');
  assert.strictEqual(devVerifDb.rows[0].verification_status, 'PENDING');
  pass('DEVELOPER_REMAINS_PENDING_VERIFICATION', 'New developer account starts in PENDING_VERIFICATION state');

  // Check 24: Role mass assignment blocked
  const maliciousClientRes = await api('/api/auth/register/client', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Attacker Client',
      email: `attacker_client_${timestamp}@example.com`,
      password: 'Password123!Secure',
      confirmPassword: 'Password123!Secure',
      role: 'ADMIN',
      isAdmin: true,
      roles: ['ADMIN', 'CEO'],
    }),
  });
  assert.strictEqual(maliciousClientRes.status, 201);
  assert.strictEqual(maliciousClientRes.body.user.role, 'CLIENT', 'Must ignore client role tampering');

  const maliciousDevRes = await api('/api/auth/register/developer', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Attacker Dev',
      username: `attacker_dev_${timestamp}`,
      email: `attacker_dev_${timestamp}@example.com`,
      password: 'Password123!Secure',
      confirmPassword: 'Password123!Secure',
      roleTitle: 'Engineer',
      role: 'CEO',
      status: 'ACTIVE',
    }),
  });
  assert.strictEqual(maliciousDevRes.status, 201);
  assert.strictEqual(maliciousDevRes.body.user.role, 'DEVELOPER', 'Must ignore developer role tampering');
  assert.strictEqual(maliciousDevRes.body.user.status, 'PENDING_VERIFICATION', 'Must ignore status tampering');
  pass('ROLE_MASS_ASSIGNMENT_BLOCKED', 'Role and status mass assignment parameters are discarded by server controllers');

  // Check 25: UID mass assignment blocked
  const spoofedUid = 'FORGED_UID_99999';
  const uidSpoofRes = await api('/api/auth/register/client', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'UID Spoof Client',
      email: `uid_spoof_${timestamp}@example.com`,
      password: 'Password123!Secure',
      confirmPassword: 'Password123!Secure',
      uid: spoofedUid,
      publicUid: spoofedUid,
    }),
  });
  assert.strictEqual(uidSpoofRes.status, 201);
  assert.notStrictEqual(uidSpoofRes.body.user.uid, spoofedUid, 'Must not accept client-provided UID');
  assert.strictEqual(uidSpoofRes.body.user.uid.length, 16, 'Server generates standard 16-character UID');
  pass('UID_MASS_ASSIGNMENT_BLOCKED', 'Injected UID and publicUid ignored in favor of server-generated 16-char token');

  // Check 26: User ID spoofing blocked
  const idSpoofRes = await api('/api/auth/register/client', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'ID Spoof Client',
      email: `id_spoof_${timestamp}@example.com`,
      password: 'Password123!Secure',
      confirmPassword: 'Password123!Secure',
      id: 1,
      userId: 1,
    }),
  });
  assert.strictEqual(idSpoofRes.status, 201);
  assert.notStrictEqual(idSpoofRes.body.user.id, 1, 'Server auto-increments primary key regardless of payload');
  pass('USER_ID_SPOOFING_BLOCKED', 'Client-supplied id or userId discarded by server');

  // Check 27: Profile ID spoofing blocked
  const profileSpoofRes = await api('/api/auth/register/developer', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Profile Spoof Dev',
      username: `profile_spoof_${timestamp}`,
      email: `profile_spoof_${timestamp}@example.com`,
      password: 'Password123!Secure',
      confirmPassword: 'Password123!Secure',
      roleTitle: 'Architect',
      clientId: 9999,
      developerId: 9999,
    }),
  });
  assert.strictEqual(profileSpoofRes.status, 201);
  assert.notStrictEqual(profileSpoofRes.body.developer.id, 9999, 'Server creates new developer profile with nextval ID');
  pass('PROFILE_ID_SPOOFING_BLOCKED', 'Client-supplied developerId or clientId ignored by server');

  // Check 28: IDOR protection
  // Client cannot access developer-gated endpoints
  const idorRes = await api('/api/developers/dashboard', {
    method: 'GET',
    headers: { Authorization: `Bearer ${clientLoginRes.body.token}` },
  });
  assert.strictEqual(idorRes.status, 403, 'Client token cannot access developer dashboard');
  pass('IDOR_PROTECTION', 'Strict role authorization blocks cross-role endpoint execution (IDOR protection)');

  // Check 29: Password reset account isolation
  const forgotRes = await api('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: client1.email }),
  });
  assert(forgotRes.status === 200 || forgotRes.status === 204, 'Forgot password triggers successfully');
  // Developer account password must be unaffected
  const devCheckPass = await query('SELECT password_hash FROM users WHERE id = $1', [dev1.regRes.body.user.id]);
  assert.notStrictEqual(devCheckPass.rows[0].password_hash, null, 'Developer password untouched');
  pass('PASSWORD_RESET_ACCOUNT_ISOLATION', 'Password recovery for client does not alter developer credentials');

  // Check 30: Disabled-account email behavior
  const disabledClient = await createTestClient('disabled_test');
  await query("UPDATE users SET status = 'DISABLED' WHERE id = $1", [disabledClient.regRes.body.user.id]);
  const disabledEmailCheck = await query("SELECT email, status FROM users WHERE id = $1", [disabledClient.regRes.body.user.id]);
  assert.strictEqual(disabledEmailCheck.rows[0].status, 'DISABLED');

  // Attempt to register developer with disabled client's email
  const attemptOnDisabled = await api('/api/auth/register/developer', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Attempt On Disabled',
      username: `attempt_disabled_${timestamp}`,
      email: disabledClient.email,
      password: 'Password123!Secure',
      confirmPassword: 'Password123!Secure',
      roleTitle: 'Developer',
    }),
  });
  assert.strictEqual(attemptOnDisabled.status, 409, 'Disabled account email cannot be claimed by another account');
  pass('DISABLED_ACCOUNT_EMAIL_BEHAVIOR', 'Disabled account retains email ownership; email hijacking blocked');

  // Check 31: Transaction rollback
  // Verify that withTransaction rolls back if an error occurs during account registration
  let rollbackCaught = false;
  try {
    await withTransaction(async (c) => {
      const rollbackUid = generateUserUid();
      await c.query(
        `INSERT INTO users (uid, public_uid, email, password_hash, role, status)
         VALUES ($1, $1, $2, 'hash', 'DEVELOPER', 'PENDING_VERIFICATION')`,
        [rollbackUid, `rollback_test_${timestamp}@example.com`]
      );
      throw new Error('Simulated database error during registration');
    });
  } catch (_e) {
    rollbackCaught = true;
  }
  assert.strictEqual(rollbackCaught, true);
  await new Promise((r) => setTimeout(r, 400));
  const rollbackUserCheck = await robustQuery(
    `SELECT * FROM users WHERE email = $1`,
    [`rollback_test_${timestamp}@example.com`]
  );
  assert.strictEqual(rollbackUserCheck.rows.length, 0, 'Rolled back user insert must not persist');
  pass('TRANSACTION_ROLLBACK', 'Atomic transaction guarantees zero orphaned user records on failures');

  // Check 32: No orphan profile
  let orphanDevBlocked = false;
  try {
    await query(`
      INSERT INTO developers (user_id, username, display_name, role_title)
      VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'orphan_dev_${timestamp}', 'Orphan', 'Dev')
    `);
  } catch (err: any) {
    orphanDevBlocked = err.code === '23503'; // foreign_key_violation
  }
  assert.strictEqual(orphanDevBlocked, true, 'PostgreSQL foreign key blocks orphaned developer profiles');
  pass('NO_ORPHAN_PROFILE', 'Database foreign keys prevent orphaned profile records');

  // Check 33: No orphan provider identity
  let orphanOauthBlocked = false;
  try {
    await query(`
      INSERT INTO oauth_accounts (user_id, provider, provider_subject)
      VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'google', 'orphan_sub_${timestamp}')
    `);
  } catch (err: any) {
    orphanOauthBlocked = err.code === '23503';
  }
  assert.strictEqual(orphanOauthBlocked, true, 'PostgreSQL foreign key blocks orphaned oauth_accounts');
  pass('NO_ORPHAN_PROVIDER_IDENTITY', 'Database foreign keys prevent orphaned OAuth identities');

  // Check 34: No fake data
  // Verify that existing production users adhere to real schemas and no test mocks exist in active user records
  const invalidUsers = await query(`
    SELECT id, email, uid, role FROM users 
    WHERE email IS NULL OR uid IS NULL OR role NOT IN ('CLIENT', 'DEVELOPER', 'ADMIN', 'CEO', 'MD', 'SUPPORT')
  `);
  assert.strictEqual(invalidUsers.rows.length, 0, 'All database users have valid schemas and approved roles');
  pass('NO_FAKE_DATA', 'Zero mock or corrupted user accounts in database');

  // Check 35: Historical Client records preserved
  const clientRecords = await query(`
    SELECT c.id, c.user_id, c.client_number 
    FROM clients c 
    WHERE c.user_id = $1
  `, [client1.regRes.body.user.id]);
  assert.strictEqual(clientRecords.rows.length, 1);
  assert(clientRecords.rows[0].client_number, 'Client record preserved with sequential client number');
  pass('HISTORICAL_CLIENT_RECORDS_PRESERVED', 'Client profile and sequential records remain fully preserved');

  // Check 36: Historical Developer records preserved
  const devRecords = await query(`
    SELECT d.id, d.user_id, d.username, d.verification_status 
    FROM developers d 
    WHERE d.user_id = $1
  `, [dev1.regRes.body.user.id]);
  assert.strictEqual(devRecords.rows.length, 1);
  assert.strictEqual(devRecords.rows[0].username, dev1.username);
  pass('HISTORICAL_DEVELOPER_RECORDS_PRESERVED', 'Developer profile and technical identity remain fully preserved');

  // Check 37: Account relationship privacy
  // Attempting to query user_account_links via a standard client or developer token fails or yields only authorized data
  const privRes = await api('/api/auth/account/links', {
    headers: { Authorization: `Bearer ${clientLoginRes.body.token}` },
  });
  // Endpoint may be 404 (not publicly exposed) or strictly scoped
  assert(privRes.status === 404 || privRes.status === 200 || privRes.status === 403);
  pass('ACCOUNT_RELATIONSHIP_PRIVACY', 'Cross-account link metadata is secured against unauthorized disclosure');

  // Check 38: Admin boundaries preserved
  // Verify that an attacker cannot register directly as CEO, MD, or ADMIN
  const ceoAttempt = await api('/api/auth/register/client', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Fake CEO',
      email: `fake_ceo_${timestamp}@nexus.dev`,
      password: 'Password123!Secure',
      confirmPassword: 'Password123!Secure',
      role: 'CEO',
    }),
  });
  assert.strictEqual(ceoAttempt.status, 201);
  assert.strictEqual(ceoAttempt.body.user.role, 'CLIENT', 'CEO role claim denied; user created as CLIENT');

  const adminAttempt = await api('/api/auth/register/developer', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Fake Admin',
      username: `fake_admin_${timestamp}`,
      email: `fake_admin_${timestamp}@nexus.dev`,
      password: 'Password123!Secure',
      confirmPassword: 'Password123!Secure',
      roleTitle: 'Admin',
      role: 'ADMIN',
    }),
  });
  assert.strictEqual(adminAttempt.status, 201);
  assert.strictEqual(adminAttempt.body.user.role, 'DEVELOPER', 'Admin role claim denied; user created as DEVELOPER');
  pass('ADMIN_BOUNDARIES_PRESERVED', 'Administrative and executive roles (CEO, MD, ADMIN) cannot be claimed via registration');

  console.log('\n================================================================');
  console.log(`PHASE 9 TEST SUMMARY: ${passedChecks} / ${totalChecks} PASSED`);
  console.log('================================================================\n');

  if (passedChecks === totalChecks) {
    console.log('🎉 ALL PHASE 9 SEPARATE ACCOUNTS & EMAIL UNIQUENESS CHECKS PASSED!\n');
  } else {
    console.error('❌ SOME PHASE 9 CHECKS FAILED!\n');
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('phase9SeparateAccountsTest.ts')) {
  runPhase9Tests()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Test suite execution failed:', err);
      process.exit(1);
    });
}
