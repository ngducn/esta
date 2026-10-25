import { formatBps, formatCount, formatDate, formatVnd } from '@esta/core/format';
import { rentInEffect } from '@esta/core/lease';
import { estaUri } from '@esta/core/links';
import { vnd } from '@esta/core/money';
import { propertyStatus } from '@esta/core/properties';
import { vacantDays } from '@esta/core/reports';
import { grossYieldBp, latestValuation } from '@esta/core/valuations';
import { z } from 'zod';
import type { ReadToolContext } from './ask-reads';
import { sameAnswer } from './fact-sheet';
import { propertyByHandle } from './list-properties';
import { parseToolInput } from './server';

const getInput = z.strictObject({ property: z.string() });
const metricsInput = z.strictObject({ property: z.string(), year: z.number().int().min(2000).max(2100) });

/** `get_property` (AGENT.md §4): a property's certificates with any mortgage, its owners and its latest valuation. */
export function getPropertyTool({ reads, locale, asOf, cite, properties }: ReadToolContext) {
  return sameAnswer(async (raw: Record<string, unknown>) => {
    const property = propertyByHandle(properties, parseToolInput(getInput, raw, 'get_property takes {"property": a handle from list_properties}').property);
    const [legal, report] = await Promise.all([reads.legal(property.id), reads.report(Number(asOf.slice(0, 4)))]);
    const valuation = latestValuation(
      report.valuations.filter((row) => row.propertyId === property.id),
      asOf,
    );
    const link = estaUri({ type: 'property', id: property.id });
    return {
      property: cite({
        property_label: property.property_label,
        valuation_display: valuation === undefined ? null : formatVnd(valuation.valueVnd, locale),
        valuation_date_display: valuation === undefined ? null : formatDate(valuation.asOf, locale),
        link,
      }),
      certificates: legal.certificates.map((certificate) => {
        const mortgage = certificate.status === 'mortgaged' ? certificate.mortgage : null;
        return cite({
          serial_label: certificate.serial_no,
          status: certificate.status,
          mortgage_bank_name: mortgage === null ? null : (legal.partyNames[mortgage.bank_party_id] ?? null),
          mortgage_amount_display: mortgage === null ? null : formatVnd(mortgage.amount_vnd, locale),
          mortgage_registered_date_display: mortgage?.registered_on === undefined ? null : formatDate(mortgage.registered_on, locale),
          link: estaUri({ type: 'legal', id: property.id }),
        });
      }),
      owners: legal.owners.map((owner) =>
        cite({ owner_name: legal.partyNames[owner.party_id] ?? null, share_display: formatBps(owner.share_bp, locale), named_on_certificate: owner.named_on_certificate }),
      ),
    };
  });
}

/**
 * `property_metrics` (AGENT.md §4): a rental property's rent in effect, gross yield on its latest valuation, each
 * unit's days empty, and the date of its `Trống từ` pill, read from the same row the property page reads.
 */
export function propertyMetricsTool({ reads, locale, asOf, cite, properties }: ReadToolContext) {
  return sameAnswer(async (raw: Record<string, unknown>) => {
    const input = parseToolInput(metricsInput, raw, 'property_metrics takes {"property": a handle from list_properties, "year"}');
    const property = propertyByHandle(properties, input.property);
    const [report, row] = await Promise.all([reads.report(input.year), reads.property(property.id)]);
    const monthly = rentInEffect(
      report.leases.filter((lease) => lease.property_id === property.id),
      report.schedule,
      asOf,
    );
    const valuation = latestValuation(
      report.valuations.filter((row) => row.propertyId === property.id),
      asOf,
    );
    const units = report.units
      .filter((unit) => unit.propertyId === property.id)
      .map((unit) => ({ unit, empty: vacantDays(unit, report.tenancies.filter((lease) => lease.unitId === unit.id), asOf) }));
    const leased = units.filter(({ empty }) => empty === 'leased').length;
    const pills = row === null ? [] : propertyStatus({ ...row, leasedUnitCount: leased, collection: null }, asOf);
    const vacant = pills.find((pill) => pill.kind === 'vacant');
    return {
      property: cite({
        property_label: property.property_label,
        monthly_rent_display: monthly === null ? null : formatVnd(monthly, locale),
        annual_rent_display: monthly === null ? null : formatVnd(vnd(monthly * 12), locale),
        gross_yield_display: monthly === null || valuation === undefined ? null : formatBps(grossYieldBp(monthly, valuation.valueVnd), locale),
        valuation_display: valuation === undefined ? null : formatVnd(valuation.valueVnd, locale),
        valuation_date_display: valuation === undefined ? null : formatDate(valuation.asOf, locale),
        unit_count_display: formatCount(units.length, locale),
        leased_unit_count_display: formatCount(leased, locale),
        empty_since_date_display: vacant === undefined ? null : formatDate(vacant.since, locale),
        link: estaUri({ type: 'property', id: property.id }),
      }),
      units: units.map(({ unit, empty }) =>
        cite({
          unit_label: unit.wholeUnit ? property.property_label : unit.label,
          leased: empty === 'leased',
          empty_days_display: typeof empty === 'number' ? formatCount(empty, locale) : null,
          link: estaUri({ type: 'unit', id: unit.id }),
        }),
      ),
    };
  });
}
