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
const HTML_CODE_ATTRIBUTES = [
  'accept', 'acceptCharset', 'action', 'allow', 'as', 'autoCapitalize', 'autoComplete', 'capture', 'charSet', 'cite',
  'colSpan', 'coords', 'crossOrigin', 'dateTime', 'decoding', 'dir', 'encType', 'enterKeyHint',
  'fetchPriority', 'form', 'formAction', 'formEncType', 'formMethod', 'formTarget', 'headers', 'href', 'hrefLang',
  'htmlFor', 'httpEquiv', 'id', 'inputMode', 'integrity', 'itemID', 'itemProp', 'itemRef', 'itemType', 'key', 'lang',
  'list', 'loading', 'max', 'media', 'method', 'min', 'name', 'nonce', 'pattern', 'ping', 'poster', 'preload',
  'property', 'referrerPolicy', 'rel', 'role', 'rowSpan', 'sandbox', 'scope', 'shape', 'sizes', 'slot', 'span', 'src',
  'srcLang', 'srcSet', 'step', 'tabIndex', 'target', 'type', 'useMap', 'wrap',
];
const SVG_CODE_ATTRIBUTES = [
  'additive', 'alignmentBaseline', 'attributeName', 'attributeType', 'baseFrequency', 'baselineShift', 'calcMode',
  'clip', 'clipPath', 'clipPathUnits', 'clipRule', 'color', 'colorInterpolation', 'colorInterpolationFilters', 'cursor',
  'cx', 'cy', 'd', 'direction', 'display', 'dominantBaseline', 'dur', 'dx', 'dy', 'fill', 'fillOpacity', 'fillRule',
  'filter', 'filterUnits', 'floodColor', 'floodOpacity', 'fontFamily', 'fontSize', 'fontStretch', 'fontStyle',
  'fontVariant', 'fontWeight', 'gradientTransform', 'gradientUnits', 'height', 'imageRendering', 'keyPoints',
  'keySplines', 'keyTimes', 'lengthAdjust', 'letterSpacing', 'lightingColor', 'markerEnd', 'markerHeight', 'markerMid',
  'markerStart', 'markerUnits', 'markerWidth', 'mask', 'maskContentUnits', 'maskUnits', 'offset', 'opacity', 'overflow',
  'paintOrder', 'pathLength', 'patternContentUnits', 'patternTransform', 'patternUnits', 'pointerEvents', 'points',
  'preserveAspectRatio', 'r', 'refX', 'refY', 'repeatCount', 'repeatDur', 'rx', 'ry', 'shapeRendering', 'stdDeviation',
  'stopColor', 'stopOpacity', 'stroke', 'strokeDasharray', 'strokeDashoffset', 'strokeLinecap', 'strokeLinejoin',
  'strokeMiterlimit', 'strokeOpacity', 'strokeWidth', 'textAnchor', 'textDecoration', 'textLength', 'textRendering',
  'to', 'transform', 'transformOrigin', 'unicodeBidi', 'values', 'vectorEffect', 'viewBox', 'visibility', 'width',
  'wordSpacing', 'writingMode', 'x', 'x1', 'x2', 'xlinkHref', 'xmlns', 'xmlnsXlink', 'xmlLang', 'xmlSpace', 'y', 'y1',
  'y2',
];
const CODE_ATTRIBUTES = new Set([...HTML_CODE_ATTRIBUTES, ...SVG_CODE_ATTRIBUTES]);
const CODE_NAME_PATTERN = /(?:classNames?|style)$/i;
const CODE_PREFIXES = ['data-', 'aria-'];
const ELEMENT_CODE_ATTRIBUTES = { meta: new Set(['content']) };
const METADATA_TEXT_KEYS = new Set(['title', 'description']);
const EXEMPT_ROOTS = ['apps/web/src/app/dev/'];
const APP_ROOT = 'apps/web/src/app/';
const repoRoot = resolve(import.meta.dirname, '..');

const hasWords = (text) => /\p{L}/u.test(text);
const looksLikeText = (text) => hasWords(text) && /\s|[^\p{ASCII}]/u.test(text);

const camelCase = (name) => name.replace(/[-:](\p{Ll})/gu, (_, letter) => letter.toUpperCase());

function attributeKind(name, element) {
  if (TEXT_ATTRIBUTES.has(name)) return 'text';
  if (
    CODE_PREFIXES.some((prefix) => name.startsWith(prefix)) ||
    CODE_NAME_PATTERN.test(name) ||
    CODE_ATTRIBUTES.has(camelCase(name)) ||
    ELEMENT_CODE_ATTRIBUTES[element]?.has(name)
  ) {
    return 'code';
  }
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
      } else if (node.type === 'Identifier') yield* joined(node, [constInit(node)]);
      else if (node.type === 'MemberExpression' && node.object.type === 'Identifier') {
        const init = unwrap(constInit(node.object));
        if (init?.type !== 'ObjectExpression') return;
        const key = node.computed ? (node.property.type === 'Literal' ? node.property.value : null) : node.property.name;
        const properties = init.properties.filter((p) => p.type === 'Property' && (key === null || propertyName(p) === key));
        yield* joined(node, properties.map((p) => unwrap(p.value)));
      } else if (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'ArrayExpression' &&
        node.callee.property.name === 'join'
      ) {
        yield* joined(node, node.callee.object.elements);
      }
    }

    function* joined(node, parts) {
      const texts = parts.flatMap((part) => [...literalStrings(part)].map((literal) => literal.text));
      if (texts.length > 0) yield { node, text: texts.join('') };
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

    const reportMetadata = (node) => {
      const object = unwrap(node);
      if (!file.startsWith(APP_ROOT) || object?.type !== 'ObjectExpression') return;
      for (const literal of metadataTexts(object)) {
        if (hasWords(literal.text)) context.report({ node: literal.node, messageId: 'metadata', data: { name: literal.name } });
      }
    };

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
        const element = node.parent.name.type === 'JSXIdentifier' ? node.parent.name.name : null;
        const kind = attributeKind(name, element);
        if (kind === 'code') return;
        const isText = kind === 'text' ? hasWords : looksLikeText;
        for (const literal of literalStrings(node.value)) {
          if (isText(literal.text)) context.report({ node: literal.node, messageId: 'attribute', data: { name } });
        }
      },
      'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name="metadata"]'(node) {
        reportMetadata(node.init);
      },
      ':matches(FunctionDeclaration, VariableDeclarator)[id.name="generateMetadata"] ReturnStatement'(node) {
        reportMetadata(node.argument);
      },
      'VariableDeclarator[id.name="generateMetadata"] > ArrowFunctionExpression[expression=true]'(node) {
        reportMetadata(node.body);
      },
    };
  },
};
