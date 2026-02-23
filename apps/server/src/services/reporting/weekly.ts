import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../db';
import type { CompetitorSource } from '../monitoring/competitor';
import { monitorCompetitors } from '../monitoring/competitor';
import { analyzePublishingStats } from '../monitoring/publishing-stats';
import { formatReport, type FormattedReport } from './formatter';

type PostChannel = 'naver-blog' | 'instagram' | 'threads' | 'nextjs-blog';

interface StatsRow {
  channel: string;
  status: string;
  count: number;
}

interface ChannelStats {
  channel: PostChannel;
  totalPosts: number;
  successCount: number;
  failCount: number;
}

interface CompetitorActivity {
  competitorName: string;
  newPosts: number;
  topKeywords: string[];
}

export interface MarketingWeeklyReportPayload {
  id: string;
  customerId: string;
  type: 'marketing-weekly';
  periodStart: string;
  periodEnd: string;
  channelStats: ChannelStats[];
  competitors: CompetitorActivity[];
  summary: string;
  createdAt: string;
}

export interface CreateWeeklyReportInput {
  customerId: string;
  periodStart?: string;
  periodEnd?: string;
  competitors?: CompetitorSource[];
}

export interface WeeklyReportResult {
  report: MarketingWeeklyReportPayload;
  formatted: FormattedReport;
}

function getParamPlaceholder(index: number): string {
  return `$${index}`;
}

function resolvePeriod(input?: Pick<CreateWeeklyReportInput, 'periodStart' | 'periodEnd'>): {
  periodStart: string;
  periodEnd: string;
} {
  const periodEnd = input?.periodEnd ?? new Date().toISOString();
  if (input?.periodStart) {
    return { periodStart: input.periodStart, periodEnd };
  }
  const start = new Date(periodEnd);
  start.setUTCDate(start.getUTCDate() - 7);
  return { periodStart: start.toISOString(), periodEnd };
}

async function loadChannelStats(
  db: DatabaseClient,
  customerId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ChannelStats[]> {
  const rows = await db.query<StatsRow>(
    `SELECT channel, status, COUNT(*) as count
     FROM posts
     WHERE customer_id = ${getParamPlaceholder(1)}
       AND created_at >= ${getParamPlaceholder(2)}
       AND created_at <= ${getParamPlaceholder(3)}
     GROUP BY channel, status`,
    [customerId, periodStart, periodEnd],
  );

  const allChannels: PostChannel[] = ['naver-blog', 'instagram', 'threads', 'nextjs-blog'];
  const table = new Map<PostChannel, { totalPosts: number; successCount: number; failCount: number }>();
  for (const channel of allChannels) {
    table.set(channel, { totalPosts: 0, successCount: 0, failCount: 0 });
  }

  for (const row of rows) {
    const channel = row.channel as PostChannel;
    if (!table.has(channel)) {
      continue;
    }
    const count = Number(row.count ?? 0);
    const current = table.get(channel);
    if (!current) {
      continue;
    }
    current.totalPosts += count;
    if (row.status === 'published') {
      current.successCount += count;
    }
    if (row.status === 'failed') {
      current.failCount += count;
    }
  }

  return allChannels.map((channel) => ({
    channel,
    ...table.get(channel)!,
  }));
}

function buildSummaryText(
  channelStats: ChannelStats[],
  insights: string[],
  recommendations: string[],
): string {
  const totalPosts = channelStats.reduce((sum, stat) => sum + stat.totalPosts, 0);
  const totalSuccess = channelStats.reduce((sum, stat) => sum + stat.successCount, 0);
  const totalFail = channelStats.reduce((sum, stat) => sum + stat.failCount, 0);
  const successRate = totalPosts > 0 ? Math.round((totalSuccess / totalPosts) * 10000) / 100 : 0;

  const topVolumeChannel = [...channelStats].sort((a, b) => b.totalPosts - a.totalPosts)[0];
  const parts = [
    `주간 발행 ${totalPosts}건 (성공 ${totalSuccess} / 실패 ${totalFail}), 성공률 ${successRate}%`,
    `최다 운영 채널: ${topVolumeChannel.channel} (${topVolumeChannel.totalPosts}건)`,
    insights[0],
    recommendations[0],
  ].filter((item): item is string => Boolean(item));

  return parts.join(' | ');
}

async function insertReport(db: DatabaseClient, report: MarketingWeeklyReportPayload): Promise<void> {
  const payload = JSON.stringify({
    channelStats: report.channelStats,
    competitors: report.competitors,
    summary: report.summary,
  });

  await db.execute(
    `INSERT INTO reports (
      id, customer_id, type, period_start, period_end, payload, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [report.id, report.customerId, report.type, report.periodStart, report.periodEnd, payload, report.createdAt],
  );
}

export async function createWeeklyMarketingReport(
  db: DatabaseClient,
  input: CreateWeeklyReportInput,
): Promise<WeeklyReportResult> {
  const { periodStart, periodEnd } = resolvePeriod(input);
  const createdAt = new Date().toISOString();
  const customerId = input.customerId;

  const [channelStats, publishingStats, competitorResult] = await Promise.all([
    loadChannelStats(db, customerId, periodStart, periodEnd),
    analyzePublishingStats(db, customerId, periodStart, periodEnd),
    monitorCompetitors(db, customerId, input.competitors ?? [], periodStart, periodEnd),
  ]);

  const competitors: CompetitorActivity[] = competitorResult.competitors.map((item) => ({
    competitorName: item.name,
    newPosts: item.newPosts,
    topKeywords: item.recentTopics.slice(0, 5),
  }));

  const report: MarketingWeeklyReportPayload = {
    id: randomUUID(),
    customerId,
    type: 'marketing-weekly',
    periodStart,
    periodEnd,
    channelStats,
    competitors,
    summary: buildSummaryText(channelStats, publishingStats.insights, publishingStats.recommendations),
    createdAt,
  };

  await insertReport(db, report);

  return {
    report,
    formatted: formatReport(report),
  };
}
