// 포스팅이 발행될 채널
export type PostChannel = 'naver-blog' | 'instagram' | 'threads' | 'nextjs-blog';

// 포스팅의 현재 상태
export type PostStatus =
  | 'draft'        // 초안 (LLM이 생성한 직후)
  | 'review'       // 검수 중 (HTML 검수 보드에 올라감 — 네이버 블로그용)
  | 'approved'     // 승인됨 (자동 발행 큐에 등록됨, 또는 유저가 복붙 완료)
  | 'publishing'   // 발행 중 (자동 발행 채널만 해당)
  | 'published'    // 발행 완료
  | 'failed';      // 발행 실패

// 포스팅 데이터
export interface Post {
  id: string;
  customerId: string;          // 어떤 NGO 단체의 포스팅인지
  channel: PostChannel;        // 어디에 발행할지
  status: PostStatus;          // 현재 상태

  title: string;               // 제목
  content: string;             // 본문 (HTML 또는 마크다운)
  images: string[];            // 이미지 URL 목록
  tags: string[];              // 해시태그 / 키워드

  scheduledAt: string;         // 예약 발행 시간 (ISO 8601)
  publishedAt?: string;        // 실제 발행된 시간
  publishedUrl?: string;       // 발행된 글의 URL

  errorMessage?: string;       // 실패 시 에러 메시지
  retryCount: number;          // 재시도 횟수

  createdAt: string;
  updatedAt: string;
}
