type AgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

interface AgentTaskRecord {
  id: string;
}

interface CustomerRecord {
  id: string;
  name: string;
  keywords: string[];
}

interface PostRecord {
  id: string;
  customerId: string;
  title: string;
  tags: string[];
  channel: string;
  createdAt: string;
}

interface CompetitorSnapshot {
  competitorId: string;
  competitorName: string;
  postCount: number;
  activeChannels: string[];
  topKeywords: string[];
}

export interface CompetitorReportSkillInput {
  customerId: string;
  competitorCustomerIds: string[];
  lookbackDays?: number;
  taskId?: string;
}

export interface CompetitorReportSkillResult {
  taskId: string;
  customerId: string;
  lookbackDays: number;
  snapshots: CompetitorSnapshot[];
  summary: string;
  suggestedActions: string[];
}

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_LOOKBACK_DAYS = 14;

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

async function createTask(input: CompetitorReportSkillInput): Promise<string> {
  if (input.taskId) {
    return input.taskId;
  }

  const created = await requestJson<AgentTaskRecord>('POST', '/api/agent/tasks', {
    customerId: input.customerId,
    type: 'competitor-report',
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

function validate(input: CompetitorReportSkillInput): void {
  if (!input.customerId?.trim()) {
    throw new Error('customerId is required');
  }
  if (!Array.isArray(input.competitorCustomerIds) || input.competitorCustomerIds.length === 0) {
    throw new Error('competitorCustomerIds must be a non-empty array');
  }
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

function normalizePostRecord(raw: Record<string, unknown>): PostRecord {
  return {
    id: String(raw.id ?? ''),
    customerId: String(raw.customerId ?? ''),
    title: String(raw.title ?? ''),
    tags: asStringArray(raw.tags),
    channel: String(raw.channel ?? ''),
    createdAt: String(raw.createdAt ?? ''),
  };
}

function topKeywords(posts: PostRecord[], limit = 5): string[] {
  const counter = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.tags) {
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

function buildSummary(snapshots: CompetitorSnapshot[]): string {
  if (snapshots.length === 0) {
    return '경쟁사 분석 대상 데이터가 없습니다.';
  }

  const topByVolume = [...snapshots].sort((a, b) => b.postCount - a.postCount)[0];
  return `가장 활동량이 높은 경쟁사는 ${topByVolume.competitorName}이며 최근 ${topByVolume.postCount}건의 포스트를 발행했습니다.`;
}

function buildSuggestedActions(snapshots: CompetitorSnapshot[]): string[] {
  if (!snapshots.length) {
    return ['경쟁사 ID를 확인하고 최소 1개 이상 분석 대상으로 등록하세요.'];
  }

  return snapshots.map((item) => {
    const keyword = item.topKeywords[0];
    if (keyword) {
      return `${item.competitorName}의 상위 키워드(${keyword})를 참고해 우리 조직 맞춤 주제로 재해석 콘텐츠를 기획하세요.`;
    }
    return `${item.competitorName} 채널 활동을 모니터링해 주제 분포 데이터를 먼저 축적하세요.`;
  });
}

export async function executeCompetitorReportSkill(
  input: CompetitorReportSkillInput,
): Promise<CompetitorReportSkillResult> {
  validate(input);

  const taskId = await createTask(input);
  try {
    await updateTask(taskId, 'running', { step: 'loading-competitor-data' });

    const lookbackDays = input.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
    const customers = await requestJson<CustomerRecord[]>('GET', '/api/customers');
    const customerMap = new Map(customers.map((customer) => [customer.id, customer]));

    const snapshots: CompetitorSnapshot[] = [];
    for (const competitorId of input.competitorCustomerIds) {
      const customer = customerMap.get(competitorId);
      const postsRaw = await requestJson<Record<string, unknown>[]>(
        'GET',
        `/api/posts?customerId=${encodeURIComponent(competitorId)}`,
      );
      const since = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
      const posts = postsRaw
        .map(normalizePostRecord)
        .filter((post) => {
          const time = Date.parse(post.createdAt);
          return Number.isFinite(time) && time >= since;
        });

      const channels = [...new Set(posts.map((post) => post.channel).filter(Boolean))];
      snapshots.push({
        competitorId,
        competitorName: customer?.name ?? competitorId,
        postCount: posts.length,
        activeChannels: channels,
        topKeywords: topKeywords(posts),
      });
    }

    const result: CompetitorReportSkillResult = {
      taskId,
      customerId: input.customerId,
      lookbackDays,
      snapshots,
      summary: buildSummary(snapshots),
      suggestedActions: buildSuggestedActions(snapshots),
    };

    await updateTask(taskId, 'completed', result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateTask(taskId, 'failed', undefined, message);
    throw error;
  }
}
