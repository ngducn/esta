const PICKERS = new Set(['constantFrom', 'subarray', 'shuffledSubarray']);
const CALLBACK_METHODS = new Set(['map', 'flatMap', 'filter', 'find', 'some', 'every', 'reduce', 'sort', 'toSorted']);
const TEST_MODULE = /(?:\.cases|\.test)(?:\.[cm]?[jt]sx?)?$/u;

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
        'A fast-check property that draws its inputs from a list imported from production code cannot find a spelling that list misses.',
    },
    messages: {
      selfSourced:
        '`{{name}}` comes from {{source}}, so this property can only draw what that list already holds. Generate the inputs independently (arbitrary strings, Unicode classes, the full range), or draw from a list in this file or a *.cases.ts table.',
    },
    schema: [],
  },
  create(context) {
    const importedFrom = (name, scope, seen) => {
      if (seen.has(name)) return null;
      seen.add(name);
      const variable = findVariable(scope, name);
      const def = variable?.defs[0];
      if (!def) return null;
      if (def.type === 'ImportBinding') {
        if (def.parent.importKind === 'type' || def.node.importKind === 'type') return null;
        const source = String(def.parent.source.value);
        return TEST_MODULE.test(source) ? null : source;
      }
      if (def.type === 'Variable' && def.node.init) {
        for (const inner of referencedNames(def.node.init)) {
          const source = importedFrom(inner, variable.scope, seen);
          if (source) return source;
        }
      }
      return null;
    };

    const check = (argument, scope) => {
      for (const name of referencedNames(argument)) {
        const source = importedFrom(name, scope, new Set());
        if (source) {
          context.report({ node: argument, messageId: 'selfSourced', data: { name, source: `'${source}'` } });
          return;
        }
      }
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
      CallExpression(node) {
        const name = calleeName(node.callee);
        if (!name) return;
        const scope = context.sourceCode.getScope(node);
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
