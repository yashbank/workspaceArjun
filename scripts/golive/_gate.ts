/** Shared DB connection + safety gate for the go-live scripts. Dry-run unless CONFIRM_WIPE=1 AND --execute. */
import dotenv from 'dotenv';
import path from 'node:path';
import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const DEFAULT_REF = 'kmaxtksmeabmmlervpjl';

/** Supabase project ref: from the pooler user `postgres.<ref>`, else the `db.<ref>.supabase.co` host. */
export function projectRef(url: URL): string | null {
  const u = decodeURIComponent(url.username);
  if (u.includes('.')) return u.split('.').slice(1).join('.');
  const m = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  return m ? m[1] : null;
}

export function openDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');
  const url = new URL(connectionString);
  const ref = projectRef(url);
  const expected = process.env.EXPECTED_DB_REF || DEFAULT_REF;
  console.log(`DB host: ${url.hostname}:${url.port || '5432'}  db: ${url.pathname.slice(1)}  project ref: ${ref ?? '(unknown)'}  expected: ${expected}`);
  if (ref !== expected) {
    console.error(`REFUSING: project ref ${ref ?? '(unknown)'} is not ${expected}. Set EXPECTED_DB_REF to override deliberately.`);
    process.exit(1);
  }
  const isRemote = !/localhost|127\.0\.0\.1/.test(connectionString);
  // sslmode in the URL overrides the ssl option (pooler cert chain is not in Node's trust store); strip it.
  url.searchParams.delete('sslmode');
  url.searchParams.delete('connection_limit');
  const adapter = new PrismaPg({ connectionString: url.toString(), ssl: isRemote ? { rejectUnauthorized: false } : undefined });
  const prisma = new PrismaClient({ adapter });
  const wantExecute = process.argv.includes('--execute');
  const confirmed = process.env.CONFIRM_WIPE === '1';
  if (wantExecute && !confirmed) {
    console.error('REFUSING: --execute also needs env CONFIRM_WIPE=1.');
    process.exit(1);
  }
  const execute = wantExecute && confirmed;
  console.log(execute ? 'MODE: EXECUTE (writes will be committed)\n' : 'MODE: DRY RUN (read-only; no changes)\n');
  return { prisma, execute };
}
