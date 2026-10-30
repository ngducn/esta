import { describe, expect, it } from 'vitest';
import type { SourceFile } from './measure.ts';
import { METRICS } from './metrics.ts';

type Case = { readonly name: string; readonly metric: string; readonly path: string; readonly text: string; readonly count: number };

const COMPONENT = 'apps/web/src/components/notes/note-form.tsx';
const HOOK = 'apps/web/src/components/notes/use-save-note.ts';
const SERVER = 'apps/web/src/server/notes/actions.ts';
const CORE = 'packages/core/src/notes/note.ts';
const SPEC = 'e2e/notes.spec.ts';

const smell = (metric: string, name: string, path: string, count: number, ...text: string[]): Case => ({ metric, name, path, count, text: `${text.join('\n')}\n` });

const CASES: readonly Case[] = [
  smell('hand-rolled-action-call', 'an async call through a renamed transition starter', COMPONENT, 1,
    "import { useTransition } from 'react';",
    'export function NoteForm() {',
    '  const [saving, startSaving] = useTransition();',
    '  return <button disabled={saving} onClick={() => startSaving(async () => { await saveNote(); })} />;',
    '}',
  ),
  smell('hand-rolled-action-call', 'the same call in a .ts hook', HOOK, 1,
    "import { useTransition } from 'react';",
    'export function useSaveNote() {',
    '  const [pending, start] = useTransition();',
    '  return { pending, save: () => start(async () => { await saveNote(); }) };',
    '}',
  ),
  smell('hand-rolled-action-call', 'a named async function handed to the starter', COMPONENT, 1,
    "import * as React from 'react';",
    'export function NoteForm() {',
    '  const [, go] = React.useTransition();',
    '  const submit = async () => { await saveNote(); };',
    '  return <button onClick={() => go(submit)} />;',
    '}',
  ),
  smell('hand-rolled-action-call', 'a component in a product folder named helpers', 'apps/web/src/components/helpers/save.tsx', 1,
    "import { useTransition } from 'react';",
    'export function Save() {',
    '  const [, startTransition] = useTransition();',
    '  return <button onClick={() => startTransition(async () => { await saveNote(); })} />;',
    '}',
  ),
  smell('hand-rolled-action-call', 'a look-alike: a transition that only navigates', COMPONENT, 0,
    "import { useTransition } from 'react';",
    'export function Tabs() {',
    '  const [, startTransition] = useTransition();',
    "  return <button onClick={() => startTransition(() => router.push('/notes'))} />;",
    '}',
  ),
  smell('hand-rolled-action-call', 'a look-alike: a local helper named start that is not a transition', COMPONENT, 0,
    'const start = (run: () => Promise<void>) => run();', 'export const go = () => start(async () => { await saveNote(); });',
  ),
  smell('hand-rolled-action-call', 'a look-alike: the call in a test file', 'apps/web/src/components/notes/note-form.test.tsx', 0,
    "import { useTransition } from 'react';", 'const [, start] = useTransition();', 'start(async () => {});',
  ),
  smell('decimal-parser-outside-parse', 'a multi-line import of parseDecimal', CORE, 1, 'import {', '  parseDecimal,', '  toWholeDong,', "} from '../parse/decimal';"),
  smell('decimal-parser-outside-parse', 'parseDecimal under another name', CORE, 1, "import { parseDecimal as readNumber } from '../parse/decimal';"),
  smell('decimal-parser-outside-parse', 'a look-alike: the money parser', CORE, 0, "import { parseVndInput } from '../parse/vnd-input';"),
  smell('hand-rolled-iso-date-schema', 'a multi-line refine with a message', CORE, 1,
    "import { isIsoDate } from '../date/iso-date';", 'export const dueOn = z', '  .string()', '  .refine(', '    isIsoDate,', "    'expected YYYY-MM-DD',", '  );',
  ),
  smell('hand-rolled-iso-date-schema', 'a refine that wraps isIsoDate in an arrow', SERVER, 1,
    "import { isIsoDate } from '@esta/core/date';", 'export const dueOn = z.string().refine((value) => isIsoDate(value));',
  ),
  smell('hand-rolled-iso-date-schema', 'a look-alike: the branded schema and a plain guard', SERVER, 0,
    "import { isIsoDate } from '@esta/core/date';",
    "import { isoDateSchema } from '@esta/core/schemas/legal';",
    'export const dueOn = isoDateSchema.nullable();',
    'export const due = (text: string) => (isIsoDate(text) ? text : null);',
  ),
  smell('ad-hoc-result-type', 'a result union of named members', SERVER, 1,
    'type Saved = { ok: true; id: string };', "type Refused = { ok: false; reason: 'invalid' };", 'export type SaveNote = Saved | Refused;',
  ),
  smell('ad-hoc-result-type', 'a result spelled with interfaces', SERVER, 1,
    'interface Saved { ok: true; id: string }', 'interface Refused { readonly ok: false; reason: string }', 'export type SaveNote = Saved | Refused;',
  ),
  smell('ad-hoc-result-type', 'a failure arm inside an intersection', CORE, 1,
    "export type Ledger = { ok: true; value: number } | ({ ok: false } & { reason: 'short' });",
  ),
  smell('ad-hoc-result-type', "a look-alike: core's Result, a failure value and a narrowing", SERVER, 0,
    "import type { Result } from '@esta/core/result';",
    "export type SaveNote = Result<string, 'invalid'>;",
    "export type Refusal = Extract<SaveNote, { ok: false }>['reason'];",
    'export const failed = { ok: false } as const;',
  ),
  smell('upload-pipeline', 'a second upload path through uploadWithProgress, the signing action and a raw PUT', COMPONENT, 3,
    "import { uploadWithProgress as send } from '@/lib/upload/upload-with-progress';",
    "import { createDocumentUpload } from '@/server/documents/actions';",
    'export async function upload(file: File) {',
    '  const ticket = await createDocumentUpload({ name: file.name });',
    '  await send(ticket.file.url, file);',
    "  await fetch(ticket.thumb.url, { method: 'PUT', body: file });",
    '}',
  ),
  smell('upload-pipeline', 'a look-alike: the upload module itself and a plain fetch', 'apps/web/src/lib/upload/prepare.ts', 0,
    "import { uploadWithProgress } from './upload-with-progress';", 'export const send = (url: string, file: Blob) => uploadWithProgress(url, file);',
  ),
  smell('upload-pipeline', 'a look-alike: a GET and a POST', COMPONENT, 0,
    "export const load = () => fetch('/api/notes');", "export const post = (body: string) => fetch('/api/notes', { method: 'POST', body });",
  ),
  smell('hand-rolled-lazy-sheet', 'an always-open sheet whose close callback takes a busy flag', COMPONENT, 2,
    "import { Sheet as Panel } from '@/components/ui/sheet';",
    'export const NoteSheet = ({ busy, onClose }: { busy: boolean; onClose: () => void }) => (',
    '  <Panel open onOpenChange={(next) => (next || busy ? undefined : onClose())}>{null}</Panel>',
    ');',
    'export const Confirm = () => <AlertDialog open={true} onOpenChange={() => undefined} />;',
  ),
  smell('hand-rolled-lazy-sheet', 'a look-alike: a sheet driven by useDeferredDialog', COMPONENT, 0,
    'export const NoteSheet = ({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) => <Sheet open={open} onOpenChange={setOpen} />;',
  ),
  smell('action-failure-mapping', 'a typed catch, a multi-line catch and a block-bodied catch', COMPONENT, 3,
    'export const a = () => saveNote().catch((): SaveNote => ({ ok: false }));',
    'export const b = () =>',
    '  saveNote().catch(',
    "    () => ({ ok: false, reason: 'failed' }) as const,",
    '  );',
    'export const c = () => saveNote().catch(() => {',
    '  return { ok: false as const };',
    '});',
  ),
  smell('action-failure-mapping', 'a look-alike: a catch that returns null and a zod fallback', COMPONENT, 0,
    'export const a = () => openNote().catch(() => null);', 'export const schema = z.object({ ok: z.boolean() }).catch({ ok: false });',
  ),
  smell('e2e-viewport-in-spec', 'a typed PHONE and an inline desktop viewport', SPEC, 2,
    "import type { ViewportSize } from '@playwright/test';",
    'const PHONE: ViewportSize = { width: 390, height: 844 };',
    'test.use({ viewport: { width: 1440, height: 900 } });',
  ),
  smell('e2e-viewport-in-spec', 'a look-alike: the shared viewport and a screenshot clip', SPEC, 0,
    "import { PHONE } from './helpers/wizard';", 'test.use({ viewport: PHONE });', 'await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 40 } });',
  ),
  smell('e2e-sideways-scroll-in-spec', 'a page-width check through toBeLessThanOrEqual and through the html locator', SPEC, 2,
    'expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);',
    "const wide = await page.locator('html').evaluate((html) => html.scrollWidth > html.clientWidth);",
  ),
  smell('e2e-sideways-scroll-in-spec', 'a look-alike: the shared helper and a clipped-row check', SPEC, 0,
    "import { noSidewaysScroll } from './helpers/wizard';",
    'expect(await noSidewaysScroll(page)).toBe(true);',
    'expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);',
  ),
  smell('double-cast', 'a product route under a folder named test', 'apps/web/src/app/api/test/clock/route.ts', 1,
    'export const read = (value: string) => value as unknown as number;',
  ),
  smell('double-cast', 'a look-alike: a double cast in a comment and a string', SERVER, 0,
    '// never write `as unknown as` here; parse with zod instead.', "export const advice = 'avoid as unknown as';",
  ),
  smell('double-cast', 'a look-alike: a double cast in a __tests__ folder', 'apps/web/src/server/__tests__/notes.ts', 0,
    'export const read = (value: string) => value as unknown as number;',
  ),
  smell('sqlstate-literal', 'SQLSTATE codes compared with an error code, directly, through constants, a set, a switch and a map', SERVER, 6,
    "const UNIQUE = '23505';",
    "const REFUSED = new Set(['23503', '23514']);",
    "const REASONS = { '23P01': 'overlap' } as const;",
    'export function reason(error: { code: string }) {',
    '  if (error.code === "22023") return "invalid";',
    "  if (error.code === UNIQUE) return 'duplicate';",
    "  if (REFUSED.has(error.code)) return 'invalid';",
    "  switch (error.code) { case '40001': return 'retry'; }",
    "  return REASONS[error.code as keyof typeof REASONS] ?? 'failed';",
    '}',
  ),
  smell('sqlstate-literal', 'a look-alike: ward codes, postcodes and a comment', SERVER, 0,
    '// 23505 is the unique violation',
    "export const WARD_CODES = ['22801', '40123', '42007'] as const;",
    "export const postcode = (province: string) => (province === 'Nghe An' ? '40000' : '70000');",
    "export const isWard = (ward: { code: string }) => ward.code === '22801';",
  ),
  smell('inline-eslint-disable', 'an eslint-disable comment in JSX and in code', COMPONENT, 2,
    '// eslint-disable-next-line @next/next/no-img-element -- a local blob URL',
    'export const A = () => <div>{/* eslint-disable-next-line @next/next/no-img-element -- a blob URL */}<img src="a" /></div>;',
  ),
  smell('inline-eslint-disable', 'a look-alike: the words in a string and in JSX text', COMPONENT, 0,
    "export const rule = 'eslint-disable';", 'export const B = () => <p>// eslint-disable is not allowed</p>;',
  ),
  smell('sheet-footer-markup', 'the footer row with its classes reordered', COMPONENT, 1,
    'export const Footer = () => <div className="flex gap-3 flex-col-reverse sm:justify-end sm:flex-row" />;',
  ),
  smell('sheet-footer-markup', 'a look-alike: the footer row named in a comment', COMPONENT, 0,
    '// not flex flex-col-reverse gap-3 sm:flex-row sm:justify-end', 'export const Footer = () => <div className="flex gap-3" />;',
  ),
  smell('toast-provider-mount', 'an aliased toast provider mount', 'apps/web/src/app/(app)/notes/page.tsx', 1,
    "import { UndoToastProvider as Toasts } from '@/components/undo-toast';", 'export default function Page() {', '  return <Toasts>{null}</Toasts>;', '}',
  ),
  smell('local-id-schema', 'an old-style uuid schema and a chained one', SERVER, 3,
    "import { z } from 'zod';", 'const id = z.string().uuid();', 'export const scope = z.uuid().nullable();', 'export const valid = (value: unknown) => z.uuid().safeParse(value).success;',
  ),
  smell('local-id-schema', 'a look-alike: an id field inside a row schema', SERVER, 0,
    "import { z } from 'zod';", 'export const row = z.object({ id: z.uuid(), unit_id: z.uuid().nullable() });',
  ),
];

const measure = (metric: string, files: readonly SourceFile[]) => {
  const found = METRICS.find(({ id }) => id === metric);
  if (found === undefined) throw new Error(`no metric ${metric}`);
  return found.measure({ corpus: { files }, clones: [], fixtureClones: [] }).reduce((sum, occurrence) => sum + occurrence.weight, 0);
};

describe('each smell', () => {
  it.each(CASES)('$metric counts $count for $name', ({ metric, path, text, count }) => {
    expect(measure(metric, [{ path, text }])).toBe(count);
  });
});

describe('duplicate-core-export', () => {
  const daysInMonth = (path: string) => ({ path, text: 'export const daysInMonth = (month: number) => month;\n' });

  it('counts every extra declaration, so a third copy adds one', () => {
    const two = [daysInMonth('packages/core/src/date/a.ts'), daysInMonth('packages/core/src/schedule/b.ts')];
    expect(measure('duplicate-core-export', two)).toBe(1);
    expect(measure('duplicate-core-export', [...two, daysInMonth('packages/core/src/lease/c.ts')])).toBe(2);
  });

  it('does not count a re-export or a value and type sharing one name in one module', () => {
    const files = [
      { path: 'packages/core/src/tax/payer.ts', text: "export const TaxPayer = z.enum(['owner']);\nexport type TaxPayer = z.infer<typeof TaxPayer>;\n" },
      { path: 'packages/core/src/index.ts', text: "export { TaxPayer } from './tax/payer';\n" },
    ];
    expect(measure('duplicate-core-export', files)).toBe(0);
  });
});
