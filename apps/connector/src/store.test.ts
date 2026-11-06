import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileStore, keychainStore, SECURITY_LINE_LIMIT, secretStore, type Run } from './store';

const SECRET = '{"refresh_token":"demo-refresh-token value"}';

function fakeSecurity() {
  const items = new Map<string, string>();
  const calls: { args: readonly string[]; input: string | undefined }[] = [];
  const run: Run = (_command, args, input) => {
    calls.push({ args, input });
    if (args[0] === '-i') {
      const [, account = '', encoded = ''] = /-a "([^"]+)" -w (\S+)/.exec(input ?? '') ?? [];
      items.set(account, encoded);
      return { status: 0, stdout: '' };
    }
    const account = args[args.indexOf('-a') + 1] ?? '';
    const found = items.get(account);
    if (found === undefined) return { status: 44, stdout: '' };
    if (args[0] === 'delete-generic-password') items.delete(account);
    return { status: 0, stdout: `${found}\n` };
  };
  return { run, calls };
}

describe('keychainStore', () => {
  it('reads back what it saved, and never passes the secret as a command argument', () => {
    const security = fakeSecurity();
    const store = keychainStore('http://127.0.0.1:54321', security.run);
    store.setItem('session', SECRET);
    expect(store.getItem('session')).toBe(SECRET);
    const argv = security.calls.flatMap((call) => call.args).join(' ');
    const encoded = Buffer.from(SECRET).toString('base64');
    expect(argv).not.toContain('demo-refresh-token');
    expect(argv).not.toContain(encoded);
    expect(security.calls.some((call) => call.input?.includes(encoded))).toBe(true);
  });

  it('returns null for a missing item and removes an item that is there or not', () => {
    const store = keychainStore('http://127.0.0.1:54321', fakeSecurity().run);
    expect(store.getItem('session')).toBeNull();
    store.removeItem('session');
    store.setItem('session', SECRET);
    store.removeItem('session');
    expect(store.getItem('session')).toBeNull();
  });

  it('keeps one session per Supabase URL', () => {
    const security = fakeSecurity();
    keychainStore('http://127.0.0.1:54321', security.run).setItem('session', SECRET);
    expect(keychainStore('http://127.0.0.1:54421', security.run).getItem('session')).toBeNull();
  });

  it('refuses a session whose command line `security -i` would cut, and saves one a byte shorter', () => {
    const lineBytes = (value: string) => Buffer.byteLength(`add-generic-password -U -s esta-connector -a "http://127.0.0.1:54321#session" -w ${Buffer.from(value).toString('base64')}\n`);
    const sized = (size: number) => JSON.stringify({ refresh_token: 'demo', claims: 'x'.repeat(size) });
    let size = 2400;
    while (lineBytes(sized(size + 1)) <= SECURITY_LINE_LIMIT) size += 1;
    const atLimit = { value: sized(size), bytes: lineBytes(sized(size)) };
    expect(atLimit.bytes, 'the longest line that fits is within one base64 step of the limit').toBeGreaterThan(SECURITY_LINE_LIMIT - 4);

    const security = fakeSecurity();
    const store = keychainStore('http://127.0.0.1:54321', security.run);
    store.setItem('session', atLimit.value);
    expect(store.getItem('session')).toBe(atLimit.value);

    const over = { value: sized(size + 1) };
    expect(lineBytes(over.value)).toBeGreaterThan(SECURITY_LINE_LIMIT);
    expect(() => store.setItem('session', over.value)).toThrow(/too long for the Keychain/);
    expect(security.calls.filter((call) => call.args[0] === '-i')).toHaveLength(1);
  });

  it.runIf(process.platform === 'darwin')('SECURITY_LINE_LIMIT is the longest line the real `security -i` takes whole', () => {
    const prefix = 'show-keychain-info /nonexistent/';
    const cutsAt = (bytes: number) => {
      const line = `${prefix}${'a'.repeat(bytes - prefix.length - 1)}\n`;
      const out = spawnSync('security', ['-i'], { input: line, encoding: 'utf8' });
      return `${out.stdout}${out.stderr}`.includes('unknown command');
    };
    expect(cutsAt(SECURITY_LINE_LIMIT), 'a line at the limit runs as one command').toBe(false);
    expect(cutsAt(SECURITY_LINE_LIMIT + 1), 'one byte more is cut').toBe(true);
  });

  it('fails loudly when the Keychain refuses a write', () => {
    const store = keychainStore('http://127.0.0.1:54321', () => ({ status: 1, stdout: '' }));
    expect(() => store.setItem('session', SECRET)).toThrow('Saving the Keychain item esta-connector failed');
  });
});

describe('fileStore', () => {
  it('writes a file only its owner can read, in a folder only its owner can open', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'esta-connector-')), 'esta', 'session.json');
    const store = fileStore('http://127.0.0.1:54321', file);
    store.setItem('session', SECRET);
    expect(store.getItem('session')).toBe(SECRET);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(file, '..')).mode & 0o777).toBe(0o700);
  });

  it('keeps one session per Supabase URL and removes only its own', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'esta-connector-')), 'session.json');
    const slot0 = fileStore('http://127.0.0.1:54321', file);
    const slot1 = fileStore('http://127.0.0.1:54421', file);
    slot0.setItem('session', SECRET);
    slot1.setItem('session', 'other');
    slot0.removeItem('session');
    expect(slot0.getItem('session')).toBeNull();
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ 'http://127.0.0.1:54421#session': 'other' });
  });

  it('reads a file cut off mid-write as signed out, and writes a whole file over it', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'esta-connector-')), 'session.json');
    writeFileSync(file, JSON.stringify({ 'http://127.0.0.1:54321#session': SECRET }).slice(0, -12), { mode: 0o600 });
    const store = fileStore('http://127.0.0.1:54321', file);
    expect(store.getItem('session')).toBeNull();
    store.setItem('session', SECRET);
    expect(store.getItem('session')).toBe(SECRET);
    expect(readdirSync(join(file, '..'))).toEqual(['session.json']);
  });
});

describe('secretStore', () => {
  it('uses the file on macOS when ESTA_SESSION_FILE names one, and on every other platform', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'esta-connector-')), 'session.json');
    secretStore('http://127.0.0.1:54321', { platform: 'darwin', file }).setItem('session', SECRET);
    expect(fileStore('http://127.0.0.1:54321', file).getItem('session')).toBe(SECRET);
    const linux = join(mkdtempSync(join(tmpdir(), 'esta-connector-')), 'session.json');
    secretStore('http://127.0.0.1:54321', { platform: 'linux', file: linux }).setItem('session', SECRET);
    expect(fileStore('http://127.0.0.1:54321', linux).getItem('session')).toBe(SECRET);
  });
});
