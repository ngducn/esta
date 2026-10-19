import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileStore, keychainStore, secretStore, type Run } from './store';

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
