import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { getStorageDriverName, isStorageConfigured } from '@/server/storage';

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {
    app: 'ok',
    database: 'error',
    storage: 'error',
  };

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  try {
    checks.storage = isStorageConfigured() ? 'ok' : 'error';
  } catch {
    checks.storage = 'error';
  }

  const healthy = checks.database === 'ok' && checks.storage === 'ok';
  const status = healthy ? 'ok' : 'degraded';

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      checks,
      storage: {
        driver: getStorageDriverName(),
        configured: checks.storage === 'ok',
      },
    },
    { status: healthy ? 200 : 503 },
  );
}
