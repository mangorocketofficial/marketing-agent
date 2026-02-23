import { PostChannel, PostStatus } from '../types/post';
import { OrganizationType } from '../types/customer';
import { AgentTaskType } from '../types/agent';
import { ReportType } from '../types/report';

// ── 채널 관련 ──

// 지원하는 전체 채널 목록
export const ALL_CHANNELS: PostChannel[] = [
  'naver-blog',
  'instagram',
  'threads',
  'nextjs-blog',
];

// 서버에서 자동 발행하는 채널
export const AUTO_CHANNELS: PostChannel[] = [
  'instagram',
  'threads',
  'nextjs-blog',
];

// 유저가 검수 후 수동으로 발행하는 채널
export const MANUAL_CHANNELS: PostChannel[] = [
  'naver-blog',
];

// 채널 한글 이름 매핑
export const CHANNEL_LABELS: Record<PostChannel, string> = {
  'naver-blog': '네이버 블로그',
  'instagram': '인스타그램',
  'threads': '쓰레드',
  'nextjs-blog': 'Next.js 블로그',
};

// ── 포스팅 상태 관련 ──

export const STATUS_LABELS: Record<PostStatus, string> = {
  draft: '초안',
  review: '검수 중',
  approved: '승인됨',
  publishing: '발행 중',
  published: '발행 완료',
  failed: '발행 실패',
};

// ── NGO 조직 분야 관련 ──

export const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  'environment': '환경',
  'education': '교육',
  'human-rights': '인권',
  'animal': '동물 보호',
  'welfare': '복지',
  'health': '보건/의료',
  'culture': '문화/예술',
  'community': '지역사회/마을',
  'international': '국제 협력',
  'other': '기타',
};

// ── Agent 관련 ──

export const AGENT_TASK_LABELS: Record<AgentTaskType, string> = {
  'marketing-strategy': '마케팅 전략 수립',
  'schedule-posts': '포스팅 스케줄링',
  'request-content-generation': '콘텐츠 생성 요청',
  'analyze-performance': '성과 분석',
  'competitor-report': '경쟁업체 분석',
  'donor-report': '후원자 이메일 발송',
};

// ── 리포트 관련 ──

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  'marketing-daily': '일간 마케팅 리포트',
  'marketing-weekly': '주간 마케팅 리포트',
};

// ── 수치 상수 ──

export const MAX_RETRY_COUNT = 3;                     // 발행 실패 시 최대 재시도 횟수
export const DEFAULT_POSTS_PER_DAY = 1;               // 기본 하루 포스팅 수
export const DONOR_REPORT_DAY = 1;                    // 후원자 이메일 발송 요일 (1=월요일)
