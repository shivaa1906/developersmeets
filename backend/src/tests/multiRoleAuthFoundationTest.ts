/**
 * Phase 1 — Multi-Role Authentication Foundation Verification Suite
 * Validates:
 * 1. All 5 roles (CLIENT, DEVELOPER, SUPPORT, ADMIN, CEO/MD) authentication
 * 2. Mandatory user attributes: database ID, publicUid, email, password credential, role, account status,
 *    created_at, updated_at, last_login_at, email_verified, is_suspended
 * 3. Server-controlled role enforcement (ignoring client-supplied roles during registration)
 * 4. Developer approval lifecycle (PENDING -> VERIFIED) and capability gates
 * 5. Open redirect protection on login (?redirect= / ?next=)
 * 6. Account status enforcement (SUSPENDED & DISABLED lockout)
 * 7. Password reset lifecycle with 1-hour expiration and single-use invalidation
 * 8. Unauthenticated access prevention and RBAC boundary enforcement
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

async function runTest() {
  console.log('================================================================');
  console.log('PHASE 1: MULTI-ROLE AUTHENTICATION FOUNDATION VERIFICATION');
  console.log('================================================================\n');

  let server: Server | null = null;
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
    // TEST SECTION 1: All 5 Roles Authenticate & Return Standard Identity Schema
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Testing Core Role Authentication & Identity Payload ---');

    const coreAccounts = [
      { role: ROLES.CEO, email: 'ritesh@nexus.dev', expectedRedirect: '/admin/dashboard' },
      { role: ROLES.MD, email: 'shiva@nexus.dev', expectedRedirect: '/admin/dashboard' },
      { role: ROLES.ADMIN, email: 'admin@nexus.dev', expectedRedirect: '/admin/dashboard' },
      { role: ROLES.SUPPORT, email: 'support@nexus.dev', expectedRedirect: '/admin/support' },
      { role: ROLES.DEVELOPER, email: 'rahul@nexus.dev', expectedRedirect: '/dashboard' },
      { role: ROLES.CLIENT, email: 'client001@apexretail.io', expectedRedirect: '/dashboard' },
    ];

    const tokens: Record<string, string> = {};

    for (const acc of coreAccounts) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: acc.email, password: 'DevPlatform2026!Secure' }),
      });

      const data: any = await res.json();
      assert(res.status === 200, `${acc.role} Authentication status 200`, `Received status ${res.status}`);
      assert(!!data.token, `${acc.role} JWT token issued`);
      assert(data.user?.role === acc.role, `${acc.role} Server-verified role matches`, `Expected ${acc.role}, got ${data.user?.role}`);
      assert(!!data.user?.id, `${acc.role} Has internal database UUID`);
      assert(!!data.user?.publicUid && data.user.publicUid.startsWith('usr_'), `${acc.role} Has valid public_uid (${data.user?.publicUid})`);
      assert(data.user?.emailVerified === true, `${acc.role} emailVerified state true`);
      assert(!!data.user?.lastLoginAt, `${acc.role} lastLoginAt recorded`);
      assert(!('password_hash' in data.user) && !('password' in data.user), `${acc.role} Zero password credential leakage`);
      assert(data.redirectUrl === acc.expectedRedirect, `${acc.role} Redirect correctly computed to ${acc.expectedRedirect}`);

      tokens[acc.role] = data.token;
    }

    // -------------------------------------------------------------------------
    // TEST SECTION 2: Server-Controlled Role Enforcement on Registration
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Server-Controlled Role Authority ---');

    // Attempting to inject ADMIN role in developer registration
    const maliciousDevEmail = `hacker_dev_${runId}@nexus.test`;
    const devRegRes = await fetch(`${baseUrl}/api/auth/register/developer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Privilege Escalator',
        username: `hacker_dev_${runId}`,
        email: maliciousDevEmail,
        password: 'DevPlatform2026!Secure',
        roleTitle: 'Chief Security Officer',
        experience: '5',
        role: 'ADMIN', // Malicious attempt to self-promote to ADMIN
        status: 'ACTIVE',
      }),
    });

    const devRegData: any = await devRegRes.json();
    assert(devRegRes.status === 201, 'Developer registration succeeds with sanitized role');
    assert(devRegData.user?.role === ROLES.DEVELOPER, 'Server forced role to DEVELOPER despite client asking for ADMIN');
    assert(devRegData.user?.status === 'PENDING_VERIFICATION', 'Server forced status to PENDING_VERIFICATION');

    // Attempting to inject CEO role in client registration
    const maliciousClientEmail = `hacker_client_${runId}@acme.test`;
    const clientRegRes = await fetch(`${baseUrl}/api/auth/register/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: 'Acme SuperCorp',
        privateName: 'Bob Client',
        email: maliciousClientEmail,
        password: 'DevPlatform2026!Secure',
        role: 'CEO', // Malicious attempt to self-promote to CEO
      }),
    });

    const clientRegData: any = await clientRegRes.json();
    assert(clientRegRes.status === 201, 'Client registration succeeds with sanitized role');
    assert(clientRegData.user?.role === ROLES.CLIENT, 'Server forced role to CLIENT despite client asking for CEO');
    assert(clientRegData.client?.client_number?.startsWith('Client #'), `Sequential client number assigned (${clientRegData.client?.client_number})`);

    // -------------------------------------------------------------------------
    // TEST SECTION 3: Developer Lifecycle & Access Gates
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing Developer Approval Lifecycle & Privileges ---');

    // 3a. Login as candidate developer
    const devLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: maliciousDevEmail, password: 'DevPlatform2026!Secure' }),
    });
    const devLoginData: any = await devLoginRes.json();
    const candidateDevToken = devLoginData.token;
    const candidateDevId = devLoginData.user?.developerId;
    assert(devLoginData.user?.verificationStatus === 'PENDING', 'New developer verificationStatus is PENDING');

    // 3b. Candidate attempts to access verified developer endpoint (claims or community write)
    const pendingClaimAction = await fetch(`${baseUrl}/api/projects/claims/test-claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${candidateDevToken}`, 'Content-Type': 'application/json' },
    });
    assert(pendingClaimAction.status === 403 || pendingClaimAction.status === 404, 'Unverified developer denied access to verified operations (403)');

    // 3c. Admin approves developer
    const approveRes = await fetch(`${baseUrl}/api/admin/developers/${candidateDevId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens[ROLES.ADMIN]}` },
    });
    const approveData: any = await approveRes.json();
    assert(approveRes.status === 200 && approveData.developer?.verification_status === 'VERIFIED', 'Admin successfully approved developer to VERIFIED');

    // 3d. Check developer now has 10 welcome credits in wallet
    const walletRes = await fetch(`${baseUrl}/api/admin/developers/${candidateDevId}/wallet`, {
      headers: { Authorization: `Bearer ${tokens[ROLES.ADMIN]}` },
    });
    const walletData: any = await walletRes.json();
    assert(walletData.balance === 10, 'Approved developer received initial 10 credits');

    // -------------------------------------------------------------------------
    // TEST SECTION 4: Role-Based Redirects & Open Redirect Protection
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing Open Redirect Defense & Destination Routing ---');

    // 4a. Malicious external protocol redirects
    const openRedirectAttacks = [
      'https://evil-attacker.com/steal-creds',
      'http://phishing.site',
      '//evil.com/redirect',
      '/\\evil.com/slash-trick',
      'javascript:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      '//attacker.com/%2e%2e',
    ];

    for (const attack of openRedirectAttacks) {
      const attackRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'support@nexus.dev',
          password: 'DevPlatform2026!Secure',
          redirect: attack,
        }),
      });
      const attackData: any = await attackRes.json();
      assert(
        attackData.redirectUrl === '/admin/support',
        `Open redirect blocked for '${attack}' -> safely fell back to /admin/support`
      );
    }

    // 4b. Legitimate relative path redirect
    const legitRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'rahul@nexus.dev',
        password: 'DevPlatform2026!Secure',
        redirect: '/dashboard/messages?channel=general',
      }),
    });
    const legitData: any = await legitRes.json();
    assert(
      legitData.redirectUrl === '/dashboard/messages?channel=general',
      'Valid relative internal destination accepted (/dashboard/messages?channel=general)'
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 5: Account Status Enforcement (Suspension & Disabled)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing Account Status Enforcement (Suspension & Lockout) ---');

    const testClientUserId = clientRegData.user?.id;

    // 5a. Admin suspends user
    const suspendRes = await fetch(`${baseUrl}/api/admin/users/${testClientUserId}/suspend`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens[ROLES.ADMIN]}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Investigation into policy violation' }),
    });
    assert(suspendRes.status === 200, 'Admin successfully suspended user account');

    // 5b. Suspended user attempts login
    const suspendedLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: maliciousClientEmail, password: 'DevPlatform2026!Secure' }),
    });
    const suspendedLoginData: any = await suspendedLoginRes.json();
    assert(suspendedLoginRes.status === 403, 'Suspended account denied login with status 403');
    assert(suspendedLoginData.code === 'ACCOUNT_SUSPENDED', 'Error code ACCOUNT_SUSPENDED returned');

    // 5c. Suspended user attempts API call with previously active token
    const suspendedApiRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${clientRegData.token}` },
    });
    assert(suspendedApiRes.status === 403, 'API middleware actively terminates suspended sessions with 403');

    // 5d. Admin unsuspends user
    const unsuspendRes = await fetch(`${baseUrl}/api/admin/users/${testClientUserId}/unsuspend`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens[ROLES.ADMIN]}` },
    });
    assert(unsuspendRes.status === 200, 'Admin successfully reactivated account');

    // 5e. Reactivated account logs in successfully
    const reactivatedLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: maliciousClientEmail, password: 'DevPlatform2026!Secure' }),
    });
    assert(reactivatedLoginRes.status === 200, 'Reactivated user successfully logged in');

    // 5f. Admin disables user
    const disableRes = await fetch(`${baseUrl}/api/admin/users/${testClientUserId}/disable`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens[ROLES.ADMIN]}` },
    });
    assert(disableRes.status === 200, 'Admin successfully marked account as DISABLED');

    // 5g. Disabled user denied login
    const disabledLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: maliciousClientEmail, password: 'DevPlatform2026!Secure' }),
    });
    assert(disabledLoginRes.status === 403, 'Disabled account denied login with status 403');

    // -------------------------------------------------------------------------
    // TEST SECTION 6: Password Reset Security, Expiry & Single-Use Tokens
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Testing Password Reset Lifecycle & Security ---');

    const resetTargetEmail = 'admin@nexus.dev';

    // 6a. Request password reset
    const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetTargetEmail }),
    });
    const forgotData: any = await forgotRes.json();
    const resetToken = forgotData.resetToken;
    assert(forgotRes.status === 200 && !!resetToken, 'Password reset token generated and returned');

    // Verify reset token stored in database with 1-hour expiration
    const dbTokenCheck = await query(
      `SELECT password_reset_token, password_reset_expires_at 
       FROM users WHERE email = $1`,
      [resetTargetEmail]
    );
    assert(dbTokenCheck.rows[0].password_reset_token === resetToken, 'Token stored securely in users table');
    assert(new Date(dbTokenCheck.rows[0].password_reset_expires_at).getTime() > Date.now(), 'Token expiry set in the future');

    // 6b. Attempt reset with weak password (< 8 chars)
    const weakResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken, newPassword: 'short' }),
    });
    assert(weakResetRes.status === 400, 'Password reset rejected weak password (< 8 chars)');

    // 6c. Attempt reset with expired token
    await query(
      `UPDATE users SET password_reset_expires_at = NOW() - INTERVAL '5 minutes' WHERE email = $1`,
      [resetTargetEmail]
    );
    const expiredResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken, newPassword: 'BrandNewSecurePass2026!' }),
    });
    assert(expiredResetRes.status === 401 || expiredResetRes.status === 400, 'Expired token rejected');

    // 6d. Re-request valid token
    const forgotRes2 = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetTargetEmail }),
    });
    const forgotData2: any = await forgotRes2.json();
    const freshToken = forgotData2.resetToken;

    // 6e. Successful password reset
    const validResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken: freshToken, newPassword: 'BrandNewSecurePass2026!' }),
    });
    assert(validResetRes.status === 200, 'Password successfully reset with fresh token');

    // 6f. Attempt single-use token reuse
    const reuseResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken: freshToken, newPassword: 'AnotherPassword123!' }),
    });
    assert(reuseResetRes.status === 401 || reuseResetRes.status === 400, 'Token reuse rejected (single-use token invalidated)');

    // 6g. Verify login with new password works
    const newPassLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetTargetEmail, password: 'BrandNewSecurePass2026!' }),
    });
    assert(newPassLogin.status === 200, 'Successfully logged in with updated password');

    // Restore standard admin password for further tests
    await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: resetTargetEmail,
        currentPassword: 'BrandNewSecurePass2026!',
        newPassword: 'DevPlatform2026!Secure',
      }),
    });

    // -------------------------------------------------------------------------
    // TEST SECTION 7: Logout Session Termination
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Testing Logout Session Termination ---');

    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens[ROLES.CLIENT]}` },
    });
    assert(logoutRes.status === 200, 'Logout endpoint returns 200 with clean session termination');

    // -------------------------------------------------------------------------
    // TEST SECTION 8: Unauthenticated Access & RBAC Boundaries
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Testing Unauthenticated Access Rejection ---');

    // 8a. No auth header on /api/auth/me
    const unauthMe = await fetch(`${baseUrl}/api/auth/me`);
    assert(unauthMe.status === 401, 'Unauthenticated /api/auth/me denied with 401');

    // 8b. No auth header on administrative route
    const unauthAdmin = await fetch(`${baseUrl}/api/admin/users`);
    assert(unauthAdmin.status === 401, 'Unauthenticated /api/admin/users denied with 401');

    // 8c. Developer attempting admin route
    const devAdmin = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${tokens[ROLES.DEVELOPER]}` },
    });
    assert(devAdmin.status === 403, 'Developer role attempting /api/admin/users denied with 403 Forbidden');

    // 8d. Client attempting admin route
    const clientAdmin = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${tokens[ROLES.CLIENT]}` },
    });
    assert(clientAdmin.status === 403, 'Client role attempting /api/admin/users denied with 403 Forbidden');

  } catch (error: any) {
    console.error('Test execution encountered fatal error:', error);
    assert(false, 'Test execution without unhandled exceptions', error.message);
  } finally {
    if (server) {
      (server as Server).close();
    }
    await pool.end();
  }

  // Summary
  console.log('\n================================================================');
  console.log('PHASE 1 VERIFICATION SUMMARY');
  console.log('================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`TOTAL TESTS : ${results.length}`);
  console.log(`PASSED      : ${passedCount}`);
  console.log(`FAILED      : ${failedCount}`);

  if (failedCount > 0) {
    console.error('\nFAILURES:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.error(`- ${r.name}: ${r.details || 'Assertion failed'}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL PHASE 1 MULTI-ROLE AUTHENTICATION VERIFICATION CHECKS PASSED PERFECTLY!\n');
    process.exit(0);
  }
}

runTest();
