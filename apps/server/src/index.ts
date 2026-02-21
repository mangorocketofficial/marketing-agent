import { config as loadEnv } from 'dotenv';
import express from 'express';
import { requireApiAuth } from './api/middleware/auth';
import { createAgentRouter } from './api/routes/agent';
import { createCustomersRouter } from './api/routes/customers';
import { createDonorsRouter } from './api/routes/donors';
import { createPostsRouter } from './api/routes/posts';
import { createReportsRouter } from './api/routes/reports';
import { initDatabase, type DatabaseClient } from './db';

loadEnv();

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

async function startServer(): Promise<void> {
  const app = express();

  app.use(express.json());

  const db = await initDatabase();

  registerRoutes(app, db);

  const server = app.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on http://${HOST}:${PORT}`);
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`[server] ${signal} received, shutting down`);
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

function registerRoutes(app: express.Express, db: DatabaseClient): void {
  app.get('/', (_req, res) => {
    res.json({
      service: 'marketing-agent-server',
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health', async (_req, res) => {
    const dbOk = await db.healthCheck();
    if (!dbOk) {
      res.status(503).json({ status: 'error', db: 'down' });
      return;
    }

    res.status(200).json({ status: 'ok', db: 'up' });
  });

  app.get('/api/protected/ping', requireApiAuth, (_req, res) => {
    res.status(200).json({ status: 'ok', message: 'authorized' });
  });

  app.use('/api/customers', requireApiAuth, createCustomersRouter(db));
  app.use('/api/posts', requireApiAuth, createPostsRouter(db));
  app.use('/api/recipients', requireApiAuth, createDonorsRouter(db));
  app.use('/api/donors', requireApiAuth, createDonorsRouter(db));
  app.use('/api/reports', requireApiAuth, createReportsRouter(db));
  app.use('/api/agent', requireApiAuth, createAgentRouter(db));
}

void startServer().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[server] failed to start', error);
  process.exit(1);
});
