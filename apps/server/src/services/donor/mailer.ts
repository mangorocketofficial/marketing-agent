import { config as loadEnv } from 'dotenv';
import nodemailer from 'nodemailer';
import type { DatabaseClient } from '../../db';
import { listMailRecipients } from './manager';

loadEnv();

export interface DonorWeeklyMailInput {
  customerId: string;
  periodStart: string;
  periodEnd: string;
  title: string;
  message: string;
  highlights?: string[];
}

export interface MailDeliveryResult {
  recipientId: string;
  email: string;
  success: boolean;
  error?: string;
}

export interface MailBatchResult {
  recipientCount: number;
  successCount: number;
  failCount: number;
  deliveries: MailDeliveryResult[];
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is not configured`);
  }
  return value.trim();
}

function buildHtml(input: DonorWeeklyMailInput, recipientName: string): string {
  const highlights = input.highlights ?? [];
  const highlightsHtml = highlights.length
    ? `<ul>${highlights.map((item) => `<li>${item}</li>`).join('')}</ul>`
    : '<p>- 이번 주 주요 활동 요약이 준비되지 않았습니다.</p>';

  return `
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
  <h2>${input.title}</h2>
  <p>안녕하세요, ${recipientName} 님.</p>
  <p>보고 기간: ${input.periodStart} ~ ${input.periodEnd}</p>
  <p>${input.message}</p>
  <h3>이번 주 주요 내용</h3>
  ${highlightsHtml}
  <p>늘 함께해주셔서 감사합니다.</p>
</div>
`.trim();
}

function buildText(input: DonorWeeklyMailInput, recipientName: string): string {
  const highlights = (input.highlights ?? []).map((item) => `- ${item}`).join('\n');
  return [
    `${input.title}`,
    '',
    `안녕하세요, ${recipientName} 님.`,
    `보고 기간: ${input.periodStart} ~ ${input.periodEnd}`,
    '',
    input.message,
    '',
    '이번 주 주요 내용',
    highlights || '- 이번 주 주요 활동 요약이 준비되지 않았습니다.',
    '',
    '늘 함께해주셔서 감사합니다.',
  ].join('\n');
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function sendDonorWeeklyReportMail(
  db: DatabaseClient,
  input: DonorWeeklyMailInput,
): Promise<MailBatchResult> {
  const smtpHost = getRequiredEnv('SMTP_HOST');
  const smtpPort = Number(getRequiredEnv('SMTP_PORT'));
  const smtpUser = getRequiredEnv('SMTP_USER');
  const smtpPass = getRequiredEnv('SMTP_PASS');
  const mailFrom = getRequiredEnv('MAIL_FROM');

  const recipients = await listMailRecipients(db, input.customerId);
  if (!recipients.length) {
    return {
      recipientCount: 0,
      successCount: 0,
      failCount: 0,
      deliveries: [],
    };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const deliveries: MailDeliveryResult[] = [];

  for (const recipient of recipients) {
    try {
      await transporter.sendMail({
        from: mailFrom,
        to: recipient.email,
        subject: `[주간 리포트] ${input.title}`,
        text: buildText(input, recipient.name),
        html: buildHtml(input, recipient.name),
      });

      deliveries.push({
        recipientId: recipient.id,
        email: recipient.email,
        success: true,
      });
    } catch (error) {
      deliveries.push({
        recipientId: recipient.id,
        email: recipient.email,
        success: false,
        error: toErrorMessage(error),
      });
    }
  }

  const successCount = deliveries.filter((delivery) => delivery.success).length;
  const failCount = deliveries.length - successCount;

  return {
    recipientCount: deliveries.length,
    successCount,
    failCount,
    deliveries,
  };
}
