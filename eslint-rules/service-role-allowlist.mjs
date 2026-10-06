import { relative, resolve, sep } from 'node:path';

const MARKER = 'SERVICE_ROLE';
const PUBLIC_MARKER = /NEXT_PUBLIC_\w*SERVICE_ROLE/;
const ALLOWED_ROOTS = ['apps/agent/', 'scripts/', 'apps/web/src/server/cron/'];
const repoRoot = resolve(import.meta.dirname, '..');

const isConcat = (node) => node.type === 'BinaryExpression' && node.operator === '+';

function constInit(scope, name) {
  for (let s = scope; s; s = s.upper) {
    const variable = s.set.get(name);
    if (!variable) continue;
    const [def] = variable.defs;
    return variable.defs.length === 1 && def.type === 'Variable' && def.parent.kind === 'const' ? def.node.init : null;
  }
  return null;
}

/** Concatenates the parts of a string expression known without running it; unknown parts read as ''. */
function staticText(node, scope, seen = new Set()) {
  if (!node || seen.has(node)) return '';
  seen.add(node);
  if (node.type === 'Literal') return typeof node.value === 'string' ? node.value : '';
  if (isConcat(node)) return staticText(node.left, scope, seen) + staticText(node.right, scope, seen);
  if (node.type === 'TemplateLiteral') {
    return node.quasis
      .map((quasi, i) => (quasi.value.cooked ?? '') + staticText(node.expressions[i], scope, seen))
      .join('');
  }
  if (node.type === 'Identifier') return staticText(constInit(scope, node.name), scope, seen);
  return '';
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: `Allow the service role key only in ${ALLOWED_ROOTS.join(', ')} (SPEC §7.1)` },
    messages: {
      forbidden: `The service role key is allowed only under ${ALLOWED_ROOTS.join(', ')}. Use the user's session client here.`,
      public: 'A NEXT_PUBLIC_ variable ships to the browser and must never hold the service role key.',
    },
    schema: [],
  },
  create(context) {
    const file = relative(repoRoot, context.physicalFilename).split(sep).join('/');
    const allowlisted = ALLOWED_ROOTS.some((root) => file.startsWith(root));
    const check = (node, text) => {
      if (PUBLIC_MARKER.test(text)) context.report({ node, messageId: 'public' });
      else if (!allowlisted && text.includes(MARKER)) context.report({ node, messageId: 'forbidden' });
    };
    const checkOutermostString = (node) => {
      if (isConcat(node.parent) || node.parent.type === 'TemplateLiteral') return;
      check(node, staticText(node, context.sourceCode.getScope(node)));
    };
    return {
      Identifier(node) {
        const shorthandValue = node.parent.type === 'Property' && node.parent.shorthand && node.parent.value === node;
        if (!shorthandValue) check(node, node.name);
      },
      Literal: checkOutermostString,
      TemplateLiteral: checkOutermostString,
      'BinaryExpression[operator="+"]': checkOutermostString,
    };
  },
};
