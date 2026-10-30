import 'server-only';
import { addDays, firstOfMonth } from '@esta/core/date/calendar';
import type { IsoDate } from '@esta/core/date';
import { formatDate, formatVnd } from '@esta/core/format';
import { renewalRent } from '@esta/core/lease';
import { vnd } from '@esta/core/money';
import type { Proposal } from '@esta/core/proposals';
import { readLeaseNames, readLeases, readLeaseSchedule } from '@esta/ops';
import { getLocale, getTranslations } from 'next-intl/server';
import type { InboxNote } from '@/server/agent/items';
import { loadCollectionRows, loadOwedBills } from '@/server/collections/load';
import { loadReceivingAccount } from '@/server/invoices/qr';
import { boardReminders, type ReminderTarget } from '@/server/reminders/board';
import { createSessionClient } from '@/server/supabase/server';

/** What a proposal card shows beyond the stored text, all written by Esta from the validated params and the records. */
export type ProposalDetails = {
  /** The question a `names_object` type asks before it runs, such as `Tăng tiền thuê Phòng 2, Dãy trọ Dĩ An lên 3.800.000 ₫ từ 25/11/2026?` */
  readonly confirm: string | null;
  /** The bill's reminder that a `draft_reminder` opens, drafted in the browser by P3-13's sheet. */
  readonly reminder: ReminderTarget | null;
  /** The lease an approved rent change or renewal wrote. */
  readonly leaseHref: string | null;
};

type LeaseProposal = Extract<Proposal, { type: 'suggest_rent_change' | 'suggest_lease_renewal' | 'draft_reminder' }>;

const isLeaseProposal = (proposal: Proposal): proposal is LeaseProposal =>
  proposal.type === 'suggest_rent_change' || proposal.type === 'suggest_lease_renewal' || proposal.type === 'draft_reminder';

async function reminderTargets(householdId: string, leaseIds: ReadonlySet<string>, today: IsoDate): Promise<Map<string, ReminderTarget>> {
  if (leaseIds.size === 0) return new Map();
  const [rows, account] = await Promise.all([loadCollectionRows(householdId, firstOfMonth(today)), loadReceivingAccount(householdId)]);
  const leaseRows = rows.filter((row) => leaseIds.has(row.leaseId));
  const targets = await boardReminders(leaseRows, await loadOwedBills(householdId, leaseRows), today, account !== null);
  const byLease = new Map<string, ReminderTarget>();
  for (const row of leaseRows) {
    const target = targets.get(row.invoiceId);
    if (target !== undefined && !byLease.has(row.leaseId)) byLease.set(row.leaseId, target);
  }
  return byLease;
}

/**
 * The details of the lease proposals among `notes`, by item id. A member who cannot decide gets no reminder, as the
 * collections board gives a viewer no `Nhắc qua Zalo`.
 */
export async function loadProposalDetails(householdId: string, notes: readonly InboxNote[], today: IsoDate, canDecide: boolean): Promise<Map<string, ProposalDetails>> {
  const proposals = notes.flatMap((note) => {
    const parsed = note.proposal?.parsed;
    return parsed !== undefined && parsed !== null && isLeaseProposal(parsed) ? [{ note, proposal: parsed }] : [];
  });
  if (proposals.length === 0) return new Map();
  const db = await createSessionClient();
  const leaseIds = new Set(proposals.map(({ proposal }) => proposal.params.lease_id));
  const leases = (await readLeases(db, householdId)).filter((lease) => leaseIds.has(lease.id));
  const until = proposals.reduce<IsoDate>((latest, { proposal }) => {
    const date = proposal.type === 'suggest_rent_change' ? proposal.params.effective_period_start : today;
    return date > latest ? date : latest;
  }, leases.reduce<IsoDate>((latest, lease) => (lease.end_date !== null && lease.end_date > latest ? lease.end_date : latest), today));
  const reminderLeases = new Set(canDecide ? proposals.flatMap(({ proposal }) => (proposal.type === 'draft_reminder' ? [proposal.params.lease_id] : [])) : []);
  const [t, locale] = await Promise.all([getTranslations('assistant'), getLocale()]);
  const [names, schedule, written, reminders] = await Promise.all([
    readLeaseNames(db, householdId, leases),
    readLeaseSchedule(db, [...leaseIds], until),
    db.from('leases').select('id, property_id, agent_item_id').eq('household_id', householdId).in('agent_item_id', proposals.map(({ note }) => note.id)),
    reminderTargets(householdId, reminderLeases, today),
  ]);
  if (written.error) throw new Error(`Reading the leases approvals wrote failed: ${written.error.message}`);
  const byId = new Map(leases.map((lease) => [lease.id, lease]));
  const rentBefore = (leaseId: string, start: IsoDate) => schedule.filter((period) => period.leaseId === leaseId && period.start < start).at(-1)?.monthlyRentVnd ?? null;
  const leaseHref = (lease: { readonly id: string; readonly property_id: string }) => `/properties/${lease.property_id}/rental/leases/${lease.id}`;

  return new Map(
    proposals.map(({ note, proposal }) => {
      const lease = byId.get(proposal.params.lease_id);
      const unit = lease === undefined ? undefined : names.units.get(lease.unit_id);
      const property = lease === undefined ? undefined : names.properties.get(lease.property_id);
      const place = property === undefined ? null : unit === undefined || unit.whole ? property : t('place', { unit: unit.label, property });
      const decided = note.status === 'approved';
      const details: ProposalDetails = { confirm: null, reminder: reminders.get(proposal.params.lease_id) ?? null, leaseHref: null };
      if (lease === undefined || place === null) return [note.id, details] as const;
      if (proposal.type === 'suggest_rent_change') {
        const { rent_vnd: rent, effective_period_start: start } = proposal.params;
        const before = rentBefore(lease.id, start);
        const direction = before === null || before === rent ? 'other' : rent > before ? 'up' : 'down';
        const confirm = t('confirmRentChange', { direction, place, amount: formatVnd(vnd(rent), locale), date: formatDate(start, locale) });
        return [note.id, { ...details, confirm, leaseHref: decided ? leaseHref(lease) : null }] as const;
      }
      if (proposal.type === 'suggest_lease_renewal' && lease.end_date !== null) {
        const last = rentBefore(lease.id, addDays(lease.end_date, 1));
        const amount = last === null ? null : formatVnd(renewalRent(last, proposal.params.increase_bps), locale);
        const draft = written.data.find((row) => row.agent_item_id === note.id);
        return [
          note.id,
          {
            ...details,
            confirm: amount === null ? null : t('confirmRenewal', { place, amount, date: formatDate(proposal.params.end_date, locale) }),
            leaseHref: draft === undefined ? null : leaseHref(draft),
          },
        ] as const;
      }
      return [note.id, details] as const;
    }),
  );
}
