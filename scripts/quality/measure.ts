import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import ts from 'typescript';
import { z } from 'zod';
import { exportedNames } from './syntax.ts';

export type SourceFile = { readonly path: string; readonly text: string };
export type Corpus = { readonly files: readonly SourceFile[] };
/** One place a metric counts. `weight` is what it adds to the metric (1, or a clone's line count). */
export type Occurrence = { readonly file: string; readonly line: number; readonly text: string; readonly weight: number };
export type Scope = { readonly include: RegExp; readonly exclude?: RegExp };

const SOURCE_ROOTS = ['apps', 'packages', 'e2e', 'scripts', 'eslint-rules', 'supabase/seed'];
const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/;
const SKIPPED_FOLDERS = ['node_modules', '.next', '.slots', 'fixtures'];
const GENERATED_FILES = ['database.types.ts', 'cn-tables.ts'];
const isSource = (path: string) =>
  SOURCE_FILE.test(path) && !path.split('/').some((part) => SKIPPED_FOLDERS.includes(part)) && !GENERATED_FILES.includes(basename(path));
const NOT_SOURCE_GLOBS = [...SKIPPED_FOLDERS.map((folder) => `**/${folder}/**`), ...GENERATED_FILES.map((file) => `**/${file}`)].join(',');

/** Only real test locations: a `*.test.*`, `*.spec.*` or `*.bench.*` file, a `__tests__` folder, or the e2e tree. A product folder named `test` or `helpers` is product code. */
export const TEST_FILE = /\.(test|spec|bench)\.[cm]?[jt]sx?$|(^|\/)__tests__\/|^e2e\//;
export const DEV_ROUTES = /^apps\/web\/src\/app\/dev\//;

const inScope = (scope: Scope, path: string) => scope.include.test(path) && !(scope.exclude?.test(path) ?? false);

/** Tracked and untracked-but-not-ignored source files, so a new file counts before its first commit. */
export function readCorpus(root: string): Corpus {
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...SOURCE_ROOTS], {
    cwd: root,
    encoding: 'utf8',
  });
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`);
  const paths = [...new Set(listed.stdout.split('\0'))].filter(isSource);
  const files = paths
    .filter((path) => existsSync(join(root, path)))
    .toSorted()
    .map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }));
  return { files };
}

const lineCount = (text: string) => (text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length);

export function filesOver(corpus: Corpus, scope: Scope, limit: number): Occurrence[] {
  return corpus.files
    .filter((file) => inScope(scope, file.path))
    .map((file) => ({ file: file.path, lines: lineCount(file.text) }))
    .filter(({ lines }) => lines > limit)
    .map(({ file, lines }) => ({ file, line: lines, text: `${lines} lines`, weight: 1 }));
}

const parsed = new WeakMap<SourceFile, ts.SourceFile>();

/** Parses each file once; every syntax metric shares the tree. */
function parse(file: SourceFile): ts.SourceFile {
  const cached = parsed.get(file);
  if (cached !== undefined) return cached;
  const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, file.path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  parsed.set(file, source);
  return source;
}

function at(source: ts.SourceFile, position: number): Occurrence {
  const { line } = source.getLineAndCharacterOfPosition(position);
  const starts = source.getLineStarts();
  return { file: source.fileName, line: line + 1, text: source.text.slice(starts[line], starts[line + 1]).trim(), weight: 1 };
}

export function matchPositions(corpus: Corpus, scope: Scope, find: (source: ts.SourceFile) => readonly number[]): Occurrence[] {
  return corpus.files
    .filter((file) => inScope(scope, file.path))
    .flatMap((file) => {
      const source = parse(file);
      return find(source)
        .toSorted((a, b) => a - b)
        .map((position) => at(source, position));
    });
}

/** One occurrence for each module past the first that declares and exports a name; the first in path order is its home. */
export function duplicateExports(corpus: Corpus, scope: Scope): Occurrence[] {
  const homes = new Map<string, { source: ts.SourceFile; node: ts.Node }[]>();
  for (const file of corpus.files.filter((candidate) => inScope(scope, candidate.path))) {
    const source = parse(file);
    const declared = new Map(exportedNames(source).map(({ name, node }) => [name, node]));
    for (const [name, node] of declared) homes.set(name, [...(homes.get(name) ?? []), { source, node }]);
  }
  return [...homes.entries()].flatMap(([name, [home, ...copies]]) =>
    home === undefined ? [] : copies.map(({ source, node }) => ({ ...at(source, node.getStart(source)), text: `${name} is also exported from ${home.source.fileName}` })),
  );
}

const cloneSideSchema = z.object({ name: z.string(), start: z.number(), end: z.number() });
const cloneReportSchema = z.object({
  duplicates: z.array(z.object({ firstFile: cloneSideSchema, secondFile: cloneSideSchema, lines: z.number(), tokens: z.number() })),
});
export type Clone = { readonly first: { file: string; start: number; end: number }; readonly second: { file: string; start: number; end: number }; readonly lines: number };

/** The token minimum is jscpd's default, which registers the review's duplicates (the two upload flows, the legal and rental item actions, the e2e helpers). */
const CLONE_MIN_TOKENS = 50;
/** An edit of up to five lines inside a copied block keeps it one clone, so the edit does not count as a new copy. */
const CLONE_MAX_GAP_LINES = 5;

const JSCPD = join(import.meta.dirname, '..', '..', 'node_modules', '.bin', 'jscpd');

export function findClones(root: string): Clone[] {
  const roots = SOURCE_ROOTS.filter((path) => existsSync(join(root, path)));
  if (roots.length === 0) return [];
  const out = mkdtempSync(join(tmpdir(), 'esta-quality-'));
  try {
    const run = spawnSync(
      JSCPD,
      [
        '--min-tokens', String(CLONE_MIN_TOKENS),
        '--mode', 'weak',
        '--max-gap-lines', String(CLONE_MAX_GAP_LINES),
        '--absolute',
        '--format', 'typescript,tsx,javascript,jsx',
        '--ignore', NOT_SOURCE_GLOBS,
        '--reporters', 'json',
        '--output', out,
        '--silent',
        '--no-tips',
        ...roots,
      ],
      { cwd: root, encoding: 'utf8' },
    );
    if (run.status !== 0) throw new Error(`jscpd failed (${run.status}): ${run.stderr || run.stdout}`);
    const report = cloneReportSchema.parse(JSON.parse(readFileSync(join(out, 'jscpd-report.json'), 'utf8')));
    const base = realpathSync(root);
    const side = ({ name, start, end }: z.infer<typeof cloneSideSchema>) => ({ file: relative(base, name), start, end });
    return report.duplicates.map((clone) => ({ first: side(clone.firstFile), second: side(clone.secondFile), lines: clone.lines }));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

export const cloneOccurrences = (clones: readonly Clone[], weigh: (clone: Clone) => number): Occurrence[] =>
  clones.map((clone) => ({
    file: clone.first.file,
    line: clone.first.start,
    text: `lines ${clone.first.start}-${clone.first.end} repeat ${clone.second.file}:${clone.second.start}-${clone.second.end}`,
    weight: weigh(clone),
  }));
