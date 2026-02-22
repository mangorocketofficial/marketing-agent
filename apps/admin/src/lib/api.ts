export type PostStatus = 'draft' | 'review' | 'approved' | 'publishing' | 'published' | 'failed';
export type PostChannel = 'naver-blog' | 'instagram' | 'threads' | 'nextjs-blog';

export interface Customer {
  id: string;
  name: string;
  organizationType: string;
  isActive: boolean;
  createdAt: string;
}

export interface Post {
  id: string;
  customerId: string;
  channel: PostChannel;
  status: PostStatus;
  title: string;
  scheduledAt: string;
  publishedAt?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface ReportRecord {
  id: string;
  customerId: string;
  type: 'marketing-daily' | 'marketing-weekly';
  periodStart: string;
  periodEnd: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RecipientRecord {
  id: string;
  customerId: string;
  name: string;
  email: string;
  receiveReport: boolean;
  status: 'active' | 'paused' | 'unsubscribed';
  createdAt: string;
}

export interface RecipientSummary {
  totalRecipients: number;
  activeRecipients: number;
  pausedRecipients: number;
  unsubscribedRecipients: number;
  mailableRecipients: number;
}

export interface AgentTask {
  id: string;
  customerId: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
}

function getApiBaseUrl(): string {
  return process.env.ADMIN_API_BASE_URL ?? 'http://127.0.0.1:3000';
}

function getApiToken(): string | undefined {
  return process.env.ADMIN_API_TOKEN;
}

function toQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    search.set(key, value);
  }
  const built = search.toString();
  return built ? `?${built}` : '';
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function apiGet<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const token = getApiToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, text || `API request failed: ${path}`);
  }

  return (await response.json()) as T;
}

export async function fetchHealth(): Promise<{ status: string; db: string }> {
  return apiGet('/health');
}

export async function fetchCustomers(): Promise<Customer[]> {
  return apiGet('/api/customers');
}

export async function fetchPosts(filters?: {
  customerId?: string;
  status?: PostStatus;
  channel?: PostChannel;
}): Promise<Post[]> {
  return apiGet(`/api/posts${toQuery(filters ?? {})}`);
}

export async function fetchReports(filters?: {
  customerId?: string;
  type?: 'marketing-daily' | 'marketing-weekly';
}): Promise<ReportRecord[]> {
  return apiGet(`/api/reports${toQuery(filters ?? {})}`);
}

export async function fetchRecipients(customerId: string): Promise<RecipientRecord[]> {
  return apiGet(`/api/recipients${toQuery({ customerId })}`);
}

export async function fetchRecipientSummary(customerId: string): Promise<RecipientSummary> {
  return apiGet(`/api/recipients/summary${toQuery({ customerId })}`);
}

export async function fetchAgentTasks(filters?: {
  customerId?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
}): Promise<AgentTask[]> {
  return apiGet(`/api/agent/tasks${toQuery(filters ?? {})}`);
}
