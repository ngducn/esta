import { describe, expect, it } from 'vitest';
import { deliveryConfig } from './smtp';

const base = { EMAIL_TRANSPORT: 'smtp', ESTA_APP_URL: 'http://127.0.0.1:3700' } as const;

describe('deliveryConfig', () => {
  it('sends nothing without an SMTP_URL', () => {
    expect(deliveryConfig({ ...base })).toBeNull();
  });

  it('accepts a local mailbox outside production', () => {
    expect(deliveryConfig({ ...base, SMTP_URL: 'smtp://127.0.0.1:55025' })?.smtpUrl).toBe('smtp://127.0.0.1:55025');
  });

  it('refuses a real mail host outside production, and a sender with no app URL', () => {
    expect(() => deliveryConfig({ ...base, ESTA_ENV: 'development', SMTP_URL: 'smtp://smtp.example.com:587' })).toThrow(/only a local mailbox/);
    expect(() => deliveryConfig({ EMAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtp://127.0.0.1:2500' })).toThrow(/ESTA_APP_URL/);
  });

  it('needs a from address in production', () => {
    expect(() => deliveryConfig({ ...base, ESTA_ENV: 'production', SMTP_URL: 'smtp://smtp.example.com:587' })).toThrow(/ESTA_EMAIL_FROM/);
  });
});
