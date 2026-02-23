import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../db';

type PostChannel = 'naver-blog' | 'instagram' | 'threads' | 'nextjs-blog';

interface PostStatsRow {
  channel: string;
  status: string;
  count: number;
}

interface ChannelPerformance {
  channel: PostChannel;
  postCount: number;
  successRate: number;
}

export interface PublishingStatsResult {
  id: string;
  customerId: string;
  periodStart: string;
  periodEnd: string;
  channels: ChannelPerformance[];
  insights: string[];
  recommendations: string[];
  createdAt: string;
}

const ALL_CHANNELS: PostChannel[] = ['naver-blog', 'instagram', 'threads', 'nextjs-blog'];

function getParamPlaceholder(index: number): string {
  return `$${index}`;
}

function normalizeChannel(value: string): PostChannel | null {
  if (value === 'naver-blog' || value === 'instagram' || value === 'threads' || value === 'nextjs-blog') {
    return value;
  }
  return null;
}

function round(value: number, digits = 2): number {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

async function loadPostStats(
  db: DatabaseClient,
  customerId: string,
  periodStart: string,
  periodEnd: string,
): Promise<PostStatsRow[]> {
  const customerPlaceholder = getParamPlaceholder(1);
  const startPlaceholder = getParamPlaceholder(2);
  const endPlaceholder = getParamPlaceholder(3);

  return db.query<PostStatsRow>(
    `SELECT channel, status, COUNT(*) as count
     FROM posts
     WHERE customer_id = ${customerPlaceholder}
       AND created_at >= ${startPlaceholder}
       AND created_at <= ${endPlaceholder}
     GROUP BY channel, status`,
    [customerId, periodStart, periodEnd],
  );
}

function buildChannelPerformance(rows: PostStatsRow[]): ChannelPerformance[] {
  const map = new Map<PostChannel, { total: number; success: number }>();
  for (const channel of ALL_CHANNELS) {
    map.set(channel, { total: 0, success: 0 });
  }

  for (const row of rows) {
    const channel = normalizeChannel(row.channel);
    if (!channel) continue;
    const stats = map.get(channel);
    if (!stats) continue;

    const count = Number(row.count ?? 0);
    stats.total += count;
    if (row.status === 'published') {
      stats.success += count;
    }
  }

  return [...map.entries()].map(([channel, stats]) => ({
    channel,
    postCount: stats.total,
    successRate: stats.total > 0 ? round(stats.success / stats.total, 4) : 0,
  }));
}

function buildInsights(channels: ChannelPerformance[]): string[] {
  const insights: string[] = [];
  const activeChannels = channels.filter((channel) => channel.postCount > 0);
  if (!activeChannels.length) {
    return ['분석 기간 내 발행 데이터가 없어 성과 인사이트를 도출할 수 없습니다.'];
  }

  const bestChannel = [...activeChannels].sort((a, b) => b.successRate - a.successRate)[0];
  const weakChannel = [...activeChannels].sort((a, b) => a.successRate - b.successRate)[0];
  const topVolumeChannel = [...activeChannels].sort((a, b) => b.postCount - a.postCount)[0];

  insights.push(`가장 안정적인 채널은 ${bestChannel.channel}이며 발행 성공률은 ${round(bestChannel.successRate * 100)}%입니다.`);
  insights.push(`가장 개선이 필요한 채널은 ${weakChannel.channel}이며 발행 성공률은 ${round(weakChannel.successRate * 100)}%입니다.`);
  insights.push(`가장 많이 운영된 채널은 ${topVolumeChannel.channel}이며 총 ${topVolumeChannel.postCount}건이 집계되었습니다.`);
  return insights;
}

function buildRecommendations(channels: ChannelPerformance[]): string[] {
  const recommendations: string[] = [];
  for (const channel of channels) {
    if (channel.postCount === 0) {
      recommendations.push(`${channel.channel} 채널은 실험 포스팅을 최소 1건 이상 배치해 초기 반응 데이터를 확보하세요.`);
      continue;
    }
    if (channel.successRate < 0.8) {
      recommendations.push(`${channel.channel} 채널의 발행 실패 원인을 점검하고 재시도 정책/토큰 상태를 검증하세요.`);
      continue;
    }
    recommendations.push(`${channel.channel} 채널은 현재 안정적이므로 게시 빈도와 소재 다양화를 통해 성과를 확장하세요.`);
  }
  return recommendations;
}

export async function analyzePublishingStats(
  db: DatabaseClient,
  customerId: string,
  periodStart: string,
  periodEnd: string,
): Promise<PublishingStatsResult> {
  const statsRows = await loadPostStats(db, customerId, periodStart, periodEnd);
  const channels = buildChannelPerformance(statsRows);
  const insights = buildInsights(channels);
  const recommendations = buildRecommendations(channels);

  return {
    id: randomUUID(),
    customerId,
    periodStart,
    periodEnd,
    channels,
    insights,
    recommendations,
    createdAt: new Date().toISOString(),
  };
}

// Backward-compatible alias for existing callers.
export const analyzePerformance = analyzePublishingStats;
