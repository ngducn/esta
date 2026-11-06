import { logOut } from './logout';
import { connectorClient, connectorEnvSchema } from './session';
import { secretStore } from './store';

const env = connectorEnvSchema.parse(process.env);
const db = connectorClient(env, secretStore(env.ESTA_SUPABASE_URL, { platform: process.platform, file: env.ESTA_SESSION_FILE }));
const result = await logOut(db);
if (!result.ok) {
  console.error('Esta could not be reached, so the session is still signed in. Try again when it is up.');
  process.exit(1);
}
console.log(`Signed out of ${env.ESTA_SUPABASE_URL}. The session is ended on the server and removed from this Mac.`);
