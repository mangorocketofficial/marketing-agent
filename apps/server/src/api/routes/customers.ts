import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { DatabaseClient } from '../../db';

type OrganizationType =
  | 'environment'
  | 'education'
  | 'human-rights'
  | 'animal'
  | 'welfare'
  | 'health'
  | 'culture'
  | 'community'
  | 'international'
  | 'other';

interface PostingSchedule {
  channels: string[];
  postsPerDay: number;
  preferredHours: number[];
  daysOfWeek: number[];
}

interface Customer {
  id: string;
  name: string;
  organizationType: OrganizationType;
  description: string;
  mission: string;
  keywords: string[];
  location: string;
  schedule: PostingSchedule;
  naverBlogId?: string;
  instagramAccount?: string;
  threadsAccount?: string;
  blogUrl?: string;
  telegramChatId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CustomerRow {
  id: string;
  name: string;
  organization_type: string;
  description: string;
  mission: string;
  keywords: unknown;
  location: string;
  schedule: unknown;
  naver_blog_id: string | null;
  instagram_account: string | null;
  threads_account: string | null;
  blog_url: string | null;
  telegram_chat_id: string | null;
  is_active: boolean | number;
  created_at: string;
  updated_at: string;
}

type CustomerPayload = Partial<
  Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> & {
    id: string;
    createdAt: string;
    updatedAt: string;
  }
>;

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

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    organizationType: row.organization_type as OrganizationType,
    description: row.description,
    mission: row.mission,
    keywords: parseJsonValue<string[]>(row.keywords, []),
    location: row.location,
    schedule: parseJsonValue<PostingSchedule>(row.schedule, {
      channels: [],
      postsPerDay: 1,
      preferredHours: [],
      daysOfWeek: [],
    }),
    naverBlogId: row.naver_blog_id ?? undefined,
    instagramAccount: row.instagram_account ?? undefined,
    threadsAccount: row.threads_account ?? undefined,
    blogUrl: row.blog_url ?? undefined,
    telegramChatId: row.telegram_chat_id ?? undefined,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isValidSchedule(value: unknown): value is PostingSchedule {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const parsed = value as PostingSchedule;
  return (
    Array.isArray(parsed.channels) &&
    typeof parsed.postsPerDay === 'number' &&
    Array.isArray(parsed.preferredHours) &&
    Array.isArray(parsed.daysOfWeek)
  );
}

function validateCreatePayload(payload: CustomerPayload): string | null {
  if (!payload.name) return 'name is required';
  if (!payload.organizationType) return 'organizationType is required';
  if (!payload.description) return 'description is required';
  if (!payload.mission) return 'mission is required';
  if (!Array.isArray(payload.keywords)) return 'keywords must be an array';
  if (!payload.location) return 'location is required';
  if (!isValidSchedule(payload.schedule)) return 'schedule is invalid';
  return null;
}

function normalizeForDb(db: DatabaseClient, value: unknown): unknown {
  return db.dialect === 'sqlite' ? JSON.stringify(value) : JSON.stringify(value);
}

async function getCustomerById(db: DatabaseClient, id: string): Promise<Customer | null> {
  const sql =
    db.dialect === 'postgres'
      ? 'SELECT * FROM customers WHERE id = $1 LIMIT 1'
      : 'SELECT * FROM customers WHERE id = ? LIMIT 1';
  const rows = await db.query<CustomerRow>(sql, [id]);
  if (!rows.length) {
    return null;
  }
  return toCustomer(rows[0]);
}

export function createCustomersRouter(db: DatabaseClient): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    const rows = await db.query<CustomerRow>('SELECT * FROM customers ORDER BY created_at DESC');
    res.status(200).json(rows.map(toCustomer));
  });

  router.get('/:id', async (req: Request, res: Response) => {
    const customer = await getCustomerById(db, String(req.params.id));
    if (!customer) {
      res.status(404).json({ message: 'Customer not found' });
      return;
    }
    res.status(200).json(customer);
  });

  router.post('/', async (req: Request, res: Response) => {
    const payload = req.body as CustomerPayload;
    const validationError = validateCreatePayload(payload);

    if (validationError) {
      res.status(400).json({ message: validationError });
      return;
    }

    const now = new Date().toISOString();
    const id = randomUUID();

    const values = [
      id,
      payload.name,
      payload.organizationType,
      payload.description,
      payload.mission,
      normalizeForDb(db, payload.keywords),
      payload.location,
      normalizeForDb(db, payload.schedule),
      payload.naverBlogId ?? null,
      payload.instagramAccount ?? null,
      payload.threadsAccount ?? null,
      payload.blogUrl ?? null,
      payload.telegramChatId ?? null,
      payload.isActive ?? true,
      now,
      now,
    ];

    if (db.dialect === 'postgres') {
      await db.execute(
        `INSERT INTO customers (
          id, name, organization_type, description, mission, keywords, location, schedule,
          naver_blog_id, instagram_account, threads_account, blog_url, telegram_chat_id,
          is_active, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb,
          $9, $10, $11, $12, $13, $14, $15, $16
        )`,
        values,
      );
    } else {
      await db.execute(
        `INSERT INTO customers (
          id, name, organization_type, description, mission, keywords, location, schedule,
          naver_blog_id, instagram_account, threads_account, blog_url, telegram_chat_id,
          is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values,
      );
    }

    const created = await getCustomerById(db, id);
    res.status(201).json(created);
  });

  router.put('/:id', async (req: Request, res: Response) => {
    const targetId = String(req.params.id);
    const current = await getCustomerById(db, targetId);
    if (!current) {
      res.status(404).json({ message: 'Customer not found' });
      return;
    }

    const payload = req.body as CustomerPayload;
    const updated: Customer = {
      ...current,
      ...payload,
      id: current.id,
      updatedAt: new Date().toISOString(),
    };

    const validationError = validateCreatePayload(updated);
    if (validationError) {
      res.status(400).json({ message: validationError });
      return;
    }

    const values = [
      updated.name,
      updated.organizationType,
      updated.description,
      updated.mission,
      normalizeForDb(db, updated.keywords),
      updated.location,
      normalizeForDb(db, updated.schedule),
      updated.naverBlogId ?? null,
      updated.instagramAccount ?? null,
      updated.threadsAccount ?? null,
      updated.blogUrl ?? null,
      updated.telegramChatId ?? null,
      updated.isActive,
      updated.updatedAt,
      targetId,
    ];

    if (db.dialect === 'postgres') {
      await db.execute(
        `UPDATE customers SET
          name = $1,
          organization_type = $2,
          description = $3,
          mission = $4,
          keywords = $5::jsonb,
          location = $6,
          schedule = $7::jsonb,
          naver_blog_id = $8,
          instagram_account = $9,
          threads_account = $10,
          blog_url = $11,
          telegram_chat_id = $12,
          is_active = $13,
          updated_at = $14
        WHERE id = $15`,
        values,
      );
    } else {
      await db.execute(
        `UPDATE customers SET
          name = ?,
          organization_type = ?,
          description = ?,
          mission = ?,
          keywords = ?,
          location = ?,
          schedule = ?,
          naver_blog_id = ?,
          instagram_account = ?,
          threads_account = ?,
          blog_url = ?,
          telegram_chat_id = ?,
          is_active = ?,
          updated_at = ?
        WHERE id = ?`,
        values,
      );
    }

    const result = await getCustomerById(db, targetId);
    res.status(200).json(result);
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    const targetId = String(req.params.id);
    const customer = await getCustomerById(db, targetId);

    if (!customer) {
      res.status(404).json({ message: 'Customer not found' });
      return;
    }

    const sql = db.dialect === 'postgres' ? 'DELETE FROM customers WHERE id = $1' : 'DELETE FROM customers WHERE id = ?';
    await db.execute(sql, [targetId]);
    res.status(204).send();
  });

  return router;
}
