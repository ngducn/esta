import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { calls, nodes, unwrap, type Finder } from './syntax.ts';

export const MAX_FUNCTION_LINES = 150;

const FUNCTION_KINDS = [
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.Constructor,
];

/** A function, arrow function or method whose text spans more lines than the limit. */
export const longFunctions: Finder = (source) =>
  FUNCTION_KINDS.flatMap((kind) => nodes(source, kind)).filter((node) => {
    const first = source.getLineAndCharacterOfPosition(node.getStart(source)).line;
    const last = source.getLineAndCharacterOfPosition(node.getEnd()).line;
    return last - first + 1 > MAX_FUNCTION_LINES;
  });

const WRITE_METHODS = new Set(['insert', 'update', 'upsert', 'delete']);

/** The receiver chain of a call, ending at the first `.from(…)` call: the shape of a Supabase query builder. */
function startsAtFrom(expression: ts.Expression): boolean {
  let current = unwrap(expression);
  for (;;) {
    if (ts.isCallExpression(current)) {
      if (ts.isPropertyAccessExpression(current.expression) && current.expression.name.text === 'from') return true;
      current = unwrap(current.expression);
    } else if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      current = unwrap(current.expression);
    } else {
      return false;
    }
  }
}

/** `.insert(`, `.update(`, `.upsert(` or `.delete(` on a `.from(…)` query, or any `.rpc(` call, reported at the method name. */
export const directWrites: Finder = (source) =>
  calls(source).flatMap((call) => {
    const callee = call.expression;
    if (!ts.isPropertyAccessExpression(callee)) return [];
    const method = callee.name.text;
    return method === 'rpc' || (WRITE_METHODS.has(method) && startsAtFrom(callee.expression)) ? [callee.name] : [];
  });

/** The values of the `member_role` enum, read from the generated database types. */
export function memberRoles(root: string): readonly string[] {
  const types = readFileSync(join(root, 'packages/db/src/database.types.ts'), 'utf8');
  const union = /^\s*member_role:\s*([^\n]+)$/m.exec(types)?.[1];
  const roles = [...(union ?? '').matchAll(/"([a-z_]+)"/g)].map((match) => match[1] ?? '');
  if (roles.length === 0) throw new Error('member_role not found in packages/db/src/database.types.ts');
  return roles;
}

const COMPARISONS = new Set([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

const endsInRole = (expression: ts.Expression) => {
  const value = unwrap(expression);
  const name = ts.isIdentifier(value) ? value.text : ts.isPropertyAccessExpression(value) ? value.name.text : undefined;
  return name !== undefined && /role$/i.test(name);
};

/** A comparison of a `…role` value with one of the member roles as a string literal. */
export const literalRoleChecks = (roles: readonly string[]): Finder => {
  const isRole = (expression: ts.Expression) => {
    const value = unwrap(expression);
    return ts.isStringLiteralLike(value) && roles.includes(value.text);
  };
  return (source) =>
    nodes(source, ts.SyntaxKind.BinaryExpression)
      .filter(ts.isBinaryExpression)
      .filter(
        ({ operatorToken, left, right }) =>
          COMPARISONS.has(operatorToken.kind) && ((isRole(left) && endsInRole(right)) || (isRole(right) && endsInRole(left))),
      );
};

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A file whose name, before its extensions, is not kebab-case. Next.js special files (`page`, `layout`, `route`, …) are single lower-case words, so they pass. */
export const notKebabCase = (fileName: string) => {
  const stem = fileName.slice(fileName.lastIndexOf('/') + 1).replace(/\.(d\.)?[cm]?[jt]sx?$/, '');
  return !stem.split('.').every((part) => KEBAB.test(part));
};
