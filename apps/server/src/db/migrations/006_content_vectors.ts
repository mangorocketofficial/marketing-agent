import type { MigrationStep } from '../schema';

export const migration006ContentVectors: MigrationStep = {
  id: '006_content_vectors',
  description: 'RAG content vectors for content generation',
  sql: {
    postgres: `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS content_vectors (
  id UUID PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  category TEXT,
  channel TEXT,
  performance TEXT,
  source_id TEXT,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  text_content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vectors_customer ON content_vectors(customer_id);
CREATE INDEX IF NOT EXISTS idx_vectors_category ON content_vectors(customer_id, category);
CREATE INDEX IF NOT EXISTS idx_vectors_source ON content_vectors(customer_id, source_type, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vectors_source_chunk
  ON content_vectors(customer_id, source_type, source_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_vectors_embedding
  ON content_vectors USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);`,
  },
};
