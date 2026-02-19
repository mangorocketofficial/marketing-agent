import { PostChannel } from './post';

// 고객 업종
export type BusinessType =
  | 'cafe'           // 카페
  | 'restaurant'     // 음식점
  | 'beauty'         // 미용실/네일샵
  | 'clinic'         // 병원/의원
  | 'fitness'        // 피트니스/요가
  | 'academy'        // 학원/교육
  | 'other';         // 기타

// 포스팅 스케줄 설정
export interface PostingSchedule {
  channels: PostChannel[];      // 발행할 채널 목록
  postsPerDay: number;          // 하루 포스팅 수
  preferredHours: number[];     // 선호 발행 시간 (0~23, 예: [9, 14, 19])
  daysOfWeek: number[];         // 발행 요일 (0=일, 1=월, ... 6=토)
}

// 고객 정보
export interface Customer {
  id: string;
  name: string;                  // 업체명
  businessType: BusinessType;    // 업종
  keywords: string[];            // 마케팅 키워드 (예: ['강남카페', '브런치맛집'])
  location: string;              // 지역 (예: '서울 강남구')

  schedule: PostingSchedule;     // 포스팅 스케줄 설정

  naverBlogId?: string;          // 네이버 블로그 ID (있는 경우)
  instagramAccount?: string;     // 인스타그램 계정
  telegramChatId?: string;       // 텔레그램 알림 받을 chat ID

  isActive: boolean;             // 서비스 활성 상태
  createdAt: string;
  updatedAt: string;
}
