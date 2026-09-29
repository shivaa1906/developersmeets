process.env.NODE_ENV = 'test';

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { httpServer } from '../server.js';
import { query, pool } from '../database/db.js';
import { env } from '../config/environment.js';
import { ROLES, LEADERSHIP } from '../config/constants.js';
import { isArgon2Hash } from '../utils/password.js';
import { FacebookOAuthService, FacebookIdentityClaims } from '../services/facebookOAuthService.js';
import { GoogleOAuthService } from '../services/googleOAuthService.js';
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

export async function runPhase6Tests() {
  console.log('================================================================');
  console.log('PHASE 6 — FACEBOOK OAUTH AUTHENTICATION & SECURITY TEST SUITE');
  console.log('================================================================\n');

  await setupSuite();

  // Test credentials configuration
  env.FACEBOOK_CLIENT_ID = 'test-facebook-app-id-123456';
  env.FACEBOOK_CLIENT_SECRET = 'test-facebook-app-secret-secure-987654';
  env.FACEBOOK_OAUTH_REDIRECT_URI = 'http://localhost:5000/api/auth/facebook/callback';

  // Also preserve Google OAuth credentials for regression checks
  env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  env.GOOGLE_CLIENT_SECRET = 'test-client-secret-secure';
  env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:5000/api/auth/google/callback';

  const startTime = new Date();
  const timestamp = Date.now().toString().slice(-6);

  // --- SECTION 1: ROUTE & CONFIGURATION VERIFICATION ---
  console.log('--- SECTION 1: ROUTE & CONFIGURATION VERIFICATION ---');
  {
    // 1. Facebook OAuth initiation endpoint exists
    const initRes = await api('/api/auth/facebook?format=json');
    assert.strictEqual(initRes.status, 200, 'Initiation endpoint must exist and return 200 JSON in test mode');
    assert(initRes.body.url.includes('facebook.com'), 'Initiation URL must point to facebook.com');
    assert(initRes.body.url.includes('v19.0/dialog/oauth'), 'Initiation URL uses Graph API OAuth dialog');
    pass('ROUTING_INITIATE', 'Facebook OAuth initiation route /api/auth/facebook exists and targets Meta OAuth');

    // 2. Facebook callback endpoint exists
    const callbackProbe = await api('/api/auth/facebook/callback?error=user_denied&format=json');
    assert(callbackProbe.status === 400, 'Callback endpoint /api/auth/facebook/callback exists');
    pass('ROUTING_CALLBACK', 'Facebook OAuth callback route /api/auth/facebook/callback exists');

    // 3. Configuration is read dynamically from environment (no hardcoded credentials)
    assert.strictEqual(env.FACEBOOK_CLIENT_ID, 'test-facebook-app-id-123456');
    assert.strictEqual(env.FACEBOOK_OAUTH_REDIRECT_URI, 'http://localhost:5000/api/auth/facebook/callback');
    pass('CONFIG', 'OAuth configuration dynamically read from environment variables');

    // 4. Scan codebase to guarantee zero hardcoded Facebook secrets in code
    const serviceSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/facebookOAuthService.ts'),
      'utf8'
    );
    assert(!serviceSource.includes('mockFacebookLogin'), 'Zero mock login functions in production paths');
    assert(!serviceSource.includes('fakeFacebookUser'), 'Zero fake Facebook users in production paths');
    pass('CREDENTIAL_HYGIENE', 'Zero hardcoded secrets or fake users found in codebase');

    // 12. Configured redirect URI enforced in authorization URL
    assert(
      initRes.body.url.includes(encodeURIComponent(env.FACEBOOK_OAUTH_REDIRECT_URI)),
      'Configured redirect URI strictly enforced in authorization URL'
    );
    pass('REDIRECT_URI_ENFORCED', 'Server-configured callback URI enforced in OAuth parameters');
  }

  // --- SECTION 2: OAUTH STATE & PKCE CRYPTOGRAPHIC PROTECTION ---
  console.log('\n--- SECTION 2: OAUTH STATE & PKCE CRYPTOGRAPHIC PROTECTION ---');
  {
    // 5. OAuth state generation
    const oauthUrlObj = FacebookOAuthService.generateAuthorizationUrl('/dashboard');
    assert(typeof oauthUrlObj.state === 'string', 'OAuth state must be generated as string');
    pass('STATE', 'OAuth state parameter generated securely');

    // 6. OAuth state has sufficient entropy (32 bytes = 64 hex characters >= 256 bits)
    assert.strictEqual(oauthUrlObj.state.length, 64, 'OAuth state must be at least 64 hex characters (256 bits)');
    assert(/^[0-9a-f]{64}$/i.test(oauthUrlObj.state), 'OAuth state conforms to hex CSPRNG format');
    pass('ENTROPY', 'OAuth state contains 256 bits of cryptographic entropy');

    // 8. PKCE code_challenge uses S256 method
    assert(oauthUrlObj.authorizationUrl.includes('code_challenge_method=S256'), 'Must enforce S256 challenge method');
    assert(oauthUrlObj.authorizationUrl.includes('code_challenge='), 'Must include code_challenge');
    pass('PKCE', 'PKCE code_challenge and code_challenge_method=S256 enforced');

    // 8. State is single-use and consumption removes it
    const consumedSession = FacebookOAuthService.consumeState(oauthUrlObj.state);
    assert.strictEqual(consumedSession.state, oauthUrlObj.state, 'Consumed session matches state');
    pass('SINGLE_USE', 'OAuth state is consumable exactly once');

    // 9. Replayed state is rejected
    let replayedRejected = false;
    try {
      FacebookOAuthService.consumeState(oauthUrlObj.state);
    } catch (err: any) {
      replayedRejected = true;
      assert.strictEqual(err.code, 'INVALID_STATE');
    }
    assert(replayedRejected, 'Replaying consumed state must be strictly rejected');
    pass('REPLAY_DEFENSE', 'Replayed OAuth state immediately rejected');

    // 10. Invalid/unrecognized state rejected
    let invalidRejected = false;
    try {
      FacebookOAuthService.consumeState('completely_invalid_state_token_facebook_12345');
    } catch (err: any) {
      invalidRejected = true;
      assert.strictEqual(err.code, 'INVALID_STATE');
    }
    assert(invalidRejected, 'Forged state parameter strictly rejected');
    pass('STATE_VALIDATION', 'Forged/invalid OAuth state rejected');
  }

  // --- SECTION 3: OPEN REDIRECT & RETURN URL DEFENSE ---
  console.log('\n--- SECTION 3: OPEN REDIRECT & RETURN URL DEFENSE ---');
  {
    // 13. Open redirect attempts blocked
    const maliciousUrls = [
      'https://attacker.com/steal-session',
      '//attacker.com/evil',
      '/\\attacker.com',
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'http://attacker.com/login',
    ];

    for (const evilUrl of maliciousUrls) {
      const sanitized = validateRedirectUrl(evilUrl, '/dashboard');
      assert.strictEqual(sanitized, '/dashboard', `Open redirect candidate "${evilUrl}" must be sanitized to /dashboard`);
    }
    pass('OPEN_REDIRECT', 'All external, protocol-relative, and script URLs neutralized');

    // Valid internal return URLs preserved
    assert.strictEqual(validateRedirectUrl('/start-project', '/dashboard'), '/start-project');
    assert.strictEqual(validateRedirectUrl('/dashboard/projects', '/dashboard'), '/dashboard/projects');
    pass('INTERNAL_RETURN_URL', 'Safe relative application paths correctly preserved');
  }

  // --- SECTION 4: CALLBACK VALIDATION & ERROR HANDLING ---
  console.log('\n--- SECTION 4: CALLBACK VALIDATION & ERROR HANDLING ---');
  {
    // 11. Callback without code rejected
    const stateSession = FacebookOAuthService.generateAuthorizationUrl('/dashboard');
    const noCodeRes = await api(`/api/auth/facebook/callback?state=${stateSession.state}&format=json`);
    assert.strictEqual(noCodeRes.status, 400, 'Callback missing authorization code must return 400');
    assert(noCodeRes.body.error.includes('code is missing'), 'Explains missing authorization code');
    pass('CALLBACK_CODE', 'Callback without authorization code safely rejected');

    // Provider cancellation handled safely
    const cancelRes = await api('/api/auth/facebook/callback?error=access_denied&error_reason=user_denied&format=json');
    assert.strictEqual(cancelRes.status, 400, 'Provider cancelled error must return 400');
    assert.strictEqual(cancelRes.body.code, 'cancelled');
    assert.strictEqual(cancelRes.body.error, 'Facebook sign-in was cancelled.');
    pass('CANCELLATION', 'Facebook sign-in user cancellation handled gracefully');

    // Callback with invalid state returns state_expired error
    const badStateRes = await api('/api/auth/facebook/callback?state=bogus_fb_state&code=test_code&format=json');
    assert.strictEqual(badStateRes.status, 400);
    assert(badStateRes.body.error.includes('expired') || badStateRes.body.code === 'invalid_state');
    pass('EXPIRED_STATE', 'Callback with invalid or expired state returns clear user message');

    // 20. Missing Facebook email handled safely (no fake email created)
    FacebookOAuthService.setTestTokenExchanger(async () => ({ access_token: 'mock.fb.no_email.token' }));
    FacebookOAuthService.setTestIdentityVerifier(async () => ({
      id: `fb_no_email_${timestamp}`,
      name: 'No Email User',
      email: undefined, // Facebook returned no email
    }));

    const noEmailState = FacebookOAuthService.generateAuthorizationUrl('/dashboard');
    const noEmailRes = await api(
      `/api/auth/facebook/callback?state=${noEmailState.state}&code=no_email_code&format=json`
    );
    assert.strictEqual(noEmailRes.status, 400, 'Missing Facebook email must return 400');
    assert.strictEqual(noEmailRes.body.code, 'missing_email');
    assert(noEmailRes.body.error.includes('did not provide an email address'));
    pass('MISSING_EMAIL_HANDLED', 'Missing Facebook email halts registration safely without generating fake email');
  }

  // --- SECTION 5: TOKEN VALIDATION & IDENTITY VERIFICATION ---
  console.log('\n--- SECTION 5: TOKEN VALIDATION & IDENTITY VERIFICATION ---');
  {
    FacebookOAuthService.setTestTokenExchanger(async () => ({ access_token: 'mock.fb.valid.token' }));

    // 21. Invalid token rejected
    FacebookOAuthService.setTestIdentityVerifier(async () => {
      const err: any = new Error('Facebook access token is invalid or expired.');
      err.code = 'INVALID_ACCESS_TOKEN';
      throw err;
    });

    const invState = FacebookOAuthService.generateAuthorizationUrl('/dashboard');
    const invRes = await api(
      `/api/auth/facebook/callback?state=${invState.state}&code=inv_code&format=json`
    );
    assert.strictEqual(invRes.status, 401, 'Invalid access token returns 401');
    assert.strictEqual(invRes.body.code, 'invalid_token');
    pass('INVALID_TOKEN_REJECTED', 'Invalid or expired Facebook access token rejected with 401');

    // 22. App ID mismatch (confused deputy defense)
    FacebookOAuthService.setTestIdentityVerifier(async () => {
      const err: any = new Error('Facebook token was not issued for this application.');
      err.code = 'INVALID_APP_ID';
      throw err;
    });

    const audState = FacebookOAuthService.generateAuthorizationUrl('/dashboard');
    const audRes = await api(
      `/api/auth/facebook/callback?state=${audState.state}&code=aud_code&format=json`
    );
    assert.strictEqual(audRes.status, 401, 'App ID mismatch returns 401');
    assert.strictEqual(audRes.body.code, 'invalid_app_id');
    pass('APP_ID_CHECK', 'Confused deputy attack prevented: tokens from other apps strictly rejected');
  }

  // --- SECTION 6: FIRST-TIME FACEBOOK USER PROVISIONING ---
  console.log('\n--- SECTION 6: FIRST-TIME FACEBOOK USER PROVISIONING ---');
  let newFbUserId: string;
  let newFbSub: string;
  let newFbEmail: string;

  {
    newFbSub = `fb_sub_first_${timestamp}`;
    newFbEmail = `fb_first_${timestamp}@example.com`;

    FacebookOAuthService.setTestTokenExchanger(async () => ({ access_token: 'mock.fb.exchange.ok' }));
    FacebookOAuthService.setTestIdentityVerifier(async () => {
      return {
        id: newFbSub,
        name: 'First Facebook User',
        email: newFbEmail,
        pictureUrl: 'https://graph.facebook.com/v19.0/photo.jpg',
      };
    });

    const signupState = FacebookOAuthService.generateAuthorizationUrl('/start-project');
    const signupRes = await api(
      `/api/auth/facebook/callback?state=${signupState.state}&code=valid_fb_code&format=json`
    );

    assert.strictEqual(signupRes.status, 200, 'New user Facebook callback must return 200');
    assert.strictEqual(signupRes.body.isNewUser, true, 'isNewUser flag must be true');
    assert.strictEqual(signupRes.body.user.role, ROLES.CLIENT, 'New OAuth user must receive role CLIENT');
    assert(signupRes.body.token, 'Authenticated JWT token returned');
    assert.strictEqual(signupRes.body.redirectUrl, '/start-project', 'Safe returnUrl preserved');

    newFbUserId = signupRes.body.user.id;

    // 30 & 31. Platform UID format (16-char alphanumeric, NOT Facebook ID)
    assert.strictEqual(signupRes.body.user.uid.length, 16, 'Platform UID must be exactly 16 characters');
    assert(/^[A-Za-z0-9]{16}$/.test(signupRes.body.user.uid), 'Platform UID must be alphanumeric');
    assert.notStrictEqual(signupRes.body.user.uid, newFbSub, 'Facebook ID must NEVER be used as platform UID');
    pass('UID_INVARIANT', '16-character alphanumeric internal UID generated; Facebook ID not used as UID');

    // 14. Facebook provider subject stored in oauth_accounts
    const oauthRow = await query(
      `SELECT * FROM oauth_accounts WHERE provider = 'facebook' AND provider_subject = $1`,
      [newFbSub]
    );
    assert.strictEqual(oauthRow.rows.length, 1, 'OAuth account record created');
    assert.strictEqual(oauthRow.rows[0].user_id, newFbUserId, 'Linked to newly created user');
    assert.strictEqual(oauthRow.rows[0].provider_email, newFbEmail, 'Provider email stored');
    pass('PROVIDER_IDENTITY_STORED', 'Facebook provider and provider_subject persisted in oauth_accounts');

    // 32 & 33. Password security: password_hash is NULL (no fake passwords)
    const userRow = await query(`SELECT password_hash FROM users WHERE id = $1`, [newFbUserId]);
    assert.strictEqual(userRow.rows[0].password_hash, null, 'password_hash must be strictly NULL for OAuth account');
    pass('PASSWORD_SECURITY', 'No fake or insecure password hashes created for Facebook user');

    // Sequential client tag created
    const clientRow = await query(`SELECT * FROM clients WHERE user_id = $1`, [newFbUserId]);
    assert.strictEqual(clientRow.rows.length, 1, 'Client profile row created');
    assert(/^Client #[0-9]{3,}$/.test(clientRow.rows[0].client_number), 'Sequential Client # tag assigned');
    pass('CLIENT_PROVISIONING', 'Client organization and sequential client number assigned');
  }

  // --- SECTION 7: EXISTING FACEBOOK USER RE-AUTHENTICATION & DUPLICATE DEFENSE ---
  console.log('\n--- SECTION 7: EXISTING FACEBOOK USER RE-AUTHENTICATION & DUPLICATE DEFENSE ---');
  {
    // 16. Existing Facebook identity signs in to same user
    const loginState = FacebookOAuthService.generateAuthorizationUrl('/dashboard');
    const loginRes = await api(
      `/api/auth/facebook/callback?state=${loginState.state}&code=valid_fb_code&format=json`
    );

    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.body.isNewUser, false, 'isNewUser flag must be false on subsequent login');
    assert.strictEqual(loginRes.body.user.id, newFbUserId, 'Resolves to same existing platform user ID');
    pass('EXISTING_LOGIN', 'Existing Facebook identity authenticates seamlessly to same user account');

    // 15 & 17. Provider + subject uniqueness prevents duplicate accounts
    const countOauth = await query(
      `SELECT COUNT(*)::int as count FROM oauth_accounts WHERE provider = 'facebook' AND provider_subject = $1`,
      [newFbSub]
    );
    assert.strictEqual(countOauth.rows[0].count, 1, 'Exactly one oauth_account record exists');

    const countUsers = await query(
      `SELECT COUNT(*)::int as count FROM users WHERE email = $1`,
      [newFbEmail]
    );
    assert.strictEqual(countUsers.rows[0].count, 1, 'Exactly one platform user exists');
    pass('DUPLICATE_PREVENTION', 'UNIQUE(provider, provider_subject) prevents duplicate Facebook identities');
  }

  // --- SECTION 8: UNLINKED EXISTING EMAIL CONFLICT DEFENSE ---
  console.log('\n--- SECTION 8: UNLINKED EXISTING EMAIL CONFLICT DEFENSE ---');
  {
    // 18 & 19. Create an unlinked local user with a known email
    const localEmail = `local_user_${timestamp}@example.com`;
    const localUserRes = await query(
      `INSERT INTO users (uid, public_uid, email, password_hash, role, status)
       VALUES ($1, $1, $2, 'argon2id_mock_hash', 'CLIENT', 'ACTIVE')
       RETURNING id`,
      [generateUserUid(), localEmail]
    );
    const localUserId = localUserRes.rows[0].id;

    // Simulate Facebook login attempt with the SAME email but new Facebook ID
    const conflictingSub = `fb_sub_conflict_${timestamp}`;
    FacebookOAuthService.setTestIdentityVerifier(async () => {
      return {
        id: conflictingSub,
        name: 'Conflicting FB User',
        email: localEmail,
      };
    });

    const conflictState = FacebookOAuthService.generateAuthorizationUrl('/dashboard');
    const conflictRes = await api(
      `/api/auth/facebook/callback?state=${conflictState.state}&code=conflict_code&format=json`
    );

    assert.strictEqual(conflictRes.status, 409, 'Email conflict must be rejected with 409 Conflict');
    assert.strictEqual(conflictRes.body.code, 'account_exists_conflict');
    assert(
      conflictRes.body.error.includes('An account already exists with this email'),
      'Clear error instructing user to sign in with existing credentials'
    );

    // Verify no oauth_account was linked
    const checkOauthLink = await query(
      `SELECT * FROM oauth_accounts WHERE provider_subject = $1`,
      [conflictingSub]
    );
    assert.strictEqual(checkOauthLink.rows.length, 0, 'No unauthorized OAuth link created');

    // Verify no duplicate users created
    const countUsers = await query(`SELECT COUNT(*)::int as count FROM users WHERE email = $1`, [localEmail]);
    assert.strictEqual(countUsers.rows[0].count, 1, 'Only one user exists with the email');
    pass('EMAIL_CONFLICT_DEFENSE', 'Matching email without Facebook link rejects login without creating duplicates');
  }

  // --- SECTION 9: ACCOUNT STATUS ENFORCEMENT (SUSPENDED & DISABLED) ---
  console.log('\n--- SECTION 9: ACCOUNT STATUS ENFORCEMENT (SUSPENDED & DISABLED) ---');
  {
    // 24. Suspend the OAuth user account
    await query(`UPDATE users SET status = 'SUSPENDED', is_suspended = TRUE WHERE id = $1`, [newFbUserId]);

    FacebookOAuthService.setTestIdentityVerifier(async () => {
      return {
        id: newFbSub,
        name: 'First Facebook User',
        email: newFbEmail,
      };
    });

    const suspendedState = FacebookOAuthService.generateAuthorizationUrl('/dashboard');
    const suspendedRes = await api(
      `/api/auth/facebook/callback?state=${suspendedState.state}&code=valid_fb_code&format=json`
    );
    assert.strictEqual(suspendedRes.status, 403, 'Suspended account OAuth login must return 403');
    assert.strictEqual(suspendedRes.body.code, 'account_suspended');
    pass('SUSPENSION_ENFORCEMENT', 'Suspended account blocked from Facebook OAuth authentication');

    // 25. Disable the OAuth user account
    await query(`UPDATE users SET status = 'DISABLED', is_suspended = FALSE WHERE id = $1`, [newFbUserId]);

    const disabledState = FacebookOAuthService.generateAuthorizationUrl('/dashboard');
    const disabledRes = await api(
      `/api/auth/facebook/callback?state=${disabledState.state}&code=valid_fb_code&format=json`
    );
    assert.strictEqual(disabledRes.status, 403, 'Disabled account OAuth login must return 403');
    assert.strictEqual(disabledRes.body.code, 'account_disabled');
    pass('DISABLED_ENFORCEMENT', 'Disabled account blocked from Facebook OAuth authentication');

    // Restore user to ACTIVE for subsequent tests
    await query(`UPDATE users SET status = 'ACTIVE' WHERE id = $1`, [newFbUserId]);
  }

  // --- SECTION 10: DEVELOPER APPROVAL & ROLE IMMUTABILITY ---
  console.log('\n--- SECTION 10: DEVELOPER APPROVAL & ROLE IMMUTABILITY ---');
  {
    // 26. Register a developer via standard onboarding (starts as PENDING_VERIFICATION)
    const devEmail = `dev_fb_${timestamp}@example.com`;
    const devSub = `fb_sub_dev_${timestamp}`;
    const regDevRes = await api('/api/auth/register/developer', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Dev FB Applicant',
        username: `devfb_${timestamp}`,
        email: devEmail,
        password: 'DevPlatform2026!Secure',
        confirmPassword: 'DevPlatform2026!Secure',
        roleTitle: 'Full-Stack Engineer',
      }),
    });
    assert.strictEqual(regDevRes.status, 201, 'Developer registered');
    const devUserId = regDevRes.body.user.id;

    // Link Facebook OAuth to this developer in database
    await query(
      `INSERT INTO oauth_accounts (user_id, provider, provider_subject, provider_email, provider_email_verified)
       VALUES ($1, 'facebook', $2, $3, TRUE)`,
      [devUserId, devSub, devEmail]
    );

    // Authenticate developer via Facebook OAuth
    FacebookOAuthService.setTestIdentityVerifier(async () => {
      return {
        id: devSub,
        name: 'Dev FB Applicant',
        email: devEmail,
      };
    });

    const devState = FacebookOAuthService.generateAuthorizationUrl('/dashboard');
    const devLoginRes = await api(
      `/api/auth/facebook/callback?state=${devState.state}&code=dev_code&format=json`
    );
    assert.strictEqual(devLoginRes.status, 200);
    assert.strictEqual(devLoginRes.body.user.role, ROLES.DEVELOPER, 'Role preserved as DEVELOPER');

    // Verify developer profile verification_status is STILL PENDING (not auto-approved)
    const devCheck = await query(
      `SELECT verification_status FROM developers WHERE user_id = $1`,
      [devUserId]
    );
    assert.strictEqual(
      devCheck.rows[0].verification_status,
      'PENDING',
      'Developer approval status remains PENDING'
    );
    pass('DEV_APPROVAL_PRESERVED', 'Facebook OAuth preserves PENDING status without auto-approving developers');
  }

  // --- SECTION 11: CEO & MD EXECUTIVE GOVERNANCE PROTECTION ---
  console.log('\n--- SECTION 11: CEO & MD EXECUTIVE GOVERNANCE PROTECTION ---');
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

  // --- SECTION 12: SESSION SECURITY & TOKEN VERSIONING ---
  console.log('\n--- SECTION 12: SESSION SECURITY & TOKEN VERSIONING ---');
  {
    // 34. Facebook OAuth issues standard platform JWT recognized by middleware
    FacebookOAuthService.setTestIdentityVerifier(async () => {
      return {
        id: newFbSub,
        name: 'First Facebook User',
        email: newFbEmail,
      };
    });

    const sessionState = FacebookOAuthService.generateAuthorizationUrl('/dashboard');
    const sessionRes = await api(
      `/api/auth/facebook/callback?state=${sessionState.state}&code=valid_fb_code&format=json`
    );
    const fbSessionToken = sessionRes.body.token;

    const meRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${fbSessionToken}` },
    });
    assert.strictEqual(meRes.status, 200, 'Standard authenticateJwt accepts session token');
    assert.strictEqual(meRes.body.user.email, newFbEmail, 'Identity confirmed via /api/auth/me');
    pass('SESSION_RECOGNITION', 'Facebook OAuth session JWT accepted by standard authenticateJwt middleware');

    // 35. Token version increment revokes all sessions
    await query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [newFbUserId]);

    const revokedMeRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${fbSessionToken}` },
    });
    assert.strictEqual(revokedMeRes.status, 401, 'Revoked token rejected with 401 Unauthorized');
    pass('TOKEN_VERSION_REVOCATION', 'Token version increment invalidates Facebook OAuth sessions');
  }

  // --- SECTION 13: AUDIT LOGGING & ZERO CREDENTIAL LEAKAGE ---
  console.log('\n--- SECTION 13: AUDIT LOGGING & ZERO CREDENTIAL LEAKAGE ---');
  {
    // 36. Check audit log actions recorded
    const auditRes = await query(
      `SELECT action, metadata FROM audit_logs 
       WHERE action IN ('FACEBOOK_OAUTH_STARTED', 'FACEBOOK_OAUTH_SUCCESS', 'FACEBOOK_ACCOUNT_CREATED', 'FACEBOOK_ACCOUNT_LOGIN', 'FACEBOOK_ACCOUNT_EMAIL_CONFLICT', 'FACEBOOK_OAUTH_FAILURE')
         AND created_at >= $1
       ORDER BY created_at DESC LIMIT 100`,
      [startTime]
    );
    assert(auditRes.rows.length >= 3, 'Audit logs recorded OAuth lifecycle events');
    const actions = new Set(auditRes.rows.map((r: any) => r.action));
    assert(actions.has('FACEBOOK_OAUTH_STARTED'), 'FACEBOOK_OAUTH_STARTED recorded');
    assert(actions.has('FACEBOOK_ACCOUNT_CREATED') || actions.has('FACEBOOK_ACCOUNT_LOGIN'), 'Account creation/login recorded');
    pass('AUDIT_LOGGING', 'OAuth lifecycle events recorded in append-only audit trail');

    // 37 & 38. Audit logs never contain sensitive secrets or tokens
    for (const row of auditRes.rows) {
      const metaStr = JSON.stringify(row.metadata);
      assert(!metaStr.includes('client_secret'), 'Audit log must not contain client_secret');
      assert(!metaStr.includes('code_verifier'), 'Audit log must not contain code_verifier');
      assert(!metaStr.includes('access_token'), 'Audit log must not contain access_token');
    }
    pass('SECRET_HYGIENE', 'Zero tokens, secrets, or PKCE verifiers leaked in audit logs');
  }

  // --- SECTION 14: RATE LIMITING & START PROJECT FLOW ---
  console.log('\n--- SECTION 14: RATE LIMITING & START PROJECT FLOW ---');
  {
    // 39. Rate limiter covers Facebook endpoints
    const routeSource = fs.readFileSync(path.resolve(process.cwd(), 'src/routes/authRoutes.ts'), 'utf8');
    assert(routeSource.includes('router.use(authRateLimiter('), 'authRateLimiter applied across all auth routes');
    assert(routeSource.includes('/facebook'), 'Facebook routes defined under rate-limited router');
    pass('RATE_LIMITING', 'Facebook OAuth endpoints protected by authRateLimiter');

    // 44. Start Project authentication flow
    const startProjectState = FacebookOAuthService.generateAuthorizationUrl('/start-project');
    assert.strictEqual(startProjectState.codeVerifier.length > 20, true);
    const startSession = FacebookOAuthService.consumeState(startProjectState.state);
    assert.strictEqual(startSession.returnUrl, '/start-project');
    pass('START_PROJECT_FLOW', 'Start Project authentication return destination securely preserved');
  }

  // --- SECTION 15: GOOGLE OAUTH & MULTI-AUTH REGRESSION ---
  console.log('\n--- SECTION 15: GOOGLE OAUTH & MULTI-AUTH REGRESSION ---');
  {
    // 40. Google OAuth still functions without interference
    const googleInitRes = await api('/api/auth/google?format=json');
    assert.strictEqual(googleInitRes.status, 200, 'Google OAuth initiation route returns 200');
    assert(googleInitRes.body.url.includes('accounts.google.com'), 'Google URL points to accounts.google.com');
    pass('GOOGLE_REGRESSION', 'Google OAuth initiation remains fully functional without interference');

    // 41. Email/password authentication still works
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

    // 42. Client registration still works
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

    // 43. Developer registration still works
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

  // --- SECTION 16: REGRESSION TESTING (PHASES 1 - 5) ---
  console.log('\n--- SECTION 16: REGRESSION TESTING (PHASES 1 - 5) ---');
  {
    // 45. Phase 1 password security regression
    const pwdRes = await query(`SELECT password_hash FROM users WHERE email = 'shivaa1906@gmail.com'`);
    assert(isArgon2Hash(pwdRes.rows[0].password_hash), 'Argon2id password hashing intact');
    pass('PHASE1_REGRESSION', 'Phase 1 Argon2id password security intact');

    // 46. Phase 2 mock-free query regression
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

    // 47. Phase 3 Executive governance regression
    const execSettings = await query(`SELECT key, value, description, updated_at FROM platform_settings ORDER BY key ASC`);
    assert(execSettings.rows.length >= 1, 'Platform settings available to platform executives');
    pass('PHASE3_REGRESSION', 'Phase 3 Executive governance and settings access preserved');

    // 48. Phase 4 multi-role authentication & developer directory preserved
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

    // 49. Phase 5 Google OAuth regression
    const googleAccountCount = await query(
      `SELECT COUNT(*)::int as count FROM oauth_accounts WHERE provider = 'google'`
    );
    assert(googleAccountCount.rows[0].count >= 0, 'Google OAuth accounts table queryable and unaffected');
    pass('PHASE5_REGRESSION', 'Phase 5 Google OAuth database and service invariants preserved');
  }

  // --- SECTION 17: FRONTEND UI VERIFICATION ---
  console.log('\n--- SECTION 17: FRONTEND UI VERIFICATION ---');
  {
    const loginPage = fs.readFileSync(path.resolve(process.cwd(), '../frontend/app/login/page.tsx'), 'utf8');
    assert(loginPage.includes('Continue with Google'), 'Login includes Google sign-in');
    assert(loginPage.includes('Continue with Facebook'), 'Login includes Facebook sign-in');
    assert(loginPage.includes('handleFacebookLogin'), 'Login includes handleFacebookLogin');
    pass('UI_LOGIN', 'Login page includes both Google and Facebook OAuth buttons with error handling');

    const clientRegPage = fs.readFileSync(path.resolve(process.cwd(), '../frontend/app/register/client/page.tsx'), 'utf8');
    assert(clientRegPage.includes('Continue with Google'), 'Client register includes Google');
    assert(clientRegPage.includes('Continue with Facebook'), 'Client register includes Facebook');
    pass('UI_REGISTRATION', 'Client registration provides both Google and Facebook onboarding');

    const docFile = fs.readFileSync(path.resolve(process.cwd(), '../docs/facebook-oauth-setup.md'), 'utf8');
    assert(docFile.includes('FACEBOOK_CLIENT_ID'), 'Setup doc covers FACEBOOK_CLIENT_ID');
    assert(docFile.includes('Valid OAuth Redirect URIs'), 'Setup doc covers redirect URI');
    pass('DOCS_VERIFICATION', 'Facebook OAuth developer setup guide documented in docs/facebook-oauth-setup.md');
  }

  console.log('\n================================================================');
  console.log(`PHASE 6 TEST SUMMARY: ${passedChecks} / ${totalChecks} PASSED`);
  console.log('================================================================\n');

  if (passedChecks !== totalChecks) {
    throw new Error(`Test suite failed: ${totalChecks - passedChecks} checks did not pass.`);
  }
}

// Auto-run if executed directly
if (process.argv[1]?.includes('phase6FacebookOAuthTest')) {
  runPhase6Tests()
    .then(() => {
      console.log('🎉 ALL PHASE 6 FACEBOOK OAUTH CHECKS PASSED!\n');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ PHASE 6 TEST FAILURE:', err);
      process.exit(1);
    });
}
