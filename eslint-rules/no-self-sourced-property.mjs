const PICKERS = new Set(['constantFrom', 'subarray', 'shuffledSubarray']);
const CALLBACK_METHODS = new Set(['map', 'flatMap', 'filter', 'find', 'some', 'every', 'reduce', 'sort', 'toSorted']);
const TEST_MODULE = /(?:\.cases|\.test)(?:\.[cm]?[jt]sx?)?$/u;
const CASES_MODULE = /\.cases(?:\.[cm]?[jt]sx?)?$/u;
const EQUALITY_MATCHERS = new Set(['toEqual', 'toStrictEqual', 'deepEqual', 'deepStrictEqual']);

const calleeName = (callee) => {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') return callee.property.name;
  return null;
};

const referencedNames = (node, names = new Set()) => {
  if (!node || typeof node.type !== 'string') return names;
  if (node.type === 'Identifier') {
    names.add(node.name);
    return names;
  }
  if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
    if (node.arguments.length === 0) names.add(node.callee.name);
    for (const argument of node.arguments) referencedNames(argument, names);
    return names;
  }
  if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
    referencedNames(node.callee, names);
    for (const argument of node.arguments) if (!(CALLBACK_METHODS.has(calleeName(node.callee)) && argument.type === 'Identifier')) referencedNames(argument, names);
    return names;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range' || key === 'typeArguments' || key === 'typeParameters') continue;
    if (key === 'property' && node.type === 'MemberExpression' && !node.computed) continue;
    if (key === 'key' && !node.computed) continue;
    if (Array.isArray(value)) for (const item of value) referencedNames(item, names);
    else if (value && typeof value === 'object') referencedNames(value, names);
  }
  return names;
};

const findVariable = (scope, name) => {
  for (let current = scope; current; current = current.upper) {
    const found = current.set.get(name);
    if (found) return found;
  }
  return null;
};

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A fast-check property that draws its inputs from a list imported from production code, or from a *.cases.ts table a test asserts equal to one, cannot find a spelling that list misses.',
    },
    messages: {
      mirroredCases:
        '`{{name}}` is a hand copy of a production list: this file asserts it equal to one, so a property drawing from it is self-sourced. Write the inputs in the test, independent of the list.',
      selfSourced:
        '`{{name}}` comes from {{source}}, so this property can only draw what that list already holds. Generate the inputs independently (arbitrary strings, Unicode classes, the full range), or draw from a list in this file or a *.cases.ts table.',
    },
    schema: [],
  },
  create(context) {
    /** The value import `name` comes from, through the variables built from it: its local name and module. */
    const rootImport = (name, scope, seen) => {
      if (seen.has(name)) return null;
      seen.add(name);
      const variable = findVariable(scope, name);
      const def = variable?.defs[0];
      if (!def) return null;
      if (def.type === 'ImportBinding') {
        if (def.parent.importKind === 'type' || def.node.importKind === 'type') return null;
        return { local: name, source: String(def.parent.source.value) };
      }
      if (def.type === 'Variable' && def.node.init) {
        for (const inner of referencedNames(def.node.init)) {
          const found = rootImport(inner, variable.scope, seen);
          if (found) return found;
        }
      }
      return null;
    };
    const importedFrom = (name, scope, seen) => {
      const found = rootImport(name, scope, seen);
      return found && !TEST_MODULE.test(found.source) ? found.source : null;
    };

    /** Imports from a *.cases module that a test asserts equal to something built from production code. */
    const mirrored = new Set();
    const drawnFromCases = [];

    const check = (argument, scope) => {
      for (const name of referencedNames(argument)) {
        const source = importedFrom(name, scope, new Set());
        if (source) {
          context.report({ node: argument, messageId: 'selfSourced', data: { name, source: `'${source}'` } });
          return;
        }
        const root = rootImport(name, scope, new Set());
        if (root && CASES_MODULE.test(root.source)) drawnFromCases.push({ node: argument, local: root.local });
      }
    };

    const noteEquality = (sides, scope) => {
      const roots = sides.map((side) => [...referencedNames(side)].map((name) => rootImport(name, scope, new Set())).filter(Boolean));
      roots.forEach((own, index) => {
        const others = roots.filter((_, other) => other !== index).flat();
        if (others.some(({ source }) => !TEST_MODULE.test(source))) for (const { local, source } of own) if (CASES_MODULE.test(source)) mirrored.add(local);
      });
    };

    const fastCheckRoot = (node) => {
      let current = node;
      while (current) {
        if (current.type === 'CallExpression') current = current.callee;
        else if (current.type === 'MemberExpression') current = current.object;
        else break;
      }
      if (current?.type !== 'Identifier') return false;
      const def = findVariable(context.sourceCode.getScope(node), current.name)?.defs[0];
      return def?.type === 'ImportBinding' && def.parent.source.value === 'fast-check';
    };

    const indexedByParameter = (fn, scope) => {
      const params = new Set(fn.params.filter((p) => p.type === 'Identifier').map((p) => p.name));
      const visit = (node) => {
        if (!node || typeof node.type !== 'string') return null;
        if (node.type === 'MemberExpression' && node.computed && node.object.type === 'Identifier' && referencedNames(node.property).size > 0) {
          const uses = [...referencedNames(node.property)].some((n) => params.has(n));
          const source = uses ? importedFrom(node.object.name, scope, new Set()) : null;
          if (source) return { name: node.object.name, source };
        }
        for (const [key, value] of Object.entries(node)) {
          if (key === 'parent' || key === 'loc' || key === 'range') continue;
          for (const item of Array.isArray(value) ? value : [value]) {
            const found = item && typeof item === 'object' ? visit(item) : null;
            if (found) return found;
          }
        }
        return null;
      };
      return visit(fn.body);
    };

    return {
      'Program:exit'() {
        for (const { node, local } of drawnFromCases) {
          if (mirrored.has(local)) context.report({ node, messageId: 'mirroredCases', data: { name: local } });
        }
      },
      CallExpression(node) {
        const name = calleeName(node.callee);
        if (!name) return;
        const scope = context.sourceCode.getScope(node);
        if (EQUALITY_MATCHERS.has(name)) {
          const subject = node.callee.object;
          if (subject?.type === 'CallExpression' && calleeName(subject.callee) === 'expect') noteEquality([...subject.arguments, ...node.arguments], scope);
          else if (node.arguments.length >= 2) noteEquality(node.arguments.slice(0, 2), scope);
          return;
        }
        if ((name === 'map' || name === 'chain') && node.callee.type === 'MemberExpression' && fastCheckRoot(node.callee.object)) {
          const callback = node.arguments[0];
          if (callback && (callback.type === 'ArrowFunctionExpression' || callback.type === 'FunctionExpression')) {
            const found = indexedByParameter(callback, scope);
            if (found) context.report({ node: callback, messageId: 'selfSourced', data: { name: found.name, source: `'${found.source}'` } });
          }
          return;
        }
        if (PICKERS.has(name)) {
          for (const argument of node.arguments) check(argument, scope);
          return;
        }
        if (name !== 'oneof') return;
        for (const argument of node.arguments) {
          const arbitrary = argument.type === 'SpreadElement' ? argument.argument : argument;
          if (arbitrary.type === 'CallExpression' && calleeName(arbitrary.callee) === 'constant') {
            for (const value of arbitrary.arguments) check(value, scope);
          }
        }
      },
    };
  },
};
