import type { MigrationStep } from '../schema';

export const migration008PostIdempotency: MigrationStep = {
  id: '008_post_idempotency',
  description: 'Post idempotency key for dedupe',
  sql: {
    postgres: `
ALTER TABLE posts ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_customer_idempotency_key
  ON posts(customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;`,
  },
};
