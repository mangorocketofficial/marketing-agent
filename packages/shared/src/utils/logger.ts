import { formatDate, formatTime, nowKST } from './date';

// 로그 레벨
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

// 로그 출력 시 KST 타임스탬프를 붙여서 통일된 형식으로 출력
function formatLog(level: LogLevel, source: string, message: string): string {
  const now = nowKST();
  const timestamp = `${formatDate(now)} ${formatTime(now)}`;
  return `[${timestamp}] [${level.toUpperCase()}] [${source}] ${message}`;
}

// 로거 생성 함수 — 각 앱에서 source 이름을 지정하여 사용
export function createLogger(source: string) {
  return {
    info: (message: string) => {
      console.log(formatLog('info', source, message));
    },
    warn: (message: string) => {
      console.warn(formatLog('warn', source, message));
    },
    error: (message: string) => {
      console.error(formatLog('error', source, message));
    },
    debug: (message: string) => {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(formatLog('debug', source, message));
      }
    },
  };
}
