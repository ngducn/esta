import { describe, expect, it } from 'vitest';
import { grantProblems, type FunctionGrant } from './function-grants.ts';

const fn = (name: string, who: Partial<Pick<FunctionGrant, 'anon' | 'authenticated' | 'public'>> = {}): FunctionGrant => ({
  name,
  schema: name.split('.')[0] ?? '',
  anon: false,
  authenticated: false,
  public: false,
  ...who,
});
const allowed = { anon: { 'public.invoice_qr_by_token': 'the signed-out bill page' }, authenticated: { 'private.is_member': 'every policy calls it' } };

describe('grantProblems', () => {
  it('passes the allowlisted grants and functions nobody but the owner may run', () => {
    const grants = [fn('public.invoice_qr_by_token', { anon: true, authenticated: true }), fn('private.is_member', { authenticated: true }), fn('private.audit_now'), fn('public.save_expense', { authenticated: true })];
    expect(grantProblems(grants, allowed)).toEqual([]);
  });

  it('fails a public function anon may run that is not listed', () => {
    expect(grantProblems([fn('public.log_export_downloads', { anon: true, authenticated: true })], { anon: {}, authenticated: {} })).toEqual([
      'public.log_export_downloads is executable by anon and is not in quality/function-grants.json; revoke execute from public and anon, or add it with the reason an anonymous caller needs it',
    ]);
  });

  it('fails a private function that public may run, once for public and once for anon', () => {
    const problems = grantProblems([fn('private.touch_updated_at', { anon: true, authenticated: true, public: true })], { anon: {}, authenticated: {} });
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(/^private\.touch_updated_at is executable by public/);
  });

  it('fails a private function that authenticated may run and is not listed', () => {
    expect(grantProblems([fn('private.audit_now', { authenticated: true })], { anon: {}, authenticated: {} })).toEqual([
      'private.audit_now is executable by authenticated and is not in quality/function-grants.json; revoke it, or add it with the policy, constraint or view that calls it',
    ]);
  });

  it('fails a listed grant that was revoked, so the list only shrinks', () => {
    expect(grantProblems([fn('public.invoice_qr_by_token'), fn('private.is_member')], allowed)).toEqual([
      'public.invoice_qr_by_token is no longer executable by anon; remove it from quality/function-grants.json',
      'private.is_member is no longer executable by authenticated; remove it from quality/function-grants.json',
    ]);
  });

  it('counts an overloaded function once', () => {
    const twice = [fn('public.invoice_qr_by_token', { anon: true }), fn('public.invoice_qr_by_token', { anon: true })];
    expect(grantProblems(twice, { anon: allowed.anon, authenticated: {} })).toEqual([]);
  });
});
