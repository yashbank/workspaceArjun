import type { PoolConfig } from 'pg';

const SSL_QUERY_PARAMS = [
  'sslmode',
  'sslrootcert',
  'sslcert',
  'sslkey',
  'sslcertmode',
  'uselibpqcompat',
] as const;

export const RUNTIME_PG_SSL = { rejectUnauthorized: false as const };

/** Runtime connection — session pooler on Vercel; CLI uses prisma.config.ts + DIRECT_URL. */
export function getRuntimeDatabaseUrl(): string {
  return (
    process.env.RUNTIME_DATABASE_URL ||
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/arjun'
  );
}

/** Strip sslmode (and related) query params so node-postgres honors the explicit `ssl` object. */
export function normalizeDatabaseUrlForPg(url: string): string {
  if (!url?.trim()) return url;

  const protocolMatch = url.match(/^(postgres(?:ql)?:\/\/)/i);
  if (!protocolMatch) return url;

  const protocol = protocolMatch[1].toLowerCase().startsWith('postgresql')
    ? 'postgresql://'
    : 'postgres://';

  try {
    const parsed = new URL(url.replace(/^postgres(ql)?:\/\//i, 'https://'));
    for (const param of SSL_QUERY_PARAMS) {
      parsed.searchParams.delete(param);
    }

    const search = parsed.searchParams.toString();
    const userinfo =
      parsed.username || parsed.password
        ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ''}@`
        : '';
    const port = parsed.port ? `:${parsed.port}` : '';
    const path = parsed.pathname || '';
    const query = search ? `?${search}` : '';

    return `${protocol}${userinfo}${parsed.hostname}${port}${path}${query}`;
  } catch {
    let stripped = url;
    for (const param of SSL_QUERY_PARAMS) {
      stripped = stripped.replace(
        new RegExp(`([?&])${param}=[^&]*&?`, 'gi'),
        '$1',
      );
    }
    return stripped.replace(/\?&/g, '?').replace(/[?&]$/g, '');
  }
}

export function usesSupabaseSsl(connectionString: string): boolean {
  const lower = connectionString.toLowerCase();
  if (lower.includes('localhost') || lower.includes('127.0.0.1')) {
    return false;
  }
  if (process.env.NODE_ENV === 'production') {
    return lower.includes('supabase') || lower.includes('pooler.supabase.com');
  }
  return !lower.includes('localhost') && !lower.includes('127.0.0.1');
}

export function getRuntimeSslRejectUnauthorized(): false | null {
  return usesSupabaseSsl(getRuntimeDatabaseUrl()) ? false : null;
}

export function createPoolConfig(connectionString: string): PoolConfig {
  const normalizedUrl = normalizeDatabaseUrlForPg(connectionString);
  const ssl = usesSupabaseSsl(normalizedUrl) ? RUNTIME_PG_SSL : undefined;

  return {
    connectionString: normalizedUrl,
    ssl,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  };
}

type UrlHints = {
  dbHost: string | null;
  dbPort: string | null;
  dbUserPrefix: string | null;
};

function parsePostgresUrlHints(url: string | undefined): UrlHints | null {
  if (!url?.trim()) return null;
  try {
    const normalized = url.replace(/^postgres(ql)?:\/\//, 'https://');
    const parsed = new URL(normalized);
    const username = decodeURIComponent(parsed.username || '');
    return {
      dbHost: parsed.hostname || null,
      dbPort: parsed.port || '5432',
      dbUserPrefix: username ? username.slice(0, 18) : null,
    };
  } catch {
    return null;
  }
}

export function getDatabaseEnvDiagnostics() {
  const runtimeUrl = getRuntimeDatabaseUrl();
  const hints =
    parsePostgresUrlHints(process.env.RUNTIME_DATABASE_URL) ??
    parsePostgresUrlHints(process.env.DIRECT_URL) ??
    parsePostgresUrlHints(process.env.DATABASE_URL) ??
    parsePostgresUrlHints(runtimeUrl);

  return {
    hasRuntimeDatabaseUrl: Boolean(process.env.RUNTIME_DATABASE_URL),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasDirectUrl: Boolean(process.env.DIRECT_URL),
    dbHost: hints?.dbHost ?? null,
    dbPort: hints?.dbPort ?? null,
    dbUserPrefix: hints?.dbUserPrefix ?? null,
  };
}

const CONNECTION_ERROR_CODES = new Set([
  'P1000',
  'P1001',
  'P1002',
  'P1008',
  'P1010',
  'P1011',
  'P1017',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  '57P01',
  '53300',
]);

export function sanitizeDatabaseErrorMessage(message: string): string {
  return message
    .replace(/postgres(ql)?:\/\/[^\s'"]+/gi, '[connection-redacted]')
    .replace(/password[=:]\S+/gi, 'password=[redacted]')
    .trim()
    .slice(0, 200);
}

export function extractDatabaseError(error: unknown): {
  code: string | null;
  message: string;
} {
  if (!error || typeof error !== 'object') {
    return { code: null, message: 'Unknown database error' };
  }

  const err = error as {
    code?: string;
    message?: string;
    cause?: unknown;
  };

  const code =
    (typeof err.code === 'string' ? err.code : null) ??
    (err.cause && typeof err.cause === 'object' && 'code' in err.cause
      ? String((err.cause as { code?: string }).code ?? '')
      : null);

  const rawMessage =
    typeof err.message === 'string'
      ? err.message
      : err.cause instanceof Error
        ? err.cause.message
        : 'Database query failed';

  return {
    code: code || null,
    message: sanitizeDatabaseErrorMessage(rawMessage),
  };
}

export function isDatabaseConnectionError(error: unknown): boolean {
  const { code, message } = extractDatabaseError(error);
  if (code && CONNECTION_ERROR_CODES.has(code)) return true;
  if (code?.startsWith('P10')) return true;

  const lower = message.toLowerCase();
  return (
    lower.includes("can't reach database") ||
    lower.includes('connection') ||
    lower.includes('connect') ||
    lower.includes('timeout') ||
    lower.includes('prepared statement') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('certificate')
  );
}
