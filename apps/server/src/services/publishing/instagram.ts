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
  images: unknown;
}

interface CustomerRow {
  id: string;
  instagram_account: string | null;
}

interface GraphCreateMediaResponse {
  id?: string;
}

interface GraphPublishMediaResponse {
  id?: string;
}

interface InstagramMeResponse {
  id?: string;
}

export interface InstagramPublishResult {
  postId: string;
  creationId: string;
  mediaId: string;
  publishedUrl: string;
  publishedAt: string;
}

const DEFAULT_META_GRAPH_VERSION = 'v21.0';
const DEFAULT_INSTAGRAM_GRAPH_BASE_URL = 'https://graph.instagram.com';
const INSTAGRAM_CAPTION_LIMIT = 2200;

function getParamPlaceholder(index: number): string {
  return `$${index}`;
}

function parseStringArray(value: unknown): string[] {
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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getMetaGraphVersion(): string {
  return process.env.META_GRAPH_API_VERSION ?? DEFAULT_META_GRAPH_VERSION;
}

function getInstagramGraphBaseUrl(): string {
  return process.env.INSTAGRAM_GRAPH_BASE_URL ?? DEFAULT_INSTAGRAM_GRAPH_BASE_URL;
}

function getMetaAccessToken(): string {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN ?? process.env.META_ACCESS_TOKEN;
  if (!token) {
    throw new Error('INSTAGRAM_ACCESS_TOKEN or META_ACCESS_TOKEN is not configured');
  }
  return token;
}

function truncateCaption(text: string): string {
  return text.length > INSTAGRAM_CAPTION_LIMIT
    ? `${text.slice(0, INSTAGRAM_CAPTION_LIMIT - 1)}…`
    : text;
}

function buildCaption(post: PostRow): string {
  const tags = parseStringArray(post.tags)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag.replace(/\s+/g, '')}`))
    .slice(0, 20)
    .join(' ');

  const parts = [post.title, post.content, tags].filter((part) => part && part.trim());
  return truncateCaption(parts.join('\n\n'));
}

function normalizeNumericId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return /^\d+$/.test(normalized) ? normalized : null;
}

function resolveInstagramAccountId(customerInstagramAccount: string | null): string | null {
  const configured = process.env.META_INSTAGRAM_ACCOUNT_ID;
  const configuredId = normalizeNumericId(configured);
  if (configuredId) return configuredId;

  const customerId = normalizeNumericId(customerInstagramAccount);
  if (customerId) return customerId;

  return null;
}

function buildInstagramMediaUrl(mediaId: string): string {
  return `https://www.instagram.com/p/${mediaId}/`;
}

async function getPostById(db: DatabaseClient, postId: string): Promise<PostRow | null> {
  const idPlaceholder = getParamPlaceholder(1);
  const rows = await db.query<PostRow>(
    `SELECT id, customer_id, channel, title, content, tags, images
     FROM posts
     WHERE id = ${idPlaceholder}
     LIMIT 1`,
    [postId],
  );
  return rows.length ? rows[0] : null;
}

async function getCustomerInstagramAccount(
  db: DatabaseClient,
  customerId: string,
): Promise<string | null> {
  const idPlaceholder = getParamPlaceholder(1);
  const rows = await db.query<CustomerRow>(
    `SELECT id, instagram_account
     FROM customers
     WHERE id = ${idPlaceholder}
     LIMIT 1`,
    [customerId],
  );
  if (!rows.length) return null;
  return rows[0].instagram_account ?? null;
}

async function resolveInstagramAccountIdWithFallback(
  customerInstagramAccount: string | null,
): Promise<string> {
  const resolved = resolveInstagramAccountId(customerInstagramAccount);
  if (resolved) {
    return resolved;
  }

  const token = getMetaAccessToken();
  const endpoint = `${getInstagramGraphBaseUrl()}/me?fields=id&access_token=${encodeURIComponent(token)}`;
  const response = await fetch(endpoint);
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`instagram me lookup failed (${response.status}): ${raw}`);
  }

  const data = JSON.parse(raw) as InstagramMeResponse;
  if (!data.id) {
    throw new Error('instagram me lookup response missing id');
  }
  return data.id;
}

async function markPostPublished(
  db: DatabaseClient,
  postId: string,
  publishedUrl: string,
  publishedAt: string,
): Promise<void> {
  const idPlaceholder = getParamPlaceholder(1);
  await db.execute(
    `UPDATE posts
     SET status = 'published', published_url = $2, published_at = $3, updated_at = $3, error_message = NULL
     WHERE id = ${idPlaceholder}`,
    [postId, publishedUrl, publishedAt],
  );
}

async function markPostFailed(db: DatabaseClient, postId: string, errorMessage: string): Promise<void> {
  const idPlaceholder = getParamPlaceholder(1);
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE posts
     SET status = 'failed', error_message = $2, updated_at = $3
     WHERE id = ${idPlaceholder}`,
    [postId, errorMessage, now],
  );
}

async function createInstagramMediaContainer(
  instagramAccountId: string,
  imageUrl: string,
  caption: string,
): Promise<string> {
  const version = getMetaGraphVersion();
  const token = getMetaAccessToken();
  const endpoint = `${getInstagramGraphBaseUrl()}/${version}/${instagramAccountId}/media`;

  const body = new URLSearchParams();
  body.set('image_url', imageUrl);
  body.set('caption', caption);
  body.set('access_token', token);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`instagram media create failed (${response.status}): ${raw}`);
  }

  const data = JSON.parse(raw) as GraphCreateMediaResponse;
  if (!data.id) {
    throw new Error('instagram media create response missing id');
  }
  return data.id;
}

async function publishInstagramContainer(
  instagramAccountId: string,
  creationId: string,
): Promise<string> {
  const version = getMetaGraphVersion();
  const token = getMetaAccessToken();
  const endpoint = `${getInstagramGraphBaseUrl()}/${version}/${instagramAccountId}/media_publish`;

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
    throw new Error(`instagram media publish failed (${response.status}): ${raw}`);
  }

  const data = JSON.parse(raw) as GraphPublishMediaResponse;
  if (!data.id) {
    throw new Error('instagram media publish response missing id');
  }
  return data.id;
}

export async function publishToInstagram(
  db: DatabaseClient,
  postId: string,
): Promise<InstagramPublishResult> {
  const post = await getPostById(db, postId);
  if (!post) {
    throw new Error(`post not found: ${postId}`);
  }
  if (post.channel !== 'instagram') {
    throw new Error(`post ${postId} is not instagram channel`);
  }

  const images = parseStringArray(post.images);
  const firstImageUrl = images[0];
  if (!firstImageUrl) {
    throw new Error(`instagram post ${postId} has no image`);
  }

  const customerInstagramAccount = await getCustomerInstagramAccount(db, post.customer_id);
  const instagramAccountId = await resolveInstagramAccountIdWithFallback(customerInstagramAccount);
  const caption = buildCaption(post);

  try {
    const creationId = await createInstagramMediaContainer(
      instagramAccountId,
      firstImageUrl,
      caption,
    );
    const mediaId = await publishInstagramContainer(instagramAccountId, creationId);
    const publishedAt = new Date().toISOString();
    const publishedUrl = buildInstagramMediaUrl(mediaId);

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
