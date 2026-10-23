import { isoDate } from '@esta/core/date';
import { beforeAll, describe, expect, it } from 'vitest';
import { memberClient } from '@/test/member-client';

// `pnpm test:integration` (scripts/web-integration.ts) passes the slot's stack and sets its database clock to
// 2026-10-07; run against a fresh `pnpm db:reset`. Lane 9 is read only here.

// seedId('seed:household:lane-9') and its two owner parties, supabase/seed/README.md
const HOUSEHOLD = '49343d1d-20ea-5afc-8ad0-9faefda645db';
const { client, signIn } = memberClient('me.lane9@demo.esta.test', HOUSEHOLD);
const { loadTaxCard, loadTaxOwners, loadTaxYears } = await import('./load');

const ASOF = isoDate('2026-10-07');
let me = '';
let ryan = '';

beforeAll(async () => {
  await signIn();
  const { data, error } = await client.from('parties').select('id, full_name').eq('household_id', HOUSEHOLD).contains('tags', ['owner']);
  if (error) throw error;
  me = data.find((party) => party.full_name === 'Nguyễn Thị Demo')?.id ?? '';
  ryan = data.find((party) => party.full_name === 'Trần Minh Demo')?.id ?? '';
}, 30_000);

describe('the tax card on the full seed (FIN-3, SPEC §9.3)', () => {
  it("puts Mẹ's projected 2026 revenue in the 400 to 500 million band with no tax, and Ryan's below 400 million", async () => {
    const mine = await loadTaxCard(HOUSEHOLD, { partyId: me, year: 2026, asOf: ASOF });
    const ryans = await loadTaxCard(HOUSEHOLD, { partyId: ryan, year: 2026, asOf: ASOF });
    if (mine.kind !== 'position' || ryans.kind !== 'position') throw new Error('expected the 2026 rule');
    expect(mine.position.projectedVnd).toBeGreaterThanOrEqual(400_000_000);
    expect(mine.position.projectedVnd).toBeLessThanOrEqual(499_999_999);
    expect([mine.position.vatEstimateVnd, mine.position.pitEstimateVnd]).toEqual([0, 0]);
    expect(mine.withheld.map((line) => line.property)).toEqual(['Nhà phố Q7']);
    expect(ryans.position.projectedVnd).toBeLessThan(400_000_000);
    expect(ryans.declared.map((line) => [line.property, line.shareBp])).toEqual([
      ['Căn hộ Thủ Đức', 5_000],
      ['Kho Biên Hòa', 5_000],
    ]);
  });

  it('opens on the signed-in member, offers 2025 and 2026, and has no rule for 2025', async () => {
    const { data } = await client.from('household_members').select('id').eq('household_id', HOUSEHOLD).eq('invited_email', 'me.lane9@demo.esta.test').single();
    expect((await loadTaxOwners(HOUSEHOLD, data?.id ?? ''))[0]?.id).toBe(me);
    expect(await loadTaxYears(HOUSEHOLD, ASOF)).toEqual([2026, 2025]);
    expect(await loadTaxCard(HOUSEHOLD, { partyId: me, year: 2025, asOf: ASOF })).toEqual({ kind: 'no_rule', year: 2025 });
  });
});
