const EQUALITY = new Set(['===', '!==', '==', '!=']);
const ADDRESS = /address/iu;

const isLiteral = (node) => node.type === 'Literal' || (node.type === 'TemplateLiteral' && node.expressions.length === 0) || (node.type === 'Identifier' && node.name === 'undefined');

const mentionsAddress = (node) => {
  if (!node || typeof node.type !== 'string') return false;
  if (node.type === 'Identifier') return ADDRESS.test(node.name);
  if (node.type === 'MemberExpression') return mentionsAddress(node.object) || (!node.computed && mentionsAddress(node.property));
  if (node.type === 'CallExpression') return mentionsAddress(node.callee) || node.arguments.some(mentionsAddress);
  if (node.type === 'ChainExpression' || node.type === 'TSNonNullExpression' || node.type === 'TSAsExpression') return mentionsAddress(node.expression);
  return false;
};

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Two addresses are compared by `sameAddress` in packages/core/src/address, so every screen calls the same two addresses the same.' },
    messages: { sameAddress: 'Compare addresses with `sameAddress` from `@esta/core/address`. A second spelling of the rule drifts from the first (Q-10).' },
    schema: [],
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (!EQUALITY.has(node.operator) || isLiteral(node.left) || isLiteral(node.right)) return;
        const wrapped = node.left.type === 'CallExpression' && node.right.type === 'CallExpression' && (mentionsAddress(node.left) || mentionsAddress(node.right));
        if (wrapped || (mentionsAddress(node.left) && mentionsAddress(node.right))) context.report({ node, messageId: 'sameAddress' });
      },
    };
  },
};
