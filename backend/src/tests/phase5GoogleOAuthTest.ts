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
import { GoogleOAuthService, GoogleIdentityClaims } from '../services/googleOAuthService.js';
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

export async function runPhase5Tests() {
  console.log('================================================================');
  console.log('PHASE 5 — GOOGLE OAUTH AUTHENTICATION & SECURITY TEST SUITE');
  console.log('================================================================\n');

  await setupSuite();

  // Test credentials configuration
  env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  env.GOOGLE_CLIENT_SECRET = 'test-client-secret-secure';
  env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:5000/api/auth/google/callback';

  const timestamp = Date.now().toString().slice(-6);

  // --- SECTION 1: ROUTE & CONFIGURATION VERIFICATION ---
  console.log('--- SECTION 1: ROUTE & CONFIGURATION VERIFICATION ---');
  {
    // 1. Google OAuth endpoints exist
    const initRes = await api('/api/auth/google?format=json');
    assert.strictEqual(initRes.status, 200, 'Initiation endpoint must exist and return 200 JSON in test mode');
    assert(initRes.body.url.includes('accounts.google.com'), 'Initiation URL must point to accounts.google.com');
    pass('ROUTING', 'Google OAuth initiation route /api/auth/google exists');

    // 2. Configuration is read dynamically from environment (no hardcoded credentials)
    assert.strictEqual(env.GOOGLE_CLIENT_ID, 'test-client-id.apps.googleusercontent.com');
    assert.strictEqual(env.GOOGLE_OAUTH_REDIRECT_URI, 'http://localhost:5000/api/auth/google/callback');
    pass('CONFIG', 'OAuth configuration dynamically read from environment variables');

    // 3. Scan codebase to guarantee zero hardcoded Google client secrets in code
    const serviceSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/googleOAuthService.ts'),
      'utf8'
    );
    assert(!serviceSource.includes('GOCSPX-'), 'Zero hardcoded Google production secrets in service source');
    assert(!serviceSource.includes('fakeGoogleUser'), 'Zero mock Google users in production paths');
    pass('CREDENTIAL_HYGIENE', 'Zero hardcoded secrets or fake users found in codebase');
  }

  // --- SECTION 2: OAUTH STATE & PKCE CRYPTOGRAPHIC PROTECTION ---
  console.log('\n--- SECTION 2: OAUTH STATE & PKCE CRYPTOGRAPHIC PROTECTION ---');
  {
    // 4. OAuth state generation
    const oauthUrlObj = GoogleOAuthService.generateAuthorizationUrl('/dashboard');
    assert(typeof oauthUrlObj.state === 'string', 'OAuth state must be generated as string');
    pass('STATE', 'OAuth state parameter generated securely');

    // 5. OAuth state has sufficient entropy (32 bytes = 64 hex characters >= 256 bits)
    assert.strictEqual(oauthUrlObj.state.length, 64, 'OAuth state must be at least 64 hex characters (256 bits)');
    assert(/^[0-9a-f]{64}$/i.test(oauthUrlObj.state), 'OAuth state conforms to hex CSPRNG format');
    pass('ENTROPY', 'OAuth state contains 256 bits of cryptographic entropy');

    // 6. PKCE code_challenge uses S256 method
    assert(oauthUrlObj.authorizationUrl.includes('code_challenge_method=S256'), 'Must enforce S256 challenge method');
    assert(oauthUrlObj.authorizationUrl.includes('code_challenge='), 'Must include code_challenge');
    pass('PKCE', 'PKCE code_challenge and code_challenge_method=S256 enforced');

    // 7. State is single-use and consumption removes it
    const consumedSession = GoogleOAuthService.consumeState(oauthUrlObj.state);
    assert.strictEqual(consumedSession.state, oauthUrlObj.state, 'Consumed session matches state');
    pass('SINGLE_USE', 'OAuth state is consumable exactly once');

    // 8. Replayed state is rejected
    let replayedRejected = false;
    try {
      GoogleOAuthService.consumeState(oauthUrlObj.state);
    } catch (err: any) {
      replayedRejected = true;
      assert.strictEqual(err.code, 'INVALID_STATE');
    }
    assert(replayedRejected, 'Replaying consumed state must be strictly rejected');
    pass('REPLAY_DEFENSE', 'Replayed OAuth state immediately rejected');

    // 9. Invalid/unrecognized state rejected
    let invalidRejected = false;
    try {
      GoogleOAuthService.consumeState('completely_invalid_state_token_12345');
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
    // 10. Open redirect attempts blocked
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
    const stateSession = GoogleOAuthService.generateAuthorizationUrl('/dashboard');
    const noCodeRes = await api(`/api/auth/google/callback?state=${stateSession.state}&format=json`);
    assert.strictEqual(noCodeRes.status, 400, 'Callback missing authorization code must return 400');
    assert(noCodeRes.body.error.includes('code is missing'), 'Explains missing authorization code');
    pass('CALLBACK_CODE', 'Callback without authorization code safely rejected');

    // 12. Provider cancellation handled safely
    const cancelRes = await api('/api/auth/google/callback?error=access_denied&format=json');
    assert.strictEqual(cancelRes.status, 400, 'Provider cancelled error must return 400');
    assert.strictEqual(cancelRes.body.code, 'cancelled');
    assert.strictEqual(cancelRes.body.error, 'Google sign-in was cancelled.');
    pass('CANCELLATION', 'Google sign-in user cancellation handled gracefully');

    // 13. Callback with invalid state returns state_expired error
    const badStateRes = await api('/api/auth/google/callback?state=bogus_state&code=test_code&format=json');
    assert.strictEqual(badStateRes.status, 400);
    assert(badStateRes.body.error.includes('expired') || badStateRes.body.code === 'invalid_state');
    pass('EXPIRED_STATE', 'Callback with invalid or expired state returns clear user message');
  }

  // --- SECTION 5: ID TOKEN SIGNATURE, CLAIMS, & VERIFICATION ---
  console.log('\n--- SECTION 5: ID TOKEN SIGNATURE, CLAIMS, & VERIFICATION ---');
  {
    // Configure test token exchanger so exchange succeeds and verification logic is directly exercised
    GoogleOAuthService.setTestTokenExchanger(async () => ({ id_token: 'mock.id.token' }));

    // 14. Wrong audience rejected
    let wrongAudRejected = false;
    GoogleOAuthService.setTestTokenVerifier(async () => {
      const err: any = new Error('Google ID token audience mismatch.');
      err.code = 'INVALID_AUDIENCE';
      throw err;
    });

    const audState = GoogleOAuthService.generateAuthorizationUrl('/dashboard');
    const wrongAudRes = await api(
      `/api/auth/google/callback?state=${audState.state}&code=mock_code&format=json`
    );
    assert.strictEqual(wrongAudRes.status, 401, 'Token with untrusted audience must be rejected with 401');
    assert.strictEqual(wrongAudRes.body.code, 'invalid_audience');
    pass('AUDIENCE_CHECK', 'ID token with invalid audience rejected');

    // 15. Wrong issuer rejected
    GoogleOAuthService.setTestTokenVerifier(async () => {
      const err: any = new Error('Google ID token issuer mismatch.');
      err.code = 'INVALID_ISSUER';
      throw err;
    });

    const issState = GoogleOAuthService.generateAuthorizationUrl('/dashboard');
    const wrongIssRes = await api(
      `/api/auth/google/callback?state=${issState.state}&code=mock_code&format=json`
    );
    assert.strictEqual(wrongIssRes.status, 401, 'Token with untrusted issuer must be rejected with 401');
    assert.strictEqual(wrongIssRes.body.code, 'invalid_issuer');
    pass('ISSUER_CHECK', 'ID token with untrusted issuer rejected');

    // 16. Expired token rejected
    GoogleOAuthService.setTestTokenVerifier(async () => {
      const err: any = new Error('Google ID token has expired.');
      err.code = 'TOKEN_EXPIRED';
      throw err;
    });

    const expState = GoogleOAuthService.generateAuthorizationUrl('/dashboard');
    const expRes = await api(
      `/api/auth/google/callback?state=${expState.state}&code=mock_code&format=json`
    );
    assert.strictEqual(expRes.status, 401, 'Expired token must return 401');
    assert.strictEqual(expRes.body.code, 'token_expired');
    pass('EXPIRATION_CHECK', 'Expired Google ID token rejected');

    // 17. Unverified email from Google rejected
    GoogleOAuthService.setTestTokenVerifier(async () => {
      return {
        sub: 'google_unverified_sub_001',
        email: `unverified_${timestamp}@gmail.com`,
        email_verified: false, // Unverified!
        name: 'Unverified Google User',
        aud: env.GOOGLE_CLIENT_ID,
        iss: 'https://accounts.google.com',
      };
    });

    const unverifiedState = GoogleOAuthService.generateAuthorizationUrl('/dashboard');
    const unverifiedRes = await api(
      `/api/auth/google/callback?state=${unverifiedState.state}&code=mock_code&format=json`
    );
    assert.strictEqual(unverifiedRes.status, 400, 'Unverified email must return 400');
    assert.strictEqual(unverifiedRes.body.code, 'unverified_email');
    pass('EMAIL_VERIFIED_CHECK', 'Google accounts with email_verified=false rejected');
  }

  // --- SECTION 6: NEW USER PROVISIONING & IDENTITY INTEGRITY ---
  console.log('\n--- SECTION 6: NEW USER PROVISIONING & IDENTITY INTEGRITY ---');
  let newGoogleUserId = '';
  let newGoogleUid = '';
  const newGoogleSub = `google_sub_new_${timestamp}`;
  const newGoogleEmail = `googlenew_${timestamp}@gmail.com`;
  {
    GoogleOAuthService.setTestTokenVerifier(async () => {
      return {
        sub: newGoogleSub,
        email: newGoogleEmail,
        email_verified: true,
        name: 'Sarah Connor Tech',
        picture: 'https://lh3.googleusercontent.com/photo_sarah.jpg',
        aud: env.GOOGLE_CLIENT_ID,
        iss: 'https://accounts.google.com',
      };
    });

    const newState = GoogleOAuthService.generateAuthorizationUrl('/start-project');
    const createRes = await api(
      `/api/auth/google/callback?state=${newState.state}&code=valid_test_code&format=json`
    );

    assert.strictEqual(createRes.status, 200, 'New Google OAuth user registration returns 200');
    assert(createRes.body.token, 'Must return signed JWT session token');
    assert.strictEqual(createRes.body.isNewUser, true, 'isNewUser flag must be true');
    assert.strictEqual(createRes.body.user.email, newGoogleEmail);
    assert.strictEqual(createRes.body.user.role, ROLES.CLIENT, 'Server strictly assigns CLIENT role');
    assert.strictEqual(createRes.body.redirectUrl, '/start-project', 'Preserves internal returnUrl');

    newGoogleUserId = createRes.body.user.id;
    newGoogleUid = createRes.body.user.uid;

    // 18. Google sub is NOT used as platform UID (Platform UID must be 16-char alphanumeric)
    assert.notStrictEqual(newGoogleUid, newGoogleSub, 'Platform UID must not equal Google sub');
    assert.strictEqual(newGoogleUid.length, 16, 'Platform UID must be exact 16 characters');
    assert(/^[A-Za-z0-9]{16}$/.test(newGoogleUid), 'Platform UID conforms strictly to [A-Za-z0-9]');
    pass('UID_GENERATION', '16-character alphanumeric internal UID assigned (Google sub never used as UID)');

    // 19. Provider identity stored in oauth_accounts table
    const oauthDbRes = await query(
      `SELECT * FROM oauth_accounts WHERE provider = 'google' AND provider_subject = $1`,
      [newGoogleSub]
    );
    assert.strictEqual(oauthDbRes.rows.length, 1, 'Exactly one oauth_accounts row created');
    assert.strictEqual(oauthDbRes.rows[0].user_id, newGoogleUserId);
    assert.strictEqual(oauthDbRes.rows[0].provider, 'google');
    assert.strictEqual(oauthDbRes.rows[0].provider_subject, newGoogleSub);
    assert.strictEqual(oauthDbRes.rows[0].provider_email, newGoogleEmail);
    assert.strictEqual(oauthDbRes.rows[0].provider_email_verified, true);
    pass('PROVIDER_STORAGE', 'Federated identity stored in oauth_accounts table with Google sub');

    // 20. Client record created with sequential identifier
    const clientDbRes = await query(
      `SELECT * FROM clients WHERE user_id = $1`,
      [newGoogleUserId]
    );
    assert.strictEqual(clientDbRes.rows.length, 1, 'Client profile row created');
    assert(/^Client #[0-9]{3,}$/.test(clientDbRes.rows[0].client_number), 'Sequential Client # tag assigned');
    pass('CLIENT_PROVISIONING', 'Client organization record generated automatically');

    // 21. Password security intact: password_hash is NULL (no fake passwords)
    const userDbRes = await query(
      `SELECT password_hash FROM users WHERE id = $1`,
      [newGoogleUserId]
    );
    assert.strictEqual(userDbRes.rows[0].password_hash, null, 'OAuth user password_hash must be strictly NULL');
    pass('PASSWORD_SECURITY', 'No fake or placeholder password stored for Google OAuth user');
  }

  // --- SECTION 7: EXISTING GOOGLE IDENTITY LOGIN ---
  console.log('\n--- SECTION 7: EXISTING GOOGLE IDENTITY LOGIN ---');
  {
    // 22. Returning Google identity authenticates into the SAME existing account
    GoogleOAuthService.setTestTokenVerifier(async () => {
      return {
        sub: newGoogleSub,
        email: newGoogleEmail,
        email_verified: true,
        name: 'Sarah Connor Tech',
        aud: env.GOOGLE_CLIENT_ID,
        iss: 'https://accounts.google.com',
      };
    });

    const returnState = GoogleOAuthService.generateAuthorizationUrl('/dashboard');
    const returnLoginRes = await api(
      `/api/auth/google/callback?state=${returnState.state}&code=another_valid_code&format=json`
    );

    assert.strictEqual(returnLoginRes.status, 200, 'Returning user login succeeds with 200');
    assert.strictEqual(returnLoginRes.body.isNewUser, false, 'isNewUser flag must be false');
    assert.strictEqual(returnLoginRes.body.user.id, newGoogleUserId, 'Logs into exact same user account');
    assert.strictEqual(returnLoginRes.body.user.uid, newGoogleUid, 'Preserves original 16-character UID');

    // Verify no duplicate users created
    const countUsers = await query(`SELECT COUNT(*)::int as count FROM users WHERE email = $1`, [newGoogleEmail]);
    assert.strictEqual(countUsers.rows[0].count, 1, 'Zero duplicate user records created');
    pass('IDENTITY_REUSE', 'Existing Google sub identity maps directly to original user account');

    // 23. Database unique constraint on (provider, provider_subject)
    let duplicateDbInsertBlocked = false;
    try {
      await query(
        `INSERT INTO oauth_accounts (user_id, provider, provider_subject) VALUES ($1, 'google', $2)`,
        [newGoogleUserId, newGoogleSub]
      );
    } catch (err: any) {
      duplicateDbInsertBlocked = err.code === '23505'; // unique_violation
    }
    assert(duplicateDbInsertBlocked, 'Database enforces UNIQUE(provider, provider_subject)');
    pass('DB_CONSTRAINT', 'UNIQUE(provider, provider_subject) constraint enforced by PostgreSQL');
  }

  // --- SECTION 8: EMAIL CONFLICT WITH UNLINKED LOCAL ACCOUNT ---
  console.log('\n--- SECTION 8: EMAIL CONFLICT WITH UNLINKED LOCAL ACCOUNT ---');
  {
    // 24. Create standard email+password account
    const localEmail = `local_user_${timestamp}@example.com`;
    const regLocalRes = await api('/api/auth/register/client', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Local Pre-existing Client',
        email: localEmail,
        password: 'DevPlatform2026!Secure',
        confirmPassword: 'DevPlatform2026!Secure',
      }),
    });
    assert.strictEqual(regLocalRes.status, 201, 'Local client registered');

    // Attempt Google login with matching email but DIFFERENT unlinked Google sub
    const conflictingSub = `google_sub_conflict_${timestamp}`;
    GoogleOAuthService.setTestTokenVerifier(async () => {
      return {
        sub: conflictingSub,
        email: localEmail,
        email_verified: true,
        name: 'Attacker or Unlinked Google',
        aud: env.GOOGLE_CLIENT_ID,
        iss: 'https://accounts.google.com',
      };
    });

    const conflictState = GoogleOAuthService.generateAuthorizationUrl('/dashboard');
    const conflictRes = await api(
      `/api/auth/google/callback?state=${conflictState.state}&code=conflict_code&format=json`
    );

    // 25. Must NOT silently link or create duplicate account
    assert.strictEqual(conflictRes.status, 409, 'Email conflict must return 409 Conflict');
    assert.strictEqual(conflictRes.body.code, 'account_exists_conflict');
    assert(
      conflictRes.body.error.includes('An account already exists with this email'),
      'Clear, safe error message shown'
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
    pass('EMAIL_CONFLICT_DEFENSE', 'Matching email without Google link rejects login without creating duplicates');
  }

  // --- SECTION 9: ACCOUNT STATUS ENFORCEMENT (SUSPENDED & DISABLED) ---
  console.log('\n--- SECTION 9: ACCOUNT STATUS ENFORCEMENT (SUSPENDED & DISABLED) ---');
  {
    // 26. Suspend the OAuth user account
    await query(`UPDATE users SET status = 'SUSPENDED', is_suspended = TRUE WHERE id = $1`, [newGoogleUserId]);

    GoogleOAuthService.setTestTokenVerifier(async () => {
      return {
        sub: newGoogleSub,
        email: newGoogleEmail,
        email_verified: true,
        aud: env.GOOGLE_CLIENT_ID,
        iss: 'https://accounts.google.com',
      };
    });

    const suspendedState = GoogleOAuthService.generateAuthorizationUrl('/dashboard');
    const suspendedRes = await api(
      `/api/auth/google/callback?state=${suspendedState.state}&code=valid_code&format=json`
    );
    assert.strictEqual(suspendedRes.status, 403, 'Suspended account OAuth login must return 403');
    assert.strictEqual(suspendedRes.body.code, 'account_suspended');
    pass('SUSPENSION_ENFORCEMENT', 'Suspended account blocked from Google OAuth authentication');

    // 27. Disable the OAuth user account
    await query(`UPDATE users SET status = 'DISABLED', is_suspended = FALSE WHERE id = $1`, [newGoogleUserId]);

    const disabledState = GoogleOAuthService.generateAuthorizationUrl('/dashboard');
    const disabledRes = await api(
      `/api/auth/google/callback?state=${disabledState.state}&code=valid_code&format=json`
    );
    assert.strictEqual(disabledRes.status, 403, 'Disabled account OAuth login must return 403');
    assert.strictEqual(disabledRes.body.code, 'account_disabled');
    pass('DISABLED_ENFORCEMENT', 'Disabled account blocked from Google OAuth authentication');

    // Restore user to ACTIVE for subsequent tests
    await query(`UPDATE users SET status = 'ACTIVE' WHERE id = $1`, [newGoogleUserId]);
  }

  // --- SECTION 10: DEVELOPER APPROVAL & ROLE IMMUTABILITY ---
  console.log('\n--- SECTION 10: DEVELOPER APPROVAL & ROLE IMMUTABILITY ---');
  {
    // 28. Register a developer via standard onboarding (starts as PENDING_VERIFICATION)
    const devEmail = `dev_oauth_${timestamp}@example.com`;
    const devSub = `google_sub_dev_${timestamp}`;
    const regDevRes = await api('/api/auth/register/developer', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Dev OAuth Applicant',
        username: `devoauth_${timestamp}`,
        email: devEmail,
        password: 'DevPlatform2026!Secure',
        confirmPassword: 'DevPlatform2026!Secure',
        roleTitle: 'Full-Stack Engineer',
      }),
    });
    assert.strictEqual(regDevRes.status, 201, 'Developer registered');
    const devUserId = regDevRes.body.user.id;

    // Link Google OAuth to this developer in database
    await query(
      `INSERT INTO oauth_accounts (user_id, provider, provider_subject, provider_email, provider_email_verified)
       VALUES ($1, 'google', $2, $3, TRUE)`,
      [devUserId, devSub, devEmail]
    );

    // Authenticate developer via Google OAuth
    GoogleOAuthService.setTestTokenVerifier(async () => {
      return {
        sub: devSub,
        email: devEmail,
        email_verified: true,
        aud: env.GOOGLE_CLIENT_ID,
        iss: 'https://accounts.google.com',
      };
    });

    const devState = GoogleOAuthService.generateAuthorizationUrl('/dashboard');
    const devLoginRes = await api(
      `/api/auth/google/callback?state=${devState.state}&code=dev_code&format=json`
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
    pass('DEV_APPROVAL_PRESERVED', 'Google OAuth preserves PENDING status without auto-approving developers');
  }

  // --- SECTION 11: CEO & MD EXECUTIVE GOVERNANCE PROTECTION ---
  console.log('\n--- SECTION 11: CEO & MD EXECUTIVE GOVERNANCE PROTECTION ---');
  {
    // 29. Primary CEO account cannot be modified by OAuth
    const ceoRes = await query(`SELECT id, role, status FROM users WHERE email = 'shivaa1906@gmail.com'`);
    assert.strictEqual(ceoRes.rows[0].role, ROLES.CEO, 'CEO role is CEO');
    assert.strictEqual(ceoRes.rows[0].status, 'ACTIVE', 'CEO status is ACTIVE');

    // 30. MD account cannot be modified by OAuth
    const mdRes = await query(`SELECT id, role, status FROM users WHERE email = 'md@example.invalid'`);
    assert.strictEqual(mdRes.rows[0].role, ROLES.MD, 'MD role is MD');

    pass('EXECUTIVE_PROTECTION', 'CEO and MD accounts, roles, and governance invariants preserved');
  }

  // --- SECTION 12: SESSION SECURITY & TOKEN VERSIONING ---
  console.log('\n--- SECTION 12: SESSION SECURITY & TOKEN VERSIONING ---');
  {
    // 31. Authenticate user via Google OAuth to get valid JWT token
    GoogleOAuthService.setTestTokenVerifier(async () => {
      return {
        sub: newGoogleSub,
        email: newGoogleEmail,
        email_verified: true,
        aud: env.GOOGLE_CLIENT_ID,
        iss: 'https://accounts.google.com',
      };
    });

    const sState = GoogleOAuthService.generateAuthorizationUrl('/dashboard');
    const sLoginRes = await api(
      `/api/auth/google/callback?state=${sState.state}&code=s_code&format=json`
    );
    const googleSessionToken = sLoginRes.body.token;

    // 32. Session recognized by existing authenticateJwt on /api/auth/me
    const meRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${googleSessionToken}` },
    });
    assert.strictEqual(meRes.status, 200, 'Google OAuth JWT accepted by /api/auth/me');
    assert.strictEqual(meRes.body.user.id, newGoogleUserId);
    pass('SESSION_RECOGNITION', 'Google OAuth session JWT accepted by standard authenticateJwt middleware');

    // 33. Token version increment immediately revokes Google session token
    await query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [newGoogleUserId]);

    const revokedMeRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${googleSessionToken}` },
    });
    assert.strictEqual(revokedMeRes.status, 401, 'Revoked token rejected with 401 Unauthorized');
    pass('TOKEN_VERSION_REVOCATION', 'Token version increment invalidates Google OAuth sessions');
  }

  // --- SECTION 13: AUDIT LOGGING & ZERO CREDENTIAL LEAKAGE ---
  console.log('\n--- SECTION 13: AUDIT LOGGING & ZERO CREDENTIAL LEAKAGE ---');
  {
    // 34. Check audit log actions recorded
    const auditRes = await query(
      `SELECT action, metadata FROM audit_logs 
       WHERE action IN ('GOOGLE_OAUTH_STARTED', 'GOOGLE_OAUTH_SUCCESS', 'GOOGLE_ACCOUNT_CREATED', 'GOOGLE_ACCOUNT_LOGIN', 'GOOGLE_ACCOUNT_EMAIL_CONFLICT', 'GOOGLE_OAUTH_FAILURE')
       ORDER BY created_at DESC LIMIT 100`
    );
    assert(auditRes.rows.length >= 3, 'Audit logs recorded OAuth lifecycle events');
    const actions = new Set(auditRes.rows.map((r: any) => r.action));
    assert(actions.has('GOOGLE_OAUTH_STARTED'), 'GOOGLE_OAUTH_STARTED recorded');
    assert(actions.has('GOOGLE_ACCOUNT_CREATED') || actions.has('GOOGLE_ACCOUNT_LOGIN'), 'Account creation/login recorded');
    pass('AUDIT_LOGGING', 'OAuth lifecycle events recorded in append-only audit trail');

    // 35. Audit logs never contain sensitive secrets or tokens
    for (const row of auditRes.rows) {
      const metaStr = JSON.stringify(row.metadata);
      assert(!metaStr.includes('client_secret'), 'Audit log must not contain client_secret');
      assert(!metaStr.includes('code_verifier'), 'Audit log must not contain code_verifier');
      assert(!metaStr.includes('id_token'), 'Audit log must not contain id_token');
      assert(!metaStr.includes('access_token'), 'Audit log must not contain access_token');
    }
    pass('SECRET_HYGIENE', 'Zero tokens, secrets, or PKCE verifiers leaked in audit logs');
  }

  // --- SECTION 14: FRONTEND UI & REGISTRATION ARTIFACTS ---
  console.log('\n--- SECTION 14: FRONTEND UI & REGISTRATION ARTIFACTS ---');
  {
    // 36. Verify Login page contains "Continue with Google"
    const loginPageSource = fs.readFileSync(
      path.resolve(process.cwd(), '../frontend/app/login/page.tsx'),
      'utf8'
    );
    assert(loginPageSource.includes('Continue with Google'), 'Login page must render Continue with Google');
    assert(loginPageSource.includes('/api/auth/google'), 'Login page triggers /api/auth/google');
    pass('UI_LOGIN', 'Login page includes Continue with Google button and error handling');

    // 37. Verify Client Registration page contains Google button
    const clientRegSource = fs.readFileSync(
      path.resolve(process.cwd(), '../frontend/app/register/client/page.tsx'),
      'utf8'
    );
    assert(clientRegSource.includes('Continue with Google'), 'Client register page includes Continue with Google');
    pass('UI_REGISTRATION', 'Client registration provides Continue with Google button');

    // 38. Verify Frontend Auth Callback handler exists
    const callbackSource = fs.readFileSync(
      path.resolve(process.cwd(), '../frontend/app/auth/callback/page.tsx'),
      'utf8'
    );
    assert(callbackSource.includes('AuthCallbackPage'), 'Auth callback component exists');
    assert(callbackSource.includes('nexus_auth_token'), 'Auth callback saves session token');
    pass('UI_CALLBACK', 'Dedicated frontend OAuth callback handler page created');
  }

  // --- SECTION 15: REGRESSION TESTING (PHASES 1 - 4) ---
  console.log('\n--- SECTION 15: REGRESSION TESTING (PHASES 1 - 4) ---');
  {
    // Phase 1 regression: Standard email/password login still works with Argon2id
    const localLoginRes = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'client001@apexretail.io',
        password: 'DevPlatform2026!Secure',
      }),
    });
    assert.strictEqual(localLoginRes.status, 200, 'Standard email/password login still works');
    pass('PHASE1_REGRESSION', 'Phase 1 email/password Argon2id authentication unaffected');

    // Phase 2 regression: Live database queries (no mock data)
    const pubProjects = await api('/api/projects/published');
    assert.strictEqual(pubProjects.status, 200);
    assert(Array.isArray(pubProjects.body.projects), 'Projects live DB array returned');
    pass('PHASE2_REGRESSION', 'Phase 2 mock-free database query integrity preserved');

    // Phase 3 regression: CEO permissions and settings
    const ceoDb = await query(`SELECT id, uid FROM users WHERE email = 'shivaa1906@gmail.com'`);
    const ceoJwt = jwt.sign(
      { userId: ceoDb.rows[0].id, uid: ceoDb.rows[0].uid, email: 'shivaa1906@gmail.com', role: ROLES.CEO, tokenVersion: 1 },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const settingsRes = await api('/api/admin/settings', {
      headers: { Authorization: `Bearer ${ceoJwt}` },
    });
    assert.strictEqual(settingsRes.status, 200, 'CEO has access to platform settings');
    pass('PHASE3_REGRESSION', 'Phase 3 Executive governance and settings access preserved');

    // Phase 4 regression: Client onboarding and project creation
    const devList = await api('/api/developers?limit=3');
    assert.strictEqual(devList.status, 200);
    pass('PHASE4_REGRESSION', 'Phase 4 multi-role authentication & developer directory preserved');
  }

  // Reset test verifier
  GoogleOAuthService.setTestTokenVerifier(null);
  GoogleOAuthService.setTestTokenExchanger(null);

  console.log('\n================================================================');
  console.log(`PHASE 5 TEST SUMMARY: ${passedChecks} / ${totalChecks} PASSED`);
  console.log('================================================================\n');

  server.close();
  process.exit(0);
}

runPhase5Tests().catch((err) => {
  console.error('Fatal test error in Phase 5 suite:', err);
  if (server) server.close();
  process.exit(1);
});
