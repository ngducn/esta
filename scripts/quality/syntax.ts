import ts from 'typescript';

export type Finder = (source: ts.SourceFile) => readonly ts.Node[];

const indexes = new WeakMap<ts.SourceFile, Map<ts.SyntaxKind, ts.Node[]>>();

/** One walk per file, shared by every finder. */
export function nodes(source: ts.SourceFile, kind: ts.SyntaxKind): readonly ts.Node[] {
  const cached = indexes.get(source);
  if (cached !== undefined) return cached.get(kind) ?? [];
  const index = new Map<ts.SyntaxKind, ts.Node[]>();
  const visit = (node: ts.Node) => {
    const list = index.get(node.kind);
    if (list === undefined) index.set(node.kind, [node]);
    else list.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  indexes.set(source, index);
  return index.get(kind) ?? [];
}

export const calls = (source: ts.SourceFile) => nodes(source, ts.SyntaxKind.CallExpression).filter(ts.isCallExpression);
export const declarations = (source: ts.SourceFile) => nodes(source, ts.SyntaxKind.VariableDeclaration).filter(ts.isVariableDeclaration);

export function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

export const isAsync = (node: ts.Node) =>
  (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) &&
  (node.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword);

export const nameOf = (name: ts.PropertyName | ts.BindingName) => (ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined);

const importIndexes = new WeakMap<ts.SourceFile, Map<string, string>>();

/** Local name to the name it was imported as (`*` for a namespace, `default` for a default import). */
export function importIndex(source: ts.SourceFile): Map<string, string> {
  const cached = importIndexes.get(source);
  if (cached !== undefined) return cached;
  const index = new Map<string, string>();
  for (const statement of source.statements) {
    const clause = ts.isImportDeclaration(statement) ? statement.importClause : undefined;
    if (clause?.name !== undefined) index.set(clause.name.text, 'default');
    const bindings = clause?.namedBindings;
    if (bindings !== undefined && ts.isNamespaceImport(bindings)) index.set(bindings.name.text, '*');
    if (bindings !== undefined && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) index.set(element.name.text, (element.propertyName ?? element.name).text);
    }
  }
  importIndexes.set(source, index);
  return index;
}

/** True when the identifier names one of `wanted`, imported under any alias or used by its own name. */
export function names(source: ts.SourceFile, identifier: ts.Identifier, wanted: ReadonlySet<string>): boolean {
  const imported = importIndex(source).get(identifier.text);
  return wanted.has(imported === undefined || imported === '*' || imported === 'default' ? identifier.text : imported);
}

/** `name(…)`, an alias of it, or `namespace.name(…)`. */
export function refers(source: ts.SourceFile, expression: ts.Expression, wanted: ReadonlySet<string>): boolean {
  const target = unwrap(expression);
  if (ts.isIdentifier(target)) return names(source, target, wanted);
  return ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.expression) && wanted.has(target.name.text);
}

export function mentions(source: ts.SourceFile, node: ts.Node, wanted: ReadonlySet<string>): boolean {
  if (ts.isIdentifier(node) && names(source, node, wanted)) return true;
  return ts.forEachChild(node, (child) => mentions(source, child, wanted) || undefined) ?? false;
}

/** The identifier is the name an import, a declaration or a JSX attribute introduces, not a use of it. */
function introduces(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent) || ts.isJsxClosingElement(parent)) return true;
  return (
    (ts.isFunctionDeclaration(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isBindingElement(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isJsxAttribute(parent)) &&
    parent.name === identifier
  );
}

/** Every use of a named helper: a call, a reference or a re-export, under any import alias. */
export const uses =
  (...wanted: string[]): Finder =>
  (source) => {
    const set = new Set(wanted);
    return nodes(source, ts.SyntaxKind.Identifier)
      .filter(ts.isIdentifier)
      .filter((identifier) => !introduces(identifier))
      .filter((identifier) =>
        ts.isPropertyAccessExpression(identifier.parent) && identifier.parent.name === identifier ? set.has(identifier.text) : names(source, identifier, set),
      );
  };

/** Each import or re-export of a name, and each `namespace.name`. */
export const imported =
  (...wanted: string[]): Finder =>
  (source) => {
    const set = new Set(wanted);
    const specifiers = [...nodes(source, ts.SyntaxKind.ImportSpecifier), ...nodes(source, ts.SyntaxKind.ExportSpecifier)].filter(
      (node) => (ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) && set.has((node.propertyName ?? node.name).text),
    );
    const members = nodes(source, ts.SyntaxKind.PropertyAccessExpression).filter(
      (node) => ts.isPropertyAccessExpression(node) && set.has(node.name.text) && ts.isIdentifier(node.expression) && importIndex(source).get(node.expression.text) === '*',
    );
    return [...specifiers, ...members];
  };

/** Each static or dynamic import of a module. */
export const importsModule =
  (module: string): Finder =>
  (source) => [
    ...source.statements.filter((statement) => ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === module),
    ...calls(source).filter(
      (call) => call.expression.kind === ts.SyntaxKind.ImportKeyword && call.arguments[0] !== undefined && ts.isStringLiteralLike(call.arguments[0]) && call.arguments[0].text === module,
    ),
  ];

/** Opening tags of a component, under any import alias. */
export const elements =
  (...wanted: string[]): ((source: ts.SourceFile) => (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[]) =>
  (source) => {
    const set = new Set(wanted);
    return [...nodes(source, ts.SyntaxKind.JsxOpeningElement), ...nodes(source, ts.SyntaxKind.JsxSelfClosingElement)]
      .filter((node) => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      .filter((node) => ts.isIdentifier(node.tagName) && names(source, node.tagName, set));
  };

/** String literals whose class list holds every one of `classes`, in any order. */
export const classLists =
  (...classes: string[]): Finder =>
  (source) =>
    [ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail]
      .flatMap((kind) => nodes(source, kind))
      .filter((node) => ts.isStringLiteral(node) || ts.isTemplateLiteralToken(node))
      .filter((literal) => {
        const listed = new Set(literal.text.split(/\s+/));
        return classes.every((name) => listed.has(name));
      });

/**
 * Comments whose text contains `needle`, read from the trivia before each token on the way down to a match.
 * JSX text that looks like a comment is not trivia.
 */
export function comments(source: ts.SourceFile, needle: string): ts.CommentRange[] {
  const matches: number[] = [];
  for (let at = source.text.indexOf(needle); at !== -1; at = source.text.indexOf(needle, at + 1)) matches.push(at);
  const found = new Map<number, ts.CommentRange>();
  const visit = (node: ts.Node) => {
    if (!matches.some((position) => position >= node.getFullStart() && position < node.getEnd())) return;
    if (node.kind < ts.SyntaxKind.FirstToken || node.kind > ts.SyntaxKind.LastToken) {
      for (const child of node.getChildren(source)) visit(child);
      return;
    }
    if (node.kind === ts.SyntaxKind.JsxText) return;
    const start = node.getFullStart();
    for (const range of [...(ts.getTrailingCommentRanges(source.text, start) ?? []), ...(ts.getLeadingCommentRanges(source.text, start) ?? [])]) found.set(range.pos, range);
  };
  visit(source);
  return [...found.values()].filter((range) => source.text.slice(range.pos, range.end).includes(needle));
}

const isExported = (node: ts.Node) =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);

export type Exported = { readonly name: string; readonly node: ts.Node };

/** Names a module declares and exports; a re-export, including `export { name }` of an imported name, is not a declaration. */
export function exportedNames(source: ts.SourceFile): Exported[] {
  const imported = importIndex(source);
  return source.statements.flatMap((statement): Exported[] => {
    if (ts.isExportDeclaration(statement)) {
      if (statement.moduleSpecifier !== undefined || statement.exportClause === undefined || !ts.isNamedExports(statement.exportClause)) return [];
      return statement.exportClause.elements
        .filter((element) => !imported.has((element.propertyName ?? element.name).text))
        .map((element) => ({ name: element.name.text, node: element }));
    }
    if (!isExported(statement)) return [];
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.flatMap((declaration) => (ts.isIdentifier(declaration.name) ? [{ name: declaration.name.text, node: declaration }] : []));
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
