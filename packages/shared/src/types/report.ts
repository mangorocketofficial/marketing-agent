import { PostChannel } from './post';

// ── 리포트 종류 ──

export type ReportType =
  | 'marketing-daily'        // 일간 마케팅 리포트 (내부용)
  | 'marketing-weekly'       // 주간 마케팅 리포트 (내부용)
  | 'donor-weekly';          // 주간 후원자 리포트 (후원자에게 이메일 발송)

// ══════════════════════════════════════════
// 마케팅 리포트 (내부용)
// NGO 관리자가 마케팅 성과를 확인하는 용도.
// ══════════════════════════════════════════

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

// 후원 현황 요약 (내부용 — 관리자가 후원 상황을 파악하는 용도)
export interface DonationSummary {
  totalDonors: number;           // 전체 후원자 수
  newDonors: number;             // 이번 주 신규 후원자 수
  totalAmount: number;           // 이번 주 총 후원 금액 (원)
  monthlyAmount: number;         // 이번 달 정기 후원 총액 (원)
}

// 마케팅 리포트
export interface MarketingReport {
  id: string;
  customerId: string;
  type: 'marketing-daily' | 'marketing-weekly';
  periodStart: string;          // 리포트 기간 시작 (ISO 8601)
  periodEnd: string;            // 리포트 기간 끝

  channelStats: ChannelStats[];           // 채널별 포스팅 통계
  competitors: CompetitorActivity[];      // 경쟁업체 활동
  donationSummary: DonationSummary;       // 후원 현황 (내부 확인용)
  summary: string;              // AI가 생성한 요약 텍스트

  createdAt: string;
}

// ══════════════════════════════════════════
// 후원자 리포트 (후원자에게 이메일로 발송)
// "당신의 후원 덕분에 이런 활동을 하고 있습니다"를 전달하는 용도.
// 마케팅 성과가 아니라 단체의 실제 활동을 공유한다.
// ══════════════════════════════════════════

// 단체 활동 내역 (이번 주에 무엇을 했는지)
export interface OrgActivity {
  title: string;                 // 활동 제목 (예: '한강 플로깅 캠페인 진행')
  description: string;           // 활동 설명
  date: string;                  // 활동 일자 (ISO 8601)
  imageUrl?: string;             // 활동 사진 URL (있으면)
}

// 후원자 리포트
export interface DonorReport {
  id: string;
  customerId: string;
  type: 'donor-weekly';
  periodStart: string;
  periodEnd: string;

  activities: OrgActivity[];               // 이번 주 단체 활동 내역
  message: string;                         // AI가 생성한 감사/근황 메시지

  sentAt?: string;               // 이메일 발송 시간
  recipientCount: number;        // 발송 대상 후원자 수
  createdAt: string;
}

// 리포트 통합 타입
export type Report = MarketingReport | DonorReport;
