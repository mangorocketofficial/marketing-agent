// 후원 유형
export type DonationType =
  | 'monthly'        // 정기 후원 (매월 자동)
  | 'one-time'       // 일시 후원
  | 'corporate';     // 기업 후원

// 후원 상태
export type DonorStatus =
  | 'active'         // 활성 (정기 후원 진행 중 또는 최근 후원 이력 있음)
  | 'paused'         // 일시 중지 (정기 후원 중단)
  | 'inactive';      // 비활성 (장기간 후원 없음)

// 후원자 정보
// 하나의 후원자는 하나의 Customer(NGO 단체)에 소속된다.
export interface Donor {
  id: string;
  customerId: string;              // 어떤 NGO 단체의 후원자인지

  name: string;                    // 후원자 이름 (개인명 또는 기업명)
  email: string;                   // 이메일 (위클리 리포트 발송 대상)
  phone?: string;                  // 연락처 (선택)

  donationType: DonationType;      // 후원 유형
  monthlyAmount?: number;          // 정기 후원 월 금액 (원)
  totalDonated: number;            // 누적 후원 금액 (원)

  status: DonorStatus;             // 후원 상태
  receiveReport: boolean;          // 위클리 리포트 수신 여부

  lastDonatedAt?: string;          // 마지막 후원일 (ISO 8601)
  createdAt: string;
  updatedAt: string;
}

// 개별 후원 기록
// 후원이 발생할 때마다 하나의 Donation 레코드가 생성된다.
export interface Donation {
  id: string;
  donorId: string;                 // 어떤 후원자의 후원인지
  customerId: string;              // 어떤 NGO 단체에 대한 후원인지

  amount: number;                  // 후원 금액 (원)
  donationType: DonationType;      // 이 건의 후원 유형
  note?: string;                   // 메모 (예: '연말 특별 기부')

  donatedAt: string;               // 후원 일시 (ISO 8601)
  createdAt: string;
}
