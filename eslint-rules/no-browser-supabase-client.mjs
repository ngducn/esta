const BROWSER_FACTORY = 'createBrowserClient';
const SUPABASE_MODULE = /^@supabase\//;

const isUseClient = (statement) =>
  statement.type === 'ExpressionStatement' && statement.directive === 'use client';

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'The web app has no browser Supabase client, so the auth cookies stay httpOnly (P0-09). Talk to Supabase from server code.',
    },
    messages: {
      factory: 'createBrowserClient would need readable auth cookies. Call Supabase from a server action or route instead.',
      clientImport: 'A "use client" module must not import {{source}}. Call Supabase from a server action or route instead.',
    },
    schema: [],
  },
  create(context) {
    let clientModule = false;
    const reported = new Set();
    const reportFactory = (node) => {
      if (reported.has(node.range[0])) return;
      reported.add(node.range[0]);
      context.report({ node, messageId: 'factory' });
    };
    const checkSource = (node, source) => {
      if (clientModule && typeof source === 'string' && SUPABASE_MODULE.test(source)) {
        context.report({ node, messageId: 'clientImport', data: { source } });
      }
    };
    return {
      Program(program) {
        clientModule = program.body.some(isUseClient);
      },
      Identifier(node) {
        if (node.name === BROWSER_FACTORY) reportFactory(node);
      },
      Literal(node) {
        if (node.value === BROWSER_FACTORY) reportFactory(node);
      },
      ImportDeclaration(node) {
        if (node.importKind !== 'type') checkSource(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') checkSource(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) checkSource(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        checkSource(node, node.source.value);
      },
    };
  },
};
