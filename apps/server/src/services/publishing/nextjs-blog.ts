import { config as loadEnv } from 'dotenv';
import type { DatabaseClient } from '../../db';

loadEnv();

interface PostRow {
  id: string;
  customer_id: string;
  channel: string;
  status: string;
  title: string;
  content: string;
  tags: unknown;
}

interface CustomerRow {
  id: string;
  blog_url: string | null;
}

export interface NextJsPublishResult {
  postId: string;
  publishedUrl: string;
  publishedAt: string;
}

const DEFAULT_PUBLISH_ENDPOINT = '/api/publish';

function getParamPlaceholder(dialect: DatabaseClient['dialect'], index: number): string {
  return dialect === 'postgres' ? `$${index}` : '?';
}

function parseTags(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === 'string')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function getPostById(db: DatabaseClient, postId: string): Promise<PostRow | null> {
  const idPlaceholder = getParamPlaceholder(db.dialect, 1);
  const rows = await db.query<PostRow>(
    `SELECT id, customer_id, channel, status, title, content, tags FROM posts WHERE id = ${idPlaceholder} LIMIT 1`,
    [postId],
  );
  return rows.length ? rows[0] : null;
}

async function getCustomerBlogUrl(db: DatabaseClient, customerId: string): Promise<string | null> {
  const idPlaceholder = getParamPlaceholder(db.dialect, 1);
  const rows = await db.query<CustomerRow>(
    `SELECT id, blog_url FROM customers WHERE id = ${idPlaceholder} LIMIT 1`,
    [customerId],
  );
  if (!rows.length) return null;
  return rows[0].blog_url ?? null;
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

  const params = db.dialect === 'postgres'
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

function resolvePublishUrl(customerBlogUrl: string | null): string {
  const explicit = process.env.NEXTJS_BLOG_PUBLISH_URL;
  if (explicit) return explicit;

  if (!customerBlogUrl) {
    throw new Error('customer blogUrl is not configured');
  }
  const normalized = customerBlogUrl.endsWith('/')
    ? customerBlogUrl.slice(0, -1)
    : customerBlogUrl;
  return `${normalized}${DEFAULT_PUBLISH_ENDPOINT}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function publishToNextJsBlog(
  db: DatabaseClient,
  postId: string,
): Promise<NextJsPublishResult> {
  const post = await getPostById(db, postId);
  if (!post) {
    throw new Error(`post not found: ${postId}`);
  }
  if (post.channel !== 'nextjs-blog') {
    throw new Error(`post ${postId} is not nextjs-blog channel`);
  }

  const customerBlogUrl = await getCustomerBlogUrl(db, post.customer_id);
  const publishUrl = resolvePublishUrl(customerBlogUrl);
  const requestBody = {
    postId: post.id,
    title: post.title,
    content: post.content,
    tags: parseTags(post.tags),
  };

  try {
    const response = await fetch(publishUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.NEXTJS_BLOG_API_TOKEN
          ? { Authorization: `Bearer ${process.env.NEXTJS_BLOG_API_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`nextjs publish failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as { publishedUrl?: string };
    const publishedAt = new Date().toISOString();
    const publishedUrl = data.publishedUrl ?? `${customerBlogUrl ?? ''}/posts/${post.id}`;

    await markPostPublished(db, post.id, publishedUrl, publishedAt);
    return {
      postId: post.id,
      publishedUrl,
      publishedAt,
    };
  } catch (error) {
    await markPostFailed(db, post.id, toErrorMessage(error));
    throw error;
  }
}
