import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';

/** The storage supabase-js keeps the session in. Each value holds the refresh token, so it never reaches a log or the repo. */
export type SecretStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type Run = (command: string, args: readonly string[], input?: string) => { status: number | null; stdout: string };

const runCommand: Run = (command, args, input) => {
  const result = spawnSync(command, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  return { status: result.status, stdout: result.stdout };
};

const SERVICE = 'esta-connector';
const NOT_FOUND = 44;

/**
 * The macOS Keychain through `security`. A new value goes in on stdin through `security -i`, never as an argument,
 * so no other process can read it from the process list; base64 keeps it one quoted-free token.
 */
export function keychainStore(scope: string, run: Run = runCommand): SecretStore {
  const account = (key: string) => `${scope}#${key}`;
  return {
    getItem(key) {
      const found = run('security', ['find-generic-password', '-s', SERVICE, '-a', account(key), '-w']);
      if (found.status === NOT_FOUND) return null;
      if (found.status !== 0) throw new Error(`Reading the Keychain item ${SERVICE} failed`);
      return Buffer.from(found.stdout.trim(), 'base64').toString('utf8');
    },
    setItem(key, value) {
      const encoded = Buffer.from(value, 'utf8').toString('base64');
      const saved = run('security', ['-i'], `add-generic-password -U -s ${SERVICE} -a "${account(key)}" -w ${encoded}\n`);
      if (saved.status !== 0) throw new Error(`Saving the Keychain item ${SERVICE} failed`);
    },
    removeItem(key) {
      const removed = run('security', ['delete-generic-password', '-s', SERVICE, '-a', account(key)]);
      if (removed.status !== 0 && removed.status !== NOT_FOUND) throw new Error(`Removing the Keychain item ${SERVICE} failed`);
    },
  };
}

const fileSchema = z.record(z.string(), z.string());

/** Where `security` does not exist: one JSON file only its owner can read, in a folder only its owner can open. */
export function fileStore(scope: string, file: string): SecretStore {
  const account = (key: string) => `${scope}#${key}`;
  const read = () => (existsSync(file) ? fileSchema.parse(JSON.parse(readFileSync(file, 'utf8'))) : {});
  const write = (items: Record<string, string>) => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify(items), { mode: 0o600 });
    chmodSync(file, 0o600);
  };
  return {
    getItem: (key) => read()[account(key)] ?? null,
    setItem: (key, value) => write({ ...read(), [account(key)]: value }),
    removeItem: (key) => write(Object.fromEntries(Object.entries(read()).filter(([name]) => name !== account(key)))),
  };
}

export const DEFAULT_SESSION_FILE = join(homedir(), '.config', 'esta', 'connector-session.json');

/** Each Supabase URL keeps its own session, so a session for one local slot is never sent to another. */
export function secretStore(supabaseUrl: string, options: { platform: NodeJS.Platform; file: string | undefined }): SecretStore {
  return options.platform === 'darwin' && options.file === undefined
    ? keychainStore(supabaseUrl)
    : fileStore(supabaseUrl, options.file ?? DEFAULT_SESSION_FILE);
}
