import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import sqlite3 from 'sqlite3';
import { getMigrationSql, type SqlDialect } from './schema';

loadEnv();

const DEFAULT_SQLITE_URL = 'file:./data/dev.db';

export interface DatabaseClient {
  dialect: SqlDialect;
  execute: (sql: string, params?: unknown[]) => Promise<void>;
  query: <T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<T[]>;
  healthCheck: () => Promise<boolean>;
  close: () => Promise<void>;
}

function detectDialect(databaseUrl: string): SqlDialect {
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
    return 'postgres';
  }
  return 'sqlite';
}

function resolveSqlitePath(databaseUrl: string): string {
  const raw = databaseUrl.startsWith('file:') ? databaseUrl.slice(5) : databaseUrl;
  if (!raw || raw === ':memory:') {
    return ':memory:';
  }

  const absolutePath = path.resolve(process.cwd(), raw);
  const directory = path.dirname(absolutePath);
  fs.mkdirSync(directory, { recursive: true });
  return absolutePath;
}

async function createSqliteClient(databaseUrl: string): Promise<DatabaseClient> {
  const sqliteFile = resolveSqlitePath(databaseUrl);
  const db = new sqlite3.Database(sqliteFile);

  const exec = (sql: string) =>
    new Promise<void>((resolve, reject) => {
      db.exec(sql, (error: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

  const run = (sql: string, params: unknown[] = []) =>
    new Promise<void>((resolve, reject) => {
      db.run(sql, params as [], (error: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

  const all = <T>(sql: string, params: unknown[] = []) =>
    new Promise<T[]>((resolve, reject) => {
      db.all(sql, params, (error: Error | null, rows: unknown[]) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(rows as T[]);
      });
    });

  const close = () =>
    new Promise<void>((resolve, reject) => {
      db.close((error: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

  await exec('PRAGMA foreign_keys = ON;');

  return {
    dialect: 'sqlite',
    execute: (sql, params = []) => (params.length ? run(sql, params) : exec(sql)),
    query: <T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) =>
      all<T>(sql, params),
    healthCheck: async () => {
      try {
        await all('SELECT 1 as ok;');
        return true;
      } catch {
        return false;
      }
    },
    close,
  };
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
  const migrationSql = getMigrationSql(client.dialect);
  for (const sql of migrationSql) {
    await client.execute(sql);
  }
}

export async function createDatabaseClient(databaseUrl?: string): Promise<DatabaseClient> {
  const resolvedUrl = databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_SQLITE_URL;
  const dialect = detectDialect(resolvedUrl);

  if (dialect === 'postgres') {
    return createPostgresClient(resolvedUrl);
  }
  return createSqliteClient(resolvedUrl);
}

export async function initDatabase(databaseUrl?: string): Promise<DatabaseClient> {
  const client = await createDatabaseClient(databaseUrl);
  await runMigrations(client);
  return client;
}
