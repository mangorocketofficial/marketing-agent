// 서버 → Electron으로 보내는 명령 종류
export type CommandType =
  | 'publish-naver'       // 네이버 블로그 글 발행해라
  | 'check-session'       // 네이버 로그인 세션 살아있는지 확인해라
  | 'refresh-session';    // 네이버 세션 갱신해라

// 서버 → Electron: 명령 메시지
export interface Command {
  id: string;                   // 명령 고유 ID (응답과 매칭용)
  type: CommandType;            // 명령 종류
  payload: Record<string, unknown>;  // 명령에 필요한 데이터 (명령마다 다름)
  createdAt: string;
}

// Electron → 서버: 명령 실행 결과
export interface CommandResult {
  commandId: string;            // 어떤 명령에 대한 결과인지
  success: boolean;             // 성공/실패
  data?: Record<string, unknown>;    // 성공 시 결과 데이터
  errorMessage?: string;        // 실패 시 에러 메시지
  completedAt: string;
}

// Electron → 서버: 에이전트 상태 보고 (heartbeat)
export interface AgentHeartbeat {
  customerId: string;           // 어떤 고객의 PC인지
  status: 'online' | 'busy' | 'error';  // 현재 상태
  sessionValid: boolean;        // 네이버 로그인 세션 유효 여부
  currentTask?: string;         // 현재 수행 중인 작업 (있다면)
  timestamp: string;
}
