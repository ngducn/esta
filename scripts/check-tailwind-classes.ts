import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const webSrc = join(root, 'apps/web/src');
const stylesheet = join(webSrc, 'app/globals.css');
const CLASS_CALLS = new Set(['cn', 'clsx']);
const MARKERS = /^(?:group|peer)(?:\/[\w-]+)?$/u;

type Use = { readonly file: string; readonly line: number; readonly name: string };

function* sourceFiles(dir: string, pattern = /\.(tsx|ts)$/u): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path !== join(webSrc, 'app/dev')) yield* sourceFiles(path, pattern);
    }
    else if (pattern.test(entry.name) && !/\.(test|spec|stories)\.tsx?$/u.test(entry.name)) yield path;
  }
}

/** Every string a class expression can produce: literals, template heads, both arms of a conditional, object keys. */
function strings(node: ts.Node, out: ts.Node[]): void {
  if (ts.isStringLiteralLike(node)) out.push(node);
  else if (ts.isTemplateExpression(node)) {
    out.push(node.head, ...node.templateSpans.map((span) => span.literal));
    node.templateSpans.forEach((span) => strings(span.expression, out));
  } else if (ts.isConditionalExpression(node)) [node.whenTrue, node.whenFalse].forEach((arm) => strings(arm, out));
  else if (ts.isBinaryExpression(node)) {
    const kind = node.operatorToken.kind;
    if (kind === ts.SyntaxKind.AmpersandAmpersandToken) strings(node.right, out);
    else if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken) [node.left, node.right].forEach((side) => strings(side, out));
  }
  else if (ts.isArrayLiteralExpression(node)) node.elements.forEach((element) => strings(element, out));
  else if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        if (ts.isStringLiteralLike(property.name)) out.push(property.name);
        strings(property.initializer, out);
      }
    }
  } else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) strings(node.expression, out);
  else if (ts.isJsxExpression(node) && node.expression !== undefined) strings(node.expression, out);
}

export function classUses(file: string, text: string): Use[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === 'className' && node.initializer !== undefined) strings(node.initializer, found);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CLASS_CALLS.has(node.expression.text)) node.arguments.forEach((argument) => strings(argument, found));
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found.flatMap((node) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const raw = ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) ? node.text : ts.isStringLiteralLike(node) ? node.text : '';
    const cutEnd = ts.isTemplateHead(node) || ts.isTemplateMiddle(node) ? raw.replace(/\S+$/u, '') : raw;
    const whole = ts.isTemplateMiddle(node) || ts.isTemplateTail(node) ? cutEnd.replace(/^\S+/u, '') : cutEnd;
    return whole
      .split(/\s+/u)
      .filter((name) => name !== '' && /^[!a-z0-9[@-]/u.test(name) && !/[${}]/u.test(name) && !MARKERS.test(name))
      .map((name) => ({ file, line, name }));
  });
}

/** Class names that CSS in the app defines by hand, which Tailwind's design system does not list. */
function handWrittenClasses(css: string): Set<string> {
  return new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/gu)].map((match) => match[1] ?? ''));
}

export async function unknownClasses(): Promise<Use[]> {
  const require = createRequire(join(root, 'apps/web/package.json'));
  const tailwind = require('tailwindcss') as typeof import('tailwindcss');
  const tailwindDir = dirname(require.resolve('tailwindcss/package.json'));
  const loadStylesheet = async (id: string, base: string) => {
    const path = id === 'tailwindcss' ? join(tailwindDir, 'index.css') : id.startsWith('tailwindcss/') ? join(tailwindDir, `${id.slice('tailwindcss/'.length)}.css`) : resolve(base, id);
    return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
  };
  const css = readFileSync(stylesheet, 'utf8');
  const design = await tailwind.__unstable__loadDesignSystem(css, { base: dirname(stylesheet), loadStylesheet });
  const byHand = handWrittenClasses([...sourceFiles(webSrc, /\.css$/u)].map((file) => readFileSync(file, 'utf8')).join('\n'));
  const uses = [...sourceFiles(webSrc)].flatMap((file) => classUses(relative(root, file), readFileSync(file, 'utf8')));
  const names = [...new Set(uses.map((use) => use.name))];
  const produced = design.candidatesToCss(names);
  const unknown = new Set(names.filter((name, i) => produced[i] === null && !byHand.has(name)));
  return uses.filter((use) => unknown.has(use.name));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const missing = await unknownClasses();
  if (missing.length > 0) {
    console.error(`${missing.length} Tailwind classes produce no CSS (neither tokens.css nor Tailwind's defaults define them):`);
    for (const use of missing) console.error(`  ${use.file}:${use.line}  ${use.name}`);
    process.exit(1);
  }
  console.log('every Tailwind class in apps/web/src produces CSS');
}
