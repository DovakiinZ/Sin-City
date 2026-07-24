// api/lib/__tests__/verification-state.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeDeadline, remainingMs, isVerified, isRestricted, shouldRestrict,
  dueReminderStage, canResendUser, otpAttemptsExceeded, generateOtp, GRACE_MS,
} from '../verification-state';

const base = {
  created_at: '2026-07-25T00:00:00Z',
  verification_deadline: '2026-07-30T00:00:00Z',
  verified_at: null, verified_channel: null,
  account_status: 'active' as const,
  reminders_sent: 0, last_reminder_sent_at: null,
  last_sent_at: null, send_count: 0, otp_attempts: 0,
};

describe('deadline + grandfathering', () => {
  it('deadline = created_at + 5d when created after launch', () => {
    expect(computeDeadline('2026-07-25T00:00:00Z', '2026-01-01T00:00:00Z'))
      .toBe(new Date(Date.parse('2026-07-25T00:00:00Z') + GRACE_MS).toISOString());
  });
  it('grandfathers: deadline = launch + 5d when created before launch', () => {
    expect(computeDeadline('2026-01-01T00:00:00Z', '2026-07-25T00:00:00Z'))
      .toBe(new Date(Date.parse('2026-07-25T00:00:00Z') + GRACE_MS).toISOString());
  });
});

describe('newly registered unverified user (within grace)', () => {
  it('not restricted, positive remaining, no restrict', () => {
    const now = '2026-07-26T00:00:00Z';
    expect(isVerified(base)).toBe(false);
    expect(isRestricted(base)).toBe(false);
    expect(remainingMs(now, base.verification_deadline)).toBeGreaterThan(0);
    expect(shouldRestrict(base, now)).toBe(false);
  });
});

describe('verified user (either channel)', () => {
  it('phone-verified user never restricted/reminded', () => {
    const row = { ...base, verified_at: '2026-07-26T00:00:00Z', verified_channel: 'phone' as const };
    const now = '2026-08-10T00:00:00Z';
    expect(isVerified(row)).toBe(true);
    expect(shouldRestrict(row, now)).toBe(false);
    expect(dueReminderStage(row, now)).toBe(0);
  });
});

describe('user past deadline', () => {
  it('shouldRestrict true when active + unverified + past deadline', () => {
    expect(shouldRestrict(base, '2026-07-31T00:00:00Z')).toBe(true);
  });
  it('idempotent: false when already overdue', () => {
    const row = { ...base, account_status: 'verification_overdue' as const };
    expect(shouldRestrict(row, '2026-07-31T00:00:00Z')).toBe(false);
  });
});

describe('reminder staging + 24h dedup', () => {
  it('stage 1 due 2 days after signup', () => {
    expect(dueReminderStage(base, '2026-07-27T01:00:00Z')).toBe(1);
  });
  it('no reminder within 24h of last', () => {
    const row = { ...base, reminders_sent: 0b001, last_reminder_sent_at: '2026-07-27T01:00:00Z' };
    expect(dueReminderStage(row, '2026-07-27T12:00:00Z')).toBe(0);
  });
  it('stage 2 due when <48h remain and 24h since last', () => {
    const row = { ...base, reminders_sent: 0b001, last_reminder_sent_at: '2026-07-27T01:00:00Z' };
    expect(dueReminderStage(row, '2026-07-28T06:00:00Z')).toBe(2);
  });
  it('never repeats a stage', () => {
    const row = { ...base, reminders_sent: 0b111, last_reminder_sent_at: '2026-07-29T23:00:00Z' };
    expect(dueReminderStage(row, '2026-07-29T23:30:00Z')).toBe(0);
  });
});

describe('resend cooldown + rate limit', () => {
  it('blocks within 60s cooldown', () => {
    const row = { ...base, last_sent_at: '2026-07-26T00:00:30Z' };
    expect(canResendUser(row, '2026-07-26T00:00:45Z')).toEqual({ ok: false, reason: 'cooldown' });
  });
  it('blocks after 5 sends in 24h', () => {
    const row = { ...base, send_count: 5, last_sent_at: '2026-07-26T00:00:00Z' };
    expect(canResendUser(row, '2026-07-26T00:05:00Z')).toEqual({ ok: false, reason: 'rate_limit' });
  });
  it('allows when cooldown elapsed and under cap', () => {
    const row = { ...base, send_count: 1, last_sent_at: '2026-07-26T00:00:00Z' };
    expect(canResendUser(row, '2026-07-26T00:02:00Z')).toEqual({ ok: true });
  });
});

describe('otp attempt lock', () => {
  it('locks after 5 wrong attempts', () => {
    expect(otpAttemptsExceeded({ ...base, otp_attempts: 5 })).toBe(true);
    expect(otpAttemptsExceeded({ ...base, otp_attempts: 4 })).toBe(false);
  });
});

describe('isRestricted', () => {
  it('returns false for active account', () => {
    expect(isRestricted({ ...base, account_status: 'active' })).toBe(false);
  });
  it('returns true for verification_overdue', () => {
    expect(isRestricted({ ...base, account_status: 'verification_overdue' })).toBe(true);
  });
  it('returns true for suspended', () => {
    expect(isRestricted({ ...base, account_status: 'suspended' })).toBe(true);
  });
});

describe('dueReminderStage past-deadline guard', () => {
  it('returns 0 when now === deadline (remain = 0)', () => {
    // deadline is base.verification_deadline = '2026-07-30T00:00:00Z'
    const row = { ...base, account_status: 'active' as const, verified_at: null };
    const now = '2026-07-30T00:00:00Z'; // exactly at deadline, remain = 0
    expect(dueReminderStage(row, now)).toBe(0);
  });
  it('returns 0 when now > deadline (remain < 0)', () => {
    const row = { ...base, account_status: 'active' as const, verified_at: null };
    const now = '2026-07-31T00:00:00Z'; // past deadline
    expect(dueReminderStage(row, now)).toBe(0);
  });
});

describe('generateOtp', () => {
  it('always returns a 6-digit numeric string', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });
});
