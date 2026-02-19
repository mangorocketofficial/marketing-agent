import { PostChannel, PostStatus } from '../types/post';
import { BusinessType } from '../types/customer';

// ── 채널 관련 ──

// 지원하는 전체 채널 목록
export const ALL_CHANNELS: PostChannel[] = [
  'naver-blog',
  'instagram',
  'threads',
  'nextjs-blog',
];

// 클라우드 서버에서 직접 발행 가능한 채널
export const CLOUD_CHANNELS: PostChannel[] = [
  'instagram',
  'threads',
  'nextjs-blog',
];

// 로컬 Electron 경유가 필요한 채널
export const LOCAL_CHANNELS: PostChannel[] = [
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

// 상태 한글 이름 매핑
export const STATUS_LABELS: Record<PostStatus, string> = {
  draft: '초안',
  pending: '승인 대기',
  approved: '승인됨',
  publishing: '발행 중',
  published: '발행 완료',
  failed: '발행 실패',
};

// ── 업종 관련 ──

// 업종 한글 이름 매핑
export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  'cafe': '카페',
  'restaurant': '음식점',
  'beauty-nail': '네일샵',
  'beauty-hair': '미용실',
  'beauty-skin': '피부관리',
  'beauty-makeup': '메이크업',
  'clinic': '병원/의원',
  'fitness': '피트니스/요가',
  'academy': '학원/교육',
  'other': '기타',
};

// ── 에이전트 통신 관련 ──

export const HEARTBEAT_INTERVAL_MS = 30_000;        // heartbeat 전송 주기: 30초
export const HEARTBEAT_TIMEOUT_MS = 90_000;          // 이 시간 동안 heartbeat 없으면 오프라인 판정: 90초
export const COMMAND_TIMEOUT_MS = 300_000;            // 명령 실행 타임아웃: 5분

// ── 포스팅 관련 ──

export const MAX_RETRY_COUNT = 3;                     // 발행 실패 시 최대 재시도 횟수
export const DEFAULT_POSTS_PER_DAY = 1;               // 기본 하루 포스팅 수
