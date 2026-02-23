import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { AgentTaskType, AgentTaskStatus } from '@marketing-agent/shared';
import type { DatabaseClient } from '../../db';
import { asString, getParamPlaceholder, normalizeForDb, parseJsonObject } from '../../utils/db';

interface AgentTaskRow {
  id: string;
  customer_id: string;
  type: string;
  status: string;
  input: unknown;
  output: unknown;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface AgentTaskRecord {
  id: string;
  customerId: string;
  type: AgentTaskType;
  status: AgentTaskStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

interface AgentTaskPayload {
  customerId?: string;
  type?: AgentTaskType;
  input?: Record<string, unknown>;
}

interface AgentTaskStatusPayload {
  status?: AgentTaskStatus;
  output?: Record<string, unknown>;
  errorMessage?: string;
}

const TASK_TYPES: AgentTaskType[] = [
  'marketing-strategy',
  'schedule-posts',
  'request-content-generation',
  'analyze-performance',
  'competitor-report',
  'donor-report',
];
const TASK_STATUSES: AgentTaskStatus[] = ['pending', 'running', 'completed', 'failed'];

function isValidType(value: unknown): value is AgentTaskType {
  return typeof value === 'string' && TASK_TYPES.includes(value as AgentTaskType);
}

function isValidStatus(value: unknown): value is AgentTaskStatus {
  return typeof value === 'string' && TASK_STATUSES.includes(value as AgentTaskStatus);
}

function toTask(row: AgentTaskRow): AgentTaskRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    type: row.type as AgentTaskType,
    status: row.status as AgentTaskStatus,
    input: parseJsonObject(row.input, true),
    output: parseJsonObject(row.output, true),
    errorMessage: row.error_message ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
  };
}

async function getTaskById(db: DatabaseClient, id: string): Promise<AgentTaskRecord | null> {
  const sql = 'SELECT * FROM agent_tasks WHERE id = $1 LIMIT 1';
  const rows = await db.query<AgentTaskRow>(sql, [id]);
  return rows.length ? toTask(rows[0]) : null;
}

export function createAgentRouter(db: DatabaseClient): Router {
  const router = Router();

  router.get('/tasks', async (req: Request, res: Response) => {
    const filters: string[] = [];
    const params: unknown[] = [];

    const customerId = asString(req.query.customerId);
    const type = asString(req.query.type);
    const status = asString(req.query.status);

    if (customerId) {
      params.push(customerId);
      filters.push(`customer_id = ${getParamPlaceholder(params.length)}`);
    }
    if (type) {
      if (!isValidType(type)) {
        res.status(400).json({ message: 'type is invalid' });
        return;
      }
      params.push(type);
      filters.push(`type = ${getParamPlaceholder(params.length)}`);
    }
    if (status) {
      if (!isValidStatus(status)) {
        res.status(400).json({ message: 'status is invalid' });
        return;
      }
      params.push(status);
      filters.push(`status = ${getParamPlaceholder(params.length)}`);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const limitValue = Math.min(Math.max(1, Number(req.query.limit) || 50), 200);
    const offsetValue = Math.max(0, Number(req.query.offset) || 0);

    const filterParams = [...params];

    params.push(limitValue);
    const limitPlaceholder = getParamPlaceholder(params.length);
    params.push(offsetValue);
    const offsetPlaceholder = getParamPlaceholder(params.length);

    const rows = await db.query<AgentTaskRow>(
      `SELECT * FROM agent_tasks ${whereSql} ORDER BY created_at DESC LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      params,
    );

    const countRows = await db.query<{ total: string }>(
      `SELECT COUNT(*) as total FROM agent_tasks ${whereSql}`,
      filterParams,
    );
    const total = Number(countRows[0]?.total ?? 0);

    res.setHeader('X-Total-Count', String(total));
    res.status(200).json(rows.map(toTask));
  });

  router.get('/tasks/:id', async (req: Request, res: Response) => {
    const task = await getTaskById(db, String(req.params.id));
    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }
    res.status(200).json(task);
  });

  router.post('/tasks', async (req: Request, res: Response) => {
    const payload = req.body as AgentTaskPayload;
    if (!asString(payload.customerId)) {
      res.status(400).json({ message: 'customerId is required' });
      return;
    }
    if (!isValidType(payload.type)) {
      res.status(400).json({ message: 'type is invalid' });
      return;
    }

    const now = new Date().toISOString();
    const taskId = randomUUID();
    const values = [
      taskId,
      String(payload.customerId),
      payload.type,
      'pending',
      normalizeForDb(payload.input ?? {}),
      null,
      null,
      null,
      now,
    ];

    await db.execute(
      `INSERT INTO agent_tasks (
        id, customer_id, type, status, input, output, error_message, started_at, created_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)`,
      values,
    );

    const created = await getTaskById(db, taskId);
    res.status(201).json(created);
  });

  router.patch('/tasks/:id/status', async (req: Request, res: Response) => {
    const taskId = String(req.params.id);
    const current = await getTaskById(db, taskId);
    if (!current) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    const payload = req.body as AgentTaskStatusPayload;
    if (!isValidStatus(payload.status)) {
      res.status(400).json({ message: 'status is invalid' });
      return;
    }

    const now = new Date().toISOString();
    const startedAt = payload.status === 'running' ? current.startedAt ?? now : current.startedAt ?? null;
    const completedAt =
      payload.status === 'completed' || payload.status === 'failed' ? now : current.completedAt ?? null;

    const values = [
      payload.status,
      normalizeForDb(payload.output ?? current.output ?? null),
      payload.errorMessage ?? null,
      startedAt,
      completedAt,
      taskId,
    ];

    await db.execute(
      `UPDATE agent_tasks SET
        status = $1,
        output = $2::jsonb,
        error_message = $3,
        started_at = $4,
        completed_at = $5
      WHERE id = $6`,
      values,
    );

    const updated = await getTaskById(db, taskId);
    res.status(200).json(updated);
  });

  return router;
}
