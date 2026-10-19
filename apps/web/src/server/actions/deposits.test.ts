import { MAX_AMOUNT_VND } from '@esta/core/money';
import { vndInputText } from '@esta/core/properties/form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn(async () => ({ data: '00000000-0000-4000-8000-0000000000e1', error: null })));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/server/member', () => ({ requireMember: async () => ({ household: { id: '00000000-0000-4000-8000-0000000000a1' } }) }));
vi.mock('@/server/supabase/server', () => ({ createSessionClient: async () => ({ rpc }) }));

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

beforeEach(() => rpc.mockClear());

describe('recordDeposit', () => {
  it('writes an amount at the ceiling deposit_entries keeps', async () => {
    expect(await recordDeposit(received(vndInputText(MAX_AMOUNT_VND)))).toEqual({ ok: true, value: '00000000-0000-4000-8000-0000000000e1' });
    expect(rpc).toHaveBeenCalledWith('record_deposit_entry', expect.objectContaining({ p_amount_vnd: MAX_AMOUNT_VND }));
  });

  it('refuses one đồng past the ceiling as an amount, without calling the database', async () => {
    expect(await recordDeposit(received(vndInputText(MAX_AMOUNT_VND + 1)))).toEqual({ ok: false, reason: 'amount' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
