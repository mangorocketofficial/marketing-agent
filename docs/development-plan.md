# 개발 계획서 — NGO 마케팅 AI Agent

> 소규모 NGO 조직을 위한 마케팅 콘텐츠 자동 생성 및 발행 시스템

## 프로젝트 개요

## 진행 현황 (2026-02-20)

- [x] Phase 1 완료 (`packages/shared` 타입/상수 정리 완료)
- [x] Phase 2 착수 (`2-1 package.json` 반영 완료)

| 항목 | 내용 |
|------|------|
| 대상 | 소규모 NGO 조직 |
| 핵심 기능 | AI 기반 마케팅 콘텐츠 생성, 4채널 자동 발행, 후원자 관리 |
| 발행 채널 | Next.js 블로그 (자동) / 네이버 블로그 (HTML 검수 후 수동) / 인스타그램 (자동) / 쓰레드 (자동) |
| AI Agent | openclaw 프레임워크 기반 — 전략 수립, 스케줄링, 분석 |
| 커뮤니케이션 | 텔레그램 (openclaw 채널) |
| 배포 환경 | VPS (Linux) + Docker |
| 개발 환경 | WSL (Phase 2부터 전환) |

## 모노레포 구조

```
marketing-agent/
├── packages/shared/       ← 공유 타입, 상수, 유틸리티
├── apps/server/           ← Express 백엔드 (API, DB, 발행, 분석)
├── apps/admin/            ← Next.js 관리자 대시보드 (AI agent/통계/발행 관리)
├── apps/site/             ← Next.js 공개 사이트/블로그
└── openclaw/              ← AI agent 설정 및 스킬
```

---

## Phase 1: 기반 — packages/shared 완성

> 목표: 전체 프로젝트가 공유하는 타입과 상수를 확정한다.

타입 정의는 프로젝트의 "계약서" 역할.
서버, 블로그, openclaw 모두 이 타입을 기준으로 코드를 작성한다.

| 순서 | 파일 | 작업 |
|------|------|------|
| 1-1 | `types/customer.ts` | NGO 조직 특화로 수정 (BusinessType 변경) |
| 1-2 | `types/donor.ts` | 후원자 이메일 수신자 최소 타입(PII 최소화) 정의 |
| 1-3 | `types/report.ts` | 마케팅 리포트 타입(채널 성과 중심) 정리 |
| 1-4 | `types/agent.ts` | AI agent 전략/분석 관련 타입 작성 |
| 1-5 | `types/post.ts` | 필요 시 미세 조정 |
| 1-6 | `constants/index.ts` | Electron 상수 제거, NGO/후원자 관련 상수 추가 |

---

## Phase 2: 백엔드 — apps/server

> 목표: DB, API, 콘텐츠 생성, 발행, 후원자 관리까지 서버의 전체 기능을 구현한다.
>
> **이 Phase 시작 전 WSL 개발환경 전환 권장**

안쪽(DB)에서 바깥쪽(API)으로 진행한다.

### Phase 2 시작 체크리스트

- [x] WSL 개발환경 전환 완료 (Node.js 22+, npm, Git, Docker)
- [x] `2-1` `apps/server/package.json` 의존성/스크립트 설정
- [x] `2-2` `apps/server/tsconfig.json` TypeScript 설정 (base 상속)
- [x] DB 선택 확정 (개발: SQLite / 운영: PostgreSQL)
- [x] 로컬 PostgreSQL/Redis 실행 방식 확정 (Docker Compose 권장)
- [x] `.env`/`.env.example` 작성 (DB, Redis, OpenAI, SMTP, Meta, Telegram)
- [x] `2-3` DB 스키마 초안 작성 (`db/schema.ts`)
- [x] `2-4` DB 연결 설정 구현 (`db/index.ts`)
- [x] `2-5` Express 서버 부팅 및 라우트 등록 (`index.ts`)
- [x] `2-6` API 인증 방식 확정 및 미들웨어 기본 구현 (`api/middleware/auth.ts`)
- [x] BullMQ + Redis 연결 테스트 (큐 enqueue/dequeue 최소 1개)
- [x] 2-A 완료 기준 확인 후 2-B(API 라우트)로 진행
- 참고: Redis 테스트는 Docker Desktop `docker.exe`로 컨테이너 기동 후 검증 완료

### 2-A. 서버 기초

| 순서 | 파일 | 작업 |
|------|------|------|
| 2-1 | `package.json` | Express, DB 드라이버, BullMQ 등 의존성 설정 |
| 2-2 | `tsconfig.json` | TypeScript 설정 (base 상속) |
| 2-3 | `db/schema.ts` | DB 테이블 스키마 정의 |
| 2-4 | `db/index.ts` | DB 연결 설정 (PostgreSQL/SQLite) |
| 2-5 | `index.ts` | Express 서버 부팅, 라우트 등록 |
| 2-6 | `api/middleware/auth.ts` | API 인증 미들웨어 |

### 2-B. API 라우트

### Phase 2-B 진행 체크리스트

- [x] `2-7` `api/routes/customers.ts` NGO 고객 CRUD
- [x] `2-8` `api/routes/posts.ts` 포스팅 CRUD + 상태 관리
- [x] `2-9` `api/routes/donors.ts` 이메일 수신자 CRUD
- [x] `2-10` `api/routes/reports.ts` 리포트 조회 API

| 순서 | 파일 | 작업 |
|------|------|------|
| 2-7 | `api/routes/customers.ts` | NGO 고객 CRUD |
| 2-8 | `api/routes/posts.ts` | 포스팅 CRUD + 상태 관리 |
| 2-9 | `api/routes/donors.ts` | 이메일 수신자 CRUD |
| 2-10 | `api/routes/reports.ts` | 리포트 조회 API |

### 2-C. 서비스 레이어

### Phase 2-C 진행 체크리스트

- 원칙: `daily/weekly` 리포트는 마케팅 채널 성과(발행/도달/반응) 전용으로 운영하고, 후원자 데이터는 리포트 집계에서 분리한다.
- 원칙: 후원자 영역은 별도 이메일 콘텐츠 제작/발송 옵션으로 관리한다.

- [x] `2-11` `services/content/templates.ts` NGO 특화 콘텐츠 템플릿
- [x] `2-12` `services/content/generator.ts` LLM 기반 콘텐츠 생성
- [x] `2-13` `services/publishing/queue.ts` BullMQ 작업 큐 설정
- [x] `2-14` `services/publishing/scheduler.ts` 발행 스케줄러
- [x] `2-15` `services/publishing/nextjs-blog.ts` Next.js 블로그 자동 발행
- [x] `2-16` `services/publishing/instagram.ts` Meta Graph API — 인스타그램
- [x] `2-17` `services/publishing/threads.ts` Meta Graph API — 쓰레드
- [x] `2-18` `services/donor/manager.ts` 이메일 수신자 관리 서비스
- [x] `2-19` `services/donor/mailer.ts` 후원자용 이메일 콘텐츠 발송
- [x] `2-20` `services/monitoring/competitor.ts` 경쟁업체 모니터링
- [x] `2-21` `services/monitoring/publishing-stats.ts` 발행 통계/운영 안정성 분석
- [x] `2-22` `services/reporting/formatter.ts` 리포트 포매팅
- [x] `2-23` `services/reporting/daily.ts` 일간 리포트 생성
- [x] `2-24` `services/reporting/weekly.ts` 주간 마케팅 리포트 생성
- [x] `2-25` `api/routes/agent.ts` openclaw 연동 API 엔드포인트

| 순서 | 파일 | 작업 |
|------|------|------|
| 2-11 | `services/content/templates.ts` | NGO 특화 콘텐츠 템플릿 |
| 2-12 | `services/content/generator.ts` | LLM 기반 콘텐츠 생성 |
| 2-13 | `services/publishing/queue.ts` | BullMQ 작업 큐 설정 |
| 2-14 | `services/publishing/scheduler.ts` | 발행 스케줄러 |
| 2-15 | `services/publishing/nextjs-blog.ts` | Next.js 블로그 자동 발행 |
| 2-16 | `services/publishing/instagram.ts` | Meta Graph API — 인스타그램 |
| 2-17 | `services/publishing/threads.ts` | Meta Graph API — 쓰레드 |
| 2-18 | `services/donor/manager.ts` | 이메일 수신자 관리 서비스 |
| 2-19 | `services/donor/mailer.ts` | 후원자용 이메일 콘텐츠 발송 |
| 2-20 | `services/monitoring/competitor.ts` | 경쟁업체 모니터링 |
| 2-21 | `services/monitoring/publishing-stats.ts` | 발행 통계/운영 안정성 분석 |
| 2-22 | `services/reporting/formatter.ts` | 리포트 포매팅 |
| 2-23 | `services/reporting/daily.ts` | 일간 리포트 생성 |
| 2-24 | `services/reporting/weekly.ts` | 주간 마케팅 리포트 생성 |
| 2-25 | `api/routes/agent.ts` | openclaw 연동 API 엔드포인트 |

---

## Phase 3: 프론트엔드 — apps/admin + apps/site (Next.js)

> 목표: 관리자 대시보드와 공개 사이트를 분리해 구현한다.

서버 API가 있어야 블로그가 데이터를 가져올 수 있으므로 Phase 2 이후에 진행한다.

| 순서 | 파일 | 작업 |
|------|------|------|
| 3-1 | `apps/admin/package.json`, `tsconfig.json`, `next.config.js` | 관리자 Next.js 설정 |
| 3-2 | `apps/admin/src/lib/api.ts` | Server API 클라이언트 유틸 |
| 3-3 | `apps/admin/src/app/layout.tsx` | 관리자 루트 레이아웃 |
| 3-4 | `apps/admin/src/app/page.tsx` | 관리자 대시보드 홈 |
| 3-5 | `apps/admin/src/app/reports/page.tsx` | 리포트/통계 조회 화면 |
| 3-6 | `apps/admin/src/app/publishing/page.tsx` | 발행 관리/검수 보드 |
| 3-7 | `apps/site/package.json`, `tsconfig.json`, `next.config.js` | 공개 사이트 Next.js 설정 |
| 3-8 | `apps/site/src/app/page.tsx` | 공개 메인/포스트 목록 |
| 3-9 | `apps/site/src/app/posts/[slug]/page.tsx` | 공개 포스트 상세 |

---

## Phase 4: AI Agent — openclaw

> 목표: openclaw 스킬을 통해 마케팅 전략 수립, 스케줄링, 분석을 자동화한다.

서버 API가 준비된 후, 각 스킬에서 서버 API를 호출하는 구조.

| 순서 | 파일 | 작업 |
|------|------|------|
| 4-1 | `config.yml` | Telegram 채널 연결, LLM 모델 설정 |
| 4-2 | `skills/schedule-posts.ts` | 포스팅 스케줄링 (서버 API 호출) |
| 4-3 | `skills/marketing-strategy.ts` | 위클리 마케팅 전략 수립 |
| 4-4 | `skills/analyze-performance.ts` | 성과 분석 |
| 4-5 | `skills/competitor-report.ts` | 경쟁업체 분석 |
| 4-6 | `skills/donor-report.ts` | 후원자 이메일 발송 트리거 |

---

## Phase 5: 인프라 & 배포

> 목표: Docker 기반 배포 환경을 구성하고 VPS에서 24시간 가동한다.

| 순서 | 작업 | 설명 |
|------|------|------|
| 5-1 | WSL 개발환경 구성 | Node.js 22+, Docker, Git 설정 |
| 5-2 | Docker Compose | server + PostgreSQL + Redis 컨테이너 구성 |
| 5-3 | Dockerfile 작성 | server, admin, site 각각 |
| 5-4 | VPS 배포 | 서버 + admin + site + openclaw 배포 |
| 5-5 | openclaw 상시 가동 | Telegram 채널 연결 + 24시간 운영 |

---

## Phase 진행 흐름

```
Phase 1  ███  shared 타입/상수 완성 (Windows에서 진행)
              ↓
         ── WSL 개발환경 전환 ──
              ↓
Phase 2  ████████████  server (DB → API → 서비스)
              ↓
Phase 3  ██████  admin + site (Next.js)  ← 동시 진행 가능
Phase 4  ██████  openclaw (스킬)    ← 동시 진행 가능
              ↓
Phase 5  ████  인프라/배포 (Docker, VPS)
```

---

## 기술 스택 요약

| 영역 | 기술 |
|------|------|
| 모노레포 | npm workspaces |
| 언어 | TypeScript (전체 통일) |
| 서버 | Express |
| DB | PostgreSQL (프로덕션) / SQLite (개발) |
| 작업 큐 | BullMQ + Redis |
| LLM | OpenAI API |
| 블로그 | Next.js (App Router) |
| SNS 발행 | Meta Graph API (인스타그램, 쓰레드) |
| AI Agent | openclaw |
| 커뮤니케이션 | Telegram (openclaw 채널) |
| 이메일 | SMTP (후원자 이메일 콘텐츠 발송) |
| 배포 | Docker + VPS |
