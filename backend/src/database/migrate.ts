import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, withTransaction } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log('--- Checking & Applying Database Migrations ---');

  const migrationsDir = path.join(__dirname, 'migrations');

  try {
    await withTransaction(async (client) => {
      // 1. Create migrations tracking table
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id SERIAL PRIMARY KEY,
          version VARCHAR(255) UNIQUE NOT NULL,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. Fetch already applied migrations
      const appliedRes = await client.query('SELECT version FROM schema_migrations');
      const appliedVersions = new Set(appliedRes.rows.map((r: any) => r.version));

      // 3. Read migration directory
      if (!fs.existsSync(migrationsDir)) {
        console.log('No migrations directory found at:', migrationsDir);
        return;
      }

      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

      for (const file of files) {
        if (!appliedVersions.has(file)) {
          console.log(`Executing migration: ${file}...`);
          const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
          await client.query(sql);
          await client.query(
            'INSERT INTO schema_migrations (version) VALUES ($1)',
            [file]
          );
          console.log(`Successfully applied: ${file}`);
        } else {
          console.log(`Already applied: ${file}`);
        }
      }
    });
    console.log('--- Migrations Up to Date ---');
  } catch (error: any) {
    console.error('Migration execution failed:', error.message);
    throw error;
  }
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations().finally(() => pool.end());
}
