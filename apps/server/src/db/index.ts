import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import { migrationPlan } from './schema';

loadEnv();

const DEFAULT_POSTGRES_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/marketing_agent';

export interface DatabaseClient {
  dialect: 'postgres';
  execute: (sql: string, params?: unknown[]) => Promise<void>;
  query: <T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<T[]>;
  healthCheck: () => Promise<boolean>;
  close: () => Promise<void>;
}

async function createPostgresClient(databaseUrl: string): Promise<DatabaseClient> {
  const pool = new Pool({ connectionString: databaseUrl });

  return {
    dialect: 'postgres',
    execute: async (sql: string, params: unknown[] = []) => {
      await pool.query(sql, params);
    },
    query: async <T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) => {
      const result = await pool.query<T>(sql, params);
      return result.rows;
    },
    healthCheck: async () => {
      try {
        await pool.query('SELECT 1 AS ok;');
        return true;
      } catch {
        return false;
      }
    },
    close: async () => {
      await pool.end();
    },
  };
}

async function runMigrations(client: DatabaseClient): Promise<void> {
  await client.execute(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);

  const appliedRows = await client.query<{ id: string }>('SELECT id FROM schema_migrations');
  const applied = new Set(appliedRows.map((row) => row.id));

  for (const step of migrationPlan) {
    if (applied.has(step.id)) {
      continue;
    }

    await client.execute(step.sql.postgres.trim());
    await client.execute('INSERT INTO schema_migrations (id) VALUES ($1)', [step.id]);
  }
}

export async function createDatabaseClient(databaseUrl?: string): Promise<DatabaseClient> {
  const resolvedUrl = databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_POSTGRES_URL;
  const normalized = resolvedUrl.toLowerCase();
  const isPostgresUrl =
    normalized.startsWith('postgres://') || normalized.startsWith('postgresql://');
  if (!isPostgresUrl) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string (postgres:// or postgresql://)');
  }

  return createPostgresClient(resolvedUrl);
}

export async function initDatabase(databaseUrl?: string): Promise<DatabaseClient> {
  const client = await createDatabaseClient(databaseUrl);
  await runMigrations(client);
  return client;
}
