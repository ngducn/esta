import { createInterface } from 'node:readline/promises';
import type { Result } from '@esta/core/result';
import { logIn, sendLoginCode, type LoginRefusal } from './login';
import { connectorClient, connectorEnvSchema, type Operator } from './session';
import { secretStore } from './store';

const MESSAGES: Record<LoginRefusal, string> = {
  wrong_credentials: 'The email, password or code is wrong.',
  send_failed: 'The code could not be sent. Wait a minute and try again.',
  signed_out: 'The sign-in did not stick. Try again.',
  no_household: 'This account belongs to no household yet. Finish onboarding in Esta first.',
  not_operator: 'Only the household operator can use the connector.',
};

/** Reads one line without echoing it, so a password never shows on screen or in the terminal's scrollback. */
async function askHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const write = Reflect.get(rl, '_writeToOutput');
  Reflect.set(rl, '_writeToOutput', (text: string) => {
    if (text.startsWith(question) || text.includes('\n')) Reflect.apply(write, rl, [text]);
  });
  const answer = await rl.question(question);
  rl.close();
  process.stdout.write('\n');
  return answer;
}

async function main(): Promise<void> {
  const env = connectorEnvSchema.parse(process.env);
  const db = connectorClient(env, secretStore(env.ESTA_SUPABASE_URL, { platform: process.platform, file: env.ESTA_SESSION_FILE }));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = (await rl.question('Esta email: ')).trim().toLowerCase();
  rl.close();
  const password = await askHidden('Password (leave empty to get a code by email): ');
  let result: Result<Operator, LoginRefusal>;
  if (password !== '') {
    result = await logIn(db, { email, password });
  } else if (!(await sendLoginCode(db, email))) {
    result = { ok: false, reason: 'send_failed' };
  } else {
    const code = await askHidden('6-digit code from the email: ');
    result = await logIn(db, { email, code: code.trim() });
  }
  if (!result.ok) {
    console.error(MESSAGES[result.reason]);
    process.exit(1);
  }
  console.log(`Signed in for ${result.value.householdName}. The connector is ready for ${env.ESTA_SUPABASE_URL}.`);
}

await main();
