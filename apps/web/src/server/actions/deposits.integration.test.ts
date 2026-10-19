import { deriveDepositLedger } from '@esta/core/allocation';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { memberClient } from '@/test/member-client';

// `pnpm test:integration` (scripts/web-integration.ts) passes the slot's stack and sets its database clock to
// 2026-10-07; run against a fresh `pnpm db:reset`. Every write uses lane 6's Kho Biên Hòa lease, whose deposit the seed
// already refunded, so the lane households other specs read keep the seed's deposits.

// seedId('seed:household:lane-6'), supabase/seed/README.md
const HOUSEHOLD = '7a44c0c3-e063-5cf0-b56d-c33c5f915ddd';
const { client, signIn } = memberClient('ryan.lane6@demo.esta.test', HOUSEHOLD);

const { recordDeposit } = await import('./deposits');
const { loadDepositLines, loadHeldDepositTotal } = await import('@/server/leases/deposits');

let leaseId = '';

beforeAll(async () => {
  await signIn();
  const lease = await client.from('leases').select('id').eq('household_id', HOUSEHOLD).eq('status', 'ended').eq('deposit_vnd', 24_000_000).single();
  if (lease.error) throw lease.error;
  leaseId = lease.data.id;
}, 30_000);

async function heldInDatabase(): Promise<number> {
  const { data, error } = await client.from('lease_deposits').select('held_vnd').eq('lease_id', leaseId).single();
  if (error) throw error;
  return z.number().int().parse(data.held_vnd);
}

async function heldInCore(): Promise<number> {
  const result = deriveDepositLedger(await loadDepositLines(leaseId));
  if (!result.ok) throw new Error(result.reason);
  return result.value.heldVnd;
}

const entry = (kind: 'received' | 'deduction' | 'refunded', amount: string, onDate: string, note = '') => ({
  leaseId,
  kind,
  invoiceId: null,
  amount,
  onDate,
  note,
  idempotencyKey: crypto.randomUUID(),
});

describe('deposit actions against local Supabase (LSE-9)', () => {
  it('holds the same figure in the lease_deposits view and in deriveDepositLedger after every write', async () => {
    const start = await heldInDatabase();
    expect(await heldInCore()).toBe(start);

    const steps = [
      entry('received', '5tr', '01/10/2026'),
      entry('deduction', '750k', '03/10/2026', 'Thay khóa cửa Demo'),
      entry('refunded', '1.250.000', '05/10/2026'),
      entry('received', '2tr', '20/09/2026'),
    ];
    for (const step of steps) {
      expect(await recordDeposit(step)).toMatchObject({ ok: true });
      expect(await heldInCore()).toBe(await heldInDatabase());
    }
    expect(await heldInDatabase()).toBe(start + 5_000_000 - 750_000 - 1_250_000 + 2_000_000);
  });

  it('refuses a refund past the held balance and a deduction without a reason, writing nothing', async () => {
    const before = await loadDepositLines(leaseId);
    const held = await heldInDatabase();
    expect(await recordDeposit(entry('refunded', String(held + 1), '07/10/2026'))).toEqual({ ok: false, reason: 'exceedsHeld' });
    expect(await recordDeposit(entry('deduction', '100k', '07/10/2026'))).toEqual({ ok: false, reason: 'noteRequired' });
    expect(await recordDeposit(entry('refunded', '100k', '08/10/2026'))).toEqual({ ok: false, reason: 'dateAfterToday' });
    expect(await recordDeposit(entry('refunded', '3tr5x', '07/10/2026'))).toEqual({ ok: false, reason: 'amount' });
    expect(await client.from('deposit_entries').select('id', { count: 'exact', head: true }).eq('lease_id', leaseId)).toMatchObject({ count: before.length });
  });

  it('writes one entry for a repeated key', async () => {
    const step = entry('received', '1tr', '06/10/2026');
    const first = await recordDeposit(step);
    const second = await recordDeposit({ ...step, amount: '9tr' });
    expect(second).toEqual(first);
    expect(await client.from('deposit_entries').select('amount_vnd').eq('idempotency_key', step.idempotencyKey)).toMatchObject({ data: [{ amount_vnd: 1_000_000 }] });
  });

  it('adds every held deposit of the household into the Tài sản total', async () => {
    const { data, error } = await client.from('lease_deposits').select('held_vnd').eq('household_id', HOUSEHOLD);
    if (error) throw error;
    expect(await loadHeldDepositTotal(HOUSEHOLD)).toBe(data.reduce((sum, row) => sum + z.number().int().parse(row.held_vnd), 0));
  });
});
