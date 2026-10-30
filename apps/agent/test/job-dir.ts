import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach } from 'vitest';

/** A job directory for one test file's replayed sessions, removed once its tests finish. */
export function tempJobDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Makes temporary directories for a test file's tests, each removed once the test that made it finishes. */
export function tempDirs(): (prefix: string) => string {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  return (prefix) => {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  };
}
