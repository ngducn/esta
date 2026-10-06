import { relative, resolve, sep } from 'node:path';

const TEXT_ATTRIBUTES = new Set([
  'alt',
  'aria-braillelabel',
  'aria-brailleroledescription',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'caption',
  'description',
  'heading',
  'helperText',
  'label',
  'message',
  'placeholder',
  'text',
  'title',
]);
const NON_TEXT_ATTRIBUTES = new Set([
  'accept',
  'autoComplete',
  'className',
  'd',
  'dir',
  'href',
  'htmlFor',
  'id',
  'key',
  'lang',
  'method',
  'name',
  'points',
  'rel',
  'role',
  'sizes',
  'src',
  'srcSet',
  'target',
  'transform',
  'type',
  'viewBox',
]);
const NON_TEXT_PREFIXES = ['data-', 'aria-'];
const METADATA_TEXT_KEYS = new Set(['title', 'description']);
const EXEMPT_ROOTS = ['apps/web/src/app/dev/'];
const APP_ROOT = 'apps/web/src/app/';
const repoRoot = resolve(import.meta.dirname, '..');

const hasWords = (text) => /\p{L}/u.test(text);
const looksLikeText = (text) => hasWords(text) && /\s|[^\p{ASCII}]/u.test(text);

function attributeKind(name) {
  if (TEXT_ATTRIBUTES.has(name)) return 'text';
  if (NON_TEXT_ATTRIBUTES.has(name) || NON_TEXT_PREFIXES.some((prefix) => name.startsWith(prefix))) return 'code';
  return 'unknown';
}

const attributeName = (node) =>
  node.name.type === 'JSXNamespacedName' ? `${node.name.namespace.name}:${node.name.name.name}` : node.name.name;

const propertyName = (property) =>
  property.key.type === 'Identifier' ? property.key.name : typeof property.key.value === 'string' ? property.key.value : null;

const unwrap = (node) =>
  node && (node.type === 'TSSatisfiesExpression' || node.type === 'TSAsExpression') ? unwrap(node.expression) : node;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'User-facing text in JSX comes from the next-intl message files (SPEC FND-3)' },
    messages: {
      text: 'Move this text into apps/web/messages/vi.json and en.json and render it with next-intl.',
      attribute: 'Move this {{name}} text into apps/web/messages/vi.json and en.json and render it with next-intl.',
      metadata:
        'Move this metadata {{name}} into apps/web/messages/vi.json and en.json and return it from generateMetadata.',
    },
    schema: [],
  },
  create(context) {
    const file = relative(repoRoot, context.physicalFilename).split(sep).join('/');
    if (EXEMPT_ROOTS.some((root) => file.startsWith(root))) return {};

    const constInit = (identifier) => {
      for (let scope = context.sourceCode.getScope(identifier); scope; scope = scope.upper) {
        const variable = scope.set.get(identifier.name);
        if (!variable) continue;
        const [definition] = variable.defs;
        return definition?.type === 'Variable' && definition.parent.kind === 'const' ? definition.node.init : null;
      }
      return null;
    };

    function* literalStrings(node) {
      if (!node) return;
      if (node.type === 'Literal' && typeof node.value === 'string') yield { node, text: node.value };
      else if (node.type === 'TemplateLiteral') yield { node, text: node.quasis.map((q) => q.value.cooked ?? '').join('') };
      else if (node.type === 'JSXExpressionContainer') yield* literalStrings(node.expression);
      else if (node.type === 'ConditionalExpression') {
        yield* literalStrings(node.consequent);
        yield* literalStrings(node.alternate);
      } else if (node.type === 'LogicalExpression') yield* literalStrings(node.right);
      else if (node.type === 'BinaryExpression' && node.operator === '+') {
        yield* literalStrings(node.left);
        yield* literalStrings(node.right);
      } else if (node.type === 'Identifier') {
        const init = constInit(node);
        if (init?.type === 'Literal' || init?.type === 'TemplateLiteral') {
          for (const literal of literalStrings(init)) yield { node, text: literal.text };
        }
      }
    }

    function* metadataTexts(object) {
      for (const property of object.properties) {
        if (property.type !== 'Property') continue;
        const name = propertyName(property);
        const value = unwrap(property.value);
        if (METADATA_TEXT_KEYS.has(name)) {
          const values = value.type === 'ObjectExpression' ? value.properties.map((p) => p.value) : [value];
          for (const literal of values.flatMap((v) => [...literalStrings(v)])) yield { ...literal, name };
        } else if (value.type === 'ObjectExpression') yield* metadataTexts(value);
      }
    }

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
        const name = attributeName(node);
        const kind = attributeKind(name);
        if (kind === 'code') return;
        const isText = kind === 'text' ? hasWords : looksLikeText;
        for (const literal of literalStrings(node.value)) {
          if (isText(literal.text)) context.report({ node: literal.node, messageId: 'attribute', data: { name } });
        }
      },
      'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator'(node) {
        if (!file.startsWith(APP_ROOT) || node.id.type !== 'Identifier' || node.id.name !== 'metadata') return;
        const init = unwrap(node.init);
        if (init?.type !== 'ObjectExpression') return;
        for (const literal of metadataTexts(init)) {
          if (hasWords(literal.text)) context.report({ node: literal.node, messageId: 'metadata', data: { name: literal.name } });
        }
      },
    };
  },
};
