import type { IsoDate } from '@esta/core/date';
import type { LeaseFormDefaults, TaxPayer, UtilitiesMode } from '@esta/core/lease';
import { parsePercentBps } from '@esta/core/parse/percent';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import { vndInputText } from '@esta/core/properties';
import type { EscalationJson, LeaseDraft, LeaseRow } from '@esta/core/schemas/lease';
import type { BillingCycleMonths, FirstPeriodProration, PeriodAnchor } from '@esta/core/schedule';

export type LeaseFormValues = {
  unitId: string;
  tenantId: string;
  start: IsoDate | null;
  end: IsoDate | null;
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

export type Invalid = 'rent' | 'deposit' | 'end' | 'escalationValue' | 'escalationEvery' | 'notice' | null;
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
  const rent = values.rentText.trim() === '' ? null : parseVndInput(values.rentText);
  if (rent !== null && !rent.ok) return { ok: false, field: 'rent' };
  const deposit = values.depositText.trim() === '' ? null : parseVndInput(values.depositText);
  if (deposit !== null && !deposit.ok) return { ok: false, field: 'deposit' };
  if (values.start !== null && values.end !== null && values.end < values.start) return { ok: false, field: 'end' };
  const notice = values.noticeText.trim();
  if (notice !== '' && (!WHOLE.test(notice) || Number(notice) > 365)) return { ok: false, field: 'notice' };
  const escalation = readEscalation(values);
  if (!escalation.ok) return escalation;
  return {
    ok: true,
    value: {
      unit_id: values.unitId,
      tenant_party_id: values.tenantId === '' ? null : values.tenantId,
      start_date: values.start,
      end_date: values.end,
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
    start: row.start_date,
    end: row.end_date,
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
    start: null,
    end: null,
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
