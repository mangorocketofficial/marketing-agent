import { PostChannel } from './post';

// NGO 조직 분야
// 마케팅 콘텐츠의 톤과 키워드 전략이 분야별로 달라지므로 구분한다.
export type OrganizationType =
  | 'environment'       // 환경
  | 'education'         // 교육
  | 'human-rights'      // 인권
  | 'animal'            // 동물 보호
  | 'welfare'           // 복지 (아동, 노인, 장애인 등)
  | 'health'            // 보건/의료
  | 'culture'           // 문화/예술
  | 'community'         // 지역사회/마을
  | 'international'     // 국제 협력/개발
  | 'other';            // 기타

// 포스팅 스케줄 설정
// 어떤 채널에, 얼마나 자주, 언제 발행할지를 정의한다.
export interface PostingSchedule {
  channels: PostChannel[];      // 발행할 채널 목록
  postsPerDay: number;          // 하루 포스팅 수
  preferredHours: number[];     // 선호 발행 시간 (0~23, 예: [9, 14, 19])
  daysOfWeek: number[];         // 발행 요일 (0=일, 1=월, ... 6=토)
}

// NGO 고객(단체) 정보
// 이 프로젝트의 "고객"은 마케팅 서비스를 이용하는 NGO 단체를 의미한다.
export interface Customer {
  id: string;
  name: string;                        // 단체명 (예: '초록우산 어린이재단')
  organizationType: OrganizationType;  // 조직 분야
  description: string;                 // 단체 소개 (LLM 콘텐츠 생성 시 참조)
  mission: string;                     // 미션/비전 (콘텐츠 톤과 방향 결정에 사용)
  keywords: string[];                  // 마케팅 키워드 (예: ['아동복지', '기부캠페인'])
  location: string;                    // 소재지 (예: '서울 마포구')

  schedule: PostingSchedule;           // 포스팅 스케줄 설정

  // 발행 채널 계정 정보
  naverBlogId?: string;                // 네이버 블로그 ID
  instagramAccount?: string;           // 인스타그램 계정
  threadsAccount?: string;             // 쓰레드 계정
  blogUrl?: string;                    // Next.js 블로그 URL

  telegramChatId?: string;             // 텔레그램 알림 받을 chat ID

  isActive: boolean;                   // 서비스 활성 상태
  createdAt: string;
  updatedAt: string;
}
