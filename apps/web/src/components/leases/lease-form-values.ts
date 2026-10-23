import type { LeaseFormDefaults, LeaseTermsFromContract, TaxPayer, UtilitiesMode } from '@esta/core/lease';
import { formatDate } from '@esta/core/format';
import { parseOptionalDateInput } from '@esta/core/parse/date-input';
import { parsePercentBps } from '@esta/core/parse/percent';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import { vndInputText } from '@esta/core/properties/form';
import type { EscalationJson, LeaseDraft, LeaseRow } from '@esta/core/schemas/lease';
import type { BillingCycleMonths, FirstPeriodProration, PeriodAnchor } from '@esta/core/schedule';

export type LeaseFormValues = {
  unitId: string;
  tenantId: string;
  startText: string;
  endText: string;
  rentText: string;
  cycle: BillingCycleMonths;
  anchor: PeriodAnchor;
  proration: FirstPeriodProration;
  depositText: string;
  escalation: EscalationJson['kind'];
  escalationValueText: string;
  escalationEveryText: string;
  utilities: UtilitiesMode;
  taxPayer: TaxPayer;
  noticeText: string;
};

export type Invalid = 'start' | 'end' | 'endBeforeStart' | 'rent' | 'rentZero' | 'deposit' | 'escalationValue' | 'escalationEvery' | 'notice' | null;
const WHOLE = /^\d{1,3}$/;

function readEscalation(values: LeaseFormValues): { ok: true; value: EscalationJson } | { ok: false; field: Invalid } {
  if (values.escalation === 'none') return { ok: true, value: { kind: 'none' } };
  const every = Number(values.escalationEveryText);
  if (!WHOLE.test(values.escalationEveryText.trim()) || every < 1 || every > 120) return { ok: false, field: 'escalationEvery' };
  if (values.escalation === 'percent') {
    const bps = parsePercentBps(values.escalationValueText);
    return bps.ok ? { ok: true, value: { kind: 'percent', value: bps.value, every_months: every } } : { ok: false, field: 'escalationValue' };
  }
  const amount = parseVndInput(values.escalationValueText);
  return amount.ok ? { ok: true, value: { kind: 'fixed', value: amount.value, every_months: every } } : { ok: false, field: 'escalationValue' };
}

export function readDraft(values: LeaseFormValues): { ok: true; value: LeaseDraft } | { ok: false; field: Invalid } {
  const start = parseOptionalDateInput(values.startText);
  if (!start.ok) return { ok: false, field: 'start' };
  const end = parseOptionalDateInput(values.endText);
  if (!end.ok) return { ok: false, field: 'end' };
  if (start.value !== null && end.value !== null && end.value < start.value) return { ok: false, field: 'endBeforeStart' };
  const rent = values.rentText.trim() === '' ? null : parseVndInput(values.rentText);
  if (rent !== null && !rent.ok) return { ok: false, field: 'rent' };
  if (rent?.value === 0) return { ok: false, field: 'rentZero' };
  const deposit = values.depositText.trim() === '' ? null : parseVndInput(values.depositText);
  if (deposit !== null && !deposit.ok) return { ok: false, field: 'deposit' };
  const notice = values.noticeText.trim();
  if (notice !== '' && (!WHOLE.test(notice) || Number(notice) > 365)) return { ok: false, field: 'notice' };
  const escalation = readEscalation(values);
  if (!escalation.ok) return escalation;
  return {
    ok: true,
    value: {
      unit_id: values.unitId,
      tenant_party_id: values.tenantId === '' ? null : values.tenantId,
      start_date: start.value,
      end_date: end.value,
      rent_vnd: rent === null ? null : rent.value,
      billing_cycle_months: values.cycle,
      period_anchor: values.anchor,
      first_period_proration: values.proration,
      deposit_vnd: deposit === null ? null : deposit.value,
      escalation: escalation.value,
      utilities_mode: values.utilities,
      tax_payer: values.taxPayer,
      notice_days: notice === '' ? null : Number(notice),
    },
  };
}

export function defaultsToValues(base: LeaseFormValues, defaults: LeaseFormDefaults): LeaseFormValues {
  return {
    ...base,
    rentText: defaults.rentVnd === null ? '' : vndInputText(defaults.rentVnd),
    depositText: defaults.depositVnd === null ? '' : vndInputText(defaults.depositVnd),
    cycle: defaults.billingCycleMonths,
    anchor: defaults.periodAnchor,
    proration: defaults.firstPeriodProration,
    utilities: defaults.utilitiesMode,
    taxPayer: defaults.taxPayer,
    noticeText: String(defaults.noticeDays),
  };
}

/** A draft as the form shows it, amounts in the dotted form Mẹ types. */
export function valuesFromRow(row: LeaseRow): LeaseFormValues {
  const { escalation } = row;
  return {
    unitId: row.unit_id,
    tenantId: row.tenant_party_id ?? '',
    startText: row.start_date === null ? '' : formatDate(row.start_date, 'vi'),
    endText: row.end_date === null ? '' : formatDate(row.end_date, 'vi'),
    rentText: row.rent_vnd === null ? '' : vndInputText(row.rent_vnd),
    cycle: row.billing_cycle_months,
    anchor: row.period_anchor,
    proration: row.first_period_proration,
    depositText: row.deposit_vnd === null ? '' : vndInputText(row.deposit_vnd),
    escalation: escalation.kind,
    escalationValueText:
      escalation.kind === 'none' ? '' : escalation.kind === 'percent' ? String(escalation.value / 100).replace('.', ',') : vndInputText(escalation.value),
    escalationEveryText: escalation.kind === 'none' ? '12' : String(escalation.every_months),
    utilities: row.utilities_mode,
    taxPayer: row.tax_payer,
    noticeText: row.notice_days === null ? '' : String(row.notice_days),
  };
}

export function newLeaseValues(unitId: string, defaults: LeaseFormDefaults): LeaseFormValues {
  const blank: LeaseFormValues = {
    unitId,
    tenantId: '',
    startText: '',
    endText: '',
    rentText: '',
    cycle: 1,
    anchor: 'calendar_month',
    proration: 'by_days',
    depositText: '',
    escalation: 'none',
    escalationValueText: '',
    escalationEveryText: '12',
    utilities: 'tenant_direct',
    taxPayer: 'owner',
    noticeText: '',
  };
  return defaultsToValues(blank, defaults);
}

/** A new lease's values with what a scanned contract said, and the fields it filled, for their marks (P3-19). */
export function withContract(values: LeaseFormValues, terms: LeaseTermsFromContract, tenantId: string | null): { values: LeaseFormValues; prefilled: (keyof LeaseFormValues)[] } {
  const filled: Partial<LeaseFormValues> = {
    ...(terms.unit_id === undefined ? {} : { unitId: terms.unit_id }),
    ...(tenantId === null ? {} : { tenantId }),
    ...(terms.start_date === undefined ? {} : { startText: formatDate(terms.start_date, 'vi') }),
    ...(terms.end_date === undefined ? {} : { endText: formatDate(terms.end_date, 'vi') }),
    ...(terms.rent_vnd === undefined ? {} : { rentText: vndInputText(terms.rent_vnd) }),
    ...(terms.billing_cycle_months === undefined ? {} : { cycle: terms.billing_cycle_months }),
    ...(terms.deposit_vnd === undefined ? {} : { depositText: vndInputText(terms.deposit_vnd) }),
  };
  return { values: { ...values, ...filled }, prefilled: Object.keys(filled) as (keyof LeaseFormValues)[] };
}
