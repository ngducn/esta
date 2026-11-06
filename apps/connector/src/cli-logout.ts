import { logOut } from './logout';
import { connectorClient, connectorEnvSchema } from './session';
import { secretStore } from './store';

const env = connectorEnvSchema.parse(process.env);
const store = secretStore(env.ESTA_SUPABASE_URL, { platform: process.platform, file: env.ESTA_SESSION_FILE });
const result = await logOut(connectorClient(env, store), store);
if (!result.ok) {
  console.error('Not signed out: Esta could not be reached, so the session is still saved and still live. Try again when it is up.');
  process.exit(1);
}
console.log(
  result.value === 'nothing_saved'
    ? `No saved session for ${env.ESTA_SUPABASE_URL}, so there is nothing to sign out of.`
    : `Signed out of ${env.ESTA_SUPABASE_URL}. The session is ended on the server and removed from this Mac.`,
);
