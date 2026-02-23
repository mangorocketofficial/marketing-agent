import type { DatabaseClient } from '../../db';
import { getParamPlaceholder } from '../../utils/db';
import { updateVectorPerformanceForPost } from '../content/rag';

interface PublishedPostRow {
  id: string;
  channel: string;
  content: string;
  tags: unknown;
}

interface MetricRow {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
}

interface CollectMetricsInput {
  postId: string;
  channel: string;
}

function toNumber(value: unknown): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function parseTagCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

function inferSyntheticMetrics(row: PublishedPostRow): MetricRow {
  const contentLength = row.content.length;
  const tagCount = parseTagCount(row.tags);

  const impressions = Math.max(100, Math.round(contentLength * 2 + tagCount * 35));
  const likes = Math.max(3, Math.round(impressions * 0.06));
  const comments = Math.max(0, Math.round(likes * 0.16));
  const shares = Math.max(0, Math.round(likes * 0.08));
  const saves = Math.max(0, Math.round(likes * 0.11));
  const clicks = Math.max(0, Math.round(impressions * 0.03));

  return { impressions, likes, comments, shares, saves, clicks };
}

function scoreMetric(metric: MetricRow): number {
  return (
    metric.likes * 1 +
    metric.comments * 3 +
    metric.shares * 4 +
    metric.saves * 2 +
    metric.clicks * 1
  );
}

function classifyPerformance(metric: MetricRow): 'high' | 'medium' | 'low' {
  const score = scoreMetric(metric);
  if (score >= 120) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

async function getPublishedPostById(db: DatabaseClient, postId: string): Promise<PublishedPostRow | null> {
  const idPlaceholder = getParamPlaceholder(1);
  const rows = await db.query<PublishedPostRow>(
    `SELECT id, channel, content, tags
     FROM posts
     WHERE id = ${idPlaceholder} AND status = 'published'
     LIMIT 1`,
    [postId],
  );
  return rows.length ? rows[0] : null;
}

async function insertMetric(
  db: DatabaseClient,
  postId: string,
  channel: string,
  metric: MetricRow,
): Promise<void> {
  const now = new Date().toISOString();

  const updated = await db.query<{ id: string }>(
    `UPDATE post_metrics
     SET channel = $2,
         impressions = $3,
         likes = $4,
         comments = $5,
         shares = $6,
         saves = $7,
         clicks = $8,
         collected_at = $9
     WHERE post_id = $1
     RETURNING id`,
    [
      postId,
      channel,
      metric.impressions,
      metric.likes,
      metric.comments,
      metric.shares,
      metric.saves,
      metric.clicks,
      now,
    ],
  );
  if (updated.length > 0) {
    return;
  }

  await db.execute(
    `INSERT INTO post_metrics (
      post_id, channel, impressions, likes, comments, shares, saves, clicks, collected_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      postId,
      channel,
      metric.impressions,
      metric.likes,
      metric.comments,
      metric.shares,
      metric.saves,
      metric.clicks,
      now,
    ],
  );
}

export async function collectMetricsForPost(
  db: DatabaseClient,
  input: CollectMetricsInput,
): Promise<boolean> {
  const post = await getPublishedPostById(db, input.postId);
  if (!post) return false;

  // Channel API adapters can be plugged in later. For now we keep deterministic synthetic metrics.
  const metric = inferSyntheticMetrics(post);
  await insertMetric(db, post.id, input.channel, metric);
  await updateVectorPerformanceForPost(db, post.id, classifyPerformance(metric));
  return true;
}

export async function collectRecentMetrics(
  db: DatabaseClient,
  options: { limit?: number } = {},
): Promise<number> {
  const limit = Math.max(1, Math.min(500, options.limit ?? 100));
  const limitPlaceholder = getParamPlaceholder(1);
  const rows = await db.query<Array<Pick<PublishedPostRow, 'id' | 'channel'>>[number]>(
    `SELECT id, channel
     FROM posts
     WHERE status = 'published'
     ORDER BY published_at DESC, updated_at DESC
     LIMIT ${limitPlaceholder}`,
    [limit],
  );

  let collected = 0;
  for (const row of rows) {
    const ok = await collectMetricsForPost(db, { postId: row.id, channel: row.channel });
    if (ok) collected += 1;
  }
  return collected;
}

export async function getMetricsSummary(
  db: DatabaseClient,
  filters: { customerId?: string; days?: number } = {},
): Promise<{
  totals: MetricRow & { postCount: number };
  byChannel: Array<{ channel: string; postCount: number } & MetricRow>;
}> {
  const days = Math.max(1, Math.min(90, filters.days ?? 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const params: unknown[] = [since];
  const whereParts = ['lm.collected_at >= ' + getParamPlaceholder(params.length)];
  if (filters.customerId) {
    params.push(filters.customerId);
    whereParts.push(`p.customer_id = ${getParamPlaceholder(params.length)}`);
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const totalsRows = await db.query<{
    post_count: number;
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
  }>(
    `WITH latest_metrics AS (
       SELECT DISTINCT ON (post_id)
         post_id,
         channel,
         impressions,
         likes,
         comments,
         shares,
         saves,
         clicks,
         collected_at
       FROM post_metrics
       ORDER BY post_id, collected_at DESC
     )
     SELECT
      COUNT(DISTINCT lm.post_id) AS post_count,
      COALESCE(SUM(lm.impressions), 0) AS impressions,
      COALESCE(SUM(lm.likes), 0) AS likes,
      COALESCE(SUM(lm.comments), 0) AS comments,
      COALESCE(SUM(lm.shares), 0) AS shares,
      COALESCE(SUM(lm.saves), 0) AS saves,
      COALESCE(SUM(lm.clicks), 0) AS clicks
     FROM latest_metrics lm
     JOIN posts p ON p.id = lm.post_id
     ${whereSql}`,
    params,
  );

  const channelRows = await db.query<{
    channel: string;
    post_count: number;
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
  }>(
    `WITH latest_metrics AS (
       SELECT DISTINCT ON (post_id)
         post_id,
         channel,
         impressions,
         likes,
         comments,
         shares,
         saves,
         clicks,
         collected_at
       FROM post_metrics
       ORDER BY post_id, collected_at DESC
     )
     SELECT
      lm.channel AS channel,
      COUNT(DISTINCT lm.post_id) AS post_count,
      COALESCE(SUM(lm.impressions), 0) AS impressions,
      COALESCE(SUM(lm.likes), 0) AS likes,
      COALESCE(SUM(lm.comments), 0) AS comments,
      COALESCE(SUM(lm.shares), 0) AS shares,
      COALESCE(SUM(lm.saves), 0) AS saves,
      COALESCE(SUM(lm.clicks), 0) AS clicks
     FROM latest_metrics lm
     JOIN posts p ON p.id = lm.post_id
     ${whereSql}
     GROUP BY lm.channel
     ORDER BY impressions DESC`,
    params,
  );

  const total = totalsRows[0] ?? {
    post_count: 0,
    impressions: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    clicks: 0,
  };

  return {
    totals: {
      postCount: toNumber(total.post_count),
      impressions: toNumber(total.impressions),
      likes: toNumber(total.likes),
      comments: toNumber(total.comments),
      shares: toNumber(total.shares),
      saves: toNumber(total.saves),
      clicks: toNumber(total.clicks),
    },
    byChannel: channelRows.map((row) => ({
      channel: row.channel,
      postCount: toNumber(row.post_count),
      impressions: toNumber(row.impressions),
      likes: toNumber(row.likes),
      comments: toNumber(row.comments),
      shares: toNumber(row.shares),
      saves: toNumber(row.saves),
      clicks: toNumber(row.clicks),
    })),
  };
}
