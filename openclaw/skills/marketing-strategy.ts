type PostChannel = 'naver-blog' | 'instagram' | 'threads' | 'nextjs-blog';
type AgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StrategyInputItem {
  channel: PostChannel;
  topic: string;
  angle: string;
  keywords: string[];
  postCount: number;
}

export interface MarketingStrategySkillInput {
  customerId: string;
  weekStart: string;
  weekEnd: string;
  organizationType?: string;
  mission?: string;
  coreKeywords?: string[];
  channels?: PostChannel[];
  focusTopics?: string[];
  taskId?: string;
}

export interface MarketingStrategySkillResult {
  taskId: string;
  strategy: {
    id: string;
    customerId: string;
    weekStart: string;
    weekEnd: string;
    overallDirection: string;
    reasoning: string;
    items: StrategyInputItem[];
    createdAt: string;
  };
}

interface AgentTaskRecord {
  id: string;
}

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_CHANNELS: PostChannel[] = ['nextjs-blog', 'instagram', 'threads'];
const DEFAULT_TOPICS = ['활동 소개', '현장 스토리', '성과 공유', '참여 안내'];

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

function makeLocalId(): string {
  return `strategy_${Date.now()}_${Math.floor(Math.random() * 10_000)}`;
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

async function createTask(input: MarketingStrategySkillInput): Promise<string> {
  if (input.taskId) {
    return input.taskId;
  }

  const created = await requestJson<AgentTaskRecord>('POST', '/api/agent/tasks', {
    customerId: input.customerId,
    type: 'marketing-strategy',
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

function validate(input: MarketingStrategySkillInput): void {
  if (!input.customerId?.trim()) {
    throw new Error('customerId is required');
  }
  if (!input.weekStart?.trim()) {
    throw new Error('weekStart is required');
  }
  if (!input.weekEnd?.trim()) {
    throw new Error('weekEnd is required');
  }
}

function pickTopics(input: MarketingStrategySkillInput): string[] {
  const topics = input.focusTopics?.filter((item) => item.trim()) ?? [];
  if (topics.length > 0) return topics;
  return DEFAULT_TOPICS;
}

function pickKeywords(input: MarketingStrategySkillInput): string[] {
  const keywords = input.coreKeywords?.filter((item) => item.trim()) ?? [];
  if (keywords.length > 0) return keywords;
  return ['ngo', 'campaign', 'community'];
}

function buildItems(input: MarketingStrategySkillInput): StrategyInputItem[] {
  const channels = input.channels?.length ? input.channels : DEFAULT_CHANNELS;
  const topics = pickTopics(input);
  const keywords = pickKeywords(input);

  return channels.map((channel, index) => {
    const topic = topics[index % topics.length];
    const angle =
      channel === 'nextjs-blog'
        ? '배경 설명 + 실행 과정 + 기대 효과를 상세히 전달'
        : channel === 'instagram'
          ? '시각 중심 메시지와 참여 유도를 짧고 선명하게 전달'
          : channel === 'threads'
            ? '핵심 주장과 대화형 질문으로 확산 유도'
            : '공지 중심으로 정확한 정보 전달';

    return {
      channel,
      topic,
      angle,
      keywords: [...keywords.slice(0, 3), channel],
      postCount: channel === 'nextjs-blog' ? 2 : 3,
    };
  });
}

function buildOverallDirection(input: MarketingStrategySkillInput): string {
  const org = input.organizationType ?? 'ngo';
  const mission = input.mission?.trim() || '지역사회와 연결된 긍정적 변화를 만드는 활동';
  return `${org} 조직의 미션(${mission})에 맞춰, 주간 콘텐츠를 "활동 근거 + 참여 행동 유도" 중심으로 운영합니다.`;
}

function buildReasoning(input: MarketingStrategySkillInput, items: StrategyInputItem[]): string {
  const focus = pickTopics(input).slice(0, 3).join(', ');
  const channels = items.map((item) => item.channel).join(', ');
  return `선정된 주제(${focus})를 채널 특성(${channels})에 맞춰 분배해 도달과 반응을 동시에 확보하도록 설계했습니다.`;
}

export async function executeMarketingStrategySkill(
  input: MarketingStrategySkillInput,
): Promise<MarketingStrategySkillResult> {
  validate(input);

  const taskId = await createTask(input);
  try {
    await updateTask(taskId, 'running', { step: 'building-weekly-strategy' });

    const items = buildItems(input);
    const strategy = {
      id: makeLocalId(),
      customerId: input.customerId,
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      overallDirection: buildOverallDirection(input),
      reasoning: buildReasoning(input, items),
      items,
      createdAt: new Date().toISOString(),
    };

    const result: MarketingStrategySkillResult = {
      taskId,
      strategy,
    };

    await updateTask(taskId, 'completed', result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateTask(taskId, 'failed', undefined, message);
    throw error;
  }
}
