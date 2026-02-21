import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { DatabaseClient } from '../../db';

type PostChannel = 'naver-blog' | 'instagram' | 'threads' | 'nextjs-blog';
type PostStatus = 'draft' | 'review' | 'approved' | 'publishing' | 'published' | 'failed';

interface Post {
  id: string;
  customerId: string;
  channel: PostChannel;
  status: PostStatus;
  title: string;
  content: string;
  images: string[];
  tags: string[];
  scheduledAt: string;
  publishedAt?: string;
  publishedUrl?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PostRow {
  id: string;
  customer_id: string;
  channel: string;
  status: string;
  title: string;
  content: string;
  images: unknown;
  tags: unknown;
  scheduled_at: string;
  published_at: string | null;
  published_url: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

type PostPayload = Partial<Post>;

const CHANNELS: PostChannel[] = ['naver-blog', 'instagram', 'threads', 'nextjs-blog'];
const STATUSES: PostStatus[] = ['draft', 'review', 'approved', 'publishing', 'published', 'failed'];

const ALLOWED_STATUS_TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  draft: ['review', 'approved', 'failed'],
  review: ['approved', 'failed', 'draft'],
  approved: ['publishing', 'failed'],
  publishing: ['published', 'failed'],
  published: [],
  failed: ['draft', 'approved'],
};

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function toPost(row: PostRow): Post {
  return {
    id: row.id,
    customerId: row.customer_id,
    channel: row.channel as PostChannel,
    status: row.status as PostStatus,
    title: row.title,
    content: row.content,
    images: parseJsonValue<string[]>(row.images, []),
    tags: parseJsonValue<string[]>(row.tags, []),
    scheduledAt: row.scheduled_at,
    publishedAt: row.published_at ?? undefined,
    publishedUrl: row.published_url ?? undefined,
    errorMessage: row.error_message ?? undefined,
    retryCount: Number(row.retry_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeForDb(value: unknown): string {
  return JSON.stringify(value);
}

function isValidChannel(value: unknown): value is PostChannel {
  return typeof value === 'string' && CHANNELS.includes(value as PostChannel);
}

function isValidStatus(value: unknown): value is PostStatus {
  return typeof value === 'string' && STATUSES.includes(value as PostStatus);
}

function validatePostPayload(payload: PostPayload): string | null {
  if (!payload.customerId) return 'customerId is required';
  if (!isValidChannel(payload.channel)) return 'channel is invalid';
  if (!isValidStatus(payload.status)) return 'status is invalid';
  if (!payload.title) return 'title is required';
  if (!payload.content) return 'content is required';
  if (!Array.isArray(payload.images)) return 'images must be an array';
  if (!Array.isArray(payload.tags)) return 'tags must be an array';
  if (!payload.scheduledAt) return 'scheduledAt is required';
  return null;
}

function getParamPlaceholder(dialect: DatabaseClient['dialect'], index: number): string {
  return dialect === 'postgres' ? `$${index}` : '?';
}

async function getPostById(db: DatabaseClient, id: string): Promise<Post | null> {
  const sql =
    db.dialect === 'postgres'
      ? 'SELECT * FROM posts WHERE id = $1 LIMIT 1'
      : 'SELECT * FROM posts WHERE id = ? LIMIT 1';
  const rows = await db.query<PostRow>(sql, [id]);
  return rows.length ? toPost(rows[0]) : null;
}

export function createPostsRouter(db: DatabaseClient): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    const filters: string[] = [];
    const params: unknown[] = [];

    const customerId = asString(req.query.customerId);
    const status = asString(req.query.status);
    const channel = asString(req.query.channel);

    if (customerId) {
      params.push(customerId);
      filters.push(`customer_id = ${getParamPlaceholder(db.dialect, params.length)}`);
    }
    if (status) {
      params.push(status);
      filters.push(`status = ${getParamPlaceholder(db.dialect, params.length)}`);
    }
    if (channel) {
      params.push(channel);
      filters.push(`channel = ${getParamPlaceholder(db.dialect, params.length)}`);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = await db.query<PostRow>(
      `SELECT * FROM posts ${whereSql} ORDER BY scheduled_at DESC, created_at DESC`,
      params,
    );

    res.status(200).json(rows.map(toPost));
  });

  router.get('/:id', async (req: Request, res: Response) => {
    const post = await getPostById(db, String(req.params.id));
    if (!post) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }
    res.status(200).json(post);
  });

  router.post('/', async (req: Request, res: Response) => {
    const payload = req.body as PostPayload;
    const now = new Date().toISOString();
    const post: Post = {
      id: randomUUID(),
      customerId: String(payload.customerId ?? ''),
      channel: payload.channel as PostChannel,
      status: (payload.status as PostStatus) ?? 'draft',
      title: String(payload.title ?? ''),
      content: String(payload.content ?? ''),
      images: Array.isArray(payload.images) ? payload.images : [],
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      scheduledAt: String(payload.scheduledAt ?? ''),
      publishedAt: asString(payload.publishedAt) ?? undefined,
      publishedUrl: asString(payload.publishedUrl) ?? undefined,
      errorMessage: asString(payload.errorMessage) ?? undefined,
      retryCount: typeof payload.retryCount === 'number' ? payload.retryCount : 0,
      createdAt: now,
      updatedAt: now,
    };

    const validationError = validatePostPayload(post);
    if (validationError) {
      res.status(400).json({ message: validationError });
      return;
    }

    const values = [
      post.id,
      post.customerId,
      post.channel,
      post.status,
      post.title,
      post.content,
      normalizeForDb(post.images),
      normalizeForDb(post.tags),
      post.scheduledAt,
      post.publishedAt ?? null,
      post.publishedUrl ?? null,
      post.errorMessage ?? null,
      post.retryCount,
      post.createdAt,
      post.updatedAt,
    ];

    if (db.dialect === 'postgres') {
      await db.execute(
        `INSERT INTO posts (
          id, customer_id, channel, status, title, content, images, tags, scheduled_at,
          published_at, published_url, error_message, retry_count, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9,
          $10, $11, $12, $13, $14, $15
        )`,
        values,
      );
    } else {
      await db.execute(
        `INSERT INTO posts (
          id, customer_id, channel, status, title, content, images, tags, scheduled_at,
          published_at, published_url, error_message, retry_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values,
      );
    }

    const created = await getPostById(db, post.id);
    res.status(201).json(created);
  });

  router.put('/:id', async (req: Request, res: Response) => {
    const targetId = String(req.params.id);
    const existing = await getPostById(db, targetId);
    if (!existing) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }

    const payload = req.body as PostPayload;
    const updated: Post = {
      ...existing,
      ...payload,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };

    const validationError = validatePostPayload(updated);
    if (validationError) {
      res.status(400).json({ message: validationError });
      return;
    }

    const values = [
      updated.customerId,
      updated.channel,
      updated.status,
      updated.title,
      updated.content,
      normalizeForDb(updated.images),
      normalizeForDb(updated.tags),
      updated.scheduledAt,
      updated.publishedAt ?? null,
      updated.publishedUrl ?? null,
      updated.errorMessage ?? null,
      updated.retryCount,
      updated.updatedAt,
      targetId,
    ];

    if (db.dialect === 'postgres') {
      await db.execute(
        `UPDATE posts SET
          customer_id = $1,
          channel = $2,
          status = $3,
          title = $4,
          content = $5,
          images = $6::jsonb,
          tags = $7::jsonb,
          scheduled_at = $8,
          published_at = $9,
          published_url = $10,
          error_message = $11,
          retry_count = $12,
          updated_at = $13
        WHERE id = $14`,
        values,
      );
    } else {
      await db.execute(
        `UPDATE posts SET
          customer_id = ?,
          channel = ?,
          status = ?,
          title = ?,
          content = ?,
          images = ?,
          tags = ?,
          scheduled_at = ?,
          published_at = ?,
          published_url = ?,
          error_message = ?,
          retry_count = ?,
          updated_at = ?
        WHERE id = ?`,
        values,
      );
    }

    const result = await getPostById(db, targetId);
    res.status(200).json(result);
  });

  router.patch('/:id/status', async (req: Request, res: Response) => {
    const targetId = String(req.params.id);
    const existing = await getPostById(db, targetId);
    if (!existing) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }

    const nextStatus = req.body?.status as unknown;
    if (!isValidStatus(nextStatus)) {
      res.status(400).json({ message: 'status is invalid' });
      return;
    }

    const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(nextStatus)) {
      res.status(400).json({
        message: `Invalid status transition: ${existing.status} -> ${nextStatus}`,
      });
      return;
    }

    const updatedAt = new Date().toISOString();
    const publishedAt =
      nextStatus === 'published'
        ? asString(req.body?.publishedAt) ?? new Date().toISOString()
        : existing.publishedAt ?? null;
    const publishedUrl = asString(req.body?.publishedUrl) ?? existing.publishedUrl ?? null;
    const errorMessage = asString(req.body?.errorMessage) ?? null;

    const values = [nextStatus, publishedAt, publishedUrl, errorMessage, updatedAt, targetId];
    const sql =
      db.dialect === 'postgres'
        ? `UPDATE posts
           SET status = $1, published_at = $2, published_url = $3, error_message = $4, updated_at = $5
           WHERE id = $6`
        : `UPDATE posts
           SET status = ?, published_at = ?, published_url = ?, error_message = ?, updated_at = ?
           WHERE id = ?`;
    await db.execute(sql, values);

    const result = await getPostById(db, targetId);
    res.status(200).json(result);
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    const targetId = String(req.params.id);
    const existing = await getPostById(db, targetId);
    if (!existing) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }

    const sql = db.dialect === 'postgres' ? 'DELETE FROM posts WHERE id = $1' : 'DELETE FROM posts WHERE id = ?';
    await db.execute(sql, [targetId]);
    res.status(204).send();
  });

  return router;
}
