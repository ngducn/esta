import { dateParts } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import { formatBps, formatCount, formatDate, formatDays, formatMonthYear, formatVnd, formatVndCompact, formatYear, type Locale } from '../format';
import { vnd } from '../money/vnd';
import { WATCH_RULES } from './registry';
import type { WatchFact, WatchSnapshot } from './types';

/** The names a fact is told by: property nicknames, unit labels, party names and document titles, by id. */
export type WatchLabels = {
  readonly properties: ReadonlyMap<string, string>;
  readonly units: ReadonlyMap<string, { readonly label: string; readonly whole: boolean }>;
  readonly parties: ReadonlyMap<string, string>;
  readonly documents: ReadonlyMap<string, string>;
};

/** A fact as the model reads it: names and every figure formatted into citable fields (AGENT.md §4), and its link. */
export type DescribedFact = { readonly fact: WatchFact; readonly link: string; readonly record: Readonly<Record<string, string | number | null>> };

const LINK_TYPES = { invoice: 'invoice', lease: 'lease', unit: 'unit', document: 'document', meter: 'meter', tenant: 'party', property: 'property', owner: 'party' } as const;

type Names = Record<string, string>;

function namesOf({ subjectKey }: WatchFact, snapshot: WatchSnapshot, labels: WatchLabels): Names {
  const [kind, id = ''] = subjectKey.split(':') as [keyof typeof LINK_TYPES, string?];
  const place = (unitId: string | undefined, propertyId: string | null | undefined): Names => {
    const property = labels.properties.get(propertyId ?? snapshot.units.find((unit) => unit.id === unitId)?.propertyId ?? '') ?? '';
    const unit = unitId === undefined ? undefined : labels.units.get(unitId);
    if (unit === undefined) return { property_label: property, place_label: property };
    return { property_label: property, unit_label: unit.label, place_label: unit.whole ? property : `${unit.label} ${property}` };
  };
  const lease = (leaseId: string | undefined): Names => {
    const row = snapshot.leases.find((entry) => entry.id === leaseId);
    return { ...place(row?.unitId, row?.propertyId), tenant_name: labels.parties.get(row?.tenantId ?? '') ?? '' };
  };
  switch (kind) {
    case 'invoice':
      return lease(snapshot.invoices.find((invoice) => invoice.id === id)?.leaseId);
    case 'lease':
      return lease(id);
    case 'unit':
      return place(id, undefined);
    case 'meter':
      return place(snapshot.meters.find((meter) => meter.id === id)?.unitId, undefined);
    case 'document': {
      const propertyId = snapshot.documents.find((document) => document.id === id)?.propertyId ?? snapshot.extractions.find((extraction) => extraction.documentId === id)?.propertyId;
      return { document_label: labels.documents.get(id) ?? '', ...place(undefined, propertyId) };
    }
    case 'property':
      return place(undefined, id);
    case 'tenant':
      return { tenant_name: labels.parties.get(id) ?? '' };
    case 'owner':
      return { owner_name: labels.parties.get(id) ?? '' };
  }
}

/**
 * Each figure under a citable name: `outstanding_vnd` as `outstanding_display` and `outstanding_compact`, a date as
 * `<name>_display` and `<name>_year_display`, so `năm {{f1.end_date_year_display}}` passes the guard. A missing figure
 * is blank, which the guard answers with "say the information is missing".
 */
function displays(name: string, value: number | IsoDate | null, locale: Locale): Array<[string, string]> {
  if (value === null) return [[`${name}_display`, '']];
  if (typeof value === 'string') {
    if (name === 'month') return [['month_display', formatMonthYear(value, locale)]];
    return [
      [`${name}_display`, formatDate(value, locale)],
      [`${name}_year_display`, formatYear(dateParts(value).year)],
    ];
  }
  if (name.endsWith('_vnd')) {
    const base = name.slice(0, -'_vnd'.length);
    return [
      [`${base}_display`, formatVnd(vnd(value), locale)],
      [`${base}_compact`, formatVndCompact(vnd(value), locale)],
    ];
  }
  if (name.endsWith('_bp')) return [[`${name.slice(0, -'_bp'.length)}_display`, formatBps(value, locale)]];
  if (name.endsWith('_percent')) return [[`${name.slice(0, -'_percent'.length)}_display`, formatBps(value * 100, locale)]];
  if (name.startsWith('days_')) return [[`${name}_display`, formatDays(value, locale)]];
  if (name === 'year') return [['year_display', formatYear(value)]];
  return [[`${name}_display`, formatCount(value, locale)]];
}

const ruleOrder = (fact: WatchFact) => WATCH_RULES.findIndex((rule) => rule.id === fact.ruleId);
const sortName = ({ record }: DescribedFact) => String(record.place_label ?? record.document_label ?? record.tenant_name ?? record.owner_name ?? '');

/** In rule order, then by name, so households seeded alike list their facts alike whatever their ids. */
export function describeFacts(facts: readonly WatchFact[], snapshot: WatchSnapshot, labels: WatchLabels, locale: Locale): DescribedFact[] {
  return facts
    .map((fact) => {
      const [kind, id = ''] = fact.subjectKey.split(':') as [keyof typeof LINK_TYPES, string?];
      const figures = Object.entries(fact.numbers).flatMap(([name, value]) => displays(name, value, locale));
      const record = { rule_id: fact.ruleId, severity: fact.severity, ...namesOf(fact, snapshot, labels), ...fact.numbers, ...Object.fromEntries(figures) };
      return { fact, link: `esta://${LINK_TYPES[kind]}/${id}`, record };
    })
    .toSorted((a, b) => ruleOrder(a.fact) - ruleOrder(b.fact) || sortName(a).localeCompare(sortName(b), 'vi') || a.fact.subjectKey.localeCompare(b.fact.subjectKey));
}
