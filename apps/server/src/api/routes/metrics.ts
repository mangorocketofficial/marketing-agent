import { Router, type Request, type Response } from 'express';
import type { DatabaseClient } from '../../db';
import { asString } from '../../utils/db';
import { collectRecentMetrics, getMetricsSummary } from '../../services/metrics/collector';

export function createMetricsRouter(db: DatabaseClient): Router {
  const router = Router();

  router.get('/summary', async (req: Request, res: Response) => {
    const customerId = asString(req.query.customerId);
    const days = Number(req.query.days);
    const summary = await getMetricsSummary(db, {
      customerId: customerId ?? undefined,
      days: Number.isFinite(days) ? days : undefined,
    });
    res.status(200).json(summary);
  });

  router.post('/collect', async (req: Request, res: Response) => {
    const limit = Number(req.body?.limit);
    const collected = await collectRecentMetrics(db, {
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    res.status(200).json({ collected });
  });

  return router;
}
