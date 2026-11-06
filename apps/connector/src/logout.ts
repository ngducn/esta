import type { Db } from '@esta/ops';

export type LogoutResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'unreachable' };

/**
 * Ends this connector's session on the server and then forgets it on this Mac. A server that cannot be reached leaves
 * the saved session in place, so the sign-out can be tried again instead of looking done.
 */
export async function logOut(db: Db): Promise<LogoutResult> {
  await db.auth.getSession();
  const { error } = await db.auth.signOut({ scope: 'local' });
  return error === null ? { ok: true } : { ok: false, reason: 'unreachable' };
}
