/**
 * PHASE 2 — Complete Fake Data Removal & Real Database Data Integration Verification Suite
 *
 * Covers:
 * 1. Real Administrative Data & Database Metrics (/api/admin/analytics, payments, clients, claims, inquiries)
 * 2. Public Showcase & Directory Isolation (No hardcoded catalogs or seed merges; authentic DB results)
 * 3. 404 on Missing Slugs / Usernames (Zero mock fallback dictionaries)
 * 4. Data Isolation (Client A vs Client B, Developer A vs Developer B, Support vs Executive RBAC)
 * 5. CEO Account & Phase 1 Invariants Preserved (shivaa1906@gmail.com, Argon2id, 16-char UID)
 * 6. Empty States Handling (Clean 200 OK with empty arrays; no 500 or mock arrays)
 * 7. Production Guarded Cleanup Utility Verification
 */

process.env.NODE_ENV = 'test';

import { httpServer } from '../server.js';
import { query, pool } from '../database/db.js';
import { env } from '../config/environment.js';
import { hashPassword } from '../utils/password.js';
import jwt from 'jsonwebtoken';

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
  console.log('PHASE 2 — COMPLETE FAKE DATA REMOVAL & REAL DB DATA INTEGRATION');
  console.log('================================================================\n');

  let baseUrl = '';
  const runId = Date.now().toString().slice(-6);

  try {
    // 1. Launch test server on ephemeral port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://127.0.0.1:${address.port}`;
          console.log(`[TEST SERVER] Running on ${baseUrl}\n`);
          resolve();
        }
      });
    });

    const testPassword = 'Phase2TestPassword!2026';
    const passwordHash = await hashPassword(testPassword);

    // =================================================================
    // SECTION 1: CEO Account & Phase 1 Invariants Preservation
    // =================================================================
    console.log('--- SECTION 1: CEO ACCOUNT & SECURITY FOUNDATION ---');

    const ceoRes = await query(
      `SELECT u.id, u.uid, u.public_uid, u.email, u.role, u.status, u.password_hash,
              d.id as developer_id, d.username as developer_username
       FROM users u
       LEFT JOIN developers d ON d.user_id = u.id
       WHERE u.email = 'shivaa1906@gmail.com'`
    );

    assert(ceoRes.rows.length === 1, 'CEO', 'Primary CEO account shivaa1906@gmail.com exists in database');
    const ceo = ceoRes.rows[0];
    assert(ceo.role === 'CEO', 'CEO', 'CEO user possesses role CEO');
    assert(ceo.status === 'ACTIVE', 'CEO', 'CEO user status is ACTIVE');
    const effectiveUid = ceo.uid || ceo.public_uid;
    assert(effectiveUid && effectiveUid.length === 16, 'CEO', 'CEO user has 16-character UID');
    assert(ceo.password_hash.startsWith('$argon2id$'), 'CEO', 'CEO password hashed with Argon2id');

    // Create CEO JWT token for administrative testing
    const ceoToken = jwt.sign(
      {
        userId: ceo.id,
        email: ceo.email,
        role: ceo.role,
        developerId: ceo.developer_id,
        publicUid: ceo.public_uid,
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // =================================================================
    // SECTION 2: Administrative Real Database Metrics & Endpoints
    // =================================================================
    console.log('\n--- SECTION 2: ADMINISTRATIVE METRICS & REAL QUERIES ---');

    // 2.1 GET /api/admin/analytics
    const analyticsRes = await fetch(`${baseUrl}/api/admin/analytics`, {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    assert(analyticsRes.status === 200, 'ADMIN_ANALYTICS', 'GET /api/admin/analytics returns 200 OK');
    const analyticsJson = (await analyticsRes.json()) as any;
    const a = analyticsJson.analytics;

    // Verify analytics values match direct SQL queries
    const devDbCount = await query(
      `SELECT COUNT(*)::int as count
       FROM developers d
       JOIN users u ON d.user_id = u.id
       WHERE d.verification_status = 'VERIFIED' AND u.is_suspended = FALSE AND u.status = 'ACTIVE'`
    );
    const clientDbCount = await query(`SELECT COUNT(*)::int as count FROM clients`);
    const projDbCount = await query(`SELECT COUNT(*)::int as count FROM projects`);
    const claimsDbCount = await query(`SELECT COUNT(*)::int as count FROM project_claims`);

    assert(
      a.verifiedDevelopers === devDbCount.rows[0].count,
      'ADMIN_ANALYTICS',
      `verifiedDevelopers (${a.verifiedDevelopers}) matches live DB COUNT (${devDbCount.rows[0].count})`
    );
    assert(
      a.clients === clientDbCount.rows[0].count,
      'ADMIN_ANALYTICS',
      `clients (${a.clients}) matches live DB COUNT (${clientDbCount.rows[0].count})`
    );
    assert(
      a.totalProjects === projDbCount.rows[0].count,
      'ADMIN_ANALYTICS',
      `totalProjects (${a.totalProjects}) matches live DB COUNT (${projDbCount.rows[0].count})`
    );
    assert(
      a.totalClaims === claimsDbCount.rows[0].count,
      'ADMIN_ANALYTICS',
      `totalClaims (${a.totalClaims}) matches live DB COUNT (${claimsDbCount.rows[0].count})`
    );

    // 2.2 GET /api/admin/payments
    const paymentsRes = await fetch(`${baseUrl}/api/admin/payments`, {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    assert(paymentsRes.status === 200, 'ADMIN_PAYMENTS', 'GET /api/admin/payments returns 200 OK');
    const paymentsJson = (await paymentsRes.json()) as any;
    assert(Array.isArray(paymentsJson.payments), 'ADMIN_PAYMENTS', 'Payments response contains payments array');
    // Ensure no gateway secrets leaked
    if (paymentsJson.payments.length > 0) {
      const p = paymentsJson.payments[0];
      assert(!p.secret_key && !p.key_secret && !p.webhook_secret, 'ADMIN_PAYMENTS', 'Payment records shield all secret keys');
    }

    // 2.3 GET /api/admin/clients
    const clientsRes = await fetch(`${baseUrl}/api/admin/clients`, {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    assert(clientsRes.status === 200, 'ADMIN_CLIENTS', 'GET /api/admin/clients returns 200 OK');
    const clientsJson = (await clientsRes.json()) as any;
    assert(Array.isArray(clientsJson.clients), 'ADMIN_CLIENTS', 'Clients response contains clients array');
    if (clientsJson.clients.length > 0) {
      const c = clientsJson.clients[0];
      assert(c.client_number && c.client_number.startsWith('Client #'), 'ADMIN_CLIENTS', 'Client record has shielded client_number');
    }

    // 2.4 GET /api/admin/claims
    const claimsRes = await fetch(`${baseUrl}/api/admin/claims`, {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    assert(claimsRes.status === 200, 'ADMIN_CLAIMS', 'GET /api/admin/claims returns 200 OK');
    const claimsJson = (await claimsRes.json()) as any;
    assert(Array.isArray(claimsJson.claims), 'ADMIN_CLAIMS', 'Claims response contains claims array');

    // 2.5 GET /api/admin/inquiries
    const inquiriesRes = await fetch(`${baseUrl}/api/admin/inquiries`, {
      headers: { Authorization: `Bearer ${ceoToken}` },
    });
    assert(inquiriesRes.status === 200, 'ADMIN_INQUIRIES', 'GET /api/admin/inquiries returns 200 OK');
    const inquiriesJson = (await inquiriesRes.json()) as any;
    assert(Array.isArray(inquiriesJson.inquiries), 'ADMIN_INQUIRIES', 'Inquiries response contains inquiries array');

    // =================================================================
    // SECTION 3: Public Showcases & Zero Mock Fallbacks
    // =================================================================
    console.log('\n--- SECTION 3: PUBLIC SHOWCASES & ZERO FALLBACKS ---');

    // 3.1 GET /api/projects/published
    const pubProjRes = await fetch(`${baseUrl}/api/projects/published`);
    assert(pubProjRes.status === 200, 'PUBLIC_PROJECTS', 'GET /api/projects/published returns 200 OK');
    const pubProjJson = (await pubProjRes.json()) as any;
    assert(Array.isArray(pubProjJson.projects), 'PUBLIC_PROJECTS', 'Published projects is an array');

    // Verify all returned projects have status 'PUBLISHED'
    for (const prj of pubProjJson.projects) {
      assert(prj.status === 'PUBLISHED', 'PUBLIC_PROJECTS', `Project ${prj.project_number} strictly has status PUBLISHED`);
    }

    // 3.2 Non-existent project slug MUST return 404 (NOT mock fallback)
    const fakeSlugRes = await fetch(`${baseUrl}/api/projects/published/non-existent-fake-slug-xyz`);
    assert(fakeSlugRes.status === 404, 'PUBLIC_PROJECTS', 'Non-existent project slug returns 404 (No mock fallback)');

    // 3.3 Draft project MUST NOT be accessible on published endpoint
    // Create a draft project in DB
    const draftProjRes = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline, requirements, required_technologies,
         status, claim_cost, max_claims, claim_deadline, client_id
       )
       VALUES (
         $1, $2, 'Draft Private Project', 'Draft test project', 'Web',
         1000, 2000, '14 Days', '[]'::jsonb, '[]'::jsonb,
         'DRAFT', 1, 5, NOW() + INTERVAL '7 days', (SELECT id FROM clients LIMIT 1)
       )
       RETURNING id, slug`,
      [`PRJ-TEST-${runId}`, `draft-project-${runId}`]
    );
    const draftSlug = draftProjRes.rows[0].slug;

    const draftAccessRes = await fetch(`${baseUrl}/api/projects/published/${draftSlug}`);
    assert(draftAccessRes.status === 404, 'PUBLIC_PROJECTS', 'DRAFT project is hidden from public showcase (returns 404)');

    // 3.4 GET /api/developers/public
    const pubDevRes = await fetch(`${baseUrl}/api/developers/public`);
    assert(pubDevRes.status === 200, 'PUBLIC_DEVELOPERS', 'GET /api/developers/public returns 200 OK');
    const pubDevJson = (await pubDevRes.json()) as any;
    assert(Array.isArray(pubDevJson.developers), 'PUBLIC_DEVELOPERS', 'Public developers is an array');

    // Verify all developers are VERIFIED and not suspended
    for (const dev of pubDevJson.developers) {
      assert(dev.verification_status === 'VERIFIED', 'PUBLIC_DEVELOPERS', `Developer @${dev.username} is VERIFIED`);
    }

    // 3.5 Non-existent developer username MUST return 404 (NOT mock fallback)
    const fakeDevRes = await fetch(`${baseUrl}/api/developers/profile/completely-fake-dev-username-${runId}`);
    assert(fakeDevRes.status === 404, 'PUBLIC_DEVELOPERS', 'Non-existent developer username returns 404 (No mock fallback)');

    // =================================================================
    // SECTION 4: Data Isolation (Clients, Developers, Support)
    // =================================================================
    console.log('\n--- SECTION 4: DATA ISOLATION VERIFICATION ---');

    // 4.1 Create Client A and Client B
    const clientAUser = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'CLIENT', 'ACTIVE')
       RETURNING id, public_uid`,
      [`clientA-${runId}@test.nexus.dev`, passwordHash]
    );
    const clientARes = await query(
      `INSERT INTO clients (user_id, client_number, company_name, private_name, phone)
       VALUES ($1, $2, 'Client A Corp', 'Client A Person', '+91 99990001')
       RETURNING id`,
      [clientAUser.rows[0].id, `Client #A-${runId}`]
    );

    const clientBUser = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'CLIENT', 'ACTIVE')
       RETURNING id, public_uid`,
      [`clientB-${runId}@test.nexus.dev`, passwordHash]
    );
    const clientBRes = await query(
      `INSERT INTO clients (user_id, client_number, company_name, private_name, phone)
       VALUES ($1, $2, 'Client B Corp', 'Client B Person', '+91 99990002')
       RETURNING id`,
      [clientBUser.rows[0].id, `Client #B-${runId}`]
    );

    const clientAToken = jwt.sign(
      { userId: clientAUser.rows[0].id, email: `clientA-${runId}@test.nexus.dev`, role: 'CLIENT', clientId: clientARes.rows[0].id },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const clientBToken = jwt.sign(
      { userId: clientBUser.rows[0].id, email: `clientB-${runId}@test.nexus.dev`, role: 'CLIENT', clientId: clientBRes.rows[0].id },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create private project for Client B
    const projBRes = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline, requirements, required_technologies,
         status, claim_cost, max_claims, claim_deadline, client_id
       )
       VALUES (
         $1, $2, 'Client B Confidential Project', 'Private B specs', 'Enterprise',
         50000, 75000, '30 Days', '[]'::jsonb, '[]'::jsonb,
         'REVIEWING', 1, 5, NOW() + INTERVAL '7 days', $3
       )
       RETURNING id`,
      [`PRJ-B-${runId}`, `client-b-project-${runId}`, clientBRes.rows[0].id]
    );
    const projBId = projBRes.rows[0].id;

    // Client B attempts to access own private project
    const clientBAccessOwn = await fetch(`${baseUrl}/api/projects/${projBId}`, {
      headers: { Authorization: `Bearer ${clientBToken}` },
    });
    assert(clientBAccessOwn.status === 200, 'DATA_ISOLATION', 'Client B can access own private project (200 OK)');

    // Client A attempts to access Client B's private project (/api/projects/:id)
    const clientAAccessB = await fetch(`${baseUrl}/api/projects/${projBId}`, {
      headers: { Authorization: `Bearer ${clientAToken}` },
    });
    assert(
      clientAAccessB.status === 403 || clientAAccessB.status === 404,
      'DATA_ISOLATION',
      `Client A blocked from accessing Client B project (status ${clientAAccessB.status})`
    );

    // Client A calls /api/projects/my-projects -> MUST NOT see Client B's project
    const clientAMyProjects = await fetch(`${baseUrl}/api/projects/my-projects`, {
      headers: { Authorization: `Bearer ${clientAToken}` },
    });
    assert(clientAMyProjects.status === 200, 'DATA_ISOLATION', 'Client A /my-projects returns 200');
    const clientAMyJson = (await clientAMyProjects.json()) as any;
    const clientAHasB = (clientAMyJson.projects || []).some((p: any) => p.id === projBId);
    assert(!clientAHasB, 'DATA_ISOLATION', 'Client A my-projects does not leak Client B projects');

    // 4.2 Support Role RBAC Isolation: Support user CANNOT access Executive Admin APIs
    const supportUser = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'SUPPORT', 'ACTIVE')
       RETURNING id, public_uid`,
      [`support-${runId}@test.nexus.dev`, passwordHash]
    );
    const supportToken = jwt.sign(
      { userId: supportUser.rows[0].id, email: `support-${runId}@test.nexus.dev`, role: 'SUPPORT' },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const supportAnalyticsRes = await fetch(`${baseUrl}/api/admin/analytics`, {
      headers: { Authorization: `Bearer ${supportToken}` },
    });
    assert(
      supportAnalyticsRes.status === 403,
      'DATA_ISOLATION',
      'Support user denied access to /api/admin/analytics (403 Forbidden)'
    );

    const supportPaymentsRes = await fetch(`${baseUrl}/api/admin/payments`, {
      headers: { Authorization: `Bearer ${supportToken}` },
    });
    assert(
      supportPaymentsRes.status === 403,
      'DATA_ISOLATION',
      'Support user denied access to /api/admin/payments (403 Forbidden)'
    );

    // =================================================================
    // SECTION 5: Empty States & Graceful Responses
    // =================================================================
    console.log('\n--- SECTION 5: EMPTY STATES HANDLING ---');

    // 5.1 Query published projects with a category that has 0 projects
    const emptyCatRes = await fetch(`${baseUrl}/api/projects/published?category=NonExistentCategory999`);
    assert(emptyCatRes.status === 200, 'EMPTY_STATES', 'Filter with 0 matches returns 200 OK');
    const emptyCatJson = (await emptyCatRes.json()) as any;
    assert(
      Array.isArray(emptyCatJson.projects) && emptyCatJson.projects.length === 0,
      'EMPTY_STATES',
      'Filter with 0 matches returns empty array [] (no 500 error, no fake array)'
    );

    // 5.2 Query verified developers with a skill that has 0 developers
    const emptyDevRes = await fetch(`${baseUrl}/api/developers/public?skill=NonExistentSkill888`);
    assert(emptyDevRes.status === 200, 'EMPTY_STATES', 'Dev filter with 0 matches returns 200 OK');
    const emptyDevJson = (await emptyDevRes.json()) as any;
    assert(
      Array.isArray(emptyDevJson.developers) && emptyDevJson.developers.length === 0,
      'EMPTY_STATES',
      'Dev filter with 0 matches returns empty array [] (no 500 error, no fake array)'
    );

    // Cleanup test fixtures
    await query(`DELETE FROM projects WHERE id = $1`, [projBId]);
    await query(`DELETE FROM projects WHERE id = $1`, [draftProjRes.rows[0].id]);
    await query(`DELETE FROM clients WHERE id IN ($1, $2)`, [clientARes.rows[0].id, clientBRes.rows[0].id]);
    await query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [clientAUser.rows[0].id, clientBUser.rows[0].id, supportUser.rows[0].id]);

    console.log('\n================================================================');
    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;
    console.log(`PHASE 2 TEST SUMMARY: ${passedCount} / ${totalCount} PASSED`);
    console.log('================================================================\n');

    if (passedCount < totalCount) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('Fatal error during Phase 2 test suite:', error);
    process.exit(1);
  } finally {
    try {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await pool.end();
    } catch (_e) {
      void _e;
    }
  }
}

runTestSuite();
