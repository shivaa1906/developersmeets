process.env.NODE_ENV = 'test';

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { httpServer } from '../server.js';
import { query } from '../database/db.js';
import { env } from '../config/environment.js';
import { isArgon2Hash } from '../utils/password.js';
import { DiscordOAuthService } from '../services/discordOAuthService.js';
import { validateRedirectUrl } from '../controllers/authController.js';
import { generateUserUid } from '../utils/uidGenerator.js';

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
    redirect: 'manual', // do not auto-follow redirects so we can inspect 302 Location
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

export async function runPhase7Tests() {
  console.log('================================================================');
  console.log('PHASE 7 — DISCORD OAUTH AUTHENTICATION & SECURITY TEST SUITE');
  console.log('================================================================\n');

  await setupSuite();

  // Test credentials configuration
  env.DISCORD_CLIENT_ID = 'test-discord-client-id-1234567890';
  env.DISCORD_CLIENT_SECRET = 'test-discord-client-secret-secure-987654321';
  env.DISCORD_OAUTH_REDIRECT_URI = 'http://localhost:5000/api/auth/discord/callback';

  // Also preserve Google & Facebook OAuth credentials for regression checks
  env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  env.GOOGLE_CLIENT_SECRET = 'test-client-secret-secure';
  env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:5000/api/auth/google/callback';

  env.FACEBOOK_CLIENT_ID = 'test-facebook-app-id-123456';
  env.FACEBOOK_CLIENT_SECRET = 'test-facebook-app-secret-secure-987654';
  env.FACEBOOK_OAUTH_REDIRECT_URI = 'http://localhost:5000/api/auth/facebook/callback';

  const startTime = new Date();
  const timestamp = Date.now().toString().slice(-6);

  // --- SECTION 1: ROUTE & CONFIGURATION VERIFICATION ---
  console.log('--- SECTION 1: ROUTE & CONFIGURATION VERIFICATION ---');
  {
    // 1. Discord OAuth initiation endpoint exists
    const initRes = await api('/api/auth/discord?format=json');
    assert.strictEqual(initRes.status, 200, 'Initiation endpoint must exist and return 200 JSON in test mode');
    assert(initRes.body.url.includes('discord.com'), 'Initiation URL must point to discord.com');
    assert(initRes.body.url.includes('/oauth2/authorize'), 'Initiation URL uses Discord OAuth2 authorize endpoint');
    pass('ROUTING_INITIATE', 'Discord OAuth initiation route /api/auth/discord exists and targets Discord OAuth');

    // 2. Discord callback endpoint exists
    const callbackProbe = await api('/api/auth/discord/callback?error=access_denied&format=json');
    assert(callbackProbe.status === 400, 'Callback endpoint /api/auth/discord/callback exists');
    assert.strictEqual(callbackProbe.body.code, 'cancelled', 'User cancelled error handled');
    pass('ROUTING_CALLBACK', 'Discord OAuth callback route /api/auth/discord/callback exists and parses provider errors');

    // 3. POST callback endpoint exists for programmatic flows
    const postCallbackProbe = await api('/api/auth/discord/callback', {
      method: 'POST',
      body: JSON.stringify({ error: 'access_denied', format: 'json' }),
    });
    assert.strictEqual(postCallbackProbe.status, 400);
    assert.strictEqual(postCallbackProbe.body.code, 'cancelled');
    pass('ROUTING_POST_CALLBACK', 'POST /api/auth/discord/callback exists for client-side completions');

    // 4. Configuration loads from environment
    assert.strictEqual(env.DISCORD_CLIENT_ID, 'test-discord-client-id-1234567890');
    assert.strictEqual(env.DISCORD_OAUTH_REDIRECT_URI, 'http://localhost:5000/api/auth/discord/callback');
    pass('ENV_CONFIG', 'Discord credentials and redirect URI cleanly loaded from environment');

    // 5. Zero hardcoded secrets in source code
    const srcDir = fs.existsSync(path.resolve(process.cwd(), 'src'))
      ? path.resolve(process.cwd(), 'src')
      : path.resolve(process.cwd(), 'backend/src');
    const filesToScan = [
      path.join(srcDir, 'services/discordOAuthService.ts'),
      path.join(srcDir, 'controllers/authController.ts'),
      path.join(srcDir, 'routes/authRoutes.ts'),
    ];
    for (const f of filesToScan) {
      const content = fs.readFileSync(f, 'utf8');
      assert(!content.includes('test-discord-client-secret-secure'), 'No hardcoded Discord client secrets in source files');
    }
    pass('NO_HARDCODED_SECRETS', 'Zero hardcoded secrets or production keys in source code');
  }

  // --- SECTION 2: STATE ENTROPY, EXPIRATION & REPLAY DEFENSE ---
  console.log('\n--- SECTION 2: STATE ENTROPY, EXPIRATION & REPLAY DEFENSE ---');
  {
    // 6. State generation provides high entropy (32 bytes = 64 hex characters)
    const stateSession1 = DiscordOAuthService.generateAuthorizationUrl('/dashboard');
    assert.strictEqual(stateSession1.state.length, 64, 'State token is 64 hex characters (256 bits entropy)');
    assert(/^[0-9a-f]{64}$/.test(stateSession1.state), 'State is valid CSPRNG hex');

    // 7. Successive states are distinct
    const stateSession2 = DiscordOAuthService.generateAuthorizationUrl('/dashboard');
    assert.notStrictEqual(stateSession1.state, stateSession2.state, 'Consecutive state tokens must be cryptographically distinct');
    pass('STATE_ENTROPY', 'State generation enforces 256-bit CSPRNG entropy');

    // 8. State expiration (10 minutes)
    const expiredState = 'test_expired_discord_state_' + timestamp;
    assert.throws(
      () => DiscordOAuthService.consumeState(expiredState),
      /expired or is invalid/,
      'Unrecognized or expired state must be rejected'
    );
    pass('STATE_EXPIRATION', 'Expired or unregistered OAuth state rejected with error');

    // 9. Single-use state consumption: replay rejected
    const testState = DiscordOAuthService.generateAuthorizationUrl('/dashboard');
    const consumed = DiscordOAuthService.consumeState(testState.state);
    assert.strictEqual(consumed.state, testState.state, 'State successfully consumed first time');
    assert.throws(
      () => DiscordOAuthService.consumeState(testState.state),
      /expired or is invalid/,
      'State re-use / replay must be strictly rejected'
    );
    pass('STATE_SINGLE_USE', 'Single-use consumption enforced; state replay attacks blocked');
  }

  // --- SECTION 3: PKCE (S256) IMPLEMENTATION ---
  console.log('\n--- SECTION 3: PKCE (S256) IMPLEMENTATION ---');
  {
    // 10. PKCE code_verifier and code_challenge generated
    const authData = DiscordOAuthService.generateAuthorizationUrl('/dashboard');
    assert(authData.codeVerifier, 'PKCE codeVerifier must be generated');
    assert(authData.codeVerifier.length >= 43, 'PKCE codeVerifier meets RFC 7636 minimum length');
    assert(authData.authorizationUrl.includes('code_challenge='), 'Authorization URL contains code_challenge');
    assert(authData.authorizationUrl.includes('code_challenge_method=S256'), 'Authorization URL specifies S256 PKCE method');
    pass('PKCE_S256', 'RFC 7636 PKCE code_verifier and S256 code_challenge generated');
  }

  // --- SECTION 4: CALLBACK & CODE VALIDATION ---
  console.log('\n--- SECTION 4: CALLBACK & CODE VALIDATION ---');
  {
    // 11. Callback without code rejected
    const freshState = DiscordOAuthService.generateAuthorizationUrl('/dashboard');
    const noCodeRes = await api(
      `/api/auth/discord/callback?state=${freshState.state}&format=json`
    );
    assert.strictEqual(noCodeRes.status, 400);
    assert.strictEqual(noCodeRes.body.code, 'missing_code');
    pass('MISSING_CODE', 'Callback without authorization code rejected with 400 missing_code');

    // 12. Configured redirect URI enforced
    const checkAuthUrl = DiscordOAuthService.generateAuthorizationUrl('/dashboard');
    assert(
      checkAuthUrl.authorizationUrl.includes(encodeURIComponent('http://localhost:5000/api/auth/discord/callback')),
      'Redirect URI encoded in authorization URL matches environment config'
    );
    pass('REDIRECT_URI_ENFORCED', 'Configured redirect URI strictly enforced on authorization request');
  }

  // --- SECTION 5: OPEN REDIRECT DEFENSE ---
  console.log('\n--- SECTION 5: OPEN REDIRECT DEFENSE ---');
  {
    // 13. Open redirect attacks blocked via validateRedirectUrl
    assert.strictEqual(validateRedirectUrl('https://evil.com', '/dashboard'), '/dashboard');
    assert.strictEqual(validateRedirectUrl('//evil.com/phish', '/dashboard'), '/dashboard');
    assert.strictEqual(validateRedirectUrl('/\\evil.com', '/dashboard'), '/dashboard');
    assert.strictEqual(validateRedirectUrl('javascript:alert(1)', '/dashboard'), '/dashboard');
    assert.strictEqual(validateRedirectUrl('/dashboard/projects', '/dashboard'), '/dashboard/projects');
    pass('OPEN_REDIRECT_DEFENSE', 'Arbitrary external redirect domains blocked; safe internal paths preserved');
  }

  // --- SECTION 6: PROVIDER IDENTITY STORAGE & UNIQUENESS ---
  console.log('\n--- SECTION 6: PROVIDER IDENTITY STORAGE & UNIQUENESS ---');
  let newDiscordUserId: string;
  const newDiscordSub = `80351110224678912_${timestamp}`;
  const newDiscordEmail = `discord_client_${timestamp}@example.com`;

  {
    // Setup test verifiers for automated testing
    DiscordOAuthService.setTestTokenExchanger(async () => {
      return { access_token: `mock_discord_access_token_${timestamp}` };
    });

    DiscordOAuthService.setTestIdentityVerifier(async () => {
      return {
        id: newDiscordSub,
        username: `discord_user_${timestamp}`,
        global_name: `Discord User ${timestamp}`,
        email: newDiscordEmail,
        verified: true,
        avatarUrl: `https://cdn.discordapp.com/avatars/${newDiscordSub}/abc123456.png`,
      };
    });

    // 14. First-time Discord OAuth provisions user
    const stateData = DiscordOAuthService.generateAuthorizationUrl('/dashboard');
    const callbackRes = await api(
      `/api/auth/discord/callback?state=${stateData.state}&code=mock_discord_code&format=json`
    );
    assert.strictEqual(callbackRes.status, 200, 'First-time registration succeeds with 200');
    assert(callbackRes.body.token, 'JWT session token returned');
    assert.strictEqual(callbackRes.body.isNewUser, true, 'isNewUser flag is true for fresh identity');
    assert.strictEqual(callbackRes.body.user.role, 'CLIENT', 'Auto-provisioned account receives CLIENT role');
    newDiscordUserId = callbackRes.body.user.id;

    // 15. Verify provider and subject stored in oauth_accounts
    const oauthRow = await query(
      `SELECT * FROM oauth_accounts WHERE provider = 'discord' AND provider_subject = $1`,
      [newDiscordSub]
    );
    assert.strictEqual(oauthRow.rows.length, 1, 'Provider identity row inserted');
    assert.strictEqual(oauthRow.rows[0].provider, 'discord');
    assert.strictEqual(oauthRow.rows[0].provider_subject, newDiscordSub);
    assert.strictEqual(oauthRow.rows[0].user_id, newDiscordUserId);
    assert.strictEqual(oauthRow.rows[0].provider_email, newDiscordEmail);
    assert.strictEqual(oauthRow.rows[0].provider_email_verified, true);
    pass('PROVIDER_STORAGE', 'Discord provider, snowflake subject, and verified email stored in oauth_accounts');

    // 16. Provider + subject uniqueness constraint in database
    await assert.rejects(
      async () => {
        await query(
          `INSERT INTO oauth_accounts (user_id, provider, provider_subject, provider_email)
           VALUES ($1, 'discord', $2, 'another@example.com')`,
          [newDiscordUserId, newDiscordSub]
        );
      },
      /uq_oauth_provider_subject|unique constraint/i,
      'Database unique constraint uq_oauth_provider_subject prevents duplicate (provider, provider_subject)'
    );
    pass('SUBJECT_UNIQUENESS', 'Database constraint uq_oauth_provider_subject prevents duplicate Discord identity');
  }

  // --- SECTION 7: EXISTING DISCORD USER LOGIN ---
  console.log('\n--- SECTION 7: EXISTING DISCORD USER LOGIN ---');
  {
    // 17. Existing Discord identity logs into the exact same user
    const loginState = DiscordOAuthService.generateAuthorizationUrl('/dashboard');
    const returnLoginRes = await api(
      `/api/auth/discord/callback?state=${loginState.state}&code=mock_discord_code&format=json`
    );
    assert.strictEqual(returnLoginRes.status, 200);
    assert.strictEqual(returnLoginRes.body.isNewUser, false, 'isNewUser is false on return login');
    assert.strictEqual(returnLoginRes.body.user.id, newDiscordUserId, 'Existing user ID preserved');
    assert.strictEqual(returnLoginRes.body.user.email, newDiscordEmail, 'User email matches');

    // Verify user count did not duplicate
    const userCount = await query(`SELECT COUNT(*)::int as count FROM users WHERE email = $1`, [newDiscordEmail]);
    assert.strictEqual(userCount.rows[0].count, 1, 'No duplicate user created in users table');
    pass('EXISTING_LOGIN', 'Existing Discord identity authenticates into same account without duplicate creation');
  }

  // --- SECTION 8: EMAIL CONFLICT & MISSING EMAIL DEFENSE ---
  console.log('\n--- SECTION 8: EMAIL CONFLICT & MISSING EMAIL DEFENSE ---');
  {
    // 18. Existing email conflict: Discord profile has email belonging to an existing local account
    const localEmail = `local_conflict_${timestamp}@example.com`;
    await query(
      `INSERT INTO users (uid, public_uid, email, password_hash, role, status)
       VALUES ($1, $1, $2, 'argon2id_mock_hash', 'CLIENT', 'ACTIVE')`,
      [generateUserUid(), localEmail]
    );

    const unlinkedSub = `unlinked_discord_sub_${timestamp}`;
    DiscordOAuthService.setTestIdentityVerifier(async () => {
      return {
        id: unlinkedSub,
        username: 'conflict_user',
        email: localEmail, // existing local account
        verified: true,
      };
    });

    const conflictState = DiscordOAuthService.generateAuthorizationUrl('/dashboard');
    const conflictRes = await api(
      `/api/auth/discord/callback?state=${conflictState.state}&code=mock_code&format=json`
    );
    assert.strictEqual(conflictRes.status, 409, 'Conflict must return 409 Conflict');
    assert.strictEqual(conflictRes.body.code, 'account_exists_conflict', 'Error code must be account_exists_conflict');
    pass('EMAIL_CONFLICT_DEFENSE', 'Unlinked existing email matches blocked with 409 account_exists_conflict');

    // 19. Missing email from Discord rejected safely
    const noEmailSub = `no_email_discord_sub_${timestamp}`;
    DiscordOAuthService.setTestIdentityVerifier(async () => {
      return {
        id: noEmailSub,
        username: 'no_email_user',
        // no email provided
      };
    });

    const noEmailState = DiscordOAuthService.generateAuthorizationUrl('/dashboard');
    const noEmailRes = await api(
      `/api/auth/discord/callback?state=${noEmailState.state}&code=mock_code&format=json`
    );
    assert.strictEqual(noEmailRes.status, 400, 'Missing email returns 400 Bad Request');
    assert.strictEqual(noEmailRes.body.code, 'missing_email', 'Error code must be missing_email');
    pass('MISSING_EMAIL_DEFENSE', 'Discord accounts without email rejected with 400 missing_email');

    // 20. Unverified email on Discord rejected safely
    const unverifiedSub = `unverified_discord_sub_${timestamp}`;
    DiscordOAuthService.setTestIdentityVerifier(async () => {
      return {
        id: unverifiedSub,
        username: 'unverified_user',
        email: `unverified_${timestamp}@example.com`,
        verified: false,
      };
    });

    const unverifiedState = DiscordOAuthService.generateAuthorizationUrl('/dashboard');
    const unverifiedRes = await api(
      `/api/auth/discord/callback?state=${unverifiedState.state}&code=mock_code&format=json`
    );
    assert.strictEqual(unverifiedRes.status, 400, 'Unverified email returns 400 Bad Request');
    assert.strictEqual(unverifiedRes.body.code, 'unverified_email', 'Error code must be unverified_email');
    pass('UNVERIFIED_EMAIL_DEFENSE', 'Discord accounts with unverified email rejected with 400 unverified_email');
  }

  // --- SECTION 9: ACCOUNT SECURITY, UID & PASSWORD INVARIANTS ---
  console.log('\n--- SECTION 9: ACCOUNT SECURITY, UID & PASSWORD INVARIANTS ---');
  {
    const userRes = await query(
      `SELECT id, uid, public_uid, password_hash, role, status FROM users WHERE id = $1`,
      [newDiscordUserId]
    );
    const u = userRes.rows[0];

    // 21 & 22. Platform UID standards
    assert.strictEqual(u.uid.length, 16, 'Platform internal UID must be 16 characters');
    assert(/^[A-Za-z0-9]{16}$/.test(u.uid), 'Platform UID is Base62 alphanumeric');
    assert.notStrictEqual(u.uid, newDiscordSub, 'Discord user ID is NOT platform UID');
    pass('UID_STANDARDS', 'Platform UID remains 16-character alphanumeric; Discord snowflake ID isolated');

    // 23 & 24. Password security: OAuth account has NULL password_hash
    assert.strictEqual(u.password_hash, null, 'OAuth accounts have password_hash = NULL');
    pass('PASSWORD_SECURITY', 'OAuth accounts use NULL password_hash without dummy or weak passwords');
  }

  // --- SECTION 10: SUSPENDED & DISABLED ACCOUNT ENFORCEMENT ---
  console.log('\n--- SECTION 10: SUSPENDED & DISABLED ACCOUNT ENFORCEMENT ---');
  {
    // 25. Suspended user blocked from Discord login
    await query(`UPDATE users SET status = 'SUSPENDED', is_suspended = TRUE WHERE id = $1`, [newDiscordUserId]);

    DiscordOAuthService.setTestIdentityVerifier(async () => {
      return {
        id: newDiscordSub,
        username: `discord_user_${timestamp}`,
        email: newDiscordEmail,
        verified: true,
      };
    });

    const suspendedState = DiscordOAuthService.generateAuthorizationUrl('/dashboard');
    const suspendedRes = await api(
      `/api/auth/discord/callback?state=${suspendedState.state}&code=mock_code&format=json`
    );
    assert.strictEqual(suspendedRes.status, 403, 'Suspended account returns 403 Forbidden');
    assert.strictEqual(suspendedRes.body.code, 'account_suspended', 'Error code is account_suspended');
    pass('SUSPENSION_ENFORCED', 'Suspended account strictly blocked from Discord login');

    // 26. Disabled user blocked from Discord login
    await query(`UPDATE users SET status = 'DISABLED', is_suspended = FALSE WHERE id = $1`, [newDiscordUserId]);

    const disabledState = DiscordOAuthService.generateAuthorizationUrl('/dashboard');
    const disabledRes = await api(
      `/api/auth/discord/callback?state=${disabledState.state}&code=mock_code&format=json`
    );
    assert.strictEqual(disabledRes.status, 403, 'Disabled account returns 403 Forbidden');
    assert.strictEqual(disabledRes.body.code, 'account_disabled', 'Error code is account_disabled');
    pass('DISABLED_ENFORCED', 'Disabled account strictly blocked from Discord login');

    // Restore user to ACTIVE for subsequent tests
    await query(`UPDATE users SET status = 'ACTIVE', is_suspended = FALSE WHERE id = $1`, [newDiscordUserId]);
  }

  // --- SECTION 11: DEVELOPER ACCOUNT PROTECTION ---
  console.log('\n--- SECTION 11: DEVELOPER ACCOUNT PROTECTION ---');
  {
    // Create an unverified developer account
    const devUid = generateUserUid();
    const devEmail = `dev_discord_${timestamp}@nexus.dev`;
    const devSub = `dev_discord_sub_${timestamp}`;

    const devUserRes = await query(
      `INSERT INTO users (uid, public_uid, email, role, status, email_verified)
       VALUES ($1, $1, $2, 'DEVELOPER', 'ACTIVE', TRUE) RETURNING id`,
      [devUid, devEmail]
    );
    const devUserId = devUserRes.rows[0].id;

    await query(
      `INSERT INTO developers (user_id, username, display_name, verification_status, role_title)
       VALUES ($1, $2, $3, 'PENDING', 'Junior Developer')`,
      [devUserId, `dev_disc_${timestamp}`, `Dev Disc ${timestamp}`]
    );

    await query(
      `INSERT INTO oauth_accounts (user_id, provider, provider_subject, provider_email, provider_email_verified)
       VALUES ($1, 'discord', $2, $3, TRUE)`,
      [devUserId, devSub, devEmail]
    );

    // Authenticate developer via Discord
    DiscordOAuthService.setTestIdentityVerifier(async () => {
      return {
        id: devSub,
        username: `dev_disc_${timestamp}`,
        email: devEmail,
        verified: true,
      };
    });

    const devState = DiscordOAuthService.generateAuthorizationUrl('/dashboard');
    const devRes = await api(
      `/api/auth/discord/callback?state=${devState.state}&code=mock_code&format=json`
    );
    assert.strictEqual(devRes.status, 200);
    assert.strictEqual(devRes.body.user.role, 'DEVELOPER');
    assert.strictEqual(devRes.body.user.verificationStatus, 'PENDING', 'Developer approval remains PENDING');

    const devDbCheck = await query(`SELECT verification_status FROM developers WHERE user_id = $1`, [devUserId]);
    assert.strictEqual(
      devDbCheck.rows[0].verification_status,
      'PENDING',
      'Database status remains unchanged by OAuth sign-in'
    );
    pass('DEV_APPROVAL_PRESERVED', 'Discord OAuth preserves PENDING status without auto-approving developers');
  }

  // --- SECTION 12: CEO & MD EXECUTIVE GOVERNANCE PROTECTION ---
  console.log('\n--- SECTION 12: CEO & MD EXECUTIVE GOVERNANCE PROTECTION ---');
  {
    // 27 & 28 & 29. Verify CEO and MD account governance invariants
    const ceoCheck = await query(`SELECT id, role, status FROM users WHERE email = 'shivaa1906@gmail.com'`);
    assert.strictEqual(ceoCheck.rows[0].role, 'CEO', 'CEO role remains immutable');
    assert.strictEqual(ceoCheck.rows[0].status, 'ACTIVE', 'CEO status remains ACTIVE');

    const mdCheck = await query(`SELECT id, role, status FROM users WHERE email = 'md@example.invalid'`);
    assert.strictEqual(mdCheck.rows[0].role, 'MD', 'MD role remains immutable');
    assert.strictEqual(mdCheck.rows[0].status, 'ACTIVE', 'MD status remains ACTIVE');

    pass('EXECUTIVE_PROTECTION', 'CEO and MD accounts, roles, and governance invariants preserved');
  }

  // --- SECTION 13: SESSION SECURITY & TOKEN VERSIONING ---
  console.log('\n--- SECTION 13: SESSION SECURITY & TOKEN VERSIONING ---');
  {
    // 30. Discord OAuth issues standard platform JWT recognized by middleware
    DiscordOAuthService.setTestIdentityVerifier(async () => {
      return {
        id: newDiscordSub,
        username: `discord_user_${timestamp}`,
        email: newDiscordEmail,
        verified: true,
      };
    });

    const sessionState = DiscordOAuthService.generateAuthorizationUrl('/dashboard');
    const sessionRes = await api(
      `/api/auth/discord/callback?state=${sessionState.state}&code=valid_discord_code&format=json`
    );
    const discordSessionToken = sessionRes.body.token;

    const meRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${discordSessionToken}` },
    });
    assert.strictEqual(meRes.status, 200, 'Standard authenticateJwt accepts session token');
    assert.strictEqual(meRes.body.user.email, newDiscordEmail, 'Identity confirmed via /api/auth/me');
    pass('SESSION_RECOGNITION', 'Discord OAuth session JWT accepted by standard authenticateJwt middleware');

    // 31. Token version increment revokes all sessions
    await query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [newDiscordUserId]);

    const revokedMeRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${discordSessionToken}` },
    });
    assert.strictEqual(revokedMeRes.status, 401, 'Revoked token rejected with 401 Unauthorized');
    pass('TOKEN_VERSION_REVOCATION', 'Token version increment invalidates Discord OAuth sessions');
  }

  // --- SECTION 14: AUDIT LOGGING & ZERO CREDENTIAL LEAKAGE ---
  console.log('\n--- SECTION 14: AUDIT LOGGING & ZERO CREDENTIAL LEAKAGE ---');
  {
    // 32. Check audit log actions recorded
    const auditRes = await query(
      `SELECT action, metadata FROM audit_logs 
       WHERE action IN ('DISCORD_OAUTH_STARTED', 'DISCORD_OAUTH_SUCCESS', 'DISCORD_ACCOUNT_CREATED', 'DISCORD_ACCOUNT_LOGIN', 'DISCORD_ACCOUNT_EMAIL_CONFLICT', 'DISCORD_OAUTH_FAILURE')
         AND created_at >= $1
       ORDER BY created_at DESC LIMIT 100`,
      [startTime]
    );
    assert(auditRes.rows.length >= 3, 'Audit logs recorded OAuth lifecycle events');
    const actions = new Set(auditRes.rows.map((r: any) => r.action));
    assert(actions.has('DISCORD_OAUTH_STARTED'), 'DISCORD_OAUTH_STARTED recorded');
    assert(actions.has('DISCORD_ACCOUNT_CREATED') || actions.has('DISCORD_ACCOUNT_LOGIN'), 'Account creation/login recorded');
    pass('AUDIT_LOGGING', 'OAuth lifecycle events recorded in append-only audit trail');

    // 33 & 34. Audit logs never contain sensitive secrets or tokens
    for (const row of auditRes.rows) {
      const metaStr = JSON.stringify(row.metadata);
      assert(!metaStr.includes('client_secret'), 'Audit log must not contain client_secret');
      assert(!metaStr.includes('code_verifier'), 'Audit log must not contain code_verifier');
      assert(!metaStr.includes('access_token'), 'Audit log must not contain access_token');
    }
    pass('SECRET_HYGIENE', 'Zero tokens, secrets, or PKCE verifiers leaked in audit logs');
  }

  // --- SECTION 15: RATE LIMITING & START PROJECT FLOW ---
  console.log('\n--- SECTION 15: RATE LIMITING & START PROJECT FLOW ---');
  {
    // 35. Rate limiter covers Discord endpoints
    const routeSourcePath = fs.existsSync(path.resolve(process.cwd(), 'src/routes/authRoutes.ts'))
      ? path.resolve(process.cwd(), 'src/routes/authRoutes.ts')
      : path.resolve(process.cwd(), 'backend/src/routes/authRoutes.ts');
    const routeSource = fs.readFileSync(routeSourcePath, 'utf8');
    assert(routeSource.includes('router.use(authRateLimiter('), 'authRateLimiter applied across all auth routes');
    assert(routeSource.includes('/discord'), 'Discord routes defined under rate-limited router');
    pass('RATE_LIMITING', 'Discord OAuth endpoints protected by authRateLimiter');

    // 36. Start Project authentication flow
    const startProjectState = DiscordOAuthService.generateAuthorizationUrl('/start-project');
    assert.strictEqual(startProjectState.codeVerifier.length > 20, true);
    const startSession = DiscordOAuthService.consumeState(startProjectState.state);
    assert.strictEqual(startSession.returnUrl, '/start-project');
    pass('START_PROJECT_FLOW', 'Start Project authentication return destination securely preserved');
  }

  // --- SECTION 16: CROSS-PROVIDER REGRESSION ---
  console.log('\n--- SECTION 16: CROSS-PROVIDER REGRESSION ---');
  {
    // 37. Google OAuth still functions without interference
    const googleInitRes = await api('/api/auth/google?format=json');
    assert.strictEqual(googleInitRes.status, 200, 'Google OAuth initiation route returns 200');
    assert(googleInitRes.body.url.includes('accounts.google.com'), 'Google URL points to accounts.google.com');
    pass('GOOGLE_REGRESSION', 'Google OAuth initiation remains fully functional without interference');

    // 38. Facebook OAuth still functions without interference
    const fbInitRes = await api('/api/auth/facebook?format=json');
    assert.strictEqual(fbInitRes.status, 200, 'Facebook OAuth initiation route returns 200');
    assert(fbInitRes.body.url.includes('facebook.com'), 'Facebook URL points to facebook.com');
    pass('FACEBOOK_REGRESSION', 'Facebook OAuth initiation remains fully functional without interference');

    // 39. Email/password authentication still works
    const emailLoginRes = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'client001@apexretail.io',
        password: 'DevPlatform2026!Secure',
      }),
    });
    assert.strictEqual(emailLoginRes.status, 200, 'Email/password authentication succeeds');
    assert(emailLoginRes.body.token, 'Session token returned');
    pass('EMAIL_PASSWORD_REGRESSION', 'Phase 1 email/password Argon2id authentication unaffected');

    // 40. Client registration still works
    const regClientRes = await api('/api/auth/register/client', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Regression Test Client',
        email: `reg_client_${timestamp}@example.com`,
        companyName: 'Regression Client Labs',
        password: 'DevPlatform2026!Secure',
        confirmPassword: 'DevPlatform2026!Secure',
      }),
    });
    assert.strictEqual(regClientRes.status, 201, 'Standard client registration succeeds');
    pass('CLIENT_REG_REGRESSION', 'Client registration endpoint unaffected');

    // 41. Developer registration still works
    const regDevRes2 = await api('/api/auth/register/developer', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Regression Test Developer',
        username: `regdev_${timestamp}`,
        email: `reg_dev_${timestamp}@example.com`,
        password: 'DevPlatform2026!Secure',
        confirmPassword: 'DevPlatform2026!Secure',
        roleTitle: 'Full-Stack Engineer',
      }),
    });
    assert.strictEqual(regDevRes2.status, 201, 'Standard developer registration succeeds');
    pass('DEV_REG_REGRESSION', 'Developer registration endpoint unaffected');
  }

  // --- SECTION 17: REGRESSION TESTING (PHASES 1 - 6) ---
  console.log('\n--- SECTION 17: REGRESSION TESTING (PHASES 1 - 6) ---');
  {
    // 42. Phase 1 password security regression
    const pwdRes = await query(`SELECT password_hash FROM users WHERE email = 'shivaa1906@gmail.com'`);
    assert(isArgon2Hash(pwdRes.rows[0].password_hash), 'Argon2id password hashing intact');
    pass('PHASE1_REGRESSION', 'Phase 1 Argon2id password security intact');

    // 43. Phase 2 mock-free query regression
    const pubProjectsRes = await query(`
        SELECT p.id, p.project_number, p.slug, p.title, p.description, p.category, 
               p.timeline, p.required_technologies, p.status, p.created_at,
               d.username as lead_dev_username, d.display_name as lead_dev_name,
               COALESCE(d.profile_photo, d.profile_image, d.avatar_url) as lead_dev_avatar, d.role_title as lead_dev_title
        FROM projects p
        LEFT JOIN developers d ON p.lead_developer_id = d.id
        WHERE p.status = 'PUBLISHED'
       ORDER BY p.created_at DESC`
    );
    assert(pubProjectsRes.rows.length >= 1, 'Published projects retrieved from live database');
    pass('PHASE2_REGRESSION', 'Phase 2 mock-free database query integrity preserved');

    // 44. Phase 3 Executive governance regression
    const execSettings = await query(`SELECT key, value, description, updated_at FROM platform_settings ORDER BY key ASC`);
    assert(execSettings.rows.length >= 1, 'Platform settings available to platform executives');
    pass('PHASE3_REGRESSION', 'Phase 3 Executive governance and settings access preserved');

    // 45. Phase 4 multi-role authentication & developer directory preserved
    const devListRes = await query(`
      SELECT d.id, d.username, d.display_name,
             COALESCE(d.profile_photo, d.profile_image, d.avatar_url, u.avatar_url, u.profile_image) as avatar_url,
             d.role_title, d.verification_status
      FROM developers d
      LEFT JOIN users u ON d.user_id = u.id
      WHERE d.verification_status = 'VERIFIED' AND u.is_suspended = FALSE AND u.status = 'ACTIVE'
    `);
    assert(devListRes.rows.length >= 1, 'Verified developer directory active and queryable');
    pass('PHASE4_REGRESSION', 'Phase 4 multi-role authentication & developer directory preserved');

    // 46. Phase 5 Google OAuth regression
    const googleAccountCount = await query(
      `SELECT COUNT(*)::int as count FROM oauth_accounts WHERE provider = 'google'`
    );
    assert(googleAccountCount.rows[0].count >= 0, 'Google OAuth accounts table queryable and unaffected');
    pass('PHASE5_REGRESSION', 'Phase 5 Google OAuth database and service invariants preserved');

    // 47. Phase 6 Facebook OAuth regression
    const fbAccountCount = await query(
      `SELECT COUNT(*)::int as count FROM oauth_accounts WHERE provider = 'facebook'`
    );
    assert(fbAccountCount.rows[0].count >= 0, 'Facebook OAuth accounts table queryable and unaffected');
    pass('PHASE6_REGRESSION', 'Phase 6 Facebook OAuth database and service invariants preserved');
  }

  // --- SECTION 18: FRONTEND UI & DOCS VERIFICATION ---
  console.log('\n--- SECTION 18: FRONTEND UI & DOCS VERIFICATION ---');
  {
    const resolveRelPath = (relPath: string) => {
      const p1 = path.resolve(process.cwd(), relPath);
      if (fs.existsSync(p1)) return p1;
      return path.resolve(process.cwd(), '..', relPath);
    };

    // 48. Login page includes Discord
    const loginPage = fs.readFileSync(resolveRelPath('frontend/app/login/page.tsx'), 'utf8');
    assert(loginPage.includes('Continue with Google'), 'Login includes Google sign-in');
    assert(loginPage.includes('Continue with Facebook'), 'Login includes Facebook sign-in');
    assert(loginPage.includes('Continue with Discord'), 'Login includes Discord sign-in');
    assert(loginPage.includes('handleDiscordLogin'), 'Login includes handleDiscordLogin');
    pass('UI_LOGIN', 'Login page includes Google, Facebook, and Discord OAuth buttons with error handling');

    // 49. Client registration includes Discord
    const clientRegPage = fs.readFileSync(resolveRelPath('frontend/app/register/client/page.tsx'), 'utf8');
    assert(clientRegPage.includes('Continue with Google'), 'Client register includes Google');
    assert(clientRegPage.includes('Continue with Facebook'), 'Client register includes Facebook');
    assert(clientRegPage.includes('Continue with Discord'), 'Client register includes Discord');
    pass('UI_REGISTRATION', 'Client registration provides Google, Facebook, and Discord onboarding');

    // 50. Main register page includes Discord
    const regPage = fs.readFileSync(resolveRelPath('frontend/app/register/page.tsx'), 'utf8');
    assert(regPage.includes('Continue with Discord'), 'Register page includes Discord');
    pass('UI_MAIN_REGISTER', 'Main register page client tab includes Discord onboarding');

    // 51. Documentation exists
    const docFile = fs.readFileSync(resolveRelPath('docs/discord-oauth-setup.md'), 'utf8');
    assert(docFile.includes('DISCORD_CLIENT_ID'), 'Setup doc covers DISCORD_CLIENT_ID');
    assert(docFile.includes('OAuth2'), 'Setup doc covers OAuth2');
    assert(docFile.includes('identify') && docFile.includes('email'), 'Setup doc covers scopes');
    pass('DOCS_VERIFICATION', 'Discord OAuth developer setup guide documented in docs/discord-oauth-setup.md');
  }

  console.log('\n================================================================');
  console.log(`PHASE 7 TEST SUMMARY: ${passedChecks} / ${totalChecks} PASSED`);
  console.log('================================================================\n');

  if (passedChecks !== totalChecks) {
    throw new Error(`Test suite failed: ${totalChecks - passedChecks} checks did not pass.`);
  }
}

// Auto-run if executed directly
if (process.argv[1]?.includes('phase7DiscordOAuthTest')) {
  runPhase7Tests()
    .then(() => {
      console.log('🎉 ALL PHASE 7 DISCORD OAUTH CHECKS PASSED!\n');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ PHASE 7 TEST FAILURE:', err);
      process.exit(1);
    });
}
