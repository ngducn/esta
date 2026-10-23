import { renderMagnitude } from '../../packages/core/src/matching/render.ts';
import { upper, type OpenBill } from './household.ts';

/** A bill the template names by its place in the list, from 1. */
export type TemplateBill = Pick<OpenBill, 'memoCode' | 'outstanding' | 'tenantName'>;

const PLACEHOLDER = /\{(memo|amount|tenant):(\d+)\}/g;

/**
 * A committed statement template (SPEC §1.2) with `{memo:n}`, `{amount:n}` and `{tenant:n}` filled from the n-th bill:
 * its memo code, its outstanding amount as layout A writes it (`2.500.000`), and its tenant's name as a bank prints it,
 * without accents in capitals.
 */
export function statementFromTemplate(template: string, bills: readonly TemplateBill[]): string {
  return template.replace(PLACEHOLDER, (_match, field: string, place: string) => {
    const bill = bills[Number(place) - 1];
    if (bill === undefined) throw new Error(`The template names bill ${place}, but only ${bills.length} were given`);
    if (field === 'memo') return bill.memoCode;
    if (field === 'amount') return String(renderMagnitude(bill.outstanding, 'dot_grouped'));
    return upper(bill.tenantName);
  });
}
