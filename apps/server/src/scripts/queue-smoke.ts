import { runQueueSmokeTest } from '../services/publishing/queue';

async function main(): Promise<void> {
  await runQueueSmokeTest();
  // eslint-disable-next-line no-console
  console.log('[queue-smoke] enqueue/dequeue test passed');
}

void main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[queue-smoke] failed', error);
  process.exit(1);
});

