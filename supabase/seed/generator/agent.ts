import type { Json } from '../../../packages/db/src/index.ts';
import { daysBetween } from '../../../packages/core/src/date/calendar.ts';
import { isoDate, type IsoDate } from '../../../packages/core/src/date/iso-date.ts';
import { formatDate, formatVnd } from '../../../packages/core/src/format/index.ts';
import { vnd } from '../../../packages/core/src/money/vnd.ts';
import { publicTable, type HouseholdSeed, type SeedRow } from './context.ts';
import { DOCUMENT_SEEDS, documentId } from './documents.ts';
import { householdId, userId } from './households.ts';
import { seedId } from './ids.ts';
import { LEASE_SEEDS, seedLeaseId, SPEC_TODAY, UNPAID } from './leasing.ts';
import { PROPERTY_SEEDS, type PropertySeedKey } from './properties.ts';
import { propertyId, unitId, UNIT_SEEDS } from './units.ts';

const pingJobId = (household: HouseholdSeed) => seedId(`seed:agent-job:ping-${household.key}`);

/** One finished replay ping per household, so Ryan's run table is not empty. No heartbeat: a fresh reset reads `never`. */
export const agentJobs = publicTable('agent_jobs', ({ household, asOf }) => [
  {
    id: pingJobId(household),
    household_id: householdId(household),
    kind: 'ping',
    status: 'done',
    run_after: asOf,
    attempts: 1,
    locked_by: 'seed',
    locked_at: asOf,
    started_at: asOf,
    finished_at: asOf,
    result: { reply: `Kết nối với Esta hoạt động bình thường cho hộ gia đình "${household.name}".` },
    requested_by: userId('ryan', household),
  },
]);

export const agentRuns = publicTable('agent_runs', ({ household, asOf }) => [
  {
    id: seedId(`seed:agent-run:ping-${household.key}`),
    household_id: householdId(household),
    job_id: pingJobId(household),
    auth_mode: 'none',
    agent_mode: 'replay',
    model: 'claude-sonnet-5-5',
    num_turns: 2,
    cost_estimate_usd: 0,
    tool_calls: { mcp__esta__household_info: 1 },
    started_at: asOf,
    finished_at: asOf,
  },
]);

type Watch = { readonly rule: string; readonly subject: string; readonly line: string; readonly related: Json };

function leaseOf(property: PropertySeedKey, unit = 1) {
  const seed = LEASE_SEEDS.find((lease) => lease.property === property && lease.unit === unit);
  if (seed === undefined) throw new Error(`No seeded lease on ${property} unit ${unit}`);
  return seed;
}

function unitOf(household: HouseholdSeed, key: PropertySeedKey, unit: number) {
  const seed = UNIT_SEEDS[key][unit - 1];
  if (seed === undefined) throw new Error(`No unit ${unit} on ${key}`);
  return { label: seed.label, availableFrom: seed.available_from, id: unitId(household, key, seed, unit - 1) };
}

const nickname = (key: PropertySeedKey) => PROPERTY_SEEDS.find((seed) => seed.key === key)?.nickname ?? key;
const date = (value: string) => formatDate(isoDate(value), 'vi');
const COUNT_WORDS = ['Một', 'Hai', 'Ba'];

/** The watch facts of SPEC §9.3's day that one grouped note words, for the properties the variant has. */
function watchFacts(household: HouseholdSeed, has: (key: PropertySeedKey) => boolean, today: IsoDate): Watch[] {
  const facts: Watch[] = [];
  const insurance = DOCUMENT_SEEDS.find((seed) => seed.key === 'q7:insurance');
  if (has('q7') && insurance !== undefined && insurance.expiresOn !== null) {
    const id = documentId(household, insurance.key);
    const line = `${insurance.title} hết hạn ngày ${date(insurance.expiresOn)}, còn ${daysBetween(today, isoDate(insurance.expiresOn))} ngày.`;
    facts.push({ rule: 'W5', subject: `document:${id}`, line, related: { property_id: propertyId(household, 'q7'), document_id: id } });
  }
  if (has('bien-hoa')) {
    const ended = leaseOf('bien-hoa').terms.endDate;
    const unit = unitOf(household, 'bien-hoa', 1);
    const line = `${nickname('bien-hoa')} để trống ${daysBetween(ended, today)} ngày, từ ${date(ended)}.`;
    facts.push({ rule: 'W4', subject: `unit:${unit.id}`, line, related: { property_id: propertyId(household, 'bien-hoa'), unit_id: unit.id } });
  }
  const room = unitOf(household, 'di-an', 8);
  if (has('di-an') && room.availableFrom !== null) {
    const line = `${room.label} ${nickname('di-an')} để trống ${daysBetween(isoDate(room.availableFrom), today)} ngày, từ ${date(room.availableFrom)}, chưa cho thuê lần nào.`;
    facts.push({ rule: 'W4', subject: `unit:${room.id}`, line, related: { property_id: propertyId(household, 'di-an'), unit_id: room.id } });
  }
  return facts;
}

/**
 * What the portfolio watch left at 06:45 on SPEC §9.3's day, worded from the seed's own facts: the W1 and W3 action
 * notes, then one note grouping the watch facts. Like the invoices, they are that day's state whatever `--as-of` says,
 * and their `created_at` is the time Mẹ reads on the card, so it is set here rather than stamped.
 */
export const agentItems = publicTable('agent_items', ({ household, properties }) => {
  const today = isoDate(SPEC_TODAY);
  const has = (key: PropertySeedKey) => properties.some((property) => property.key === key);
  const note = (rule: string, second: number, severity: 'action' | 'watch', fact: string, title: string, body: string, related: Json): SeedRow<'agent_items'> => ({
    id: seedId(`seed:agent-item:${rule}-${household.key}`),
    household_id: householdId(household),
    kind: 'alert',
    severity,
    audience: 'all',
    title,
    body_md: body,
    related,
    status: 'new',
    dedupe_key: `seed:watch:${fact}`,
    created_at: `${SPEC_TODAY}T06:45:${String(second).padStart(2, '0')}+07:00`,
  });

  const notes: SeedRow<'agent_items'>[] = [];
  if (has(UNPAID.property)) {
    const lease = leaseOf(UNPAID.property, UNPAID.unit);
    const unit = unitOf(household, UNPAID.property, UNPAID.unit);
    // Rooms bill from the 25th with no due offset, so the period starts on its due date, the key `billingSql` mints.
    const invoice = seedId(`seed:invoice:${household.key}:${UNPAID.property}:${UNPAID.unit}:${UNPAID.dueDate}`);
    // Nobody paid this invoice and its period bills rent alone (the September readings go on October's), so the rent is what is owed.
    const owed = formatVnd(vnd(lease.terms.rentVnd), 'vi');
    const title = `${unit.label} ${nickname(UNPAID.property)} quá hạn ${daysBetween(isoDate(UNPAID.dueDate), today)} ngày`;
    const body = `Hóa đơn của ${lease.tenant.fullName} đến hạn ngày ${date(UNPAID.dueDate)} vẫn chưa thanh toán. Còn nợ ${owed}.`;
    notes.push(note('W1', 30, 'action', `W1:invoice:${invoice}`, title, body, { property_id: propertyId(household, UNPAID.property), unit_id: unit.id, lease_id: seedLeaseId(household, lease), invoice_id: invoice }));
  }
  if (has('thu-duc')) {
    const lease = leaseOf('thu-duc');
    const id = seedLeaseId(household, lease);
    const title = `Hợp đồng ${nickname('thu-duc')} hết hạn sau ${daysBetween(today, lease.terms.endDate)} ngày`;
    const body = `Hợp đồng với ${lease.tenant.fullName} kết thúc ngày ${date(lease.terms.endDate)} và chưa có hợp đồng gia hạn.`;
    notes.push(note('W3', 20, 'action', `W3:lease:${id}`, title, body, { property_id: propertyId(household, 'thu-duc'), lease_id: id }));
  }
  const facts = watchFacts(household, has, today);
  if (facts.length > 0) {
    // The facts sit under `facts`, so the inbox never reads the insurance paper's id as a review link.
    const title = `${COUNT_WORDS[facts.length - 1] ?? facts.length} việc cần để ý`;
    notes.push(note('watch', 10, 'watch', `group:${SPEC_TODAY}`, title, facts.map((fact) => `- ${fact.line}`).join('\n'), { facts: facts.map((fact) => fact.related) }));
  }
  return notes;
});
