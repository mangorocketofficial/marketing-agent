import type { PostChannel } from '@marketing-agent/shared';
import type { DatabaseClient } from '../../db';
import { getParamPlaceholder, parseJsonObject } from '../../utils/db';

export type RagSourceType = 'past-content' | 'project-doc' | 'profile';
export type RagPerformance = 'high' | 'medium' | 'low';

export interface RagFilters {
  categories?: string[];
  performanceMin?: 'high' | 'medium';
  excludePostIds?: string[];
}

export interface RagReference {
  id: string;
  sourceType: RagSourceType;
  category?: string;
  channel?: string;
  performance?: RagPerformance;
  sourceId?: string;
  textContent: string;
  metadata: Record<string, unknown>;
}

export interface RagSearchInput {
  customerId: string;
  channel: PostChannel;
  topic: string;
  category?: string;
  ragFilters?: RagFilters;
  limit?: number;
}

interface ContentVectorRow {
  id: string;
  source_type: string;
  category: string | null;
  channel: string | null;
  performance: string | null;
  source_id: string | null;
  text_content: string;
  metadata: unknown;
}

const EMBEDDING_API_URL = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';

async function embedQuery(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !text.trim()) return null;

  try {
    const response = await fetch(EMBEDDING_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: [text],
      }),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    return payload.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

function sanitizeRagText(value: string): string {
  return value
    .replace(/ignore\s+previous\s+instructions/gi, '[removed: instruction-like text]')
    .replace(/disregard\s+all\s+prior\s+rules/gi, '[removed: instruction-like text]')
    .replace(/system\s*:\s*/gi, '[removed: system-mimic text] ')
    .replace(/developer\s*:\s*/gi, '[removed: role-mimic text] ')
    .replace(/tool[_ -]?call/gi, '[removed: tool-call mimic text]')
    .replace(/api[_ -]?key/gi, '[removed: credential-like token]')
    .replace(/\s+/g, ' ')
    .trim();
}

function toPerformanceList(min?: 'high' | 'medium'): RagPerformance[] | null {
  if (!min) return null;
  return min === 'high' ? ['high'] : ['high', 'medium'];
}

function mapRows(rows: ContentVectorRow[]): RagReference[] {
  return rows.map((row) => ({
    id: row.id,
    sourceType: row.source_type as RagSourceType,
    category: row.category ?? undefined,
    channel: row.channel ?? undefined,
    performance: (row.performance as RagPerformance | null) ?? undefined,
    sourceId: row.source_id ?? undefined,
    textContent: sanitizeRagText(row.text_content),
    metadata: parseJsonObject(row.metadata),
  }));
}

export function formatRagPromptContext(references: RagReference[]): string {
  if (!references.length) return 'RAG references: none';

  return references
    .map((item, index) => {
      const sourceMeta = [
        `sourceType=${item.sourceType}`,
        item.category ? `category=${item.category}` : null,
        item.channel ? `channel=${item.channel}` : null,
        item.performance ? `performance=${item.performance}` : null,
        item.sourceId ? `sourceId=${item.sourceId}` : null,
      ]
        .filter((entry): entry is string => Boolean(entry))
        .join(', ');

      return [
        `<<RAG_SOURCE_${index + 1}>>`,
        sourceMeta || 'metadata=none',
        item.textContent,
        `<</RAG_SOURCE_${index + 1}>>`,
      ].join('\n');
    })
    .join('\n\n');
}

function buildSqlFilters(input: RagSearchInput): { filters: string[]; params: unknown[] } {
  const params: unknown[] = [];
  const filters: string[] = [];

  params.push(input.customerId);
  filters.push(`customer_id = ${getParamPlaceholder(params.length)}`);

  if (input.category) {
    params.push(input.category);
    filters.push(`category = ${getParamPlaceholder(params.length)}`);
  }

  if (input.ragFilters?.categories?.length) {
    const placeholders = input.ragFilters.categories.map((value) => {
      params.push(value);
      return getParamPlaceholder(params.length);
    });
    filters.push(`category IN (${placeholders.join(', ')})`);
  }

  const allowedPerformance = toPerformanceList(input.ragFilters?.performanceMin);
  if (allowedPerformance?.length) {
    const placeholders = allowedPerformance.map((value) => {
      params.push(value);
      return getParamPlaceholder(params.length);
    });
    filters.push(`performance IN (${placeholders.join(', ')})`);
  }

  if (input.ragFilters?.excludePostIds?.length) {
    const placeholders = input.ragFilters.excludePostIds.map((value) => {
      params.push(value);
      return getParamPlaceholder(params.length);
    });
    filters.push(`(source_id IS NULL OR source_id NOT IN (${placeholders.join(', ')}))`);
  }

  const sourceTypes: RagSourceType[] = ['past-content', 'project-doc', 'profile'];
  const sourceTypePlaceholders = sourceTypes.map((value) => {
    params.push(value);
    return getParamPlaceholder(params.length);
  });
  filters.push(`source_type IN (${sourceTypePlaceholders.join(', ')})`);

  params.push(input.channel);
  const channelPlaceholder = getParamPlaceholder(params.length);
  filters.push(`(source_type <> 'past-content' OR channel IS NULL OR channel = ${channelPlaceholder})`);

  return { filters, params };
}

async function searchWithPostgresVector(
  db: DatabaseClient,
  input: RagSearchInput,
  queryVector: number[],
): Promise<RagReference[]> {
  const { filters, params } = buildSqlFilters(input);
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(10, Number(input.limit))) : 7;

  params.push(`[${queryVector.join(',')}]`);
  const vectorPlaceholder = getParamPlaceholder(params.length);

  params.push(limit);
  const limitPlaceholder = getParamPlaceholder(params.length);

  const rows = await db.query<ContentVectorRow>(
    `SELECT id, source_type, category, channel, performance, source_id, text_content, metadata
     FROM content_vectors
     WHERE ${filters.join(' AND ')}
     ORDER BY
       CASE WHEN embedding IS NULL THEN 1 ELSE 0 END ASC,
       (embedding <=> ${vectorPlaceholder}::vector) ASC,
       CASE source_type
         WHEN 'past-content' THEN 1
         WHEN 'project-doc' THEN 2
         WHEN 'profile' THEN 3
         ELSE 4
       END ASC,
       created_at DESC
     LIMIT ${limitPlaceholder}`,
    params,
  );

  return mapRows(rows);
}

async function searchWithTextFallback(db: DatabaseClient, input: RagSearchInput): Promise<RagReference[]> {
  const { filters, params } = buildSqlFilters(input);
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(10, Number(input.limit))) : 7;

  const topicPattern = `%${input.topic}%`;
  params.push(topicPattern);
  filters.push(`text_content ILIKE ${getParamPlaceholder(params.length)}`);

  params.push(limit);
  const limitPlaceholder = getParamPlaceholder(params.length);

  const rows = await db.query<ContentVectorRow>(
    `SELECT id, source_type, category, channel, performance, source_id, text_content, metadata
     FROM content_vectors
     WHERE ${filters.join(' AND ')}
     ORDER BY
       CASE source_type
         WHEN 'past-content' THEN 1
         WHEN 'project-doc' THEN 2
         WHEN 'profile' THEN 3
         ELSE 4
       END ASC,
       created_at DESC
     LIMIT ${limitPlaceholder}`,
    params,
  );

  return mapRows(rows);
}

export async function searchRagReferences(db: DatabaseClient, input: RagSearchInput): Promise<RagReference[]> {
  const queryVector = await embedQuery(input.topic);
  if (queryVector) {
    return searchWithPostgresVector(db, input, queryVector);
  }

  return searchWithTextFallback(db, input);
}

export async function updateVectorPerformanceForPost(
  db: DatabaseClient,
  postId: string,
  performance: RagPerformance,
): Promise<void> {
  await db.execute(
    `UPDATE content_vectors
     SET performance = $1, updated_at = NOW()
     WHERE source_type = 'past-content' AND source_id = $2`,
    [performance, postId],
  );
}
