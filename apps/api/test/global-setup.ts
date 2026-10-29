import { Client } from 'pg';

/** Recreates the test database, applies migrations and loads the demo seed (two tenants). */
export default async function setup() {
  const url = new URL(process.env.DATABASE_URL!);
  const dbName = url.pathname.slice(1);
  if (!/_test$/.test(dbName)) throw new Error(`Refusing to reset non-test database "${dbName}"`);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const c = new Client({ connectionString: admin.toString() });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await c.query(`CREATE DATABASE "${dbName}"`);
  await c.end();

  const { runMigrations } = await import('../src/db/migrate');
  const { seed } = await import('../src/db/seed/index');
  const { closeDb } = await import('../src/db/client');
  const { closeBus } = await import('../src/realtime/bus');
  await runMigrations();
  await seed();
  await closeBus();
  await closeDb();
}
