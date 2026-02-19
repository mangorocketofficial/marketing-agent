import { PostChannel } from './post';

// 리포트 종류
export type ReportType = 'daily' | 'weekly';

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

// 마케팅 리포트
export interface Report {
  id: string;
  customerId: string;
  type: ReportType;             // 일간 / 주간
  periodStart: string;          // 리포트 기간 시작 (ISO 8601)
  periodEnd: string;            // 리포트 기간 끝

  channelStats: ChannelStats[];           // 채널별 통계
  competitors: CompetitorActivity[];      // 경쟁업체 활동
  summary: string;              // AI가 생성한 요약 텍스트

  createdAt: string;
}
