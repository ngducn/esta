import { MAX_AMOUNT_VND } from '@esta/core/money';
import { vndInputText } from '@esta/core/properties/form';
import { depositRecord } from '@esta/ops';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ENTRY = '00000000-0000-4000-8000-0000000000e1';
const runOp = vi.hoisted(() => vi.fn(async () => ({ ok: true, value: { entry_id: '00000000-0000-4000-8000-0000000000e1' } })));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/server/ops', () => ({ webOpContext: async () => ({}) }));
vi.mock('@esta/ops', async (importOriginal) => ({ ...(await importOriginal<typeof import('@esta/ops')>()), runOp }));

const { recordDeposit } = await import('./deposits');

const received = (amount: string) => ({
  leaseId: '00000000-0000-4000-8000-0000000000b1',
  kind: 'received',
  invoiceId: null,
  amount,
  onDate: '07/10/2026',
  note: '',
  idempotencyKey: '00000000-0000-4000-8000-0000000000c1',
});

beforeEach(() => runOp.mockClear());

describe('recordDeposit', () => {
  it('writes an amount at the ceiling deposit_entries keeps', async () => {
    expect(await recordDeposit(received(vndInputText(MAX_AMOUNT_VND)))).toEqual({ ok: true, value: ENTRY });
    expect(runOp).toHaveBeenCalledWith(depositRecord, expect.anything(), expect.objectContaining({ kind: 'received', amount_vnd: MAX_AMOUNT_VND }));
  });

  it('refuses one đồng past the ceiling as an amount, without calling the database', async () => {
    expect(await recordDeposit(received(vndInputText(MAX_AMOUNT_VND + 1)))).toEqual({ ok: false, reason: 'amount' });
    expect(runOp).not.toHaveBeenCalled();
  });
});
