type AgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

interface AgentTaskRecord {
  id: string;
}

interface ReportRecord {
  id: string;
  customerId: string;
  type: 'marketing-daily' | 'marketing-weekly';
  periodStart: string;
  periodEnd: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface RecipientSummary {
  totalRecipients: number;
  activeRecipients: number;
  pausedRecipients: number;
  unsubscribedRecipients: number;
  mailableRecipients: number;
}

export interface DonorReportSkillInput {
  customerId: string;
  tone?: 'warm' | 'formal' | 'friendly';
  includeReportType?: 'marketing-weekly' | 'marketing-daily';
  taskId?: string;
}

export interface DonorReportSkillResult {
  taskId: string;
  customerId: string;
  reportId?: string;
  periodStart?: string;
  periodEnd?: string;
  recipientSummary: RecipientSummary;
  mailContent: {
    title: string;
    message: string;
    highlights: string[];
  };
  delivery: {
    status: 'drafted';
    note: string;
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

async function createTask(input: DonorReportSkillInput): Promise<string> {
  if (input.taskId) {
    return input.taskId;
  }

  const created = await requestJson<AgentTaskRecord>('POST', '/api/agent/tasks', {
    customerId: input.customerId,
    type: 'donor-report',
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

function validate(input: DonorReportSkillInput): void {
  if (!input.customerId?.trim()) {
    throw new Error('customerId is required');
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asChannelStats(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const raw = payload.channelStats;
  return Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
}

function buildHighlights(report?: ReportRecord): string[] {
  if (!report) {
    return ['이번 기간 활동 요약 데이터가 아직 준비되지 않았습니다.'];
  }

  const highlights: string[] = [];
  const summary = asString(report.payload.summary);
  if (summary) {
    highlights.push(summary);
  }

  const channelStats = asChannelStats(report.payload);
  const topByVolume = [...channelStats].sort(
    (a, b) => Number(b.totalPosts ?? 0) - Number(a.totalPosts ?? 0),
  )[0];
  if (topByVolume?.channel) {
    highlights.push(
      `가장 활발했던 채널은 ${String(topByVolume.channel)}이며 ${Number(topByVolume.totalPosts ?? 0)}건의 콘텐츠를 운영했습니다.`,
    );
  }

  const topStable = [...channelStats].sort(
    (a, b) => Number(b.successCount ?? 0) - Number(a.successCount ?? 0),
  )[0];
  if (topStable?.channel) {
    highlights.push(
      `발행 안정성이 가장 높았던 채널은 ${String(topStable.channel)}였습니다.`,
    );
  }

  return highlights.length > 0 ? highlights : ['이번 주 활동 데이터를 기반으로 다음 소식을 준비 중입니다.'];
}

function buildMessage(tone: DonorReportSkillInput['tone'], highlights: string[]): string {
  if (tone === 'formal') {
    return `후원자 여러분의 지속적인 관심 덕분에 아래와 같은 활동을 진행했습니다.\n${highlights.join('\n')}`;
  }
  if (tone === 'friendly') {
    return `이번 주에도 함께해 주셔서 감사합니다. 활동 소식을 간단히 공유드립니다.\n${highlights.join('\n')}`;
  }
  return `늘 함께해주셔서 감사합니다. 이번 기간의 주요 활동 소식을 전해드립니다.\n${highlights.join('\n')}`;
}

function buildTitle(periodStart?: string, periodEnd?: string): string {
  if (!periodStart || !periodEnd) {
    return '[주간 소식] NGO 활동 업데이트';
  }
  return `[주간 소식] ${periodStart.slice(0, 10)} ~ ${periodEnd.slice(0, 10)} 활동 공유`;
}

async function loadLatestReport(customerId: string, type: 'marketing-weekly' | 'marketing-daily'): Promise<ReportRecord | null> {
  try {
    return await requestJson<ReportRecord>(
      'GET',
      `/api/reports/latest?customerId=${encodeURIComponent(customerId)}&type=${encodeURIComponent(type)}`,
    );
  } catch {
    return null;
  }
}

export async function executeDonorReportSkill(input: DonorReportSkillInput): Promise<DonorReportSkillResult> {
  validate(input);

  const taskId = await createTask(input);
  try {
    await updateTask(taskId, 'running', { step: 'collecting-recipient-and-report-data' });

    const recipientSummary = await requestJson<RecipientSummary>(
      'GET',
      `/api/recipients/summary?customerId=${encodeURIComponent(input.customerId)}`,
    );

    const preferType = input.includeReportType ?? 'marketing-weekly';
    const report = (await loadLatestReport(input.customerId, preferType))
      ?? (preferType === 'marketing-weekly'
        ? await loadLatestReport(input.customerId, 'marketing-daily')
        : null);

    const highlights = buildHighlights(report ?? undefined);
    const result: DonorReportSkillResult = {
      taskId,
      customerId: input.customerId,
      reportId: report?.id,
      periodStart: report?.periodStart,
      periodEnd: report?.periodEnd,
      recipientSummary,
      mailContent: {
        title: buildTitle(report?.periodStart, report?.periodEnd),
        message: buildMessage(input.tone, highlights),
        highlights,
      },
      delivery: {
        status: 'drafted',
        note: '메일 발송은 서버 mailer 단계에서 수행됩니다. 현재 스킬은 콘텐츠 초안 트리거만 담당합니다.',
      },
    };

    await updateTask(taskId, 'completed', result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateTask(taskId, 'failed', undefined, message);
    throw error;
  }
}
