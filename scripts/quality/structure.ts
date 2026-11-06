import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { calls, declarations, nodes, unwrap, type Finder } from './syntax.ts';

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

/** The receiver chain of a call, ending at the first `.from(…)` call: the shape of a Supabase query builder. An identifier resolves to the initializer of a `const` of that name in the file. */
function startsAtFrom(expression: ts.Expression, constants: ReadonlyMap<string, ts.Expression>, depth = 0): boolean {
  let current = unwrap(expression);
  for (;;) {
    if (ts.isCallExpression(current)) {
      if (ts.isPropertyAccessExpression(current.expression) && current.expression.name.text === 'from') return true;
      current = unwrap(current.expression);
    } else if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      current = unwrap(current.expression);
    } else if (ts.isIdentifier(current)) {
      const initializer = constants.get(current.text);
      return initializer !== undefined && depth < 5 && startsAtFrom(initializer, constants, depth + 1);
    } else {
      return false;
    }
  }
}

const constInitializers = (source: ts.SourceFile) => {
  const map = new Map<string, ts.Expression>();
  for (const declaration of declarations(source)) {
    const isConst = ts.isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & ts.NodeFlags.Const) !== 0;
    if (isConst && ts.isIdentifier(declaration.name) && declaration.initializer !== undefined) map.set(declaration.name.text, declaration.initializer);
  }
  return map;
};

/** `.insert(`, `.update(`, `.upsert(` or `.delete(` on a `.from(…)` query (also one held in a `const`), or any `.rpc(` call, reported at the method name. */
export const directWrites: Finder = (source) => {
  const constants = constInitializers(source);
  return calls(source).flatMap((call) => {
    const callee = call.expression;
    if (!ts.isPropertyAccessExpression(callee)) return [];
    const method = callee.name.text;
    return method === 'rpc' || (WRITE_METHODS.has(method) && startsAtFrom(callee.expression, constants)) ? [callee.name] : [];
  });
};

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

/** A comparison with a member role as a string literal (whatever the other side is called), a `case` of a role literal, or `.includes(…)` on an array literal that holds one. */
export const literalRoleChecks = (roles: readonly string[]): Finder => {
  const isRole = (expression: ts.Expression) => {
    const value = unwrap(expression);
    return ts.isStringLiteralLike(value) && roles.includes(value.text);
  };
  return (source) => [
    ...nodes(source, ts.SyntaxKind.BinaryExpression)
      .filter(ts.isBinaryExpression)
      .filter(({ operatorToken, left, right }) => COMPARISONS.has(operatorToken.kind) && (isRole(left) || isRole(right))),
    ...nodes(source, ts.SyntaxKind.CaseClause).filter(ts.isCaseClause).filter(({ expression }) => isRole(expression)),
    ...calls(source).filter(({ expression, arguments: args }) => {
      if (!ts.isPropertyAccessExpression(expression) || expression.name.text !== 'includes' || args.length === 0) return false;
      const receiver = unwrap(expression.expression);
      return ts.isArrayLiteralExpression(receiver) && receiver.elements.some(isRole);
    }),
  ];
};

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A file whose name, before its extensions, is not kebab-case. Next.js special files (`page`, `layout`, `route`, …) are single lower-case words, so they pass. */
export const notKebabCase = (fileName: string) => {
  const stem = fileName.slice(fileName.lastIndexOf('/') + 1).replace(/\.(d\.)?[cm]?[jt]sx?$/, '');
  return !stem.split('.').every((part) => KEBAB.test(part));
};
