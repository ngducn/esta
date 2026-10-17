import { businessDate } from '../clock/resolve';
import type { Instant } from '../clock/clock';
import { formatDate } from '../format';

export const AUDIT_ACTIONS = ['insert', 'update', 'delete'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTOR_KINDS = ['user', 'agent', 'system'] as const;
export type AuditActorKind = (typeof AUDIT_ACTOR_KINDS)[number];

export type AuditChange = { readonly old: unknown; readonly new: unknown };

/** One `audit_log` row as `property_activity` returns it. */
export type ActivityRow = {
  readonly table: string;
  readonly action: AuditAction;
  readonly actorKind: AuditActorKind;
  readonly actorId: string;
  readonly actorName: string | null;
  readonly diff: Readonly<Record<string, AuditChange>>;
};

export const ACTIVITY_EVENTS = [
  'created',
  'deleted',
  'updated',
  'renamed',
  'location',
  'locationCleared',
  'boundary',
  'boundaryCleared',
  'address',
  'certificateAddress',
  'photo',
  'kind',
  'kindDetails',
  'useMode',
  'legalStatus',
  'archived',
  'restored',
] as const;
export type ActivityEvent = (typeof ACTIVITY_EVENTS)[number];

export type ActivityActor =
  | { readonly kind: 'member'; readonly name: string | null }
  | { readonly kind: 'assistant' }
  | { readonly kind: 'seed' }
  | { readonly kind: 'system' };

export type ActivityDescription = {
  readonly actor: ActivityActor;
  readonly event: ActivityEvent;
  readonly params: { readonly name?: string };
};

const cleared = (change: AuditChange) => change.new === null;

/** Which event a change to one column reads as; a column missing here makes the whole update read as `updated`. */
type KeyRule = (change: AuditChange) => ActivityEvent;

const PROPERTY_KEYS: Readonly<Record<string, KeyRule>> = {
  nickname: () => 'renamed',
  location: (change) => (cleared(change) ? 'locationCleared' : 'location'),
  boundary: (change) => (cleared(change) ? 'boundaryCleared' : 'boundary'),
  current_address: () => 'address',
  certificate_address_text: () => 'certificateAddress',
  cover_photo_path: () => 'photo',
  kind: () => 'kind',
  kind_details: () => 'kindDetails',
  use_mode: () => 'useMode',
  legal_status: () => 'legalStatus',
  deleted_at: (change) => (cleared(change) ? 'restored' : 'archived'),
};

const UPDATE_RULES: Readonly<Record<string, Readonly<Record<string, KeyRule>>>> = { properties: PROPERTY_KEYS };

function actorOf(row: ActivityRow): ActivityActor {
  if (row.actorKind === 'user') return { kind: 'member', name: row.actorName };
  if (row.actorKind === 'agent') return { kind: 'assistant' };
  return row.actorId === 'seed' ? { kind: 'seed' } : { kind: 'system' };
}

function updateEvent(table: string, diff: ActivityRow['diff']): ActivityEvent {
  const rules = UPDATE_RULES[table] ?? {};
  const events = new Set(Object.entries(diff).map(([key, change]) => rules[key]?.(change) ?? 'updated'));
  const [only] = events;
  return events.size === 1 && only !== undefined ? only : 'updated';
}

export function describeActivity(row: ActivityRow): ActivityDescription {
  const actor = actorOf(row);
  if (row.action === 'insert') return { actor, event: 'created', params: {} };
  if (row.action === 'delete') return { actor, event: 'deleted', params: {} };
  const event = updateEvent(row.table, row.diff);
  const name = row.diff.nickname?.new;
  return { actor, event, params: event === 'renamed' && typeof name === 'string' ? { name } : {} };
}

const timeFormats = new Map<string, Intl.DateTimeFormat>();

/** `09:00` and `07/10/2026` in the business timezone, the two halves of "lúc 09:00, 07/10/2026". */
export function activityTime(at: Instant, timezone: string): { readonly time: string; readonly date: string } {
  let format = timeFormats.get(timezone);
  if (format === undefined) {
    format = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    timeFormats.set(timezone, format);
  }
  return { time: format.format(Date.parse(at)), date: formatDate(businessDate(at, timezone), 'vi') };
}
