import { config as loadEnv } from 'dotenv';
import type { DatabaseClient } from '../../db';

loadEnv();

interface PostRow {
  id: string;
  customer_id: string;
  channel: string;
  title: string;
  content: string;
  tags: unknown;
}

interface CustomerRow {
  id: string;
  threads_account: string | null;
}

interface GraphCreateThreadsMediaResponse {
  id?: string;
}

interface GraphPublishThreadsMediaResponse {
  id?: string;
}

export interface ThreadsPublishResult {
  postId: string;
  creationId: string;
  mediaId: string;
  publishedUrl: string;
  publishedAt: string;
}

const DEFAULT_META_GRAPH_VERSION = 'v21.0';
const THREADS_TEXT_LIMIT = 500;

function getParamPlaceholder(dialect: DatabaseClient['dialect'], index: number): string {
  return dialect === 'postgres' ? `$${index}` : '?';
}

function parseTags(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function truncateText(value: string): string {
  return value.length > THREADS_TEXT_LIMIT
    ? `${value.slice(0, THREADS_TEXT_LIMIT - 1)}…`
    : value;
}

function buildThreadsText(post: PostRow): string {
  const tags = parseTags(post.tags)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag.replace(/\s+/g, '')}`))
    .slice(0, 8)
    .join(' ');

  const composed = [post.title, post.content, tags].filter((part) => part && part.trim()).join('\n\n');
  return truncateText(composed);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getMetaAccessToken(): string {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    throw new Error('META_ACCESS_TOKEN is not configured');
  }
  return token;
}

function getMetaGraphVersion(): string {
  return process.env.META_GRAPH_API_VERSION ?? DEFAULT_META_GRAPH_VERSION;
}

function resolveThreadsAccountId(customerThreadsAccount: string | null): string {
  const configured = process.env.META_THREADS_ACCOUNT_ID;
  if (configured) return configured;
  if (customerThreadsAccount) return customerThreadsAccount;
  throw new Error('Threads account id is not configured (META_THREADS_ACCOUNT_ID/customer.threads_account)');
}

function buildThreadsUrl(mediaId: string): string {
  return `https://www.threads.net/t/${mediaId}`;
}

async function getPostById(db: DatabaseClient, postId: string): Promise<PostRow | null> {
  const idPlaceholder = getParamPlaceholder(db.dialect, 1);
  const rows = await db.query<PostRow>(
    `SELECT id, customer_id, channel, title, content, tags
     FROM posts
     WHERE id = ${idPlaceholder}
     LIMIT 1`,
    [postId],
  );
  return rows.length ? rows[0] : null;
}

async function getCustomerThreadsAccount(
  db: DatabaseClient,
  customerId: string,
): Promise<string | null> {
  const idPlaceholder = getParamPlaceholder(db.dialect, 1);
  const rows = await db.query<CustomerRow>(
    `SELECT id, threads_account
     FROM customers
     WHERE id = ${idPlaceholder}
     LIMIT 1`,
    [customerId],
  );
  if (!rows.length) return null;
  return rows[0].threads_account ?? null;
}

async function markPostPublished(
  db: DatabaseClient,
  postId: string,
  publishedUrl: string,
  publishedAt: string,
): Promise<void> {
  const idPlaceholder = getParamPlaceholder(db.dialect, 1);
  const sql =
    db.dialect === 'postgres'
      ? `UPDATE posts
         SET status = 'published', published_url = $2, published_at = $3, updated_at = $3, error_message = NULL
         WHERE id = ${idPlaceholder}`
      : `UPDATE posts
         SET status = 'published', published_url = ?, published_at = ?, updated_at = ?, error_message = NULL
         WHERE id = ${idPlaceholder}`;
  const params =
    db.dialect === 'postgres'
      ? [postId, publishedUrl, publishedAt]
      : [publishedUrl, publishedAt, publishedAt, postId];
  await db.execute(sql, params);
}

async function markPostFailed(db: DatabaseClient, postId: string, errorMessage: string): Promise<void> {
  const idPlaceholder = getParamPlaceholder(db.dialect, 1);
  const now = new Date().toISOString();
  const sql =
    db.dialect === 'postgres'
      ? `UPDATE posts
         SET status = 'failed', error_message = $2, updated_at = $3
         WHERE id = ${idPlaceholder}`
      : `UPDATE posts
         SET status = 'failed', error_message = ?, updated_at = ?
         WHERE id = ${idPlaceholder}`;
  const params = db.dialect === 'postgres' ? [postId, errorMessage, now] : [errorMessage, now, postId];
  await db.execute(sql, params);
}

async function createThreadsMediaContainer(
  threadsAccountId: string,
  text: string,
): Promise<string> {
  const version = getMetaGraphVersion();
  const token = getMetaAccessToken();
  const endpoint = `https://graph.facebook.com/${version}/${threadsAccountId}/threads`;

  const body = new URLSearchParams();
  body.set('media_type', 'TEXT');
  body.set('text', text);
  body.set('access_token', token);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`threads media create failed (${response.status}): ${raw}`);
  }

  const data = JSON.parse(raw) as GraphCreateThreadsMediaResponse;
  if (!data.id) {
    throw new Error('threads media create response missing id');
  }
  return data.id;
}

async function publishThreadsContainer(threadsAccountId: string, creationId: string): Promise<string> {
  const version = getMetaGraphVersion();
  const token = getMetaAccessToken();
  const endpoint = `https://graph.facebook.com/${version}/${threadsAccountId}/threads_publish`;

  const body = new URLSearchParams();
  body.set('creation_id', creationId);
  body.set('access_token', token);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`threads publish failed (${response.status}): ${raw}`);
  }

  const data = JSON.parse(raw) as GraphPublishThreadsMediaResponse;
  if (!data.id) {
    throw new Error('threads publish response missing id');
  }
  return data.id;
}

export async function publishToThreads(
  db: DatabaseClient,
  postId: string,
): Promise<ThreadsPublishResult> {
  const post = await getPostById(db, postId);
  if (!post) {
    throw new Error(`post not found: ${postId}`);
  }
  if (post.channel !== 'threads') {
    throw new Error(`post ${postId} is not threads channel`);
  }

  const customerThreadsAccount = await getCustomerThreadsAccount(db, post.customer_id);
  const threadsAccountId = resolveThreadsAccountId(customerThreadsAccount);
  const text = buildThreadsText(post);

  try {
    const creationId = await createThreadsMediaContainer(threadsAccountId, text);
    const mediaId = await publishThreadsContainer(threadsAccountId, creationId);
    const publishedAt = new Date().toISOString();
    const publishedUrl = buildThreadsUrl(mediaId);

    await markPostPublished(db, post.id, publishedUrl, publishedAt);
    return {
      postId: post.id,
      creationId,
      mediaId,
      publishedUrl,
      publishedAt,
    };
  } catch (error) {
    await markPostFailed(db, post.id, toErrorMessage(error));
    throw error;
  }
}
