import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASELINE, run } from './main.ts';
import { METRICS } from './metrics.ts';
import { baselineSchema } from './ratchet.ts';

const repoRoot = join(import.meta.dirname, '..', '..');

const BLOCK = (name: string) => `export function ${name}(rows: { id: string; amount: number; paid: number }[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const owed = row.amount - row.paid;
    if (owed <= 0) continue;
    totals.set(row.id, (totals.get(row.id) ?? 0) + owed);
  }
  return [...totals.entries()].filter(([, owed]) => owed > 0).map(([id, owed]) => ({ id, owed }));
}
`;

let root: string;

function write(path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

const baselineText = () => readFileSync(join(root, BASELINE), 'utf8');
const baseline = () => baselineSchema.parse(JSON.parse(baselineText()));
const check = () => run(root, { update: false });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'esta-quality-gate-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  write('packages/core/src/owed.ts', BLOCK('owed'));
  write('apps/web/src/server/load.ts', "import { z } from 'zod';\n\nexport const rowSchema = z.object({ id: z.uuid() });\n");
  mkdirSync(join(root, 'quality'));
  expect(run(root, { update: true }).ok).toBe(true);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('pnpm quality', () => {
  it('passes a tree against the baseline it just wrote', () => {
    expect(check()).toMatchObject({ ok: true, lines: [] });
  });

  it('fails a new local id schema, naming the file, the helper to use and the ARCHITECTURE.md section', () => {
    write('apps/web/src/server/actions/archive.ts', "import { z } from 'zod';\n\nconst id = z.uuid();\nexport const parse = (value: unknown) => id.safeParse(value);\n");
    const outcome = check();
    expect(outcome.ok).toBe(false);
    const text = outcome.lines.join('\n');
    expect(text).toContain('FAIL local-id-schema rose from 0 to 1.');
    expect(text).toContain('apps/web/src/server/actions/archive.ts:3  const id = z.uuid();');
    expect(text).toContain('Use instead: `idSchema`');
    expect(text).toContain('See ARCHITECTURE.md#server-action-kit');
  });

  it('leaves a row schema field alone', () => {
    write('apps/web/src/server/rows.ts', "import { z } from 'zod';\n\nexport const leaseRow = z.object({ id: z.uuid(), unit_id: z.uuid().nullable() });\n");
    expect(check().ok).toBe(true);
  });

  it('fails a second upload path', () => {
    write('apps/web/src/components/documents/quick-upload.tsx', "'use client';\nimport { sendPrepared } from '@/lib/upload/prepare';\n\nexport const send = (ticket: never, file: File) => sendPrepared(ticket, file, () => undefined);\n");
    const text = check().lines.join('\n');
    expect(text).toContain('FAIL upload-pipeline rose from 0 to 1.');
    expect(text).toContain('apps/web/src/components/documents/quick-upload.tsx:4');
  });

  it('fails a copied block on both clone metrics and points at both copies', () => {
    write('apps/web/src/server/owed.ts', BLOCK('owedAgain'));
    const text = check().lines.join('\n');
    expect(text).toMatch(/FAIL clones rose from 0 to 1\./);
    expect(text).toMatch(/FAIL duplicated-lines rose from 0 to \d+\./);
    expect(text).toMatch(/(apps\/web\/src\/server\/owed\.ts|packages\/core\/src\/owed\.ts):\d+ {2}lines \d+-\d+ repeat (packages\/core\/src\/owed\.ts|apps\/web\/src\/server\/owed\.ts)/);
  });

  it('keeps a copied block one clone when a line is added inside it', () => {
    write('packages/core/src/owed.ts', `${BLOCK('owed')}${BLOCK('due')}`);
    write('apps/web/src/server/owed.ts', `${BLOCK('owed')}${BLOCK('due')}`);
    expect(run(root, { update: true, allowRaise: 'test setup' }).ok).toBe(true);
    write('apps/web/src/server/owed.ts', `${BLOCK('owed')}export const SEPARATOR = '-';\n${BLOCK('due')}`);
    expect(check().lines.filter((line) => line.startsWith('FAIL clones'))).toEqual([]);
  });

  it('refuses to raise the baseline on --update and writes nothing', () => {
    const before = baselineText();
    write('apps/web/src/app/notes/page.tsx', 'export default function Page() {\n  return <UndoToastProvider>{null}</UndoToastProvider>;\n}\n');
    const outcome = run(root, { update: true });
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join('\n')).toContain('FAIL toast-provider-mount rose from 0 to 1.');
    expect(baselineText()).toBe(before);
  });

  it('raises the baseline only with --allow-raise, and records the reason for review', () => {
    write('apps/web/src/app/notes/page.tsx', 'export default function Page() {\n  return <UndoToastProvider>{null}</UndoToastProvider>;\n}\n');
    expect(run(root, { update: true, allowRaise: 'the notes page needs its own toast until #191' }).ok).toBe(true);
    expect(baseline().metrics['toast-provider-mount']).toEqual({ value: 1, files: { 'apps/web/src/app/notes/page.tsx': 1 } });
    expect(baseline().raises).toEqual([{ metric: 'toast-provider-mount', from: 0, to: 1, reason: 'the notes page needs its own toast until #191' }]);
    expect(check().ok).toBe(true);
  });

  it('fails a stale baseline after a fix until --update lowers it', () => {
    write('apps/web/src/server/doubled.ts', 'export const value = (input: string) => input as unknown as number;\n');
    expect(run(root, { update: true, allowRaise: 'test setup' }).ok).toBe(true);
    rmSync(join(root, 'apps/web/src/server/doubled.ts'));
    expect(check().lines).toContain('FAIL double-cast fell from 1 to 0. Lock in the gain: pnpm quality --update');
    expect(run(root, { update: true }).ok).toBe(true);
    expect(baseline().metrics['double-cast']).toEqual({ value: 0, files: {} });
    expect(check().ok).toBe(true);
  });

  it('never lets a file past 1,000 lines, even with --allow-raise', () => {
    const before = baselineText();
    write('apps/web/src/server/huge.ts', Array.from({ length: 1001 }, (_, index) => `export const line${index} = ${index};`).join('\n'));
    const outcome = run(root, { update: true, allowRaise: 'it is only constants' });
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join('\n')).toContain('FAIL files-over-1000-lines is 1; the cap is 0.');
    expect(baselineText()).toBe(before);
  });
});

const anchor = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]/gu, '')
    .replace(/ /g, '-');

describe('the registry', () => {
  it('names each metric once and links a section that ARCHITECTURE.md has', () => {
    const architecture = readFileSync(join(repoRoot, 'ARCHITECTURE.md'), 'utf8');
    const anchors = new Set([...architecture.matchAll(/^#{2,3} (.+)$/gm)].map(([, heading]) => anchor(heading ?? '')));
    expect(new Set(METRICS.map(({ id }) => id)).size).toBe(METRICS.length);
    expect(METRICS.filter(({ section }) => !anchors.has(section)).map(({ id, section }) => `${id} -> #${section}`)).toEqual([]);
  });

  it('holds the repository to its committed baseline', () => {
    expect(run(repoRoot, { update: false }).lines).toEqual([]);
  });
});
