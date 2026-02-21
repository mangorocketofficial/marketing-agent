export type SqlDialect = 'sqlite' | 'postgres';

export interface MigrationStep {
  id: string;
  description: string;
  sql: Record<SqlDialect, string>;
}

const JSON_SQL_TYPE: Record<SqlDialect, string> = {
  sqlite: 'TEXT',
  postgres: 'JSONB',
};

const TIMESTAMP_SQL_TYPE: Record<SqlDialect, string> = {
  sqlite: 'TEXT',
  postgres: 'TIMESTAMPTZ',
};

export const migrationPlan: MigrationStep[] = [
  {
    id: '001_customers',
    description: 'NGO customers',
    sql: {
      sqlite: `
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  organization_type TEXT NOT NULL,
  description TEXT NOT NULL,
  mission TEXT NOT NULL,
  keywords TEXT NOT NULL,
  location TEXT NOT NULL,
  schedule TEXT NOT NULL,
  naver_blog_id TEXT,
  instagram_account TEXT,
  threads_account TEXT,
  blog_url TEXT,
  telegram_chat_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`,
      postgres: `
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  organization_type TEXT NOT NULL,
  description TEXT NOT NULL,
  mission TEXT NOT NULL,
  keywords ${JSON_SQL_TYPE.postgres} NOT NULL,
  location TEXT NOT NULL,
  schedule ${JSON_SQL_TYPE.postgres} NOT NULL,
  naver_blog_id TEXT,
  instagram_account TEXT,
  threads_account TEXT,
  blog_url TEXT,
  telegram_chat_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at ${TIMESTAMP_SQL_TYPE.postgres} NOT NULL DEFAULT NOW(),
  updated_at ${TIMESTAMP_SQL_TYPE.postgres} NOT NULL DEFAULT NOW()
);`,
    },
  },
  {
    id: '002_posts',
    description: 'Publishing posts',
    sql: {
      sqlite: `
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  images TEXT NOT NULL,
  tags TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  published_at TEXT,
  published_url TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);`,
      postgres: `
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  images ${JSON_SQL_TYPE.postgres} NOT NULL,
  tags ${JSON_SQL_TYPE.postgres} NOT NULL,
  scheduled_at ${TIMESTAMP_SQL_TYPE.postgres} NOT NULL,
  published_at ${TIMESTAMP_SQL_TYPE.postgres},
  published_url TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at ${TIMESTAMP_SQL_TYPE.postgres} NOT NULL DEFAULT NOW(),
  updated_at ${TIMESTAMP_SQL_TYPE.postgres} NOT NULL DEFAULT NOW()
);`,
    },
  },
  {
    id: '003_donors',
    description: 'Email recipients (donor-facing communication) and legacy donation history',
    sql: {
      sqlite: `
CREATE TABLE IF NOT EXISTS donors (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  donation_type TEXT NOT NULL,
  monthly_amount INTEGER,
  total_donated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  receive_report INTEGER NOT NULL DEFAULT 1,
  last_donated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS donations (
  id TEXT PRIMARY KEY,
  donor_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  donation_type TEXT NOT NULL,
  note TEXT,
  donated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (donor_id) REFERENCES donors(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);`,
      postgres: `
CREATE TABLE IF NOT EXISTS donors (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  donation_type TEXT NOT NULL,
  monthly_amount INTEGER,
  total_donated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  receive_report BOOLEAN NOT NULL DEFAULT TRUE,
  last_donated_at ${TIMESTAMP_SQL_TYPE.postgres},
  created_at ${TIMESTAMP_SQL_TYPE.postgres} NOT NULL DEFAULT NOW(),
  updated_at ${TIMESTAMP_SQL_TYPE.postgres} NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donations (
  id TEXT PRIMARY KEY,
  donor_id TEXT NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  donation_type TEXT NOT NULL,
  note TEXT,
  donated_at ${TIMESTAMP_SQL_TYPE.postgres} NOT NULL,
  created_at ${TIMESTAMP_SQL_TYPE.postgres} NOT NULL DEFAULT NOW()
);`,
    },
  },
  {
    id: '004_reports',
    description: 'Marketing reports',
    sql: {
      sqlite: `
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  payload TEXT NOT NULL,
  sent_at TEXT,
  recipient_count INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);`,
      postgres: `
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  period_start ${TIMESTAMP_SQL_TYPE.postgres} NOT NULL,
  period_end ${TIMESTAMP_SQL_TYPE.postgres} NOT NULL,
  payload ${JSON_SQL_TYPE.postgres} NOT NULL,
  sent_at ${TIMESTAMP_SQL_TYPE.postgres},
  recipient_count INTEGER,
  created_at ${TIMESTAMP_SQL_TYPE.postgres} NOT NULL DEFAULT NOW()
);`,
    },
  },
  {
    id: '005_agent_tasks',
    description: 'Agent task executions and outputs',
    sql: {
      sqlite: `
CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  input TEXT,
  output TEXT,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);`,
      postgres: `
CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  input ${JSON_SQL_TYPE.postgres},
  output ${JSON_SQL_TYPE.postgres},
  error_message TEXT,
  started_at ${TIMESTAMP_SQL_TYPE.postgres},
  completed_at ${TIMESTAMP_SQL_TYPE.postgres},
  created_at ${TIMESTAMP_SQL_TYPE.postgres} NOT NULL DEFAULT NOW()
);`,
    },
  },
];

export function getMigrationSql(dialect: SqlDialect): string[] {
  return migrationPlan.map((step) => step.sql[dialect].trim());
}
