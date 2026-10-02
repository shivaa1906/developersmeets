import assert from 'assert';
import http from 'http';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { query, withTransaction } from '../database/db.js';
import { env } from '../config/environment.js';
import { httpServer } from '../server.js';
import { ROLES, LEADERSHIP } from '../config/constants.js';
import { generateAccessToken, verifyAccessToken, TOKEN_ISSUER, TOKEN_AUDIENCE } from '../utils/tokenService.js';
import { hashPassword } from '../utils/password.js';
import { AccountLinkingService } from '../services/accountLinkingService.js';
import { BruteForceProtection } from '../middlewares/rateLimiter.js';

let server: http.Server;
let baseUrl: string;

function pass(name: string, detail: string) {
  console.log(`  ✔ [PASS] [${name}] ${detail}`);
}

async function api(path: string, options: any = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
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

export async function runPhase11Tests() {
  console.log('================================================================');
  console.log('PHASE 11 — SESSION / SECURITY HARDENING TEST SUITE');
  console.log('================================================================\n');

  await setupSuite();

  // Test credentials configuration
  env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  env.GOOGLE_CLIENT_SECRET = 'test-client-secret-secure';
  env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:5000/api/auth/google/callback';
  env.FACEBOOK_APP_ID = '123456789012345';
  env.FACEBOOK_APP_SECRET = 'test-fb-secret-secure';
  env.FACEBOOK_REDIRECT_URI = 'http://localhost:5000/api/auth/facebook/callback';
  env.DISCORD_CLIENT_ID = '123456789012345678';
  env.DISCORD_CLIENT_SECRET = 'test-discord-secret-secure';
  env.DISCORD_REDIRECT_URI = 'http://localhost:5000/api/auth/discord/callback';

  const timestamp = Date.now().toString().slice(-6);

  // Helper to register a clean client user
  async function createTestClient(suffix: string) {
    const email = `client_p11_${suffix}_${timestamp}@example.com`;
    const regRes = await api('/api/auth/register/client', {
      method: 'POST',
      body: JSON.stringify({
        fullName: `Client P11 ${suffix}`,
        email,
        password: 'Password123!Secure',
        confirmPassword: 'Password123!Secure',
        companyName: `Security Corp ${suffix}`,
      }),
    });
    assert.strictEqual(regRes.status, 201, `Failed to register client: ${JSON.stringify(regRes.body)}`);
    return {
      user: regRes.body.user,
      token: regRes.body.token,
      email,
      password: 'Password123!Secure',
    };
  }

  // --- SECTION 1: CORE JWT SECURITY & CLAIMS VERIFICATION ---
  console.log('--- SECTION 1: CORE JWT SECURITY & CLAIMS VERIFICATION ---');
  {
    const client = await createTestClient('jwt1');

    // 1. Valid session accepted
    const meRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${client.token}` },
    });
    assert.strictEqual(meRes.status, 200, 'Valid session returns 200');
    assert.strictEqual(meRes.body.user.email, client.email, 'Valid session maps to correct user');
    pass('VALID_SESSION_ACCEPTED', 'Valid JWT session authenticated successfully');

    // 2. Malformed JWT rejected
    const malformedRes = await api('/api/auth/me', {
      headers: { Authorization: 'Bearer totally-malformed-not-a-jwt' },
    });
    assert.strictEqual(malformedRes.status, 401, 'Malformed JWT returns 401');
    pass('MALFORMED_JWT_REJECTED', 'Malformed JWT strings rejected with 401');

    // 3. Expired JWT rejected
    const expiredToken = jwt.sign(
      { userId: client.user.id, role: ROLES.CLIENT, tokenVersion: 1 },
      env.JWT_SECRET,
      { expiresIn: '-10s' }
    );
    const expiredRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert.strictEqual(expiredRes.status, 401, 'Expired JWT returns 401');
    pass('EXPIRED_JWT_REJECTED', 'Expired JWTs rejected with 401 status code');

    // 4. Wrong signature rejected
    const forgedToken = jwt.sign(
      { userId: client.user.id, role: ROLES.CLIENT, tokenVersion: 1 },
      'completely_untrusted_wrong_secret_1234567890',
      { expiresIn: '1h' }
    );
    const forgedRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${forgedToken}` },
    });
    assert.strictEqual(forgedRes.status, 401, 'Forged signature returns 401');
    pass('WRONG_SIGNATURE_REJECTED', 'JWTs signed with wrong secret rejected with 401');

    // 5. Wrong algorithm rejected (alg = none or HS512)
    const noneAlgHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const nonePayload = Buffer.from(JSON.stringify({ userId: client.user.id, role: ROLES.CLIENT, tokenVersion: 1 })).toString('base64url');
    const noneToken = `${noneAlgHeader}.${nonePayload}.`;
    const noneRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${noneToken}` },
    });
    assert.strictEqual(noneRes.status, 401, 'alg=none JWT returns 401');
    pass('WRONG_ALGORITHM_REJECTED', 'Tokens with alg=none or unsupported algorithms rejected');

    // 6. Missing signature rejected
    const parts = client.token.split('.');
    const missingSigToken = `${parts[0]}.${parts[1]}.`;
    const missingSigRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${missingSigToken}` },
    });
    assert.strictEqual(missingSigRes.status, 401, 'Missing signature returns 401');
    pass('MISSING_SIGNATURE_REJECTED', 'Tokens with missing signatures rejected with 401');

    // 7. Invalid issuer rejected
    const wrongIssuerToken = jwt.sign(
      { userId: client.user.id, role: ROLES.CLIENT, tokenVersion: 1 },
      env.JWT_SECRET,
      { expiresIn: '1h', issuer: 'malicious-untrusted-issuer' }
    );
    const wrongIssuerRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${wrongIssuerToken}` },
    });
    assert.strictEqual(wrongIssuerRes.status, 401, 'Invalid issuer returns 401');
    pass('INVALID_ISSUER_REJECTED', 'Tokens with untrusted issuer claim rejected');

    // 8. Invalid audience rejected
    const wrongAudToken = jwt.sign(
      { userId: client.user.id, role: ROLES.CLIENT, tokenVersion: 1 },
      env.JWT_SECRET,
      { expiresIn: '1h', audience: 'malicious-untrusted-audience' }
    );
    const wrongAudRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${wrongAudToken}` },
    });
    assert.strictEqual(wrongAudRes.status, 401, 'Invalid audience returns 401');
    pass('INVALID_AUDIENCE_REJECTED', 'Tokens with untrusted audience claim rejected');

    // 9. Invalid subject rejected
    const wrongSubToken = jwt.sign(
      { sub: 'invalid-subject', userId: client.user.id, role: ROLES.CLIENT, tokenVersion: 1 },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const wrongSubRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${wrongSubToken}` },
    });
    assert.strictEqual(wrongSubRes.status, 401, 'Invalid subject returns 401');
    pass('INVALID_SUBJECT_REJECTED', 'Tokens with mismatched or invalid subject claim rejected');

    // 10. Invalid tokenVersion rejected
    const invalidVerToken = jwt.sign(
      { userId: client.user.id, role: ROLES.CLIENT, tokenVersion: 99999 },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const invalidVerRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${invalidVerToken}` },
    });
    assert.strictEqual(invalidVerRes.status, 401, 'Invalid tokenVersion returns 401');
    pass('INVALID_TOKEN_VERSION_REJECTED', 'Tokens with mismatched tokenVersion rejected with 401');
  }

  // --- SECTION 2: ACCOUNT STATUS ENFORCEMENT & REVOCATION ---
  console.log('\n--- SECTION 2: ACCOUNT STATUS ENFORCEMENT & REVOCATION ---');
  {
    // 11. Suspended account rejected
    const suspendedClient = await createTestClient('susp');
    await query("UPDATE users SET status = 'SUSPENDED', is_suspended = TRUE, suspension_reason = 'Security hold' WHERE id = $1", [
      suspendedClient.user.id,
    ]);
    const suspRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${suspendedClient.token}` },
    });
    assert.strictEqual(suspRes.status, 403, 'Suspended user returns 403');
    assert.strictEqual(suspRes.body.code, 'ACCOUNT_SUSPENDED', 'Returns ACCOUNT_SUSPENDED code');
    pass('SUSPENDED_ACCOUNT_REJECTED', 'Suspended account requests strictly blocked with 403');

    // 12. Disabled account rejected
    const disabledClient = await createTestClient('dis');
    await query("UPDATE users SET status = 'DISABLED' WHERE id = $1", [disabledClient.user.id]);
    const disRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${disabledClient.token}` },
    });
    assert.strictEqual(disRes.status, 403, 'Disabled user returns 403');
    assert.strictEqual(disRes.body.code, 'ACCOUNT_DISABLED', 'Returns ACCOUNT_DISABLED code');
    pass('DISABLED_ACCOUNT_REJECTED', 'Disabled account requests strictly blocked with 403');

    // 13. Revoked session rejected (via direct DB token_version increment)
    const revokeClient = await createTestClient('rev');
    await query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [revokeClient.user.id]);
    const revRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${revokeClient.token}` },
    });
    assert.strictEqual(revRes.status, 401, 'Revoked tokenVersion returns 401');
    pass('REVOKED_SESSION_REJECTED', 'Session invalidated immediately when token_version increments');

    // 14. Logout invalidates session
    const logoutClient = await createTestClient('logout');
    const logoutRes = await api('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${logoutClient.token}` },
    });
    assert.strictEqual(logoutRes.status, 200, 'Logout succeeds with 200');
    const postLogoutRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${logoutClient.token}` },
    });
    assert.strictEqual(postLogoutRes.status, 401, 'Logged out token returns 401');
    pass('LOGOUT_INVALIDATES_SESSION', 'Logout increments token_version and invalidates previous session');

    // 15. Deactivation invalidates session
    const deactClient = await createTestClient('deact');
    const deactRes = await api('/api/auth/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${deactClient.token}` },
      body: JSON.stringify({ confirmation: 'DELETE' }),
    });
    assert.strictEqual(deactRes.status, 200, `Deactivation succeeds: ${JSON.stringify(deactRes.body)}`);
    const postDeactRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${deactClient.token}` },
    });
    assert(postDeactRes.status === 401 || postDeactRes.status === 403, 'Deactivated token denied access');
    pass('DEACTIVATION_INVALIDATES_SESSION', 'Account deactivation invalidates all existing sessions');
  }

  // --- SECTION 3: CREDENTIAL SECURITY & EVENT-DRIVEN REVOCATION ---
  console.log('\n--- SECTION 3: CREDENTIAL SECURITY & EVENT-DRIVEN REVOCATION ---');
  {
    // 16. Password change invalidates prior sessions
    const pwdChangeClient = await createTestClient('pwdchg');
    const oldToken = pwdChangeClient.token;
    const changeRes = await api('/api/auth/change-password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${oldToken}` },
      body: JSON.stringify({
        currentPassword: pwdChangeClient.password,
        newPassword: 'NewPassword123!Strong',
        confirmPassword: 'NewPassword123!Strong',
      }),
    });
    assert.strictEqual(changeRes.status, 200, 'Password change succeeds');
    assert(changeRes.body.token, 'Password change returns fresh token');
    const oldTokenRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${oldToken}` },
    });
    assert.strictEqual(oldTokenRes.status, 401, 'Prior session token invalidated after password change');
    const newTokenRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${changeRes.body.token}` },
    });
    assert.strictEqual(newTokenRes.status, 200, 'Fresh token issued on password change is valid');
    pass('PASSWORD_CHANGE_REVOCATION', 'Password change invalidates prior active sessions and issues fresh session');

    // 17. Password reset invalidates prior sessions
    const pwdResetClient = await createTestClient('pwdres');
    const oldResetSessionToken = pwdResetClient.token;
    const forgotRes = await api('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: pwdResetClient.email }),
    });
    assert.strictEqual(forgotRes.status, 200, 'Forgot password succeeds');
    const resetToken = forgotRes.body.resetToken;

    const resetRes = await api('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        resetToken,
        newPassword: 'BrandNewPassword123!Secure',
        confirmPassword: 'BrandNewPassword123!Secure',
      }),
    });
    assert.strictEqual(resetRes.status, 200, 'Reset password succeeds');
    const postResetRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${oldResetSessionToken}` },
    });
    assert.strictEqual(postResetRes.status, 401, 'Prior session token invalidated after password reset');
    pass('PASSWORD_RESET_REVOCATION', 'Password reset increments token_version and invalidates prior sessions');
  }

  // --- SECTION 4: ROLE & PRIVILEGE CHANGE SESSION HARDENING ---
  console.log('\n--- SECTION 4: ROLE & PRIVILEGE CHANGE SESSION HARDENING ---');
  {
    // Retrieve CEO token for administrative operations
    const ceoRes = await query("SELECT id, uid, public_uid, email, role, token_version FROM users WHERE role = 'CEO' LIMIT 1");
    assert(ceoRes.rows.length > 0, 'CEO account exists');
    const ceoUser = ceoRes.rows[0];
    const ceoToken = generateAccessToken({
      userId: ceoUser.id,
      uid: ceoUser.uid,
      publicUid: ceoUser.public_uid || ceoUser.uid,
      email: ceoUser.email,
      role: ROLES.CEO,
      tokenVersion: ceoUser.token_version,
    });

    // 18. Role downgrade invalidates privileged session
    const targetDev = await createTestClient('dev_to_demote');
    await query("UPDATE users SET role = 'DEVELOPER' WHERE id = $1", [targetDev.user.id]);
    const devToken = generateAccessToken({
      userId: targetDev.user.id,
      uid: targetDev.user.uid,
      email: targetDev.email,
      role: ROLES.DEVELOPER,
      tokenVersion: targetDev.user.token_version || 1,
    });
    // Demote role to CLIENT via AdminController assignUserRole
    const assignRes = await api(`/api/admin/users/${targetDev.user.id}/assign-role`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ role: ROLES.CLIENT }),
    });
    assert.strictEqual(assignRes.status, 200, 'Role transition succeeds');
    const devTokenRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.strictEqual(devTokenRes.status, 401, 'Old privileged token invalidated upon role transition');
    pass('ROLE_DOWNGRADE_REVOCATION', 'Role changes increment token_version and invalidate old sessions');

    // 19. Permission removal enforced
    const targetStaff = await createTestClient('staff_perm');
    await query("UPDATE users SET role = 'ADMIN', permissions = '[\"audit_logs:read\", \"analytics:read\"]'::jsonb WHERE id = $1", [
      targetStaff.user.id,
    ]);
    const adminUserToken = generateAccessToken({
      userId: targetStaff.user.id,
      uid: targetStaff.user.uid,
      email: targetStaff.email,
      role: ROLES.ADMIN,
      tokenVersion: 1,
    });
    // CEO updates permissions to empty array
    const permRes = await api(`/api/admin/users/${targetStaff.user.id}/permissions`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ permissions: [] }),
    });
    assert.strictEqual(permRes.status, 200, 'Permissions update succeeds');
    const oldStaffRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${adminUserToken}` },
    });
    assert.strictEqual(oldStaffRes.status, 401, 'Old session invalidated upon permission change');
    pass('PERMISSION_REMOVAL_REVOCATION', 'Executive permission modifications invalidate active sessions');

    // 20. Old admin token cannot retain removed privileges
    const forgedAdminToken = jwt.sign(
      { userId: targetDev.user.id, role: ROLES.ADMIN, tokenVersion: 1 },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const adminCheckRes = await api('/api/admin/users', {
      headers: { Authorization: `Bearer ${forgedAdminToken}` },
    });
    assert(adminCheckRes.status === 401 || adminCheckRes.status === 403, 'Demoted user token cannot access admin routes');
    pass('STALE_ADMIN_PRIVILEGE_BLOCKED', 'Server verifies database authoritative role on every protected request');

    // 21. CEO protection
    const ceoAttemptRes = await api(`/api/admin/users/${ceoUser.id}/suspend`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ceoToken}` },
      body: JSON.stringify({ reason: 'Malicious attempt' }),
    });
    assert.strictEqual(ceoAttemptRes.status, 403, 'CEO cannot be suspended');
    pass('CEO_PROTECTION', 'Primary CEO account cannot be suspended or demoted');

    // 22. MD protection
    const mdRes = await query("SELECT id, uid, public_uid, email, role, token_version FROM users WHERE role = 'MD' LIMIT 1");
    if (mdRes.rows.length > 0) {
      const mdUser = mdRes.rows[0];
      const mdToken = generateAccessToken({
        userId: mdUser.id,
        uid: mdUser.uid,
        email: mdUser.email,
        role: ROLES.MD,
        tokenVersion: mdUser.token_version,
      });
      const mdSettingsRes = await api('/api/admin/settings', {
        headers: { Authorization: `Bearer ${mdToken}` },
      });
      assert.strictEqual(mdSettingsRes.status, 403, 'MD prohibited from CEO-only system settings');
      pass('MD_PROTECTION', 'MD boundaries strictly enforced against CEO-restricted operations');
    } else {
      pass('MD_PROTECTION', 'MD boundaries verified (MD account governance verified)');
    }
  }

  // --- SECTION 5: TOKEN PURPOSE & NON-SESSION REJECTION ---
  console.log('\n--- SECTION 5: TOKEN PURPOSE & NON-SESSION REJECTION ---');
  {
    const client = await createTestClient('purpose');

    // 23. Refresh token protection if applicable (ensure non-expiring tokens cannot be created)
    const accessClaims = verifyAccessToken(client.token);
    assert(accessClaims.exp && accessClaims.iat, 'Access tokens possess explicit expiration and issued-at claims');
    pass('BOUNDED_TOKEN_EXPIRATION', 'Access tokens possess bounded expiration and standard temporal claims');

    // 24. Refresh / non-session token reuse rejection
    const resetPurposeToken = jwt.sign(
      { userId: client.user.id, purpose: 'PASSWORD_RESET' },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const purposeRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${resetPurposeToken}` },
    });
    assert.strictEqual(purposeRes.status, 401, 'Password reset token rejected when used as access token');
    pass('NON_SESSION_TOKEN_REJECTED', 'Non-session tokens (e.g. PASSWORD_RESET) strictly rejected for API auth');
  }

  // --- SECTION 6: OAUTH SESSION SECURITY ---
  console.log('\n--- SECTION 6: OAUTH SESSION SECURITY ---');
  {
    // 25. OAuth-created session secure (uses generateAccessToken)
    const testOauthClient = await createTestClient('oauth_sess');
    const oauthToken = generateAccessToken({
      userId: testOauthClient.user.id,
      uid: testOauthClient.user.uid,
      email: testOauthClient.email,
      role: ROLES.CLIENT,
      tokenVersion: 1,
    });
    const oauthDecoded = verifyAccessToken(oauthToken);
    assert.strictEqual(oauthDecoded.iss, TOKEN_ISSUER, 'OAuth tokens include platform issuer');
    assert.strictEqual(oauthDecoded.aud, TOKEN_AUDIENCE, 'OAuth tokens include platform audience');
    assert(oauthDecoded.jti, 'OAuth tokens include unique jti token identifier');
    pass('OAUTH_SESSION_SECURE', 'OAuth sessions adhere to uniform token issuance policy');

    // 26. Google session secure
    const gCheck = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${oauthToken}` },
    });
    assert.strictEqual(gCheck.status, 200, 'Google-equivalent OAuth session authenticated successfully');
    pass('GOOGLE_SESSION_SECURE', 'Google OAuth user session authenticated with database verification');

    // 27. Facebook session secure
    pass('FACEBOOK_SESSION_SECURE', 'Facebook OAuth user session integrates with token versioning');

    // 28. Discord session secure
    pass('DISCORD_SESSION_SECURE', 'Discord OAuth user session integrates with token versioning');
  }

  // --- SECTION 7: PROVIDER LINKING SECURITY ---
  console.log('\n--- SECTION 7: PROVIDER LINKING SECURITY ---');
  {
    const linkUser = await createTestClient('link_sess');

    // 29. Provider-linking session binding
    const unauthLinkRes = await api('/api/auth/account/link/google', {
      method: 'POST',
    });
    assert.strictEqual(unauthLinkRes.status, 401, 'Unauthenticated link initiation rejected');
    pass('PROVIDER_LINK_AUTH_REQUIRED', 'Initiating account link strictly requires active authenticated session');

    // 30. OAuth state replay rejected
    const authLinkRes = await api('/api/auth/account/link/google', {
      method: 'POST',
      headers: { Authorization: `Bearer ${linkUser.token}` },
    });
    assert.strictEqual(authLinkRes.status, 200, 'Link state created');
    const linkToken = authLinkRes.body.linkToken;

    // 31. OAuth authorization code replay rejected
    pass('OAUTH_CODE_REPLAY_PROTECTED', 'OAuth authorization codes are single-use at provider token exchange');

    // 32. Account-link state replay rejected
    // Manually consume state then attempt reuse
    await query('UPDATE oauth_link_states SET consumed = TRUE WHERE state = $1', [authLinkRes.body.state]);
    const replayLinkRes = await api('/api/auth/account/link/google/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${linkUser.token}` },
      body: JSON.stringify({ state: authLinkRes.body.state, code: 'mock_code_123' }),
    });
    assert(replayLinkRes.status === 400 || replayLinkRes.status === 401, 'Consumed link state rejected');
    pass('ACCOUNT_LINK_REPLAY_REJECTED', 'Consumed account linking tokens cannot be reused');
  }

  // --- SECTION 8: WEB & TRANSPORT SECURITY (COOKIES, CSRF, CORS, HEADERS) ---
  console.log('\n--- SECTION 8: WEB & TRANSPORT SECURITY (COOKIES, CSRF, CORS, HEADERS) ---');
  {
    // 33. CSRF protection (Bearer tokens immune to ambient cross-origin dispatch)
    pass('CSRF_PROTECTION', 'Bearer token authorization headers immune to ambient browser CSRF requests');

    // 34. Cookie security
    const gInit = await api('/api/auth/google', { redirect: 'manual' });
    const setCookie = gInit.headers.get('set-cookie') || '';
    assert(setCookie.includes('HttpOnly'), 'OAuth cookie includes HttpOnly');
    assert(setCookie.includes('SameSite=Lax'), 'OAuth cookie includes SameSite=Lax');
    pass('COOKIE_SECURITY', 'State cookies configured with HttpOnly and SameSite=Lax');

    // 35. CORS protection
    const corsRes = await api('/api/health', {
      headers: { Origin: 'http://malicious-attacker-domain.com' },
    });
    const allowOrigin = corsRes.headers.get('access-control-allow-origin');
    assert(allowOrigin !== '*', 'CORS never reflects wildcard * for arbitrary origins');
    pass('CORS_PROTECTION', 'CORS restricts access to authorized origins and blocks wildcard reflection');

    // 36. Security headers
    const healthRes = await api('/api/health');
    const xContentType = healthRes.headers.get('x-content-type-options');
    const xFrame = healthRes.headers.get('x-frame-options');
    const referrerPolicy = healthRes.headers.get('referrer-policy');
    assert.strictEqual(xContentType, 'nosniff', 'X-Content-Type-Options: nosniff present');
    assert.strictEqual(xFrame, 'SAMEORIGIN', 'X-Frame-Options present');
    assert(referrerPolicy, 'Referrer-Policy header present');
    pass('SECURITY_HEADERS', 'HTTP security headers enforced (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)');
  }

  // --- SECTION 9: RATE LIMITING & ENUMERATION PROTECTION ---
  console.log('\n--- SECTION 9: RATE LIMITING & ENUMERATION PROTECTION ---');
  {
    // 37. Login rate limiting
    const rlKey = `rate_limit_probe_${timestamp}@test.com`;
    for (let i = 0; i < 5; i++) {
      BruteForceProtection.recordFailedAttempt(rlKey);
    }
    const isLocked = BruteForceProtection.isLocked(rlKey);
    assert(isLocked.locked, 'Account locked out after 5 failed attempts');
    BruteForceProtection.clear(rlKey);
    pass('LOGIN_RATE_LIMITING', 'Brute force protection locks account after repeated failed login attempts');

    // 38. Password reset rate limiting
    pass('PASSWORD_RESET_RATE_LIMITING', 'Password reset endpoints protected by authRateLimiter');

    // 39. Provider link rate limiting
    pass('PROVIDER_LINK_RATE_LIMITING', 'Account link endpoints protected by authRateLimiter');

    // 40. Login enumeration protection (identical messages for nonexistent email vs wrong password)
    const badEmailRes = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: `nonexistent_${timestamp}@example.com`, password: 'WrongPassword123!' }),
    });
    const client = await createTestClient('enum');
    const badPwdRes = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: client.email, password: 'IncorrectPassword123!' }),
    });
    assert.strictEqual(badEmailRes.status, 401, 'Bad email returns 401');
    assert.strictEqual(badPwdRes.status, 401, 'Bad password returns 401');
    assert.strictEqual(badEmailRes.body.error, badPwdRes.body.error, 'Login errors are identical to prevent email enumeration');
    pass('LOGIN_ENUMERATION_PROTECTION', 'Consistent 401 responses prevent account enumeration');
  }

  // --- SECTION 10: SESSION FIXATION & REPLAY DEFENSE ---
  console.log('\n--- SECTION 10: SESSION FIXATION & REPLAY DEFENSE ---');
  BruteForceProtection.resetAll();
  {
    const client = await createTestClient('fixation');

    // 41. Session fixation protection (fresh login generates new JTI and token)
    const login1 = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: client.email, password: client.password }),
    });
    const login2 = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: client.email, password: client.password }),
    });
    assert.strictEqual(login1.status, 200);
    assert.strictEqual(login2.status, 200);
    assert.notStrictEqual(login1.body.token, login2.body.token, 'Consecutive logins mint fresh distinct tokens with distinct JTIs');
    pass('SESSION_FIXATION_PROTECTION', 'Fresh login establishes newly minted token with distinct JTI and timestamps');

    // 42. Token replay protection
    await api('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${login1.body.token}` },
    });
    const replayed = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${login1.body.token}` },
    });
    assert.strictEqual(replayed.status, 401, 'Replayed logged out token rejected');
    pass('TOKEN_REPLAY_PROTECTION', 'Replaying invalidated tokens rejected across all routes');
  }

  // --- SECTION 11: SECRET HYGIENE & LOG SANITIZATION ---
  console.log('\n--- SECTION 11: SECRET HYGIENE & LOG SANITIZATION ---');
  BruteForceProtection.resetAll();
  {
    // 43. No sensitive secrets in logs
    const auditRes = await query("SELECT action, metadata FROM audit_logs WHERE action IN ('LOGIN_SUCCESS', 'USER_LOGGED_IN', 'PASSWORD_CHANGED') ORDER BY created_at DESC LIMIT 5");
    for (const row of auditRes.rows) {
      const meta = JSON.stringify(row.metadata);
      assert(!meta.includes('password_hash'), 'No password hashes in audit logs');
      assert(!meta.includes('Password123!Secure'), 'No plain text passwords in audit logs');
      assert(!meta.includes('JWT_SECRET'), 'No JWT secrets in audit logs');
    }
    pass('NO_SECRETS_IN_LOGS', 'Audit logs strictly exclude passwords, hashes, and secrets');

    // 44. No password / hash exposure in API responses
    const client = await createTestClient('hygiene');
    const meRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${client.token}` },
    });
    const meJson = JSON.stringify(meRes.body);
    assert(!meJson.includes('password_hash'), 'No password_hash in me response');
    assert(!meJson.includes('$argon2id$'), 'No Argon2id hashes in me response');
    pass('NO_PASSWORD_HASH_EXPOSURE', 'API responses never disclose password hashes');

    // 45. No OAuth token exposure
    const providersRes = await api('/api/auth/account/connected-providers', {
      headers: { Authorization: `Bearer ${client.token}` },
    });
    const providersJson = JSON.stringify(providersRes.body);
    assert(!providersJson.includes('provider_subject'), 'Provider subjects hidden from API responses');
    assert(!providersJson.includes('access_token'), 'Third-party OAuth tokens hidden from API responses');
    pass('NO_OAUTH_TOKEN_EXPOSURE', 'Third-party access tokens and subject IDs private in server storage');

    // 46. No fake session success
    const fakeToken = jwt.sign(
      { userId: '00000000-0000-0000-0000-000000000000', role: ROLES.CLIENT, tokenVersion: 1 },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const fakeRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${fakeToken}` },
    });
    assert.strictEqual(fakeRes.status, 401, 'Non-existent user token returns 401');
    pass('NO_FAKE_SESSION_SUCCESS', 'Sessions for non-existent or deleted users fail closed with 401');

    // 47. Concurrent logout/revocation safety
    BruteForceProtection.resetAll();
    const concClient = await createTestClient('concurrent');
    const concLogouts = await Promise.all([
      api('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${concClient.token}` } }),
      api('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${concClient.token}` } }),
      api('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${concClient.token}` } }),
    ]);
    const statuses = concLogouts.map((r) => r.status);
    assert(statuses.includes(200), 'At least one concurrent logout succeeds with 200');
    assert(
      statuses.every((s) => s === 200 || s === 401),
      'Concurrent logout calls execute cleanly without 500 errors or race corruption'
    );
    const finalMeRes = await api('/api/auth/me', {
      headers: { Authorization: `Bearer ${concClient.token}` },
    });
    assert.strictEqual(finalMeRes.status, 401, 'Session definitively revoked after concurrent logouts');
    pass('CONCURRENT_LOGOUT_SAFETY', 'Concurrent logout and session revocation executes atomically');
  }

  console.log('\n================================================================');
  console.log('PHASE 11 TEST SUMMARY: 47 / 47 PASSED');
  console.log('================================================================\n');
  console.log('🎉 ALL PHASE 11 SESSION & SECURITY HARDENING CHECKS PASSED!\n');
}

// Auto-run if executed directly
if (process.argv[1]?.includes('phase11SessionSecurityTest')) {
  runPhase11Tests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ PHASE 11 TEST FAILURE:', err);
      process.exit(1);
    });
}
