import type { Queue } from 'bullmq';
import type { DatabaseClient } from '../../db';
import { enqueuePublishPost } from './queue';

type PostChannel = 'naver-blog' | 'instagram' | 'threads' | 'nextjs-blog';

interface ScheduledPostRow {
  id: string;
  customer_id: string;
  channel: string;
  scheduled_at: string;
  status: string;
}

export interface SchedulerOptions {
  intervalMs?: number;
  batchSize?: number;
  runOnStart?: boolean;
}

export interface SchedulerRuntime {
  tick: () => Promise<number>;
  stop: () => Promise<void>;
}

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_BATCH_SIZE = 50;

function getParamPlaceholder(index: number): string {
  return `$${index}`;
}

async function fetchDuePosts(
  db: DatabaseClient,
  nowIso: string,
  batchSize: number,
): Promise<ScheduledPostRow[]> {
  const scheduledAtPlaceholder = getParamPlaceholder(1);
  const limitPlaceholder = getParamPlaceholder(2);
  const sql = `SELECT id, customer_id, channel, scheduled_at, status
               FROM posts
               WHERE status = 'approved' AND scheduled_at <= ${scheduledAtPlaceholder}
               ORDER BY scheduled_at ASC
               LIMIT ${limitPlaceholder}`;

  return db.query<ScheduledPostRow>(sql, [nowIso, batchSize]);
}

async function markPostPublishing(db: DatabaseClient, postId: string, nowIso: string): Promise<void> {
  const idPlaceholder = getParamPlaceholder(1);
  const updatedAtPlaceholder = getParamPlaceholder(2);
  const sql = `UPDATE posts
               SET status = 'publishing', updated_at = ${updatedAtPlaceholder}
               WHERE id = ${idPlaceholder}`;
  await db.execute(sql, [postId, nowIso]);
}

export async function scheduleDuePosts(
  db: DatabaseClient,
  queue: Queue,
  options: Pick<SchedulerOptions, 'batchSize'> = {},
): Promise<number> {
  const nowIso = new Date().toISOString();
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const duePosts = await fetchDuePosts(db, nowIso, batchSize);

  for (const post of duePosts) {
    await markPostPublishing(db, post.id, nowIso);
    await enqueuePublishPost(
      queue,
      {
        postId: post.id,
        customerId: post.customer_id,
        channel: post.channel as PostChannel,
        scheduledAt: post.scheduled_at,
      },
      {
        jobId: `publish-post:${post.id}`,
      },
    );
  }

  return duePosts.length;
}

export function startPublishingScheduler(
  db: DatabaseClient,
  queue: Queue,
  options: SchedulerOptions = {},
): SchedulerRuntime {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const runOnStart = options.runOnStart ?? true;
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  const tick = async (): Promise<number> => {
    if (running) {
      return 0;
    }
    running = true;
    try {
      const scheduledCount = await scheduleDuePosts(db, queue, {
        batchSize: options.batchSize,
      });
      if (scheduledCount > 0) {
        // eslint-disable-next-line no-console
        console.log(`[scheduler] enqueued ${scheduledCount} publish jobs`);
      }
      return scheduledCount;
    } finally {
      running = false;
    }
  };

  if (runOnStart) {
    void tick();
  }

  timer = setInterval(() => {
    void tick();
  }, intervalMs);

  const stop = async (): Promise<void> => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  return { tick, stop };
}
