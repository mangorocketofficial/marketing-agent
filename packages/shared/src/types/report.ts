import { PostChannel } from './post';

// ── 리포트 종류 ──

export type ReportType =
  | 'marketing-daily'        // 일간 마케팅 리포트 (내부용)
  | 'marketing-weekly';      // 주간 마케팅 리포트 (내부용)

// ══════════════════════════════════════════
// 마케팅 리포트 (내부용)
// NGO 관리자가 마케팅 성과를 확인하는 용도.
// ══════════════════════════════════════════

// 채널별 발행 통계
export interface ChannelPublishingStats {
  channel: PostChannel;
  totalPosts: number;          // 발행된 포스팅 수
  successCount: number;        // 성공 수
  failCount: number;           // 실패 수
}

// 채널별 반응/도달 통계 (플랫폼별 제공 범위가 달라 optional)
export interface ChannelEngagementStats {
  channel: PostChannel;
  impressions?: number;
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  followersDelta?: number;     // 기간 내 순증감
}

// 경쟁업체 활동 요약
export interface CompetitorActivity {
  competitorName: string;       // 경쟁업체명
  newPosts: number;             // 신규 포스팅 수
  topKeywords: string[];        // 주요 키워드
}

// 마케팅 리포트
export interface MarketingReport {
  id: string;
  customerId: string;
  type: 'marketing-daily' | 'marketing-weekly';
  periodStart: string;          // 리포트 기간 시작 (ISO 8601)
  periodEnd: string;            // 리포트 기간 끝

  publishingStats: ChannelPublishingStats[]; // 채널별 발행 통계
  engagementStats?: ChannelEngagementStats[]; // 채널별 반응/도달 통계
  competitors: CompetitorActivity[];      // 경쟁업체 활동
  summary: string;              // AI가 생성한 요약 텍스트
  insights: string[];           // 핵심 인사이트
  recommendations: string[];    // 액션 아이템

  createdAt: string;
}

// 리포트 통합 타입
export type Report = MarketingReport;
