import { createHash, randomUUID } from 'node:crypto';
import type { PostChannel, PostStatus } from '@marketing-agent/shared';
import { executeMarketingStrategySkill } from './marketing-strategy';
import { executeRequestContentGenerationSkill } from './request-content-generation';
import { executeSchedulePostsSkill, type SchedulePostInputItem } from './schedule-posts';

type AgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

interface AgentTaskRecord {
  id: string;
}

interface CustomerRecord {
  id: string;
  organizationType: string;
  mission: string;
  schedule: {
    preferredHours?: number[];
    daysOfWeek?: number[];
  };
}

interface StrategyItem {
  channel: PostChannel;
  topic: string;
  angle: string;
  keywords: string[];
  postCount: number;
}

type ContentType = 'promotion' | 'live' | 'retrospective';

export interface AutonomousWeeklyLoopInput {
  customerId: string;
  weekStart: string;
  weekEnd: string;
  strategyRunId?: string;
  contentType?: ContentType;
  taskId?: string;
}

export interface AutonomousWeeklyLoopResult {
  taskId: string;
  strategyRunId: string;
  strategyId: string;
  scheduledCount: number;
  createdPostIds: string[];
  errors: Array<{ item: string; message: string }>;
}

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_TIMEOUT_MS = 30_000;

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

async function createTask(input: AutonomousWeeklyLoopInput): Promise<string> {
  if (input.taskId) return input.taskId;
  const created = await requestJson<AgentTaskRecord>('POST', '/api/agent/tasks', {
    customerId: input.customerId,
    type: 'marketing-strategy',
    input: {
      mode: 'autonomous-weekly-loop',
      ...input,
    },
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

function validate(input: AutonomousWeeklyLoopInput): void {
  if (!input.customerId?.trim()) throw new Error('customerId is required');
  if (!input.weekStart?.trim()) throw new Error('weekStart is required');
  if (!input.weekEnd?.trim()) throw new Error('weekEnd is required');
}

function computeIdempotencyKey(params: {
  customerId: string;
  strategyRunId: string;
  channel: PostChannel;
  topic: string;
  scheduledAt: string;
}): string {
  const source = [
    params.customerId,
    params.strategyRunId,
    params.channel,
    params.topic,
    params.scheduledAt,
  ].join('|');
  return createHash('sha256').update(source).digest('hex');
}

function toPostStatus(contentType: ContentType): PostStatus {
  if (contentType === 'live') return 'approved';
  return 'review';
}

function buildScheduledSlots(weekStart: string, totalCount: number, customer: CustomerRecord): string[] {
  const base = new Date(weekStart);
  if (Number.isNaN(base.getTime())) {
    const fallback = new Date();
    return Array.from({ length: totalCount }, (_, index) => {
      const copy = new Date(fallback);
      copy.setHours(9 + (index % 6), 0, 0, 0);
      copy.setDate(copy.getDate() + index);
      return copy.toISOString();
    });
  }

  const preferredHours = customer.schedule?.preferredHours?.length
    ? customer.schedule.preferredHours.filter((hour) => Number.isFinite(hour) && hour >= 0 && hour <= 23)
    : [9, 14, 19];
  const preferredDays = customer.schedule?.daysOfWeek?.length
    ? customer.schedule.daysOfWeek.filter((day) => Number.isFinite(day) && day >= 0 && day <= 6)
    : [1, 2, 3, 4, 5];

  const slots: string[] = [];
  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const current = new Date(base);
    current.setDate(base.getDate() + dayOffset);
    if (!preferredDays.includes(current.getDay())) continue;
    for (const hour of preferredHours) {
      const slot = new Date(current);
      slot.setHours(hour, 0, 0, 0);
      slots.push(slot.toISOString());
    }
  }

  if (!slots.length) {
    return Array.from({ length: totalCount }, (_, index) => {
      const copy = new Date(base);
      copy.setDate(base.getDate() + index);
      copy.setHours(10, 0, 0, 0);
      return copy.toISOString();
    });
  }

  return Array.from({ length: totalCount }, (_, index) => slots[index % slots.length]);
}

export async function executeAutonomousWeeklyLoopSkill(input: AutonomousWeeklyLoopInput): Promise<AutonomousWeeklyLoopResult> {
  validate(input);

  const taskId = await createTask(input);
  const strategyRunId = input.strategyRunId?.trim() || `strategy-run-${Date.now()}-${randomUUID()}`;
  const result: AutonomousWeeklyLoopResult = {
    taskId,
    strategyRunId,
    strategyId: '',
    scheduledCount: 0,
    createdPostIds: [],
    errors: [],
  };

  try {
    await updateTask(taskId, 'running', { step: 'loading-customer' });

    const customer = await requestJson<CustomerRecord>('GET', `/api/customers/${input.customerId}`);
    const strategyResult = await executeMarketingStrategySkill({
      customerId: input.customerId,
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      organizationType: customer.organizationType,
      mission: customer.mission,
      taskId: `strategy-task:${strategyRunId}`,
    });
    const strategy = strategyResult.strategy;
    result.strategyId = strategy.id;

    const totalPosts = strategy.items.reduce((sum, item) => sum + Math.max(0, item.postCount), 0);
    const slots = buildScheduledSlots(input.weekStart, totalPosts, customer);
    const contentType: ContentType = input.contentType ?? 'promotion';
    const status = toPostStatus(contentType);

    let slotIndex = 0;
    const postsToSchedule: SchedulePostInputItem[] = [];
    for (const item of strategy.items) {
      for (let repeat = 0; repeat < item.postCount; repeat += 1) {
        const scheduledAt = slots[slotIndex];
        slotIndex += 1;
        try {
          const generatedResult = await executeRequestContentGenerationSkill({
            customerId: input.customerId,
            channel: item.channel,
            topic: item.topic,
            category: contentType,
            angle: item.angle,
            targetLength: item.channel === 'nextjs-blog' ? 'long' : 'medium',
            styleDirectives: ['사실 중심', '과장 금지'],
            ragFilters: {
              categories: [contentType],
              performanceMin: 'medium',
            },
            taskId: `generate-task:${strategyRunId}:${item.channel}:${repeat}`,
          });

          const idempotencyKey = computeIdempotencyKey({
            customerId: input.customerId,
            strategyRunId,
            channel: item.channel,
            topic: item.topic,
            scheduledAt,
          });

          postsToSchedule.push({
            channel: item.channel,
            title: generatedResult.content.title,
            content: generatedResult.content.content,
            tags: generatedResult.content.tags ?? [],
            images: generatedResult.content.suggestedImages ?? [],
            scheduledAt,
            status,
            idempotencyKey,
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          result.errors.push({
            item: `${item.channel}:${item.topic}`,
            message,
          });
        }
      }
    }

    if (postsToSchedule.length > 0) {
      const scheduleResult = await executeSchedulePostsSkill({
        customerId: input.customerId,
        posts: postsToSchedule,
        taskId: `schedule-task:${strategyRunId}`,
      });
      result.scheduledCount = scheduleResult.createdCount;
      result.createdPostIds = scheduleResult.createdPostIds;
      for (const error of scheduleResult.errors) {
        result.errors.push({
          item: `schedule-index:${error.index}`,
          message: error.message,
        });
      }
    }

    if (result.errors.length > 0) {
      await updateTask(taskId, 'failed', result, `${result.errors.length} item(s) failed during autonomous loop`);
      return result;
    }

    await updateTask(taskId, 'completed', result);
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateTask(taskId, 'failed', result, message);
    throw error;
  }
}
