import type { PostChannel } from '@marketing-agent/shared';

type AgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

interface AgentTaskRecord {
  id: string;
}

export interface RequestContentGenerationInput {
  customerId: string;
  channel: PostChannel;
  topic: string;
  category?: string;
  angle?: string;
  targetLength?: 'short' | 'medium' | 'long';
  systemPrompt?: string;
  styleDirectives?: string[];
  ragFilters?: {
    categories?: string[];
    performanceMin?: 'high' | 'medium';
    excludePostIds?: string[];
  };
  taskId?: string;
}

export interface RequestContentGenerationResult {
  taskId: string;
  content: {
    title: string;
    content: string;
    tags: string[];
    suggestedImages: string[];
    suggestedPublishHour?: number;
  };
}

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_TIMEOUT_MS = 15_000;

function getApiBaseUrl(): string {
  return process.env.SERVER_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}

function getApiToken(): string {
  const token = process.env.API_AUTH_TOKEN;
  if (!token || !token.trim()) {
    throw new Error('API_AUTH_TOKEN is required');
  }
  return token.trim();
}

async function requestJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${getApiToken()}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API ${method} ${path} failed (${response.status}): ${text}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function createTask(input: RequestContentGenerationInput): Promise<string> {
  if (input.taskId) return input.taskId;

  const created = await requestJson<AgentTaskRecord>('POST', '/api/agent/tasks', {
    customerId: input.customerId,
    type: 'request-content-generation',
    input,
  });
  return created.id;
}

async function updateTask(taskId: string, status: AgentTaskStatus, output?: unknown, errorMessage?: string): Promise<void> {
  await requestJson('PATCH', `/api/agent/tasks/${taskId}/status`, {
    status,
    output,
    errorMessage,
  });
}

function validate(input: RequestContentGenerationInput): void {
  if (!input.customerId?.trim()) throw new Error('customerId is required');
  if (!input.channel?.trim()) throw new Error('channel is required');
  if (!input.topic?.trim()) throw new Error('topic is required');
}

export async function executeRequestContentGenerationSkill(
  input: RequestContentGenerationInput,
): Promise<RequestContentGenerationResult> {
  validate(input);

  const taskId = await createTask(input);
  try {
    await updateTask(taskId, 'running', { step: 'requesting-content-generation' });

    const content = await requestJson<RequestContentGenerationResult['content']>(
      'POST',
      '/api/content/generate',
      {
        customerId: input.customerId,
        channel: input.channel,
        topic: input.topic,
        category: input.category,
        angle: input.angle,
        targetLength: input.targetLength,
        systemPrompt: input.systemPrompt,
        styleDirectives: input.styleDirectives,
        ragFilters: input.ragFilters,
      },
    );

    const result: RequestContentGenerationResult = { taskId, content };
    await updateTask(taskId, 'completed', result);
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateTask(taskId, 'failed', undefined, message);
    throw error;
  }
}
