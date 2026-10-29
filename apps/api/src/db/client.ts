import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { config } from '../config';

export type DB = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query surface as the DB. */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export type DbOrTx = DB | Tx;

let pool: Pool | null = null;
let db: DB | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: config().DATABASE_URL, max: 15, idleTimeoutMillis: 30_000 });
  }
  return pool;
}

export function getDb(): DB {
  if (!db) db = drizzle(getPool(), { schema });
  return db;
}

export async function closeDb() {
  if (pool) await pool.end();
  pool = null;
  db = null;
}

export const DB_TOKEN = Symbol('DB');
export { schema };
