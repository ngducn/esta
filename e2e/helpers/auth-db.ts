import { join } from 'node:path';
import { query } from '../../scripts/db-checksum.ts';
import { parseSlot, slotWorkdir } from '../../scripts/slot.ts';

const workdir = slotWorkdir(join(import.meta.dirname, '..', '..'), parseSlot(process.env.ESTA_SLOT));

function literal(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}

/** Moves the address's sessions past the 24 hours in which Auth counts a sign-in as recent. Returns how many moved. */
export function ageSessions(email: string): number {
  return query<{ id: string }>(
    workdir,
    `update auth.sessions set created_at = created_at - interval '25 hours'
     where user_id = (select id from auth.users where email = ${literal(email)}) returning id`,
  ).length;
}

/**
 * Puts the address inside Auth's repeat window, as a second request a moment after the first would be, however slow
 * the run. An address with no account has no row, so nothing changes for it, as in Auth.
 */
export function markCodeJustSent(email: string): void {
  query(
    workdir,
    `update auth.users set recovery_sent_at = now() + interval '1 minute', confirmation_sent_at = now() + interval '1 minute'
     where email = ${literal(email)} returning id`,
  );
}
