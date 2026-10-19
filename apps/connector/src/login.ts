import type { Result } from '@esta/core/result';
import type { Db } from '@esta/ops';
import { currentOperator, type Operator, type OperatorRefusal } from './session';

export type LoginRefusal = OperatorRefusal | 'wrong_credentials' | 'send_failed';

export type Credentials = { readonly email: string; readonly password: string } | { readonly email: string; readonly code: string };

/**
 * Esta's own sign-in (SPEC D8): email and password, or the 6-digit code mailed to that address. The session is kept
 * only for the household's operator; anyone else is signed out again, so nothing of theirs stays in the store.
 */
export async function logIn(db: Db, credentials: Credentials): Promise<Result<Operator, LoginRefusal>> {
  const { error } =
    'password' in credentials
      ? await db.auth.signInWithPassword({ email: credentials.email, password: credentials.password })
      : await db.auth.verifyOtp({ email: credentials.email, token: credentials.code, type: 'email' });
  if (error) return { ok: false, reason: 'wrong_credentials' };
  const operator = await currentOperator(db);
  if (!operator.ok) await db.auth.signOut({ scope: 'local' });
  return operator;
}

export async function sendLoginCode(db: Db, email: string): Promise<boolean> {
  const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  return error === null;
}
