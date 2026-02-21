import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../db';

type PostChannel = 'naver-blog' | 'instagram' | 'threads' | 'nextjs-blog';

export interface CompetitorSource {
  name: string;
  customerId: string;
}

export interface CompetitorActivitySnapshot {
  name: string;
  newPosts: number;
  recentTopics: string[];
  activeChannels: PostChannel[];
}

export interface CompetitorMonitorResult {
  id: string;
  customerId: string;
  analyzedAt: string;
  competitors: CompetitorActivitySnapshot[];
}

interface PostRow {
  title: string;
  tags: unknown;
  channel: string;
}

function getParamPlaceholder(dialect: DatabaseClient['dialect'], index: number): string {
  return dialect === 'postgres' ? `$${index}` : '?';
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

function toTopKeywords(rows: PostRow[], limit = 5): string[] {
  const counter = new Map<string, number>();
  for (const row of rows) {
    for (const tag of parseStringArray(row.tags)) {
      const normalized = tag.toLowerCase().trim();
      if (!normalized) continue;
      counter.set(normalized, (counter.get(normalized) ?? 0) + 1);
    }
  }
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword]) => keyword);
}

function toRecentTopics(rows: PostRow[], limit = 5): string[] {
  const titles = rows
    .map((row) => row.title.trim())
    .filter((title) => title.length > 0);
  return titles.slice(0, limit);
}

function toActiveChannels(rows: PostRow[]): PostChannel[] {
  const set = new Set<PostChannel>();
  for (const row of rows) {
    const channel = row.channel as PostChannel;
    if (
      channel === 'naver-blog' ||
      channel === 'instagram' ||
      channel === 'threads' ||
      channel === 'nextjs-blog'
    ) {
      set.add(channel);
    }
  }
  return [...set];
}

async function loadPostsInRange(
  db: DatabaseClient,
  customerId: string,
  periodStart: string,
  periodEnd: string,
): Promise<PostRow[]> {
  const customerPlaceholder = getParamPlaceholder(db.dialect, 1);
  const startPlaceholder = getParamPlaceholder(db.dialect, 2);
  const endPlaceholder = getParamPlaceholder(db.dialect, 3);

  return db.query<PostRow>(
    `SELECT title, tags, channel
     FROM posts
     WHERE customer_id = ${customerPlaceholder}
       AND created_at >= ${startPlaceholder}
       AND created_at <= ${endPlaceholder}
     ORDER BY created_at DESC`,
    [customerId, periodStart, periodEnd],
  );
}

export async function monitorCompetitors(
  db: DatabaseClient,
  customerId: string,
  competitors: CompetitorSource[],
  periodStart: string,
  periodEnd: string,
): Promise<CompetitorMonitorResult> {
  const snapshots: CompetitorActivitySnapshot[] = [];

  for (const competitor of competitors) {
    const posts = await loadPostsInRange(db, competitor.customerId, periodStart, periodEnd);
    const topKeywords = toTopKeywords(posts);
    const recentTopics = toRecentTopics(posts);
    const mergedTopics = [...recentTopics, ...topKeywords].slice(0, 6);

    snapshots.push({
      name: competitor.name,
      newPosts: posts.length,
      recentTopics: mergedTopics,
      activeChannels: toActiveChannels(posts),
    });
  }

  return {
    id: randomUUID(),
    customerId,
    analyzedAt: new Date().toISOString(),
    competitors: snapshots,
  };
}
