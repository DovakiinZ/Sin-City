// api/lib/verification-state.ts
export type AccountStatus = 'active' | 'verification_overdue' | 'suspended';
export type Channel = 'email' | 'phone';

export interface VerificationRow {
  created_at: string;
  verification_deadline: string;
  verified_at: string | null;
  verified_channel: Channel | null;
  account_status: AccountStatus;
  reminders_sent: number;
  last_reminder_sent_at: string | null;
  last_sent_at: string | null;
  send_count: number;
  otp_attempts: number;
}

export const GRACE_MS = 5 * 24 * 60 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_SENDS_PER_DAY = 5;
export const OTP_TTL_MS = 600_000;      // 10 minutes
export const MAX_OTP_ATTEMPTS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const H48 = 48 * 60 * 60 * 1000;
const H6 = 6 * 60 * 60 * 1000;

export function computeDeadline(createdAtIso: string, launchDateIso: string): string {
  const floor = Math.max(Date.parse(createdAtIso), Date.parse(launchDateIso));
  return new Date(floor + GRACE_MS).toISOString();
}
export function remainingMs(nowIso: string, deadlineIso: string): number {
  return Date.parse(deadlineIso) - Date.parse(nowIso);
}
export function isVerified(row: VerificationRow): boolean { return row.verified_at != null; }
export function isRestricted(row: VerificationRow): boolean {
  return row.account_status === 'verification_overdue' || row.account_status === 'suspended';
}
export function shouldRestrict(row: VerificationRow, nowIso: string): boolean {
  return row.account_status === 'active' && !isVerified(row)
    && remainingMs(nowIso, row.verification_deadline) <= 0;
}
export function dueReminderStage(row: VerificationRow, nowIso: string): 0 | 1 | 2 | 3 {
  if (isVerified(row) || isRestricted(row)) return 0;
  const now = Date.parse(nowIso);
  if (row.last_reminder_sent_at && now - Date.parse(row.last_reminder_sent_at) < DAY_MS) return 0;
  const sinceSignup = now - Date.parse(row.created_at);
  const remain = Date.parse(row.verification_deadline) - now;
  const sent = row.reminders_sent;
  if (!(sent & 0b100) && remain <= H6 && remain > 0) return 3;
  if (!(sent & 0b010) && remain <= H48 && remain > 0) return 2;
  if (!(sent & 0b001) && sinceSignup >= 2 * DAY_MS && remain > 0) return 1;
  return 0;
}
export function canResendUser(row: VerificationRow, nowIso: string): { ok: boolean; reason?: 'cooldown' | 'rate_limit' } {
  const now = Date.parse(nowIso);
  if (row.last_sent_at && now - Date.parse(row.last_sent_at) < RESEND_COOLDOWN_MS) return { ok: false, reason: 'cooldown' };
  if (row.send_count >= MAX_SENDS_PER_DAY) return { ok: false, reason: 'rate_limit' };
  return { ok: true };
}
export function otpAttemptsExceeded(row: VerificationRow): boolean { return row.otp_attempts >= MAX_OTP_ATTEMPTS; }
export function stageBit(stage: 1 | 2 | 3): number { return 1 << (stage - 1); }
export function generateOtp(): string { return String(Math.floor(100000 + Math.random() * 900000)); }
