import 'server-only';
import { groupCollections, monthCollected, type CollectionGroup, type MonthCollected } from '@esta/core/collections';
import type { IsoDate } from '@esta/core/date';
import { firstOfMonth } from '@esta/core/date/calendar';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { todayHorizon, todayItems, type TodayList, type TodaySnapshot } from '@esta/core/today';
import { idSchema } from '@esta/ops';
import { z } from 'zod';
import type { MapPin } from '@/components/map/property-pins';
import type { PaymentAccount } from '@/components/payments/RecordPaymentSheet';
import { loadCollectionRows, loadOpenInvoices, type CollectionRow, type PaymentInvoice } from '@/server/collections/load';
import { loadReceivingAccount } from '@/server/invoices/qr';
import { createSessionClient } from '@/server/supabase/server';

export type HomeLease = TodaySnapshot['leases'][number] & { readonly propertyId: string; readonly wholeUnit: boolean };

/** Today's list reads the board's own rows, so a bill there and on Thu tiền is one bill in one state. */
export type HomeSnapshot = Omit<TodaySnapshot, 'bills' | 'leases'> & { readonly bills: readonly CollectionRow[]; readonly leases: readonly HomeLease[] };

export type HomeView = {
  readonly month: IsoDate;
  /** The collections board for the Clock's month, whose group counts Home shows beside its figure. */
  readonly board: readonly CollectionGroup<CollectionRow>[];
  readonly collected: MonthCollected;
  readonly today: TodayList<HomeSnapshot>;
  /** What `Ghi nhận` needs; null for a viewer, who records nothing. */
  readonly payment: { readonly openInvoices: ReadonlyMap<string, readonly PaymentInvoice[]>; readonly account: PaymentAccount | null } | null;
  readonly pins: readonly MapPin[];
};

const endingLeaseSchema = z.object({
  id: idSchema,
  status: z.literal('active'),
  end_date: isoDateSchema,
  unit: z.object({ label: z.string(), kind: z.string(), property: z.object({ id: idSchema, nickname: z.string(), deleted_at: z.string().nullable() }) }),
});
const pinSchema = z.object({ id: idSchema, nickname: z.string(), lat: z.number(), lng: z.number() });

type Db = Awaited<ReturnType<typeof createSessionClient>>;

function rows<S extends z.ZodType>(what: string, schema: S, result: { data: unknown; error: { message: string } | null }): z.output<S>[] {
  if (result.error !== null) throw new Error(`Reading ${what} for Home failed: ${result.error.message}`);
  return z.array(schema).parse(result.data);
}

/** Active leases whose last day falls in today's window, each marked when a renewal past draft points at it. */
async function endingLeases(db: Db, householdId: string, asOf: IsoDate): Promise<HomeLease[]> {
  const leases = await db
    .from('leases')
    .select('id, status, end_date, unit:units!leases_household_id_property_id_unit_id_fkey(label, kind, property:properties!units_household_id_property_id_fkey(id, nickname, deleted_at))')
    .eq('household_id', householdId)
    .eq('status', 'active')
    .gte('end_date', asOf)
    .lte('end_date', todayHorizon(asOf).leases);
  const live = rows('ending leases', endingLeaseSchema, leases).filter((row) => row.unit.property.deleted_at === null);
  if (live.length === 0) return [];
  const renewals = await db
    .from('leases')
    .select('renewal_of_lease_id')
    .eq('household_id', householdId)
    .in('renewal_of_lease_id', live.map((row) => row.id))
    .neq('status', 'draft');
  const renewed = new Set(rows('renewals', z.object({ renewal_of_lease_id: idSchema }), renewals).map((row) => row.renewal_of_lease_id));
  return live.map((row) => ({
    leaseId: row.id,
    propertyId: row.unit.property.id,
    propertyName: row.unit.property.nickname,
    unitLabel: row.unit.label,
    wholeUnit: row.unit.kind === 'whole',
    status: row.status,
    endDate: row.end_date,
    renewed: renewed.has(row.id),
  }));
}

async function expiringDocuments(db: Db, householdId: string, asOf: IsoDate) {
  const documents = await db
    .from('documents')
    .select('id, title, expires_on')
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .gte('expires_on', asOf)
    .lte('expires_on', todayHorizon(asOf).documents);
  return rows('expiring documents', z.object({ id: idSchema, title: z.string(), expires_on: isoDateSchema }), documents).map((row) => ({
    documentId: row.id,
    title: row.title,
    expiresOn: row.expires_on,
  }));
}

async function waitingReviews(db: Db, householdId: string) {
  const status = await db.from('document_status').select('document_id').eq('household_id', householdId).eq('status', 'needs_review');
  const waiting = rows('waiting reviews', z.object({ document_id: idSchema }), status);
  if (waiting.length === 0) return [];
  const documents = await db
    .from('documents')
    .select('id, title')
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .in('id', waiting.map((row) => row.document_id));
  return rows('review titles', z.object({ id: idSchema, title: z.string() }), documents).map((row) => ({ documentId: row.id, title: row.title }));
}

/** The pins the desktop map strip draws. The strip only adds to Home, so a failed read leaves it out instead of failing Home. */
async function mapPins(db: Db, householdId: string): Promise<MapPin[]> {
  const pins = await db.from('property_list_rows').select('id, nickname, lat, lng').eq('household_id', householdId).not('lat', 'is', null).not('lng', 'is', null);
  try {
    return rows('map pins', pinSchema, pins);
  } catch (error) {
    console.error(error);
    return [];
  }
}

/** Everything Home shows on the Clock's date `asOf`, read as the member. */
export async function loadHome(householdId: string, asOf: IsoDate, canRecord: boolean): Promise<HomeView> {
  const db = await createSessionClient();
  const month = firstOfMonth(asOf);
  const [bills, leases, documents, reviews, pins] = await Promise.all([
    loadCollectionRows(householdId, month),
    endingLeases(db, householdId, asOf),
    expiringDocuments(db, householdId, asOf),
    waitingReviews(db, householdId),
    mapPins(db, householdId),
  ]);
  const board = groupCollections(bills, month, asOf);
  const today = todayItems<HomeSnapshot>({ bills, leases, documents, reviews }, asOf);
  const paying = canRecord && today.items.some((item) => item.action === 'recordPayment');
  const [openInvoices, account] = paying ? await Promise.all([loadOpenInvoices(householdId), loadReceivingAccount(householdId)]) : [new Map(), null];
  return {
    month,
    board,
    collected: monthCollected(board),
    today,
    payment: canRecord ? { openInvoices, account: account === null ? null : { id: account.id, bankName: account.bankName, accountNo: account.accountNo } } : null,
    pins,
  };
}
