import { relative, resolve, sep } from 'node:path';

const TEXT_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt']);
const EXEMPT_ROOTS = ['apps/web/src/app/dev/'];
const repoRoot = resolve(import.meta.dirname, '..');

const hasWords = (text) => /\p{L}/u.test(text);

function* literalStrings(node) {
  if (!node) return;
  if (node.type === 'Literal' && typeof node.value === 'string') yield { node, text: node.value };
  else if (node.type === 'TemplateLiteral') yield { node, text: node.quasis.map((q) => q.value.cooked ?? '').join('') };
  else if (node.type === 'JSXExpressionContainer') yield* literalStrings(node.expression);
  else if (node.type === 'ConditionalExpression') {
    yield* literalStrings(node.consequent);
    yield* literalStrings(node.alternate);
  } else if (node.type === 'LogicalExpression') yield* literalStrings(node.right);
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'User-facing text in JSX comes from the next-intl message files (SPEC FND-3)' },
    messages: {
      text: 'Move this text into apps/web/messages/vi.json and en.json and render it with next-intl.',
      attribute: 'Move this {{name}} text into apps/web/messages/vi.json and en.json and render it with next-intl.',
    },
    schema: [],
  },
  create(context) {
    const file = relative(repoRoot, context.physicalFilename).split(sep).join('/');
    if (EXEMPT_ROOTS.some((root) => file.startsWith(root))) return {};
    return {
      JSXText(node) {
        if (hasWords(node.value)) context.report({ node, messageId: 'text' });
      },
      JSXExpressionContainer(node) {
        if (node.parent.type !== 'JSXElement' && node.parent.type !== 'JSXFragment') return;
        for (const literal of literalStrings(node)) {
          if (hasWords(literal.text)) context.report({ node: literal.node, messageId: 'text' });
        }
      },
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || !TEXT_ATTRIBUTES.has(node.name.name)) return;
        for (const literal of literalStrings(node.value)) {
          if (hasWords(literal.text)) context.report({ node: literal.node, messageId: 'attribute', data: { name: node.name.name } });
        }
      },
    };
  },
};
