import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../env';

/** Returns the 401 response to send, or null when the request carries `Bearer $CRON_SECRET`. */
export function requireCronSecret(request: Request): Response | null {
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  if (given.length === expected.length && timingSafeEqual(given, expected)) return null;
  return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
}
