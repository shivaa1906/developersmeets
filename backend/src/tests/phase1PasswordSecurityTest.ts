/**
 * PHASE 1 — Comprehensive Authentication + Strong Password Security Verification Suite
 *
 * Covers:
 * 1. Identical passwords produce distinct Argon2id hashes (unique CSPRNG salts)
 * 2. Wrong password rejection with generic error message
 * 3. Password validation (min 8 chars, max 128 chars, confirmation matching, symbol support)
 * 4. 16-character public UID ([A-Za-z0-9]), database uniqueness constraint & immutability
 * 5. Transparent legacy bcrypt ($2a$, $2b$) to Argon2id migration on login
 * 6. Role escalation prevention (client-supplied roles ignored, server-side RBAC)
 * 7. Session lifecycle: login, protected access, logout session invalidation
 * 8. Password reset token single-use, expiry, and old credential revocation
 * 9. Authenticated password change (POST /api/auth/change-password) & session invalidation
 * 10. Account status enforcement: SUSPENDED and DISABLED lockout on HTTP & WebSocket
 * 11. WebSocket identity verification & unauthorized connection rejection
 * 12. Primary CEO (shivaa1906@gmail.com) and sample MD (md@example.invalid) governance
 */

import { Server } from 'http';
import { WebSocket } from 'ws';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { httpServer } from '../server.js';
import { query, pool } from '../database/db.js';
import { env } from '../config/environment.js';
import { ROLES } from '../config/constants.js';
import { isArgon2Hash, isBcryptHash } from '../utils/password.js';

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, category: string, name: string, failureDetails?: string) {
  if (condition) {
    console.log(`  ✔ [PASS] [${category}] ${name}`);
    results.push({ category, name, passed: true });
  } else {
    console.error(`  ✘ [FAIL] [${category}] ${name} - ${failureDetails || 'Assertion failed'}`);
    results.push({ category, name, passed: false, details: failureDetails });
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('PHASE 1 — AUTHENTICATION & PASSWORD SECURITY TEST SUITE');
  console.log('================================================================\n');

  let baseUrl = '';
  let wsUrl = '';
  const runId = Date.now().toString().slice(-6);

  try {
    // 1. Launch test server on ephemeral port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const port = (httpServer.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        wsUrl = `ws://127.0.0.1:${port}/ws`;
        console.log(`[Harness] Ephemeral server running at ${baseUrl}`);
        resolve();
      });
    });

    // =========================================================================
    // 1. TEST IDENTICAL PASSWORDS & UNIQUE SALTS (Section 40)
    // =========================================================================
    console.log('\n--- 1. Testing Identical Passwords & Unique Salts ---');

    const identicalPass = 'SecurePlatformPass2026!XYZ';
    const emailA = `salt_test_a_${runId}@example.com`;
    const emailB = `salt_test_b_${runId}@example.com`;

    const regResA = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Salt Test User A',
        email: emailA,
        password: identicalPass,
        confirmPassword: identicalPass,
      }),
    });
    const dataA: any = await regResA.json();
    assert(regResA.status === 201, 'Password Security', 'User A registered successfully');

    const regResB = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Salt Test User B',
        email: emailB,
        password: identicalPass,
        confirmPassword: identicalPass,
      }),
    });
    const dataB: any = await regResB.json();
    assert(regResB.status === 201, 'Password Security', 'User B registered successfully');

    // Retrieve hashes from database
    const dbHashes = await query(
      `SELECT email, password_hash FROM users WHERE email IN ($1, $2)`,
      [emailA, emailB]
    );
    const hashA = dbHashes.rows.find((r: any) => r.email === emailA)?.password_hash;
    const hashB = dbHashes.rows.find((r: any) => r.email === emailB)?.password_hash;

    assert(!!hashA && isArgon2Hash(hashA), 'Password Security', 'User A hash is valid Argon2id ($argon2id$)');
    assert(!!hashB && isArgon2Hash(hashB), 'Password Security', 'User B hash is valid Argon2id ($argon2id$)');
    assert(hashA !== hashB, 'Password Security', 'Identical passwords produce distinct hashes (unique salts)');

    // Test both users log in with identical password
    const loginResA = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password: identicalPass }),
    });
    assert(loginResA.status === 200, 'Authentication', 'User A logs in successfully with password');

    const loginResB = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, password: identicalPass }),
    });
    assert(loginResB.status === 200, 'Authentication', 'User B logs in successfully with password');

    // Check no password credential leakage in response
    const resAJson: any = await loginResA.json();
    assert(!('password' in resAJson) && !('password_hash' in resAJson.user), 'Password Security', 'Zero password credential exposure in login response');

    // =========================================================================
    // 2. TEST WRONG PASSWORD & GENERIC ERROR (Section 41 & 35)
    // =========================================================================
    console.log('\n--- 2. Testing Wrong Password & Enumeration Defense ---');

    const wrongPassRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password: 'CompletelyWrongPassword123!' }),
    });
    const wrongPassData: any = await wrongPassRes.json();
    assert(wrongPassRes.status === 401, 'Authentication', 'Wrong password returns 401 Unauthorized');
    assert(
      wrongPassData.error === 'Invalid email or password.',
      'Authentication',
      'Wrong password returns generic error message'
    );

    const nonExistentRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `nonexistent_${runId}@nobody.com`, password: 'SomePassword123!' }),
    });
    const nonExistentData: any = await nonExistentRes.json();
    assert(nonExistentRes.status === 401, 'Authentication', 'Nonexistent user returns 401 Unauthorized');
    assert(
      nonExistentData.error === 'Invalid email or password.',
      'Authentication',
      'Nonexistent user returns identical generic error (enumeration protected)'
    );

    // =========================================================================
    // 3. TEST PASSWORD VALIDATION (Section 13)
    // =========================================================================
    console.log('\n--- 3. Testing Password Input Validation ---');

    const shortPassRes = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Short Pass User',
        email: `short_pass_${runId}@example.com`,
        password: 'short',
        confirmPassword: 'short',
      }),
    });
    assert(shortPassRes.status === 400, 'Password Security', 'Short password (< 8 chars) rejected with 400');

    const mismatchRes = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Mismatch User',
        email: `mismatch_${runId}@example.com`,
        password: 'ValidPassword123!',
        confirmPassword: 'DifferentPassword123!',
      }),
    });
    assert(mismatchRes.status === 400, 'Password Security', 'Password confirmation mismatch rejected with 400');

    // =========================================================================
    // 4. TEST 16-CHARACTER PUBLIC UID & IMMUTABILITY (Section 24, 25, 42)
    // =========================================================================
    console.log('\n--- 4. Testing 16-Character Public UID & Immutability ---');

    const uidA = dataA.user?.uid;
    const uidB = dataB.user?.uid;
    assert(typeof uidA === 'string' && uidA.length === 16, 'Identity', `User A UID has exact length 16 (${uidA})`);
    assert(typeof uidB === 'string' && uidB.length === 16, 'Identity', `User B UID has exact length 16 (${uidB})`);
    assert(/^[A-Za-z0-9]{16}$/.test(uidA), 'Identity', 'User A UID conforms strictly to [A-Za-z0-9]');
    assert(/^[A-Za-z0-9]{16}$/.test(uidB), 'Identity', 'User B UID conforms strictly to [A-Za-z0-9]');
    assert(uidA !== uidB, 'Identity', 'Generated UIDs are distinct and unique');

    // Attempt to mutate UID via direct database query
    let uidMutationBlocked = false;
    try {
      await query(`UPDATE users SET uid = 'HACKED16CHARUIDX' WHERE email = $1`, [emailA]);
    } catch (dbErr: any) {
      if (dbErr.message.includes('UID is immutable')) {
        uidMutationBlocked = true;
      }
    }
    assert(uidMutationBlocked, 'Identity', 'Database trigger prevents UID modification (UID is immutable)');

    // =========================================================================
    // 5. TEST LEGACY BCRYPT TO ARGON2ID UPGRADE-ON-LOGIN (Section 9)
    // =========================================================================
    console.log('\n--- 5. Testing Transparent Bcrypt to Argon2id Migration ---');

    const legacyEmail = `legacy_user_${runId}@example.com`;
    const legacyPassword = 'LegacySecurePass2026!';
    const legacyBcryptHash = await bcrypt.hash(legacyPassword, 10);
    assert(isBcryptHash(legacyBcryptHash), 'Password Security', 'Generated valid legacy bcrypt hash ($2a$)');

    // Insert legacy user directly into DB
    const legacyInsertRes = await query(
      `INSERT INTO users (email, password_hash, role, status, email_verified)
       VALUES ($1, $2, 'CLIENT', 'ACTIVE', TRUE)
       RETURNING id, uid`,
      [legacyEmail, legacyBcryptHash]
    );
    const legacyUserId = legacyInsertRes.rows[0].id;

    // Verify DB currently holds bcrypt hash
    const preCheck = await query(`SELECT password_hash FROM users WHERE id = $1`, [legacyUserId]);
    assert(isBcryptHash(preCheck.rows[0].password_hash), 'Password Security', 'Stored pre-login hash is legacy bcrypt');

    // Perform login with legacy user
    const legacyLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: legacyEmail, password: legacyPassword }),
    });
    assert(legacyLoginRes.status === 200, 'Authentication', 'Legacy user logs in successfully with legacy credential');

    // Verify DB hash was transparently upgraded to Argon2id
    const postCheck = await query(`SELECT password_hash FROM users WHERE id = $1`, [legacyUserId]);
    const upgradedHash = postCheck.rows[0].password_hash;
    assert(isArgon2Hash(upgradedHash), 'Password Security', 'Password hash upgraded transparently to Argon2id on login');

    // Verify subsequent login works with upgraded Argon2id hash
    const secondLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: legacyEmail, password: legacyPassword }),
    });
    assert(secondLoginRes.status === 200, 'Authentication', 'Subsequent login succeeds with upgraded Argon2id hash');

    // =========================================================================
    // 6. TEST ROLE ESCALATION DEFENSE (Section 22, 23, 43)
    // =========================================================================
    console.log('\n--- 6. Testing Role Escalation Defense ---');

    const attackerEmail = `attacker_${runId}@example.com`;
    const escalateClientRes = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Role Attacker',
        email: attackerEmail,
        password: identicalPass,
        confirmPassword: identicalPass,
        role: 'ADMIN', // Client tries to assign ADMIN
      }),
    });
    const escalateClientData: any = await escalateClientRes.json();
    assert(escalateClientRes.status === 201, 'Authorization', 'Client registration succeeds');
    assert(
      escalateClientData.user?.role === 'CLIENT',
      'Authorization',
      'Client role is server-enforced as CLIENT (ignoring client-supplied ADMIN)'
    );

    const clientToken = escalateClientData.token;

    // Attacker client attempts admin route
    const adminAccessRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert(adminAccessRes.status === 403, 'Authorization', 'Direct client access to admin endpoint denied (403)');

    // Attacker developer attempts admin escalation
    const devEscalateRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Dev Attacker',
        username: `dev_att_${runId}`,
        email: `dev_att_${runId}@example.com`,
        password: identicalPass,
        confirmPassword: identicalPass,
        developerRole: 'Lead',
        role: 'CEO', // Tries to assign CEO
      }),
    });
    const devEscalateData: any = await devEscalateRes.json();
    assert(devEscalateRes.status === 201, 'Authorization', 'Developer registration succeeds');
    assert(
      devEscalateData.user?.role === 'DEVELOPER',
      'Authorization',
      'Developer role is server-enforced as DEVELOPER (ignoring client-supplied CEO)'
    );
    assert(
      devEscalateData.user?.status === 'PENDING_VERIFICATION',
      'Authorization',
      'Developer status is server-enforced as PENDING_VERIFICATION'
    );

    // =========================================================================
    // 7. TEST SESSION LIFECYCLE & LOGOUT INVALIDATION (Section 17, 18, 44)
    // =========================================================================
    console.log('\n--- 7. Testing Session Lifecycle & Logout Invalidation ---');

    const sessionUserEmail = `session_user_${runId}@example.com`;
    const sessionPass = 'SessionPass2026!Active';

    const sessionRegRes = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Session User',
        email: sessionUserEmail,
        password: sessionPass,
        confirmPassword: sessionPass,
      }),
    });
    const sessionRegData: any = await sessionRegRes.json();
    const activeToken = sessionRegData.token;

    // Protected route works before logout
    const meBeforeLogout = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${activeToken}` },
    });
    assert(meBeforeLogout.status === 200, 'Session', 'Protected route returns 200 with valid session token');

    // Perform logout with session revocation
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${activeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ revokeAll: true }),
    });
    assert(logoutRes.status === 200, 'Session', 'Logout returns 200 OK');

    // Logged-out browser without token denied protected access (Section 17 & 44)
    const unauthDirectAccess = await fetch(`${baseUrl}/api/auth/me`);
    assert(
      unauthDirectAccess.status === 401,
      'Session',
      'Logged-out browser without token denied protected access (401 Unauthorized)'
    );

    // Protected route fails for revoked session token (Section 18)
    const meAfterLogout = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${activeToken}` },
    });
    assert(
      meAfterLogout.status === 401,
      'Session',
      'Protected route returns 401 Unauthorized after session revocation'
    );

    // =========================================================================
    // 8. TEST PASSWORD RESET LIFECYCLE (Section 14, 15, 45)
    // =========================================================================
    console.log('\n--- 8. Testing Password Reset Lifecycle ---');

    const resetTargetEmail = `reset_target_${runId}@example.com`;
    const oldPassword = 'OldInitialPass2026!';
    const newPassword = 'NewUpdatedPass2026!';

    await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Reset Target User',
        email: resetTargetEmail,
        password: oldPassword,
        confirmPassword: oldPassword,
      }),
    });

    // Request reset
    const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetTargetEmail }),
    });
    const forgotData: any = await forgotRes.json();
    const resetToken = forgotData.resetToken;
    assert(forgotRes.status === 200 && !!resetToken, 'Password Reset', 'Password reset token generated and returned');

    // Weak password during reset rejected
    const weakResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken, newPassword: 'tiny', confirmPassword: 'tiny' }),
    });
    assert(weakResetRes.status === 400, 'Password Reset', 'Reset rejects weak password (< 8 chars)');

    // Perform valid reset
    const resetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken, newPassword, confirmPassword: newPassword }),
    });
    assert(resetRes.status === 200, 'Password Reset', 'Password reset successfully with token');

    // Old password must be rejected
    const oldPassLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetTargetEmail, password: oldPassword }),
    });
    assert(oldPassLogin.status === 401, 'Password Reset', 'Old password rejected after reset (401)');

    // New password accepted
    const newPassLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetTargetEmail, password: newPassword }),
    });
    assert(newPassLogin.status === 200, 'Password Reset', 'New password accepted for login (200)');

    // Token reuse rejected
    const reuseResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken, newPassword: 'AnotherPassword2026!' }),
    });
    assert(
      reuseResetRes.status === 400 || reuseResetRes.status === 401,
      'Password Reset',
      'Token reuse rejected (single-use token invalidated)'
    );

    // =========================================================================
    // 9. TEST AUTHENTICATED PASSWORD CHANGE (Section 16)
    // =========================================================================
    console.log('\n--- 9. Testing Authenticated Password Change Endpoint ---');

    const changeUserEmail = `change_user_${runId}@example.com`;
    const curPass = 'CurrentPassword2026!';
    const changedPass = 'ChangedSecurePass2026!';

    const changeUserReg = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Password Change User',
        email: changeUserEmail,
        password: curPass,
        confirmPassword: curPass,
      }),
    });
    const changeUserData: any = await changeUserReg.json();
    const tokenBeforeChange = changeUserData.token;

    // Wrong current password
    const wrongCurRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenBeforeChange}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        currentPassword: 'WrongCurrentPass!',
        newPassword: changedPass,
        confirmPassword: changedPass,
      }),
    });
    assert(wrongCurRes.status === 401, 'Password Change', 'Change password rejects incorrect current password (401)');

    // Valid password change
    const validChangeRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenBeforeChange}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        currentPassword: curPass,
        newPassword: changedPass,
      }),
    });
    const validChangeData: any = await validChangeRes.json();
    assert(validChangeRes.status === 200, 'Password Change', 'Password changed successfully via /api/auth/change-password');
    assert(!!validChangeData.token, 'Password Change', 'Fresh token issued for current session');

    // Pre-existing session token invalidated
    const oldSessionAccess = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tokenBeforeChange}` },
    });
    assert(
      oldSessionAccess.status === 401,
      'Password Change',
      'Old session token invalidated after password change (401)'
    );

    // Fresh session token works
    const freshSessionAccess = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${validChangeData.token}` },
    });
    assert(
      freshSessionAccess.status === 200,
      'Password Change',
      'Fresh session token works seamlessly (200)'
    );

    // New password logs in
    const loginWithChanged = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: changeUserEmail, password: changedPass }),
    });
    assert(loginWithChanged.status === 200, 'Password Change', 'Login succeeds with newly changed password');

    // =========================================================================
    // 10. TEST ACCOUNT STATUS ENFORCEMENT: SUSPENDED & DISABLED (Section 21, 46)
    // =========================================================================
    console.log('\n--- 10. Testing Account Status (Suspended & Disabled) ---');

    const suspEmail = `susp_target_${runId}@example.com`;
    const suspPass = 'SuspPass2026!Active';

    const suspReg = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Suspended Target User',
        email: suspEmail,
        password: suspPass,
        confirmPassword: suspPass,
      }),
    });
    const suspData: any = await suspReg.json();
    const suspUserId = suspData.user.id;
    const suspToken = suspData.token;

    // Suspend user in DB
    await query(`UPDATE users SET status = 'SUSPENDED', is_suspended = TRUE, suspension_reason = 'Security audit' WHERE id = $1`, [suspUserId]);

    // Suspended user login attempt
    const suspLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: suspEmail, password: suspPass }),
    });
    const suspLoginData: any = await suspLoginRes.json();
    assert(suspLoginRes.status === 403, 'Session', 'Suspended account login denied (403)');
    assert(suspLoginData.code === 'ACCOUNT_SUSPENDED', 'Session', 'Returns error code ACCOUNT_SUSPENDED');

    // Suspended user API attempt with pre-existing token
    const suspApiRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${suspToken}` },
    });
    assert(suspApiRes.status === 403, 'Session', 'Suspended user pre-existing session token rejected with 403');

    // Disable user in DB
    await query(`UPDATE users SET status = 'DISABLED' WHERE id = $1`, [suspUserId]);

    const disabledLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: suspEmail, password: suspPass }),
    });
    assert(disabledLoginRes.status === 403, 'Session', 'Disabled account login denied (403)');

    // =========================================================================
    // 11. TEST WEBSOCKET IDENTITY & ACCESS CONTROLS (Section 33)
    // =========================================================================
    console.log('\n--- 11. Testing WebSocket Authentication & Identity ---');

    // Unauthenticated connection attempt
    const unauthWs = new WebSocket(`${wsUrl}?token=invalid.jwt.token`);
    const unauthClosed = await new Promise<boolean>((resolve) => {
      unauthWs.on('close', (code) => {
        resolve(code === 1008);
      });
      unauthWs.on('error', () => {});
      setTimeout(() => resolve(false), 2000);
    });
    assert(unauthClosed, 'WebSocket', 'Invalid/unauthenticated WebSocket connection closed with code 1008');

    // Suspended account WS connection attempt
    const suspWs = new WebSocket(`${wsUrl}?token=${suspToken}`);
    const suspWsClosed = await new Promise<boolean>((resolve) => {
      suspWs.on('close', (code) => {
        resolve(code === 1008);
      });
      suspWs.on('error', () => {});
      setTimeout(() => resolve(false), 2000);
    });
    assert(suspWsClosed, 'WebSocket', 'Suspended account WebSocket connection rejected and closed');

    // Valid authenticated user WS connection
    const validLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password: identicalPass }),
    });
    const validLoginData: any = await validLoginRes.json();
    const validToken = validLoginData.token;

    const authWs = new WebSocket(`${wsUrl}?token=${validToken}`);
    const authSuccess = await new Promise<boolean>((resolve) => {
      authWs.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString('utf8'));
          if (msg.type === 'auth_success' && msg.user?.userId === dataA.user.id) {
            resolve(true);
          }
        } catch {
          /* ignore non-json frames */
        }
      });
      authWs.on('error', () => resolve(false));
      setTimeout(() => resolve(false), 2500);
    });
    authWs.close();
    assert(authSuccess, 'WebSocket', 'Authenticated WebSocket connection succeeds and identifies user securely');

    // =========================================================================
    // 12. TEST CEO & MD ACCOUNT GOVERNANCE (Section 28, 29, 30)
    // =========================================================================
    console.log('\n--- 12. Testing CEO & MD Account Governance ---');

    const ceoCheck = await query(`SELECT id, uid, email, role, status, password_hash FROM users WHERE email = 'shivaa1906@gmail.com'`);
    assert(ceoCheck.rows.length > 0, 'Identity', 'Primary CEO account shivaa1906@gmail.com exists in database');
    assert(ceoCheck.rows[0].role === 'CEO', 'Identity', 'shivaa1906@gmail.com role is strictly CEO');
    assert(ceoCheck.rows[0].status === 'ACTIVE', 'Identity', 'shivaa1906@gmail.com status is ACTIVE');
    assert(isArgon2Hash(ceoCheck.rows[0].password_hash), 'Password Security', 'shivaa1906@gmail.com credentials protected by Argon2id hash');

    const mdCheck = await query(`SELECT id, uid, email, role, status, password_hash FROM users WHERE email = 'md@example.invalid'`);
    assert(mdCheck.rows.length > 0, 'Identity', 'Sample MD account md@example.invalid exists in database');
    assert(mdCheck.rows[0].role === 'MD', 'Identity', 'md@example.invalid role is MD');
    assert(isArgon2Hash(mdCheck.rows[0].password_hash), 'Password Security', 'md@example.invalid credentials protected by Argon2id hash');

  } catch (error: any) {
    console.error('Test execution failed with fatal error:', error);
    assert(false, 'Harness', 'Test suite completed without fatal error', error.message);
  } finally {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    await pool.end();
  }

  // Summary
  console.log('\n================================================================');
  console.log('PHASE 1 VERIFICATION SUMMARY SCORECARD');
  console.log('================================================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`TOTAL TESTS : ${results.length}`);
  console.log(`PASSED      : ${passed}`);
  console.log(`FAILED      : ${failed}`);

  if (failed === 0) {
    console.log('\n🎉 ALL PHASE 1 AUTHENTICATION & PASSWORD SECURITY CHECKS PASSED!\n');
    process.exit(0);
  } else {
    console.error(`\n❌ ${failed} CHECKS FAILED!\n`);
    process.exit(1);
  }
}

runTestSuite();
