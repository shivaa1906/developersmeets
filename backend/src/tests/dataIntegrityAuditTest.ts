/**
 * Phase 2 Data Model Integrity Verification Script
 * Validates entity creation, relationships, foreign keys, unique constraints,
 * duplicate claim rejection, and safely cleans up all test records.
 */

import { pool, query } from '../database/db.js';
import bcrypt from 'bcryptjs';

async function runDataIntegrityAudit() {
  console.log('================================================================');
  console.log('STARTING PHASE 2 DATABASE & DATA MODEL INTEGRITY AUDIT');
  console.log('================================================================\n');

  const testSuffix = `audit_${Date.now()}`;
  let testUserId: string | null = null;
  let testDevId: string | null = null;
  let testClientUserId: string | null = null;
  let testClientId: string | null = null;
  let testProjectId: string | null = null;
  let testClaimId: string | null = null;
  let testConversationId: string | null = null;
  let testTicketId: string | null = null;

  try {
    const pwdHash = await bcrypt.hash('AuditTestPass123!', 10);

    // 1. TEST DEVELOPER CREATION
    console.log('[Test 1] Developer & Associated Entities (Experiences, Certifications)...');
    const userRes = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'DEVELOPER', 'ACTIVE') RETURNING id`,
      [`audit.dev.${testSuffix}@test.dev`, pwdHash]
    );
    testUserId = userRes.rows[0].id;

    const devRes = await query(
      `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status)
       VALUES ($1, $2, 'Audit Test Dev', 'Data Systems Architect', 8, 'VERIFIED') RETURNING id`,
      [testUserId, `audit-dev-${testSuffix}`]
    );
    testDevId = devRes.rows[0].id;

    await query(`INSERT INTO credit_accounts (developer_id, balance) VALUES ($1, 20)`, [testDevId]);

    // Test Experience creation
    const expRes = await query(
      `INSERT INTO experiences (developer_id, company, role_title, location, start_date, is_current, description)
       VALUES ($1, 'Acme Systems', 'Staff Engineer', 'Bangalore, India', '2022-01-01', TRUE, 'Architected streaming pipeline')
       RETURNING id`,
      [testDevId]
    );
    if (!expRes.rows[0].id) throw new Error('Experience creation failed');

    // Test Certification creation
    const certRes = await query(
      `INSERT INTO certifications (developer_id, name, issuer, issue_date, credential_id)
       VALUES ($1, 'AWS Certified Solutions Architect', 'Amazon Web Services', '2023-05-15', 'AWS-12345678')
       RETURNING id`,
      [testDevId]
    );
    if (!certRes.rows[0].id) throw new Error('Certification creation failed');
    console.log('  ✔ Developer, experiences, and certifications created successfully');

    // 2. TEST CLIENT CREATION (Collision-Proof Numbering)
    console.log('\n[Test 2] Client Creation with Collision-Proof Sequential Tag...');
    const clientUserRes = await query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'CLIENT', 'ACTIVE') RETURNING id`,
      [`audit.client.${testSuffix}@corp.test`, pwdHash]
    );
    testClientUserId = clientUserRes.rows[0].id;

    const seqRes = await query(
      `SELECT COALESCE(MAX(SUBSTRING(client_number FROM 9)::int), 0) + 1 as next_seq 
       FROM clients WHERE client_number ~ '^Client #[0-9]+$'`
    );
    const nextClientNum = seqRes.rows[0]?.next_seq || 1;
    const clientTag = `Client #${String(nextClientNum).padStart(3, '0')}`;

    const clientRes = await query(
      `INSERT INTO clients (user_id, client_number, company_name, private_name)
       VALUES ($1, $2, 'Audit Robotics Inc', 'Jane Doe') RETURNING id, client_number`,
      [testClientUserId, clientTag]
    );
    testClientId = clientRes.rows[0].id;
    console.log(`  ✔ Client registered with tag: ${clientRes.rows[0].client_number}`);

    // 3. TEST PROJECT CREATION (Sequential Numbering & Status Model)
    console.log('\n[Test 3] Project Creation & Unique Constraints...');
    const pSeqRes = await query(
      `SELECT COALESCE(MAX(SUBSTRING(project_number FROM 10)::int), 0) + 1 as next_seq 
       FROM projects WHERE project_number ~ '^PRJ-2026-[0-9]+$'`
    );
    const pNextNum = pSeqRes.rows[0]?.next_seq || 9999;
    const projectNumber = `PRJ-2026-${String(pNextNum).padStart(4, '0')}`;
    const slug = `audit-project-${testSuffix}`;

    const projRes = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline, status, claim_cost, max_claims,
         claim_deadline, client_id
       ) VALUES (
         $1, $2, 'Audit Test Distributed Cache', 'High-throughput Redis cluster',
         'BACKEND', 50000, 90000, '4 Weeks', 'OPEN_FOR_CLAIMS', 1, 5,
         NOW() + INTERVAL '7 days', $3
       ) RETURNING id, project_number, status`,
      [projectNumber, slug, testClientId]
    );
    testProjectId = projRes.rows[0].id;
    console.log(`  ✔ Project created: ${projRes.rows[0].project_number} with status ${projRes.rows[0].status}`);

    // 4. TEST CLAIM CREATION
    console.log('\n[Test 4] Project Slot Claim Creation...');
    const claimRes = await query(
      `INSERT INTO project_claims (project_id, developer_id, anonymous_tag, status)
       VALUES ($1, $2, 'Developer #01', 'CLAIMED') RETURNING id, anonymous_tag, status`,
      [testProjectId, testDevId]
    );
    testClaimId = claimRes.rows[0].id;
    if (!testClaimId) throw new Error('Claim ID missing');
    console.log(`  ✔ Slot claimed: ${claimRes.rows[0].anonymous_tag} (status: ${claimRes.rows[0].status})`);

    // 5. TEST DUPLICATE CLAIM REJECTION
    console.log('\n[Test 5] Verifying Duplicate Claim Constraint (uq_project_developer)...');
    let duplicateRejected = false;
    try {
      await query(
        `INSERT INTO project_claims (project_id, developer_id, anonymous_tag, status)
         VALUES ($1, $2, 'Developer #02', 'CLAIMED') RETURNING id`,
        [testProjectId, testDevId]
      );
    } catch (err: any) {
      if (err.message.includes('uq_project_developer') || err.message.includes('unique constraint')) {
        duplicateRejected = true;
      } else {
        throw err;
      }
    }

    if (!duplicateRejected) {
      throw new Error('FAILED: Duplicate project claim was NOT rejected by unique constraint!');
    }
    console.log('  ✔ Duplicate claim successfully rejected by unique constraint: uq_project_developer');

    // 6. TEST CONVERSATION & MESSAGE CREATION
    console.log('\n[Test 6] Conversation & Message Entity Verification...');
    const convRes = await query(
      `INSERT INTO conversations (project_id, type) VALUES ($1, 'PROJECT_PRIVATE') RETURNING id`,
      [testProjectId]
    );
    testConversationId = convRes.rows[0].id;

    await query(
      `INSERT INTO conversation_members (conversation_id, user_id, developer_id, role)
       VALUES ($1, $2, $3, 'DEVELOPER')`,
      [testConversationId, testUserId, testDevId]
    );

    const msgRes = await query(
      `INSERT INTO messages (conversation_id, sender_user_id, message, message_type)
       VALUES ($1, $2, 'Testing low-level database messaging write.', 'TEXT')
       RETURNING id, message`,
      [testConversationId, testUserId]
    );
    if (!msgRes.rows[0].id) throw new Error('Message insertion failed');
    console.log('  ✔ Conversation & message relational chain verified');

    // 7. TEST SUPPORT TICKET & BRIDGE CREATION
    console.log('\n[Test 7] Support Ticket & Tripartite Bridge Verification...');
    const tSeqRes = await query(
      `SELECT COALESCE(MAX(SUBSTRING(ticket_number FROM 10)::int), 0) + 1 as next_seq 
       FROM support_tickets WHERE ticket_number ~ '^SUP-2026-[0-9]+$'`
    );
    const tNextNum = tSeqRes.rows[0]?.next_seq || 1;
    const ticketNumber = `SUP-2026-${String(tNextNum).padStart(4, '0')}`;

    const ticketRes = await query(
      `INSERT INTO support_tickets (
         ticket_number, project_id, client_id, developer_id, subject, description, priority, status
       ) VALUES (
         $1, $2, $3, $4, 'Database audit support ticket', 'Verifying support bridge relationship', 'NORMAL', 'OPEN'
       ) RETURNING id, ticket_number, status`,
      [ticketNumber, testProjectId, testClientId, testDevId]
    );
    testTicketId = ticketRes.rows[0].id;

    const bridgeRes = await query(
      `INSERT INTO support_bridges (ticket_id) VALUES ($1) RETURNING id`,
      [testTicketId]
    );
    const bridgeId = bridgeRes.rows[0].id;

    await query(
      `INSERT INTO support_bridge_members (bridge_id, user_id, role)
       VALUES ($1, $2, 'DEVELOPER'), ($1, $3, 'CLIENT')`,
      [bridgeId, testUserId, testClientUserId]
    );
    console.log(`  ✔ Support ticket ${ticketRes.rows[0].ticket_number} & support bridge members verified`);

    console.log('\n================================================================');
    console.log('ALL 7 DATA INTEGRITY TESTS PASSED SUCCESSFULLY');
    console.log('================================================================');
  } catch (error: any) {
    console.error('\n❌ DATA INTEGRITY AUDIT FAILED:', error.message);
    throw error;
  } finally {
    // 8. CLEANUP TEST DATA SAFELY
    console.log('\n[Cleanup] Safely removing temporary audit records...');
    if (testTicketId) {
      await query(`DELETE FROM support_tickets WHERE id = $1`, [testTicketId]);
    }
    if (testConversationId) {
      await query(`DELETE FROM conversations WHERE id = $1`, [testConversationId]);
    }
    if (testProjectId) {
      await query(`DELETE FROM projects WHERE id = $1`, [testProjectId]);
    }
    if (testUserId) {
      await query(`DELETE FROM users WHERE id = $1`, [testUserId]);
    }
    if (testClientUserId) {
      await query(`DELETE FROM users WHERE id = $1`, [testClientUserId]);
    }
    console.log('  ✔ All test records purged. Database left in pristine state.');
    await pool.end();
  }
}

runDataIntegrityAudit();
