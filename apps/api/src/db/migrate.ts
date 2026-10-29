import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, closeDb } from './client';

export async function runMigrations() {
  await migrate(getDb(), { migrationsFolder: path.resolve(__dirname, '../../drizzle') });
}

if (require.main === module) {
  runMigrations()
    .then(async () => {
      // eslint-disable-next-line no-console
      console.log('Migrations applied');
      await closeDb();
    })
    .catch(async (e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      await closeDb();
      process.exit(1);
    });
}
