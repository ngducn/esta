import ts from 'typescript';
import { calls, declarations, elements, importIndex, isAsync, mentions, nameOf, names, nodes, refers, unwrap, type Finder } from './syntax.ts';

/** A popup root rendered with a bare `open`: its parent mounts it only while open, so it unmounts before its exit motion. */
export const alwaysOpenPopups: Finder = (source) =>
  elements('Sheet', 'Dialog', 'AlertDialog')(source).filter((element) =>
    element.attributes.properties.some(
      (attribute) =>
        ts.isJsxAttribute(attribute) &&
        ts.isIdentifier(attribute.name) &&
        attribute.name.text === 'open' &&
        (attribute.initializer === undefined ||
          (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression?.kind === ts.SyntaxKind.TrueKeyword)),
    ),
  );

/** `start(async () => …)` where `start` came from `useTransition()`, or React's own `startTransition`. */
export const asyncTransitions: Finder = (source) => {
  const useTransition = new Set(['useTransition']);
  const starters = new Set(['startTransition']);
  const asyncNames = new Set<string>();
  for (const declaration of declarations(source)) {
    const initializer = declaration.initializer === undefined ? undefined : unwrap(declaration.initializer);
    if (initializer === undefined) continue;
    if (ts.isArrayBindingPattern(declaration.name) && ts.isCallExpression(initializer) && refers(source, initializer.expression, useTransition)) {
      const starter = declaration.name.elements[1];
      if (starter !== undefined && ts.isBindingElement(starter) && ts.isIdentifier(starter.name)) starters.add(starter.name.text);
    }
    const wrapped = ts.isCallExpression(initializer) ? initializer.arguments[0] : initializer;
    if (ts.isIdentifier(declaration.name) && wrapped !== undefined && isAsync(wrapped)) asyncNames.add(declaration.name.text);
  }
  for (const statement of nodes(source, ts.SyntaxKind.FunctionDeclaration)) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined && isAsync(statement)) asyncNames.add(statement.name.text);
  }
  return calls(source).filter((call) => {
    const [work] = call.arguments;
    const callee = call.expression;
    const starts = ts.isIdentifier(callee) ? starters.has(callee.text) : ts.isPropertyAccessExpression(callee) && callee.name.text === 'startTransition';
    return starts && work !== undefined && (isAsync(work) || (ts.isIdentifier(work) && asyncNames.has(work.text)));
  });
};

/** Each `.method(…)` call with its arguments, reported at the method name so a long receiver chain points at the right line. */
const methodCalls = (source: ts.SourceFile, methods: readonly string[]) =>
  calls(source).flatMap((call) =>
    ts.isPropertyAccessExpression(call.expression) && methods.includes(call.expression.name.text) ? [{ args: call.arguments, method: call.expression.name }] : [],
  );

/** The expressions a function body returns, not counting nested functions. */
function returns(node: ts.Node): ts.Expression[] {
  if (ts.isReturnStatement(node)) return node.expression === undefined ? [] : [node.expression];
  if (ts.isFunctionLike(node)) return [];
  const found: ts.Expression[] = [];
  ts.forEachChild(node, (child) => {
    found.push(...returns(child));
  });
  return found;
}

const isFailureValue = (expression: ts.Expression) => {
  const value = unwrap(expression);
  return (
    ts.isObjectLiteralExpression(value) &&
    value.properties.some(
      (property) => ts.isPropertyAssignment(property) && nameOf(property.name) === 'ok' && unwrap(property.initializer).kind === ts.SyntaxKind.FalseKeyword,
    )
  );
};

/** `.catch(() => ({ ok: false … }))` in any spelling: typed, multi-line, `as const`, or a block that returns it. */
export const catchToFailure: Finder = (source) =>
  methodCalls(source, ['catch'])
    .filter(({ args: [handler] }) => {
      if (handler === undefined || (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler))) return false;
      return ts.isBlock(handler.body) ? returns(handler.body).some(isFailureValue) : isFailureValue(handler.body);
    })
    .map(({ method }) => method);

const declaresFailure = (members: ts.NodeArray<ts.TypeElement>) =>
  members.some(
    (member) =>
      ts.isPropertySignature(member) &&
      nameOf(member.name) === 'ok' &&
      member.type !== undefined &&
      ts.isLiteralTypeNode(member.type) &&
      member.type.literal.kind === ts.SyntaxKind.FalseKeyword,
  );

/** The failure arm of a result type: an object type or interface that declares `ok: false`, wherever it sits. */
export const failureArms: Finder = (source) => [
  ...nodes(source, ts.SyntaxKind.TypeLiteral).filter(
    (node) => ts.isTypeLiteralNode(node) && declaresFailure(node.members) && !(ts.isTypeReferenceNode(node.parent) && node.parent.typeArguments?.some((argument) => argument === node)),
  ),
  ...nodes(source, ts.SyntaxKind.InterfaceDeclaration).filter((node) => ts.isInterfaceDeclaration(node) && declaresFailure(node.members)),
];

/** `.refine(isIsoDate …)` or a refine whose check calls `isIsoDate`. */
export const isoDateRefines: Finder = (source) =>
  methodCalls(source, ['refine', 'superRefine'])
    .filter(({ args: [check] }) => check !== undefined && mentions(source, check, new Set(['isIsoDate'])))
    .map(({ method }) => method);

const ZOD = new Set(['z']);
const isZod = (source: ts.SourceFile, expression: ts.Expression) => ts.isIdentifier(expression) && names(source, expression, ZOD);

/** `z.uuid()`, or the older `z.string().uuid()`. */
const isUuidCall = (source: ts.SourceFile, call: ts.CallExpression) => {
  if (!ts.isPropertyAccessExpression(call.expression) || call.expression.name.text !== 'uuid') return false;
  const receiver = call.expression.expression;
  if (isZod(source, receiver)) return true;
  return ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression) && receiver.expression.name.text === 'string' && isZod(source, receiver.expression.expression);
};

const PARSES = new Set(['parse', 'safeParse', 'parseAsync', 'safeParseAsync']);

/** A uuid schema bound to its own name or parsed on the spot; an id field inside an object schema is fine. */
export const localIdSchemas: Finder = (source) =>
  calls(source)
    .filter((call) => isUuidCall(source, call))
    .filter((call) => {
      let top: ts.Expression = call;
      while (ts.isPropertyAccessExpression(top.parent) && ts.isCallExpression(top.parent.parent) && top.parent.parent.expression === top.parent) {
        if (PARSES.has(top.parent.name.text)) return true;
        top = top.parent.parent;
      }
      return ts.isVariableDeclaration(top.parent) && top.parent.initializer === top;
    });

/** `x as unknown as T` and its angle-bracket spelling. */
export const doubleCasts: Finder = (source) =>
  [...nodes(source, ts.SyntaxKind.AsExpression), ...nodes(source, ts.SyntaxKind.TypeAssertionExpression)].filter((node) => {
    if (!ts.isAsExpression(node) && !ts.isTypeAssertionExpression(node)) return false;
    let inner = node.expression;
    while (ts.isParenthesizedExpression(inner)) inner = inner.expression;
    return (ts.isAsExpression(inner) || ts.isTypeAssertionExpression(inner)) && inner.type.kind === ts.SyntaxKind.UnknownKeyword;
  });

const CAP_PROPERTIES = new Set(['WebSearch', 'WebFetch', 'research_searches', 'research_fetches']);
const CAP_CONSTANT = /(?:search|fetch)\w*(?:cap|limit|max)|(?:cap|limit|max)\w*(?:search|fetch)/i;
const BOUND_METHODS = new Set(['max', 'catch', 'default']);

/** A numeric literal given to a zod bound (`.max(12)`, `.catch(12)`, `.default(12)`) anywhere in `node`. */
const hasLiteralBound = (node: ts.Node): boolean =>
  (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && BOUND_METHODS.has(node.expression.name.text) && node.arguments.some((argument) => ts.isNumericLiteral(unwrap(argument)))) || ts.forEachChild(node, hasLiteralBound) === true;

/** A search or fetch budget written as a number instead of read from `WEB_CAPS`: `{ WebSearch: 4 }`, a zod bound on `research_searches` such as `.max(12).catch(12)`, or `const SEARCH_CAP = 12`. */
export const webCapLiterals: Finder = (source) => [
  ...nodes(source, ts.SyntaxKind.PropertyAssignment).filter((node) => {
    if (!ts.isPropertyAssignment(node) || !(ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) || !CAP_PROPERTIES.has(node.name.text)) return false;
    return ts.isNumericLiteral(unwrap(node.initializer)) || hasLiteralBound(node.initializer);
  }),
  ...nodes(source, ts.SyntaxKind.VariableDeclaration).filter((node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && CAP_CONSTANT.test(node.name.text) && node.initializer !== undefined && ts.isNumericLiteral(unwrap(node.initializer))),
];

const SQLSTATE = /^(?:22|23|40|42|P0)[0-9A-Z]{3}$/;
const ERROR_NAME = /err|fail|cause|^e$/i;

/** `error.code`, `error?.code`, `error['code']` or a bare `code`: where a database error code is read. */
function isErrorCode(expression: ts.Expression): boolean {
  const target = unwrap(expression);
  if (ts.isIdentifier(target)) return target.text === 'code' || target.text === 'sqlstate';
  const key = ts.isPropertyAccessExpression(target) ? target.name.text : ts.isElementAccessExpression(target) && ts.isStringLiteralLike(target.argumentExpression) ? target.argumentExpression.text : undefined;
  if (key !== 'code' || !(ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target))) return false;
  const receiver = unwrap(target.expression);
  const owner = ts.isIdentifier(receiver) ? receiver.text : ts.isPropertyAccessExpression(receiver) ? receiver.name.text : '';
  return ERROR_NAME.test(owner);
}

const EQUALITY = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken]);
const LOOKUPS = new Set(['includes', 'has', 'get']);

function collectStates(node: ts.Node): ts.Node[] {
  const found: ts.Node[] = [];
  ts.forEachChild(node, (child) => {
    found.push(...(ts.isStringLiteralLike(child) && SQLSTATE.test(child.text) ? [child] : collectStates(child)));
  });
  return found;
}

/**
 * A SQLSTATE literal such as `'23505'` that a database error code is compared with or looked up in: directly,
 * through a local constant, set, array or map, or through an imported constant (counted where it is compared).
 */
export const sqlstateReads: Finder = (source) => {
  const hits = new Set<ts.Node>();
  const queried = new Map<string, ts.Identifier[]>();
  const against = (expression: ts.Expression) => {
    const value = unwrap(expression);
    if (ts.isStringLiteralLike(value) && SQLSTATE.test(value.text)) hits.add(value);
    const named = ts.isIdentifier(value) ? value : ts.isPropertyAccessExpression(value) && ts.isIdentifier(value.expression) ? value.expression : undefined;
    if (named !== undefined) queried.set(named.text, [...(queried.get(named.text) ?? []), named]);
    if (ts.isArrayLiteralExpression(value)) value.elements.forEach(against);
    if (ts.isNewExpression(value)) value.arguments?.forEach(against);
  };
  for (const node of nodes(source, ts.SyntaxKind.BinaryExpression)) {
    if (!ts.isBinaryExpression(node) || !EQUALITY.has(node.operatorToken.kind)) continue;
    if (isErrorCode(node.left)) against(node.right);
    if (isErrorCode(node.right)) against(node.left);
  }
  for (const node of nodes(source, ts.SyntaxKind.CaseClause)) {
    if (ts.isCaseClause(node) && isErrorCode(node.parent.parent.expression)) against(node.expression);
  }
  for (const call of calls(source)) {
    const [key] = call.arguments;
    if (ts.isPropertyAccessExpression(call.expression) && LOOKUPS.has(call.expression.name.text) && key !== undefined && isErrorCode(key)) against(call.expression.expression);
  }
  for (const node of nodes(source, ts.SyntaxKind.ElementAccessExpression)) {
    if (ts.isElementAccessExpression(node) && isErrorCode(node.argumentExpression)) against(node.expression);
  }
  const local = new Set<string>();
  for (const declaration of declarations(source)) {
    if (!ts.isIdentifier(declaration.name) || !queried.has(declaration.name.text) || declaration.initializer === undefined) continue;
    local.add(declaration.name.text);
    collectStates(declaration).forEach((state) => hits.add(state));
  }
  for (const [name, references] of queried) if (!local.has(name) && importIndex(source).has(name)) references.forEach((reference) => hits.add(reference));
  return [...hits];
};

const VIEWPORT_NAMES = new Set(['PHONE', 'DESKTOP']);
/** The sizes `PHONE` and `DESKTOP` in e2e/helpers/wizard.ts hold. */
const VIEWPORT_SIZES = new Set(['390x844', '1440x900']);

const numberProperty = (literal: ts.ObjectLiteralExpression, key: string) => {
  const property = literal.properties.find((candidate) => ts.isPropertyAssignment(candidate) && nameOf(candidate.name) === key);
  return property !== undefined && ts.isPropertyAssignment(property) && ts.isNumericLiteral(property.initializer) ? property.initializer.text : undefined;
};

/** A spec's own `PHONE` or `DESKTOP`, typed or not, and any inline object with the shared viewport sizes. */
export const viewports: Finder = (source) => {
  const named = declarations(source).filter((declaration) => ts.isIdentifier(declaration.name) && VIEWPORT_NAMES.has(declaration.name.text));
  const inline = nodes(source, ts.SyntaxKind.ObjectLiteralExpression).filter(
    (node) =>
      ts.isObjectLiteralExpression(node) &&
      VIEWPORT_SIZES.has(`${numberProperty(node, 'width')}x${numberProperty(node, 'height')}`) &&
      !named.some((declaration) => declaration.initializer === node),
  );
  return [...named, ...inline];
};

const PAGE_ROOTS = new Set(['documentElement', 'body', 'scrollingElement']);
const ROOT_SELECTORS = new Set(['html', 'body', ':root']);

/** The parameter of a callback that `locator('html').evaluate(…)` runs against the page root. */
function isRootParameter(identifier: ts.Identifier): boolean {
  let scope: ts.Node = identifier;
  while (!ts.isSourceFile(scope)) {
    scope = scope.parent;
    if (!ts.isArrowFunction(scope) && !ts.isFunctionExpression(scope)) continue;
    if (!scope.parameters.some((parameter) => nameOf(parameter.name) === identifier.text)) continue;
    const call = scope.parent;
    if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression) || !call.expression.name.text.startsWith('evaluate')) return false;
    const locator = unwrap(call.expression.expression);
    const [selector] = ts.isCallExpression(locator) ? locator.arguments : [];
    return (
      ts.isCallExpression(locator) &&
      ts.isPropertyAccessExpression(locator.expression) &&
      locator.expression.name.text === 'locator' &&
      selector !== undefined &&
      ts.isStringLiteralLike(selector) &&
      ROOT_SELECTORS.has(selector.text)
    );
  }
  return false;
}

/** A read of the page's own `scrollWidth`, whatever compares it; a single element's width is a different check. */
export const pageScrollWidths: Finder = (source) =>
  nodes(source, ts.SyntaxKind.PropertyAccessExpression).filter((node) => {
    if (!ts.isPropertyAccessExpression(node) || node.name.text !== 'scrollWidth') return false;
    const owner = unwrap(node.expression);
    return (ts.isPropertyAccessExpression(owner) && PAGE_ROOTS.has(owner.name.text)) || (ts.isIdentifier(owner) && isRootParameter(owner));
  });

const PAGE_NAME = /^(?!MAX_).*(PAGE|ROWS)/u;
const PAGE_START = /^(from|start|offset|to|end|last)/iu;
const PAGE_EDGES = new Set(['999', '1000']);

/** A page size spelled out where `POSTGREST_PAGE_SIZE` belongs: a number above 1 in `.range(`, 999 or 1000 in `.limit(` or added to or taken from a `from`, `start` or `offset`, or a numeric `const` of 100 or more named for pages or rows (a `MAX_` cap is another thing). 0 and 1 are the bounds of a first page. */
export const pageSizeLiterals: Finder = (source) => {
  const inCalls = calls(source)
    .filter((call) => ts.isPropertyAccessExpression(call.expression) && ['range', 'limit'].includes(call.expression.name.text))
    .flatMap((call) => {
      const ranged = ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'range';
      return call.arguments.flatMap((argument) => numericLiterals(argument)).filter((literal) => (ranged ? Number(literal.text) > 1 : PAGE_EDGES.has(literal.text)));
    });
  const arithmetic = nodes(source, ts.SyntaxKind.BinaryExpression).flatMap((node) => {
    if (!ts.isBinaryExpression(node) || (node.operatorToken.kind !== ts.SyntaxKind.PlusToken && node.operatorToken.kind !== ts.SyntaxKind.MinusToken)) return [];
    const [literal, other] = ts.isNumericLiteral(node.right) ? [node.right, node.left] : [node.left, node.right];
    return ts.isNumericLiteral(literal) && PAGE_EDGES.has(literal.text) && ts.isIdentifier(other) && PAGE_START.test(other.text) ? [literal] : [];
  });
  const constants = declarations(source).flatMap((declaration) => {
    const initializer = declaration.initializer === undefined ? undefined : unwrap(declaration.initializer);
    const isConst = ts.isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & ts.NodeFlags.Const) !== 0;
    return isConst && ts.isIdentifier(declaration.name) && PAGE_NAME.test(declaration.name.text) && initializer !== undefined && ts.isNumericLiteral(initializer) && Number(initializer.text) >= 100 ? [initializer] : [];
  });
  return [...new Set([...inCalls, ...arithmetic, ...constants])];
};

function numericLiterals(node: ts.Node): ts.NumericLiteral[] {
  const found: ts.NumericLiteral[] = ts.isNumericLiteral(node) ? [node] : [];
  ts.forEachChild(node, (child) => found.push(...numericLiterals(child)));
  return found;
}

/** `fetch(url, { method: 'PUT', … })`: bytes sent by hand. */
export const putFetches: Finder = (source) =>
  calls(source).filter((call) => {
    const [, init] = call.arguments;
    const options = init === undefined ? undefined : unwrap(init);
    if (!refers(source, call.expression, new Set(['fetch'])) || options === undefined || !ts.isObjectLiteralExpression(options)) return false;
    const method = options.properties.find((property) => ts.isPropertyAssignment(property) && nameOf(property.name) === 'method');
    return method !== undefined && ts.isPropertyAssignment(method) && ts.isStringLiteralLike(method.initializer) && method.initializer.text.toUpperCase() === 'PUT';
  });

const QUERY_BUILDER_METHODS = new Set(['eq', 'neq', 'in', 'is', 'gte', 'lte', 'like', 'ilike', 'match', 'order', 'limit', 'range', 'single', 'maybeSingle']);

/** An object literal that carries three or more query-builder methods: a hand-built stand-in for the Supabase client's query. */
export const handBuiltQueryBuilders: Finder = (source) =>
  nodes(source, ts.SyntaxKind.ObjectLiteralExpression)
    .filter(ts.isObjectLiteralExpression)
    .filter((literal) => {
      const named = new Set(
        literal.properties.flatMap((property) => {
          const name = ts.isShorthandPropertyAssignment(property) ? property.name.text : property.name === undefined ? undefined : nameOf(property.name);
          return name === undefined ? [] : [name];
        }),
      );
      return [...named].filter((name) => QUERY_BUILDER_METHODS.has(name)).length >= 3;
    });

const TEST_ID_QUERIES = /^(get|query|find)(All)?ByTestId$/;

/** `getByTestId(…)` and its siblings, and a selector string that reads `data-testid`. */
export const testIdQueries: Finder = (source) => [
  ...calls(source).filter((call) => {
    const callee = unwrap(call.expression);
    const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
    return TEST_ID_QUERIES.test(name);
  }),
  ...[ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateHead]
    .flatMap((kind) => nodes(source, kind))
    .filter((node) => (ts.isStringLiteral(node) || ts.isTemplateLiteralToken(node)) && /\[data-testid\b/.test(node.text)),
];

const SLOWEST_UNREASONED_TEST_MS = 15_000;
const TEST_CALLS = new Set(['it', 'test', 'describe', 'beforeAll', 'beforeEach', 'afterAll', 'afterEach']);
const SUITE_WIDE_SETTINGS = new Set(['testTimeout', 'hookTimeout']);
/** A `//` or `/*` comment that carries a reason after ` -- `, the way a lint exception gives one. */
const REASON = /(\/\/|\/\*).*\s--\s+\S/u;

function hasReason(source: ts.SourceFile, node: ts.Node): boolean {
  const statement = ts.findAncestor(node, ts.isStatement) ?? node;
  const lines = source.text.split('\n');
  const near = [node, statement].flatMap((at) => {
    const line = source.getLineAndCharacterOfPosition(at.getStart(source)).line;
    return [lines[line], lines[line - 1]];
  });
  return near.some((line) => line !== undefined && REASON.test(line));
}

function isTestCall(call: ts.CallExpression): boolean {
  const callee = unwrap(call.expression);
  const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) ? callee.expression.text : undefined;
  return name !== undefined && TEST_CALLS.has(name);
}

const milliseconds = (node: ts.Node) => (ts.isNumericLiteral(node) ? Number(node.text) : undefined);

/**
 * A unit test that hides slowness instead of fixing it: a suite-wide `testTimeout` or `hookTimeout`, a `retry` other than 0,
 * or one test or hook with a timeout above 15 s and no ` -- reason` comment on its line or the line above.
 */
export const slowTestSettings: Finder = (source) => {
  const hits: ts.Node[] = [];
  for (const node of nodes(source, ts.SyntaxKind.PropertyAssignment)) {
    if (!ts.isPropertyAssignment(node)) continue;
    const key = nameOf(node.name);
    if (key !== undefined && SUITE_WIDE_SETTINGS.has(key)) hits.push(node);
    else if (key === 'retry' && milliseconds(node.initializer) !== 0) hits.push(node);
  }
  for (const call of calls(source).filter(isTestCall)) {
    const options = call.arguments.find(ts.isObjectLiteralExpression);
    const timeout = options?.properties.find((property) => ts.isPropertyAssignment(property) && nameOf(property.name) === 'timeout');
    const subject = timeout !== undefined && ts.isPropertyAssignment(timeout) ? timeout.initializer : call.arguments.at(-1);
    if (subject !== undefined && (milliseconds(subject) ?? 0) > SLOWEST_UNREASONED_TEST_MS && !hasReason(source, subject)) hits.push(subject);
  }
  for (const declaration of declarations(source)) {
    const value = declaration.initializer === undefined ? undefined : milliseconds(declaration.initializer);
    if (ts.isIdentifier(declaration.name) && /timeout/iu.test(declaration.name.text) && (value ?? 0) > SLOWEST_UNREASONED_TEST_MS && !hasReason(source, declaration)) hits.push(declaration);
  }
  return hits;
};
