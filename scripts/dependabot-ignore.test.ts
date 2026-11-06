import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const read = (file: string): string => readFileSync(join(root, file), 'utf8');

const pinned = (version: string): number => {
  const major = /^v?(\d+)\./.exec(version.trim())?.[1];
  if (major === undefined) throw new Error(`no Node major in "${version}"`);
  return Number(major);
};

function typesNodeIgnore(dependabot: string): string[] {
  const entry = /- dependency-name: ['"]?@types\/node['"]?\s*\n(?:\s+(?!-).*\n?)*/.exec(dependabot)?.[0] ?? '';
  const list = /versions:\s*\[(.*)\]/.exec(entry)?.[1] ?? '';
  return [...list.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1] ?? '');
}

describe('Dependabot and the pinned Node major', () => {
  const nvmrc = pinned(read('.nvmrc'));
  const devEngines = pinned(String((JSON.parse(read('package.json')) as { devEngines: { runtime: { version: string } } }).devEngines.runtime.version));

  it('pins the same Node major in .nvmrc and devEngines', () => {
    expect(devEngines).toBe(nvmrc);
  });

  it('ignores @types/node majors above the pinned Node major', () => {
    expect(typesNodeIgnore(read('.github/dependabot.yml'))).toEqual([`>=${nvmrc + 1}`]);
  });
});
