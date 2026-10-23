import 'server-only';
import type { IsoDate } from '@esta/core/date';
import type { Vnd } from '@esta/core/money';
import { computeTaxPosition, type LeaseRevenue, type TaxPosition, type TaxRule } from '@esta/core/tax';
import { readOwners, readTaxInputs } from '@esta/ops';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';

export type TaxOwner = { readonly id: string; readonly name: string };

export type TaxLeaseLine = {
  readonly leaseId: string;
  readonly href: string;
  readonly property: string;
  readonly unit: string;
  /** The owner's share of a co-owned lease, null when the whole lease is theirs. */
  readonly shareBp: number | null;
  readonly projectedVnd: Vnd;
};

export type TaxCard =
  | { readonly kind: 'no_rule'; readonly year: number }
  | {
      readonly kind: 'position';
      readonly rule: TaxRule;
      readonly position: TaxPosition;
      readonly otherBusinessRevenueVnd: Vnd;
      readonly declared: readonly TaxLeaseLine[];
      readonly withheld: readonly TaxLeaseLine[];
    };

const labelSchema = z.object({ id: z.uuid(), unit: z.object({ label: z.string(), property: z.object({ nickname: z.string() }) }) });

/** Owner parties by name, with the one linked to `memberId` first, so the card opens on the signed-in member's own. */
export async function loadTaxOwners(householdId: string, memberId: string): Promise<TaxOwner[]> {
  const owners = await readOwners(await createSessionClient(), householdId);
  return owners.toSorted((a, b) => Number(b.memberId === memberId) - Number(a.memberId === memberId)).map((owner) => ({ id: owner.id, name: owner.name }));
}

/** From the year the first lease starts to the Clock's year, newest first. */
export async function loadTaxYears(householdId: string, today: IsoDate): Promise<number[]> {
  const db = await createSessionClient();
  const { data, error } = await db.from('leases').select('start_date').eq('household_id', householdId).neq('status', 'draft').order('start_date').limit(1);
  if (error) throw new Error(`Reading the first lease failed: ${error.message}`);
  const thisYear = Number(today.slice(0, 4));
  const first = Math.min(thisYear, Number(data[0]?.start_date?.slice(0, 4) ?? thisYear));
  return Array.from({ length: thisYear - first + 1 }, (_, index) => thisYear - index);
}

async function leaseLabels(householdId: string, leases: readonly LeaseRevenue[]) {
  if (leases.length === 0) return new Map<string, z.output<typeof labelSchema>>();
  const db = await createSessionClient();
  const { data, error } = await db
    .from('leases')
    .select('id, unit:units!inner(label, property:properties!inner(nickname))')
    .eq('household_id', householdId)
    .in(
      'id',
      leases.map((lease) => lease.leaseId),
    );
  if (error) throw new Error(`Reading the lease labels failed: ${error.message}`);
  return new Map(z.array(labelSchema).parse(data).map((row) => [row.id, row]));
}

export async function loadTaxCard(householdId: string, at: { partyId: string; year: number; asOf: IsoDate }): Promise<TaxCard> {
  const inputs = await readTaxInputs(await createSessionClient(), householdId, at);
  if (inputs.kind === 'no_rule') return inputs;
  const labels = await leaseLabels(householdId, inputs.attribution.leases);
  const lines = (taxPayer: LeaseRevenue['taxPayer']) =>
    inputs.attribution.leases
      .filter((lease) => lease.taxPayer === taxPayer)
      .map((lease): TaxLeaseLine => {
        const label = labels.get(lease.leaseId);
        return {
          leaseId: lease.leaseId,
          href: `/properties/${lease.propertyId}/rental/leases/${lease.leaseId}`,
          property: label?.unit.property.nickname ?? '',
          unit: label?.unit.label ?? '',
          shareBp: lease.basis.kind === 'ownership_share' && lease.basis.shareBp < 10_000 ? lease.basis.shareBp : null,
          projectedVnd: lease.projectedVnd,
        };
      })
      .toSorted((a, b) => a.property.localeCompare(b.property, 'vi') || a.unit.localeCompare(b.unit, 'vi', { numeric: true }));
  return {
    kind: 'position',
    rule: inputs.rule,
    position: computeTaxPosition(inputs),
    otherBusinessRevenueVnd: inputs.otherBusinessRevenueVnd,
    declared: lines('owner'),
    withheld: lines('tenant_withholds'),
  };
}
