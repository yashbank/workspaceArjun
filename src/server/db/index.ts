import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/arjun';

  const isRemote =
    !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');

  const adapter = new PrismaPg({
    connectionString,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
  });

  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
