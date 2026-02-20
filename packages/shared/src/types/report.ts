import { PostChannel } from './post';

// ── 리포트 공통 ──

// 리포트 종류
export type ReportType =
  | 'daily'              // 일간 마케팅 리포트 (내부용)
  | 'weekly'             // 주간 마케팅 리포트 (내부용)
  | 'donor-weekly';      // 주간 후원자 리포트 (후원자에게 이메일 발송)

// ── 마케팅 리포트 ──

// 채널별 포스팅 통계
export interface ChannelStats {
  channel: PostChannel;
  totalPosts: number;          // 발행된 포스팅 수
  successCount: number;        // 성공 수
  failCount: number;           // 실패 수
}

// 경쟁업체 활동 요약
export interface CompetitorActivity {
  competitorName: string;       // 경쟁업체명
  newPosts: number;             // 신규 포스팅 수
  topKeywords: string[];        // 주요 키워드
}

// 마케팅 리포트 (내부용 — daily / weekly)
// NGO 관리자가 마케팅 성과를 확인하는 용도.
export interface MarketingReport {
  id: string;
  customerId: string;
  type: 'daily' | 'weekly';
  periodStart: string;          // 리포트 기간 시작 (ISO 8601)
  periodEnd: string;            // 리포트 기간 끝

  channelStats: ChannelStats[];           // 채널별 통계
  competitors: CompetitorActivity[];      // 경쟁업체 활동
  summary: string;              // AI가 생성한 요약 텍스트

  createdAt: string;
}

// ── 후원자 리포트 ──

// 후원 현황 요약
export interface DonationSummary {
  totalDonors: number;           // 전체 후원자 수
  newDonors: number;             // 이번 주 신규 후원자 수
  totalAmount: number;           // 이번 주 총 후원 금액 (원)
  monthlyAmount: number;         // 이번 달 정기 후원 총액 (원)
}

// 마케팅 활동 요약 (후원자에게 보여줄 간소화된 버전)
export interface ActivityHighlight {
  channel: PostChannel;
  postCount: number;             // 이번 주 발행 수
  topPostTitle?: string;         // 가장 반응 좋은 포스팅 제목
  topPostUrl?: string;           // 해당 포스팅 URL
}

// 후원자 리포트 (후원자에게 이메일로 발송)
// "당신의 후원금으로 이런 활동을 하고 있습니다"를 전달하는 용도.
export interface DonorReport {
  id: string;
  customerId: string;
  type: 'donor-weekly';
  periodStart: string;
  periodEnd: string;

  donationSummary: DonationSummary;       // 후원 현황
  activities: ActivityHighlight[];         // 이번 주 마케팅 활동 하이라이트
  message: string;                         // AI가 생성한 감사 메시지

  sentAt?: string;               // 이메일 발송 시간
  recipientCount: number;        // 발송 대상 후원자 수
  createdAt: string;
}

// 리포트 통합 타입 (MarketingReport 또는 DonorReport)
export type Report = MarketingReport | DonorReport;
