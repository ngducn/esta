import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import ts from 'typescript';
import { z } from 'zod';

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

export const TEST_FILE = /\.(test|spec|bench)\.[cm]?[jt]sx?$|(^|\/)(test|helpers)\//;
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

export function matchLines(corpus: Corpus, scope: Scope, pattern: RegExp): Occurrence[] {
  return corpus.files
    .filter((file) => inScope(scope, file.path))
    .flatMap((file) =>
      file.text.split('\n').flatMap((text, index) =>
        [...text.matchAll(pattern)].map(() => ({ file: file.path, line: index + 1, text: text.trim(), weight: 1 })),
      ),
    );
}

export function filesOver(corpus: Corpus, scope: Scope, limit: number): Occurrence[] {
  return corpus.files
    .filter((file) => inScope(scope, file.path))
    .map((file) => ({ file: file.path, lines: lineCount(file.text) }))
    .filter(({ lines }) => lines > limit)
    .map(({ file, lines }) => ({ file, line: lines, text: `${lines} lines`, weight: 1 }));
}

function parse(file: SourceFile): ts.SourceFile {
  return ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, file.path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function at(source: ts.SourceFile, node: ts.Node, weight = 1): Occurrence {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return { file: source.fileName, line: line + 1, text: (source.text.split('\n')[line] ?? '').trim(), weight };
}

function walk(node: ts.Node, visit: (node: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

const isOkFalse = (member: ts.TypeNode) =>
  ts.isTypeLiteralNode(member) &&
  member.members.some(
    (property) =>
      ts.isPropertySignature(property) &&
      property.name.getText() === 'ok' &&
      property.type !== undefined &&
      ts.isLiteralTypeNode(property.type) &&
      property.type.literal.kind === ts.SyntaxKind.FalseKeyword,
  );

export function okFalseUnions(corpus: Corpus, scope: Scope): Occurrence[] {
  return corpus.files
    .filter((file) => inScope(scope, file.path))
    .flatMap((file) => {
      const source = parse(file);
      const found: Occurrence[] = [];
      walk(source, (node) => {
        if (ts.isUnionTypeNode(node) && node.types.some(isOkFalse)) found.push(at(source, node));
      });
      return found;
    });
}

const isExported = (node: ts.Node) =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);

type Exported = { name: string; node: ts.Node };

function importedNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    const clause = ts.isImportDeclaration(statement) ? statement.importClause : undefined;
    if (clause?.name !== undefined) names.add(clause.name.text);
    const bindings = clause?.namedBindings;
    if (bindings !== undefined && ts.isNamedImports(bindings)) for (const element of bindings.elements) names.add(element.name.text);
    if (bindings !== undefined && ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
  }
  return names;
}

function exportedNames(source: ts.SourceFile): Exported[] {
  const imported = importedNames(source);
  return source.statements.flatMap((statement): Exported[] => {
    if (ts.isExportDeclaration(statement)) {
      if (statement.moduleSpecifier !== undefined || statement.exportClause === undefined || !ts.isNamedExports(statement.exportClause)) return [];
      return statement.exportClause.elements
        .filter((element) => !imported.has((element.propertyName ?? element.name).getText(source)))
        .map((element) => ({ name: element.name.text, node: element }));
    }
    if (!isExported(statement)) return [];
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.flatMap((declaration) =>
        ts.isIdentifier(declaration.name) ? [{ name: declaration.name.text, node: declaration }] : [],
      );
    }
    const declared =
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
        ? statement.name
        : undefined;
    return declared === undefined ? [] : [{ name: declared.text, node: statement }];
  });
}

/** Re-exports, including `export { name }` of an imported name, are not second declarations. */
export function duplicateExports(corpus: Corpus, scope: Scope): Occurrence[] {
  const homes = new Map<string, { source: ts.SourceFile; node: ts.Node }[]>();
  for (const file of corpus.files.filter((candidate) => inScope(scope, candidate.path))) {
    const source = parse(file);
    for (const { name, node } of exportedNames(source)) homes.set(name, [...(homes.get(name) ?? []), { source, node }]);
  }
  return [...homes.entries()]
    .filter(([, places]) => new Set(places.map(({ source }) => source.fileName)).size > 1)
    .map(([name, [first, ...others]]) => {
      if (first === undefined) throw new Error(`no home for ${name}`);
      const elsewhere = [...new Set(others.map(({ source }) => source.fileName))].join(', ');
      return { ...at(first.source, first.node), text: `${name} is also exported from ${elsewhere}` };
    });
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
