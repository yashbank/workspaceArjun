import { NextResponse } from 'next/server';
import { db, extractDatabaseError, getDatabaseEnvDiagnostics } from '@/server/db';
import { getStorageDriverName, isStorageConfigured } from '@/server/storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {
    app: 'ok',
    database: 'error',
    storage: 'error',
  };

  const {
    hasRuntimeDatabaseUrl,
    hasDatabaseUrl,
    hasDirectUrl,
    dbHost,
    dbPort,
    dbUserPrefix,
  } = getDatabaseEnvDiagnostics();

  let errorCode: string | null = null;
  let errorMessage: string | null = null;

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (error) {
    checks.database = 'error';
    const dbError = extractDatabaseError(error);
    errorCode = dbError.code;
    errorMessage = dbError.message;
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
      healthzVersion: 'runtime-db-diagnostics-v2',
      status,
      timestamp: new Date().toISOString(),
      checks,
      hasRuntimeDatabaseUrl,
      hasDatabaseUrl,
      hasDirectUrl,
      dbHost,
      dbPort,
      dbUserPrefix,
      errorCode,
      errorMessage,
      storage: {
        driver: getStorageDriverName(),
        configured: checks.storage === 'ok',
      },
    },
    { status: healthy ? 200 : 503 },
  );
}
