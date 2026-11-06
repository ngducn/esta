import type { Result } from '@esta/core/result';
import type { Db } from '@esta/ops';
import { STORAGE_KEY } from './session';
import type { SecretStore } from './store';

/** A server that no longer knows the session has nothing left to end. */
const SESSION_GONE = [401, 403, 404];

/**
 * Ends this connector's session on the server and then forgets it on this Mac. The saved session is removed here, only
 * after the server confirmed, because supabase-js's own `signOut` clears it before it returns an error, which would leave
 * a live session that nothing on this Mac can end.
 */
export async function logOut(db: Db, store: SecretStore): Promise<Result<'signed_out' | 'nothing_saved', 'unreachable'>> {
  const { data, error: readError } = await db.auth.getSession();
  if (readError !== null) return { ok: false, reason: 'unreachable' };
  if (data.session === null) return { ok: true, value: 'nothing_saved' };
  const { error } = await db.auth.admin.signOut(data.session.access_token, 'local');
  if (error !== null && !SESSION_GONE.includes(error.status ?? 0)) return { ok: false, reason: 'unreachable' };
  store.removeItem(STORAGE_KEY);
  return { ok: true, value: 'signed_out' };
}
