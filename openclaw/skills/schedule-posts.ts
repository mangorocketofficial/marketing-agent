type PostChannel = 'naver-blog' | 'instagram' | 'threads' | 'nextjs-blog';
type PostStatus = 'draft' | 'review' | 'approved' | 'publishing' | 'published' | 'failed';
type AgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface SchedulePostInputItem {
  channel: PostChannel;
  title: string;
  content: string;
  scheduledAt: string;
  idempotencyKey?: string;
  images?: string[];
  tags?: string[];
  status?: PostStatus;
}

export interface SchedulePostsSkillInput {
  customerId: string;
  posts: SchedulePostInputItem[];
  taskId?: string;
  dryRun?: boolean;
}

export interface SchedulePostsSkillResult {
  taskId: string;
  createdCount: number;
  failedCount: number;
  createdPostIds: string[];
  errors: Array<{
    index: number;
    message: string;
  }>;
}

interface AgentTaskRecord {
  id: string;
}

interface PostRecord {
  id: string;
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

async function createTask(input: SchedulePostsSkillInput): Promise<string> {
  if (input.taskId) {
    return input.taskId;
  }

  const created = await requestJson<AgentTaskRecord>('POST', '/api/agent/tasks', {
    customerId: input.customerId,
    type: 'schedule-posts',
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

function validate(input: SchedulePostsSkillInput): void {
  if (!input.customerId?.trim()) {
    throw new Error('customerId is required');
  }
  if (!Array.isArray(input.posts) || input.posts.length === 0) {
    throw new Error('posts must be a non-empty array');
  }

  for (const [index, post] of input.posts.entries()) {
    if (!post.channel) throw new Error(`posts[${index}].channel is required`);
    if (!post.title?.trim()) throw new Error(`posts[${index}].title is required`);
    if (!post.content?.trim()) throw new Error(`posts[${index}].content is required`);
    if (!post.scheduledAt?.trim()) throw new Error(`posts[${index}].scheduledAt is required`);
  }
}

function toCreatePayload(customerId: string, item: SchedulePostInputItem): Record<string, unknown> {
  return {
    customerId,
    channel: item.channel,
    status: item.status ?? 'approved',
    title: item.title,
    content: item.content,
    images: item.images ?? [],
    tags: item.tags ?? [],
    scheduledAt: item.scheduledAt,
    idempotencyKey: item.idempotencyKey,
  };
}

export async function executeSchedulePostsSkill(input: SchedulePostsSkillInput): Promise<SchedulePostsSkillResult> {
  validate(input);

  const taskId = await createTask(input);
  const result: SchedulePostsSkillResult = {
    taskId,
    createdCount: 0,
    failedCount: 0,
    createdPostIds: [],
    errors: [],
  };

  try {
    await updateTask(taskId, 'running', { step: 'creating-posts' });

    if (input.dryRun) {
      const output = {
        mode: 'dry-run',
        previewCount: input.posts.length,
      };
      await updateTask(taskId, 'completed', output);
      return {
        ...result,
        createdCount: input.posts.length,
      };
    }

    for (const [index, item] of input.posts.entries()) {
      try {
        const created = await requestJson<PostRecord>('POST', '/api/posts', toCreatePayload(input.customerId, item));
        result.createdCount += 1;
        result.createdPostIds.push(created.id);
      } catch (error) {
        result.failedCount += 1;
        result.errors.push({
          index,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (result.failedCount > 0) {
      await updateTask(taskId, 'failed', result, `${result.failedCount} post(s) failed to schedule`);
      return result;
    }

    await updateTask(taskId, 'completed', result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateTask(taskId, 'failed', result, message);
    throw error;
  }
}
