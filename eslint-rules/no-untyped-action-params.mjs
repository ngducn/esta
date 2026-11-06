const isUseServer = (statement) => statement.type === 'ExpressionStatement' && statement.directive === 'use server';

const isRecordOfUnknown = (node) =>
  node.type === 'TSTypeReference' &&
  node.typeName.type === 'Identifier' &&
  node.typeName.name === 'Record' &&
  node.typeArguments?.params.length === 2 &&
  node.typeArguments.params[0].type === 'TSStringKeyword' &&
  node.typeArguments.params[1].type === 'TSUnknownKeyword';

const isIndexOfUnknown = (node) =>
  node.type === 'TSIndexSignature' && node.typeAnnotation?.typeAnnotation.type === 'TSUnknownKeyword' && node.parameters.every((parameter) => parameter.typeAnnotation?.typeAnnotation.type === 'TSStringKeyword');

function* children(node) {
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    for (const child of Array.isArray(value) ? value : [value]) if (typeof child?.type === 'string') yield child;
  }
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A server action takes and returns typed values. A `Record<string, unknown>` crossing the boundary is the row snapshot the undo model used to ship to the client and re-insert (Q-03); undo is a restore by id instead.',
    },
    messages: {
      untyped: '{{name}} takes or returns a `Record<string, unknown>` (through {{through}}). Send an id and restore by it (`softDeleteOps`, packages/ops/src/soft-delete.ts), or type the value.',
    },
    schema: [],
  },
  create(context) {
    let serverModule = false;
    const aliases = new Map();
    const untypedThrough = (type, seen) => {
      if (isRecordOfUnknown(type) || isIndexOfUnknown(type)) return 'Record<string, unknown>';
      if (type.type === 'TSTypeReference' && type.typeName.type === 'Identifier' && aliases.has(type.typeName.name) && !seen.has(type.typeName.name)) {
        seen.add(type.typeName.name);
        const inner = untypedThrough(aliases.get(type.typeName.name), seen);
        if (inner !== null) return type.typeName.name;
      }
      for (const child of children(type)) {
        const found = untypedThrough(child, seen);
        if (found !== null) return found;
      }
      return null;
    };
    const check = (fn, name) => {
      const types = [...fn.params.map((parameter) => parameter.typeAnnotation?.typeAnnotation), fn.returnType?.typeAnnotation].filter((type) => type !== undefined);
      for (const type of types) {
        const through = untypedThrough(type, new Set());
        if (through !== null) return context.report({ node: fn, messageId: 'untyped', data: { name, through } });
      }
    };
    return {
      Program(program) {
        serverModule = program.body.some(isUseServer);
        for (const statement of program.body) {
          const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
          if (declaration?.type === 'TSTypeAliasDeclaration') aliases.set(declaration.id.name, declaration.typeAnnotation);
          if (declaration?.type === 'TSInterfaceDeclaration') aliases.set(declaration.id.name, declaration.body);
        }
      },
      ExportNamedDeclaration(node) {
        if (!serverModule) return;
        const declaration = node.declaration;
        if (declaration?.type === 'FunctionDeclaration' && declaration.id) check(declaration, declaration.id.name);
        if (declaration?.type === 'VariableDeclaration') {
          for (const { id, init } of declaration.declarations) {
            if ((init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') && id.type === 'Identifier') check(init, id.name);
          }
        }
      },
    };
  },
};
