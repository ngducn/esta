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

    return {
      CallExpression(node) {
        const name = calleeName(node.callee);
        if (!name) return;
        const scope = context.sourceCode.getScope(node);
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
