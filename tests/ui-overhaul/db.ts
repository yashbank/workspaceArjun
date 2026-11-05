import { Client } from 'pg';

/** The throwaway local Postgres, hard-coded so a spec can never reach another database. */
const LOCAL_DB = 'postgresql://postgres@127.0.0.1:54329/postgres';

export async function withDb<T>(run: (query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: LOCAL_DB });
  await client.connect();
  try {
    return await run(async (sql, values) => (await client.query(sql, values as unknown[])).rows);
  } finally {
    await client.end();
  }
}
