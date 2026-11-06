import type { Result } from '@esta/core/result';
import type { Db } from '@esta/ops';

/**
 * Ends this connector's session on the server and then forgets it on this Mac. A server that cannot be reached leaves
 * the saved session in place, so the sign-out can be tried again instead of looking done.
 */
export async function logOut(db: Db): Promise<Result<null, 'unreachable'>> {
  await db.auth.getSession();
  const { error } = await db.auth.signOut({ scope: 'local' });
  return error === null ? { ok: true, value: null } : { ok: false, reason: 'unreachable' };
}
