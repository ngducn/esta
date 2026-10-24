import { z } from 'zod';
import { PAYMENT_STATUSES } from '../allocation/status';
import type { IsoDate } from '../date/iso-date';
import { LEASE_STATUSES } from '../lease/types';
import { PROPERTY_KINDS, USE_MODES } from '../properties/kinds';
import { isoDateSchema } from '../schemas/legal';
import { liveSnapshot } from './lookup';
import { vndSchema } from '../schemas/property';

const id = z.string().min(1);

/** One household as the watch rules read it on `asOf`, archived properties included. */
export const watchSnapshotSchema = z.object({
  householdId: id,
  asOf: isoDateSchema,
  properties: z.array(
    z.object({
      id,
      kind: z.enum(PROPERTY_KINDS),
      useMode: z.enum(USE_MODES),
      archived: z.boolean(),
      /** SPEC §5.3 completeness; null for an archived property, which is not scored. */
      completenessPercent: z.number().int().min(0).max(100).nullable(),
    }),
  ),
  units: z.array(z.object({ id, propertyId: id, availableFrom: isoDateSchema.nullable() })),
  /** Every lease past draft, with the deposit held on `asOf`. */
  leases: z.array(
    z.object({
      id,
      unitId: id,
      propertyId: id,
      tenantId: id.nullable(),
      status: z.enum(LEASE_STATUSES),
      start_date: isoDateSchema.nullable(),
      end_date: isoDateSchema.nullable(),
      /** Another lease past draft renews this one, as `renew_lease` counts it. */
      renewed: z.boolean(),
      depositHeldVnd: vndSchema,
    }),
  ),
  /** Every invoice issued on or before `asOf`, with its allocated total and what is still owed, as `invoice_balances` reads it. */
  invoices: z.array(
    z.object({ id, leaseId: id, dueDate: isoDateSchema, totalVnd: vndSchema, allocatedVnd: vndSchema, outstandingVnd: vndSchema, paymentStatus: z.enum(PAYMENT_STATUSES) }),
  ),
  /** Documents not deleted whose expiry date is on or after `asOf`. */
  documents: z.array(z.object({ id, propertyId: id.nullable(), expiresOn: isoDateSchema })),
  /** Active meters with their latest reading on or before `asOf`, looking back to the start of the previous month. */
  meters: z.array(z.object({ id, unitId: id, lastReadOn: isoDateSchema.nullable() })),
  /** Each owner's FIN-3 position for the year of `asOf`, as the tax card computes it. */
  taxPositions: z.array(
    z.object({ partyId: id, year: z.number().int(), projectedVnd: vndSchema, thresholdTotalVnd: vndSchema, thresholdVnd: vndSchema, progressBp: z.number().int().min(0) }),
  ),
  /** Documents whose latest extraction waits in `needs_review`, from the business date it was created. */
  extractions: z.array(z.object({ documentId: id, propertyId: id.nullable(), waitingSince: isoDateSchema })),
});

export type WatchSnapshot = z.output<typeof watchSnapshotSchema>;

export type WatchSeverity = 'info' | 'watch' | 'action';

export type WatchRuleId = 'W1' | 'W2' | 'W3' | 'W4' | 'W5' | 'W6' | 'W7' | 'W8' | 'W9' | 'W10' | 'W11';

/** The figures behind a fact, by name: counts and đồng as integers, dates as `IsoDate`. */
export type WatchNumbers = Readonly<Record<string, number | IsoDate | null>>;

export type WatchSubjectKey = `${'invoice' | 'lease' | 'unit' | 'document' | 'meter' | 'tenant' | 'property'}:${string}` | `owner:${string}:${number}`;

export type WatchFact = { readonly ruleId: WatchRuleId; readonly subjectKey: WatchSubjectKey; readonly severity: WatchSeverity; readonly numbers: WatchNumbers };

export type WatchFinding = Omit<WatchFact, 'ruleId'>;

type Thresholds = Readonly<Record<string, number>>;

/**
 * One rule of AGENT.md §5.3. `scope: 'live'` hands it only what belongs to properties that are not archived; owed money
 * and tax read `'all'`. `repeat` is how often an `action` fact may become its own item.
 */
export type WatchRuleSpec<T extends Thresholds> = {
  readonly id: WatchRuleId;
  readonly scope: 'live' | 'all';
  readonly thresholds: T;
  readonly repeat: 'daily' | 'yearly';
  readonly find: (snapshot: WatchSnapshot, thresholds: T) => readonly WatchFinding[];
};

export type WatchRule<T extends Thresholds = Thresholds> = Omit<WatchRuleSpec<T>, 'find'> & { readonly evaluate: (snapshot: WatchSnapshot) => WatchFact[] };

export function defineRule<T extends Thresholds>({ find, ...rule }: WatchRuleSpec<T>): WatchRule<T> {
  return { ...rule, evaluate: (snapshot) => find(rule.scope === 'live' ? liveSnapshot(snapshot) : snapshot, rule.thresholds).map((finding) => ({ ruleId: rule.id, ...finding })) };
}
