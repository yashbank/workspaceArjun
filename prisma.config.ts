import dotenv from 'dotenv';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

dotenv.config({ path: path.join(__dirname, '.env.local') });
dotenv.config({ path: path.join(__dirname, '.env') });

/**
 * Prisma CLI (migrate, db pull, studio) must use a direct/session connection.
 * Supabase transaction pooler (port 6543, pgbouncer=true) breaks prepared statements.
 *
 * Runtime app queries use DATABASE_URL via src/server/db — see db/index.ts.
 */
const CLI_DATABASE_URL =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/arjun';

const isRemote =
  !CLI_DATABASE_URL.includes('localhost') && !CLI_DATABASE_URL.includes('127.0.0.1');
const datasourceUrl =
  isRemote && !CLI_DATABASE_URL.includes('sslmode')
    ? `${CLI_DATABASE_URL}${CLI_DATABASE_URL.includes('?') ? '&' : '?'}sslmode=require`
    : CLI_DATABASE_URL;

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'prisma', 'migrations'),
  },
  datasource: {
    url: datasourceUrl,
  },
});
