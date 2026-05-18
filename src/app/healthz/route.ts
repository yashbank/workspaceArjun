import { NextResponse } from 'next/server';
import { db, extractDatabaseError, getDatabaseEnvDiagnostics } from '@/server/db';
import { getStorageDriverName, isStorageConfigured } from '@/server/storage';

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {
    app: 'ok',
    database: 'error',
    storage: 'error',
  };

  const dbDiagnostics = getDatabaseEnvDiagnostics();
  let databaseError: { code: string | null; message: string } | null = null;

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (error) {
    checks.database = 'error';
    databaseError = extractDatabaseError(error);
    if (process.env.NODE_ENV === 'development') {
      console.error('[healthz] database check failed:', error);
    }
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
      database: {
        ...dbDiagnostics,
        errorCode: databaseError?.code ?? null,
        errorMessage: databaseError?.message ?? null,
      },
      storage: {
        driver: getStorageDriverName(),
        configured: checks.storage === 'ok',
      },
    },
    { status: healthy ? 200 : 503 },
  );
}
