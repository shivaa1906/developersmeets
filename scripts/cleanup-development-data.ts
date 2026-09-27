import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from root or backend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

import { pool, query, withTransaction } from '../backend/src/database/db.js';

const CEO_EMAIL = (process.env.SEED_CEO_EMAIL || 'shivaa1906@gmail.com').toLowerCase().trim();

export async function cleanupDevelopmentData() {
  console.log('====================================================');
  console.log('  NEXUS PLATFORM - DEVELOPMENT DATA CLEANUP UTILITY ');
  console.log('====================================================');

  const env = process.env.NODE_ENV || 'development';
  const forceCleanup = process.env.FORCE_CLEANUP === 'true';

  console.log(`Current Environment : ${env}`);
  console.log(`CEO Account Target  : ${CEO_EMAIL}`);

  // 1. Production Safety Guard
  if (env === 'production' && !forceCleanup) {
    const errorMsg =
      '[FATAL SAFETY VIOLATION] Attempted to run development cleanup in PRODUCTION without FORCE_CLEANUP=true.\n' +
      'Aborting immediately to protect live production databases, customer accounts, and financial ledgers.';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (env === 'production' && forceCleanup) {
    console.warn('[WARNING] FORCE_CLEANUP=true is set in PRODUCTION. Proceeding with caution...');
  }

  await withTransaction(async (client) => {
    // 2. CEO Account Verification & Protection Check
    const ceoCheck = await client.query(
      `SELECT id, email, role, status FROM users WHERE email = $1`,
      [CEO_EMAIL]
    );

    if (ceoCheck.rows.length === 0) {
      console.warn(`[NOTICE] CEO user (${CEO_EMAIL}) does not currently exist. Running bootstrap first.`);
    } else {
      console.log(`[PROTECTED] CEO user verified: ID ${ceoCheck.rows[0].id}, Role: ${ceoCheck.rows[0].role}`);
    }

    const ceoUserId = ceoCheck.rows[0]?.id;

    // 3. Remove development test claims from non-CEO projects
    const testClaimsRes = await client.query(
      `DELETE FROM project_claims
       WHERE developer_id IN (
         SELECT d.id FROM developers d
         JOIN users u ON d.user_id = u.id
         WHERE u.email != $1 AND (u.email LIKE '%test%' OR u.email LIKE '%@example.invalid' OR u.email LIKE '%temp%')
       )
       RETURNING id`,
      [CEO_EMAIL]
    );
    console.log(`- Removed ${testClaimsRes.rowCount || 0} development test project claims.`);

    // 4. Remove development test inquiries
    const testInquiriesRes = await client.query(
      `DELETE FROM inquiries
       WHERE client_id IN (
         SELECT c.id FROM clients c
         JOIN users u ON c.user_id = u.id
         WHERE u.email != $1 AND (u.email LIKE '%test%' OR u.email LIKE '%temp%' OR u.email LIKE '%@example.invalid')
       )
       RETURNING id`,
      [CEO_EMAIL]
    );
    console.log(`- Removed ${testInquiriesRes.rowCount || 0} development test inquiries.`);

    // 5. Remove development test support tickets
    const testTicketsRes = await client.query(
      `DELETE FROM support_tickets
       WHERE (created_by_user_id IN (
         SELECT id FROM users
         WHERE email != $1 AND (email LIKE '%test%' OR email LIKE '%temp%' OR email LIKE '%@example.invalid')
       )
       OR client_id IN (
         SELECT c.id FROM clients c
         JOIN users u ON c.user_id = u.id
         WHERE u.email != $1 AND (u.email LIKE '%test%' OR u.email LIKE '%temp%' OR u.email LIKE '%@example.invalid')
       ))
       RETURNING id`,
      [CEO_EMAIL]
    );
    console.log(`- Removed ${testTicketsRes.rowCount || 0} development test support tickets.`);

    // 6. Remove test projects created by test accounts
    const testProjectsRes = await client.query(
      `DELETE FROM projects
       WHERE client_id IN (
         SELECT c.id FROM clients c
         JOIN users u ON c.user_id = u.id
         WHERE u.email != $1 AND (u.email LIKE '%test%' OR u.email LIKE '%temp%' OR u.email LIKE '%@example.invalid')
       )
       AND status NOT IN ('PUBLISHED')
       RETURNING id`,
      [CEO_EMAIL]
    );
    console.log(`- Removed ${testProjectsRes.rowCount || 0} development test projects.`);

    // 7. Remove non-CEO test users (explicitly preserving CEO account)
    const testUsersRes = await client.query(
      `DELETE FROM users
       WHERE email != $1
         AND (
           email LIKE '%@test.nexus.dev'
           OR email LIKE '%test%@%'
           OR email LIKE 'temp-%'
           OR email LIKE '%@example.invalid'
         )
         AND role NOT IN ('CEO')
       RETURNING id, email`,
      [CEO_EMAIL]
    );
    console.log(`- Removed ${testUsersRes.rowCount || 0} non-CEO ephemeral test users.`);

    // 8. Verify CEO account is still completely intact
    const ceoFinalCheck = await client.query(
      `SELECT id, email, role, status FROM users WHERE email = $1`,
      [CEO_EMAIL]
    );
    if (ceoFinalCheck.rows.length === 0 && ceoUserId) {
      throw new Error('[FATAL ERROR] CEO account was modified or deleted during cleanup. Rolling back transaction!');
    }

    console.log('[SUCCESS] Development cleanup completed. CEO account and core ledgers preserved intact.');
  });
}

if (process.argv[1]?.endsWith('cleanup-development-data.ts')) {
  cleanupDevelopmentData()
    .then(() => {
      console.log('Cleanup execution finished.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Cleanup execution failed:', err);
      process.exit(1);
    })
    .finally(() => pool.end());
}
