import { migration006ContentVectors } from './migrations/006_content_vectors';
import { migration007PostMetrics } from './migrations/007_post_metrics';
import { migration008PostIdempotency } from './migrations/008_post_idempotency';

export type SqlDialect = 'postgres';

export interface MigrationStep {
  id: string;
  description: string;
  sql: {
    postgres: string;
  };
}

export const migrationPlan: MigrationStep[] = [
  {
    id: '001_customers',
    description: 'NGO customers',
    sql: {
      postgres: `
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  organization_type TEXT NOT NULL,
  description TEXT NOT NULL,
  mission TEXT NOT NULL,
  keywords JSONB NOT NULL,
  location TEXT NOT NULL,
  schedule JSONB NOT NULL,
  naver_blog_id TEXT,
  instagram_account TEXT,
  threads_account TEXT,
  blog_url TEXT,
  telegram_chat_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
    },
  },
  {
    id: '002_posts',
    description: 'Publishing posts',
    sql: {
      postgres: `
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  images JSONB NOT NULL,
  tags JSONB NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  published_url TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
    },
  },
  {
    id: '003_donors',
    description: 'Email recipients (donor-facing communication) and legacy donation history',
    sql: {
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
  last_donated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donations (
  id TEXT PRIMARY KEY,
  donor_id TEXT NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  donation_type TEXT NOT NULL,
  note TEXT,
  donated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
    },
  },
  {
    id: '004_reports',
    description: 'Marketing reports',
    sql: {
      postgres: `
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  sent_at TIMESTAMPTZ,
  recipient_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
    },
  },
  {
    id: '005_agent_tasks',
    description: 'Agent task executions and outputs',
    sql: {
      postgres: `
CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  input JSONB,
  output JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
    },
  },
  migration006ContentVectors,
  migration007PostMetrics,
  migration008PostIdempotency,
];

export function getMigrationSql(): string[] {
  return migrationPlan.map((step) => step.sql.postgres.trim());
}
