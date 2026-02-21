// Donor domain is intentionally minimized for the marketing-agent boundary.
// We only keep email-delivery related types here (no donation/payment fields).

export type RecipientStatus = 'active' | 'paused' | 'unsubscribed';

// Email recipient profile (PII-minimized)
export interface DonorRecipient {
  id: string;
  customerId: string;
  name: string;
  email: string;
  receiveReport: boolean;
  status: RecipientStatus;
  createdAt: string;
  updatedAt: string;
}

// Optional list metadata when customer uploads/maintains recipient lists.
export interface RecipientList {
  id: string;
  customerId: string;
  name: string;
  source: 'manual' | 'csv' | 'api';
  recipientCount: number;
  createdAt: string;
  updatedAt: string;
}

// Email content payload for donor-facing communication.
export interface DonorEmailContent {
  customerId: string;
  title: string;
  message: string;
  highlights: string[];
  periodStart: string;
  periodEnd: string;
}
