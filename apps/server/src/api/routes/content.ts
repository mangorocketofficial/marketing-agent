import { Router, type Request, type Response } from 'express';
import type { DatabaseClient } from '../../db';
import { generateContent } from '../../services/content/generator';
import { searchRagReferences, type RagFilters, type RagReference } from '../../services/content/rag';
import {
  ingestCustomerProfileToRag,
  ingestProjectDocumentToRag,
} from '../../services/content/ingest';
import type { OrganizationType, PostChannel } from '@marketing-agent/shared';
import { asString, getParamPlaceholder, parseStringArray } from '../../utils/db';

interface CustomerRow {
  id: string;
  name: string;
  organization_type: string;
  mission: string;
  keywords: unknown;
  location: string;
}

interface ContentGeneratePayload {
  customerId?: string;
  channel?: PostChannel;
  topic?: string;
  category?: string;
  angle?: string;
  targetLength?: 'short' | 'medium' | 'long';
  systemPrompt?: string;
  styleDirectives?: string[];
  ragFilters?: RagFilters;
}

interface ContentIngestProfilePayload {
  customerId?: string;
}

interface ContentIngestProjectDocPayload {
  customerId?: string;
  sourceId?: string;
  title?: string;
  textContent?: string;
  category?: string;
  channel?: PostChannel;
  metadata?: Record<string, unknown>;
}

const CHANNELS: PostChannel[] = ['naver-blog', 'instagram', 'threads', 'nextjs-blog'];
const TARGET_LENGTHS: Array<NonNullable<ContentGeneratePayload['targetLength']>> = [
  'short',
  'medium',
  'long',
];

function isValidChannel(value: unknown): value is PostChannel {
  return typeof value === 'string' && CHANNELS.includes(value as PostChannel);
}

function isValidTargetLength(
  value: unknown,
): value is NonNullable<ContentGeneratePayload['targetLength']> {
  return typeof value === 'string' && TARGET_LENGTHS.includes(value as NonNullable<ContentGeneratePayload['targetLength']>);
}

function validatePayload(payload: ContentGeneratePayload): string | null {
  if (!asString(payload.customerId)) return 'customerId is required';
  if (!isValidChannel(payload.channel)) return 'channel is invalid';
  if (!asString(payload.topic)) return 'topic is required';
  if (payload.targetLength !== undefined && !isValidTargetLength(payload.targetLength)) {
    return 'targetLength is invalid';
  }
  if (
    payload.styleDirectives !== undefined &&
    !Array.isArray(payload.styleDirectives)
  ) {
    return 'styleDirectives must be an array';
  }
  return null;
}

async function getCustomerById(db: DatabaseClient, customerId: string): Promise<CustomerRow | null> {
  const idPlaceholder = getParamPlaceholder(1);
  const rows = await db.query<CustomerRow>(
    `SELECT id, name, organization_type, mission, keywords, location
     FROM customers
     WHERE id = ${idPlaceholder}
     LIMIT 1`,
    [customerId],
  );
  return rows.length ? rows[0] : null;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

export function createContentRouter(db: DatabaseClient): Router {
  const router = Router();

  const generateTimestamps = new Map<string, number[]>();

  function isRateLimited(customerId: string): boolean {
    const now = Date.now();
    const timestamps = generateTimestamps.get(customerId) ?? [];
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    generateTimestamps.set(customerId, recent);

    if (recent.length >= RATE_LIMIT_MAX) {
      return true;
    }
    recent.push(now);
    return false;
  }

  router.post('/generate', async (req: Request, res: Response) => {
    const payload = req.body as ContentGeneratePayload;
    const validationError = validatePayload(payload);
    if (validationError) {
      res.status(400).json({ message: validationError });
      return;
    }

    const customerId = String(payload.customerId);

    if (isRateLimited(customerId)) {
      res.status(429).json({ message: 'Too many generation requests. Please wait before retrying.' });
      return;
    }

    const customer = await getCustomerById(db, customerId);
    if (!customer) {
      res.status(404).json({ message: 'Customer not found' });
      return;
    }

    // RAG search: fallback to empty references on failure
    let ragReferences: RagReference[] = [];
    try {
      ragReferences = await searchRagReferences(db, {
        customerId,
        channel: payload.channel as PostChannel,
        topic: String(payload.topic),
        category: asString(payload.category) ?? undefined,
        ragFilters: payload.ragFilters,
        limit: 7,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(`[content/generate] RAG search failed, proceeding without references: ${message}`);
    }

    // LLM generation: must succeed
    try {
      const generated = await generateContent({
        organizationType: customer.organization_type as OrganizationType,
        channel: payload.channel as PostChannel,
        customerName: customer.name,
        mission: customer.mission,
        keywords: parseStringArray(customer.keywords),
        location: customer.location,
        topic: String(payload.topic),
        angle: asString(payload.angle) ?? undefined,
        targetLength: payload.targetLength,
        systemPrompt: asString(payload.systemPrompt) ?? undefined,
        styleDirectives: Array.isArray(payload.styleDirectives)
          ? payload.styleDirectives.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          : undefined,
        ragReferences,
      });

      res.status(200).json(generated);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error(`[content/generate] Content generation failed: ${message}`);
      res.status(502).json({ message: 'Content generation failed', detail: message });
    }
  });

  router.post('/ingest/profile', async (req: Request, res: Response) => {
    const payload = req.body as ContentIngestProfilePayload;
    const customerId = asString(payload.customerId);
    if (!customerId) {
      res.status(400).json({ message: 'customerId is required' });
      return;
    }

    const ingested = await ingestCustomerProfileToRag(db, { customerId });
    if (!ingested) {
      res.status(404).json({ message: 'Customer not found or profile ingestion produced no chunks' });
      return;
    }

    res.status(200).json({ status: 'ok', sourceType: 'profile', customerId });
  });

  router.post('/ingest/project-doc', async (req: Request, res: Response) => {
    const payload = req.body as ContentIngestProjectDocPayload;
    const customerId = asString(payload.customerId);
    const sourceId = asString(payload.sourceId);
    const textContent = asString(payload.textContent);

    if (!customerId) {
      res.status(400).json({ message: 'customerId is required' });
      return;
    }
    if (!sourceId) {
      res.status(400).json({ message: 'sourceId is required' });
      return;
    }
    if (!textContent) {
      res.status(400).json({ message: 'textContent is required' });
      return;
    }
    if (payload.channel !== undefined && !isValidChannel(payload.channel)) {
      res.status(400).json({ message: 'channel is invalid' });
      return;
    }

    const ingested = await ingestProjectDocumentToRag(db, {
      customerId,
      sourceId,
      title: asString(payload.title) ?? undefined,
      textContent,
      category: asString(payload.category) ?? undefined,
      channel: payload.channel,
      metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : undefined,
    });

    if (!ingested) {
      res.status(400).json({ message: 'Project document ingestion produced no chunks' });
      return;
    }

    res.status(200).json({ status: 'ok', sourceType: 'project-doc', customerId, sourceId });
  });

  return router;
}
