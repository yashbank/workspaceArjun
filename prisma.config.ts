import dotenv from 'dotenv';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

dotenv.config({ path: path.join(__dirname, '.env.local') });
dotenv.config({ path: path.join(__dirname, '.env') });

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/arjun';

const isRemote = !DATABASE_URL.includes('localhost') && !DATABASE_URL.includes('127.0.0.1');
const migrateUrl =
  isRemote && !DATABASE_URL.includes('sslmode')
    ? `${DATABASE_URL}${DATABASE_URL.includes('?') ? '&' : '?'}sslmode=require`
    : DATABASE_URL;

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'prisma', 'migrations'),
  },
  datasource: {
    url: migrateUrl,
  },
});
