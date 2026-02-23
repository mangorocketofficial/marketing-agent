import { Router, type Request, type Response } from 'express';
import type { DatabaseClient } from '../../db';

type ReportType = 'marketing-daily' | 'marketing-weekly';

interface ReportRow {
  id: string;
  customer_id: string;
  type: string;
  period_start: string;
  period_end: string;
  payload: unknown;
  created_at: string;
}

interface ReportRecord {
  id: string;
  customerId: string;
  type: ReportType;
  periodStart: string;
  periodEnd: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

const REPORT_TYPES: ReportType[] = ['marketing-daily', 'marketing-weekly'];

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isValidReportType(value: unknown): value is ReportType {
  return typeof value === 'string' && REPORT_TYPES.includes(value as ReportType);
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toReport(row: ReportRow): ReportRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    type: row.type as ReportType,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    payload: parsePayload(row.payload),
    createdAt: row.created_at,
  };
}

function getParamPlaceholder(index: number): string {
  return `$${index}`;
}

async function getReportById(db: DatabaseClient, id: string): Promise<ReportRecord | null> {
  const sql = 'SELECT * FROM reports WHERE id = $1 LIMIT 1';
  const rows = await db.query<ReportRow>(sql, [id]);
  return rows.length ? toReport(rows[0]) : null;
}

export function createReportsRouter(db: DatabaseClient): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    const filters: string[] = [];
    const params: unknown[] = [];

    const customerId = asString(req.query.customerId);
    const type = asString(req.query.type);
    const periodStart = asString(req.query.periodStart);
    const periodEnd = asString(req.query.periodEnd);

    if (customerId) {
      params.push(customerId);
      filters.push(`customer_id = ${getParamPlaceholder(params.length)}`);
    }
    if (type) {
      if (!isValidReportType(type)) {
        res.status(400).json({ message: 'type is invalid' });
        return;
      }
      params.push(type);
      filters.push(`type = ${getParamPlaceholder(params.length)}`);
    }
    if (periodStart) {
      params.push(periodStart);
      filters.push(`period_start >= ${getParamPlaceholder(params.length)}`);
    }
    if (periodEnd) {
      params.push(periodEnd);
      filters.push(`period_end <= ${getParamPlaceholder(params.length)}`);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = await db.query<ReportRow>(
      `SELECT * FROM reports ${whereSql} ORDER BY period_end DESC, created_at DESC`,
      params,
    );

    res.status(200).json(rows.map(toReport));
  });

  router.get('/latest', async (req: Request, res: Response) => {
    const filters: string[] = [];
    const params: unknown[] = [];

    const customerId = asString(req.query.customerId);
    const type = asString(req.query.type);

    if (customerId) {
      params.push(customerId);
      filters.push(`customer_id = ${getParamPlaceholder(params.length)}`);
    }
    if (type) {
      if (!isValidReportType(type)) {
        res.status(400).json({ message: 'type is invalid' });
        return;
      }
      params.push(type);
      filters.push(`type = ${getParamPlaceholder(params.length)}`);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = await db.query<ReportRow>(
      `SELECT * FROM reports ${whereSql} ORDER BY period_end DESC, created_at DESC LIMIT 1`,
      params,
    );
    if (!rows.length) {
      res.status(404).json({ message: 'Report not found' });
      return;
    }

    res.status(200).json(toReport(rows[0]));
  });

  router.get('/:id', async (req: Request, res: Response) => {
    const report = await getReportById(db, String(req.params.id));
    if (!report) {
      res.status(404).json({ message: 'Report not found' });
      return;
    }
    res.status(200).json(report);
  });

  return router;
}
