import { Pool } from 'pg';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createPoolConfig, getRuntimeDatabaseUrl } from './connection';

const globalForDb = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaPool: Pool | undefined;
};

function getPool(): Pool {
  if (!globalForDb.prismaPool) {
    const connectionString = getRuntimeDatabaseUrl();
    globalForDb.prismaPool = new Pool(createPoolConfig(connectionString));
  }
  return globalForDb.prismaPool;
}

function createPrismaClient(): PrismaClient {
  const pool = getPool();
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const db = globalForDb.prisma ?? createPrismaClient();

if (!globalForDb.prisma) {
  globalForDb.prisma = db;
}

export {
  createPoolConfig,
  extractDatabaseError,
  getDatabaseEnvDiagnostics,
  getRuntimeDatabaseUrl,
  isDatabaseConnectionError,
  sanitizeDatabaseErrorMessage,
  usesSupabaseSsl,
} from './connection';
