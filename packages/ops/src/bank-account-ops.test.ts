import { describe, expect, it } from 'vitest';
import { bankAccountCreate, bankAccountDelete, bankAccountEdit, bankAccountSetDefault } from './bank-account-ops';
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

const STORED = { bank_bin: '970436', account_no: '0123456789', account_name: 'NGUYEN THI DEMO', is_default: false };

function holding(account: Partial<typeof STORED> | null, also: (sent: Sent) => readonly unknown[] = () => []) {
  return fakeDb((sent) => {
    const read = sent.method === 'GET' && sent.table === 'bank_accounts' && sent.query.get('id') === `eq.${ACCOUNT}`;
    return read ? (account === null ? [] : [{ ...STORED, ...account }]) : also(sent);
  });
}

describe('bankAccountEdit', () => {
  it('writes only the columns Mẹ changed, read as the add sheet reads them', async () => {
    const { db, sent } = holding({}, (sent) => (sent.method === 'PATCH' ? [{ id: ACCOUNT }] : []));
    expect(await runOp(bankAccountEdit, context(db), { ...typed, account_name: 'Trần Minh Demo' })).toEqual({ ok: true, value: { id: ACCOUNT } });
    expect(sent.at(-1)).toMatchObject({ method: 'PATCH', table: 'bank_accounts', body: { account_name: 'TRAN MINH DEMO' } });
    expect(sent.at(-1)?.query.get('household_id')).toBe(`eq.${HOUSEHOLD}`);
  });

  it('plans the stored values as unchanged and an account that is not there as not found', async () => {
    const input = bankAccountEdit.input.parse(typed);
    expect(await bankAccountEdit.plan(context(holding({}).db), input)).toEqual({ ok: true, value: { kind: 'unchanged', current: { id: ACCOUNT } } });
    expect(await bankAccountEdit.plan(context(holding(null).db), input)).toEqual({ ok: false, reason: { kind: 'not_found' } });
  });

  it('refuses a new number another account of the household already has', async () => {
    const other = (sent: Sent) => (sent.table === 'bank_accounts' && sent.query.has('account_no') ? [{ id: 'other' }] : []);
    const input = bankAccountEdit.input.parse({ ...typed, account_no: '999' });
    expect(await bankAccountEdit.plan(context(holding({}, other).db), input)).toEqual({ ok: false, reason: { kind: 'duplicate' } });
  });

  it('keeps the bank and number of an account a payment or statement names, and still corrects its holder name', async () => {
    for (const table of ['payments', 'statement_imports']) {
      const named = (sent: Sent) => (sent.table === table && sent.query.get('bank_account_id') === `eq.${ACCOUNT}` ? [{}] : sent.table === 'bank_bins' ? [{}] : []);
      for (const change of [{ account_no: '999' }, { bank_bin: '970422' }]) {
        const input = bankAccountEdit.input.parse({ ...typed, ...change });
        expect(await bankAccountEdit.plan(context(holding({}, named).db), input), table).toEqual({ ok: false, reason: { kind: 'number_locked' } });
      }
      const renamed = bankAccountEdit.input.parse({ ...typed, account_name: 'Trần Minh Demo' });
      expect(await bankAccountEdit.plan(context(holding({}, named).db), renamed), table).toMatchObject({ ok: true, value: { kind: 'change' } });
    }
  });

  it('reads the trigger that keeps a named number as number locked when a payment lands between the plan and the save', async () => {
    const locked = fakeDb(
      (sent) => (sent.method === 'GET' && sent.table === 'bank_accounts' && sent.query.get('id') === `eq.${ACCOUNT}` ? [STORED] : []),
      (sent) => (sent.method === 'PATCH' ? { code: '23001', message: 'ESTA_BANK_ACCOUNT_NUMBER_LOCKED' } : null),
    ).db;
    expect(await runOp(bankAccountEdit, context(locked), { ...typed, account_no: '999' })).toEqual({ ok: false, reason: { kind: 'number_locked' } });
  });

  it('reads an update RLS hid from a member who is not an admin as forbidden', async () => {
    const { db } = holding({});
    expect(await runOp(bankAccountEdit, context(db), { ...typed, account_name: 'Trần Minh Demo' })).toEqual({ ok: false, reason: { kind: 'forbidden' } });
  });
});

describe('bankAccountSetDefault', () => {
  it('moves the default through set_default_bank_account, and the default already set is unchanged', async () => {
    const { db, sent } = holding({});
    expect(await runOp(bankAccountSetDefault, context(db), { id: ACCOUNT })).toEqual({ ok: true, value: { id: ACCOUNT } });
    expect(sent.at(-1)).toMatchObject({ method: 'POST', table: 'rpc/set_default_bank_account', body: { p_id: ACCOUNT } });
    expect(await bankAccountSetDefault.plan(context(holding({ is_default: true }).db), { id: ACCOUNT })).toEqual({ ok: true, value: { kind: 'unchanged', current: { id: ACCOUNT } } });
  });

  it("maps the function's refusals", async () => {
    const failing = (error: { code: string; message: string }) =>
      fakeDb(
        (sent) => (sent.table === 'bank_accounts' ? [STORED] : []),
        (sent) => (sent.table.startsWith('rpc/') ? error : null),
      ).db;
    expect(await runOp(bankAccountSetDefault, context(failing({ code: '42501', message: 'ESTA_BANK_ACCOUNT_ADMIN_ONLY' })), { id: ACCOUNT })).toEqual({ ok: false, reason: { kind: 'forbidden' } });
    expect(await runOp(bankAccountSetDefault, context(failing({ code: 'P0002', message: 'ESTA_BANK_ACCOUNT_NOT_FOUND' })), { id: ACCOUNT })).toEqual({ ok: false, reason: { kind: 'not_found' } });
  });
});

describe('bankAccountDelete', () => {
  it('removes an account no payment or statement names, and one already gone is unchanged', async () => {
    const { db, sent } = holding({}, (sent) => (sent.method === 'DELETE' ? [{ id: ACCOUNT }] : []));
    expect(await runOp(bankAccountDelete, context(db), { id: ACCOUNT })).toEqual({ ok: true, value: { id: ACCOUNT } });
    expect(sent.at(-1)).toMatchObject({ method: 'DELETE', table: 'bank_accounts' });
    expect(await bankAccountDelete.plan(context(holding(null).db), { id: ACCOUNT })).toEqual({ ok: true, value: { kind: 'unchanged', current: { id: ACCOUNT } } });
  });

  it('refuses the default, and an account a payment or a statement import names', async () => {
    expect(await bankAccountDelete.plan(context(holding({ is_default: true }).db), { id: ACCOUNT })).toEqual({ ok: false, reason: { kind: 'is_default' } });
    for (const table of ['payments', 'statement_imports']) {
      const named = holding({}, (sent) => (sent.table === table && sent.query.get('bank_account_id') === `eq.${ACCOUNT}` ? [{}] : []));
      expect(await bankAccountDelete.plan(context(named.db), { id: ACCOUNT }), table).toEqual({ ok: false, reason: { kind: 'in_use' } });
    }
  });

  it('reads the trigger that keeps the default as is_default when the account became the default after the plan', async () => {
    const { db } = fakeDb(
      (sent) => (sent.table === 'bank_accounts' && sent.method === 'GET' ? [STORED] : []),
      (sent) => (sent.method === 'DELETE' ? { code: '23001', message: 'ESTA_BANK_ACCOUNT_IS_DEFAULT' } : null),
    );
    expect(await runOp(bankAccountDelete, context(db), { id: ACCOUNT })).toEqual({ ok: false, reason: { kind: 'is_default' } });
  });

  it('explains a payment that landed between the plan and the delete as in use', async () => {
    let landed = false;
    const { db } = fakeDb(
      (sent) => {
        if (sent.table === 'bank_accounts' && sent.method === 'GET') return [STORED];
        return sent.table === 'payments' && landed ? [{}] : [];
      },
      (sent) => {
        if (sent.method !== 'DELETE') return null;
        landed = true;
        return { code: '23503', message: 'update or delete on table "bank_accounts" violates foreign key constraint' };
      },
    );
    expect(await runOp(bankAccountDelete, context(db), { id: ACCOUNT })).toEqual({ ok: false, reason: { kind: 'in_use' } });
  });
});
