type AgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed';
type ReportType = 'marketing-daily' | 'marketing-weekly';
type PostStatus = 'draft' | 'review' | 'approved' | 'publishing' | 'published' | 'failed';

interface AgentTaskRecord {
  id: string;
}

interface ReportRecord {
  id: string;
  customerId: string;
  type: ReportType;
  periodStart: string;
  periodEnd: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface PostRecord {
  id: string;
  status: PostStatus;
  channel: string;
}

interface ChannelStats {
  channel: string;
  totalPosts: number;
  successCount: number;
  failCount: number;
}

export interface AnalyzePerformanceSkillInput {
  customerId: string;
  preferType?: ReportType;
  includePostSnapshot?: boolean;
  taskId?: string;
}

export interface AnalyzePerformanceSkillResult {
  taskId: string;
  reportType: ReportType;
  reportId: string;
  periodStart: string;
  periodEnd: string;
  summary: string;
  insights: string[];
  recommendations: string[];
  postSnapshot?: {
    total: number;
    byStatus: Record<string, number>;
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

async function createTask(input: AnalyzePerformanceSkillInput): Promise<string> {
  if (input.taskId) {
    return input.taskId;
  }

  const created = await requestJson<AgentTaskRecord>('POST', '/api/agent/tasks', {
    customerId: input.customerId,
    type: 'analyze-performance',
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

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseChannelStats(payload: Record<string, unknown>): ChannelStats[] {
  const raw = payload.channelStats;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        channel: String(row.channel ?? ''),
        totalPosts: Number(row.totalPosts ?? 0),
        successCount: Number(row.successCount ?? 0),
        failCount: Number(row.failCount ?? 0),
      };
    })
    .filter((item) => item.channel);
}

function buildInsights(report: ReportRecord): string[] {
  const payloadSummary = asString(report.payload.summary);
  const channelStats = parseChannelStats(report.payload);
  const totalPosts = channelStats.reduce((sum, stat) => sum + stat.totalPosts, 0);
  const totalSuccess = channelStats.reduce((sum, stat) => sum + stat.successCount, 0);
  const successRate = totalPosts > 0 ? Math.round((totalSuccess / totalPosts) * 10000) / 100 : 0;

  const topChannel = [...channelStats].sort((a, b) => b.totalPosts - a.totalPosts)[0];
  const weakChannel = [...channelStats].sort((a, b) => b.failCount - a.failCount)[0];

  const insights: string[] = [];
  if (payloadSummary) insights.push(payloadSummary);
  insights.push(`분석 기간 총 발행 ${totalPosts}건, 성공률 ${successRate}%입니다.`);
  if (topChannel) insights.push(`운영 볼륨이 가장 큰 채널은 ${topChannel.channel} (${topChannel.totalPosts}건)입니다.`);
  if (weakChannel && weakChannel.failCount > 0) {
    insights.push(`실패 건이 가장 많은 채널은 ${weakChannel.channel} (${weakChannel.failCount}건)입니다.`);
  }
  return insights;
}

function buildRecommendations(report: ReportRecord): string[] {
  const channelStats = parseChannelStats(report.payload);
  if (channelStats.length === 0) {
    return ['리포트 원천 데이터가 부족하므로 채널별 발행 이력을 먼저 확보하세요.'];
  }

  return channelStats.map((item) => {
    if (item.totalPosts === 0) {
      return `${item.channel} 채널은 실험 포스팅을 최소 1건 배치해 기준 데이터를 만드세요.`;
    }
    const failRate = item.totalPosts > 0 ? item.failCount / item.totalPosts : 0;
    if (failRate >= 0.2) {
      return `${item.channel} 채널은 실패율이 높아 토큰/권한/발행 포맷 점검이 필요합니다.`;
    }
    return `${item.channel} 채널은 안정적이므로 콘텐츠 다양화와 CTA 실험을 진행하세요.`;
  });
}

function buildPostSnapshot(posts: PostRecord[]): { total: number; byStatus: Record<string, number> } {
  const byStatus = posts.reduce<Record<string, number>>((acc, post) => {
    acc[post.status] = (acc[post.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    total: posts.length,
    byStatus,
  };
}

async function loadLatestReport(customerId: string, type: ReportType): Promise<ReportRecord | null> {
  try {
    return await requestJson<ReportRecord>(
      'GET',
      `/api/reports/latest?customerId=${encodeURIComponent(customerId)}&type=${encodeURIComponent(type)}`,
    );
  } catch {
    return null;
  }
}

function validate(input: AnalyzePerformanceSkillInput): void {
  if (!input.customerId?.trim()) {
    throw new Error('customerId is required');
  }
}

export async function executeAnalyzePerformanceSkill(
  input: AnalyzePerformanceSkillInput,
): Promise<AnalyzePerformanceSkillResult> {
  validate(input);

  const taskId = await createTask(input);
  try {
    await updateTask(taskId, 'running', { step: 'loading-latest-report' });

    const preferType = input.preferType ?? 'marketing-weekly';
    const fallbackType: ReportType = preferType === 'marketing-weekly' ? 'marketing-daily' : 'marketing-weekly';

    const report = (await loadLatestReport(input.customerId, preferType))
      ?? (await loadLatestReport(input.customerId, fallbackType));

    if (!report) {
      throw new Error(`No marketing report found for customerId=${input.customerId}`);
    }

    const insights = buildInsights(report);
    const recommendations = buildRecommendations(report);
    const summary = insights[0] ?? '성과 요약 데이터가 부족합니다.';

    const result: AnalyzePerformanceSkillResult = {
      taskId,
      reportType: report.type,
      reportId: report.id,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      summary,
      insights,
      recommendations,
    };

    if (input.includePostSnapshot) {
      const posts = await requestJson<PostRecord[]>(
        'GET',
        `/api/posts?customerId=${encodeURIComponent(input.customerId)}`,
      );
      result.postSnapshot = buildPostSnapshot(posts);
    }

    await updateTask(taskId, 'completed', result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateTask(taskId, 'failed', undefined, message);
    throw error;
  }
}
