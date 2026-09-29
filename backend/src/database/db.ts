import { Pool, PoolClient } from 'pg';
import { env } from '../config/environment.js';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 45000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (env.NODE_ENV === 'development') {
      console.log('Executed query', { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (error: any) {
    console.error('Query execution error:', error.message);
    throw error;
  }
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const errorHandler = (err: Error) => {
    console.warn('[PostgreSQL Transaction Client Notice]:', err?.message || err);
  };
  client.on('error', errorHandler);
  let hasError = false;
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    hasError = true;
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failure if network connection dropped
    }
    throw error;
  } finally {
    client.removeListener('error', errorHandler);
    client.release(hasError);
  }
}
