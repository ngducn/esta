import { isoDate, type IsoDate } from '@esta/core/date';
import { formatYear, type Locale } from '@esta/core/format';
import type { InvoicePayment, ReportSnapshot } from '@esta/core/reports';
import type { OwnershipShare } from '@esta/core/schemas/ownership';
import { yearPeriod } from '@esta/core/reports';
import {
  listLeases,
  readCollectionRows,
  readInvoicePayments,
  readLegalRows,
  readLivePropertyIds,
  readOwnership,
  readPropertyDetail,
  readReportSnapshot,
  type CollectionRow,
  type LegalRow,
  type PropertyDetailRow,
} from '@esta/ops';
import type { AgentDb } from '../supabase';
import { sameAnswer, type RunSheet } from './fact-sheet';
import type { PropertyHandles } from './list-properties';

/** A lease as the lease pages list it; `property_archived` marks one whose property was archived, whose pages are gone. */
export type LeaseListing = Awaited<ReturnType<typeof listLeases>>[number] & { readonly property_archived: boolean };

export type PropertyLegalFacts = {
  readonly certificates: readonly LegalRow<'certificates'>[];
  readonly owners: readonly OwnershipShare[];
  /** Each owner's and mortgage bank's name, by party id. */
  readonly partyNames: Readonly<Record<string, string>>;
};

/**
 * What the ask job's read tools read, one call per argument per run. Each read is an ops read the web screens share, so
 * an answer reads the figures Mẹ sees on the board, the reports and the tax card.
 */
export type AskReads = {
  report(year: number): Promise<ReportSnapshot>;
  collections(month: IsoDate): Promise<CollectionRow[]>;
  leases(): Promise<LeaseListing[]>;
  /** The property's row on the property list and its page, null once archived: the source of its status pills. */
  property(propertyId: string): Promise<PropertyDetailRow | null>;
  legal(propertyId: string): Promise<PropertyLegalFacts>;
  payments(invoiceIds: readonly string[]): Promise<InvoicePayment[]>;
};

async function readPropertyLegal(db: AgentDb, householdId: string, propertyId: string): Promise<PropertyLegalFacts> {
  const [certificates, owners] = await Promise.all([readLegalRows(db, householdId, 'certificates', propertyId), readOwnership(db, householdId, propertyId)]);
  const ids = [...new Set([...owners.map((owner) => owner.party_id), ...certificates.flatMap((certificate) => (certificate.mortgage === null ? [] : [certificate.mortgage.bank_party_id]))])];
  const { data, error } = ids.length === 0 ? { data: [], error: null } : await db.from('parties').select('id, full_name').eq('household_id', householdId).in('id', ids);
  if (error) throw new Error(`Reading the owners and banks failed: ${error.message}`);
  return { certificates, owners, partyNames: Object.fromEntries(data.map((party) => [party.id, party.full_name])) };
}

export function askReads(db: AgentDb, householdId: string, { locale, asOf }: { readonly locale: Locale; readonly asOf: IsoDate }): AskReads {
  return {
    report: sameAnswer((year: number) => readReportSnapshot(db, householdId, { ...yearPeriod(year, asOf), asOf })),
    collections: sameAnswer((month: IsoDate) => readCollectionRows(db, householdId, month)),
    leases: sameAnswer(async () => {
      const [leases, live] = await Promise.all([listLeases({ db, householdId, locale }), readLivePropertyIds(db, householdId).then((ids) => new Set(ids))]);
      return leases.map((lease) => ({ ...lease, property_archived: !live.has(lease.property_id) }));
    }),
    property: sameAnswer((propertyId: string) => readPropertyDetail(db, householdId, propertyId)),
    legal: sameAnswer((propertyId: string) => readPropertyLegal(db, householdId, propertyId)),
    payments: sameAnswer((invoiceIds: readonly string[]) => readInvoicePayments(db, householdId, invoiceIds)),
  };
}

export const monthStart = (year: number, month: number): IsoDate => isoDate(`${formatYear(year)}-${String(month).padStart(2, '0')}-01`);

/** What every read tool of the ask job is built from. */
export type ReadToolContext = {
  readonly reads: AskReads;
  readonly locale: Locale;
  readonly asOf: IsoDate;
  readonly cite: RunSheet['cite'];
  readonly properties: PropertyHandles;
};
