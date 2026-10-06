import { relative, resolve, sep } from 'node:path';

const KEY = 'SUPABASE_SERVICE_ROLE_KEY';
const ALLOWED_ROOTS = ['apps/agent/', 'scripts/', 'apps/web/src/server/cron/'];
const repoRoot = resolve(import.meta.dirname, '..');

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: `Allow ${KEY} only in ${ALLOWED_ROOTS.join(', ')} (SPEC §7.1)` },
    messages: {
      forbidden: `${KEY} is allowed only under ${ALLOWED_ROOTS.join(', ')}. Use the user's session client here.`,
    },
    schema: [],
  },
  create(context) {
    const file = relative(repoRoot, context.physicalFilename).split(sep).join('/');
    if (ALLOWED_ROOTS.some((root) => file.startsWith(root))) return {};
    const report = (node) => context.report({ node, messageId: 'forbidden' });
    return {
      Identifier(node) {
        const shorthandValue = node.parent.type === 'Property' && node.parent.shorthand && node.parent.value === node;
        if (node.name === KEY && !shorthandValue) report(node);
      },
      Literal(node) {
        if (typeof node.value === 'string' && node.value.includes(KEY)) report(node);
      },
      TemplateElement(node) {
        if (node.value.cooked?.includes(KEY)) report(node);
      },
    };
  },
};
