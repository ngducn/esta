import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
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

/** One reader for every answer, so lines piped in together are not lost between two questions. */
const reader = createInterface({ input: process.stdin, terminal: false });
const lines = reader[Symbol.asyncIterator]();

async function ask(question: string): Promise<string> {
  process.stdout.write(question);
  const line = await lines.next();
  return line.done === true ? '' : line.value;
}

/** Turns the terminal's echo off while the password or code is typed, so it never shows on screen or in the scrollback. */
async function askHidden(question: string): Promise<string> {
  const tty = process.stdin.isTTY === true;
  if (tty) spawnSync('stty', ['-echo'], { stdio: 'inherit' });
  try {
    return await ask(question);
  } finally {
    if (tty) spawnSync('stty', ['echo'], { stdio: 'inherit' });
    process.stdout.write('\n');
  }
}

async function main(): Promise<void> {
  const env = connectorEnvSchema.parse(process.env);
  const db = connectorClient(env, secretStore(env.ESTA_SUPABASE_URL, { platform: process.platform, file: env.ESTA_SESSION_FILE }));
  const email = (await ask('Esta email: ')).trim().toLowerCase();
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
reader.close();
