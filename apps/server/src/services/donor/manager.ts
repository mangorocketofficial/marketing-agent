import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../db';

export type RecipientStatus = 'active' | 'paused' | 'unsubscribed';

export interface RecipientRecord {
  id: string;
  customerId: string;
  name: string;
  email: string;
  receiveReport: boolean;
  status: RecipientStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RecipientSummary {
  totalRecipients: number;
  activeRecipients: number;
  pausedRecipients: number;
  unsubscribedRecipients: number;
  mailableRecipients: number;
}

export interface MailRecipient {
  id: string;
  name: string;
  email: string;
}

type RecipientInput = Omit<RecipientRecord, 'id' | 'createdAt' | 'updatedAt'>;
type RecipientUpdateInput = Partial<RecipientInput>;

interface DonorRow {
  id: string;
  customer_id: string;
  name: string;
  email: string;
  status: string;
  receive_report: boolean | number;
  created_at: string;
  updated_at: string;
}

interface RecipientSummaryRow {
  total_recipients: number;
  active_recipients: number;
  paused_recipients: number;
  unsubscribed_recipients: number;
  mailable_recipients: number;
}

function getParamPlaceholder(dialect: DatabaseClient['dialect'], index: number): string {
  return dialect === 'postgres' ? `$${index}` : '?';
}

function normalizeStatusFromDb(status: string): RecipientStatus {
  if (status === 'active' || status === 'paused') {
    return status;
  }
  return 'unsubscribed';
}

function normalizeStatusToDb(status: RecipientStatus): 'active' | 'paused' | 'inactive' {
  if (status === 'active' || status === 'paused') {
    return status;
  }
  return 'inactive';
}

function toRecipient(row: DonorRow): RecipientRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    name: row.name,
    email: row.email,
    status: normalizeStatusFromDb(row.status),
    receiveReport: Boolean(row.receive_report),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getRecipientById(
  db: DatabaseClient,
  recipientId: string,
): Promise<RecipientRecord | null> {
  const idPlaceholder = getParamPlaceholder(db.dialect, 1);
  const rows = await db.query<DonorRow>(`SELECT * FROM donors WHERE id = ${idPlaceholder} LIMIT 1`, [recipientId]);
  return rows.length ? toRecipient(rows[0]) : null;
}

export async function listRecipientsByCustomer(
  db: DatabaseClient,
  customerId: string,
): Promise<RecipientRecord[]> {
  const customerPlaceholder = getParamPlaceholder(db.dialect, 1);
  const rows = await db.query<DonorRow>(
    `SELECT * FROM donors WHERE customer_id = ${customerPlaceholder} ORDER BY created_at DESC`,
    [customerId],
  );
  return rows.map(toRecipient);
}

export async function listMailRecipients(
  db: DatabaseClient,
  customerId: string,
): Promise<MailRecipient[]> {
  const customerPlaceholder = getParamPlaceholder(db.dialect, 1);
  const receiveReportSql = db.dialect === 'postgres' ? 'TRUE' : '1';
  const rows = await db.query<MailRecipient>(
    `SELECT id, name, email
     FROM donors
     WHERE customer_id = ${customerPlaceholder}
       AND receive_report = ${receiveReportSql}
       AND status IN ('active', 'paused')
     ORDER BY created_at ASC`,
    [customerId],
  );
  return rows;
}

export async function createRecipient(
  db: DatabaseClient,
  input: RecipientInput,
): Promise<RecipientRecord> {
  const now = new Date().toISOString();
  const recipientId = randomUUID();
  const dbStatus = normalizeStatusToDb(input.status);

  const sql =
    db.dialect === 'postgres'
      ? `INSERT INTO donors (
           id, customer_id, name, email, phone, donation_type, monthly_amount, total_donated,
           status, receive_report, last_donated_at, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
         )`
      : `INSERT INTO donors (
           id, customer_id, name, email, phone, donation_type, monthly_amount, total_donated,
           status, receive_report, last_donated_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  await db.execute(sql, [
    recipientId,
    input.customerId,
    input.name,
    input.email,
    null,
    'one-time',
    null,
    0,
    dbStatus,
    input.receiveReport,
    null,
    now,
    now,
  ]);

  const created = await getRecipientById(db, recipientId);
  if (!created) {
    throw new Error(`failed to create recipient: ${recipientId}`);
  }
  return created;
}

export async function updateRecipient(
  db: DatabaseClient,
  recipientId: string,
  input: RecipientUpdateInput,
): Promise<RecipientRecord | null> {
  const existing = await getRecipientById(db, recipientId);
  if (!existing) {
    return null;
  }

  const merged: RecipientRecord = {
    ...existing,
    ...input,
    id: existing.id,
    updatedAt: new Date().toISOString(),
  };

  const dbStatus = normalizeStatusToDb(merged.status);
  const sql =
    db.dialect === 'postgres'
      ? `UPDATE donors SET
           customer_id = $1,
           name = $2,
           email = $3,
           status = $4,
           receive_report = $5,
           updated_at = $6
         WHERE id = $7`
      : `UPDATE donors SET
           customer_id = ?,
           name = ?,
           email = ?,
           status = ?,
           receive_report = ?,
           updated_at = ?
         WHERE id = ?`;

  await db.execute(sql, [
    merged.customerId,
    merged.name,
    merged.email,
    dbStatus,
    merged.receiveReport,
    merged.updatedAt,
    recipientId,
  ]);

  return getRecipientById(db, recipientId);
}

export async function removeRecipient(db: DatabaseClient, recipientId: string): Promise<boolean> {
  const existing = await getRecipientById(db, recipientId);
  if (!existing) {
    return false;
  }

  const idPlaceholder = getParamPlaceholder(db.dialect, 1);
  await db.execute(`DELETE FROM donors WHERE id = ${idPlaceholder}`, [recipientId]);
  return true;
}

export async function getRecipientSummary(
  db: DatabaseClient,
  customerId: string,
): Promise<RecipientSummary> {
  const customerPlaceholder = getParamPlaceholder(db.dialect, 1);
  const receiveReportSql = db.dialect === 'postgres' ? 'TRUE' : '1';

  const rows = await db.query<RecipientSummaryRow>(
    `SELECT
       COUNT(*) AS total_recipients,
       SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_recipients,
       SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) AS paused_recipients,
       SUM(CASE WHEN status NOT IN ('active', 'paused') THEN 1 ELSE 0 END) AS unsubscribed_recipients,
       SUM(CASE WHEN status IN ('active', 'paused') AND receive_report = ${receiveReportSql} THEN 1 ELSE 0 END) AS mailable_recipients
     FROM donors
     WHERE customer_id = ${customerPlaceholder}`,
    [customerId],
  );

  const row = rows[0];
  return {
    totalRecipients: Number(row?.total_recipients ?? 0),
    activeRecipients: Number(row?.active_recipients ?? 0),
    pausedRecipients: Number(row?.paused_recipients ?? 0),
    unsubscribedRecipients: Number(row?.unsubscribed_recipients ?? 0),
    mailableRecipients: Number(row?.mailable_recipients ?? 0),
  };
}
