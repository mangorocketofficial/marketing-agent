import { randomUUID } from 'node:crypto';
import type { PostChannel } from '@marketing-agent/shared';
import type { DatabaseClient } from '../../db';
import { getParamPlaceholder, parseStringArray } from '../../utils/db';

const EMBEDDING_API_URL = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHUNK_MAX_LENGTH = 500;

type IngestSourceType = 'past-content' | 'project-doc' | 'profile';

interface PostForIngest {
  id: string;
  customer_id: string;
  channel: string;
  status: string;
  title: string;
  content: string;
  tags: unknown;
  images: unknown;
  published_at: string | null;
}

interface CustomerProfileRow {
  id: string;
  name: string;
  organization_type: string;
  description: string;
  mission: string;
  keywords: unknown;
  location: string;
  schedule: unknown;
}

interface EmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
}

export interface IngestPublishedPostInput {
  postId: string;
  customerId: string;
  channel: PostChannel;
  publishedAt?: string;
  category?: string;
}

export interface IngestProjectDocumentInput {
  customerId: string;
  sourceId: string;
  title?: string;
  textContent: string;
  category?: string;
  channel?: PostChannel;
  metadata?: Record<string, unknown>;
}

export interface IngestCustomerProfileInput {
  customerId: string;
}

function chunkText(text: string, maxLength = CHUNK_MAX_LENGTH): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];

  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= maxLength) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (paragraph.length <= maxLength) {
      current = paragraph;
      continue;
    }

    for (let index = 0; index < paragraph.length; index += maxLength) {
      chunks.push(paragraph.slice(index, index + maxLength));
    }
    current = '';
  }

  if (current) {
    chunks.push(current);
  }
  return chunks;
}

async function getPublishedPost(db: DatabaseClient, postId: string): Promise<PostForIngest | null> {
  const idPlaceholder = getParamPlaceholder(1);
  const rows = await db.query<PostForIngest>(
    `SELECT id, customer_id, channel, status, title, content, tags, images, published_at
     FROM posts
     WHERE id = ${idPlaceholder}
     LIMIT 1`,
    [postId],
  );

  if (!rows.length) return null;
  const row = rows[0];
  return row.status === 'published' ? row : null;
}

async function getCustomerProfileById(db: DatabaseClient, customerId: string): Promise<CustomerProfileRow | null> {
  const idPlaceholder = getParamPlaceholder(1);
  const rows = await db.query<CustomerProfileRow>(
    `SELECT id, name, organization_type, description, mission, keywords, location, schedule
     FROM customers
     WHERE id = ${idPlaceholder}
     LIMIT 1`,
    [customerId],
  );
  return rows.length ? rows[0] : null;
}

async function embedTexts(texts: string[]): Promise<Array<number[] | null>> {
  if (!texts.length) return [];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn('[ingest] OPENAI_API_KEY is not set; embeddings will be null.');
    return texts.map(() => null);
  }

  const response = await fetch(EMBEDDING_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Embedding request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as EmbeddingResponse;
  const result = payload.data ?? [];
  return texts.map((_, index) => result[index]?.embedding ?? null);
}

function inferCategory(value?: string): string {
  if (value && value.trim()) return value.trim();
  return 'general';
}

function isPostChannel(value: string): value is PostChannel {
  return value === 'naver-blog' || value === 'instagram' || value === 'threads' || value === 'nextjs-blog';
}

function buildProfileText(row: CustomerProfileRow): string {
  const keywords = parseStringArray(row.keywords);
  const scheduleText = typeof row.schedule === 'string' ? row.schedule : JSON.stringify(row.schedule ?? {});

  return [
    `단체명: ${row.name}`,
    `조직 유형: ${row.organization_type}`,
    `미션: ${row.mission}`,
    `소개: ${row.description}`,
    `핵심 키워드: ${keywords.join(', ') || '(없음)'}`,
    `활동 지역: ${row.location}`,
    `운영 스케줄: ${scheduleText}`,
  ]
    .join('\n')
    .trim();
}

async function upsertVector(
  db: DatabaseClient,
  row: {
    id: string;
    customerId: string;
    sourceType: IngestSourceType;
    category: string;
    channel?: string;
    sourceId: string;
    chunkIndex: number;
    textContent: string;
    embedding: number[] | null;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO content_vectors (
      id, customer_id, source_type, category, channel, source_id, chunk_index,
      text_content, embedding, metadata, created_at, updated_at
    ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::vector, $10::jsonb, $11, $11)
    ON CONFLICT (customer_id, source_type, source_id, chunk_index)
    DO UPDATE SET
      text_content = EXCLUDED.text_content,
      embedding = EXCLUDED.embedding,
      metadata = EXCLUDED.metadata,
      category = EXCLUDED.category,
      channel = EXCLUDED.channel,
      updated_at = EXCLUDED.updated_at`,
    [
      row.id,
      row.customerId,
      row.sourceType,
      row.category,
      row.channel ?? null,
      row.sourceId,
      row.chunkIndex,
      row.textContent,
      row.embedding ? `[${row.embedding.join(',')}]` : null,
      JSON.stringify(row.metadata),
      now,
    ],
  );
}

async function deleteOrphanChunks(
  db: DatabaseClient,
  customerId: string,
  sourceType: IngestSourceType,
  sourceId: string,
  chunkCount: number,
): Promise<void> {
  const params = [customerId, sourceType, sourceId, chunkCount];
  await db.execute(
    `DELETE FROM content_vectors
     WHERE customer_id = $1 AND source_type = $2 AND source_id = $3 AND chunk_index >= $4`,
    params,
  );
}

async function ingestTextSourceToRag(
  db: DatabaseClient,
  source: {
    customerId: string;
    sourceType: IngestSourceType;
    sourceId: string;
    category: string;
    channel?: PostChannel;
    textContent: string;
    metadata: Record<string, unknown>;
  },
): Promise<boolean> {
  const chunks = chunkText(source.textContent);
  if (!chunks.length) return false;

  const embeddings = await embedTexts(chunks);

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    await upsertVector(db, {
      id: randomUUID(),
      customerId: source.customerId,
      sourceType: source.sourceType,
      category: source.category,
      channel: source.channel,
      sourceId: source.sourceId,
      chunkIndex,
      textContent: chunks[chunkIndex],
      embedding: embeddings[chunkIndex] ?? null,
      metadata: {
        ...source.metadata,
        ingestedAt: new Date().toISOString(),
      },
    });
  }

  await deleteOrphanChunks(db, source.customerId, source.sourceType, source.sourceId, chunks.length);
  return true;
}

export async function ingestPublishedPostToRag(
  db: DatabaseClient,
  payload: IngestPublishedPostInput,
): Promise<boolean> {
  const post = await getPublishedPost(db, payload.postId);
  if (!post) return false;

  const body = [post.title, post.content].filter(Boolean).join('\n\n').trim();
  const tags = parseStringArray(post.tags);
  const images = parseStringArray(post.images);
  const publishedAt = payload.publishedAt ?? post.published_at ?? new Date().toISOString();

  return ingestTextSourceToRag(db, {
    customerId: post.customer_id,
    sourceType: 'past-content',
    sourceId: payload.postId,
    category: inferCategory(payload.category),
    channel: isPostChannel(post.channel) ? post.channel : payload.channel,
    textContent: body,
    metadata: {
      title: post.title,
      tags,
      images,
      publishedAt,
    },
  });
}

export async function ingestCustomerProfileToRag(
  db: DatabaseClient,
  payload: IngestCustomerProfileInput,
): Promise<boolean> {
  const customer = await getCustomerProfileById(db, payload.customerId);
  if (!customer) return false;

  return ingestTextSourceToRag(db, {
    customerId: customer.id,
    sourceType: 'profile',
    sourceId: `profile:${customer.id}`,
    category: 'profile',
    textContent: buildProfileText(customer),
    metadata: {
      customerName: customer.name,
      organizationType: customer.organization_type,
    },
  });
}

export async function ingestProjectDocumentToRag(
  db: DatabaseClient,
  payload: IngestProjectDocumentInput,
): Promise<boolean> {
  const body = [payload.title?.trim(), payload.textContent.trim()].filter(Boolean).join('\n\n');
  if (!body) return false;

  return ingestTextSourceToRag(db, {
    customerId: payload.customerId,
    sourceType: 'project-doc',
    sourceId: payload.sourceId,
    category: inferCategory(payload.category),
    channel: payload.channel,
    textContent: body,
    metadata: {
      title: payload.title?.trim() ?? null,
      ...(payload.metadata ?? {}),
    },
  });
}

export function triggerAutoIngestForPublishedPost(
  db: DatabaseClient,
  post: { id: string; customerId: string; channel: PostChannel; status: string; publishedAt?: string },
): void {
  if (post.status !== 'published') {
    return;
  }

  void ingestPublishedPostToRag(db, {
    postId: post.id,
    customerId: post.customerId,
    channel: post.channel,
    publishedAt: post.publishedAt,
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`[ingest] failed for post=${post.id}: ${message}`);
  });
}

export function triggerAutoIngestForCustomerProfile(
  db: DatabaseClient,
  customer: { id: string },
): void {
  void ingestCustomerProfileToRag(db, { customerId: customer.id }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`[ingest] failed for customer profile=${customer.id}: ${message}`);
  });
}
