import {
  Queue,
  QueueEvents,
  Worker,
  type Job,
  type JobsOptions,
  type Processor,
} from 'bullmq';
import { config as loadEnv } from 'dotenv';

loadEnv();

const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';
const PUBLISHING_QUEUE_NAME = 'publishing';
const SMOKE_JOB_NAME = 'smoke-test';
const SMOKE_TIMEOUT_MS = 10_000;

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: 100,
  removeOnFail: 100,
};

export type PublishingJobName = 'publish-post' | 'retry-publish';

export interface PublishPostJobData {
  postId: string;
  customerId: string;
  channel: 'naver-blog' | 'instagram' | 'threads' | 'nextjs-blog';
  scheduledAt?: string;
}

export interface RetryPublishJobData {
  postId: string;
  reason?: string;
  retryCount: number;
}

type PublishingJobDataMap = {
  'publish-post': PublishPostJobData;
  'retry-publish': RetryPublishJobData;
};

type PublishingWorkerMap = {
  [Name in PublishingJobName]: Processor<PublishingJobDataMap[Name]>;
};

export interface PublishingQueueRuntime {
  queue: Queue;
  events: QueueEvents;
}

function createRedisConnection(redisUrl: string) {
  return {
    url: redisUrl,
    maxRetriesPerRequest: null,
  };
}

export function getRedisUrl(): string {
  return process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
}

export async function createPublishingQueue(redisUrl = getRedisUrl()): Promise<PublishingQueueRuntime> {
  const connection = createRedisConnection(redisUrl);
  const queue = new Queue(PUBLISHING_QUEUE_NAME, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  const events = new QueueEvents(PUBLISHING_QUEUE_NAME, { connection: createRedisConnection(redisUrl) });

  await Promise.all([queue.waitUntilReady(), events.waitUntilReady()]);
  return { queue, events };
}

export async function enqueuePublishingJob<Name extends PublishingJobName>(
  queue: Queue,
  name: Name,
  data: PublishingJobDataMap[Name],
  options?: JobsOptions,
): Promise<void> {
  await queue.add(name, data, options);
}

export async function enqueuePublishPost(
  queue: Queue,
  data: PublishPostJobData,
  options?: JobsOptions,
): Promise<void> {
  await enqueuePublishingJob(queue, 'publish-post', data, options);
}

export async function enqueueRetryPublish(
  queue: Queue,
  data: RetryPublishJobData,
  options?: JobsOptions,
): Promise<void> {
  await enqueuePublishingJob(queue, 'retry-publish', data, options);
}

export async function startPublishingWorker(
  handlers: Partial<PublishingWorkerMap>,
  redisUrl = getRedisUrl(),
): Promise<Worker> {
  const worker = new Worker(
    PUBLISHING_QUEUE_NAME,
    async (job: Job) => {
      const handler = handlers[job.name as PublishingJobName];
      if (!handler) {
        throw new Error(`No worker handler registered for job "${job.name}"`);
      }
      return handler(job as never);
    },
    { connection: createRedisConnection(redisUrl) },
  );

  worker.on('completed', (job) => {
    // eslint-disable-next-line no-console
    console.log(`[queue] completed ${job.name}#${job.id}`);
  });
  worker.on('failed', (job, error) => {
    // eslint-disable-next-line no-console
    console.error(`[queue] failed ${job?.name}#${job?.id}`, error);
  });

  await worker.waitUntilReady();
  return worker;
}

export async function closePublishingQueue(runtime: PublishingQueueRuntime): Promise<void> {
  await Promise.all([runtime.events.close(), runtime.queue.close()]);
}

export async function runQueueSmokeTest(redisUrl = getRedisUrl()): Promise<void> {
  const queueName = `publishing-smoke-${Date.now()}`;

  const queue = new Queue(queueName, { connection: createRedisConnection(redisUrl) });
  const queueEvents = new QueueEvents(queueName, { connection: createRedisConnection(redisUrl) });
  const worker = new Worker(
    queueName,
    async (job) => {
      if (job.name !== SMOKE_JOB_NAME) {
        throw new Error(`Unexpected job name: ${job.name}`);
      }
      return { ok: true };
    },
    { connection: createRedisConnection(redisUrl) },
  );

  try {
    await Promise.all([queue.waitUntilReady(), queueEvents.waitUntilReady(), worker.waitUntilReady()]);

    const job = await queue.add(
      SMOKE_JOB_NAME,
      { createdAt: new Date().toISOString() },
      { removeOnComplete: true, removeOnFail: true },
    );

    await job.waitUntilFinished(queueEvents, SMOKE_TIMEOUT_MS);
  } finally {
    await Promise.all([worker.close(), queueEvents.close(), queue.close()]);
  }
}
