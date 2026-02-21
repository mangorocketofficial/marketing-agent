import { PostChannel } from './post';

// ── Agent 작업 종류 ──

// AI agent가 수행할 수 있는 작업 유형
export type AgentTaskType =
  | 'marketing-strategy'       // 위클리 마케팅 전략 수립
  | 'schedule-posts'           // 포스팅 스케줄 계획
  | 'analyze-performance'      // 성과 분석
  | 'competitor-report'        // 경쟁업체 분석
  | 'donor-report';            // 후원자 이메일 콘텐츠/발송 트리거

// Agent 작업 실행 상태
export type AgentTaskStatus =
  | 'pending'        // 대기 중
  | 'running'        // 실행 중
  | 'completed'      // 완료
  | 'failed';        // 실패

// Agent 작업 기록
// agent가 작업을 수행할 때마다 하나의 기록이 생성된다.
export interface AgentTask {
  id: string;
  customerId: string;             // 어떤 NGO 단체에 대한 작업인지
  type: AgentTaskType;            // 작업 종류
  status: AgentTaskStatus;        // 실행 상태

  input?: Record<string, unknown>;   // agent에게 전달된 입력 데이터
  output?: Record<string, unknown>;  // agent가 반환한 결과 데이터
  errorMessage?: string;             // 실패 시 에러 메시지

  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

// ── 위클리 마케팅 전략 ──

// 하나의 전략 항목 (이번 주에 이런 방향으로 콘텐츠를 만들자)
export interface StrategyItem {
  channel: PostChannel;           // 어떤 채널용 전략인지
  topic: string;                  // 주제 (예: '봄맞이 플로깅 캠페인 홍보')
  angle: string;                  // 접근 방향 (예: '참여 후기 중심 감성 스토리')
  keywords: string[];             // 타겟 키워드
  postCount: number;              // 이번 주 목표 포스팅 수
}

// 주간 마케팅 전략
// AI agent가 매주 생성하는 전략 문서.
// 이 전략을 기반으로 콘텐츠 생성과 스케줄링이 이루어진다.
export interface WeeklyStrategy {
  id: string;
  customerId: string;
  weekStart: string;              // 주 시작일 (ISO 8601, 월요일)
  weekEnd: string;                // 주 종료일

  overallDirection: string;       // 이번 주 전체 방향 요약
  items: StrategyItem[];          // 채널별 전략 항목
  reasoning: string;              // AI가 이 전략을 세운 근거/분석

  createdAt: string;
}

// ── 성과 분석 ──

// 채널별 성과 지표
export interface ChannelPerformance {
  channel: PostChannel;
  postCount: number;              // 발행된 포스팅 수
  successRate: number;            // 발행 성공률 (0~1)
  engagement?: number;            // 반응 지표 (좋아요, 댓글 등 — 플랫폼에 따라 다름)
}

// 성과 분석 결과
// AI agent가 기간별 마케팅 성과를 분석한 결과.
export interface PerformanceAnalysis {
  id: string;
  customerId: string;
  periodStart: string;
  periodEnd: string;

  channels: ChannelPerformance[];   // 채널별 성과
  insights: string[];               // AI가 도출한 인사이트 목록
  recommendations: string[];        // 개선 제안 목록

  createdAt: string;
}

// ── 경쟁업체 분석 ──

// 개별 경쟁업체 분석 결과
export interface CompetitorInsight {
  name: string;                     // 경쟁업체명
  recentTopics: string[];           // 최근 다루는 주제
  activeChannels: PostChannel[];    // 활동 중인 채널
  strength: string;                 // AI가 분석한 강점
  opportunity: string;              // 우리가 활용할 수 있는 기회
}

// 경쟁업체 분석 보고서
export interface CompetitorAnalysis {
  id: string;
  customerId: string;
  analyzedAt: string;

  competitors: CompetitorInsight[];   // 경쟁업체별 분석
  summary: string;                    // 전체 요약
  suggestedActions: string[];         // AI가 제안하는 대응 방안

  createdAt: string;
}
