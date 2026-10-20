import { describe, expect, it } from 'vitest';
import { bankAccountCreate } from './bank-account-ops';
import { runOp } from './op';
import { fakeDb, HOUSEHOLD, opContext as context, type Sent } from './test/fake-db';

const ACCOUNT = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0020';
const typed = { id: ACCOUNT, bank_bin: '970436', account_no: '0123 456 789', account_name: 'Nguyễn Thị Demo' };

function household(found: (sent: Sent) => boolean) {
  return fakeDb((sent) => (found(sent) ? [{}] : []));
}
const knownBank = (sent: Sent) => sent.table === 'bank_bins';

describe('bankAccountCreate', () => {
  it('reads the name and number as Mẹ types them', () => {
    expect(bankAccountCreate.input.parse(typed)).toEqual({ id: ACCOUNT, bank_bin: '970436', account_no: '0123456789', account_name: 'NGUYEN THI DEMO' });
    const refused = bankAccountCreate.input.safeParse({ ...typed, account_no: '01/23', account_name: '  ' });
    expect(refused.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['account_no', 'account_name']);
  });

  it("makes the household's first account its default", async () => {
    const { db, sent } = household(knownBank);
    expect(await runOp(bankAccountCreate, context(db), typed)).toEqual({ ok: true, value: { id: ACCOUNT } });
    expect(sent.at(-1)).toMatchObject({
      method: 'POST',
      table: 'bank_accounts',
      body: { id: ACCOUNT, household_id: HOUSEHOLD, bank_bin: '970436', account_no: '0123456789', account_name: 'NGUYEN THI DEMO', is_default: true },
    });
  });

  it('refuses a bank NAPAS does not list and an account the household already has', async () => {
    const input = bankAccountCreate.input.parse(typed);
    expect(await bankAccountCreate.plan(context(household(() => false).db), input)).toEqual({ ok: false, reason: { kind: 'unknown_bank' } });
    const same = (sent: Sent) => knownBank(sent) || (sent.table === 'bank_accounts' && sent.query.has('account_no'));
    expect(await bankAccountCreate.plan(context(household(same).db), input)).toEqual({ ok: false, reason: { kind: 'duplicate' } });
  });

  it('plans an account already saved under its id as unchanged', async () => {
    const saved = (sent: Sent) => sent.table === 'bank_accounts' && sent.query.has('id');
    expect(await bankAccountCreate.plan(context(household(saved).db), bankAccountCreate.input.parse(typed))).toEqual({ ok: true, value: { kind: 'unchanged', current: { id: ACCOUNT } } });
  });

  it('refuses a member who is not an admin as RLS does', async () => {
    const { db } = fakeDb(
      (sent) => (knownBank(sent) ? [{}] : []),
      (sent) => (sent.method === 'POST' ? { code: '42501', message: 'new row violates row-level security policy' } : null),
    );
    expect(await runOp(bankAccountCreate, context(db), typed)).toEqual({ ok: false, reason: { kind: 'forbidden' } });
  });
});
